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


def read_sql() -> str:
    r"""
    从 stdin 读 SQL，**显式按 UTF-8 解码**。

    **为什么不能用 `sys.stdin.read()`**：Windows 上 Python 的标准输入默认用
    **系统 ANSI 代码页**（cp936 / cp1252）解码，不是 UTF-8 ——
    Node 写进来的是 UTF-8 字节，被按本地代码页一解就成了乱码，
    甚至产生**孤立代理字符**（`\udc81` 这类），随后 SQLite 往里编码时报
    `UnicodeEncodeError: 'utf-8' codec can't encode character`。

    （2026-11-23：CI 在 Windows 上真跑出来了 —— macOS 的 locale 恰好是 UTF-8，
    所以本地永远看不到。）

    所以走 `sys.stdin.buffer` 拿**原始字节**，再自己按 UTF-8 解：
    这样与系统 locale 完全无关。

    **注意这个 docstring 是 raw 字符串（r\"\"\"）**：上面为了说明现象写了
    `\udc81` 这个字面量 —— 在**普通**字符串里它会被当成**真的转义序列**，
    编译期就生成了孤立代理字符，于是**模块自己都编译不过**
    （报错还长得一模一样，也是 `UnicodeEncodeError ... \\udc81`，极具迷惑性）。
    raw 字符串让文档里的示例保持原样。
    """
    return sys.stdin.buffer.read().decode('utf-8')


def write_row(values) -> None:
    """
    把一行结果写成 `sqlite3` CLI 的 list 格式（`|` 分隔、NULL 输出空串）。

    同样**显式按 UTF-8 编码**写字节：Node 那边按 UTF-8 解码 stdout，
    这里就必须按 UTF-8 编码，否则中文标题会变成乱码。
    """
    line = '|'.join('' if v is None else str(v) for v in values) + '\n'
    sys.stdout.buffer.write(line.encode('utf-8'))


def main() -> int:
    if len(sys.argv) != 3:
        sys.stderr.write('usage: sqlite-run.py <run|query> <db>\n')
        return 2

    mode, db_path = sys.argv[1], sys.argv[2]
    sql_text = read_sql()

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
                    write_row(row)
        else:
            sys.stderr.write('unknown mode: %s\n' % mode)
            return 2
        con.commit()
    finally:
        con.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
