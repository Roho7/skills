#!/usr/bin/env node
// node scripts/skills.mjs check                         lint every public skill, fail if generated files are stale (CI)
// node scripts/skills.mjs sync                          rewrite bucket READMEs, the README skill list and marketplace.json
// node scripts/skills.mjs graduate <name> <bucket>      move library/skills/<group>/<name> here, leave a symlink behind
// node scripts/skills.mjs graduate --group <group>      move a whole library group (and library/agents/<group>) to skills/<group>
// A vendored skill (in library/vendor.lock.json) graduates only with --fork, after you changed it.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const library = join(repo, "library");

const BUCKETS = {
  engineering: { title: "Engineering", blurb: "Daily code work: checking UIs, recording demos, working through review.", plugin: "roho-skills" },
  productivity: { title: "Productivity", blurb: "How the agent talks and how you learn.", plugin: "roho-skills" },
  rohostack: {
    title: "rohostack",
    blurb: "My fork of [pstack](https://github.com/cursor/plugins/tree/main/pstack): `/roho-mode` runs playbooks for bugs, features, perf, reviews and PRs, with principle skills it cites. Start with `/roho-help`.",
    plugin: "rohostack",
    agents: "agents/rohostack",
  },
  "in-progress": { title: "In progress", blurb: "Public on purpose, feedback wanted. Not in any plugin; install one with `--skill`.", plugin: null },
};

const PLUGINS = {
  "roho-skills": "Rohosen's everyday agent skills: real-browser UI checks, demo recording, review walkthroughs, and quiet talking modes.",
  rohostack: "rohostack: a fork of pstack. /roho-mode plus playbooks, principles, review panels and subagents.",
};

const DENYLIST = ["/Users/roho7", "Documents/MAIN", "~/.agents/skills/", "paglu", "gamespaglu", "poteto", "pstack-models", "setup-pstack"];

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fields = {};
  const lines = match[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2];
    if (value === ">" || value === "|" || value === ">-" || value === "|-") {
      const block = [];
      while (lines[i + 1]?.startsWith("  ")) block.push(lines[++i].trim());
      value = block.join(" ");
    }
    fields[kv[1]] = value.replace(/^(["'])([\s\S]*)\1$/, "$2");
  }
  return fields;
}

const dirsIn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((e) => statSync(join(dir, e)).isDirectory()).sort() : []);

function textFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules" || entry === "corpus" || entry === ".git") return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return textFiles(path);
    const buf = readFileSync(path);
    return buf.includes(0) ? [] : [path];
  });
}

function loadSkills() {
  return Object.keys(BUCKETS).flatMap((bucket) =>
    dirsIn(join(repo, "skills", bucket)).map((name) => {
      const dir = join(repo, "skills", bucket, name);
      const file = join(dir, "SKILL.md");
      const fm = existsSync(file) ? parseFrontmatter(readFileSync(file, "utf8")) : null;
      return { bucket, name, dir, fm };
    }),
  );
}

function lint(skill) {
  const problems = [];
  const { name, dir, fm } = skill;
  if (!fm) return [`${name}: no SKILL.md with frontmatter`];
  if (fm.name !== name) problems.push(`${name}: frontmatter name "${fm.name}" must match the folder name`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) problems.push(`${name}: name must be 1-64 chars of a-z, 0-9 and single hyphens`);
  if (!fm.description || fm.description.length > 1024) problems.push(`${name}: description must be 1-1024 chars`);
  if (fm.compatibility && fm.compatibility.length > 500) problems.push(`${name}: compatibility must be at most 500 chars`);
  for (const file of textFiles(dir)) {
    if (file.endsWith("LICENSE")) continue;
    const text = readFileSync(file, "utf8");
    for (const term of DENYLIST) if (text.includes(term)) problems.push(`${relative(repo, file)}: contains "${term}"`);
  }
  return problems;
}

const firstSentence = (description) => description.split(/(?<=\.)\s/)[0];
const invocation = (fm) => (fm["disable-model-invocation"] === "true" ? " User-invoked." : "");

function bucketReadme(bucket, skills) {
  const { title, blurb } = BUCKETS[bucket];
  const lines = skills.map((s) => `- **[${s.name}](./${s.name}/SKILL.md)**: ${firstSentence(s.fm.description)}${invocation(s.fm)}`);
  return `# ${title}\n\n${blurb}\n\n${lines.join("\n")}\n`;
}

function readmeSection(skills) {
  return Object.keys(BUCKETS)
    .map((bucket) => {
      const inBucket = skills.filter((s) => s.bucket === bucket);
      if (!inBucket.length) return null;
      const { title, blurb } = BUCKETS[bucket];
      const rows = inBucket.map((s) => `- **[${s.name}](./skills/${bucket}/${s.name}/SKILL.md)**: ${firstSentence(s.fm.description)}${invocation(s.fm)}`);
      return `### ${title}\n\n${blurb}\n\n${rows.join("\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function marketplace(skills) {
  const current = JSON.parse(readFileSync(join(repo, ".claude-plugin/marketplace.json"), "utf8"));
  const plugins = Object.entries(PLUGINS).map(([name, description]) => {
    const buckets = Object.keys(BUCKETS).filter((b) => BUCKETS[b].plugin === name);
    const agentDirs = buckets.map((b) => BUCKETS[b].agents).filter(Boolean);
    const agents = agentDirs.flatMap((d) => readdirSync(join(repo, d)).filter((f) => f.endsWith(".md")).sort().map((f) => `./${d}/${f}`));
    return {
      name,
      source: "./",
      description,
      strict: false,
      skills: skills.filter((s) => buckets.includes(s.bucket)).map((s) => `./skills/${s.bucket}/${s.name}`),
      ...(agents.length ? { agents } : {}),
    };
  });
  return `${JSON.stringify({ ...current, plugins }, null, 2)}\n`;
}

function generated(skills) {
  const files = new Map();
  for (const bucket of Object.keys(BUCKETS)) {
    const inBucket = skills.filter((s) => s.bucket === bucket);
    if (inBucket.length) files.set(join(repo, "skills", bucket, "README.md"), bucketReadme(bucket, inBucket));
  }
  const readmePath = join(repo, "README.md");
  const readme = readFileSync(readmePath, "utf8");
  const markers = /(<!-- skills:start -->)[\s\S]*?(<!-- skills:end -->)/;
  if (!markers.test(readme)) throw new Error("README.md lost its <!-- skills:start --> / <!-- skills:end --> markers");
  files.set(readmePath, readme.replace(markers, () => `<!-- skills:start -->\n\n${readmeSection(skills)}\n\n<!-- skills:end -->`));
  files.set(join(repo, ".claude-plugin/marketplace.json"), marketplace(skills));
  return files;
}

function check() {
  const skills = loadSkills();
  const problems = skills.flatMap(lint);
  const seen = new Map();
  for (const s of skills) {
    if (seen.has(s.name)) problems.push(`${s.name}: in both ${seen.get(s.name)} and ${s.bucket}`);
    seen.set(s.name, s.bucket);
  }
  if (!problems.length) {
    for (const [path, text] of generated(skills)) {
      if (!existsSync(path) || readFileSync(path, "utf8") !== text) problems.push(`${relative(repo, path)} is stale: run node scripts/skills.mjs sync`);
    }
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`ok: ${skills.length} skills in ${new Set(skills.map((s) => s.bucket)).size} buckets`);
}

function sync() {
  const skills = loadSkills();
  for (const [path, text] of generated(skills)) writeFileSync(path, text);
  console.log(`synced ${skills.length} skills`);
}

function vendored(name) {
  const lock = join(library, "vendor.lock.json");
  return existsSync(lock) && !!JSON.parse(readFileSync(lock, "utf8")).skills[name];
}

function moveAndLink(src, dest) {
  if (lstatSync(src).isSymbolicLink()) throw new Error(`${relative(repo, src)} is already a symlink (graduated?)`);
  if (existsSync(dest)) throw new Error(`${relative(repo, dest)} already exists`);
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(src, dest);
  symlinkSync(relative(dirname(src), dest), src);
}

function graduate(args) {
  const fork = args.includes("--fork");
  const rest = args.filter((a) => a !== "--fork");
  let moves;
  if (rest[0] === "--group") {
    const group = rest[1];
    if (!BUCKETS[group]) throw new Error(`add "${group}" to BUCKETS in scripts/skills.mjs first`);
    moves = [[join(library, "skills", group), join(repo, "skills", group)]];
    if (existsSync(join(library, "agents", group))) moves.push([join(library, "agents", group), join(repo, "agents", group)]);
  } else {
    const [name, bucket] = rest;
    if (!name || !BUCKETS[bucket]) throw new Error(`usage: graduate <name> <${Object.keys(BUCKETS).join("|")}> [--fork]`);
    if (vendored(name) && !fork) throw new Error(`${name} is vendored from upstream. Graduate it only after you changed it, with --fork, and keep its upstream LICENSE.`);
    const group = dirsIn(join(library, "skills")).find((g) => existsSync(join(library, "skills", g, name, "SKILL.md")));
    if (!group) throw new Error(`${name} is not in library/skills/<group>/`);
    moves = [[join(library, "skills", group, name), join(repo, "skills", bucket, name)]];
  }
  const [skillsSrc] = moves[0];
  const toSkill = (dir) => ({ name: dir.split("/").pop(), dir, fm: parseFrontmatter(readFileSync(join(dir, "SKILL.md"), "utf8")) });
  const candidates = rest[0] === "--group" ? dirsIn(skillsSrc).map((name) => toSkill(join(skillsSrc, name))) : [toSkill(skillsSrc)];
  const problems = candidates.flatMap(lint);
  if (problems.length) {
    console.error(`not graduating:\n${problems.join("\n")}`);
    process.exit(1);
  }
  for (const [src, dest] of moves) moveAndLink(src, dest);
  sync();
  console.log(`graduated: ${moves.map(([, d]) => relative(repo, d)).join(", ")}. Commit here and in library/.`);
}

const [command, ...args] = process.argv.slice(2);
const commands = { check, sync, graduate: () => graduate(args) };
if (!commands[command]) {
  console.error("usage: node scripts/skills.mjs check | sync | graduate <name> <bucket> [--fork] | graduate --group <group>");
  process.exit(1);
}
commands[command]();
