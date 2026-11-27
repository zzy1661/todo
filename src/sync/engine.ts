/**
 * 同步引擎（PRD FR-SYNC-02 ~ FR-SYNC-11 / BR-26 ~ BR-28）。
 *
 * 这是整层的「可观察行为」实现，全部依赖注入（配置 / API / 会话存储 / 本地库 /
 * OAuth 启动器 / 时钟 / 定时器），因此能在 `scripts/check-sync.mjs` 的本地 stub 上
 * 真跑防抖、拉取合并、LWW、软删除与 401 重登五组路径（FR-SYNC-15）。
 *
 * 硬性纪律：
 * - `sync.enabled = false` 或未登录时**不发任何请求**（FR-SYNC-10）；
 * - 任何失败都不阻塞 UI，只更新状态区（FR-SYNC-11）；
 * - 推送只来自本地改动集合，拉取结果永不回写云端（NEG-04）。
 */

import type { Clock } from './clock.ts';
import type { Timers, TimerHandle } from './timers.ts';
import { decideMerge } from './merge.ts';
import { AutoSync, autoSyncIntervalMs } from './autoSync.ts';
import {
  buildAuthorizeUrl,
  createPkcePair,
  createState,
  describeCallbackState,
  loopbackRedirectUri,
  parseCallbackQuery,
} from './oauth.ts';
import type { SyncApiLike, RawSessionPayload } from './api.ts';
import { SyncHttpError, isMissingRemoteTable } from './api.ts';
import type { SessionStore } from './sessionStore.ts';
import type { SyncState, SyncStateStore } from './stateStore.ts';
import { createMemoryStateStore, isAutoSyncDue } from './stateStore.ts';
import type { SyncConfig } from './config.ts';
import type {
  LocalTodoRow,
  MergeStats,
  RemoteTodo,
  SyncSession,
  SyncStatus,
} from './types.ts';

/** 本地库网关：所有落库细节留在数据层，引擎不碰存储 */
export interface LocalTodoGateway {
  /** 按 uuid 读取（含墓碑） */
  loadByUuids(uuids: string[]): Promise<LocalTodoRow[]>;
  /** 读取本机全部待办（含墓碑）——「上传本机全部」用 */
  loadAll(): Promise<LocalTodoRow[]>;
  /** 应用远端记录（LWW + 墓碑终结） */
  applyRemote(rows: RemoteTodo[]): Promise<MergeStats>;
  /**
   * **复活**本机指定的墓碑行（撤销本机的删除记录），返回实际复活条数。
   *
   * 只影响本机、且**不推送**——复活不是「删除」，不能广播到别的设备，
   * 否则会破坏那些设备上的删除语义（墓碑终结的前提是删除确实发生过）。
   */
  reviveTombstones(uuids: string[]): Promise<number>;
}

/** OAuth 回环启动器：桌面端走 Rust 的 TcpListener，stub 走本地 HTTP */
export interface OAuthLauncher {
  /** 绑定 `127.0.0.1:随机端口`，返回端口 */
  listen(): Promise<number>;
  /** 用系统浏览器打开授权页 */
  open(url: string): Promise<void>;
  /** 等待回环回调，返回 query 串（`code=…&state=…`） */
  wait(timeoutMs: number): Promise<string>;
}

export interface SyncEngineOptions {
  config: SyncConfig;
  api: SyncApiLike;
  sessionStore: SessionStore;
  local: LocalTodoGateway;
  oauth: OAuthLauncher;
  clock: Clock;
  timers: Timers;
  onStatus(status: SyncStatus): void;
  /** 合并完成后通知界面刷新（拉取/登录后列表要立刻反映） */
  onMerged?: (stats: MergeStats) => void;
  /** 防抖窗口，默认 5000（AC-60） */
  debounceMs?: number;
  /** 推送失败退避序列（毫秒），默认 1s/2s/4s/8s/16s */
  retryDelays?: number[];
  /** 回环等待超时，默认 180s */
  oauthTimeoutMs?: number;
  /**
   * 定时同步的锚点存储（FR-SYNC-17）。缺省用内存实现 —— 进程内有效，
   * 跨重启延续需要传入落盘实现（桌面端为独立状态文件，见 stateStore.ts）。
   */
  stateStore?: SyncStateStore;
}

const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];

/** token 提前刷新余量：到期前 60 秒就换，避免请求卡在边界上 */
const REFRESH_MARGIN_MS = 60_000;

function toSession(raw: RawSessionPayload, now: number, previous?: SyncSession): SyncSession {
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? previous?.refreshToken ?? '',
    expiresAt: now + (typeof raw.expires_in === 'number' ? raw.expires_in : 3600) * 1000,
    userId: raw.user?.id ?? previous?.userId ?? '',
    email: raw.user?.email ?? previous?.email ?? '',
  };
}

const isUnauthorized = (error: unknown): boolean =>
  error instanceof SyncHttpError && error.status === 401;

/**
 * 云端表缺失时给用户看的可执行提示（不含任何敏感值）。
 * `supabase/schema.sql` 是仓库里唯一来源，避免把 SQL 抄进 UI。
 */
const MISSING_TABLE_DETAIL =
  '云端缺少 todos 表（PGRST205）：请在 Supabase SQL Editor 执行仓库里的 supabase/schema.sql，然后点「立即重试」';

/**
 * 把一次拉取的结果说清楚。
 *
 * **为什么要报「远端行数」**：合并有三种结果 —— 新增 / 覆盖本地 / **保持本地不变**
 * （后者记在 `stats.skipped` 里）。只报「新增 X 条、更新 Y 条」的话，
 * 「云端返回 0 行」与「云端返回 5 行但本地已是最新」会显示成**一模一样**的
 * 「新增 0 条、更新 0 条」——用户分不出「云端没有我的数据」和「早就同步过了」。
 *
 * （2026-11-23 实机反馈「Windows 同步一条都没拉到」：实测云端从来没有该用户的行，
 * 而界面只说了「新增 0 条、更新 0 条」，无从判断。）
 */
export function describePull(
  reason: string,
  remoteCount: number,
  stats: MergeStats
): string {
  const head = `已拉取（${reason}）`;
  if (remoteCount === 0) {
    return `${head} · 云端暂无你的数据（远端 0 行）`;
  }
  const parts = [`远端 ${remoteCount} 行`, `新增 ${stats.inserted} 条`, `更新 ${stats.updated} 条`];
  // 跳过的**原因**必须说出来：「两边一样」「本地更新」「本地已删除」对用户是三件事。
  // 只报「已是最新 N 条」的话，本机是墓碑的情况会被误读成「数据早就在本地了」，
  // 而界面恰恰一条都不显示 —— 用户完全想不通。
  const skipParts: string[] = [];
  if (stats.skippedEqual) skipParts.push(`已是最新 ${stats.skippedEqual} 条`);
  if (stats.skippedLocalNewer) skipParts.push(`本地更新 ${stats.skippedLocalNewer} 条`);
  if (stats.skippedTombstone) skipParts.push(`本地已删除 ${stats.skippedTombstone} 条`);
  if (stats.skippedInvalid) skipParts.push(`云端数据不完整 ${stats.skippedInvalid} 条`);
  if (stats.skipped > 0) {
    // **兜底**：细分计数缺失时也必须报出「跳过 N 条」——
    // 宁可信息粗一点，也不能把「有东西被跳过」这件事整个吞掉。
    parts.push(
      skipParts.length > 0
        ? `跳过 ${stats.skipped} 条（${skipParts.join('、')}）`
        : `跳过 ${stats.skipped} 条`
    );
  }
  return `${head} · ${parts.join('、')}`;
}

/**
 * 汇总一次拉取里**云端活跃待办**的条数与日期范围。
 *
 * **为什么要这个**：界面显示的是「某一天」的待办，不是「全部待办」。
 * 云端数据完全可能**全部落在别的日期**上，于是「同步成功」与「界面空空」
 * 同时成立 —— 用户看到「已是最新 8 条」却什么都没看到，完全想不通。
 * 把「云端有多少条、日期落在哪个区间」带出去，界面才能说清数据在哪。
 *
 * 只统计 `deleted = 0` 的行：墓碑不会出现在任何列表里（FR-SYNC-13），
 * 把它们算进去会让「云端有 N 条」与「界面上能看到 N 条」对不上。
 */
export function summarizeRemoteRows(rows: RemoteTodo[]): {
  liveCount: number;
  dateMin: string;
  dateMax: string;
} {
  const dates: string[] = [];
  let liveCount = 0;
  for (const row of rows) {
    if (row.deleted) continue;
    liveCount += 1;
    if (typeof row.date === 'string' && row.date.length > 0) dates.push(row.date);
  }
  dates.sort();
  return {
    liveCount,
    dateMin: dates[0] ?? '',
    dateMax: dates[dates.length - 1] ?? '',
  };
}

/**
 * 云端数据的日期范围是否**不在**当前查看的这一天。
 *
 * **为什么要单独抽出来**：这是「界面空着」的第二个原因（第一个是「数据没同步过来」），
 * 界面必须能区分并说出来。而它是个**纯判断**，抽出来才能被自检覆盖——
 * 藏在 `.vue` 里的话，只有实机能验证。
 *
 * @param dateMin 云端活跃待办的日期范围起点（空串 = 云端没有带日期的待办）
 * @param dateMax 云端活跃待办的日期范围终点
 * @param viewDate 界面当前查看的日期（`YYYY-MM-DD`）
 */
export function isRemoteOutsideView(
  dateMin: string,
  dateMax: string,
  viewDate: string
): boolean {
  // 没有日期范围可说（云端空 / 全是坏数据）→ 不下判断
  if (!dateMin || !dateMax) return false;
  // 区间之外（含端点之外）才叫「不在这一天」；落在区间内说明这天就有待办
  return viewDate < dateMin || viewDate > dateMax;
}

export class SyncEngine {
  private readonly options: SyncEngineOptions;
  private readonly debounceMs: number;
  private readonly retryDelays: number[];
  private readonly oauthTimeoutMs: number;
  private readonly stateStore: SyncStateStore;
  private readonly autoSync: AutoSync;

  private session: SyncSession | null = null;
  private status: SyncStatus;

  /** 待推送的 uuid → 代数（同一 uuid 在推送途中再次被改，代数变了就不清） */
  private readonly pending = new Map<string, number>();
  private debounceTimer: TimerHandle | null = null;
  private retryTimer: TimerHandle | null = null;
  private retryIndex = 0;
  private busy = false;
  private loginInFlight = false;
  private disposed = false;
  /**
   * 最近一次拉取发现的「可找回」条目（本机是墓碑、云端还活着）的 uuid。
   *
   * 只留在引擎内部：界面只需要条数（`status.recoverableCount`），
   * uuid 属于内部细节，不进面向界面的状态对象。
   */
  private recoverableUuids: string[] = [];

  constructor(options: SyncEngineOptions) {
    this.options = options;
    this.debounceMs = options.debounceMs ?? 5000;
    this.retryDelays = options.retryDelays ?? DEFAULT_RETRY_DELAYS;
    this.oauthTimeoutMs = options.oauthTimeoutMs ?? 180_000;
    this.stateStore = options.stateStore ?? createMemoryStateStore();
    // 未配置同步时整个同步层是短路的（FR-SYNC-10），定时同步自然也不成立：
    // 此时状态区不该出现「每 2 天自动同步」的字样，免得让人以为配好 key 就会自动同步。
    const intervalMs = options.config.enabled
      ? autoSyncIntervalMs(options.config.autoSyncDays)
      : 0;
    this.autoSync = new AutoSync({
      timers: options.timers,
      clock: options.clock,
      intervalMs,
      // 定时同步 = 拉一次云端 + 推一次本地待推集合（与手动重试同一条路径）
      run: (reason) => this.runAutoSyncRound(reason),
      onSynced: (at) => {
        void this.saveAnchor(at);
        // 锚点推进后下一轮的时刻变了，状态区要跟着刷新
        this.publishAutoSyncState();
      },
    });
    this.status = {
      phase: options.config.enabled ? 'signed-out' : 'disabled',
      detail: options.config.enabled ? '未登录' : '未配置同步',
      email: '',
      lastSyncAt: null,
      lastResult: null,
      lastError: '',
      autoSyncEnabled: intervalMs > 0,
      autoSyncIntervalMs: intervalMs,
      nextAutoSyncAt: null,
    };
  }

  /* ----------------------------------------------------------- 状态 */

  private setStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    if (!this.disposed) this.options.onStatus({ ...this.status });
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /** 待推送条目数（检查脚本与排障用） */
  pendingCount(): number {
    return this.pending.size;
  }

  isEnabled(): boolean {
    return this.options.config.enabled;
  }

  /** 定时同步是否启用（FR-SYNC-17） */
  isAutoSyncEnabled(): boolean {
    return this.autoSync.enabled;
  }

  /** 定时同步周期（毫秒）；0 = 已关闭 */
  autoSyncInterval(): number {
    return this.autoSync.periodMs;
  }

  /** 下一轮定时同步的时刻（毫秒）；null = 未排期 */
  nextAutoSyncAt(): number | null {
    return this.autoSync.nextDueAt;
  }

  /* ----------------------------------------------------------- 生命周期 */

  /** 启动：已登录则拉取一次；未登录/未配置则什么都不做（零请求） */
  async start(): Promise<void> {
    if (!this.options.config.enabled) {
      this.setStatus({ phase: 'disabled', detail: '未配置同步（缺少 Supabase 配置）' });
      return;
    }
    const stored = await this.options.sessionStore.load();
    if (!stored) {
      this.setStatus({ phase: 'signed-out', detail: '未登录', email: '' });
      // 未登录不排期：定时器一旦挂上就可能发请求，违反 FR-SYNC-10 的零请求红线
      return;
    }
    this.session = stored;
    this.setStatus({ phase: 'signed-in', detail: '已登录', email: stored.email });
    await this.enterSession('启动');
  }

  dispose(): void {
    this.disposed = true;
    if (this.debounceTimer !== null) this.options.timers.clearTimeout(this.debounceTimer);
    if (this.retryTimer !== null) this.options.timers.clearTimeout(this.retryTimer);
    this.debounceTimer = null;
    this.retryTimer = null;
    this.autoSync.cancel();
  }

  /* ----------------------------------------------------------- 变更 → 防抖 */

  /**
   * 本地任意变更（新建 / 编辑 / 勾选 / 搬日期 / 软删除）后调用。
   * 同一个 5 秒窗口内的多次变更合并为一次推送。
   */
  markLocalChange(uuid: string): void {
    if (this.disposed) return;
    // **即使同步未配置，也要把这次变更记进 pending。**
    // 原来这里第一行就 `if (!config.enabled) return;` —— 用户「先在本地用着、
    // 后来才配 key 登录」的场景下，变更**从未入队**，于是永远推不上去。
    // 改后：未配置只是**不发请求**，变更本身先记下来。
    this.pending.set(uuid, (this.pending.get(uuid) ?? 0) + 1);
    if (!this.options.config.enabled) return; // 未配置：不发请求
    if (!this.session) return; // 未登录：不发请求，等登录后补推（见 enterSession）
    this.scheduleFlush(this.debounceMs);
  }

  private scheduleFlush(delayMs: number): void {
    if (this.debounceTimer !== null) this.options.timers.clearTimeout(this.debounceTimer);
    this.debounceTimer = this.options.timers.setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, delayMs);
  }

  /* ----------------------------------------------------------- 推送 */

  /** 立刻推送当前待推集合（定时器到点 / 手动重试 / 登录后补推） */
  async flush(): Promise<void> {
    if (!this.options.config.enabled || this.disposed) return;
    if (!this.session) return;
    if (this.pending.size === 0) return;
    if (this.busy) return; // 拉取/推送互斥；本窗口的改动留在 pending 里等下一次

    this.busy = true;
    const snapshot = new Map(this.pending);
    // notice 清空：新一轮同步开始，上一条动作提示就不该继续挂着
    this.setStatus({ phase: 'syncing', detail: '同步中…', notice: '' });
    try {
      const token = await this.ensureFreshToken();
      const rows = await this.options.local.loadByUuids([...snapshot.keys()]);
      await this.options.api.push(token, this.session?.userId ?? '', rows);
      // 只清「推送期间没有被再次改动」的条目，避免吞掉新改动
      for (const [uuid, generation] of snapshot) {
        if (this.pending.get(uuid) === generation) this.pending.delete(uuid);
      }
      this.retryIndex = 0;
      this.markSuccess('推送成功');
    } catch (error) {
      this.busy = false;
      await this.handlePushFailure(error, snapshot);
      return;
    }
    this.busy = false;
  }

  private async handlePushFailure(error: unknown, snapshot: Map<string, number>): Promise<void> {
    if (isUnauthorized(error) && (await this.recoverSession())) {
      // 401 → 刷新成功：入队重试，不计入退避
      this.restorePending(snapshot);
      this.scheduleFlush(0);
      return;
    }
    if (isUnauthorized(error)) return; // 刷新失败 → 已置为未登录，不再重试
    if (isMissingRemoteTable(error)) {
      // 部署缺失：退避重试改变不了结果，只提示建表；待推条目留在 pending 里
      this.setStatus({
        phase: 'error',
        detail: MISSING_TABLE_DETAIL,
        lastResult: 'failed',
        lastError: 'PGRST205 云端表 public.todos 不存在',
      });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (this.retryIndex < this.retryDelays.length) {
      const delay = this.retryDelays[this.retryIndex];
      this.retryIndex += 1;
      this.setStatus({
        phase: 'error',
        detail: `推送失败，${Math.round(delay / 1000)} 秒后重试`,
        lastResult: 'failed',
        lastError: message,
      });
      this.retryTimer = this.options.timers.setTimeout(() => {
        this.retryTimer = null;
        void this.flush();
      }, delay);
      return;
    }
    this.setStatus({
      phase: 'error',
      detail: '同步失败，可手动重试',
      lastResult: 'failed',
      lastError: message,
    });
  }

  /** 推送失败后把快照里的条目放回 pending（期间的新改动代数更高，不能被覆盖） */
  private restorePending(snapshot: Map<string, number>): void {
    for (const [uuid, generation] of snapshot) {
      const current = this.pending.get(uuid) ?? 0;
      this.pending.set(uuid, Math.max(current, generation + 1));
    }
  }

  /* ----------------------------------------------------------- 拉取 */

  /** 拉取一次并按 LWW 合并（启动 / 登录成功 / 手动重试） */
  async pull(reason: string): Promise<MergeStats | null> {
    if (!this.options.config.enabled) return null;
    if (!this.session) return null;
    if (this.busy) return null;

    this.busy = true;
    // notice 清空：新一轮同步开始，上一条动作提示就不该继续挂着
    this.setStatus({ phase: 'syncing', detail: '同步中…', notice: '' });
    try {
      const token = await this.ensureFreshToken();
      const rows = await this.options.api.pull(token);
      const stats = await this.options.local.applyRemote(rows);
      this.options.onMerged?.(stats);

      // 把**远端返回了几行**说出来。
      //
      // 为什么必须区分「远端行数」：合并有三种结果 —— 新增 / 覆盖本地 /
      // **保持本地不变**（记在 `stats.skipped` 里）。只报「新增 X 条、更新 Y 条」的话，
      // 「云端返回 0 行」与「云端返回 5 行但本地已是最新」会显示成**一模一样**的
      // 「新增 0 条、更新 0 条」——用户根本分不出「云端没有我的数据」和「早就同步过了」。
      // （2026-11-23 实机反馈「Windows 同步一条都没拉到」，实为云端从来没有该用户的行。）
      const remoteCount = rows.length;
      let localNotUploaded = 0;
      if (remoteCount === 0) {
        // 云端空：数一下本机有多少条**还没上云**。
        // 自动同步只推「变更驱动」的增量，**登录之前就存在的历史待办不在增量里**，
        // 所以「云端 0 行」多半不是故障，而是「本地数据还没上传」——
        // 界面据此直接给出「点『上传本机全部』」的指引。
        //
        // **这条是诊断增强，绝不能让它拖垮同步本身**：网关实现缺失或查询失败时，
        // 静默跳过提示（计数保持 0），拉取照常成功。
        try {
          const local = await this.options.local.loadAll();
          localNotUploaded = local.filter((row) => !row.deleted).length;
        } catch {
          localNotUploaded = 0;
        }
      }
      // 云端数据落在哪些日期：界面用它说明「数据到了，只是今天看不到」
      const remote = summarizeRemoteRows(rows);
      // 本机被删、但云端还活着的条目：**只留在引擎内部**，
      // 界面只需要知道「有多少条可以找回」（uuid 属于内部细节，不必进状态对象）。
      this.recoverableUuids = [...(stats.recoverableUuids ?? [])];
      this.markSuccess(describePull(reason, remoteCount, stats), {
        localNotUploaded,
        localTombstone: stats.skippedTombstone ?? 0,
        remoteLiveCount: remote.liveCount,
        remoteDateMin: remote.dateMin,
        remoteDateMax: remote.dateMax,
        recoverableCount: this.recoverableUuids.length,
      });
      this.busy = false;
      return stats;
    } catch (error) {
      this.busy = false;
      if (isUnauthorized(error) && (await this.recoverSession())) {
        return this.pull(reason);
      }
      if (isUnauthorized(error)) return null;
      if (isMissingRemoteTable(error)) {
        this.setStatus({
          phase: 'error',
          detail: MISSING_TABLE_DETAIL,
          lastResult: 'failed',
          lastError: 'PGRST205 云端表 public.todos 不存在',
        });
        return null;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus({
        phase: 'error',
        detail: '拉取失败，本地数据不受影响，可手动重试',
        lastResult: 'failed',
        lastError: message,
      });
      return null;
    }
  }

  /* ----------------------------------------------------------- 登录 / 登出 */

  /** GitHub 登录：loopback + PKCE，成功后立刻拉取一次（AC-61 ②） */
  async login(): Promise<void> {
    if (!this.options.config.enabled) {
      this.setStatus({ phase: 'disabled', detail: '未配置同步（缺少 Supabase 配置）' });
      return;
    }
    if (this.loginInFlight) return;
    this.loginInFlight = true;
    /** 收到的回调 query 里的 state（只在失败时用于排障，且只取长度） */
    let callbackState: string | null = null;
    try {
      const pkce = await createPkcePair();
      const state = createState();
      const port = await this.options.oauth.listen();
      const redirectUri = loopbackRedirectUri(port);
      const url = buildAuthorizeUrl({
        baseUrl: this.options.config.baseUrl,
        redirectUri,
        codeChallenge: pkce.challenge,
        state,
      });
      this.setStatus({ phase: 'signed-out', detail: '等待浏览器授权…' });
      await this.options.oauth.open(url);
      const query = await this.options.oauth.wait(this.oauthTimeoutMs);
      const callback = parseCallbackQuery(query);
      callbackState = callback.state;
      // GoTrue 会把 state 换成它自己的 flow state 回跳，等值校验必然失败 —— 不再校验。
      // 防伪由 PKCE 承担：verifier 只在本机进程内，攻击者的 code 换不出会话。
      if (callback.error) throw new Error(`${callback.error} ${callback.errorDescription}`.trim());
      if (!callback.code) throw new Error('回调缺少授权码，请回应用重试');
      const raw = await this.options.api.exchangeCode(callback.code, pkce.verifier);
      this.session = toSession(raw, this.options.clock.now());
      if (!this.session.userId) throw new Error('登录返回缺少用户标识');
      await this.options.sessionStore.save(this.session);
      this.setStatus({
        phase: 'signed-in',
        detail: '已登录',
        email: this.session.email,
        lastError: '',
      });
      // 登录成功后立即拉取一次（FR-SYNC-06），并建立定时同步排期
      await this.enterSession('登录');
      if (this.pending.size > 0) this.scheduleFlush(this.debounceMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 失败才附排障信息；只含长度，不含 state / code / verifier 任何值
      const diagnostic = callbackState === null ? '' : `；${describeCallbackState(callbackState)}`;
      this.setStatus({
        phase: this.session ? 'signed-in' : 'signed-out',
        detail: `登录失败：${message}${diagnostic}`,
        lastError: message,
      });
    } finally {
      this.loginInFlight = false;
    }
  }

  async logout(): Promise<void> {
    const token = this.session?.accessToken;
    this.session = null;
    this.pending.clear();
    this.recoverableUuids = [];
    if (this.debounceTimer !== null) this.options.timers.clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    // 登出后必须停掉定时器：留着的定时器到点会发请求，违反 FR-SYNC-10
    this.autoSync.cancel();
    try {
      await this.options.sessionStore.clear();
    } finally {
      this.setStatus({
        phase: this.options.config.enabled ? 'signed-out' : 'disabled',
        detail: '未登录',
        email: '',
        nextAutoSyncAt: null,
        // 登出后「本地还有多少条没上云」不再有意义（而且那时的上传按钮是禁用的，
        // 留着提示只会让人点不动）。
        localNotUploaded: 0,
        localTombstone: 0,
        // 云端数据的条数与日期范围同样失效：会话没了，再说「云端有 N 条」是误导
        remoteLiveCount: 0,
        remoteDateMin: '',
        remoteDateMax: '',
        // 「可找回」的条目同理失效（找回要连着云端拉取）
        recoverableCount: 0,
      });
    }
    if (token && this.options.config.enabled) {
      // 尽力而为：登出失败不影响本地已清会话
      try {
        await this.options.api.logout(token);
      } catch {
        /* 忽略：本地会话已清，云端 token 到期自然失效 */
      }
    }
  }

  /* ----------------------------------------------------------- 定时同步 */

  /**
   * 建立会话后的统一入口：拉一次云端 + 建立定时同步排期。
   *
   * 启动（FR-SYNC-05）与登录（FR-SYNC-06）都走这里，两者的差别只在传入的原因文案。
   *
   * **为什么把拉取与排期合并成一步**：锚点过期时补做的那一轮本身就是
   * 「拉 + 推」，若先无条件拉一次、再补做一轮，同一次启动会打两遍云端。
   * 这里改成：先判断是否到期 —— 到期就只跑补做那一轮（它含拉取），
   * 没到期才走常规的启动 / 登录拉取。两种情况下启动都恰好拉一次。
   */
  /**
   * 进入已登录会话：拉取远端 → 补推积压的本地变更。
   *
   * **补推这一步是必须的**：`markLocalChange` 在未登录/未配置时只把变更记进
   * `pending` 而不发请求（注释里承诺「等登录后一并处理」）。如果这里不补推，
   * 这些变更就永远留在 pending 里没人发——用户看到的现象是
   * 「登录成功了，但本地数据一条没上云」。
   */
  async enterSession(reason: string): Promise<void> {
    const overdue = await this.prepareAutoSync();
    if (overdue) {
      // 补做一轮：拉 + 推，成功后锚点推进
      await this.autoSync.runNow(`${reason}（补做）`);
      this.publishAutoSyncState();
      return;
    }
    await this.pull(reason);
    // **登录后补推积压的本地变更** —— 兑现 `markLocalChange` 与 `flush` 注释里
    // 「等登录后一并处理 / 登录后补推」的承诺（原来只 pull，pending 里的变更
    // 一直没人推，用户看到的现象就是「登录成功了，但本地数据一条没上云」）。
    if (this.pending.size > 0) await this.flush();
    this.publishAutoSyncState();
  }

  /**
   * 载入锚点并排期；返回「是否已到期、需要在本次启动补做一轮」。
   *
   * 三种情形：
   * 1. 锚点为空（首次建立周期）→ 把锚点定在当下并落盘，排期到「当下 + 周期」；
   * 2. 锚点已过期（应用关了很久）→ 返回 true，由调用方补做一轮；
   * 3. 锚点未过期 → 按锚点排期，节拍跨重启延续。
   */
  private async prepareAutoSync(): Promise<boolean> {
    if (!this.autoSync.enabled || !this.session) {
      this.publishAutoSyncState();
      return false;
    }

    const state = await this.loadState();
    const anchor = state?.autoSyncAnchorAt ?? null;

    if (anchor === null) {
      // 首次建立周期：锚点定在当下并落盘，否则重启会把周期一直往后推
      const now = this.options.clock.now();
      this.autoSync.setAnchor(now);
      await this.saveAnchor(now);
      this.autoSync.schedule();
      this.publishAutoSyncState();
      return false;
    }

    this.autoSync.restore(anchor);
    if (isAutoSyncDue(state, this.options.clock, this.autoSync.periodMs)) {
      return true;
    }
    this.autoSync.schedule();
    this.publishAutoSyncState();
    return false;
  }

  /**
   * 一轮定时同步：拉一次云端 + 推一次本地待推集合。
   *
   * 与手动重试（`retry`）同一条路径，区别只在于触发时机：
   * 手动是用户点按钮，这里是定时器到点。
   */
  private async runAutoSyncRound(reason: string): Promise<boolean> {
    if (!this.options.config.enabled || !this.session) return false;
    const stats = await this.pull(reason);
    if (!stats) return false;
    // 推送在 pull 之后：拉取结果不进推送队列（NEG-04），这里推的是本地改动
    await this.flush();
    return true;
  }

  /** 读取落盘状态；读失败当作没有状态（不打断启动） */
  private async loadState(): Promise<SyncState | null> {
    try {
      return await this.stateStore.load();
    } catch {
      return null;
    }
  }

  /** 落盘锚点；写失败只影响「跨重启续期」，不影响本轮同步本身 */
  private async saveAnchor(at: number): Promise<void> {
    try {
      await this.stateStore.save({ autoSyncAnchorAt: at });
    } catch {
      /* 锚点写不进去不应阻塞同步 */
    }
  }

  /** 把排期信息同步到状态区（供界面显示「下次自动同步」时间） */
  private publishAutoSyncState(): void {
    this.setStatus({
      autoSyncEnabled: this.autoSync.enabled,
      autoSyncIntervalMs: this.autoSync.periodMs,
      nextAutoSyncAt: this.autoSync.nextDueAt,
    });
  }

  /* ----------------------------------------------------------- 手动重试 */

  /**
   * 把**本机全部待办**上传到当前账号（用户显式动作）。
   *
   * 为什么需要它：登录后的自动补推只覆盖 `pending` 里的变更（内存态），
   * 而「先在本地用了一段时间、后来才配 key 登录」的历史待办**不在 pending 里**，
   * 永远推不上去。这个方法把本机全部记录一次性推上去（按 uuid 幂等 upsert，
   * 重复点不会产生重复行）。
   *
   * **只上传「还活着」的待办，不上传本机的删除记录**（2026-11-26 修正）：
   * 按钮的意图是「把本机的待办搬上去」，不是「把本机的删除历史广播出去」。
   * 之前会把墓碑一起推上去，后果是**双向的**：
   * ① 云端那批行变成墓碑 → 别的设备拉到它，墓碑会**覆盖掉那边的活数据**
   *    （`tombstone-wins`：远端是墓碑就把本地改成已删）→ **真实数据在所有设备上消失**；
   * ② 「换账号登录」时会把旧账号的删除历史带到新账号下。
   * 删除记录的传播由**增量推送**负责（用户真的删了某条时）——那条路径不受影响。
   *
   * 边界：本地待办**不带账号归属标记**，所以「换账号登录」时也会把本机的数据
   * 带到新账号下——这是既有数据模型的固有限制（pull 同样不会清理旧账号的数据），
   * 因此本方法做成**用户显式点击**而不是自动行为。
   */
  async pushAllLocal(): Promise<void> {
    if (!this.options.config.enabled) return;
    if (!this.session) {
      await this.login();
      return;
    }
    if (this.busy) return;
    this.busy = true;
    this.setStatus({ phase: 'syncing', detail: '正在上传本机全部待办…', notice: '' });
    try {
      const token = await this.ensureFreshToken();
      const all = await this.options.local.loadAll();
      // **过滤墓碑**：删除记录不跟着「上传本机全部」走（见上面的说明）
      const rows = all.filter((row) => !row.deleted);
      if (rows.length === 0) {
        this.markSuccess(
          all.length > 0
            ? '本机没有可上传的待办（只有已删除的记录；删除记录不会上传）'
            : '本机没有待办可上传',
          // 动作反馈：面板收敛后，用户点了按钮必须知道结果
          { notice: '本机没有可上传的待办' }
        );
        this.busy = false;
        return;
      }
      await this.options.api.push(token, this.session.userId, rows);
      this.retryIndex = 0;
      // 上传完了：本机待办**已经在云端**，「还没上云」的提示必须撤掉。
      this.markSuccess(`已上传本机全部 ${rows.length} 条待办`, {
        localNotUploaded: 0,
        notice: `已上传本机全部 ${rows.length} 条待办`,
      });
    } catch (error) {
      this.busy = false;
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus({
        phase: 'error',
        detail: `上传失败：${message}`,
        lastResult: 'failed',
        lastError: message,
      });
    }
    this.busy = false;
  }

  /**
   * **找回**被本机的删除记录挡住的条目（用户显式动作）。
   *
   * **这个出口为什么必须存在**：墓碑终结（PRD BR-28 / OPEN-01）规定
   * 「已删条目不因任何非删除记录复活」，于是「本机是墓碑、云端还活着」的条目
   * **永远拉不回来**——界面上（`deleted = 0`）连「全部待办」都看不到它们。
   * 用户看到的只是「已是最新 N 条」+ 空列表（2026-11-25 实机反馈就是这个局面）。
   *
   * **它做什么**：把本机这些行**复活**（`deleted = 1` → `0`），然后重新拉取，
   * 让云端的存活版本按 LWW 覆盖回来。
   *
   * **它不做什么**（边界很重要）：
   * - 不改自动合并规则——墓碑终结在同步层依然成立；
   * - 不往云端推「复活」——删除在别的设备上依然有效，
   *   这里只撤销**这台机器**上的删除记录；
   * - 不是物理删除行——行还在（NEG-03：删除一律走软删除）。
   */
  async recoverDeleted(): Promise<void> {
    if (!this.options.config.enabled || !this.session) return;
    if (this.busy) return;
    const targets = [...this.recoverableUuids];
    if (targets.length === 0) return;
    this.busy = true;
    this.setStatus({ phase: 'syncing', detail: '正在找回被删除的条目…', notice: '' });
    try {
      const revived = await this.options.local.reviveTombstones(targets);
      this.recoverableUuids = [];
      this.busy = false;
      // 复活后立刻拉一次：云端的存活版本会按 LWW 覆盖回来
      await this.pull('找回后重新拉取');
      this.setStatus({
        detail: `已找回 ${revived} 条被删除的条目（只影响这台机器）`,
        recoverableCount: 0,
        // 动作反馈：面板收敛后，「找回」的结果必须说给用户听
        notice: `已找回 ${revived} 条被删除的条目（只影响这台机器）`,
      });
    } catch (error) {
      this.busy = false;
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus({
        phase: 'error',
        detail: `找回失败：${message}`,
        lastResult: 'failed',
        lastError: message,
      });
    }
  }

  async retry(): Promise<void> {
    if (!this.options.config.enabled) return;
    if (!this.session) {
      await this.login();
      return;
    }
    this.retryIndex = 0;
    await this.pull('手动重试');
    if (this.pending.size > 0) await this.flush();
  }

  /* ----------------------------------------------------------- 内部 */

  private markSuccess(detail: string, extra?: Partial<SyncStatus>): void {
    this.setStatus({
      phase: this.session ? 'signed-in' : 'signed-out',
      detail,
      lastSyncAt: this.options.clock.now(),
      lastResult: 'ok',
      lastError: '',
      ...extra,
    });
  }

  /** 到期前先刷新，避免把过期 token 发出去 */
  private async ensureFreshToken(): Promise<string> {
    const session = this.session;
    if (!session) throw new Error('未登录');
    if (session.expiresAt - this.options.clock.now() > REFRESH_MARGIN_MS) {
      return session.accessToken;
    }
    const raw = await this.options.api.refresh(session.refreshToken);
    this.session = toSession(raw, this.options.clock.now(), session);
    await this.options.sessionStore.save(this.session);
    return this.session.accessToken;
  }

  /** 401 处理：刷新一次；失败则清会话并置「未登录」（AC 的失效重登路径） */
  private async recoverSession(): Promise<boolean> {
    const session = this.session;
    if (!session) return false;
    try {
      const raw = await this.options.api.refresh(session.refreshToken);
      this.session = toSession(raw, this.options.clock.now(), session);
      await this.options.sessionStore.save(this.session);
      this.setStatus({ phase: 'signed-in', detail: '登录已刷新', email: this.session.email });
      return true;
    } catch {
      this.session = null;
      await this.options.sessionStore.clear();
      this.setStatus({
        phase: 'signed-out',
        detail: '登录已失效，请重新登录',
        email: '',
        lastError: '会话已失效',
      });
      return false;
    }
  }
}

/** 供检查脚本使用：判断合并判定（避免脚本另写一套规则） */
export { decideMerge };
