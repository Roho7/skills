### Opening a PR

Invoked at the end of every other playbook.

Work from a git worktree off trunk, and keep unrelated work out of it. Rebase into small, landable commits. Run `/deslop` from `cursor-team-kit` over the diff before commit.

Title: `type(scope): subject`, naming a real symbol when one carries the change. Write the PR description using the `pr` skill's structure.

Stack follow-ups by base branch. Open PRs ready, through the run's PR tool with `draft: false`. Without one, use `gh pr create` without `--draft`, or `origin pr create --status open` when Origin's CLI resolves the repository. The one exception is a fix whose bug you never reproduced, which `playbooks/bug-fix.md` opens as a draft. Opening a PR does not start a babysit.
