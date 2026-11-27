/**
 * 同步运行状态的持久化（PRD FR-SYNC-17 的跨重启节拍）。
 *
 * 为什么需要它：定时同步的锚点是「上一轮定时同步成功的时刻」。
 * 若这个时刻只存在内存里，那么「每天打开一次应用」会把节拍重置成
 * 「从现在起 2 天」——定时同步永远不会发生，用户提的需求等于没实现。
 * 因此锚点必须落盘。
 *
 * 落在哪儿（BR-07 约束下）：
 * - **不进 SQLite**：`todos` / `daily_picks` 两表固定，不新增第三张表（BR-07），
 *   迁移只增不改（BR-08），加一张表会同时踩两条红线；
 * - **独立状态文件**：与 `sync.config.json` 同在应用数据目录，
 *   由 Rust 侧 `sync_state_read` / `sync_state_write` 命令读写。
 *
 * 文件里**只有时间戳**，没有任何凭据：它不需要像会话那样进钥匙串。
 */

import type { Clock } from './clock.ts';

/** 落盘的同步运行状态 */
export interface SyncState {
  /**
   * 周期锚点：上一次定时同步成功、或首次建立周期时的时刻（毫秒）。
   *
   * 为什么不是单纯的「上次成功时刻」：首次启动时还没跑过任何定时同步，
   * 若锚点保持为空，每次重启都会把周期重置成「从现在起 2 天」——
   * 用户天天开应用的话定时同步永远不会触发。首次启动即把锚点定在当下，
   * 周期才能跨重启延续。
   */
  autoSyncAnchorAt: number | null;
}

export interface SyncStateStore {
  /** 实现名称，仅用于排障与报告 */
  readonly kind: 'file' | 'memory';
  load(): Promise<SyncState | null>;
  save(state: SyncState): Promise<void>;
  clear(): Promise<void>;
}

/** 字段校验：坏数据当作「没有状态」，绝不抛错打断启动 */
export function parseSyncState(raw: string | null | undefined): SyncState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SyncState>;
    const anchor = parsed.autoSyncAnchorAt;
    if (typeof anchor !== 'number' || !Number.isFinite(anchor)) {
      return null;
    }
    return { autoSyncAnchorAt: anchor };
  } catch {
    return null;
  }
}

export const serializeSyncState = (state: SyncState): string => JSON.stringify(state);

/** 内存实现：浏览器 / 检查脚本用；不写 localStorage（明文字段，不进敏感数据） */
export function createMemoryStateStore(initial: SyncState | null = null): SyncStateStore {
  let state = initial;
  return {
    kind: 'memory',
    async load() {
      return state;
    },
    async save(next) {
      state = next;
    },
    async clear() {
      state = null;
    },
  };
}

/**
 * 判断周期是否到期（需要补做一轮）。
 *
 * 补做语义（FR-SYNC-17）：
 * - 锚点为空 → **不算到期**。锚点为空意味着「本周期刚建立」，
 *   首启时的启动拉取已经算一次同步，立刻再补一轮只会重复请求。
 * - 锚点存在且 `now >= 锚点 + 周期` → 应用关着的时间超过了一个周期，到期补做。
 */
export function isAutoSyncDue(
  state: SyncState | null,
  clock: Clock,
  intervalMs: number
): boolean {
  if (intervalMs <= 0) return false;
  if (!state || state.autoSyncAnchorAt === null) return false;
  return clock.now() >= state.autoSyncAnchorAt + intervalMs;
}
