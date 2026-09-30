import type { KnowledgeGraph, SaveGraphResult } from '../knowledge/graph.js';
import type { NewProject } from '../knowledge/project.js';

/**
 * Persists the knowledge graph. The domain talks to this port and never sees SQL.
 *
 * This slice (DIS-23) is the write side; graph reads are added by DIS-24.
 */
export interface StorePort {
  /**
   * Creates an unindexed project (no counts, no indexed commit) and returns its id. `framework` is
   * fixed here: no other operation of the port changes it.
   *
   * @throws ProjectNameTaken when another project already has that name.
   */
  createProject(project: NewProject): Promise<string>;

  /**
   * Writes `graph` as the complete L1 snapshot of the project, in one transaction:
   * - files are updated in place by path (keeping their id) or inserted; files of the project
   *   absent from the snapshot are deleted, with what the schema cascades from them;
   * - the project's symbols and edges become exactly those of the snapshot;
   * - commits and file–commit links are upserted and never deleted;
   * - the project's `indexed_commit`, `indexed_at`, `node_count` (files + symbols) and
   *   `edge_count` are updated, and nothing else of it.
   *
   * On any failure nothing of the call remains.
   *
   * @throws InvalidGraph before writing anything, when the graph breaks a validation rule.
   * @throws ProjectNotFound when `projectId` is no project's id or is not a well-formed UUID in the
   *   hyphenated 8-4-4-4-12 form (the form `createProject` returns; braces or no hyphens count as
   *   malformed).
   */
  saveGraph(projectId: string, graph: KnowledgeGraph): Promise<SaveGraphResult>;
}
