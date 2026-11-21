#!/usr/bin/env bash
# Bootstrap a Cursor cloud VM with the Mac skills, subagents, and rohostack rules.
# Clones Roho7/skills and Roho7/skills-library, or fast-forwards them to origin/main.
# Idempotent: a diverged checkout fails; local commits and uncommitted work stay put.
set -euo pipefail

SKILLS_ROOT=${SKILLS_ROOT:-"$HOME/Documents/MAIN/CODE/skills"}
SKILLS_ROOT=${SKILLS_ROOT%/}
SKILLS_URL=https://github.com/Roho7/skills
LIBRARY_URL=https://github.com/Roho7/skills-library

export GIT_TERMINAL_PROMPT=0

command -v git >/dev/null 2>&1 || { echo "error: git is not on PATH" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "error: node is not on PATH" >&2; exit 1; }

count_entries() {
  local dir=$1
  if [[ ! -d "$dir" ]]; then
    echo 0
    return
  fi
  find -- "$dir" -mindepth 1 -maxdepth 1 -print | wc -l | tr -d ' '
}

sync_repo() {
  local dir=$1
  local url=$2
  local any top dir_real head origin branch main_sha

  if [[ ! -e "$dir" ]]; then
    mkdir -p -- "$(dirname -- "$dir")"
    echo "cloning $url into $dir"
    git clone --branch main -- "$url" "$dir"
    return
  fi

  if [[ -d "$dir" && ! -L "$dir" ]]; then
    any=$(find -- "$dir" -mindepth 1 -maxdepth 1 -print -quit)
    if [[ -z "$any" ]]; then
      echo "cloning $url into $dir"
      git clone --branch main -- "$url" "$dir"
      return
    fi
  fi

  if ! git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "error: $dir exists but is not a git checkout" >&2
    exit 1
  fi

  top=$(git -C "$dir" rev-parse --show-toplevel)
  dir_real=$(cd -- "$dir" && pwd -P)
  top=$(cd -- "$top" && pwd -P)
  if [[ "$top" != "$dir_real" ]]; then
    echo "error: $dir is not the top of its git checkout ($top)" >&2
    exit 1
  fi

  if ! git -C "$dir" remote get-url origin >/dev/null 2>&1; then
    echo "error: $dir has no origin remote" >&2
    exit 1
  fi

  git -C "$dir" fetch origin main

  head=$(git -C "$dir" rev-parse HEAD)
  origin=$(git -C "$dir" rev-parse origin/main)
  if [[ "$head" == "$origin" ]]; then
    echo "up to date: $dir"
    return
  fi
  if ! git -C "$dir" merge-base --is-ancestor "$head" "$origin"; then
    echo "error: $dir has diverged from origin/main (HEAD ${head:0:12}, origin/main ${origin:0:12}). Refusing to reset or discard local commits." >&2
    exit 1
  fi

  branch=$(git -C "$dir" symbolic-ref --short -q HEAD || true)
  if [[ "$branch" != "main" ]]; then
    if git -C "$dir" show-ref --verify --quiet refs/heads/main; then
      main_sha=$(git -C "$dir" rev-parse refs/heads/main)
      if ! git -C "$dir" merge-base --is-ancestor "$main_sha" "$origin"; then
        echo "error: $dir branch main has diverged from origin/main (main ${main_sha:0:12}, origin/main ${origin:0:12}). Refusing to reset or discard local commits." >&2
        exit 1
      fi
      git -C "$dir" checkout main
    else
      git -C "$dir" checkout -b main
    fi
  fi

  echo "fast-forward: $dir to origin/main"
  git -C "$dir" merge --ff-only origin/main
}

ensure_cursor_skills() {
  local agents_skills="$HOME/.agents/skills"
  local cursor_skills="$HOME/.cursor/skills"
  local target resolved agents_resolved any

  mkdir -p -- "$agents_skills" "$(dirname -- "$cursor_skills")"

  if [[ -L "$cursor_skills" ]]; then
    target=$(readlink -- "$cursor_skills")
    resolved=$(readlink -f -- "$cursor_skills")
    agents_resolved=$(readlink -f -- "$agents_skills")
    if [[ "$target" == "$agents_skills" || "$resolved" == "$agents_resolved" ]]; then
      return
    fi
    echo "error: $cursor_skills is a symlink to $target, not $agents_skills" >&2
    exit 1
  fi

  if [[ -d "$cursor_skills" ]]; then
    any=$(find -- "$cursor_skills" -mindepth 1 -maxdepth 1 -print -quit)
    if [[ -n "$any" ]]; then
      echo "error: $cursor_skills is a non-empty directory. Refusing to replace it with a symlink to $agents_skills." >&2
      exit 1
    fi
    rmdir -- "$cursor_skills"
  elif [[ -e "$cursor_skills" ]]; then
    echo "error: $cursor_skills exists and is not a symlink to $agents_skills" >&2
    exit 1
  fi

  ln -s -- "$agents_skills" "$cursor_skills"
}

print_summary() {
  local dir label
  echo "skills root: $SKILLS_ROOT"
  for dir in \
    "$HOME/.agents/skills" \
    "$HOME/.claude/skills" \
    "$HOME/.claude/agents" \
    "$HOME/.cursor/agents" \
    "$HOME/.cursor/rules" \
    "$HOME/.claude/rules"
  do
    label="~${dir#"$HOME"}"
    echo "$label: $(count_entries "$dir")"
  done
}

sync_repo "$SKILLS_ROOT" "$SKILLS_URL"
sync_repo "$SKILLS_ROOT/library" "$LIBRARY_URL"
ensure_cursor_skills
cd -- "$SKILLS_ROOT/library"
node scripts/build.mjs
node scripts/link.mjs --prune
print_summary
