import { randomUUID } from 'node:crypto';
import type { ClientBase } from 'pg';
import { InvalidStoreQuery, ProjectNotFound } from '@codemind/core';
import type { ClaimItem, SavedClaim, StoredClaim, StoredEvidence } from '@codemind/core';
import { CHECK_CLAIM_FILES, INSERT_CLAIMS, INSERT_EVIDENCE } from './queries.js';

// The claim write and the row mapping of the overlap read (DIS-39 design D7, D11). The ids are
// generated here, so each table is written by one statement and the ids map to the input order
// without relying on the order of `RETURNING`.

/**
 * Writes the validated claims of one answer on `client`, which is already inside the transaction or
 * savepoint of the call: checks the project and the ownership of every cited file, inserts the
 * claims, then their evidence (the `saveEvidence` step).
 *
 * @throws ProjectNotFound when the project does not exist.
 * @throws InvalidStoreQuery naming `claims` when an evidence cites a file of another project.
 */
export async function writeClaims(client: ClientBase, projectId: string, items: ClaimItem[]): Promise<SavedClaim[]> {
  const fileIds = [...new Set(items.flatMap((item) => item.evidence.map((e) => e.fileId.toLowerCase())))];
  const { rows } = await client.query<{ owned: number }>(CHECK_CLAIM_FILES, [projectId, fileIds]);
  if (rows.length === 0) throw new ProjectNotFound(projectId);
  if (rows[0].owned !== fileIds.length) throw new InvalidStoreQuery('claims', 'must cite only files of the project');

  const saved = items.map((item) => ({ claimId: randomUUID(), evidenceIds: item.evidence.map(() => randomUUID()) }));
  const claims = items.map((item) => item.claim);
  await client.query(INSERT_CLAIMS, [
    projectId,
    saved.map((entry) => entry.claimId),
    claims.map((claim) => claim.subject),
    claims.map((claim) => claim.predicate),
    claims.map((claim) => claim.object),
    claims.map((claim) => claim.layer),
    claims.map((claim) => claim.type),
    claims.map((claim) => claim.confidence),
    claims.map((claim) => claim.status),
    claims.map((claim) => (claim.provenance === undefined ? null : JSON.stringify(claim.provenance))),
  ]);

  const evidence = items.flatMap((item, i) =>
    item.evidence.map((e, j) => ({ ...e, id: saved[i].evidenceIds[j], claimId: saved[i].claimId })),
  );
  await client.query(INSERT_EVIDENCE, [
    evidence.map((e) => e.id),
    evidence.map((e) => e.claimId),
    evidence.map((e) => e.fileId),
    evidence.map((e) => e.startLine),
    evidence.map((e) => e.endLine),
    evidence.map((e) => e.verification),
    evidence.map((e) => e.excerpt),
  ]);
  return saved;
}

/** A row of `FIND_CLAIMS_OVERLAPPING`; every column is `NULL` when no claim matched. */
export interface ClaimRow {
  id: string | null;
  subject: string;
  predicate: string;
  object: string | null;
  layer: string;
  type: string;
  confidence: number | null;
  status: string;
  provenance: Record<string, unknown> | null;
  created_at: Date;
  evidence: StoredEvidence[];
}

/** Maps a matched row of `FIND_CLAIMS_OVERLAPPING` to a stored claim of `projectId`. */
export function toStoredClaim(projectId: string, row: ClaimRow): StoredClaim {
  return {
    id: row.id as string,
    projectId: projectId.toLowerCase(),
    subject: row.subject,
    predicate: row.predicate,
    object: row.object,
    layer: row.layer,
    type: row.type,
    status: row.status,
    confidence: row.confidence,
    ...(row.provenance !== null && { provenance: row.provenance }),
    createdAt: row.created_at.toISOString(),
    evidence: row.evidence,
  } as StoredClaim;
}
