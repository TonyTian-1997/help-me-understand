# Help Me Understand（帮我搞懂）

**能留存、能追问、能反复读的 ELI5 讲解** —— 一个 [Claude Code](https://code.claude.com) 插件：把任何主题或选中的代码直接变成批注版教科书风格的 HTML 笔记（生活比喻在前、工程原理在后），然后在浏览器里**划选任意句子**就能继续追问。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) ![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue) [English](README.md)

```text
你： /help-me-understand:eli5 HTTP 缓存是怎么工作的？

Claude： 📖 笔记已生成 → http://127.0.0.1:8899/http-caching.html
        （笔记即答案——终端不再刷一大段文字）

浏览器： 一整页批注版教科书：比喻黄盒、SVG 图、树状事件流、
        证据链脚注、术语表……
        划选「ETag」→「为什么它会让缓存失效？」
        → 回答以评论线程的形式挂在那句话上
```

## 安装

```shell
# 在 Claude Code（v2.1+）里执行：
/plugin marketplace add TonyTian-1997/help-me-understand
/plugin install help-me-understand@help-me-understand
```

三种用法：

- **斜杠命令**：`/help-me-understand:eli5 <主题>`（输入 `/eli5` 也能模糊匹配到）
- **自然语言**：*"eli5 事件循环"*；或在编辑器里**划选代码**后说 *“帮我理解这段”*
- **追问**：回答末尾有编号的深挖线索，回复编号即可；也可以在浏览器笔记里划句提问

## 你会得到什么

1. **快速生成的优质笔记** —— 讲解直接落成自包含 HTML 单页，批注版教科书风格：比喻黄盒、荧光笔关键句、右栏批注、SVG 图、代码主题带 `file:line` 证据链脚注、结尾术语表。所有笔记沉淀在 `~/.understand/notes/`，有目录页；离线可读、打印友好、永不过期。
2. **划词追问** —— 浏览器里打开笔记，划选任意句子直接提问。Claude 的回答以评论线程写回页面（持久高亮、右侧评论栏、行内回复、可标记解决）；在终端里继续追问同样有效。

## 环境要求

| | |
|---|---|
| Claude Code | v2.1 及以上 |
| 交互问答 | PATH 上有 Python **3.9+**（自动探测 `python3` / `python` / `py -3`）—— macOS 和大多数开发机都有 |
| 没有 Python | 除「浏览器划词追问」外全部可用：笔记照常生成、离线可读，互动层会自动隐藏 |

一切只跑在 `127.0.0.1`，不出本机。卸载插件不会动你的笔记（`~/.understand/` 永远是你的）。

## 工作原理

```text
┌─ 终端 ─────────────────┐      ┌─ ~/.understand/ ──────────────────┐
│ /eli5 <主题>            │      │ notes/<slug>.html   笔记           │
│ → 双层回答              │─────▶│ notes/index.html    目录           │
│ → 笔记+服务器+哨兵      │      │ notes/qa.jsonl      问答流水       │
└────────────────────────┘      │ notes/assets/…      样式与交互 JS  │
                                └──────────────┬─────────────────────┘
┌─ 浏览器 ────────────────┐                     │ 127.0.0.1:<端口>
│ 划词 → 提问             │──POST /ask─────────▶│ (server.py，纯标准库) │
│ 问答抽屉 ← 回答          │◀─GET /qa?since=N───┘                     │
└────────────────────────┘   Claude 通过 qa_tool.py 监听 qa.jsonl 并作答
```

插件 = 一个技能（`eli5`）+ 两个零依赖 Python 脚本 + 笔记设计系统（CSS + 交互层）。真实生成效果见 [examples/http-caching.html](examples/http-caching.html)。

## 常见问题

**数据会上传吗？** 不会。服务器只绑本机回环地址，问答记录是本地 `qa.jsonl`，笔记是本地文件。卸载：`claude plugin uninstall help-me-understand@help-me-understand`，笔记不受影响。

**笔记存在哪？** `~/.understand/notes/`（Windows：`%USERPROFILE%\.understand\notes\`）。删掉整个 `~/.understand` 即可完全重置。

**端口被占？** 从 8899 起自动向后找可用端口，结果缓存在 `~/.understand/config.json`。

**支持 Windows 吗？** 支持。脚本纯标准库，技能自动探测 `python`/`py -3`，回答通过临时文件写入以避开控制台编码坑。

**浏览器提问需要 Claude Code 一直开着吗？** 需要——哨兵只在你会话存活期间唤起 Claude 作答。笔记本身是静态文件，随时可看。

## 开发

```shell
git clone https://github.com/TonyTian-1997/help-me-understand
claude plugin validate ./help-me-understand --strict   # 清单 + frontmatter 校验
claude --plugin-dir ./help-me-understand               # 不安装直接实测
```

技能定义：[skills/eli5/SKILL.md](skills/eli5/SKILL.md) · 笔记设计：[skills/eli5/references/html-style.md](skills/eli5/references/html-style.md) · 运维：[skills/eli5/references/qa-ops.md](skills/eli5/references/qa-ops.md)

## 许可

[MIT](LICENSE)
