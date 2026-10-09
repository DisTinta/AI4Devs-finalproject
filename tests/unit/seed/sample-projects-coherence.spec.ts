import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { seedProjects } from '../../../packages/cli/src/seed/parse-seed';
import { SAMPLE_PROJECTS } from '../../../packages/web/src/data/sample-projects';

// Spec: openspec/changes/seed-load-and-projects/specs/seed-build/spec.md → "Sample-project constant".
// The versioned constant and the versioned seed must describe the same projects: regenerating one
// without the other fails here (DIS-92 design D8). DIS-60 relies on this test instead of its own.

describe('sample-project constant', () => {
  it('The versioned constant matches the versioned seed', () => {
    // Arrange
    const seed = seedProjects(readFileSync(resolve('seeds/graph-dump.sql'), 'utf8'));

    // Act
    const constant = SAMPLE_PROJECTS.map((project) => ({ ...project }));

    // Assert
    expect(seed.length).toBeGreaterThan(0);
    expect(constant).toEqual(
      seed.map((project) => ({
        id: project.id,
        name: project.name,
        language: project.language,
        framework: project.framework,
        fileCount: project.fileCount,
        symbolCount: project.symbolCount,
        edgeCount: project.edgeCount,
        commitCount: project.commitCount,
      })),
    );
  });
});
