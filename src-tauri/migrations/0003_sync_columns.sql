-- v3：为 todos 增加同步所需的三个字段（PRD FR-SYNC-12 / D-SYNC-04 / D-19）
--
-- 只增不改：本文件只做 ADD COLUMN 与幂等回填，绝不 DROP、绝不重建表、绝不改写 v1 / v2。
-- 同步范围只有 todos，daily_picks 不加列（D-19：不同步就不加列）。
--
-- 幂等性：
-- 1. 迁移版本号由 tauri-plugin-sql 记录，二次启动不会重复执行本文件；
-- 2. 即便重复执行回填语句，`WHERE uuid IS NULL` / `WHERE updated_at_ms IS NULL`
--    也只补空缺行，已生成的 uuid 不会被重新生成（AC-64「二次启动不重复生成 uuid」）。

ALTER TABLE todos ADD COLUMN uuid TEXT;
ALTER TABLE todos ADD COLUMN updated_at_ms INTEGER;
ALTER TABLE todos ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;

-- 回填 uuid：SQLite 无 uuid()，用 randomblob 拼一个 v4 形态的随机串。
-- 老数据每行得到不同值；已有 uuid 的行不被覆盖。
UPDATE todos SET uuid =
  lower(hex(randomblob(4))) || '-' ||
  substr(lower(hex(randomblob(2))), 1, 4) || '-4' ||
  substr(lower(hex(randomblob(2))), 2, 3) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2, 3) || '-' ||
  lower(hex(randomblob(6)))
WHERE uuid IS NULL;

-- 回填 updated_at_ms：由既有本地时间字符串推导。
-- 'utc' 修饰符把「本地时间字符串」换算成 UTC 纪元，避免回填值整体偏移一个时区。
UPDATE todos SET updated_at_ms = CAST(strftime('%s', updated_at, 'utc') AS INTEGER) * 1000
WHERE updated_at_ms IS NULL;

-- 唯一约束：uuid 是跨设备主键，重复即合并错乱（NEG-06）。
CREATE UNIQUE INDEX IF NOT EXISTS idx_todos_uuid ON todos(uuid);

-- 读取路径全部带 deleted = 0，此索引让软删除过滤不退化成全表扫描。
CREATE INDEX IF NOT EXISTS idx_todos_live ON todos(deleted, date);
