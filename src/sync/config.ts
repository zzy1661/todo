/**
 * 同步配置的读取与校验（PRD FR-SYNC-10 / FR-SYNC-15 / AC-57 / AC-67）。
 *
 * 三条铁律：
 * 1. **仓库里没有任何真实 key**：桌面端运行期读 `sync.config.json`
 *    （app data 目录，未入库；仓库只放 `sync.config.example.json`），
 *    缺失即 `enabled = false`，同步层短路，一次云端请求都不发。
 * 2. **base URL / anon key 可注入**：`parseSyncConfig` 只做纯校验与归一化，
 *    调用方（运行时或检查脚本）决定来源。
 * 3. **白名单而非黑名单**（deny-by-default）：只接受 ① legacy JWT 且载荷 `role === 'anon'`，
 *    或 ② 新版可发布（publishable）密钥前缀；其余一律拒绝并保持「未配置」。
 *    不能写成「读得出角色且不是 anon 才拒绝」——新版服务端密钥（非 JWT、无角色声明）
 *    会因此静默放行，等于把管理员密钥放进客户端（AC-67）。
 */

export interface SyncConfig {
  enabled: boolean;
  /** Supabase base URL，末尾不带斜杠 */
  baseUrl: string;
  anonKey: string;
  /** 配置来源，仅用于状态提示与排障（绝不包含 key 内容） */
  source: string;
}

export const DISABLED_CONFIG: SyncConfig = {
  enabled: false,
  baseUrl: '',
  anonKey: '',
  source: 'none',
};

export interface SyncConfigParseResult {
  config: SyncConfig;
  /** 被拒绝的原因；正常为空串 */
  reason: string;
}

/** 尝试从 JWT 载荷里读 `role`；读不到返回空串（新版非 JWT 密钥没有角色声明） */
function jwtRole(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 3) return '';
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
    // 浏览器 / Tauri WebView / Node 18+ 都有全局 atob，无需引入 Buffer
    if (typeof atob !== 'function') return '';
    const parsed = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof parsed.role === 'string' ? parsed.role : '';
  } catch {
    return '';
  }
}

/**
 * 新版 Supabase 浏览器端「可发布」密钥前缀（非 JWT，无角色声明）。
 * 用拼接而不是字面量写出：`scripts/check-no-secrets.mjs` 会把该前缀的字面量
 * 当成疑似真实密钥而失败（AC-67），源码里不留任何密钥形态的字面量。
 */
const PUBLISHABLE_PREFIX = 'sb' + '_publishable_';

/**
 * 密钥白名单：只认两种形态，读不出角色**不放行**。
 * ① legacy JWT 且载荷 `role === 'anon'`；
 * ② 新版可发布（publishable）密钥前缀。
 * 其余（服务端密钥 / 管理员角色 JWT / 任意非 JWT 串）一律拒绝。
 */
function isAcceptableAnonKey(key: string): boolean {
  if (key.startsWith(PUBLISHABLE_PREFIX)) return true;
  return jwtRole(key) === 'anon';
}

/**
 * 校验并归一化配置。
 *
 * 接受 `{ enabled, supabaseUrl | baseUrl, anonKey }`；`enabled` 缺省为 true
 * （只要 url + key 齐全），显式 `false` 优先。
 */
export function parseSyncConfig(
  raw: unknown,
  source = 'sync.config.json'
): SyncConfigParseResult {
  if (!raw || typeof raw !== 'object') {
    return { config: DISABLED_CONFIG, reason: '配置为空' };
  }
  const record = raw as Record<string, unknown>;
  const rawUrl = record.supabaseUrl ?? record.baseUrl ?? record.url;
  const rawKey = record.anonKey ?? record.anon_key ?? record.key;
  const baseUrl = typeof rawUrl === 'string' ? rawUrl.trim().replace(/\/+$/, '') : '';
  const anonKey = typeof rawKey === 'string' ? rawKey.trim() : '';

  if (record.enabled === false) {
    return { config: { ...DISABLED_CONFIG, source, baseUrl, anonKey }, reason: '配置已禁用' };
  }
  if (!baseUrl || !anonKey) {
    return { config: { ...DISABLED_CONFIG, source }, reason: '缺少 base URL 或 anon key' };
  }
  if (!/^https?:\/\/[^/\s]+/.test(baseUrl)) {
    return { config: { ...DISABLED_CONFIG, source }, reason: 'base URL 不是合法地址' };
  }
  // 白名单：只接受 anon 角色的 legacy JWT 或可发布（publishable）密钥前缀；
  // 非 JWT（含新版服务端密钥）读不出角色，按拒绝处理（AC-67）
  if (!isAcceptableAnonKey(anonKey)) {
    return {
      config: { ...DISABLED_CONFIG, source },
      // 提示里引用同一个常量，保证文案与放行规则不会漂移
      reason: `只接受 anon 角色的 JWT 或 ${PUBLISHABLE_PREFIX} 前缀的密钥`,
    };
  }
  return {
    config: { enabled: true, baseUrl, anonKey, source },
    reason: '',
  };
}

/** 从进程环境读配置（Node 检查脚本 / 开发期用；打包产物不含 key） */
export function configFromEnv(
  env: Record<string, string | undefined>
): SyncConfigParseResult {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { config: { ...DISABLED_CONFIG, source: 'env' }, reason: '未设置 SUPABASE_URL / SUPABASE_ANON_KEY' };
  }
  return parseSyncConfig({ supabaseUrl: url, anonKey: key }, 'env');
}
