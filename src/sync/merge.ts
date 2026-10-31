/**
 * 冲突解决：LWW + 墓碑终结（PRD BR-28 / FR-SYNC-07 / FR-SYNC-09 / OPEN-01）。
 *
 * 规则只在这里实现一份，数据层与检查脚本都调用它——不得在每个存储适配器里各写一套。
 *
 * 三条，按优先级：
 * 1. **墓碑终结**（OPEN-01 已裁定）：任一侧 `deleted = 1`，最终就是 `deleted = 1`。
 *    已删条目**不因任何非删除记录复活**，含 `updated_at_ms` 更大的记录。
 * 2. **LWW**：两侧都未删时，`updated_at_ms` 大者胜。
 * 3. **稳定序**：`updated_at_ms` 同毫秒时，`uuid` 字典序**较大**者胜；
 *    同一 `uuid` 同毫秒但内容不同的两条，再按规范化内容的字典序较大者胜，
 *    保证「两种到达顺序得到逐字节相同的结果」（AC-62 / TC-071）。
 *
 * 落败值只被丢弃，绝不回写云端（NEG-04）：推送只来自本地改动集合，
 * 拉取结果不进推送队列。
 */

import type { RemoteTodo } from './types.ts';

/** 参与版本比较的最小字段集 */
export type Versioned = Pick<RemoteTodo, 'uuid' | 'updated_at_ms' | 'deleted'>;

/** 稳定内容键：字段顺序固定，避免 JSON.stringify 的对象键顺序影响判定 */
export function contentKey(row: RemoteTodo): string {
  return [
    row.uuid,
    row.title,
    row.date,
    String(row.priority),
    row.note,
    row.done ? '1' : '0',
    row.created_at,
    row.updated_at,
    String(row.updated_at_ms),
    row.deleted ? '1' : '0',
  ].join('\u0001');
}

/**
 * 版本比较：返回 `> 0` 表示 a 胜，`< 0` 表示 b 胜，`0` 表示完全等价。
 * 全序（total order），因此合并结果与到达顺序无关。
 */
export function compareVersion(a: RemoteTodo, b: RemoteTodo): number {
  if (a.updated_at_ms !== b.updated_at_ms) {
    return a.updated_at_ms - b.updated_at_ms;
  }
  if (a.uuid !== b.uuid) {
    return a.uuid < b.uuid ? -1 : 1;
  }
  const ka = contentKey(a);
  const kb = contentKey(b);
  if (ka === kb) return 0;
  return ka < kb ? -1 : 1;
}

/** 合并动作：新插入 / 覆盖本地 / 保持本地不变 */
export type MergeAction = 'insert' | 'update' | 'keep';

export interface MergeDecision {
  action: MergeAction;
  /** 决定依据，便于 stub 断言与排障（不含敏感信息） */
  reason: 'no-local' | 'tombstone-wins' | 'tombstone-terminal' | 'lww-remote' | 'lww-local' | 'equal';
}

/**
 * 单条远端记录与本地（可能不存在）的合并判定。
 *
 * @param local 本地同 `uuid` 的行（含墓碑），不存在传 null
 * @param remote 刚拉到的云端行
 */
export function decideMerge(
  local: Versioned | null,
  remote: Versioned
): MergeDecision {
  if (!local) return { action: 'insert', reason: 'no-local' };

  if (remote.deleted && !local.deleted) {
    // 墓碑优先：删除一经发生就传播，不看时间戳
    return { action: 'update', reason: 'tombstone-wins' };
  }
  if (!remote.deleted && local.deleted) {
    // 墓碑终结：任何非删除记录都不复活已删条目（OPEN-01）
    return { action: 'keep', reason: 'tombstone-terminal' };
  }
  if (remote.deleted && local.deleted) {
    return { action: 'keep', reason: 'tombstone-terminal' };
  }

  const cmp = compareVersion(remote as RemoteTodo, local as RemoteTodo);
  if (cmp > 0) return { action: 'update', reason: 'lww-remote' };
  if (cmp < 0) return { action: 'keep', reason: 'lww-local' };
  return { action: 'keep', reason: 'equal' };
}
