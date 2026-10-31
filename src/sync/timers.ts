/**
 * 可注入的定时器（PRD FR-SYNC-15）。
 *
 * 5 秒防抖窗口必须能在本地 stub 上被「推进」，否则 TC-065 / TC-066 只能读代码。
 * 生产环境用全局定时器；检查脚本换成手动推进的队列（`advance(ms)`）。
 */

export type TimerHandle = number;

export interface Timers {
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export const systemTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as TimerHandle,
  clearTimeout: (handle) => globalThis.clearTimeout(handle as unknown as number),
};

let active: Timers = systemTimers;

export const currentTimers = (): Timers => active;

export function setTimers(timers: Timers | null): void {
  active = timers ?? systemTimers;
}
