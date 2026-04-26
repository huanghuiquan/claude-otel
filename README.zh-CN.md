# claude-otel

[English](README.md) · 简体中文

[Claude Code](https://github.com/anthropics/claude-code) OpenTelemetry 原始 API body 的本地查看器。

用一个安静、分页的界面，浏览你的 `claude` CLI 实际发送和接收的内容 — 完整的 system prompt、工具调用、消息历史、token 用量。

> [!NOTE]
> **alpha** · macOS / Linux · 单文件 Node.js CLI，零 npm 依赖。

## 为什么需要它

Claude Code v2.x 改成了原生二进制，旧的拦截器（如 `claude-trace`）失效。Anthropic 给的官方答案是通过 OpenTelemetry 把请求/响应 JSON 整体落盘：

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOG_RAW_API_BODIES=file:/path/to/dump-dir
claude
```

`claude-otel` 把这个流程自动化（默认落到 `~/.claude/claude-otel/<编码后的 cwd>/<时间戳>/`，因此会按项目分组），并把得到的 JSON 渲染成一段真正的对话 — markdown、工具调用、上下文、原始 JSON 检视，本地起服务，配合 SSE 实时更新。

## 安装

```bash
# 从源码安装
git clone https://github.com/huanghuiquan/claude-otel ~/dev/claude-otel
cd ~/dev/claude-otel
./install.sh
```

安装脚本会把 `bin/claude-otel.mjs` 软链接到 `$BIN_DIR/claude-otel`（默认 `~/.local/bin`）。请确保该目录在 `$PATH` 中。

依赖：**Node.js ≥ 18** + 一个现代浏览器。零 npm 依赖。

## 用法

```bash
claude-otel record                  # 包一层 `claude`，原始 body 按 cwd 分组落盘
claude-otel record -p "hello"       # 单次会话捕获
claude-otel record --events         # 同时把 OTel events 输出到 stderr
claude-otel record --cmd ccr code   # 用 wrapper（如 ccr）替代直接调 `claude`

claude-otel                         # 在 http://127.0.0.1:47821 提供 ~/.claude/claude-otel 视图
claude-otel ~/logs                  # 指定其他根目录
claude-otel --port 8000             # 自定义端口
claude-otel --no-open               # 不自动开浏览器（ssh 远程时有用）

claude-otel --help                  # 完整帮助
```

浏览器打开后会看到一个会话列表，**按项目分组**（record 时所在的 cwd）。点进去看完整 transcript。`claude-otel record` 还在跑时新产生的 turn 会实时出现（SSE 每秒轮询一次目录）。Header 上有**主题切换**（Auto / Light / Dark），Auto 跟随 macOS 系统外观。

## 命令

| | 作用 |
|---|---|
| `claude-otel`（或 `claude-otel view`） | 启动本地查看器 |
| `claude-otel record [-- args]` | 启动 `claude`（或 `--cmd <bin>` 指定的程序）并打开 OTel 原始 body 日志；所有位置参数透传给被启动的程序 |

## 目录结构

`claude-otel record` 写入 `~/.claude/claude-otel/` 下（可通过 `--root` 或 `$CLAUDE_OTEL_ROOT` 覆盖）：

```
<root>/
  <encoded-cwd>/                 ← 例如 -Users-iris-dev-foo
    .project                     ← 原始 cwd，用于显示
    <timestamp>/                 ← 会话
      <uuid>.request.json        ← 完整的 Messages API 请求 body
      <uuid>.response.json       ← 完整的响应 body
```

Viewer 自动识别这种布局并按项目分组展示。平铺布局（session 直接在根目录下、无项目层）也兼容，那些会被归到 `(legacy)` 分组。

## 配合代理使用（ccr、mise 等）

`record` 默认直接 spawn `claude`。如果你需要通过 wrapper 启动（比如 `ccr`、`mise exec`），用 `--cmd`：

```bash
claude-otel record --cmd ccr code           # 走 ccr (claude-code-router)
claude-otel record --cmd "mise exec claude" # 给 mise 解析的命令
```

OTel 的钩子写在 `claude` 二进制内部，所以只要最终跑起来的是 `claude`、且能继承 `CLAUDE_CODE_ENABLE_TELEMETRY=1` + `OTEL_LOG_RAW_API_BODIES=file:<dir>` 这两个环境变量，原始 body 就会照常落到 `<dir>`，不论 API 请求实际被路由到哪。

## 特性

- **按项目分组的会话列表** — sessions 按 cwd 聚合，并显示原始路径
- **Auto / Light / Dark 主题** — 跟随 macOS 系统外观，可手动覆盖
- **Markdown 渲染** assistant turn（代码块、标题、列表、链接）
- **XML 标签解析** 处理 system reminder / `<EXTREMELY_IMPORTANT>` / `<example>` 等，按类型上色；代码里的常见 HTML 标签保留为字面量
- **上下文回看块** 每个 turn 都能看到当时实际发出的消息历史
- **Token 与花费统计** 每个 turn 显示（基于 Opus / Sonnet / Haiku 4.x 的近似定价）
- **实时更新** 通过 Server-Sent Events 在 session 进行中同步
- **路径穿越安全** 的静态文件 API
- **零依赖** — 仅使用 Node 标准库，单文件 CLI；viewer 是单个 HTML 文件，只用 Mac 系统字体

## 架构

```
┌────────────────────────┐   写入    ┌─────────────────────────────────┐
│ claude-otel record     │──────────▶│ ~/.claude/claude-otel/          │
│ (spawn claude / --cmd  │           │   <encoded-cwd>/.project        │
│  并设置 OTEL_LOG_RAW_…) │           │   <encoded-cwd>/<ts>/*.json     │
└────────────────────────┘           └─────────────────────────────────┘
                                              │ 读取
                                              ▼
                                  ┌──────────────────────┐
                                  │ claude-otel (Node)   │
                                  │  /                   │
                                  │  /api/sessions       │
                                  │  /api/.../files      │
                                  │  /api/.../file/{n}   │
                                  │  /api/.../events SSE │
                                  └──────────────────────┘
                                              │
                                              ▼
                                  ┌──────────────────────┐
                                  │ viewer.html          │
                                  │ (单文件 SPA)         │
                                  └──────────────────────┘
```

## 测试

```bash
npm test
```

覆盖路径穿越和 slug 解析的安全/正确性边界（`safeJoin`、`parseSlug`、`resolveSessionDir`），以及 session 列表的布局识别。改动这些 helper 之前先跑一次。

## 路线图

- [ ] 跨 turn 搜索
- [ ] 相邻 turn 的上下文 diff
- [ ] 把单个 turn 导出为独立 markdown / 可重放的 API 请求
- [ ] Windows 支持
- [ ] `record` 自动拉起 viewer

## 许可证

MIT — 见 `LICENSE`。
