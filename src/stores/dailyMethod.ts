import { reactive } from 'vue';
import dayjs from 'dayjs';
import { METHODS, METHOD_MAP } from '../data/methods.ts';
import {
  fetchDailyPick,
  fetchDailyPicks,
  upsertDailyPick,
} from '../db/database.ts';
import type { DailyPick, WorkMethod } from '../types/index.ts';

/**
 * 每日工作法：确定性推送状态层。
 *
 * 确定性算法（FNV-1a + mulberry32 + Fisher-Yates）必须与 PRD 附录 A **逐字等价**，
 * 保证同一日期在任意机器、任意重启后得到同一条（BR-05 / AC-24）。
 *
 * 本模块只调用数据层导出的函数，不直接触碰底层存储与环境判定（BR-13）。
 */

/** 稳定哈希（FNV-1a） */
export function hashCode(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** 可复现伪随机（mulberry32） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 内容库 id 列表，保持内容库数组原始顺序（顺序不同则排列不同） */
export const METHOD_IDS: string[] = METHODS.map((m) => m.id);

/**
 * 某日期的确定性全排列（Fisher-Yates）。
 *
 * @param date `YYYY-MM-DD`
 * @param ids  输入 id 序列，默认取内容库原始顺序
 */
export function permutationFor(date: string, ids: string[] = METHOD_IDS): string[] {
  const out = [...ids];
  const rand = mulberry32(hashCode(date));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 方法库条数 */
export const librarySize = METHODS.length;

/**
 * 安全查找方法条目。
 *
 * METHOD_MAP 是普通对象，继承自 Object.prototype，
 * 因此 `METHOD_MAP['toString']` 之类的键是真值 —— 用普通的真值判断，
 * 一个不存在的 method_id（如 'toString'）会被误判为存在，
 * 让 EX-06 的回退逻辑失效、并把原型上的函数当成方法返回。
 * 这里只认自有属性。
 */
function findMethod(id: string): WorkMethod | null {
  if (!Object.prototype.hasOwnProperty.call(METHOD_MAP, id)) return null;
  const found = METHOD_MAP[id];
  return found && typeof found === 'object' ? found : null;
}

const state = reactive({
  /** 全部推送记录 */
  picks: [] as DailyPick[],
  /** 当前查看日期的推送记录 */
  current: null as DailyPick | null,
  /** 当前查看日期 */
  currentDate: '',
  /** 方法库预览态：正在预览的方法 id（null 表示看推送内容） */
  previewId: null as string | null,
  /** 初始化 promise，避免多个组件同时挂载重复读库（FR-DM-15） */
  initPromise: null as Promise<void> | null,
  /** 最近一次错误，供界面提示 */
  error: '',
});

/** 初始化：只读一次全部推送记录 */
export function init(): Promise<void> {
  if (state.initPromise) return state.initPromise;
  state.initPromise = (async () => {
    try {
      state.picks = await fetchDailyPicks();
      state.error = '';
    } catch (e) {
      state.error = String(e);
      // 清掉缓存的失败 promise，让后续调用可以重试（否则一次瞬时失败会永久卡死）
      state.initPromise = null;
      throw e;
    }
  })();
  return state.initPromise;
}

/** 该日推送记录是否为「换一条」产生 */
export function isManual(date: string): boolean {
  const pick = state.picks.find((p) => p.date === date);
  return pick ? pick.manual : false;
}

/** 把一条推送记录同步进内存状态（一日一行，重复写入为覆盖） */
function syncPick(pick: DailyPick): void {
  const rest = state.picks.filter((p) => p.date !== pick.date);
  state.picks = [...rest, pick].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );
  if (state.currentDate === pick.date) state.current = pick;
}

/**
 * 同一日期的并发保护：多个组件同时挂载 / 同时切日时，
 * 共用同一次读库 + 落库，避免重复写入（FR-DM-15）。
 */
const inflight = new Map<string, Promise<DailyPick>>();

/**
 * 取某天的确定性首推（必要时落库）。
 *
 * 若已落库记录中的 method_id 不在内容库里（EX-06），回退为确定性首推并覆盖写回。
 */
export function ensurePick(date: string): Promise<DailyPick> {
  const running = inflight.get(date);
  if (running) return running;
  const task = ensurePickOnce(date).finally(() => inflight.delete(date));
  inflight.set(date, task);
  return task;
}

async function ensurePickOnce(date: string): Promise<DailyPick> {
  await init();
  const order = permutationFor(date);
  // 以库里记录为准（EX-06 要求能发现并覆盖写回失效的 method_id），
  // 并发重复调用已由上面的 inflight 合并，不会重复读库 / 重复落库。
  const stored = await fetchDailyPick(date);

  if (!stored) {
    // 首次查看该日：落库当日首推（manual = false）
    const fresh: DailyPick = {
      date,
      method_id: order[0],
      manual: false,
      updated_at: Date.now(),
    };
    await upsertDailyPick(fresh);
    syncPick(fresh);
    return fresh;
  }

  if (!findMethod(stored.method_id)) {
    // 推送记录指向已不存在的条目：回退为当日确定性首推并覆盖写回。
    // 回退后是「当日首推」而非「换一条」，manual 必须复位为 false，
    // 否则会违反 PRD 附录 A 第 4 条（manual=1 时下标 = 首推下标 + 1）。
    const fixed: DailyPick = {
      ...stored,
      method_id: order[0],
      manual: false,
      updated_at: Date.now(),
    };
    await upsertDailyPick(fixed);
    syncPick(fixed);
    return fixed;
  }

  syncPick(stored);
  return stored;
}

/**
 * 「换一条」：沿当日确定性排列取下一条，落库并标记 manual = true（BR-06）。
 *
 * @returns 新的推送记录
 */
export async function refresh(date: string): Promise<DailyPick> {
  const current = await ensurePick(date);
  const order = permutationFor(date);
  const index = order.indexOf(current.method_id);
  const nextId = order[(index + 1) % order.length];
  const next: DailyPick = {
    date,
    method_id: nextId,
    manual: true,
    updated_at: Date.now(),
  };
  await upsertDailyPick(next);
  syncPick(next);
  return next;
}

/**
 * 该日推送的方法（不含预览态）。
 *
 * 预览是「每日工作法模块」自己的界面态，不能污染其它模块：
 * 日历页的小卡片也调用本函数，若这里优先返回预览条目，
 * 在模块里点一次方法库就会把小卡片一起换掉。
 */
export function methodOf(date: string): WorkMethod | null {
  const pick = state.picks.find((p) => p.date === date);
  if (!pick) return null;
  return findMethod(pick.method_id);
}

/**
 * 只读预览某天的方法：有落库记录取记录，否则返回确定性首推。
 *
 * 用于往期回顾等「仅展示、不查看」的场景——不得因此写入 `daily_picks`
 * （写入只发生在真正查看该日时，FR-DM-01）。
 */
export function peekMethod(date: string): WorkMethod | null {
  const picked = methodOf(date);
  if (picked) return picked;
  return findMethod(permutationFor(date)[0]);
}

/** 主卡片当前要展示的方法（预览态优先，FR-DM-06） */
export function displayedMethod(date: string): WorkMethod | null {
  if (state.previewId) return findMethod(state.previewId);
  return methodOf(date);
}

/** 设置 / 清除方法库预览态 */
export function setPreview(methodId: string | null): void {
  state.previewId = methodId;
}

/** 设置当前查看日期 */
export function setCurrentDate(date: string): void {
  state.currentDate = date;
  state.current = state.picks.find((p) => p.date === date) ?? null;
}

/** 含当天在内的最近 N 天（由早到晚） */
export function recentDates(count: number, endDate: string): string[] {
  const end = dayjs(endDate);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    out.push(end.subtract(i, 'day').format('YYYY-MM-DD'));
  }
  return out;
}

/** 状态读出口 */
export const dailyMethodState = state;
