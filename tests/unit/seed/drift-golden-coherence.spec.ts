import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDriftGoldenFile, DRIFT_GOLDEN, driftFingerprint, renderDriftGoldenFile } from '../../../packages/cli/src/cache/drift-golden-file';
import { headerFingerprints, indexedCommitOf } from '../../../packages/cli/src/cache/seed-header';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';

// Spec: openspec/changes/add-cli-drift/specs/drift-golden/spec.md (DIS-73) → "The versioned golden drift
// file is coherent". Unlike the coherence test of the `explain` golden answers, this one also checks the
// freshness of the fingerprints (design D8, ADR 20261103-drift-golden-freshness-in-unit-suite): `verify`
// does not read this file, so a stale one would otherwise go unnoticed. The failure message of a stale
// fingerprint names the command that regenerates it.

const SEED = readFileSync(resolve('seeds/graph-dump.sql'), 'utf8');
const README = readFileSync(resolve('fixtures/README.md'), 'utf8');

/** The paths of the `file` rows of the seed for the project `projectId`. */
function seedPaths(projectId: string): Set<string> {
  const paths = new Set<string>();
  for (const line of SEED.split('\n')) {
    const match = /^INSERT INTO file \(id, project_id, path,[^)]*\) VALUES \('([^']+)', '([^']+)', '((?:[^']|'')*)'/.exec(line);
    if (match !== null && match[2] === projectId) paths.add(match[3]!.replace(/''/g, "'"));
  }
  return paths;
}

describe('versioned golden drift file', () => {
  it('The versioned golden drift file matches the seed, the table and the code', () => {
    // Arrange
    const text = readFileSync(resolve('seeds/drift/acme-shop.json'), 'utf8');
    const projects = seedProjects(SEED);
    const project = projects.find((candidate) => candidate.name === DRIFT_GOLDEN.project)!;

    // Act
    const file = checkDriftGoldenFile(JSON.parse(text), { seedProjectNames: projects.map((candidate) => candidate.name), fileName: 'acme-shop.json' });

    // Assert
    expect(file).toBeDefined();
    expect(file!.project).toBe('acme-shop');
    expect(renderDriftGoldenFile(file!)).toBe(text);
    expect(text).not.toMatch(/AKIA[A-Z0-9]{16}/);

    // One entry, Q5 under `drift:`, the id of the documentation-drift row of the acme-shop table.
    expect(file!.entries.map(({ id, key }) => ({ id, key }))).toEqual([{ id: DRIFT_GOLDEN.id, key: DRIFT_GOLDEN.key }]);
    const row = new RegExp(`^\\| ${DRIFT_GOLDEN.id} \\| ¿La documentación de precios coincide con el código\\?`, 'm');
    expect(README).toMatch(row);

    // The seed it was built on, and the code that built it.
    const header = headerFingerprints(SEED)!;
    expect(file!.seed, 'stale seed fingerprints: run npm run drift:build').toEqual({
      analyzerFingerprint: header.analyzer,
      contractFingerprint: header.contract,
    });
    expect(file!.driftFingerprint, 'stale drift fingerprint: run npm run drift:build').toBe(driftFingerprint(resolve('.')));

    // The commit and every cited path are the seed's.
    expect(file!.entries[0]!.response.commit).toBe(indexedCommitOf(SEED, 'acme-shop'));
    const paths = seedPaths(project.id);
    expect(paths.size).toBeGreaterThan(0);
    for (const document of file!.entries[0]!.response.documents) {
      for (const contradiction of document.contradictions) {
        expect(paths.has(contradiction.claim.path)).toBe(true);
        for (const evidence of contradiction.evidence) expect(paths.has(evidence.path)).toBe(true);
      }
    }

    // seeds/drift/ holds no other golden drift file.
    expect(readdirSync(resolve('seeds/drift')).filter((name) => name.endsWith('.json')).sort()).toEqual(['acme-shop.json']);
  });
});
