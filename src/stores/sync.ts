/**
 * 同步状态层（PRD FR-SYNC-02 / C-16 同步状态与登录区）。
 *
 * 职责：把同步引擎接到 Vue 上——加载运行期配置、暴露五种状态、转发用户操作。
 * 登录入口**只在这里**（不进导航、不做启动拦截，D-SYNC-02 / AC-58）。
 *
 * 会话只存在钥匙串里（桌面）或内存里（浏览器 / 检查脚本），
 * 绝不写 localStorage：那是明文字段，token 进去即违规。
 */

import { reactive } from 'vue';
import dayjs from 'dayjs';
import { invoke } from '@tauri-apps/api/core';
import { applyRemoteTodos, fetchTodoSyncRows, isTauriEnv } from '../db/database.ts';
import {
  DISABLED_CONFIG,
  parseSyncConfig,
  type SyncConfig,
} from '../sync/config.ts';
import { SupabaseRestApi } from '../sync/api.ts';
import { SyncEngine, type OAuthLauncher } from '../sync/engine.ts';
import {
  createMemorySessionStore,
  parseSession,
  serializeSession,
  type SessionStore,
} from '../sync/sessionStore.ts';
import { onLocalTodoChange } from '../sync/events.ts';
import { nowMs } from '../sync/clock.ts';
import { currentTimers } from '../sync/timers.ts';
import { EMPTY_STATUS, type SyncStatus } from '../sync/types.ts';
import { reloadAfterSync } from './todo.ts';

export interface SyncUiState {
  status: SyncStatus;
  /** 配置是否可用（无 key / 未配置 = false，此时同步层完全短路） */
  enabled: boolean;
  /** 是否已完成初始化（首屏不因同步而等待） */
  ready: boolean;
  /** 状态区是否展开；关闭只是隐藏，不丢会话（FR-SYNC-02） */
  panelOpen: boolean;
  /** 配置来源，只用于排障提示，不含 key */
  configSource: string;
  /** 动作进行中（登录 / 重试），仅用于按钮态，不阻塞主流程 */
  actionBusy: boolean;
}

export const syncState = reactive<SyncUiState>({
  status: { ...EMPTY_STATUS },
  enabled: false,
  ready: false,
  panelOpen: false,
  configSource: '',
  actionBusy: false,
});

let engine: SyncEngine | null = null;
let unsubscribe: (() => void) | null = null;
let initPromise: Promise<void> | null = null;

/* ------------------------------------------------------------- 平台适配 */

/** 桌面端：钥匙串（`security` 命令由 Rust 侧封装） */
function createKeychainSessionStore(): SessionStore {
  return {
    kind: 'keychain',
    async load() {
      try {
        const raw = await invoke<string | null>('sync_session_load');
        return parseSession(raw);
      } catch {
        return null; // 读不到就当未登录，不让启动失败
      }
    },
    async save(session) {
      await invoke('sync_session_save', { blob: serializeSession(session) });
    },
    async clear() {
      try {
        await invoke('sync_session_clear');
      } catch {
        /* 清除失败不影响本地已置未登录 */
      }
    },
  };
}

/** 桌面端：系统浏览器 + Rust 回环监听（loopback + PKCE） */
const tauriOAuthLauncher: OAuthLauncher = {
  listen: () => invoke<number>('sync_oauth_listen'),
  open: (url) => invoke('sync_open_url', { url }),
  wait: async (timeoutMs) => {
    const query = await invoke<string | null>('sync_oauth_wait', { timeoutMs });
    if (!query) throw new Error('等待授权回调超时');
    return query;
  },
};

/** 浏览器 / 检查脚本：没有回环监听，登录不可用（同步也不会被启用） */
const unsupportedOAuthLauncher: OAuthLauncher = {
  async listen() {
    throw new Error('当前环境不支持 OAuth 回环登录');
  },
  async open() {
    throw new Error('当前环境不支持 OAuth 回环登录');
  },
  async wait() {
    throw new Error('当前环境不支持 OAuth 回环登录');
  },
};

/** 读取运行期配置：桌面端读 app data 目录的 sync.config.json，浏览器恒为未配置 */
async function loadConfig(): Promise<{ config: SyncConfig; reason: string }> {
  if (!isTauriEnv()) {
    return { config: { ...DISABLED_CONFIG, source: 'browser' }, reason: '浏览器环境不启用同步' };
  }
  try {
    const raw = await invoke<string | null>('sync_config_read');
    if (!raw) {
      return { config: DISABLED_CONFIG, reason: '未找到 sync.config.json' };
    }
    return parseSyncConfig(JSON.parse(raw) as unknown);
  } catch (error) {
    return {
      config: DISABLED_CONFIG,
      reason: `配置读取失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/* ------------------------------------------------------------- 生命周期 */

/**
 * 初始化同步：**不阻塞应用启动**，失败也不影响本地功能（FR-SYNC-01 / FR-SYNC-11）。
 */
export function initSync(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      await startSync();
      syncState.ready = true;
    } catch (error) {
      // 同步初始化失败不得影响本地功能，也不得抛到控制台（FR-SYNC-11）
      syncState.ready = true;
      syncState.status = {
        ...syncState.status,
        phase: 'error',
        detail: '同步初始化失败，本地功能不受影响',
        lastResult: 'failed',
        lastError: error instanceof Error ? error.message : String(error),
      };
    }
  })();
  return initPromise;
}

async function startSync(): Promise<void> {
  const { config, reason } = await loadConfig();
  syncState.enabled = config.enabled;
  syncState.configSource = config.source;

  const sessionStore = config.enabled && isTauriEnv()
    ? createKeychainSessionStore()
    : createMemorySessionStore();

  engine = new SyncEngine({
    config,
    api: new SupabaseRestApi({ baseUrl: config.baseUrl, anonKey: config.anonKey }),
    sessionStore,
    local: {
      loadByUuids: (uuids) => fetchTodoSyncRows(uuids),
      applyRemote: (rows) => applyRemoteTodos(rows),
    },
    oauth: isTauriEnv() ? tauriOAuthLauncher : unsupportedOAuthLauncher,
    // 时钟与定时器走可注入的全局实现（FR-SYNC-15），这里只做转发
    clock: { now: () => nowMs() },
    timers: {
      setTimeout: (fn, ms) => currentTimers().setTimeout(fn, ms),
      clearTimeout: (handle) => currentTimers().clearTimeout(handle),
    },
    onStatus: (status) => {
      syncState.status = status;
    },
    onMerged: () => {
      // 拉取合并后界面必须立刻反映（FR-SYNC-05 / FR-SYNC-06）；
      // 刷新失败只影响列表的即时性，不回滚已合并的数据
      reloadAfterSync().catch(() => undefined);
    },
  });

  // 本地写操作 → 防抖推送；合并产生的事件不算本地改动（NEG-04）
  unsubscribe = onLocalTodoChange(({ uuid, kind }) => {
    if (kind === 'merge') return;
    engine?.markLocalChange(uuid);
  });

  if (!config.enabled) {
    syncState.status = {
      ...syncState.status,
      phase: 'disabled',
      detail: reason || '未配置同步',
    };
  }
  await engine.start();
}

export function disposeSync(): void {
  unsubscribe?.();
  unsubscribe = null;
  engine?.dispose();
  engine = null;
  initPromise = null;
}

/* ------------------------------------------------------------- 界面动作 */

export function togglePanel(): void {
  syncState.panelOpen = !syncState.panelOpen;
}

export function closePanel(): void {
  syncState.panelOpen = false;
}

export async function login(): Promise<void> {
  if (!engine || syncState.actionBusy) return;
  syncState.actionBusy = true;
  try {
    await engine.login();
  } finally {
    syncState.actionBusy = false;
  }
}

export async function logout(): Promise<void> {
  if (!engine || syncState.actionBusy) return;
  syncState.actionBusy = true;
  try {
    await engine.logout();
  } finally {
    syncState.actionBusy = false;
  }
}

export async function retrySync(): Promise<void> {
  if (!engine || syncState.actionBusy) return;
  syncState.actionBusy = true;
  try {
    await engine.retry();
  } finally {
    syncState.actionBusy = false;
  }
}

/* ------------------------------------------------------------- 展示用派生 */

/** 状态区主文案（PRD FR-SYNC-02 的五种状态） */
export function phaseLabel(status: SyncStatus): string {
  switch (status.phase) {
    case 'disabled':
      return '未配置';
    case 'signed-out':
      return '未登录';
    case 'signed-in':
      return '已登录';
    case 'syncing':
      return '同步中';
    case 'error':
      return '同步失败';
    default:
      return '未配置';
  }
}

/** 「上次同步 2026-11-01 09:30 · 成功」 */
export function lastSyncText(status: SyncStatus): string {
  if (!status.lastSyncAt) return '';
  const time = dayjs(status.lastSyncAt).format('M月D日 HH:mm:ss');
  const result = status.lastResult === 'ok' ? '成功' : status.lastResult === 'failed' ? '失败' : '';
  return `上次同步 ${time}${result ? ` · ${result}` : ''}`;
}
