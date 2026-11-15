/**
 * 定时同步调度器（PRD FR-SYNC-17：每 2 天向 Supabase 同步一次）。
 *
 * 职责边界（**只管什么时候跑，不管跑什么**）：
 * - 排期：按「锚点 + 周期」算出下一轮的时刻，用注入的定时器挂上；
 * - 补做：锚点太旧（应用关了好几天）时 `due()` 为真，引擎据此立即补一轮；
 * - 退避：一轮失败不立刻重试，按退避阶梯重试；阶梯耗尽后回到正常周期；
 * - 记账：成功后把锚点推到当下并重新排期。
 *
 * 真正的拉取 / 推送由引擎通过 `run` 注入，本模块**不碰网络**。
 *
 * 三条不可协商的纪律：
 * 1. **时间源与定时器都是注入的**（FR-SYNC-15）：检查脚本把假时钟推进 2 天，
 *    就能在本地 stub 上真跑一轮定时同步，而不是只读代码推断。
 * 2. **未登录 / 未配置时根本不排期**（FR-SYNC-10）：引擎不会调用 `schedule`，
 *    因此不会有任何 `rest/v1` / `auth/v1` 请求，连定时器都不会挂。
 * 3. **锚点必须跨重启保留**：锚点由引擎持久化（`stateStore`），
 *    否则「每天开一次应用」会让每轮都被重置成「从现在起 2 天」，
 *    定时同步永远不会发生。
 */

import type { Clock } from './clock.ts';
import type { Timers, TimerHandle } from './timers.ts';

/** 一天的毫秒数 */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** 默认周期：2 天（FR-SYNC-17） */
export const DEFAULT_AUTO_SYNC_DAYS = 2;
export const DEFAULT_AUTO_SYNC_INTERVAL_MS = DEFAULT_AUTO_SYNC_DAYS * DAY_MS;

/**
 * 周期上限：24 天。
 *
 * 理由：`setTimeout` 的延时上限是 2^31-1 毫秒（约 24.85 天），超出会被截断成 ~1ms
 * 从而**立刻空转触发**。配置里的天数一律夹到 24 天以内。
 */
export const MAX_AUTO_SYNC_DAYS = 24;
export const MAX_AUTO_SYNC_INTERVAL_MS = MAX_AUTO_SYNC_DAYS * DAY_MS;

/** 失败后的退避阶梯（毫秒），与推送失败时的退避口径一致 */
const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];

export interface AutoSyncOptions {
  /** 注入的定时器（FR-SYNC-15） */
  timers: Timers;
  /** 注入的时间源（FR-SYNC-15） */
  clock: Clock;
  /** 周期长度（毫秒）；<= 0 表示不启用定时同步 */
  intervalMs: number;
  /** 执行一轮同步；返回 false 表示本轮失败 */
  run: (reason: string) => Promise<boolean>;
  /** 一轮成功后回调（引擎据此落盘锚点并刷新状态区） */
  onSynced?: (at: number) => void;
  /** 失败重试的退避阶梯（毫秒） */
  retryDelays?: number[];
}

export class AutoSync {
  private readonly timers: Timers;
  private readonly clock: Clock;
  private readonly intervalMs: number;
  private readonly run: (reason: string) => Promise<boolean>;
  private readonly onSynced: ((at: number) => void) | undefined;
  private readonly retryDelays: number[];

  private handle: TimerHandle | null = null;
  /** 锚点：上一轮定时同步成功的时刻（毫秒）；null = 还没跑过 */
  private anchorAt: number | null = null;
  /** 下一轮的到期时刻（毫秒）；null = 未排期 */
  private dueAt: number | null = null;
  private retryIndex = 0;

  constructor(options: AutoSyncOptions) {
    this.timers = options.timers;
    this.clock = options.clock;
    this.intervalMs = options.intervalMs;
    this.run = options.run;
    this.onSynced = options.onSynced;
    this.retryDelays = options.retryDelays ?? DEFAULT_RETRY_DELAYS;
  }

  /** 是否启用定时同步 */
  get enabled(): boolean {
    return this.intervalMs > 0;
  }

  /** 周期长度（毫秒） */
  get periodMs(): number {
    return this.intervalMs;
  }

  /** 锚点：上一轮定时同步成功的时刻；null = 还没跑过 */
  get anchor(): number | null {
    return this.anchorAt;
  }

  /** 下一轮到期时刻；null = 未排期（未登录 / 未配置 / 已关闭） */
  get nextDueAt(): number | null {
    return this.dueAt;
  }

  /** 从持久化状态恢复锚点（重启后不重置节拍） */
  restore(anchor: number | null): void {
    this.anchorAt = anchor;
  }

  /**
   * 直接设定锚点（引擎在「首次建立周期起点」时用）。
   * 与 `restore` 的区别：这里代表「周期从这里开始」，会被随后的 `schedule()` 采信。
   */
  setAnchor(at: number | null): void {
    this.anchorAt = at;
  }

  /**
   * 是否已到下一轮的到期时刻。
   *
   * 「还没跑过」（锚点为 null）**不算到期**：首次启动时的拉取已经满足了一次同步，
   * 第一轮定时同步从此刻起算一个周期（否则每次启动都会立刻补做一轮）。
   */
  due(): boolean {
    if (!this.enabled) return false;
    if (this.anchorAt === null) return false;
    return this.clock.now() >= this.anchorAt + this.intervalMs;
  }

  /** 按锚点排期；锚点为空则以「此刻」为起点（一个完整周期后） */
  schedule(): void {
    this.clearTimer();
    if (!this.enabled) {
      this.dueAt = null;
      return;
    }
    const base = this.anchorAt ?? this.clock.now();
    this.armAt(base + this.intervalMs);
  }

  /** 立即跑一轮（到期补做用）；失败按退避重试 */
  async runNow(reason: string): Promise<boolean> {
    return this.execute(reason);
  }

  /** 停掉排期（登出 / 销毁时调用，避免留下会发请求的定时器） */
  cancel(): void {
    this.clearTimer();
    this.dueAt = null;
  }

  /* ------------------------------------------------------------- 内部 */

  private async execute(reason: string): Promise<boolean> {
    let ok = false;
    try {
      ok = await this.run(reason);
    } catch {
      // 同步失败绝不得冒泡到定时器回调（FR-SYNC-11：不阻塞 UI）
      ok = false;
    }
    if (ok) {
      this.retryIndex = 0;
      this.anchorAt = this.clock.now();
      this.schedule();
      this.onSynced?.(this.anchorAt);
      return true;
    }
    this.scheduleRetry();
    return false;
  }

  private scheduleRetry(): void {
    const now = this.clock.now();
    const delay =
      this.retryIndex < this.retryDelays.length
        ? this.retryDelays[this.retryIndex]
        : this.intervalMs;
    this.retryIndex += 1;
    this.armAt(now + delay);
  }

  private armAt(dueAt: number): void {
    this.clearTimer();
    this.dueAt = dueAt;
    const delay = Math.max(0, dueAt - this.clock.now());
    this.handle = this.timers.setTimeout(() => {
      this.handle = null;
      void this.execute('定时同步');
    }, delay);
  }

  private clearTimer(): void {
    if (this.handle !== null) {
      this.timers.clearTimeout(this.handle);
      this.handle = null;
    }
  }
}

/**
 * 归一化配置里的「天数」：缺省 2 天；<= 0 表示关闭；上限 24 天。
 *
 * 非法值（非数字、NaN）一律回到默认 2 天，而不是静默变成 0：
 * 写错一个字段不该悄悄关掉用户明确要求的功能。
 */
export function normalizeAutoSyncDays(days: unknown): number {
  if (days === undefined || days === null) return DEFAULT_AUTO_SYNC_DAYS;
  const value = typeof days === 'number' ? days : Number(days);
  if (!Number.isFinite(value)) return DEFAULT_AUTO_SYNC_DAYS;
  if (value <= 0) return 0;
  return Math.min(Math.round(value), MAX_AUTO_SYNC_DAYS);
}

/**
 * 从配置里的「天数」算出周期毫秒；天数非法或缺省时回到默认的 2 天。
 *
 * 天数夹在 [0, 24]：0 表示关闭定时同步（只保留变更驱动的手动同步），
 * 上限 24 天是 `setTimeout` 的硬约束（见 MAX_AUTO_SYNC_DAYS）。
 */
export function autoSyncIntervalMs(days: number | undefined): number {
  if (days === undefined) return DEFAULT_AUTO_SYNC_INTERVAL_MS;
  if (!Number.isFinite(days)) return DEFAULT_AUTO_SYNC_INTERVAL_MS;
  if (days <= 0) return 0;
  const clamped = Math.min(days, MAX_AUTO_SYNC_DAYS);
  return Math.round(clamped * DAY_MS);
}
