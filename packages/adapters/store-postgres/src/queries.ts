// SQL of the graph store (DIS-23 design D4). Every statement is parameterised; array parameters are
// expanded with unnest, so each table is written by one statement whatever the graph size. Enum
// columns arrive as text arrays and are cast to their enum array type.

/** Inserts a project and returns its id. */
export const INSERT_PROJECT = `
  INSERT INTO project (name, root_path, language, framework, is_sample)
  VALUES ($1, $2, $3, $4, $5)
  RETURNING id`;

/** Locks the project row: concurrent graph writes of one project run one after the other. */
export const LOCK_PROJECT = `SELECT id FROM project WHERE id = $1 FOR UPDATE`;

/** Deletes every edge of the project (symbols and edges are replaced by the snapshot). */
export const DELETE_EDGES = `DELETE FROM edge WHERE project_id = $1`;

/** Deletes every symbol of the project. Only edges reference symbols, and they are already gone. */
export const DELETE_SYMBOLS = `
  DELETE FROM symbol WHERE file_id IN (SELECT id FROM file WHERE project_id = $1)`;

/**
 * Marks `stale` the project's `current` claims with evidence citing a file whose path is not in
 * `$2`. Runs right before {@link DELETE_ABSENT_FILES}: the stale trigger fires only on UPDATE, and
 * once the delete has cascaded the evidence there is nothing left to find the claims by.
 */
export const MARK_CLAIMS_STALE_FOR_ABSENT_FILES = `
  UPDATE claim SET status = 'stale', updated_at = now()
   WHERE project_id = $1 AND status = 'current'
     AND EXISTS (SELECT 1 FROM evidence e JOIN file f ON f.id = e.file_id
                  WHERE e.claim_id = claim.id AND f.project_id = $1 AND f.path <> ALL($2::text[]))`;

/** Deletes the project's files whose path is not in `$2`; the schema cascades what cites them. */
export const DELETE_ABSENT_FILES = `
  DELETE FROM file WHERE project_id = $1 AND path <> ALL($2::text[])`;

/**
 * Inserts or updates the files in place by `(project_id, path)`, in path order, and returns every
 * id. Keeping the id keeps `file_commit` and `evidence`; changing `content_hash` fires the stale
 * trigger. `embedding` is never written, so a reindex does not clear one computed later.
 */
export const UPSERT_FILES = `
  INSERT INTO file (project_id, path, kind, loc, content_hash, redacted)
  SELECT $1, f.path, f.kind, f.loc, f.content_hash, f.redacted
    FROM unnest($2::text[], $3::file_kind[], $4::integer[], $5::text[], $6::boolean[])
         AS f(path, kind, loc, content_hash, redacted)
   ORDER BY f.path
  ON CONFLICT (project_id, path) DO UPDATE
     SET kind = EXCLUDED.kind, loc = EXCLUDED.loc,
         content_hash = EXCLUDED.content_hash, redacted = EXCLUDED.redacted
  RETURNING id, path`;

/** Inserts symbols and returns what identifies each one. */
export const INSERT_SYMBOLS = `
  INSERT INTO symbol (file_id, name, kind, start_line, end_line, signature)
  SELECT * FROM unnest($1::uuid[], $2::text[], $3::symbol_kind[], $4::integer[], $5::integer[], $6::text[])
  RETURNING id, file_id, name, start_line`;

/** Inserts edges; each endpoint is one non-null column of its pair. */
export const INSERT_EDGES = `
  INSERT INTO edge (project_id, source_symbol_id, source_file_id, target_symbol_id, target_file_id,
                    kind, resolution, extractor, weight)
  SELECT $1, e.* FROM unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::uuid[], $6::edge_kind[],
                             $7::edge_resolution[], $8::text[], $9::double precision[]) AS e`;

/**
 * Inserts or updates commits by `(project_id, sha)` and returns every id. History is only added
 * to: a value the snapshot omits (`NULL`) keeps the stored one; a given value overwrites it.
 */
export const UPSERT_COMMITS = `
  INSERT INTO commit (project_id, sha, message, author_hash, committed_at, pr_number)
  SELECT $1, c.* FROM unnest($2::text[], $3::text[], $4::text[], $5::timestamptz[], $6::integer[]) AS c
  ON CONFLICT (project_id, sha) DO UPDATE
     SET message = COALESCE(EXCLUDED.message, commit.message),
         author_hash = COALESCE(EXCLUDED.author_hash, commit.author_hash),
         committed_at = COALESCE(EXCLUDED.committed_at, commit.committed_at),
         pr_number = COALESCE(EXCLUDED.pr_number, commit.pr_number)
  RETURNING id, sha`;

/**
 * Inserts or updates file–commit links by `(file_id, commit_id)`, with the same rule as commits:
 * an omitted count keeps the stored one.
 */
export const UPSERT_FILE_COMMITS = `
  INSERT INTO file_commit (file_id, commit_id, lines_added, lines_removed)
  SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::integer[], $4::integer[])
  ON CONFLICT (file_id, commit_id) DO UPDATE
     SET lines_added = COALESCE(EXCLUDED.lines_added, file_commit.lines_added),
         lines_removed = COALESCE(EXCLUDED.lines_removed, file_commit.lines_removed)`;

/**
 * Records the snapshot on the project: exactly these four columns. `clock_timestamp()`, not
 * `now()`: inside a caller-owned transaction `now()` is when that transaction began.
 */
export const UPDATE_PROJECT_INDEX = `
  UPDATE project
     SET indexed_commit = $2, indexed_at = clock_timestamp(), node_count = $3, edge_count = $4
   WHERE id = $1`;
