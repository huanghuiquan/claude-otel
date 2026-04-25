# claude-otel

Local viewer for [Claude Code](https://github.com/anthropics/claude-code)'s OpenTelemetry raw API bodies.

Browse what your `claude` CLI actually sends and receives — full system prompts, tool calls, message history, token usage — in a calm, paginated UI.

> [!NOTE]
> **alpha** · macOS / Linux · single Node.js CLI, zero npm dependencies.

## Why

Claude Code v2.x ships as a native binary, which broke older interceptors like `claude-trace`. Anthropic's own answer is to dump full request/response JSONs via OpenTelemetry:

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_LOG_RAW_API_BODIES=file:./.claude-otel/$(date +%F-%H%M%S)
claude
```

`claude-otel` automates that capture and renders the resulting JSONs as a real conversation — markdown, tool calls, prior context, raw inspection — served locally with live updates over SSE.

## Install

```bash
# from npm (after publish)
npm install -g claude-otel

# from source
git clone https://github.com/USER/claude-otel ~/dev/claude-otel
cd ~/dev/claude-otel
./install.sh
```

The installer symlinks `bin/claude-otel.mjs` to `$BIN_DIR/claude-otel` (default `~/.local/bin`). Make sure that directory is on your `$PATH`.

Requirements: **Node.js ≥ 18** + a modern browser. Zero npm dependencies.

## Usage

```bash
claude-otel record              # wrap `claude`, dump raw bodies to ./.claude-otel/<timestamp>/
claude-otel record -p "hello"   # one-shot capture
claude-otel record --events     # also stream OTel events to stderr

claude-otel                     # serve ./.claude-otel on http://127.0.0.1:47821
claude-otel ~/logs              # serve a custom root
claude-otel --port 8000         # custom port
claude-otel --no-open           # don't open browser (useful over ssh)

claude-otel --help              # full help
```

A browser tab opens to a session list. Click into one to see the full transcript. New turns from a running `claude-otel record` show up live (SSE polls the directory once per second).

## Commands

| | what it does |
|---|---|
| `claude-otel` (or `claude-otel view`) | starts the local web viewer |
| `claude-otel record [-- claude-args]` | execs `claude` with OTel raw-body logging enabled; all args after `record` are passed through |

## Data layout

`claude-otel` expects:

```
<root>/
  <session-name>/
    <uuid>.request.json          ← full Messages API request body
    <request_id>.response.json   ← full response body
```

Exactly what `OTEL_LOG_RAW_API_BODIES=file:<dir>` produces.

## Features

- **Markdown rendering** of assistant turns (code fences, headings, lists, links)
- **XML tag parsing** for system reminders / `<EXTREMELY_IMPORTANT>` / `<example>` / etc., grouped and color-coded
- **Prior-context block** on each turn — see exactly which messages were sent in the request
- **Token & cost counters** per turn (Opus / Sonnet / Haiku 4.x pricing approximations)
- **Live updates** via Server-Sent Events while a session is running
- **Path-traversal-safe** static file API
- **Zero deps** — Node stdlib only, single ~330-line script

## Architecture

```
┌────────────────────────┐  writes   ┌──────────────────────┐
│ claude-otel record     │──────────▶│ .claude-otel/<ts>/    │
│ (spawns `claude` with   │           │   *.request.json      │
│  OTEL_LOG_RAW_API_…)    │           │   *.response.json     │
└────────────────────────┘           └──────────────────────┘
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

## Roadmap

- [ ] Search across turns
- [ ] Diff view between adjacent prior-context snapshots
- [ ] Export turn as standalone markdown / replayable API request
- [ ] Windows support

## License

MIT — see `LICENSE`.
