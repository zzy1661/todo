/**
 * 可注入的时间源（PRD FR-SYNC-15 / 测试计划 §5.8 stub 契约 ④）。
 *
 * 为什么单独抽一层：防抖窗口的推进与 `updated_at_ms` 的写入**必须用同一个 now()**，
 * 否则 stub 里把时间推到第 5 秒时，写进库里的时间戳与本机真实时间混在一起，
 * LWW 断言就失去了意义。同步层的所有「现在」都从这里取，不得直接 `Date.now()`。
 *
 * 生产环境用系统时钟；`scripts/check-sync.mjs` 换成手动推进的假时钟。
 */

export interface Clock {
  /** 毫秒时间戳 */
  now(): number;
}

const systemClock: Clock = { now: () => Date.now() };

let active: Clock = systemClock;

/** 当前时间（毫秒）。全项目唯一的「现在」入口（同步范围内）。 */
export const nowMs = (): number => active.now();

/** 替换时间源；传 null 恢复系统时钟。 */
export function setClock(clock: Clock | null): void {
  active = clock ?? systemClock;
}

/** 当前生效的时间源（供需要显式传递的接口使用）。 */
export const currentClock = (): Clock => active;

/**
 * 与 SQLite `datetime('now','localtime')` 同格式的本地时间字符串。
 * 由注入的时钟推导，保证 `updated_at` 与 `updated_at_ms` 描述同一时刻。
 */
export function localTimestamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}
