/**
 * 本地假云端（Supabase 形态的 stub），供 `scripts/check-sync.mjs` 与后续 S10.5 复用。
 *
 * 实现测试计划 §5.8「stub 契约」要求的端点：
 *   GET  /auth/v1/health
 *   GET  /auth/v1/authorize   （校验 PKCE 参数，302 回 redirect_to?code=…&state=…）
 *   POST /auth/v1/token?grant_type=pkce|refresh_token
 *   POST /auth/v1/logout
 *   GET  /rest/v1/todos
 *   POST /rest/v1/todos?on_conflict=user_id,uuid
 *
 * 它**不是** Supabase 的完整实现，只覆盖本阶段可观察行为：
 * 鉴权、401、PKCE 校验、upsert、请求记账。真实云端连通一律 NOT-VERIFIED。
 *
 * 一个关键的行为对齐（S7.8）：`/auth/v1/authorize` 会**用自己的 flow state
 * （36 字符 UUID）替换客户端传入的 `state`**，回跳到 `redirect_to` 的也是它那一个。
 * 这是 GoTrue 的真实行为，客户端因此不得做「回调 state === 客户端 state」的等值校验。
 *
 * 用法：
 *   import { createMockSupabase } from './mock-supabase.mjs';
 *   const stub = await createMockSupabase();
 *   stub.url / stub.state.requests / stub.close()
 */

import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const s256 = (verifier) => b64url(createHash('sha256').update(verifier).digest());

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
  });

const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
};

export async function createMockSupabase(options = {}) {
  const state = {
    /** uuid → 云端行（只有一张 todos 表，D-19） */
    rows: new Map(),
    /** 请求记账：{ method, path, at, body } */
    requests: [],
    /** 授权请求记录：{ redirectTo, codeChallenge, state, provider } */
    authorizeRequests: [],
    validAccessTokens: new Set(),
    validRefreshTokens: new Set(),
    /** code → { challenge, redirectTo, used } */
    codes: new Map(),
    /** 下一次 REST 调用强制 401（模拟 token 过期） */
    forceUnauthorized: false,
    /** 刷新令牌也失效（模拟会话彻底过期） */
    rejectRefresh: false,
    /**
     * 下一个授权码绑定的 challenge 覆盖值：模拟「这个 code 属于别人的 PKCE 会话」。
     * 设置后本机拿自己的 verifier 换不出会话（invalid_code_verifier）。
     */
    challengeOverride: '',
    /** 云端还没建 public.todos 表（真实 PostgREST 的 404 + PGRST205） */
    missingTable: false,
    tokenCounter: 0,
    userId: options.userId ?? 'user-1',
    email: options.email ?? 'sync-test@example.com',
  };

  const issueSession = () => {
    state.tokenCounter += 1;
    const accessToken = `at_${state.tokenCounter}`;
    const refreshToken = `rt_${state.tokenCounter}`;
    state.validAccessTokens.add(accessToken);
    state.validRefreshTokens.add(refreshToken);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      token_type: 'bearer',
      user: { id: state.userId, email: state.email },
    };
  };

  const isAuthorized = (req) => {
    if (state.forceUnauthorized) return false;
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    return state.validAccessTokens.has(token);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const body = await readBody(req);
    state.requests.push({
      method: req.method,
      path: url.pathname,
      query: url.search,
      at: Date.now(),
      body: body ? safeParse(body) : null,
    });

    // ---------------------------------------------------------------- auth
    if (url.pathname === '/auth/v1/health') {
      json(res, 200, { name: 'mock-supabase', status: 'ok' });
      return;
    }

    if (url.pathname === '/auth/v1/authorize') {
      const params = url.searchParams;
      const challenge = params.get('code_challenge') ?? '';
      const redirectTo = params.get('redirect_to') ?? '';
      const oauthState = params.get('state') ?? '';
      state.authorizeRequests.push({
        provider: params.get('provider') ?? '',
        redirectTo,
        codeChallenge: challenge,
        codeChallengeMethod: params.get('code_challenge_method') ?? '',
        state: oauthState,
      });
      if (!challenge || params.get('code_challenge_method') !== 's256' || !redirectTo) {
        json(res, 400, { error: 'invalid_request' });
        return;
      }
      const code = `code_${randomUUID()}`;
      // GoTrue 用自己的 flow state 替换客户端传入的 state 后回跳（客户端那一个不参与校验）
      const flowState = randomUUID();
      state.codes.set(code, {
        challenge: state.challengeOverride || challenge,
        redirectTo,
        used: false,
      });
      res.writeHead(302, {
        Location: `${redirectTo}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(flowState)}`,
      });
      res.end();
      return;
    }

    if (url.pathname === '/auth/v1/token') {
      const grant = url.searchParams.get('grant_type');
      const payload = safeParse(body) ?? {};
      if (grant === 'pkce') {
        const entry = state.codes.get(payload.auth_code);
        if (!entry || entry.used) {
          json(res, 400, { error: 'invalid_grant' });
          return;
        }
        if (s256(payload.code_verifier ?? '') !== entry.challenge) {
          json(res, 400, { error: 'invalid_code_verifier' });
          return;
        }
        entry.used = true;
        json(res, 200, issueSession());
        return;
      }
      if (grant === 'refresh_token') {
        if (state.rejectRefresh || !state.validRefreshTokens.has(payload.refresh_token)) {
          json(res, 400, { error: 'invalid_refresh_token' });
          return;
        }
        state.validRefreshTokens.delete(payload.refresh_token);
        json(res, 200, issueSession());
        return;
      }
      json(res, 400, { error: 'unsupported_grant_type' });
      return;
    }

    if (url.pathname === '/auth/v1/logout') {
      if (!isAuthorized(req)) {
        json(res, 401, { error: 'unauthorized' });
        return;
      }
      res.writeHead(204);
      res.end();
      return;
    }

    // ------------------------------------------------------------- rest/v1
    if (url.pathname === '/rest/v1/todos') {
      if (state.missingTable) {
        // 真实 PostgREST：表不在 schema cache 时返回 404 + PGRST205
        json(res, 404, {
          code: 'PGRST205',
          details: null,
          hint: null,
          message: "Could not find the table 'public.todos' in the schema cache",
        });
        return;
      }
      if (!isAuthorized(req)) {
        json(res, 401, { error: 'unauthorized' });
        return;
      }
      if (req.method === 'GET') {
        json(res, 200, [...state.rows.values()]);
        return;
      }
      if (req.method === 'POST') {
        const rows = Array.isArray(safeParse(body)) ? safeParse(body) : [];
        for (const row of rows) {
          if (!row || typeof row.uuid !== 'string') continue;
          state.rows.set(row.uuid, { ...row, user_id: state.userId });
        }
        res.writeHead(201);
        res.end();
        return;
      }
      json(res, 405, { error: 'method_not_allowed' });
      return;
    }

    json(res, 404, { error: 'not_found' });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}`,
    state,
    /** 直接往云端塞一条记录（模拟「另一台设备写入了数据」） */
    seed(row) {
      state.rows.set(row.uuid, { user_id: state.userId, ...row });
    },
    /** 清空请求记账（每段断言前调用，便于精确计数） */
    resetLog() {
      state.requests.length = 0;
      state.authorizeRequests.length = 0;
    },
    pushCount() {
      return state.requests.filter(
        (r) => r.method === 'POST' && r.path === '/rest/v1/todos'
      ).length;
    },
    pullCount() {
      return state.requests.filter((r) => r.method === 'GET' && r.path === '/rest/v1/todos')
        .length;
    },
    /** 让下一次 REST 调用返回 401（access token 过期） */
    expireAccessTokens() {
      state.validAccessTokens.clear();
    },
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
