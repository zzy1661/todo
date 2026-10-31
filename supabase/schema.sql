-- 云端表结构与 RLS 策略（PRD FR-SYNC-14 / AC-66 / TC-079 第一段）
--
-- 口径：
-- 1. **只同步 todos 一张表**（D-07 / D-19）；daily_picks 是「本机今天推了哪条」的本地状态，不建云表。
-- 2. 云表必须开 RLS，策略一律 `auth.uid() = user_id`，客户端不做权限分支（PRD §12）。
-- 3. 主键用 `(user_id, uuid)`：uuid 是跨设备稳定主键（NEG-06），user_id 保证多用户互不覆盖。
-- 4. 本文件只包含 anon key 能走的策略；管理员类密钥不出现在客户端（AC-67）。
--
-- 执行方式（有 key 之后，由项目管理员在 Supabase SQL Editor 执行一次）：
--   ① 打开 https://bbaspdboyysqmjhqhdhj.supabase.co → SQL Editor；
--   ② 粘贴本文件全部内容执行；
--   ③ 用 anon key 走一次读写，确认只能看到自己的行（S10.5 补跑，当前 NOT-VERIFIED）。
--
-- 本阶段没有 key，因此「已执行 / 策略生效」属 NOT-VERIFIED，只有 SQL 文本可判（TC-079 ①）。

create table if not exists public.todos (
  user_id uuid not null references auth.users (id) on delete cascade,
  uuid text not null,
  title text not null,
  date text not null,
  priority integer not null default 1,
  note text not null default '',
  done integer not null default 0,
  created_at text not null default '',
  updated_at text not null default '',
  updated_at_ms bigint not null,
  deleted integer not null default 0,
  constraint todos_pkey primary key (user_id, uuid)
);

alter table public.todos enable row level security;

-- 读：只能读自己的行
create policy "todos_select_own" on public.todos
  for select to authenticated
  using (auth.uid() = user_id);

-- 写：只能写自己的行（with check 防止把 user_id 伪造成别人）
create policy "todos_insert_own" on public.todos
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "todos_update_own" on public.todos
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "todos_delete_own" on public.todos
  for delete to authenticated
  using (auth.uid() = user_id);

-- 同步按 uuid 冲突键 upsert，需要 (user_id, uuid) 上的唯一约束（由主键提供）与 updated_at_ms 索引
create index if not exists todos_updated_at_ms_idx on public.todos (user_id, updated_at_ms);
