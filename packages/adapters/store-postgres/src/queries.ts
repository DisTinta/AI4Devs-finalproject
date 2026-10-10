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

// --- Reads (DIS-24 design D4–D6). Every project-scoped read starts from the project row and
// LEFT JOINs its results, so the statement itself says whether the project exists: zero rows means
// no project, one row with NULL result columns means no result.

/** Project columns every project read returns, from `project p`. */
const PROJECT_COLUMNS = `
  p.id, p.name, p.root_path, p.language, p.framework, p.is_sample, p.indexed_commit, p.indexed_at,
  p.node_count, p.edge_count, p.created_at`;

/** Reads one project by id; no row when there is none. */
export const SELECT_PROJECT = `SELECT ${PROJECT_COLUMNS} FROM project p WHERE p.id = $1`;

/** Lists every project by name ascending (byte order, so the result does not depend on the collation). */
export const LIST_PROJECTS = `SELECT ${PROJECT_COLUMNS} FROM project p ORDER BY p.name COLLATE "C"`;

/**
 * Sum of `query_log.cost_usd` of every project from `$1` on; `NULL` costs are ignored and no row
 * gives `0`. Cast to text so the exact `numeric` reaches the adapter, which converts it to a number.
 */
export const SUM_COST_SINCE = `SELECT COALESCE(SUM(cost_usd), 0)::text AS total FROM query_log WHERE created_at >= $1`;

/**
 * Finds the project's symbols whose name contains `$2`, case-insensitively. `$2` arrives with `\`,
 * `%` and `_` already escaped, so it matches literally. `$3` is the kinds filter, or `NULL` for all.
 * Filtering starts at `file.project_id`, then reaches symbols by `file_id`.
 */
export const FIND_SYMBOLS = `
  SELECT p.id AS project_id, s.id, s.file_id, s.path, s.name, s.kind, s.start_line, s.end_line, s.signature
    FROM project p
    LEFT JOIN LATERAL (
      SELECT sy.id, f.id AS file_id, f.path, sy.name, sy.kind, sy.start_line, sy.end_line, sy.signature
        FROM file f JOIN symbol sy ON sy.file_id = f.id
       WHERE f.project_id = p.id
         AND sy.name ILIKE '%' || $2 || '%' ESCAPE '\\'
         AND ($3::symbol_kind[] IS NULL OR sy.kind = ANY($3::symbol_kind[]))
    ) s ON true
   WHERE p.id = $1
   ORDER BY s.path COLLATE "C", s.start_line, s.name COLLATE "C"`;

/** Target of the edge `e` as a node: its type and its id. */
const EDGE_TARGET = `
  CASE WHEN e.target_symbol_id IS NOT NULL THEN 'symbol' ELSE 'file' END, COALESCE(e.target_symbol_id, e.target_file_id)`;

/** Source of the edge `e` as a node: its type and its id. */
const EDGE_SOURCE = `
  CASE WHEN e.source_symbol_id IS NOT NULL THEN 'symbol' ELSE 'file' END, COALESCE(e.source_symbol_id, e.source_file_id)`;

/**
 * The project's nodes reachable from the seeds (`$2` symbol ids, `$3` file ids) in 1..`$4` steps,
 * following edges in direction `$6` (`out`: source → target; `in`: target → source; `both`: either
 * way at each step), only of kinds `$5` (`NULL` for all). One statement (DIS-24 design D6, DIS-27
 * design D4):
 * - `seed` keeps only seeds that are nodes of the project, so a foreign or unknown id reaches nothing;
 * - `walk` carries the nodes each path visited and never steps onto one again (cycles), stops at
 *   `$4`, and follows only edges of the project. Four lateral branches: the two `out` branches match
 *   the current node as the edge's source and emit its target, the two `in` branches match it as the
 *   target and emit the source; `$6` switches each pair on or off. Each branch matches one partial
 *   endpoint index (`edge_{source,target}_{symbol,file}_kind_idx`);
 * - `reached` keeps each node once with its minimum distance, seeds excluded;
 * - the reached nodes are filtered by project inside the LEFT JOINed subquery, so an edge of the
 *   project pointing at another project's node (which the writer never produces) never returns
 *   that node, and filtering every node out still leaves the project row (no false
 *   `ProjectNotFound`).
 */
export const NEIGHBORS = `
  WITH RECURSIVE
  seed (node_type, node_id) AS (
    SELECT 'symbol'::text, s.id FROM symbol s JOIN file f ON f.id = s.file_id
     WHERE f.project_id = $1 AND s.id = ANY($2::uuid[])
    UNION
    SELECT 'file'::text, f.id FROM file f WHERE f.project_id = $1 AND f.id = ANY($3::uuid[])
  ),
  walk (node_type, node_id, depth, visited) AS (
    SELECT node_type, node_id, 0, ARRAY[node_type || ':' || node_id] FROM seed
    UNION ALL
    SELECT nx.node_type, nx.node_id, w.depth + 1, w.visited || (nx.node_type || ':' || nx.node_id)
      FROM walk w
      CROSS JOIN LATERAL (
        SELECT ${EDGE_TARGET} FROM edge e
         WHERE $6::text IN ('out', 'both')
           AND w.node_type = 'symbol' AND e.source_symbol_id = w.node_id AND e.project_id = $1
           AND ($5::edge_kind[] IS NULL OR e.kind = ANY($5::edge_kind[]))
        UNION ALL
        SELECT ${EDGE_TARGET} FROM edge e
         WHERE $6::text IN ('out', 'both')
           AND w.node_type = 'file' AND e.source_file_id = w.node_id AND e.project_id = $1
           AND ($5::edge_kind[] IS NULL OR e.kind = ANY($5::edge_kind[]))
        UNION ALL
        SELECT ${EDGE_SOURCE} FROM edge e
         WHERE $6::text IN ('in', 'both')
           AND w.node_type = 'symbol' AND e.target_symbol_id = w.node_id AND e.project_id = $1
           AND ($5::edge_kind[] IS NULL OR e.kind = ANY($5::edge_kind[]))
        UNION ALL
        SELECT ${EDGE_SOURCE} FROM edge e
         WHERE $6::text IN ('in', 'both')
           AND w.node_type = 'file' AND e.target_file_id = w.node_id AND e.project_id = $1
           AND ($5::edge_kind[] IS NULL OR e.kind = ANY($5::edge_kind[]))
      ) AS nx (node_type, node_id)
     WHERE w.depth < $4
       AND NOT (nx.node_type || ':' || nx.node_id) = ANY(w.visited)
  ),
  reached AS (
    SELECT node_type, node_id, min(depth) AS distance FROM walk
     WHERE depth > 0 AND (node_type, node_id) NOT IN (SELECT node_type, node_id FROM seed)
     GROUP BY node_type, node_id
  )
  SELECT p.id AS project_id, n.*
    FROM project p
    LEFT JOIN (
      SELECT r.node_type, r.node_id AS id, r.distance,
             s.file_id, COALESCE(f.path, sf.path) AS path, f.kind AS file_kind,
             s.name, s.kind, s.start_line, s.end_line, s.signature
        FROM reached r
        LEFT JOIN file f ON r.node_type = 'file' AND f.id = r.node_id
        LEFT JOIN symbol s ON r.node_type = 'symbol' AND s.id = r.node_id
        LEFT JOIN file sf ON sf.id = s.file_id
       WHERE f.project_id = $1 OR sf.project_id = $1
    ) n ON true
   WHERE p.id = $1
   ORDER BY n.distance, n.node_type = 'symbol', n.path COLLATE "C", n.start_line, n.name COLLATE "C"`;
