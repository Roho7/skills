import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { CHROME_PROFILE_DIR, config, isPortOpen, OpError, pidAlive, readJson, relPath, requireAuth, SKILL_DIR, stateFile, writeJson } from './core.mjs';

export const STATE = () => stateFile('browser.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NETWORK_LOG = () => stateFile('network.jsonl');
export const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const DEFAULT_EMULATION = { ...VIEWPORTS.desktop, colorScheme: null, reducedMotion: null };
const mockHits = [];
export const emulation = () => ({ ...DEFAULT_EMULATION, ...readJson(STATE(), {}).emulation });

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

export function chromeExecutable() {
  return CHROME_CANDIDATES.find((p) => fs.existsSync(p)) ?? null;
}

export async function playwright() {
  try {
    return await import(path.join(SKILL_DIR, 'node_modules/playwright-core/index.mjs'));
  } catch {
    throw new OpError('playwright-core is not installed', `Run: npm --prefix ${relPath(SKILL_DIR)} install`);
  }
}

export function profileHolder() {
  let target;
  try {
    target = fs.readlinkSync(path.join(CHROME_PROFILE_DIR, 'SingletonLock'));
  } catch {
    return null;
  }
  const pid = Number(target.split('-').pop());
  if (!pidAlive(pid)) return null;
  let cdpPort = null;
  try {
    const command = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
    cdpPort = Number(command.match(/--remote-debugging-port=(\d+)/)?.[1]) || null;
  } catch {}
  return { pid, cdpPort };
}

const adoptedPort = process.env.SHOT_CDP_PORT ? null : profileHolder()?.cdpPort;
if (adoptedPort) config.cdpPort = adoptedPort;
export const CDP = `http://127.0.0.1:${config.cdpPort}`;

function profileHeldError(holder) {
  const reuse = holder.cdpPort ? `reuse it with SHOT_CDP_PORT=${holder.cdpPort} (you share its tabs with whoever started it)` : 'stop it';
  return new OpError(
    `Chrome pid ${holder.pid} already holds the profile ${CHROME_PROFILE_DIR}${holder.cdpPort ? ` on DevTools port ${holder.cdpPort}` : ''}`,
    `Chrome allows one instance per profile. Either ${reuse}, or isolate with SHOT_PROFILE=<empty dir> and SHOT_CDP_PORT=<free port> (no saved login there).`,
  );
}

async function waitForCdp(timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${CDP}/json/version`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new OpError('Chrome did not expose the DevTools port in time', `Check whether port ${config.cdpPort} is blocked, then \`shot browser stop\` and retry.`);
}

async function start(flags = {}) {
  if (await isPortOpen(config.cdpPort)) return { status: 'already_running', ...readJson(STATE(), {}) };
  const exe = chromeExecutable();
  if (!exe) throw new OpError('No Chrome/Chromium found', 'Install Google Chrome.');
  const holder = profileHolder();
  if (holder) throw profileHeldError(holder);
  const args = [
    `--remote-debugging-port=${config.cdpPort}`,
    `--user-data-dir=${CHROME_PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--window-size=${VIEWPORTS.desktop.width},${VIEWPORTS.desktop.height}`,
    ...(flags.headed ? [] : ['--headless=new']),
    'about:blank',
  ];
  const child = spawn(exe, args, { detached: true, stdio: 'ignore' });
  child.unref();
  await waitForCdp();
  const entry = { pid: child.pid, headed: !!flags.headed, cdp: CDP, profile: CHROME_PROFILE_DIR, startedAt: new Date().toISOString() };
  writeJson(STATE(), { ...readJson(STATE(), {}), ...entry });
  return { status: 'started', ...entry };
}

export async function tabId(p) {
  const session = await p.context().newCDPSession(p);
  try {
    return (await session.send('Target.getTargetInfo')).targetInfo.targetId;
  } finally {
    await session.detach();
  }
}

// A viewport override lasts only as long as the CDP connection that set it, and every shot command is its own
// process. Between commands the page would reflow at the window size, and a page that re-renders at a JS breakpoint
// loses its scroll position. A detached keeper process holds the override for as long as the tab lives.
async function keepViewport(p, size) {
  const tab = await tabId(p);
  const { keeper } = readJson(STATE(), {});
  if (keeper && pidAlive(keeper.pid) && keeper.tab === tab && keeper.width === size.width && keeper.height === size.height) return;
  if (keeper && pidAlive(keeper.pid)) {
    process.kill(keeper.pid, 'SIGTERM');
    for (let waited = 0; waited < 3000 && pidAlive(keeper.pid); waited += 50) await sleep(50);
  }
  const child = spawn(process.execPath, [path.join(SKILL_DIR, 'lib/keeper.mjs'), JSON.stringify({ url: `${CDP.replace(/^http/, 'ws')}/devtools/page/${tab}`, ...size })], { detached: true, stdio: 'ignore' });
  child.unref();
  writeJson(STATE(), { ...readJson(STATE(), {}), keeper: { pid: child.pid, tab, ...size } });
  for (let waited = 0; waited < 10_000; waited += 100) {
    if (await p.evaluate(([w, h]) => innerWidth === w && innerHeight === h, [size.width, size.height])) return;
    await sleep(100);
  }
  throw new OpError(`The viewport did not change to ${size.width}x${size.height}`, 'Run `shot browser stop` and retry.');
}

async function routeMocks(p) {
  for (const entry of readJson(STATE(), {}).mocks ?? []) {
    await p.route(entry.url, (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      mockHits.push(route.request().url());
      return route.fulfill({ status: entry.status, contentType: entry.contentType, body: entry.body });
    });
  }
}

export async function page() {
  if (!(await isPortOpen(config.cdpPort))) await start();
  const { chromium } = await playwright();
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const { tab } = readJson(STATE(), {});
  let p = null;
  for (const candidate of context.pages()) if ((await tabId(candidate)) === tab) p = candidate;
  if (!p) {
    p = await context.newPage();
    writeJson(STATE(), { ...readJson(STATE(), {}), tab: await tabId(p) });
  }
  const { width, height, colorScheme, reducedMotion } = emulation();
  await keepViewport(p, { width, height });
  await p.emulateMedia({ colorScheme, reducedMotion });
  await routeMocks(p);
  return p;
}

function parseEmulation(flags) {
  let size = flags.mobile ? VIEWPORTS.mobile : VIEWPORTS.desktop;
  if (flags.viewport) {
    const [, w, h] = String(flags.viewport).match(/^(\d+)x(\d+)$/) ?? [];
    if (!w) throw new OpError(`Bad --viewport "${flags.viewport}"`, 'Use WIDTHxHEIGHT in CSS pixels, e.g. --viewport 1280x800.');
    size = { width: Number(w), height: Number(h) };
  }
  const colorScheme = flags.dark ? 'dark' : flags.light ? 'light' : null;
  return { ...size, colorScheme, reducedMotion: flags['reduced-motion'] ? 'reduce' : null };
}

function toUrl(target, flags) {
  if (/^https?:\/\//.test(target)) return target;
  const base = flags.base ?? config.baseUrl;
  return new URL(target.startsWith('/') ? target : `/${target}`, base).toString();
}

const NETWORK_LOG_MAX = 500;

function logEntry(request, extra) {
  const postData = request.postData();
  return { method: request.method(), url: request.url(), type: request.resourceType(), ...extra, ...(postData ? { postData: postData.slice(0, 300) } : {}) };
}

function appendNetworkLog(entries) {
  if (!entries.length) return;
  const kept = [...readNetworkLog(), ...entries].slice(-NETWORK_LOG_MAX);
  fs.writeFileSync(NETWORK_LOG(), kept.map((e) => JSON.stringify(e)).join('\n') + '\n');
}

function readNetworkLog() {
  if (!fs.existsSync(NETWORK_LOG())) return [];
  return fs.readFileSync(NETWORK_LOG(), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function watch(p) {
  const consoleErrors = [];
  const failedRequests = [];
  const requests = [];
  const hitsBefore = mockHits.length;
  let threw = false;
  const listeners = {
    console: (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 300)),
    pageerror: (e) => {
      threw = true;
      consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`);
    },
    requestfailed: (r) => {
      failedRequests.push({ url: r.url(), error: r.failure()?.errorText });
      requests.push(logEntry(r, { status: null, error: r.failure()?.errorText }));
    },
    response: (r) => {
      if (r.status() >= 400) failedRequests.push({ url: r.url(), status: r.status() });
      requests.push(logEntry(r.request(), { status: r.status() }));
    },
  };
  for (const [event, fn] of Object.entries(listeners)) p.on(event, fn);
  return () => {
    for (const [event, fn] of Object.entries(listeners)) p.off(event, fn);
    appendNetworkLog(requests);
    const mocked = mockHits.slice(hitsBefore);
    return {
      ...(threw ? { ok: false, error: 'The page threw during this action (see consoleErrors)' } : {}),
      consoleErrors: consoleErrors.slice(0, 20),
      failedRequests: failedRequests.slice(0, 20),
      ...(mocked.length ? { mocked } : {}),
    };
  };
}

// 150ms without a scroll event also ends the wait, for engines without scrollend. The two frames let the compositor
// paint the final position before a screenshot.
async function scrolledBy(p, act) {
  await p.evaluate(() => {
    window.__shotScroll = new Promise((resolve) => {
      const timers = { quiet: null, noScroll: null, cap: null };
      let target = null;
      const listeners = {
        scroll: (e) => {
          target = e.target;
          clearTimeout(timers.noScroll);
          clearTimeout(timers.quiet);
          timers.quiet = setTimeout(() => listeners.scrollend(), 150);
        },
        scrollend: () => {
          for (const [event, fn] of Object.entries(listeners)) removeEventListener(event, fn, true);
          for (const id of Object.values(timers)) clearTimeout(id);
          resolve(target);
        },
      };
      timers.noScroll = setTimeout(() => listeners.scrollend(), 500);
      timers.cap = setTimeout(() => listeners.scrollend(), 5000);
      for (const [event, fn] of Object.entries(listeners)) addEventListener(event, fn, true);
    });
  });
  await act();
  return p.evaluate(async () => {
    const moved = await window.__shotScroll;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el = !moved || moved === document ? document.scrollingElement : moved;
    const scroller = el === document.scrollingElement ? 'window' : el.id ? `#${el.id}` : el.tagName.toLowerCase() + (el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : '');
    return { scroller, scrollY: Math.round(el.scrollTop), scrollHeight: el.scrollHeight };
  });
}

async function openedPage() {
  const p = await page();
  if (p.url() === 'about:blank') throw new OpError('No page is open', 'Run `shot open <path>` first.');
  return p;
}

async function settle(p, finishWatch) {
  await p.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  const openDialogs = await p.getByRole('dialog').evaluateAll((els) => els.map((el) => (el.getAttribute('aria-label') || el.querySelector('h1,h2,h3')?.textContent || '').trim()).filter(Boolean));
  return { url: p.url(), openDialogs, ...finishWatch(), next: openDialogs.length ? 'shot snapshot --selector "[role=dialog]"' : 'shot snapshot' };
}

async function focused(p) {
  const el = p.locator('*:focus').first();
  if ((await el.count()) === 0) return null;
  const line = (await el.ariaSnapshot().catch(() => '')).split('\n')[0];
  const [, role = null, name = ''] = line.match(/^- (\w+)(?: "((?:[^"\\]|\\.)*)")?/) ?? [];
  const selector = await el.evaluate((n) => n.tagName.toLowerCase() + (n.id ? `#${n.id}` : n.getAttribute('name') ? `[name="${n.getAttribute('name')}"]` : ''));
  return { role, name, selector };
}

async function open(positional, flags) {
  const target = positional[0];
  if (!target) throw new OpError('Missing path or URL', 'Usage: shot open /products [--mobile]');
  const emulated = parseEmulation(flags);
  writeJson(STATE(), { ...readJson(STATE(), {}), emulation: emulated });
  fs.rmSync(NETWORK_LOG(), { force: true });
  const p = await page();
  const finishWatch = watch(p);

  const url = toUrl(target, flags);
  const started = Date.now();
  let response;
  try {
    response = await p.goto(url, { waitUntil: 'load', timeout: Number(flags.timeout ?? 60) * 1000 });
  } catch (err) {
    const hint = url.startsWith(config.baseUrl) ? 'Is the server up at baseUrl? Set SHOT_BASE_URL or baseUrl in .shot.json.' : undefined;
    throw new OpError(`Navigation to ${url} failed: ${err.message.split('\n')[0]}`, hint);
  }
  await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

  return {
    url: p.url(),
    status: response?.status() ?? null,
    title: await p.title(),
    ms: Date.now() - started,
    viewport: `${emulated.width}x${emulated.height}`,
    ...(emulated.colorScheme ? { colorScheme: emulated.colorScheme } : {}),
    ...(emulated.reducedMotion ? { reducedMotion: emulated.reducedMotion } : {}),
    ...finishWatch(),
    next: 'shot snapshot  |  shot screenshot',
  };
}

async function snapshot(_positional, flags) {
  const p = await openedPage();
  const selector = flags.selector ?? 'body';
  const loc = p.locator(selector).first();
  if ((await loc.count()) === 0) throw new OpError(`Selector "${selector}" matched nothing`, 'Omit --selector for the whole page, or try "main".');
  const tree = await loc.ariaSnapshot();
  const max = Number(flags.max ?? 15000);
  return { url: p.url(), title: await p.title(), selector, truncated: tree.length > max, snapshot: tree.slice(0, max) };
}

export const LEGIBLE_TEXT_PX = 6;
export const MIN_SCALE = 0.5;

export async function smallestTextPx(p, fullPage) {
  return p.evaluate((whole) => {
    let smallest = Infinity;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !node.textContent.trim()) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (!whole && (rect.bottom < 0 || rect.top > innerHeight)) continue;
      smallest = Math.min(smallest, parseFloat(style.fontSize));
    }
    return Number.isFinite(smallest) ? smallest : null;
  }, fullPage);
}

export function legibleScale(smallest) {
  return smallest ? Math.min(1, Math.max(MIN_SCALE, LEGIBLE_TEXT_PX / smallest)) : 1;
}

async function capture(p, { fullPage, scale }) {
  const clip = await p.evaluate((whole) => {
    const doc = document.documentElement;
    return whole
      ? { x: 0, y: 0, width: doc.scrollWidth, height: doc.scrollHeight }
      : { x: visualViewport.pageLeft, y: visualViewport.pageTop, width: innerWidth, height: innerHeight };
  }, fullPage);
  const session = await p.context().newCDPSession(p);
  try {
    const { data } = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage, clip: { ...clip, scale } });
    return { png: Buffer.from(data, 'base64'), width: Math.round(clip.width * scale), height: Math.round(clip.height * scale) };
  } finally {
    await session.detach();
  }
}

async function screenshot(positional, flags) {
  const p = await openedPage();
  const file = positional[0] ? path.resolve(positional[0]) : stateFile('shots', `${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fullPage = !!flags.full;
  const smallest = await smallestTextPx(p, fullPage);
  const scale = flags['full-res'] ? 1 : legibleScale(smallest);
  const shot = await capture(p, { fullPage, scale });
  fs.writeFileSync(file, shot.png);
  return {
    url: p.url(),
    path: file,
    fullPage,
    size: `${shot.width}x${shot.height}`,
    smallestTextPx: smallest,
    scale: Number(scale.toFixed(3)),
    next: 'shot pr-image <path> [--pr N]',
  };
}

const unsafeControl = () => new RegExp(config.refuseClicks, 'i');

function locatorFor(p, positional, flags) {
  if (flags.selector) return p.locator(String(flags.selector));
  const name = positional.join(' ');
  if (!name) throw new OpError('Missing control name', 'Usage: shot click "Open filters"  |  shot click --selector "css"');
  return flags.role ? p.getByRole(String(flags.role), { name, exact: !!flags.exact }) : p.getByRole('button', { name, exact: !!flags.exact }).or(p.getByRole('link', { name, exact: !!flags.exact }));
}

async function describe(loc) {
  return (await loc.evaluate((el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 80))) || '(no accessible name)';
}

async function pick(all, flags, what) {
  const count = await all.count();
  if (count === 0) throw new OpError(`No matching ${what}`, `Run \`shot snapshot\` and copy the exact ${what} name, or use --selector.`);
  if (count > 1 && flags.nth === undefined) {
    const names = await Promise.all(Array.from({ length: Math.min(count, 8) }, (_, i) => describe(all.nth(i))));
    throw new OpError(`${count} ${what}s match`, `Pick one with --nth 0..${count - 1}. Matches: ${names.join(' | ')}`);
  }
  return all.nth(Number(flags.nth ?? 0));
}

async function click(positional, flags) {
  const p = await openedPage();
  const target = await pick(locatorFor(p, positional, flags), flags, 'control');
  const label = await describe(target);
  if (unsafeControl().test(label)) {
    throw new OpError(`Refusing to click "${label}"`, 'It may write data or message someone. Verify that path another way, or change refuseClicks in .shot.json.');
  }
  const before = p.url();
  const finishWatch = watch(p);
  await target.click({ timeout: 10_000 });
  return { clicked: label, urlBefore: before, ...(await settle(p, finishWatch)) };
}

async function type(positional, flags) {
  const p = await openedPage();
  const [name, text] = flags.selector ? [null, positional[0]] : positional;
  if (text === undefined) throw new OpError('Missing field name or text', 'Usage: shot type "Email" "a@b.co"  |  shot type --selector "css" "text"');
  const exact = !!flags.exact;
  const all = flags.selector
    ? p.locator(String(flags.selector))
    : flags.role
      ? p.getByRole(String(flags.role), { name, exact })
      : p.getByRole('textbox', { name, exact }).or(p.getByRole('searchbox', { name, exact })).or(p.getByRole('combobox', { name, exact }));
  const target = await pick(all, flags, 'field');
  const finishWatch = watch(p);
  if (flags.clear) await target.fill('');
  await target.pressSequentially(String(text));
  const landed = await target.evaluate((el) => el === document.activeElement);
  return {
    typed: String(text),
    into: name ?? flags.selector,
    focused: await focused(p),
    ...(await settle(p, finishWatch)),
    ...(landed ? {} : { ok: false, error: 'The field lost focus while typing, so the keys went elsewhere (a modal or an inert field?)' }),
  };
}

async function enterTargets(p) {
  return p.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return [];
    const label = (n) => (n.getAttribute('aria-label') || n.textContent || (n.matches('input[type=submit],input[type=button]') ? n.value : '') || n.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const form = el.form ?? el.closest('form');
    const submitters = form ? [...form.querySelectorAll('button:not([type]), button[type=submit], input[type=submit]')] : [];
    return [el, ...submitters].map(label).filter(Boolean);
  });
}

async function press(positional, flags) {
  const p = await openedPage();
  const key = positional[0];
  if (!key) throw new OpError('Missing key', 'Usage: shot press Tab [--times 3]  |  shot press Shift+Tab  |  shot press Escape');
  if (/^enter$/i.test(key)) {
    const unsafe = (await enterTargets(p)).find((label) => unsafeControl().test(label));
    if (unsafe) throw new OpError(`Refusing to press Enter: it would trigger "${unsafe}"`, 'It may write data or message someone. Verify that path another way, or change refuseClicks in .shot.json.');
  }
  const times = Number(flags.times ?? 1);
  const finishWatch = watch(p);
  for (let i = 0; i < times; i++) await p.keyboard.press(key);
  return { pressed: key, times, focused: await focused(p), ...(await settle(p, finishWatch)) };
}

async function scroll(_positional, flags) {
  const p = await openedPage();
  const finishWatch = watch(p);
  let target = null;
  let position;
  if (flags.to || flags.selector) {
    target = await pick(flags.selector ? p.locator(String(flags.selector)) : p.getByText(String(flags.to), { exact: !!flags.exact }), flags, 'element');
    position = await scrolledBy(p, () => target.scrollIntoViewIfNeeded({ timeout: 10_000 }));
  } else if (flags.by !== undefined) {
    const { width, height } = emulation();
    await p.mouse.move(width / 2, height / 2);
    position = await scrolledBy(p, () => p.mouse.wheel(0, Number(flags.by)));
  } else {
    throw new OpError('Nothing to scroll to', 'Usage: shot scroll --by 800  |  shot scroll --to "Pricing"  |  shot scroll --selector "css"');
  }
  const settled = await settle(p, finishWatch);
  const inView = target ? await target.evaluate((el) => ((r) => r.bottom > 0 && r.top < innerHeight)(el.getBoundingClientRect())) : null;
  return { ...position, inView, ...settled };
}

async function expectText(positional, flags) {
  const p = await openedPage();
  const name = positional.join(' ');
  if (!name) throw new OpError('Missing text or name', 'Usage: shot expect "Saved" [--role status] [--gone] [--timeout 10]');
  const all = flags.role ? p.getByRole(String(flags.role), { name, exact: !!flags.exact }) : p.getByText(name, { exact: !!flags.exact });
  const started = Date.now();
  const met = await all.first().waitFor({ state: flags.gone ? 'hidden' : 'visible', timeout: Number(flags.timeout ?? 10) * 1000 }).then(() => true, () => false);
  return { ok: met, found: (await all.count()) > 0, role: flags.role ?? 'text', name, gone: !!flags.gone, waitedMs: Date.now() - started };
}

function network(_positional, flags) {
  const filter = flags.filter ? String(flags.filter) : null;
  const all = readNetworkLog();
  const shown = all.filter((e) => (flags.all || ['document', 'fetch', 'xhr', 'eventsource', 'websocket'].includes(e.type)) && (!filter || e.url.includes(filter)) && (!flags.failed || e.status === null || e.status >= 400));
  const max = Number(flags.max ?? 50);
  return { total: all.length, shown: Math.min(shown.length, max), requests: shown.slice(-max), next: shown.length ? 'shot network --filter <text>' : 'drive the page with shot open/click/type, then shot network' };
}

function mock(positional, flags) {
  const url = positional[0];
  if (!url) throw new OpError('Missing URL pattern', 'Usage: shot mock "**/api/orders" --body \'{"orders":[]}\' [--status 200]');
  if (flags.body !== undefined && flags.file) throw new OpError('Pass --body or --file, not both');
  const body = flags.file ? fs.readFileSync(path.resolve(String(flags.file)), 'utf8') : String(flags.body ?? '');
  const isJson = (() => {
    try {
      JSON.parse(body);
      return true;
    } catch {
      return false;
    }
  })();
  const entry = { url, status: Number(flags.status ?? 200), contentType: flags.type ? String(flags.type) : isJson ? 'application/json' : 'text/plain', body };
  const mocks = [...(readJson(STATE(), {}).mocks ?? []).filter((m) => m.url !== url), entry];
  writeJson(STATE(), { ...readJson(STATE(), {}), mocks });
  return { mocks: mocks.map(({ body: b, ...m }) => ({ ...m, bytes: Buffer.byteLength(b) })), next: 'shot open <path> (mocks apply to GET requests made while a shot command runs)' };
}

function mockList() {
  return { mocks: (readJson(STATE(), {}).mocks ?? []).map(({ body, ...m }) => ({ ...m, bytes: Buffer.byteLength(body) })) };
}

function mockClear() {
  const { mocks = [] } = readJson(STATE(), {});
  writeJson(STATE(), { ...readJson(STATE(), {}), mocks: [] });
  return { cleared: mocks.length };
}

async function reset(_positional, flags) {
  const p = await page();
  const context = p.context();
  const cookie = config.auth ? requireAuth().cookie : null;
  const kept = flags.signout || !cookie ? [] : (await context.cookies()).filter((c) => cookie.test(c.name));
  await context.clearCookies();
  if (kept.length) await context.addCookies(kept);
  const origin = p.url().startsWith('http') ? new URL(p.url()).origin : null;
  if (origin) await p.evaluate(() => (localStorage.clear(), sessionStorage.clear()));
  return {
    clearedCookies: true,
    keptSignIn: kept.length > 0,
    clearedStorageFor: origin ?? 'no page open — open a page and reset again to clear its storage',
  };
}

async function login(_positional, flags) {
  const auth = requireAuth();
  const entry = readJson(STATE(), {});
  if (entry.headed && pidAlive(entry.pid)) return { status: 'already_headed', next: `Sign in at ${toUrl(auth.loginPath, flags)} in the open window, then \`shot browser whoami\`` };
  const holder = profileHolder();
  if (holder) {
    process.kill(holder.pid, 'SIGTERM');
    for (let waited = 0; waited < 10_000 && profileHolder(); waited += 250) await new Promise((r) => setTimeout(r, 250));
  }
  await start({ headed: true });
  const p = await page();
  await p.goto(toUrl(auth.loginPath, flags), { waitUntil: 'load' }).catch(() => {});
  return {
    status: 'waiting_for_sign_in',
    url: p.url(),
    profile: CHROME_PROFILE_DIR,
    next: 'A human signs in in the Chrome window. Then `shot browser whoami`, and `shot browser stop` to go back to headless.',
  };
}

async function whoami(_positional, flags) {
  const auth = requireAuth();
  const p = await page();
  const before = p.url();
  await p.goto(toUrl(auth.checkPath, flags), { waitUntil: 'load', timeout: 60_000 }).catch((err) => {
    throw new OpError(`Could not load ${auth.checkPath}: ${err.message.split('\n')[0]}`, 'Is the server up at baseUrl?');
  });
  const landed = new URL(p.url()).pathname;
  const hasAuthCookie = (await p.context().cookies()).some((c) => auth.cookie.test(c.name));
  const loggedIn = landed.startsWith(auth.checkPath);
  if (before !== 'about:blank' && before !== p.url()) await p.goto(before).catch(() => {});
  return {
    ok: loggedIn,
    loggedIn,
    hasAuthCookie,
    landed,
    profile: CHROME_PROFILE_DIR,
    ...(loggedIn ? {} : { hint: 'No login in this profile. A human runs `shot browser login` once and signs in; agents cannot.' }),
  };
}

async function otherTabs(ownTab) {
  const targets = await fetch(`${CDP}/json/list`).then((r) => r.json());
  return targets.filter((t) => t.type === 'page' && t.id !== ownTab && t.url !== 'about:blank');
}

async function stop() {
  const entry = readJson(STATE(), {});
  if (pidAlive(entry.keeper?.pid)) process.kill(entry.keeper.pid, 'SIGTERM');
  if (!(await isPortOpen(config.cdpPort))) {
    writeJson(STATE(), {});
    return { status: 'not_running' };
  }
  if (entry.tab) await fetch(`${CDP}/json/close/${entry.tab}`).catch(() => {});
  writeJson(STATE(), { ...entry, tab: undefined, keeper: undefined });
  const others = await otherTabs(entry.tab);
  if (entry.pid && pidAlive(entry.pid) && others.length === 0) {
    process.kill(entry.pid, 'SIGTERM');
    writeJson(STATE(), {});
    return { status: 'stopped', pid: entry.pid };
  }
  return { status: 'tab_closed', chromeLeftRunning: others.length ? `${others.length} other tab(s) open` : 'started by another checkout' };
}

export const commands = {
  'browser start': {
    summary: 'Start the persistent Chrome that open/snapshot/screenshot drive',
    booleans: ['headed'],
    usage: `
shot browser start [--headed]

Launches Chrome on the shared profile ${CHROME_PROFILE_DIR} and DevTools on port ${config.cdpPort}.
Headless by default; --headed shows a window. open/snapshot/screenshot start it on demand,
so you only need this for --headed. When another checkout's Chrome already holds the profile,
shot uses that Chrome on its port (unless SHOT_CDP_PORT pins one); every checkout drives its own tab.`,
    run: (_p, flags) => start(flags),
  },
  'browser login': {
    summary: 'Open a visible Chrome at auth.loginPath so a human can sign in once (shared by all worktrees)',
    usage: `
shot browser login

Quits whichever Chrome holds the shared profile, then starts it headed (${CHROME_PROFILE_DIR},
override with SHOT_PROFILE) and opens auth.loginPath. A human signs in; the
session then persists for every checkout that uses this profile. Agents never type
credentials. Needs the app's dev server up at baseUrl.`,
    run: login,
  },
  'browser whoami': {
    summary: 'Check whether the shared profile holds a login (loads auth.checkPath)',
    usage: `
shot browser whoami

Loads auth.checkPath and reports whether middleware let it through. ok:false means nobody has
signed in on this profile, or the session expired: ask the human to run \`shot browser login\`.`,
    run: whoami,
  },
  'browser stop': {
    summary: "Close this checkout's tab; quit Chrome if this checkout started it and no other tab is open",
    usage: 'shot browser stop',
    run: stop,
  },
  'browser reset': {
    summary: 'Clear cookies + local/sessionStorage of the open origin (keeps the auth cookie)',
    booleans: ['signout'],
    usage: `
shot browser reset [--signout]

Clears cookies for the whole profile and localStorage/sessionStorage for the currently open origin.
Run it before a pass so persisted state (carts, filters) doesn't change what pages render.
Cookies matching auth.cookie survive unless --signout.`,
    run: reset,
  },
  click: {
    summary: 'Click a button/link by accessible name (opens drawers, swatches, tabs)',
    booleans: ['exact'],
    usage: `
shot click "<accessible name>" [--role button|link|tab|…] [--exact] [--nth N]
shot click --selector "<css>" [--nth N]

Names come from \`shot snapshot\`. Several matches → error listing them; pick with --nth.
Returns the URL after the click and any open dialogs (drawers are dialogs).

Refuses controls whose name matches refuseClicks (default: place/pay/order/submit/apply/
confirm/save/delete/retrigger/record/checkout/buy/…): they may write data or message someone.`,
    run: click,
  },
  type: {
    summary: 'Type into a text field by accessible name, key by key',
    booleans: ['exact', 'clear'],
    usage: `
shot type "<field name>" "<text>" [--role textbox|searchbox|combobox] [--exact] [--nth N] [--clear]
shot type --selector "<css>" "<text>" [--clear]

Fires real key events, so input handlers and autocomplete run. --clear empties the field first.
Returns the field that has focus afterwards, the URL, open dialogs, and console and network errors.`,
    run: type,
  },
  press: {
    summary: 'Press a key on the focused element; reports which element has focus after',
    usage: `
shot press <Key> [--times N]

Keys use Playwright names: Tab, Shift+Tab, Escape, Enter, ArrowDown, Home.
Returns focused {role, name, selector}, so Tab proves focus order and Escape proves a dialog closes.
Enter is refused when the focused control, or a submit button of its form, matches refuseClicks.`,
    run: press,
  },
  scroll: {
    summary: 'Scroll by pixels with the mouse wheel, or bring an element into view',
    booleans: ['exact'],
    usage: `
shot scroll --by <px>
shot scroll --to "<visible text>" [--exact] [--nth N]
shot scroll --selector "<css>" [--nth N]

--by sends wheel events at the viewport centre, so scroll handlers and lazy loading fire. Returns once
the scroll has ended and painted, so a screenshot right after shows the new position. Reports the
scroller that moved ("window" or the element), its scrollY and scrollHeight, inView (for --to and
--selector), and console and network errors.`,
    run: scroll,
  },
  expect: {
    summary: 'Wait until text or a named role appears (or with --gone, disappears); ok:false on timeout',
    booleans: ['exact', 'gone'],
    usage: `
shot expect "<text>" [--role status|alert|dialog|…] [--exact] [--gone] [--timeout 10]

Use it after an action instead of guessing how long async UI takes to settle.`,
    run: expectText,
  },
  network: {
    summary: 'Requests the page made during shot commands since the last open (method, URL, status)',
    booleans: ['all', 'failed'],
    usage: `
shot network [--filter <text>] [--failed] [--all] [--max 50]

Lists requests seen while open, click, type, press and scroll ran, oldest first, with method, URL,
status, resource type and the first 300 characters of a request body. Shows documents, fetch, XHR,
event streams and websockets by default; --all adds scripts, styles, images and fonts.
--failed keeps ≥400 and aborted requests. Use it to prove a click sent the request you expect.
Requests made between commands (polling while no shot command runs) are not seen.`,
    run: network,
  },
  mock: {
    summary: 'Fulfil GET requests matching a URL pattern with a fixed response (sticks until mock clear)',
    usage: `
shot mock "<url glob>" [--body '<text or json>' | --file response.json] [--status 200] [--type content/type]
shot mock list
shot mock clear

The pattern is a Playwright URL glob ("**/api/orders*"). Only GET requests are mocked; other methods
reach the server. Use it to render empty, error and edge states without touching backend data.
Mocks apply to requests made while a shot command runs, so set them before \`shot open\`. Commands
report the URLs they mocked as "mocked".`,
    run: mock,
  },
  'mock list': { summary: 'List active mocks', usage: 'shot mock list', run: mockList },
  'mock clear': { summary: 'Remove every mock', usage: 'shot mock clear', run: mockClear },
  open: {
    summary: 'Navigate the browser to a path or URL; reports console + network errors',
    booleans: ['mobile', 'dark', 'light', 'reduced-motion'],
    usage: `
shot open <path|url> [--mobile | --viewport 1280x800] [--dark | --light] [--reduced-motion]
                     [--base http://localhost:3000] [--timeout 60]

Paths resolve against ${config.baseUrl}. Waits for load + network idle (≤8s).
Returns status, title, console errors and failed (≥400 / aborted) requests seen during the load.
The page stays open for \`shot snapshot\` / \`shot screenshot\` / \`shot click\`. The viewport
(desktop 1440x900, --mobile 390x844, or --viewport), prefers-color-scheme and prefers-reduced-motion
stick until the next \`shot open\`. open also clears the request log that \`shot network\` reads.
Pages behind a login need the session from \`shot browser login\`; check with \`shot browser whoami\` (needs "auth" in .shot.json).`,
    run: open,
  },
  snapshot: {
    summary: 'Accessibility-tree snapshot (YAML) of the open page',
    usage: `
shot snapshot [--selector main] [--max 15000]

Playwright aria snapshot of the current page (or one element). Use it to assert text,
roles and structure instead of reading screenshots.`,
    run: snapshot,
  },
  screenshot: {
    summary: 'PNG of the open page as evidence, shrunk to the smallest size its text stays legible at',
    booleans: ['full', 'full-res'],
    usage: `
shot screenshot [file.png] [--full] [--full-res]

Defaults to <state dir>/shots/<timestamp>.png. --full captures the whole scrollable page.
Chrome renders it shrunk until the smallest captured text is ${LEGIBLE_TEXT_PX}px tall (never below
${MIN_SCALE * 100}% size), and that small PNG is also what goes into PRs.
--full-res keeps the viewport's size: use it only when a human explicitly asks for full resolution.`,
    run: screenshot,
  },
};
