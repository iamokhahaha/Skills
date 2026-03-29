#!/bin/bash
# Backs up .docx and .md files before Edit/Write operations
# Prevents disasters like full document regeneration

set -e

# Read hook input from stdin
INPUT=$(cat)

# Extract file path from tool input (using python3 instead of jq for macOS compatibility)
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)

# Only backup if file path exists
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Check if it's a .docx or .md file
if [[ "$FILE_PATH" == *.docx ]] || [[ "$FILE_PATH" == *.md ]]; then
  # Only backup if the file already exists (skip new file creation)
  if [ -f "$FILE_PATH" ]; then
    BACKUP_DIR="$HOME/.claude/backups"
    mkdir -p "$BACKUP_DIR"

    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    FILENAME=$(basename "$FILE_PATH")
    BACKUP_FILE="$BACKUP_DIR/${FILENAME}.${TIMESTAMP}.bak"

    cp "$FILE_PATH" "$BACKUP_FILE"
    echo "Backed up: $FILE_PATH -> $BACKUP_FILE" >&2
  fi
fi

exit 0
