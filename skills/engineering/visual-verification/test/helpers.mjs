import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const SHOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'shot.mjs');

function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer().listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export async function serve(routes) {
  const server = http.createServer((req, res) => {
    const route = routes[new URL(req.url, 'http://x').pathname];
    if (!route) return res.writeHead(404).end('not found');
    const { status = 200, type = 'text/html', body } = typeof route === 'string' ? { body: route } : route;
    res.writeHead(status, { 'content-type': type }).end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

export async function shotSession(base) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-test-'));
  const env = { ...process.env, SHOT_BASE_URL: base, SHOT_PROFILE: path.join(dir, 'profile'), SHOT_CDP_PORT: String(await freePort()) };
  const shot = (...args) =>
    new Promise((resolve, reject) => {
      execFile(process.execPath, [SHOT, ...args], { cwd: dir, env }, (_err, stdout, stderr) => {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(`shot ${args.join(' ')} printed no JSON:\n${stdout}\n${stderr}`));
        }
      });
    });
  return { dir, shot, stop: () => shot('browser', 'stop') };
}

export function topLeftPixel(file) {
  const png = fs.readFileSync(file);
  const idat = [];
  let colorType;
  let width;
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    const kind = png.toString('ascii', at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') [width, colorType] = [data.readUInt32BE(0), data[9]];
    if (kind === 'IDAT') idat.push(data);
    at += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const [r, g, b] = raw.subarray(1, 4);
  return { r, g, b, width, colorType };
}
