/**
 * 同步层类型（PRD §16 / FR-SYNC）。
 *
 * 与 `types/index.ts` 的分工：这里只描述「云端行」与「会话」，
 * 本地领域对象仍以 `Todo` 为准。`deleted` / `done` 在云端是 0/1，
 * 在接口层统一转成布尔（与数据层的 done 互转规则一致）。
 */

/** 云端 `todos` 表的一行（只同步这一张表，D-07 / D-19） */
export interface RemoteTodo {
  uuid: string;
  title: string;
  date: string;
  priority: number;
  note: string;
  done: boolean;
  created_at: string;
  updated_at: string;
  /** LWW 唯一依据（PRD BR-28） */
  updated_at_ms: number;
  /** 墓碑：true = 已删（FR-SYNC-08） */
  deleted: boolean;
}

/** 本地参与同步的行（含墓碑） */
export interface LocalTodoRow extends RemoteTodo {
  /** 本地自增 id，只在本机有意义（NEG-06） */
  id: number;
}

/** Supabase 会话（token 只存安全存储，不进日志、不进 localStorage） */
export interface SyncSession {
  accessToken: string;
  refreshToken: string;
  /** 访问令牌到期时刻（毫秒） */
  expiresAt: number;
  userId: string;
  email: string;
}

/** 同步状态区展示的五种状态（PRD FR-SYNC-02） */
export type SyncPhase =
  | 'disabled' // 未配置 key / sync.enabled = false
  | 'signed-out' // 已配置，未登录
  | 'signed-in' // 已登录，空闲
  | 'syncing' // 正在推送或拉取
  | 'error'; // 最近一次同步失败（本地功能不受影响）

export interface SyncStatus {
  phase: SyncPhase;
  /** 面向用户的一句话说明（全中文） */
  detail: string;
  email: string;
  lastSyncAt: number | null;
  /** 最近一次同步的结果；未同步过为 null */
  lastResult: 'ok' | 'failed' | null;
  lastError: string;
}

export const EMPTY_STATUS: SyncStatus = {
  phase: 'disabled',
  detail: '未配置同步',
  email: '',
  lastSyncAt: null,
  lastResult: null,
  lastError: '',
};

/** 合并结果统计（AC-61 / AC-63 的观察点） */
export interface MergeStats {
  inserted: number;
  updated: number;
  skipped: number;
}
