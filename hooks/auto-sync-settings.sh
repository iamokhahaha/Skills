#!/bin/bash
# Auto-sync ~/.claude/ settings to GitHub on conversation end (Stop hook)
# Pulls latest changes first, then commits and pushes any local changes.

cd ~/.claude || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Pull latest (fast-forward only, ignore errors)
git pull --ff-only origin main 2>/dev/null || true

# If there are local changes, commit and push
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "auto-sync $(date +%Y-%m-%d\ %H:%M)" --no-gpg-sign 2>/dev/null
  git push origin main 2>/dev/null &
fi

exit 0
