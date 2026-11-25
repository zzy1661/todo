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
  /** 定时同步是否启用（FR-SYNC-17） */
  autoSyncEnabled: boolean;
  /** 定时同步周期（毫秒）；0 = 已关闭 */
  autoSyncIntervalMs: number;
  /** 下一轮定时同步的时刻（毫秒）；null = 未排期 */
  nextAutoSyncAt: number | null;
  /**
   * 云端为空时，本机有多少条待办**还没上云**（0 = 无 / 不适用）。
   *
   * 为什么要有它：自动同步只推「**变更驱动**的增量」，**登录之前就存在的历史待办
   * 不在增量里**。所以「云端 0 行」通常不是故障，而是「本地数据还没上传」——
   * 用户看到「一条都没拉到」却不知道该做什么。
   * 有这个数字，界面就能直接提示「点『上传本机全部』」，而不是让用户自己猜。
   *
   * （2026-11-23 实机反馈：Windows 上「同步一条都没拉到」，实测为云端从来没有
   * 该用户的行——本机 8 条待办的修改时间全部早于登录锚点，从未进入推送队列。）
   */
  localNotUploaded?: number;
  /**
   * 本次拉取里，有多少条云端记录在本机是「已删除」状态（墓碑）而没被写入。
   *
   * 界面据此提示用户：**这些条目不会出现在列表里是正常的**——
   * 删除会传播到所有设备（墓碑终结，PRD BR-28 / OPEN-01）。
   */
  localTombstone?: number;
  /**
   * 最近一次拉取到的**云端活跃待办**（`deleted = 0`）条数。
   *
   * **为什么要有它**：用户看到的界面是「某一天的待办」，不是「全部待办」。
   * 云端数据可能**全部落在别的日期**上，这时界面上的当天面板一片空白，
   * 而同步状态只说「已是最新 N 条」——用户会以为「远端的数据没同步过来」。
   *
   * （2026-11-25 实机反馈「Windows 上界面没显示出远端的数据」：
   * 实测云端 8 行、本机也已入库 8 行、合并结果是「已是最新」——
   * **数据早就到了**。但那 8 条的日期是 2026-10-15 ~ 11-16，
   * 而应用默认只看**今天**（2026-11-26），所以当天面板当然是空的。
   * 同步链路没问题，缺的是「告诉用户数据落在哪一天」。）
   */
  remoteLiveCount?: number;
  /** 云端活跃待办的日期范围（`YYYY-MM-DD`）；没有带日期的云端行时为空串 */
  remoteDateMin?: string;
  remoteDateMax?: string;
  /**
   * **可找回**的条目数：本机是墓碑、但云端同 uuid 的版本还活着。
   *
   * 界面据此给出「找回」入口——没有它，这类条目会被墓碑终结**永久挡住**，
   * 用户看到的只是「已是最新 N 条」与空空的列表（2026-11-25 实机反馈）。
   */
  recoverableCount?: number;
}

export const EMPTY_STATUS: SyncStatus = {
  phase: 'disabled',
  detail: '未配置同步',
  email: '',
  lastSyncAt: null,
  lastResult: null,
  lastError: '',
  autoSyncEnabled: false,
  autoSyncIntervalMs: 0,
  nextAutoSyncAt: null,
  localNotUploaded: 0,
};

/** 合并结果统计（AC-61 / AC-63 的观察点） */
export interface MergeStats {
  inserted: number;
  updated: number;
  skipped: number;
  /**
   * `skipped` 的**原因细分**（三者之和 = skipped）。
   *
   * 为什么必须拆开：合并有三种「保持本地不变」，
   * 对用户的含义完全不同 ——
   * - `skippedEqual`：两边完全一样 → **数据早就在本地了**；
   * - `skippedLocalNewer`：本地更新 → 保留本地，正常；
   * - `skippedTombstone`：**本地这条是墓碑（已删除）** → 云端拉不回来，
   *   界面若不说清楚，用户只会看到「已是最新 N 条」而界面空空如也，
   *   完全想不通数据去哪了。
   *
   * （2026-11-23 实机反馈：Windows 上「远端 8 行、已是最新 8 条」，
   * 但界面一条不显示 —— 光看「已是最新」无法判断是哪种情况。）
   */
  skippedEqual?: number;
  skippedLocalNewer?: number;
  skippedTombstone?: number;
  /** 跳过的细分：云端行缺必填字段（**坏数据**，不是合并结果） */
  skippedInvalid?: number;
  /**
   * **可找回**的条目：这些 uuid 在本机是墓碑（已删除），但**云端同 uuid 的版本还活着**。
   *
   * **为什么要有**：墓碑终结（PRD BR-28 / OPEN-01）规定「已删条目不因任何非删除记录复活」，
   * 所以这类条目**永远拉不回来**——而界面（`deleted = 0`）上一条都不显示，
   * 连「全部待办」也看不到（它同样只读 `deleted = 0`）。
   *
   * （2026-11-25 实机反馈「Windows 同步后，全部待办里也看不到数据」：
   * 实测就是这个局面——本机 8 行全是墓碑，云端同 uuid 的 8 行还活着，
   * 合并结果全是 `tombstone-terminal`（保持本地不变），
   * 于是「远端 8 行、已是最新 8 条」与「列表全空」同时成立。）
   *
   * 把这批 uuid 报出来，界面才能给一个**出口**：本机删掉这些删除记录后重新拉取，
   * 云端的存活版本就能回来。
   * **这是用户显式的本地动作**：不改自动合并规则，也不往云端推「复活」，
   * 因此不违反墓碑终结的同步语义（删除在别的设备上依然成立）。
   */
  recoverableUuids?: string[];
}
