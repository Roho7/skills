# Roho7/skills

This public repo holds only skills Rohosen wrote or changed. Every skill he uses, shared or not, lives in `library/`, a separate private repo (`Roho7/skills-library`) that this repo gitignores.

## Where to edit

- Edit skills in `library/skills/<group>/<name>/`, or through the live paths `~/.agents/skills/<name>` and `~/.claude/skills/<name>`. These link into the library, so both are the same files.
- A graduated skill's library entry is a symlink into `skills/<bucket>/<name>/` here. Editing it edits this repo, and the change is committed here.
- `library/` has its own `README.md` and scripts (`link.mjs`, `build.mjs`, `update-vendor.sh`). Commit library changes in `library/`, never here.

## Graduating a skill

- Graduate only with `node scripts/skills.mjs graduate <name> <bucket>` or `graduate --group <group>`. It lints the skill, moves the folder here, leaves a symlink in the library and regenerates the lists. Then commit in both repos.
- Never copy a third-party skill here unchanged. People get it from its source. A vendored skill graduates only with `--fork` after real changes, and keeps its upstream `LICENSE`.
- Public skills carry no personal paths, private tools or personal business names. `scripts/skills.mjs` holds the denylist that `check` enforces.

## Generated files

`skills/<bucket>/README.md`, the skill list in `README.md` between the `skills:` markers, and `.claude-plugin/marketplace.json` come from `node scripts/skills.mjs sync`. Don't hand-edit them. CI runs `node scripts/skills.mjs check`. Buckets and plugins are defined in `BUCKETS` and `PLUGINS` at the top of that script.

## Layout

```
skills/<bucket>/<name>/SKILL.md   engineering, productivity, rohostack, in-progress
agents/<group>/<name>.md          subagents shipped with a plugin (rohostack)
.claude-plugin/marketplace.json   marketplace "roho": plugins roho-skills and rohostack
scripts/skills.mjs                check | sync | graduate
library/                          private, gitignored
```
