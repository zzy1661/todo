/**
 * Supabase REST / Auth 客户端（PRD FR-SYNC-03 ~ FR-SYNC-07 / FR-SYNC-15）。
 *
 * 为什么不引 `@supabase/supabase-js`：本阶段需要的只是四条固定端点
 * （`/auth/v1/authorize`、`/auth/v1/token`、`/auth/v1/logout`、`/rest/v1/todos`），
 * 而「base URL / anon key 可注入」是硬性验收条件（FR-SYNC-15）。
 * 直接用注入的 `fetch` 打这四条端点，注入点天然存在、payload 完全可控，
 * 也避免把 SDK 的会话持久化（默认写 localStorage）偷偷带进来 —— 那会违反
 * 「token 不得进 localStorage 明文字段」。**本阶段零新增运行时依赖。**
 */

import type { RemoteTodo } from './types.ts';

export class SyncHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SyncHttpError';
    this.status = status;
  }
}

/**
 * PostgREST 的「表不在 schema cache 里」：`404` + `PGRST205`。
 *
 * 这不是网络故障而是**部署缺失** —— 项目的 `supabase/schema.sql` 还没在
 * Supabase SQL Editor 里执行过（或表名/项目接错了）。重试没有任何意义，
 * 必须提示用户去建表，而不是让它掉进 1s/2s/4s/8s/16s 的退避里空转。
 */
export function isMissingRemoteTable(error: unknown): boolean {
  return (
    error instanceof SyncHttpError &&
    error.status === 404 &&
    error.message.includes('PGRST205')
  );
}

/** Supabase `token` 端点的原始返回（字段为 snake_case） */
export interface RawSessionPayload {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string; email?: string };
}

export interface SyncApiLike {
  pull(accessToken: string): Promise<RemoteTodo[]>;
  push(accessToken: string, userId: string, rows: RemoteTodo[]): Promise<void>;
  exchangeCode(code: string, verifier: string): Promise<RawSessionPayload>;
  refresh(refreshToken: string): Promise<RawSessionPayload>;
  logout(accessToken: string): Promise<void>;
}

export interface SyncApiOptions {
  baseUrl: string;
  anonKey: string;
  /** 注入点：检查脚本可换成记账用的 fetch（FR-SYNC-15） */
  fetchImpl?: typeof fetch;
}

/** 云端行 → 领域行（0/1 → 布尔，缺列兜底，绝不抛错打断整次拉取） */
export function normalizeRemote(raw: Record<string, unknown>): RemoteTodo | null {
  const uuid = typeof raw.uuid === 'string' ? raw.uuid : '';
  if (!uuid) return null;
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || fallback;
  return {
    uuid,
    title: typeof raw.title === 'string' ? raw.title : '',
    date: typeof raw.date === 'string' ? raw.date : '',
    priority: num(raw.priority, 1),
    note: typeof raw.note === 'string' ? raw.note : '',
    done: raw.done === true || raw.done === 1 || raw.done === '1',
    created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : '',
    updated_at_ms: num(raw.updated_at_ms, 0),
    deleted: raw.deleted === true || raw.deleted === 1 || raw.deleted === '1',
  };
}

/** 推送 payload 只含同步字段 + 归属用户，不含本地自增 id（NEG-06） */
function toRemotePayload(userId: string, row: RemoteTodo): Record<string, unknown> {
  return {
    user_id: userId,
    uuid: row.uuid,
    title: row.title,
    date: row.date,
    priority: row.priority,
    note: row.note,
    done: row.done ? 1 : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    updated_at_ms: row.updated_at_ms,
    deleted: row.deleted ? 1 : 0,
  };
}

const PULL_COLUMNS = [
  'uuid',
  'title',
  'date',
  'priority',
  'note',
  'done',
  'created_at',
  'updated_at',
  'updated_at_ms',
  'deleted',
].join(',');

export class SupabaseRestApi implements SyncApiLike {
  private readonly baseUrl: string;
  private readonly anonKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SyncApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.anonKey = options.anonKey;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private async request(
    path: string,
    init: RequestInit & { accessToken?: string } = {}
  ): Promise<Response> {
    const { accessToken, ...rest } = init;
    const headers: Record<string, string> = {
      apikey: this.anonKey,
      ...(rest.headers as Record<string, string> | undefined),
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...rest, headers });
    if (!response.ok) {
      let body = '';
      try {
        body = await response.text();
      } catch {
        body = '';
      }
      throw new SyncHttpError(response.status, `HTTP ${response.status} ${body}`.trim());
    }
    return response;
  }

  /** 拉取云端全部记录（RLS 保证只返回本用户的行） */
  async pull(accessToken: string): Promise<RemoteTodo[]> {
    const response = await this.request(
      `/rest/v1/todos?select=${PULL_COLUMNS}`,
      { method: 'GET', accessToken }
    );
    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) return [];
    const rows: RemoteTodo[] = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const normalized = normalizeRemote(item as Record<string, unknown>);
      if (normalized) rows.push(normalized);
    }
    return rows;
  }

  /** 推送本窗口内改动的条目；冲突键为 `user_id,uuid`，服务端 upsert */
  async push(accessToken: string, userId: string, rows: RemoteTodo[]): Promise<void> {
    if (rows.length === 0) return;
    await this.request('/rest/v1/todos?on_conflict=user_id,uuid', {
      method: 'POST',
      accessToken,
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows.map((row) => toRemotePayload(userId, row))),
    });
  }

  /** PKCE 授权码交换（code_verifier 只在这里出现，不进日志） */
  async exchangeCode(code: string, verifier: string): Promise<RawSessionPayload> {
    const response = await this.request('/auth/v1/token?grant_type=pkce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    });
    return (await response.json()) as RawSessionPayload;
  }

  async refresh(refreshToken: string): Promise<RawSessionPayload> {
    const response = await this.request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return (await response.json()) as RawSessionPayload;
  }

  async logout(accessToken: string): Promise<void> {
    await this.request('/auth/v1/logout', { method: 'POST', accessToken });
  }
}
