#!/usr/bin/env bash
# claude-otel · install — symlink CLI into $BIN_DIR (default ~/.local/bin)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"

mkdir -p "$BIN_DIR"

link() {
  local src="$1" dst="$2"
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    printf '  · %s (already linked)\n' "$dst"
    return
  fi
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    local prev
    prev="$(readlink "$dst" 2>/dev/null || echo 'regular file')"
    printf '  · replacing %s (was: %s)\n' "$dst" "$prev"
    rm -f "$dst"
  fi
  ln -s "$src" "$dst"
  printf '  → %s\n' "$dst"
}

echo "claude-otel · linking CLI into $BIN_DIR"
link "$ROOT/bin/claude-otel.mjs" "$BIN_DIR/claude-otel"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    cat <<EOF

! $BIN_DIR is not on \$PATH.
  add this to your shell config (~/.zshrc or ~/.bashrc):

      export PATH="\$HOME/.local/bin:\$PATH"

EOF
    ;;
esac

echo
echo "done. try:"
echo "    claude-otel record -p 'hello'   # capture a one-shot session"
echo "    claude-otel                     # serve the viewer"
