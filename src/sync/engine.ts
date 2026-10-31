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
import {
  buildAuthorizeUrl,
  createPkcePair,
  createState,
  loopbackRedirectUri,
  parseCallbackQuery,
} from './oauth.ts';
import type { SyncApiLike, RawSessionPayload } from './api.ts';
import { SyncHttpError } from './api.ts';
import type { SessionStore } from './sessionStore.ts';
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
  /** 应用远端记录（LWW + 墓碑终结） */
  applyRemote(rows: RemoteTodo[]): Promise<MergeStats>;
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

export class SyncEngine {
  private readonly options: SyncEngineOptions;
  private readonly debounceMs: number;
  private readonly retryDelays: number[];
  private readonly oauthTimeoutMs: number;

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

  constructor(options: SyncEngineOptions) {
    this.options = options;
    this.debounceMs = options.debounceMs ?? 5000;
    this.retryDelays = options.retryDelays ?? DEFAULT_RETRY_DELAYS;
    this.oauthTimeoutMs = options.oauthTimeoutMs ?? 180_000;
    this.status = {
      phase: options.config.enabled ? 'signed-out' : 'disabled',
      detail: options.config.enabled ? '未登录' : '未配置同步',
      email: '',
      lastSyncAt: null,
      lastResult: null,
      lastError: '',
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
      return;
    }
    this.session = stored;
    this.setStatus({ phase: 'signed-in', detail: '已登录', email: stored.email });
    await this.pull('启动');
  }

  dispose(): void {
    this.disposed = true;
    if (this.debounceTimer !== null) this.options.timers.clearTimeout(this.debounceTimer);
    if (this.retryTimer !== null) this.options.timers.clearTimeout(this.retryTimer);
    this.debounceTimer = null;
    this.retryTimer = null;
  }

  /* ----------------------------------------------------------- 变更 → 防抖 */

  /**
   * 本地任意变更（新建 / 编辑 / 勾选 / 搬日期 / 软删除）后调用。
   * 同一个 5 秒窗口内的多次变更合并为一次推送。
   */
  markLocalChange(uuid: string): void {
    if (!this.options.config.enabled || this.disposed) return;
    this.pending.set(uuid, (this.pending.get(uuid) ?? 0) + 1);
    if (!this.session) return; // 未登录：不发请求，等登录后一并处理
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
    this.setStatus({ phase: 'syncing', detail: '同步中…' });
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
    this.setStatus({ phase: 'syncing', detail: '同步中…' });
    try {
      const token = await this.ensureFreshToken();
      const rows = await this.options.api.pull(token);
      const stats = await this.options.local.applyRemote(rows);
      this.options.onMerged?.(stats);
      this.markSuccess(`已拉取（${reason}）`);
      this.busy = false;
      return stats;
    } catch (error) {
      this.busy = false;
      if (isUnauthorized(error) && (await this.recoverSession())) {
        return this.pull(reason);
      }
      if (isUnauthorized(error)) return null;
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
      if (callback.error) throw new Error(`${callback.error} ${callback.errorDescription}`.trim());
      if (!callback.code) throw new Error('回调未携带授权码');
      if (callback.state !== state) throw new Error('state 校验失败，已放弃本次登录');
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
      // 登录成功后立即拉取一次（FR-SYNC-06）
      await this.pull('登录');
      if (this.pending.size > 0) this.scheduleFlush(this.debounceMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus({
        phase: this.session ? 'signed-in' : 'signed-out',
        detail: `登录失败：${message}`,
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
    if (this.debounceTimer !== null) this.options.timers.clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    try {
      await this.options.sessionStore.clear();
    } finally {
      this.setStatus({
        phase: this.options.config.enabled ? 'signed-out' : 'disabled',
        detail: '未登录',
        email: '',
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

  /* ----------------------------------------------------------- 手动重试 */

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

  private markSuccess(detail: string): void {
    this.setStatus({
      phase: this.session ? 'signed-in' : 'signed-out',
      detail,
      lastSyncAt: this.options.clock.now(),
      lastResult: 'ok',
      lastError: '',
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
