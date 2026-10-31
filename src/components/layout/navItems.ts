/**
 * 侧边导航注册表（FR-NAV-04）。
 *
 * 「新增一个模块」只需三处改动：① 在这里注册一项；② `App.vue` 加一个渲染分支；
 * ③ 新建视图组件。导航项与图标都按 `id` 渲染，未知 id 回退默认时钟图标。
 *
 * 注意：基线只在代码里预留过「番茄钟」，界面**不得**出现（FR-NAV-06），
 * 因此这里不注册任何未实现模块。
 */

/** 一行导航项 */
export interface NavItem {
  /** 模块 id，与 `ModuleId` 取值一致；新增模块可先为 `string` */
  id: string;
  /** 界面文案（全中文，BR-22） */
  label: string;
}

/** 导航项自上而下的固定顺序（FR-NAV-02） */
export const NAV_ITEMS: NavItem[] = [
  { id: 'calendar', label: '日历' },
  { id: 'daily', label: '每日工作法' },
  { id: 'todos', label: '全部待办' },
];
