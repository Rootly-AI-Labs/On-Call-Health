#!/usr/bin/env bash
# Install local git hooks for this repository.
# Run once after cloning: bash scripts/setup_hooks.sh
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
PRE_PUSH="$REPO_ROOT/.git/hooks/pre-push"

cat > "$PRE_PUSH" << 'HOOK'
#!/usr/bin/env bash
set -euo pipefail
REPO="$(git rev-parse --show-toplevel)"
if ! command -v python3 &>/dev/null; then
    echo "WARNING: python3 not found -- skipping migration check."
    exit 0
fi
echo "Checking migration consistency..."
python3 "$REPO/backend/migrations/check_migrations.py"
HOOK

chmod +x "$PRE_PUSH"
echo "Pre-push hook installed at $PRE_PUSH"
echo "It will run backend/migrations/check_migrations.py before every git push."
