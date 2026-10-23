#!/usr/bin/env node
// vet-package.mjs — automatic vetting of npm packages before an unattended install (openspec change
// autonomous-run-switch, design D3). Replaces the human confirmation of block-dangerous-bash rule 5,
// which stalled the Entrega 2 run for 10.5 h.
//
// Usage: node vet-package.mjs <manager> <name@version>...
// Prints one JSON line: { "ok": boolean, "failures": string[] }.
// KIT_NPM_REGISTRY / KIT_NPM_DOWNLOADS point the queries at another server (tests only).
'use strict';

const MIN_PACKAGE_AGE_DAYS = 90;
const MIN_VERSION_AGE_DAYS = 7;
const MIN_WEEKLY_DOWNLOADS = 10_000;
const BUDGET_MS = 8_000;
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall'];
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

const registry = (process.env.KIT_NPM_REGISTRY || 'https://registry.npmjs.org').replace(/\/$/, '');
const downloads = (process.env.KIT_NPM_DOWNLOADS || 'https://api.npmjs.org/downloads/point/last-week').replace(/\/$/, '');

/** Splits `name@version` (scoped names included). */
export function splitSpec(spec) {
  const at = spec.lastIndexOf('@');
  if (at <= 0) return { name: spec, version: null };
  return { name: spec.slice(0, at), version: spec.slice(at + 1) };
}

// Days since an ISO date, or null when the value is not a readable date (the check then denies).
const daysSince = (iso) => {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86_400_000) : null;
};
const enc = (name) => name.replace('/', '%2F');

async function getJson(url, signal) {
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return { body: await res.json() };
}

async function vetOne(spec, signal) {
  const { name, version } = splitSpec(spec);
  if (!version || !EXACT.test(version)) return [`${spec}: write it as <name>@<exact version> (MAJOR.MINOR.PATCH)`];
  const [meta, dl] = await Promise.all([getJson(`${registry}/${enc(name)}`, signal), getJson(`${downloads}/${enc(name)}`, signal)]);
  if (meta.missing) return [`${name}: the package does not exist in the registry`];
  const doc = meta.body;
  const failures = [];
  const v = doc.versions?.[version];
  if (!v) failures.push(`${name}: version ${version} does not exist`);
  // A value that cannot be read denies, naming its check (spec: "a check whose result cannot be read").
  const created = doc.time?.created;
  const packageAge = daysSince(created);
  if (!created) failures.push(`${name}: no first-publication date`);
  else if (packageAge === null) failures.push(`${name}: the first-publication date cannot be read (${JSON.stringify(created)})`);
  else if (packageAge < MIN_PACKAGE_AGE_DAYS) failures.push(`${name}: first published ${packageAge} days ago (minimum ${MIN_PACKAGE_AGE_DAYS})`);
  if (v) {
    const published = doc.time?.[version];
    const versionAge = daysSince(published);
    if (versionAge === null) failures.push(`${name}@${version}: the publication date of the version cannot be read (${JSON.stringify(published ?? null)})`);
    else if (versionAge < MIN_VERSION_AGE_DAYS) failures.push(`${name}@${version}: published ${versionAge} days ago (minimum ${MIN_VERSION_AGE_DAYS})`);
  }
  if (!doc.repository) failures.push(`${name}: no repository in its metadata`);
  const rawDownloads = dl.missing ? 0 : dl.body?.downloads;
  const weekly = typeof rawDownloads === 'number' ? rawDownloads : NaN;
  if (!Number.isFinite(weekly)) failures.push(`${name}: the weekly downloads cannot be read (${JSON.stringify(rawDownloads ?? null)})`);
  else if (weekly < MIN_WEEKLY_DOWNLOADS) failures.push(`${name}: ${weekly} downloads last week (minimum ${MIN_WEEKLY_DOWNLOADS})`);
  const scripts = Object.keys(v?.scripts ?? {}).filter((s) => INSTALL_SCRIPTS.includes(s));
  if (scripts.length) failures.push(`${name}@${version}: declares install scripts (${scripts.join(', ')})`);
  return failures;
}

export async function vet(manager, specs) {
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) return { ok: false, failures: [`${manager}: only npm, pnpm, yarn and bun installs are vetted`] };
  if (!specs.length) return { ok: false, failures: ['no package named'] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BUDGET_MS);
  try {
    const results = await Promise.all(specs.map((s) => vetOne(s, controller.signal)));
    const failures = results.flat();
    return { ok: failures.length === 0, failures };
  } catch (e) {
    const why = controller.signal.aborted ? `the registry did not answer within ${BUDGET_MS / 1000} s` : `the registry could not be reached (${e.message})`;
    return { ok: false, failures: [why] };
  } finally {
    clearTimeout(timer);
  }
}

if (process.argv[1] && /vet-package\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const [manager, ...specs] = process.argv.slice(2);
  vet(manager ?? '', specs).then((r) => process.stdout.write(`${JSON.stringify(r)}\n`));
}
