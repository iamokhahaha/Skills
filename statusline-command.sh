#!/usr/bin/env bash
# Claude Code status line script
# Displays: model | directory | git branch | context usage

input=$(cat)

# --- Extract fields ---
model=$(echo "$input" | jq -r '.model.display_name // "Claude"')
cwd=$(echo "$input" | jq -r '.workspace.current_dir // ""')
dir_name=$(basename "$cwd")
used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
session_name=$(echo "$input" | jq -r '.session_name // empty')
vim_mode=$(echo "$input" | jq -r '.vim.mode // empty')

# --- ANSI colors (these work fine in a script file) ---
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

# Foreground colors
CYAN='\033[38;5;87m'
BLUE='\033[38;5;75m'
GREEN='\033[38;5;114m'
YELLOW='\033[38;5;221m'
RED='\033[38;5;203m'
MAGENTA='\033[38;5;213m'
ORANGE='\033[38;5;215m'
WHITE='\033[38;5;255m'
GRAY='\033[38;5;245m'

# --- Separator ---
SEP=" ${GRAY}|${RESET} "

# --- Model segment ---
# Shorten model name: "Claude 3.5 Sonnet" -> "3.5 Sonnet"
short_model=$(echo "$model" | sed 's/^Claude //')
model_seg="${CYAN}${BOLD}✦ ${short_model}${RESET}"

# --- Directory segment ---
dir_seg="${BLUE}${BOLD}  ${dir_name}${RESET}"

# --- Git segment ---
git_seg=""
if [ -n "$cwd" ] && [ -d "$cwd/.git" ]; then
    branch=$(git -C "$cwd" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null)
    if [ -n "$branch" ]; then
        # Check for uncommitted changes
        if git -C "$cwd" --no-optional-locks diff-index --quiet HEAD -- 2>/dev/null; then
            # Check for untracked files
            if [ -n "$(git -C "$cwd" --no-optional-locks ls-files --others --exclude-standard 2>/dev/null)" ]; then
                git_seg="${YELLOW}${BOLD} ${branch} ?${RESET}"
            else
                git_seg="${GREEN}${BOLD} ${branch}${RESET}"
            fi
        else
            git_seg="${ORANGE}${BOLD} ${branch} *${RESET}"
        fi
    fi
fi

# --- Context segment ---
ctx_seg=""
if [ -n "$used" ]; then
    used_int=${used%.*}
    used_int=${used_int:-0}
    bar_total=10
    filled=$(( used_int * bar_total / 100 ))
    empty=$(( bar_total - filled ))
    bar=""
    for i in $(seq 1 $filled); do bar="${bar}█"; done
    for i in $(seq 1 $empty); do bar="${bar}░"; done

    if [ "$used_int" -ge 80 ] 2>/dev/null; then
        ctx_color="$RED"
    elif [ "$used_int" -ge 50 ] 2>/dev/null; then
        ctx_color="$YELLOW"
    else
        ctx_color="$GREEN"
    fi
    ctx_seg="${ctx_color}${BOLD}▸ ${bar} ${used_int}%${RESET}"
fi

# --- Vim mode segment (optional) ---
vim_seg=""
if [ -n "$vim_mode" ]; then
    if [ "$vim_mode" = "NORMAL" ]; then
        vim_seg="${MAGENTA}${BOLD}[N]${RESET}"
    else
        vim_seg="${CYAN}${BOLD}[I]${RESET}"
    fi
fi

# --- Assemble the line ---
line="${model_seg}${SEP}${dir_seg}"

if [ -n "$git_seg" ]; then
    line="${line}${SEP}${git_seg}"
fi

if [ -n "$ctx_seg" ]; then
    line="${line}${SEP}${ctx_seg}"
fi

if [ -n "$vim_seg" ]; then
    line="${line}${SEP}${vim_seg}"
fi

printf "%b\n" "$line"
