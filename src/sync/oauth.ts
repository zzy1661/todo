/**
 * GitHub OAuth：loopback 回调 + PKCE（PRD FR-SYNC-03 / AC-59）。
 *
 * 三条硬约束：
 * 1. 授权请求必须带 `code_challenge` / `code_challenge_method=s256`；
 *    换 token 必须带 `code_verifier`。**不得**使用隐式流程（把 access token 放在 URL
 *    fragment 里的老做法）：授权码只从 query 取，token 只经服务端换回。
 * 2. 回调地址是 `http://127.0.0.1:<随机端口>`（回环监听由 Rust 侧 `sync_oauth_listen` 完成）。
 * 3. 回调的**可信性由 PKCE verifier 绑定**，不靠 `state` 等值比较。
 *    GoTrue 在 `/auth/v1/authorize` 阶段会把自己的 flow state（36 字符 UUID）
 *    替换掉客户端传入的 `state`，回跳时回来的也是它那一个；因此「回调 state ===
 *    客户端 state」必然不成立。我们仍照发 `state`（保留可观测性），但换 token 必须
 *    带本次会话独有的 `code_verifier` —— 攻击者拿到的 code 绑的是他自己的 verifier，
 *    换不出会话（这正是 supabase-js 的做法）。
 *
 * 本文件只做纯计算与 URL 拼装，便于静态检索（TC-063）与单测。
 */

export const LOOPBACK_HOST = '127.0.0.1';

/** 回调地址：随机端口在 49152–65535 区间内由 OS 分配 */
export function loopbackRedirectUri(port: number): string {
  return `http://${LOOPBACK_HOST}:${port}`;
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += BASE64URL[b0 >> 2];
    out += BASE64URL[((b0 & 0x03) << 4) | (b1 >> 4)];
    if (i + 1 < bytes.length) out += BASE64URL[((b1 & 0x0f) << 2) | (b2 >> 6)];
    if (i + 2 < bytes.length) out += BASE64URL[b2 & 0x3f];
  }
  return out;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('当前环境不支持 crypto.getRandomValues，无法生成 PKCE 随机串');
  }
  crypto.getRandomValues(bytes);
  return bytes;
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/**
 * 生成 PKCE 对：43–128 字符的 verifier（RFC 7636 允许的字符集）+ S256 challenge。
 */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = base64UrlEncode(randomBytes(32)); // 43 字符
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('当前环境不支持 WebCrypto，无法计算 PKCE challenge');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) };
}

/** 随机 state（32 字节 → 43 字符 base64url）。仅用于可观测性，不作为防伪依据 */
export const STATE_LENGTH = 43;

export function createState(): string {
  return base64UrlEncode(randomBytes(32));
}

/**
 * 排障用的回调诊断串：**只报告长度，不报告任何 state 值**。
 *
 * 用于登录失败时面板 `detail` 里区分「回调根本没带 state」与
 * 「state 被 GoTrue 换成了它自己的 36 字符 UUID」——后者是正常现象，
 * 前者说明回调链路不对。不得把 state 原文写进页面或日志。
 */
export function describeCallbackState(callbackState: string): string {
  return `回调 state 长度 ${callbackState.length} / 期望 ${STATE_LENGTH}`;
}

export interface AuthorizeUrlOptions {
  baseUrl: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  provider?: string;
}

/**
 * 构造 Supabase 授权地址。
 *
 * 注意：这里**不生成**隐式流程所需的参数，
 * 只有平台默认的授权码流程（AC-59 的负向断言）。
 */
export function buildAuthorizeUrl(options: AuthorizeUrlOptions): string {
  const base = options.baseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({
    provider: options.provider ?? 'github',
    redirect_to: options.redirectUri,
    code_challenge: options.codeChallenge,
    code_challenge_method: 's256',
    state: options.state,
  });
  return `${base}/auth/v1/authorize?${params.toString()}`;
}

export interface CallbackResult {
  code: string;
  state: string;
  error: string;
  errorDescription: string;
}

/** 解析回环回调的 query（`code=…&state=…`，或 `error=…`） */
export function parseCallbackQuery(query: string): CallbackResult {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  return {
    code: params.get('code') ?? '',
    state: params.get('state') ?? '',
    error: params.get('error') ?? '',
    errorDescription: params.get('error_description') ?? '',
  };
}
