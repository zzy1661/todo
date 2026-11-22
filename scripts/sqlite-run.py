"""
SQLite 执行器（跨平台退路）。

**为什么存在**

`scripts/check-sync.mjs` 的「v3 迁移结构证据」需要**真的建一个 SQLite 库**、
真的跑一遍 v1/v2/v3 迁移、真的查表结构与回填结果 —— 光做静态正则匹配证明不了
「迁移真的能执行」。

原来直接调 `sqlite3` 命令行：
- macOS 自带 `/usr/bin/sqlite3` → 能跑；
- **windows-latest 的 runner 镜像里没有 sqlite3.exe** —— 镜像的 Database Systems
  一节只列了 PostgreSQL 与 MongoDB，Git for Windows 内部链接 libsqlite3 但**不提供
  命令行**。于是 `execFileSync('sqlite3', ...)` 抛 ENOENT，整个自检脚本失败。

所以 Windows 上改用 **Python 标准库自带的 sqlite3**（runner 镜像带 Python 3.12）。

**输出格式必须与 `sqlite3` 命令行的默认 list 模式逐字节一致**

值用 `|` 分隔、一行一条记录、**无表头**、NULL 输出空串。
这样两个后端跑同一批 SQL 的结果可以直接比对（check-sync 第 ⑬ 组断言），
不会出现「一边通过、另一边失败」却查不出原因的情况。

**用法**

    python sqlite-run.py run   <db>  < sql   # 只执行（可含多条语句与 -- 注释）
    python sqlite-run.py query <db>  < sql   # 打印单条查询的结果
"""

import sqlite3
import sys


def main() -> int:
    if len(sys.argv) != 3:
        sys.stderr.write('usage: sqlite-run.py <run|query> <db>\n')
        return 2

    mode, db_path = sys.argv[1], sys.argv[2]
    sql_text = sys.stdin.read()

    con = sqlite3.connect(db_path)
    try:
        if mode == 'run':
            # executescript 一次跑多条语句（自带 -- 注释处理），正对应「脚本」语义
            con.executescript(sql_text)
        elif mode == 'query':
            # query 只用于单条 SELECT / PRAGMA；结果按 CLI 的 list 模式打印
            cur = con.execute(sql_text)
            if cur.description is not None:
                for row in cur.fetchall():
                    sys.stdout.write('|'.join('' if v is None else str(v) for v in row) + '\n')
        else:
            sys.stderr.write('unknown mode: %s\n' % mode)
            return 2
        con.commit()
    finally:
        con.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
