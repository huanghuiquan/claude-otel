# scry

Local viewer for [Claude Code](https://github.com/anthropics/claude-code)'s OpenTelemetry raw API bodies.

Browse what your `claude` CLI actually sends and receives — full system prompts, tool calls, message history, token usage — in a calm, paginated UI.

> [!NOTE]
> **alpha** · macOS / Linux only · npm package name `claude-scry`, command `scry`.

## Why this exists

Claude Code v2.x ships as a native binary, which broke older interceptors like `claude-trace`. Anthropic's own answer is to dump full request/response JSONs via OpenTelemetry:

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOG_RAW_API_BODIES=file:./.claude-otel/$(date +%F-%H%M%S)
claude
```

`scry` reads those JSON files and renders them as a real conversation — markdown, tool calls, prior context, raw inspection — and serves it locally with live updates over SSE.

## Install

```bash
git clone https://github.com/USER/claude-scry ~/dev/scry
cd ~/dev/scry
./install.sh
```

Symlinks `bin/scry` and `bin/claude-log` into `$BIN_DIR` (default `~/.local/bin`).
Make sure that directory is on your `$PATH`.

Requirements:
- Python 3.9+ (ships with macOS / Linux)
- A reasonably modern browser (Chrome, Safari, Firefox)

## Usage

### Capture a session

```bash
claude-log                       # wraps `claude`, dumps raw bodies to ./.claude-otel/<timestamp>/
CLAUDE_LOG_ROOT=~/logs claude-log # custom root
CLAUDE_LOG_EVENTS=1 claude-log    # also stream OTel events to stderr
```

`claude-log` is a thin wrapper that exports the right env vars and execs `claude`. All flags pass through.

### Browse a session

```bash
scry                     # serve $PWD/.claude-otel on http://127.0.0.1:47821
scry ~/logs              # custom root
scry --port 8000         # custom port
scry --no-open           # don't open browser (useful over ssh)
```

A browser tab opens to a session list. Click into one to see the full transcript. New turns from a running `claude-log` session show up live (SSE polls the directory once per second).

## Data layout

`scry` expects:

```
<root>/
  <session-name>/
    <uuid>.request.json          ← full Messages API request body
    <request_id>.response.json   ← full response body
```

Exactly what `OTEL_LOG_RAW_API_BODIES=file:<dir>` produces.

## Features

- **Markdown rendering** of assistant turns (code fences, headings, lists, links)
- **XML tag parsing** of system reminders / `<EXTREMELY_IMPORTANT>` / `<example>` / etc., grouped and color-coded by category
- **Prior-context block** on each turn, showing exactly which messages were sent in the request
- **Token & cost counters** per turn (Opus / Sonnet / Haiku 4.x pricing approximations)
- **Live updates** via Server-Sent Events while a Claude session is running
- **Path-traversal-safe** static file API
- **Zero external dependencies** — Python stdlib only, single 300-line script

## Architecture

```
┌────────────────────┐         ┌──────────────────────┐
│ claude-log         │  writes │ .claude-otel/<ts>/    │
│ (bash wrapper)     │────────▶│   *.request.json      │
│ → exec claude      │         │   *.response.json     │
└────────────────────┘         └──────────────────────┘
                                          │ reads
                                          ▼
                              ┌──────────────────────┐
                              │ scry (Python http)   │
                              │  /api/sessions       │
                              │  /api/.../files      │
                              │  /api/.../file/{n}   │
                              │  /api/.../events SSE │
                              │  /          → HTML   │
                              └──────────────────────┘
                                          │
                                          ▼
                              ┌──────────────────────┐
                              │ viewer.html          │
                              │ (single-file SPA)    │
                              └──────────────────────┘
```

## Roadmap

- [ ] Node wrapper for `npm publish` (current bin is Python)
- [ ] Search across turns
- [ ] Diff view between adjacent prior-context snapshots
- [ ] Export turn as standalone markdown / Anthropic API replay request
- [ ] Windows support

## License

MIT — see `LICENSE`.
