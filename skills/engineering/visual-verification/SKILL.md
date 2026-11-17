---
name: visual-verification
description: Drive a real Chrome to check UI changes, with legible screenshots, accessibility snapshots, mocked API responses, request logs, GIF demos and PR image upload through the `shot` CLI, plus the iOS Simulator path for Safari bugs. Use after changing a UI, and whenever taking screenshots, recording a GIF demo, or adding images to a PR.
license: MIT
compatibility: Requires Node 22+, Google Chrome or Chromium, ffmpeg, and git; gh for pr-image. macOS and Linux. Needs network once for npm install.
---

`shot` drives a persistent Chrome (one tab per git worktree), takes screenshots shrunk to the smallest size their text stays legible at, records GIF demos, and publishes images for PRs. Every command prints one JSON object (with `next`) and exits non-zero on failure. `shot <command> --help` has the details.

If the repo has Playwright, Cypress or Storybook tests near the change, run them first, and add a case when the change is testable there. They are the regression gate. `shot` supplies the evidence (snapshots, screenshots, GIFs, PR images) and covers flows the suite doesn't. Don't add a browser test dependency to the project for a one-off probe.

## Setup

`<skill-dir>` below is the folder holding this `SKILL.md`. `shot` means `node <skill-dir>/shot.mjs`.

1. Once per install: `npm --prefix <skill-dir> install` (pulls playwright-core).
2. `node <skill-dir>/shot.mjs doctor` checks Node 20+, playwright-core, Chrome, ffmpeg/ffprobe, the profile and the config source. Each failed check carries its `fix`.
3. Optional: `ln -s <skill-dir>/shot.mjs ~/.local/bin/shot` to type `shot` directly (`~/.local/bin` must be on `PATH`).
4. Start the app with the repo's documented dev command in the background. In a worktree, give it a free port and set `SHOT_BASE_URL` to that port, so two checkouts never share a server. A remote or production API may allow CORS from one port only. On another port, run the API locally too, or the page's API calls fail. Stop the server when done.

## Commands

| Command | Use |
| --- | --- |
| `shot open <path\|url> [--mobile \| --viewport WxH] [--dark \| --light] [--reduced-motion]` | Navigate; reports console errors and failed requests. Viewport, color scheme and reduced motion stick until the next `open`. |
| `shot snapshot [--selector main]` | Accessibility tree: assert text and structure with it, not screenshots. |
| `shot click "<name>" [--nth N] [--selector css]` | Click a button or link; refuses names matching `refuseClicks`. |
| `shot type "<field>" "<text>" [--clear] [--selector css]` | Type into a field key by key. `ok:false` when the field loses focus, because the keys then went elsewhere. |
| `shot press <Key> [--times N]` | Press Tab, Shift+Tab, Escape, Enter or arrows; reports which element has focus after. Enter is refused when it would trigger a `refuseClicks` control. |
| `shot scroll --by <px> \| --to "<text>" \| --selector css` | Scroll with wheel events, or bring an element into view. Returns after the scroll ends and paints, with the `scroller` that moved, its `scrollY`, and `inView`. |
| `shot expect "<text>" [--role r] [--gone] [--timeout 10]` | Wait for text or a named role to appear or disappear; `ok:false` on timeout. |
| `shot network [--filter t] [--failed] [--all]` | Requests sent while `shot` commands ran since the last `open`: method, URL, status, request body. |
| `shot mock "<url glob>" --body '<json>' [--status N]` | Answer matching GET requests with a fixed response until `shot mock clear`. Other methods reach the server. |
| `shot screenshot [file.png] [--full]` | Legible PNG (stays small; `--full-res` only when a human asks). |
| `shot browser start\|stop\|login\|whoami\|reset` | `stop` closes only this worktree's tab. `login` opens a window for a human to sign in; agents never type credentials. |
| `shot record start` / `shot record stop` | GIF demo of a flow: drive it between the two. Writes `demo.gif` and `keyframes.png` (6 frames). |
| `shot pr-image <file>… [--pr N] [--title t]` | Push images to the `agent-screenshots` branch (any repo with a GitHub origin); prints markdown. Anyone who can read the repo can see them, so in a public repo they are public. |

Every command that loads or drives the page (`open`, `click`, `type`, `press`, `scroll`) reports the `consoleErrors` and `failedRequests` seen during that action, and the URLs it `mocked`. An uncaught page exception makes it `ok:false`.

`shot` sees the page only while a command runs. Requests the page sends between commands are missing from `shot network`, and mocks don't answer them.

## Prove a UI change

1. Name the observable change first, such as the text, role, URL or dialog that should differ.
2. For a bug fix, reproduce it on the base first. Run the same `shot` steps in a worktree at the merge base (`git worktree add <dir> <merge-base>`) with the same viewport. Save `before.png` and the `snapshot` output.
3. On head, run `shot open`, `shot snapshot`, one action, then `shot snapshot` again. Check the named change in the snapshot, not in the PNG. Use `shot expect` when the UI settles asynchronously.
4. Any `consoleErrors` or `failedRequests` fail the check unless the base shows the same ones.
5. Save `after.png` and put both images in the PR with `shot pr-image before.png after.png`.

## States the backend can't produce on demand

Empty lists, error banners and long names are hard to reach with real data. Mock the GET that feeds the view, then open it:

```bash
shot mock "**/api/orders*" --body '{"orders":[]}'
shot open /orders
shot expect "No orders yet"
shot mock clear
```

`--status 500` renders the error path. After a click, `shot network --filter /api/` shows the request it sent and its body.

## iOS Safari

`shot` drives Chrome only. Reproduce a bug reported on iPhone or Safari in the iOS Simulator, because Chrome's layout and scrolling differ from WebKit's.

1. In T3 Code, call `device_list`, then `device_open` with the simulator's `hostId` and `id`. It boots the simulator, shows it in the Device panel, and returns an `agent-device` command pinned to that device.
2. Open the page in Safari with that command: `<command> open http://localhost:<port>/<path> --platform ios`. The simulator shares the Mac's network, so `localhost` reaches the dev server.
3. Use `<command> snapshot -i` for the accessibility tree, `<command> press @e2` and `<command> fill @e7 "text"` to drive it, and `<command> screenshot <file>.png` for evidence. `device_screenshot` shows you the screen. `<command> help <command>` lists the options.
4. Tap, type and screenshot only through that command. `xcrun simctl` stays fine for installs and logs.

When `device_list` shows no iOS device, the Mac has no simulator runtime. `xcodebuild -downloadPlatform iOS` installs one. Without device tools or a runtime, the bug stays unreproduced, and the fix ships as an unverified draft.

## Screenshot and GIF for a PR

1. `shot open <path>`, then `shot screenshot <file>.png`; Read it.
2. For a UI flow: `shot record start`, drive with `shot open` / `shot click`, `shot record stop`. Read `keyframes.png` and confirm the flow shows before attaching.
3. `shot pr-image <file>` and paste the markdown into the PR body, or add `--pr <number>`.

## `.shot.json` (repo root, optional)

Config = defaults, then `.shot.json`, then env. State lives in `<git dir>/shot` (per worktree, never committed).

| Key | Default | Env |
| --- | --- | --- |
| `baseUrl` | `http://localhost:3000` | `SHOT_BASE_URL` |
| `cdpPort` | `9333` | `SHOT_CDP_PORT` |
| `profile` | `~/.shot/profiles/<main worktree name>` | `SHOT_PROFILE` |
| `auth` | unset: `{ checkPath, loginPath, cookie }` (cookie is a regex) enables `whoami`, `login`, and keeping sign-in on `reset` | |
| `refuseClicks` | `place\|pay\|order\|submit\|…\|checkout\|buy` (regex) | |

Chrome allows one instance per profile: when another worktree's Chrome holds it, `shot` adopts that Chrome's port (unless `SHOT_CDP_PORT` is set). Isolate with `SHOT_PROFILE=<empty dir> SHOT_CDP_PORT=<free port>`.
