/**
 * 会话持久化的抽象（PRD 任务书 §1「token 持久化用 Tauri 安全存储或本地加密文件」）。
 *
 * - 桌面端实现见 `tauri.ts`：macOS 钥匙串（Keychain）条目，**不落明文文件**；
 * - 浏览器 / 检查脚本用内存实现：**不写 localStorage**，
 *   因为 localStorage 是明文字段，token 进去就违反硬约束。
 *
 * 引擎只依赖本接口，因此 stub 里可以完全掌握「重启后会话还在不在」。
 */

import type { SyncSession } from './types.ts';

export interface SessionStore {
  /** 实现名称，仅用于排障与报告 */
  readonly kind: 'keychain' | 'memory';
  load(): Promise<SyncSession | null>;
  save(session: SyncSession): Promise<void>;
  clear(): Promise<void>;
}

/** 字段校验：坏数据当作未登录，不抛错打断启动 */
export function parseSession(raw: string | null | undefined): SyncSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SyncSession>;
    if (
      typeof parsed.accessToken !== 'string' ||
      !parsed.accessToken ||
      typeof parsed.refreshToken !== 'string' ||
      typeof parsed.userId !== 'string'
    ) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0,
      userId: parsed.userId,
      email: typeof parsed.email === 'string' ? parsed.email : '',
    };
  } catch {
    return null;
  }
}

export const serializeSession = (session: SyncSession): string => JSON.stringify(session);

export function createMemorySessionStore(initial: SyncSession | null = null): SessionStore {
  let session = initial;
  return {
    kind: 'memory',
    async load() {
      return session;
    },
    async save(next) {
      session = next;
    },
    async clear() {
      session = null;
    },
  };
}
