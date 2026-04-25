# claude-otel

Local viewer for [Claude Code](https://github.com/anthropics/claude-code)'s OpenTelemetry raw API bodies.

Browse what your `claude` CLI actually sends and receives — full system prompts, tool calls, message history, token usage — in a calm, paginated UI.

> [!NOTE]
> **alpha** · macOS / Linux · single Node.js CLI, zero npm dependencies.

## Why

Claude Code v2.x ships as a native binary, which broke older interceptors like `claude-trace`. Anthropic's own answer is to dump full request/response JSONs via OpenTelemetry:

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOG_RAW_API_BODIES=file:/path/to/dump-dir
claude
```

`claude-otel` automates that capture (defaults to `~/.claude/claude-otel/<encoded-cwd>/<timestamp>/`, so sessions are grouped by project) and renders the resulting JSONs as a real conversation — markdown, tool calls, prior context, raw inspection — served locally with live updates over SSE.

## Install

```bash
# from source
git clone https://github.com/huanghuiquan/claude-otel ~/dev/claude-otel
cd ~/dev/claude-otel
./install.sh
```

The installer symlinks `bin/claude-otel.mjs` to `$BIN_DIR/claude-otel` (default `~/.local/bin`). Make sure that directory is on your `$PATH`.

Requirements: **Node.js ≥ 18** + a modern browser. Zero npm dependencies.

## Usage

```bash
claude-otel record                  # wrap `claude`, dump raw bodies (grouped by cwd)
claude-otel record -p "hello"       # one-shot capture
claude-otel record --events         # also stream OTel events to stderr
claude-otel record --cmd ccr code   # use a wrapper (e.g. ccr) instead of `claude`

claude-otel                         # serve ~/.claude/claude-otel on http://127.0.0.1:47821
claude-otel ~/logs                  # serve a custom root
claude-otel --port 8000             # custom port
claude-otel --no-open               # don't open browser (useful over ssh)

claude-otel --help                  # full help
```

A browser tab opens to a session list, **grouped by project** (the cwd at record time). Click into one to see the full transcript. New turns from a running `claude-otel record` show up live (SSE polls the directory once per second). The header has a **theme toggle** (Auto / Light / Dark) — Auto follows macOS appearance.

## Commands

| | what it does |
|---|---|
| `claude-otel` (or `claude-otel view`) | starts the local web viewer |
| `claude-otel record [-- args]` | execs `claude` (or `--cmd <bin>`) with OTel raw-body logging enabled; all positional args are passed through |

## Data layout

`claude-otel record` writes under `~/.claude/claude-otel/` (override with `--root` or `$CLAUDE_OTEL_ROOT`):

```
<root>/
  <encoded-cwd>/                 ← e.g. -Users-iris-dev-foo
    .project                     ← original cwd, used for display
    <timestamp>/                 ← session
      <uuid>.request.json        ← full Messages API request body
      <uuid>.response.json       ← full response body
```

The viewer detects this layout and shows sessions grouped by project. A flat layout (sessions directly under root, no project layer) still works — those land under a `(legacy)` group.

## Use with proxies (ccr, mise, etc.)

`record` spawns `claude` directly. To capture a session launched via a wrapper, pass `--cmd`:

```bash
claude-otel record --cmd ccr code           # use ccr (claude-code-router)
claude-otel record --cmd "mise exec claude" # for things mise resolves
```

The OTel hooks live inside the `claude` binary, so as long as `claude` is what eventually runs and inherits `CLAUDE_CODE_ENABLE_TELEMETRY=1` + `OTEL_LOG_RAW_API_BODIES=file:<dir>`, raw bodies still drop into `<dir>` regardless of where the actual API requests are routed.

## Features

- **Project-grouped picker** — sessions cluster by cwd, with original path shown
- **Auto / Light / Dark theme** — follows macOS appearance, with a manual override
- **Markdown rendering** of assistant turns (code fences, headings, lists, links)
- **XML tag parsing** for system reminders / `<EXTREMELY_IMPORTANT>` / `<example>` / etc., grouped and color-coded; common HTML tags inside code stay literal
- **Prior-context block** on each turn — see exactly which messages were sent in the request
- **Token & cost counters** per turn (Opus / Sonnet / Haiku 4.x pricing approximations)
- **Live updates** via Server-Sent Events while a session is running
- **Path-traversal-safe** static file API
- **Zero deps** — Node stdlib only, single-file CLI; viewer is one HTML file using only Mac system fonts

## Architecture

```
┌────────────────────────┐  writes   ┌─────────────────────────────────┐
│ claude-otel record     │──────────▶│ ~/.claude/claude-otel/          │
│ (spawns claude/--cmd   │           │   <encoded-cwd>/.project        │
│  with OTEL_LOG_RAW_…)  │           │   <encoded-cwd>/<ts>/*.json     │
└────────────────────────┘           └─────────────────────────────────┘
                                              │ reads
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
                                  │ (single-file SPA)    │
                                  └──────────────────────┘
```

## Tests

```bash
npm test
```

Covers the path-traversal & slug-resolution boundary (`safeJoin`, `parseSlug`, `resolveSessionDir`) plus session-listing layout detection. Run before any change to those helpers.

## Roadmap

- [ ] Search across turns
- [ ] Diff view between adjacent prior-context snapshots
- [ ] Export turn as standalone markdown / replayable API request
- [ ] Windows support
- [ ] Auto-launch viewer from `record`

## License

MIT — see `LICENSE`.
