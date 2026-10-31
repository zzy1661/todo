/**
 * 全项目唯一类型来源。
 *
 * 约束：
 * - 日期一律为 `YYYY-MM-DD` 字符串，不跨层传递 `Date` 对象（BR-01）。
 * - `done` / `manual` 对外是布尔，存储层各自落 0/1 或 true/false，由数据层互转（设计 §5.2）。
 */

/** 内容库的五个分类 */
export type MethodCategory =
  | 'thinking'
  | 'work'
  | 'report'
  | 'communication'
  | 'efficiency';

/** 案例类型：`practice` = 方法提出者本人的实践案例，`story` = 提出者的故事 */
export type MethodCaseType = 'practice' | 'story';

/** 案例区块（可选字段，缺失时界面不渲染该栏） */
export interface MethodCase {
  type: MethodCaseType;
  title: string;
  content: string;
}

/** 内容库条目 */
export interface WorkMethod {
  /** 全局唯一，kebab-case */
  id: string;
  name: string;
  category: MethodCategory;
  /** 流派或来源 */
  source: string;
  /** 一句话说明 */
  summary: string;
  /** 核心步骤，每条 ≥ 2 项（CFL-07 口径，真实分布 3–7） */
  steps: string[];
  /** 适用场景 */
  when: string;
  /** 当天就能做完的一个动作 */
  action: string;
  /** 可选：缺失时界面不渲染案例区块 */
  case?: MethodCase;
}

/** 优先级：0 低 / 1 中 / 2 高，数值越大越紧急 */
export type TodoPriority = 0 | 1 | 2;

/** 待办条目 */
export interface Todo {
  id: number;
  title: string;
  /** `YYYY-MM-DD` */
  date: string;
  priority: TodoPriority;
  note: string;
  done: boolean;
  /** 本地时间字符串 `YYYY-MM-DD HH:mm:ss` */
  created_at: string;
  /** 本地时间字符串 `YYYY-MM-DD HH:mm:ss` */
  updated_at: string;
}

/** 新建待办的入参 */
export interface TodoDraft {
  title: string;
  /** `YYYY-MM-DD` */
  date: string;
  priority: TodoPriority;
  note: string;
}

/** 更新待办的入参：只为显式传入的字段赋值（FR-DB-07） */
export interface TodoPatch extends Partial<TodoDraft> {
  done?: boolean;
}

/** 每日推送记录：一日一行，重复写入为覆盖（BR-06） */
export interface DailyPick {
  /** `YYYY-MM-DD` */
  date: string;
  /** 必须是内容库中存在的 id */
  method_id: string;
  /** 0 = 当日首推；1 = 用户点过「换一条」 */
  manual: boolean;
  /** 写入时刻（整数时间戳） */
  updated_at: number;
}

/** 界面模块 id */
export type ModuleId = 'calendar' | 'daily' | 'todos';

/** 待办筛选页签 */
export type TodoFilter = 'all' | 'active' | 'done';
