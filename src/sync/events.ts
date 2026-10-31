/**
 * 本地变更事件总线（同步层的接入点）。
 *
 * 数据层在写入（新建 / 更新 / 软删除 / 云端合并）之后广播 `uuid`，
 * 同步引擎订阅后进入 5 秒防抖窗口（FR-SYNC-04）。
 *
 * 为什么用总线而不是让数据层直接调引擎：依赖方向必须是
 * `components → stores → db → 平台`，数据层不能反向依赖同步层（BR-13）。
 * 本模块不 import 任何其它模块，因此两端都能安全引用。
 */

export type LocalTodoChangeKind = 'create' | 'update' | 'delete' | 'merge';

export interface LocalTodoChange {
  uuid: string;
  kind: LocalTodoChangeKind;
}

type Listener = (change: LocalTodoChange) => void;

const listeners = new Set<Listener>();

/** 订阅本地变更，返回取消订阅函数 */
export function onLocalTodoChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 广播一次本地变更（未订阅时是零成本的空操作） */
export function emitLocalTodoChange(change: LocalTodoChange): void {
  for (const listener of listeners) {
    try {
      listener(change);
    } catch {
      // 监听器自身异常不得影响数据写入（同步是可选层，不能拖垮主流程）
    }
  }
}
