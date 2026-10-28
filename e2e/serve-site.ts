// Serves the built project site from site/ under /runespect/, the way GitHub Pages does: a
// directory answers with its index.html, a directory without its slash is redirected to it, and
// anything missing answers with 404.html and status 404.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../site');
const BASE = '/runespect/';
const PORT = Number(process.argv[2] ?? 5183);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// What a request path is: a file to send, a directory to redirect to its slash form, or nothing.
async function resolve(pathname: string): Promise<{ file?: string; redirect?: true }> {
  if (!pathname.startsWith(BASE)) return {};
  const file = path.join(ROOT, pathname.slice(BASE.length));
  if (!file.startsWith(ROOT)) return {};
  const info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    return pathname.endsWith('/') ? { file: path.join(file, 'index.html') } : { redirect: true };
  }
  return info ? { file } : {};
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  const { file, redirect } = await resolve(pathname);
  if (redirect) {
    res.writeHead(301, { location: `${url.pathname}/${url.search}` }).end();
    return;
  }
  const body = await readFile(file ?? path.join(ROOT, '404.html')).catch(() => null);
  res.writeHead(file && body ? 200 : 404, {
    'content-type': TYPES[path.extname(file ?? '404.html')] ?? 'application/octet-stream',
  });
  res.end(body ?? 'not found');
}).listen(PORT);
