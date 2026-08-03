/**
 * Serves `dist/` with the exact headers `vercel.json` will send.
 *
 *   npm run build && npm run serve:dist
 *
 * ## Why this exists
 *
 * `vite preview` serves the production bundle but sends none of the production
 * *headers*, so the one class of bug that only appears in production — a
 * Content-Security-Policy that blocks something real — is invisible until the
 * deploy. A strict CSP is very easy to get 95% right and have the last 5% break
 * Google sign-in for everybody.
 *
 * This reads `vercel.json` and applies the same rules, so the browser sees what
 * it will see on Vercel. It is a verification tool, not a server: no caching
 * logic, no compression, no attempt to be fast.
 *
 * Header `source` patterns are Vercel path patterns rather than regexes, but
 * the ones in this project are simple enough that a literal-prefix plus
 * `(.*)`-suffix match reproduces them exactly. `npm run validate:vercel`
 * already asserts every source compiles.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT ?? 4178);
const ROOT = 'dist';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const config = JSON.parse(await readFile('vercel.json', 'utf8'));

/**
 * Vercel's `source` → a predicate over the request path.
 *
 * Handles a literal with at most one `(.*)` anywhere in it, which covers every
 * pattern in this project including `/workbox-(.*).js`. Anything with two
 * wildcards or a named group throws rather than silently matching nothing — a
 * header rule that quietly stops applying would make this tool lie in exactly
 * the direction that matters.
 */
function matcher(source) {
  const parts = source.split('(.*)');
  if (parts.length === 1) return (path) => path === source;
  if (parts.length > 2 || source.includes('(') && !source.includes('(.*)')) {
    throw new Error(`serve-dist cannot reproduce the pattern: ${source}`);
  }
  const [prefix, suffix] = parts;
  return (path) =>
    path.startsWith(prefix) && path.endsWith(suffix) && path.length >= prefix.length + suffix.length;
}

/**
 * `NO_CSP=1` serves everything else but drops the Content-Security-Policy, and
 * `CSP="…"` substitutes one. Both exist for bisecting: when a page misbehaves
 * under the production headers the first question is always "is it the CSP at
 * all", and answering it by hand-editing `vercel.json` risks committing the
 * experiment.
 */
const rules = (config.headers ?? []).map((rule) => ({
  test: matcher(rule.source),
  headers: rule.headers
    .filter((h) => !(process.env.NO_CSP && h.key === 'Content-Security-Policy'))
    .map((h) => (h.key === 'Content-Security-Policy' && process.env.CSP
      ? { ...h, value: process.env.CSP }
      : h)),
}));

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = decodeURIComponent(url.pathname);

  for (const rule of rules) {
    if (rule.test(path)) {
      for (const { key, value } of rule.headers) res.setHeader(key, value);
    }
  }

  // `normalize` first so `/../` cannot escape dist — this binds to localhost
  // and serves a build directory, but a traversal bug is never worth leaving in
  // even a local tool.
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, safe);

  // The SPA rewrite: anything that is not a real file is index.html.
  if (!existsSync(file) || safe.endsWith('/')) file = join(ROOT, 'index.html');

  try {
    const body = await readFile(file);
    res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.writeHead(200).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => {
  console.log(`\n  dist/ on http://localhost:${PORT} with production headers`);
  console.log(`  ${rules.length} header rule(s) applied — CSP included.\n`);
});
