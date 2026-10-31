/**
 * 同步配置的读取与校验（PRD FR-SYNC-10 / FR-SYNC-15 / AC-57 / AC-67）。
 *
 * 三条铁律：
 * 1. **仓库里没有任何真实 key**：桌面端运行期读 `sync.config.json`
 *    （app data 目录，未入库；仓库只放 `sync.config.example.json`），
 *    缺失即 `enabled = false`，同步层短路，一次云端请求都不发。
 * 2. **base URL / anon key 可注入**：`parseSyncConfig` 只做纯校验与归一化，
 *    调用方（运行时或检查脚本）决定来源。
 * 3. **只接受 anon 角色**（deny-by-default）：密钥若带 JWT 载荷，角色必须是 `anon`；
 *    管理员类密钥一律拒绝并保持「未配置」——它落到客户端等于公开数据库写权限（AC-67）。
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
  // 只接受 anon 角色：任何其它角色（管理员 / authenticated 等）在客户端都不该出现
  const role = jwtRole(anonKey);
  if (role && role !== 'anon') {
    return { config: { ...DISABLED_CONFIG, source }, reason: '只接受 anon 角色的密钥' };
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
