/**
 * Validates `vercel.json` before Vercel does.
 *
 * Two deployments failed in a row on this file — once for a `$comment` key that
 * Vercel's strict schema rejects, once for a capturing group nested inside an
 * alternation, which `path-to-regexp` refuses. Both were invisible locally:
 * the file is valid JSON, nothing imports it, and no test touched it, so the
 * first sign of trouble was a failed production deploy.
 *
 * So this runs in CI. It checks the two things that actually broke:
 *
 *   1. **No unknown properties.** Vercel validates against a strict schema and
 *      rejects extra keys on `headers[]` / `rewrites[]` / `redirects[]` entries —
 *      including documentation keys that are harmless in firebase.json and
 *      package.json.
 *   2. **Every `source` compiles under path-to-regexp**, which is what Vercel
 *      uses — *not* `RegExp`. They differ: nested capturing groups and bare
 *      negative lookaheads are rejected.
 *
 * It also asserts the cache rules still match the filenames the build actually
 * produces. A `sw.js` rule that silently stops matching is worse than a missing
 * one, because it looks correct while every returning visitor stays pinned to a
 * dead service worker.
 *
 * Run: npm run validate:vercel
 */
import { readFileSync } from 'node:fs';
import { pathToRegexp } from 'path-to-regexp';

const file = process.argv[2] ?? 'vercel.json';
const config = JSON.parse(readFileSync(file, 'utf8'));

const failures = [];
const fail = (message) => failures.push(message);

/* ---------- 1. unknown properties ---------- */

const ALLOWED_TOP = new Set([
  '$schema', 'buildCommand', 'outputDirectory', 'framework', 'installCommand',
  'devCommand', 'ignoreCommand', 'headers', 'rewrites', 'redirects', 'cleanUrls',
  'trailingSlash', 'regions', 'functions', 'crons', 'github', 'images', 'public',
  'rootDirectory',
]);
const ALLOWED_HEADER_RULE = new Set(['source', 'headers', 'has', 'missing']);
const ALLOWED_ROUTE_RULE = new Set(['source', 'destination', 'has', 'missing', 'statusCode', 'permanent']);

for (const key of Object.keys(config)) {
  if (!ALLOWED_TOP.has(key)) fail(`unknown top-level property "${key}"`);
}
(config.headers ?? []).forEach((rule, i) => {
  for (const key of Object.keys(rule)) {
    if (!ALLOWED_HEADER_RULE.has(key)) fail(`headers[${i}] has unknown property "${key}"`);
  }
  (rule.headers ?? []).forEach((entry, n) => {
    for (const key of Object.keys(entry)) {
      if (key !== 'key' && key !== 'value') fail(`headers[${i}].headers[${n}] has unknown property "${key}"`);
    }
  });
});
for (const collection of ['rewrites', 'redirects']) {
  (config[collection] ?? []).forEach((rule, i) => {
    for (const key of Object.keys(rule)) {
      if (!ALLOWED_ROUTE_RULE.has(key)) fail(`${collection}[${i}] has unknown property "${key}"`);
    }
  });
}

/* ---------- 2. every source compiles ---------- */

const sources = [
  ...(config.headers ?? []).map((r, i) => [`headers[${i}]`, r.source]),
  ...(config.rewrites ?? []).map((r, i) => [`rewrites[${i}]`, r.source]),
  ...(config.redirects ?? []).map((r, i) => [`redirects[${i}]`, r.source]),
];
const compiled = new Map();
for (const [where, source] of sources) {
  try {
    compiled.set(where, pathToRegexp(source));
  } catch (error) {
    fail(`${where} source ${JSON.stringify(source)} is not a valid path-to-regexp pattern — ${error.message}`);
  }
}

/* ---------- 3. the rules still match real build output ---------- */

/** [path, the Cache-Control the first matching rule must produce] */
const EXPECTED = [
  ['/assets/index-abc123.js', 'public, max-age=31536000, immutable'],
  ['/sw.js', 'public, max-age=0, must-revalidate'],
  ['/registerSW.js', 'public, max-age=0, must-revalidate'],
  ['/manifest.webmanifest', 'public, max-age=0, must-revalidate'],
  ['/workbox-e5929aca.js', 'public, max-age=0, must-revalidate'],
  ['/index.html', 'public, max-age=0, must-revalidate'],
];

for (const [path, expected] of EXPECTED) {
  const hit = (config.headers ?? []).find((rule, i) => {
    const re = compiled.get(`headers[${i}]`);
    return re && re.test(path) && rule.headers.some((h) => h.key === 'Cache-Control');
  });
  const actual = hit?.headers.find((h) => h.key === 'Cache-Control')?.value;
  if (actual !== expected) {
    fail(`${path} would get Cache-Control ${JSON.stringify(actual ?? null)}, expected ${JSON.stringify(expected)}`);
  }
}

if (failures.length) {
  console.error(`\n${file} is invalid:\n${failures.map((f) => `  - ${f}`).join('\n')}\n`);
  process.exit(1);
}
console.log(
  `${file} ok — ${(config.headers ?? []).length} header rules, ` +
  `${(config.rewrites ?? []).length} rewrite(s), all sources compile, cache rules match build output`,
);
