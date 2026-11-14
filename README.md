# Roho's skills

[![skills.sh](https://skills.sh/b/Roho7/skills)](https://skills.sh/Roho7/skills)

Agent skills I use every day, in the [Agent Skills](https://agentskills.io) format. They work in Claude Code, Cursor, Codex and any agent that reads `SKILL.md` files.

## Install

**Any agent** (copies editable files into your project; add `-g` for every project):

```bash
npx skills@latest add Roho7/skills                       # pick from the list
npx skills@latest add Roho7/skills --skill visual-verification
```

Update later with `npx skills@latest update`.

**Claude Code plugin** (one bundle, updates with the repo):

```bash
claude plugin marketplace add Roho7/skills
claude plugin install roho-skills@roho      # engineering + productivity
claude plugin install rohostack@roho        # rohostack skills and subagents
```

Some skills ship scripts with their own setup (for example `npm install` for `visual-verification`). Each one says so in its `SKILL.md` and `compatibility` field.

## Skills

<!-- skills:start -->

### Engineering

Daily code work: checking UIs, recording demos, working through review.

- **[ask-my-opinion](./skills/engineering/ask-my-opinion/SKILL.md)**: After agent work or a PR, interview you on every non-obvious autonomous decision until you agree on each one. User-invoked.
- **[record-demo](./skills/engineering/record-demo/SKILL.md)**: Record a short screen-recording video of a feature you just implemented, by driving the running app in a real browser.
- **[review-comments](./skills/engineering/review-comments/SKILL.md)**: Walk through a PR's unresolved review comments one at a time — brief, score, and fix each with the user's sign-off before moving on. User-invoked.
- **[visual-verification](./skills/engineering/visual-verification/SKILL.md)**: Drive a real Chrome to check UI changes, with legible screenshots, accessibility snapshots, GIF demos and PR image upload through the `shot` CLI.

### Productivity

How the agent talks and how you learn.

- **[chapterize](./skills/productivity/chapterize/SKILL.md)**: Turn a concept you want to learn into a researched book chapter — theory, exercises, a builder's guide, and sources. User-invoked.
- **[rapid-fire](./skills/productivity/rapid-fire/SKILL.md)**: Enter rapid-fire mode - answer every question in under 20 words until the user ends it. User-invoked.
- **[shh](./skills/productivity/shh/SKILL.md)**: A super quiet way of speaking where one can only utter 3 short sentences. User-invoked.

### rohostack

My fork of [pstack](https://github.com/cursor/plugins/tree/main/pstack): `/roho-mode` runs playbooks for bugs, features, perf, reviews and PRs, with principle skills it cites. Start with `/roho-help`.

- **[architect](./skills/rohostack/architect/SKILL.md)**: Sketch types, signatures, and module structure before code, then stay in the loop while implementation fills in. User-invoked.
- **[arena](./skills/rohostack/arena/SKILL.md)**: Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. User-invoked.
- **[automate-me](./skills/rohostack/automate-me/SKILL.md)**: Use for \"automate me\", \"create/update/refresh my -mode skill\", \"turn/capture my preferences or working style into a skill\", or wanting agents to follow how the user works. User-invoked.
- **[benchmark-checklist](./skills/rohostack/benchmark-checklist/SKILL.md)**: Vet a perf measurement (limiter, tuning, limits, errors, repeatability, relevance, and whether the work happened) before you report or act on it. User-invoked.
- **[blast-radius](./skills/rohostack/blast-radius/SKILL.md)**: Find what a change could break somewhere else before it ships, beyond the diff, and prove the one fact it's safe because of by running real code instead of writing it up. User-invoked.
- **[bro](./skills/rohostack/bro/SKILL.md)**: Restate the last message in plain human language, with no jargon. User-invoked.
- **[correct](./skills/rohostack/correct/SKILL.md)**: Find the mistakes agents keep repeating in this repo and make each one impossible. User-invoked.
- **[create-formal-verification-skill](./skills/rohostack/create-formal-verification-skill/SKILL.md)**: Generate a project-local skill that formally verifies the code where a bug costs the most and tests reach the least, in any language, with whichever verification tool fits. User-invoked.
- **[create-verification-skill](./skills/rohostack/create-verification-skill/SKILL.md)**: Generate a project-local verification skill that drives your app the way a user does — any language, framework, or platform. User-invoked.
- **[figure-it-out](./skills/rohostack/figure-it-out/SKILL.md)**: Design an auditable playbook when no narrower one fits: a large migration, an ambitious multi-part change, or work a human reviews after stepping away. User-invoked.
- **[how](./skills/rohostack/how/SKILL.md)**: Use for \"how does X work\", code walkthroughs before changing something, and placement / ownership / layering questions (\"where should this live\", \"which package owns this\", \"is this the right layer\"). User-invoked.
- **[in-your-own-words](./skills/rohostack/in-your-own-words/SKILL.md)**: Restate in your own words what you think the user's goals are and what problem they're trying to solve. User-invoked.
- **[interrogate](./skills/rohostack/interrogate/SKILL.md)**: Use for \"interrogate\", \"adversarial review\", \"multi-model review\", \"challenge this\", \"stress test this code\", \"find blind spots\", or \"tear this apart\". User-invoked.
- **[ketchup](./skills/rohostack/ketchup/SKILL.md)**: Catch the user up on what changed in this chat since their last message, in plain words and small visuals. User-invoked.
- **[ketchup-video](./skills/rohostack/ketchup-video/SKILL.md)**: Catch the user up like /ketchup, with a short subtitled video of slides for what happened and the waiting calls as text under it. User-invoked.
- **[maintain-formal-verification-skill](./skills/rohostack/maintain-formal-verification-skill/SKILL.md)**: Bring a project's formal verification back in line with the code after the code changes: find the commits that touched verified code, update the model, harness, or properties to describe the code as it is now, rerun, and say whether each failure is drift in the verification or a bug in the code. User-invoked.
- **[maintain-verification-skill](./skills/rohostack/maintain-verification-skill/SKILL.md)**: Periodic pass that keeps a project's verification skill and feature map honest: parallel source readers per feature, one live session driving every feature, at most one PR of proven corrections. User-invoked.
- **[make-bot-ui](./skills/rohostack/make-bot-ui/SKILL.md)**: Use when building a custom UI (page, dashboard, buttons) that should wake a Grok Bot over a webhook, when the user must provide a webhook sender key, or when exposing that UI on Tailscale. User-invoked.
- **[no-comments](./skills/rohostack/no-comments/SKILL.md)**: Spawn Comment Sicko, fix accepted findings, and offer encodings for claimed constraints. User-invoked.
- **[principle-attack-the-premise](./skills/rohostack/principle-attack-the-premise/SKILL.md)**: Apply when two or more fixes that share one premise have failed the same gate. User-invoked.
- **[principle-boundary-discipline](./skills/rohostack/principle-boundary-discipline/SKILL.md)**: Apply when wiring validation, error handling, or framework adapters. User-invoked.
- **[principle-build-the-lever](./skills/rohostack/principle-build-the-lever/SKILL.md)**: Apply to any non-trivial work, not just bulk work: edits, migrations, analyses, checks. User-invoked.
- **[principle-encode-lessons-in-structure](./skills/rohostack/principle-encode-lessons-in-structure/SKILL.md)**: Apply when you catch yourself writing the same instruction a second time, or notice a recurring correction. User-invoked.
- **[principle-exhaust-the-design-space](./skills/rohostack/principle-exhaust-the-design-space/SKILL.md)**: Apply when facing a novel UI interaction or architectural decision with no precedent in the codebase. User-invoked.
- **[principle-experience-first](./skills/rohostack/principle-experience-first/SKILL.md)**: Apply when product, UX, or feature-scope tradeoffs come up. User-invoked.
- **[principle-explain-the-number](./skills/rohostack/principle-explain-the-number/SKILL.md)**: Apply before you measure, and before you trust, report, or act on a number you measured: a speedup, a regression, a throughput, a latency, or an eval result. User-invoked.
- **[principle-fix-root-causes](./skills/rohostack/principle-fix-root-causes/SKILL.md)**: Apply when debugging. User-invoked.
- **[principle-foundational-thinking](./skills/rohostack/principle-foundational-thinking/SKILL.md)**: Apply before writing logic: choosing core types and data structures, sequencing scaffold-vs-feature work, asking what concurrent actors share. User-invoked.
- **[principle-guard-the-context-window](./skills/rohostack/principle-guard-the-context-window/SKILL.md)**: Apply when context is filling up: large outputs, long files, repeated reads, fan-out planning. User-invoked.
- **[principle-laziness-protocol](./skills/rohostack/principle-laziness-protocol/SKILL.md)**: Apply when refactoring, evaluating diff size, or tempted to add abstractions, layers, or signal threading. User-invoked.
- **[principle-make-operations-idempotent](./skills/rohostack/principle-make-operations-idempotent/SKILL.md)**: Apply when designing commands, lifecycle steps, or processing loops that run amid crashes, restarts, and retries. User-invoked.
- **[principle-migrate-callers-then-delete-legacy-apis](./skills/rohostack/principle-migrate-callers-then-delete-legacy-apis/SKILL.md)**: Apply when introducing a new internal API while old callers still exist. User-invoked.
- **[principle-minimize-reader-load](./skills/rohostack/principle-minimize-reader-load/SKILL.md)**: Apply when reviewing or shaping code that's hard to trace. User-invoked.
- **[principle-model-the-domain](./skills/rohostack/principle-model-the-domain/SKILL.md)**: Apply when writing stateful logic, or when code branches a lot or repeats a shape assumption across files. User-invoked.
- **[principle-never-block-on-the-human](./skills/rohostack/principle-never-block-on-the-human/SKILL.md)**: Apply when tempted to ask 'should I do X?' on reversible work. User-invoked.
- **[principle-outcome-oriented-execution](./skills/rohostack/principle-outcome-oriented-execution/SKILL.md)**: Apply during planned rewrites and migrations with explicit phase boundaries. User-invoked.
- **[principle-prove-it-works](./skills/rohostack/principle-prove-it-works/SKILL.md)**: Apply after completing a task, before declaring done. User-invoked.
- **[principle-redesign-from-first-principles](./skills/rohostack/principle-redesign-from-first-principles/SKILL.md)**: Apply when integrating a new requirement into an existing design. User-invoked.
- **[principle-separate-before-serializing-shared-state](./skills/rohostack/principle-separate-before-serializing-shared-state/SKILL.md)**: Apply when concurrent actors might write to the same file, branch, key, or state object. User-invoked.
- **[principle-sequence-verifiable-units](./skills/rohostack/principle-sequence-verifiable-units/SKILL.md)**: Apply to multi-step work (sweeps, migrations, runs of similar edits) and to how you stack commits and PRs. User-invoked.
- **[principle-subtract-before-you-add](./skills/rohostack/principle-subtract-before-you-add/SKILL.md)**: Apply when sequencing an addition, refactor, or rewrite. User-invoked.
- **[principle-test-behavior-not-implementation](./skills/rohostack/principle-test-behavior-not-implementation/SKILL.md)**: Apply when you write, change, or keep a test. User-invoked.
- **[principle-type-system-discipline](./skills/rohostack/principle-type-system-discipline/SKILL.md)**: Apply when designing types, reviewing a function signature, or writing code in any statically-typed language. User-invoked.
- **[recall](./skills/rohostack/recall/SKILL.md)**: Reconstruct your recent working context from your own chat history, live state, and the shared record (user reports, prior fixes, incidents), then hand back a tight current-state brief. User-invoked.
- **[reflect](./skills/rohostack/reflect/SKILL.md)**: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. User-invoked.
- **[roho-help](./skills/rohostack/roho-help/SKILL.md)**: Guides users through rohostack setup, /roho-mode, and picking the skill, playbook, or principle for a task. User-invoked.
- **[roho-mode](./skills/rohostack/roho-mode/SKILL.md)**: roho's agent style for concise, detailed responses, deliberate subagents, unslopped prose, simple code, and verified work. User-invoked.
- **[rohostack-teach](./skills/rohostack/rohostack-teach/SKILL.md)**: Explain a body of work plainly so a person actually understands it. User-invoked.
- **[setup-rohostack](./skills/rohostack/setup-rohostack/SKILL.md)**: Configure which models rohostack uses per role and at what reasoning budget.
- **[sharpen](./skills/rohostack/sharpen/SKILL.md)**: Make a task deeper, not bigger, then rewrite the prompt. User-invoked.
- **[show-me-your-work](./skills/rohostack/show-me-your-work/SKILL.md)**: Keep a reviewable decision trail for long-running or unattended work: a TSV log with one row per decision (what, why, evidence, result). User-invoked.
- **[statechart](./skills/rohostack/statechart/SKILL.md)**: Check a TLA+ model of a system that moves between states, such as a product flow, a protocol, or a service, and draw it as a Mermaid statechart. User-invoked.
- **[swarm](./skills/rohostack/swarm/SKILL.md)**: Fan out N parallel workers, drain them, and return one report. User-invoked.
- **[tdd](./skills/rohostack/tdd/SKILL.md)**: Use only when the user explicitly asks for TDD, a failing test, or a regression test, OR when the bug has an obvious cheap local test target. User-invoked.
- **[technical-writing](./skills/rohostack/technical-writing/SKILL.md)**: Layered technical-writing standard: Diátaxis structure, Google developer style sentences, STE instruction rules, Global English syntax. User-invoked.
- **[typescript-best-practices](./skills/rohostack/typescript-best-practices/SKILL.md)**: TypeScript best practices. User-invoked.
- **[unslop](./skills/rohostack/unslop/SKILL.md)**: Cut AI tells from any writing. User-invoked.
- **[why](./skills/rohostack/why/SKILL.md)**: Use for 'why does X work this way', 'why we picked Y', design rationale, regressions, postmortems, or data-backed thresholds. User-invoked.

<!-- skills:end -->

## License

MIT. rohostack is a fork of [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan, also MIT. Its notice is in [`skills/rohostack/LICENSE`](./skills/rohostack/LICENSE).
