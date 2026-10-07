# Show Spec Working — index-repository (DIS-85)

- Date: 2026-10-07
- Change: index-repository (DIS-85)
- Interface: the core API `indexRepository` and the `SourceTreePort` adapter `createGitSourceTree`,
  composed with the real adapters (`createPhpAnalyzer`, `createSimpleGitHistory`,
  `createPostgresStore`) against the real Postgres of `docker compose`. No CLI command or route calls
  the use case yet (DIS-86), so there is no UI and no HTTP endpoint to exercise.
- Driver: `node <scratchpad>/demo-index.mjs`, a scratch script outside the repository, importing the
  built `dist` of the workspace packages (`npx tsc --build` first). It builds throwaway repositories
  under a fresh OS temp dir (`<ROOT>`, the allowed root) and a second temp dir outside it
  (`<OUTSIDE>`), copies `fixtures/acme-shop` and `fixtures/task-api` (without `.git`) and rebuilds
  their history with `buildOne`. Every indexing runs on one `pg` client inside `BEGIN`, with the store
  built as `createPostgresStore({ transaction: client })`, and the script ends with **`ROLLBACK`** and
  removes both temp dirs in a `finally`.
- Each real port is wrapped to record its calls (`realPath`, `readFiles`, `analyze`, `readHistory`,
  `createProject`, `saveGraph`) and the progress phases. Cases marked **[fault injected]** replace
  one port's result with a failure that real Git cannot produce once `readFiles` has succeeded (a
  history that fails or has no `head`, an analyzer edge to a missing symbol); the other ports stay
  real. The hygiene case injects the entries real Git refuses to commit (shown below).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Only the files tracked at HEAD are read | `readFiles` on a repo with `a.php` modified, `b.php` untracked, `ignored.php` ignored | `files` = `.gitignore`, `a.php` (committed content); `skipped` = `[]` | Yes | E1 |
| A path that is not a repository root is rejected | `readFiles` on a missing path, a plain dir, a repo subdirectory | 3 × `NotAGitRepository` | Yes | E2 |
| A repository with no commit is rejected | `readFiles` on `git init` with no commit | `EmptyRepository`, `code = EMPTY_REPOSITORY` | Yes | E3 |
| Symbolic links and submodules are skipped and reported | `readFiles` on a HEAD with modes `120000` and `160000` | only `app/Real.php`; `lib/link.php` `symlink`, `vendor/sub` `submodule` | Yes | E4 |
| Content that is not UTF-8 is skipped and reported | `readFiles` on `ok.php` + `logo.bin` (`89 c3 28 00 ff`) | only `ok.php`; `logo.bin` `binary-content` | Yes | E5 |
| The real path follows symbolic links | `realPath` on a junction, then on a missing path | real target path; `NotAGitRepository` | Yes | E6 |
| Progress phases are reported once and in order | index acme-shop with a progress spy and call recorder | `confine > read > redact > analyze > history > save`; calls `realPath ×2 > readFiles > analyze > readHistory > createProject > saveGraph` | Yes | E8 |
| A path outside the allowed root is rejected before reading | `repoPath = '../etc'` | `ForbiddenPathError`; phases `confine`; no port call | Yes | E10 |
| Indexing is disabled without an allowed root | `allowedRoot = ''` | `IndexingDisabled`; phases `confine`; no port call | Yes | E10 |
| A symbolic link escaping the allowed root is rejected before reading | `repoPath = 'escape'`, a junction to `<OUTSIDE>` | `ForbiddenPathError`; phases `confine`; calls only `realPath ×2`; `requestedPath = 'escape'`; message hides the target | Yes | E10 |
| An allowed root that does not exist disables indexing | `allowedRoot = <ROOT>/no-such-root` | `IndexingDisabled`; phases `confine`; calls only `realPath` | Yes | E10 |
| A failure reading the source tree writes nothing | `repoPath = 'plain-dir'` (and `fresh-repo`) | `NotAGitRepository` (and `EmptyRepository`); last phase `read`; no `analyze`/`readHistory`/writes | Yes | E10 |
| A failure reading the history writes nothing | [fault injected] `readHistory` rejects / resolves without `head` | `NotAGitRepository` / `EmptyRepository`; last phase `history`; no `createProject`/`saveGraph` | Yes | E10 |
| An invalid graph creates no project | [fault injected] analyzer adds an edge to symbol `Ghost` | `InvalidGraph`; last phase `save`; no `createProject`/`saveGraph`; 0 projects with that name | Yes | E10 |
| A taken project name saves no graph | index acme-shop again with the same name | `ProjectNameTaken`; last phase `save`; `createProject` called, `saveGraph` not; row counts unchanged | Yes | E10 |
| Malformed, repeated and binary entries never reach the analyzer | real repo (A.php, D.php with NUL, symlink, history touching `app/gone.php`) + injected entries Git refuses | analyzer got only the first `app/A.php`; `skipped` exactly the 7 expected; commits saved, link to `app/gone.php` dropped, no `InvalidGraph` | Yes | E11 |
| The planted secret of acme-shop never reaches the database | query rows after indexing acme-shop | `config/services.php` `redacted = true`, hash = SHA-256 of redacted content; event at 21:44 `aws-access-key-id`; 0 `symbol`/`commit` rows match `/AKIA[A-Z0-9]{16}/` | Yes | E9 |
| The analyzer only receives redacted content | real repo with a synthetic key (built by concatenation) in `config/keys.php` and a clean file | analyzer input holds `[REDACTED: possible secret]`, 0 key substrings ≥ 8; `redacted` true / false | Yes | E12 |
| A secret in a commit message is redacted | same repo, commit message holding the key | saved message redacted; one `commitEvents` entry with the HEAD sha and `aws-access-key-id`; 0 key substrings ≥ 8 in the serialised report | Yes | E12 |
| The framework is detected from the root manifest | `detectFramework` over the 10 file sets; plus the real `task-api` tree | `laravel, laravel, fastify, fastify, laravel, none, none, none, none, none`, no throw; `task-api` → `fastify` | Yes | E7 |
| An explicit framework wins over detection | index acme-shop with `framework: 'none'` | `createProject` got `none`; report `none` / `explicit`; row `framework = none` | Yes | E8b |
| acme-shop is indexed completely | index the acme-shop copy; compare with `git rev-parse`/`rev-list` and the rows | `laravel`; `indexedCommit` = HEAD; `indexed_at` set; `node_count` 174 = 53 + 121; `edge_count` 170 = 137 + 33; 1 `co_changed` edge; 32 commits = rev-list; 0 files without a 64-hex hash | Yes | E8, E9 |

## Evidence

Verbatim output of the driver. Absolute temp paths are masked as `<ROOT>` / `<OUTSIDE>`; the two
`buildOne` progress lines printed absolute paths and are masked here too.

### Environment

```
docker compose up -d            -> Container codemind-postgres-1 Started
npm run db:migrate              -> No migrations to run!
npx tsc --build                 -> (no output, exit 0)
DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind node <scratchpad>/demo-index.mjs  -> EXIT=0
```

### E1 — Only the files tracked at HEAD are read

```
git status --short: ["M a.php","?? b.php","!! ignored.php"]
readFiles: {"files":[{"path":".gitignore","content":"ignored.php\n"},{"path":"a.php","content":"<?php // committed\n"}],"skipped":[]}
```

### E2 — Not a repository root

```
<ROOT>\does-not-exist -> NotAGitRepository NOT_A_GIT_REPOSITORY "Not a Git repository: <ROOT>\does-not-exist"
<ROOT>\plain-dir -> NotAGitRepository NOT_A_GIT_REPOSITORY "Not a Git repository: <ROOT>\plain-dir"
<ROOT>\tracked\sub -> NotAGitRepository NOT_A_GIT_REPOSITORY "Not a Git repository: <ROOT>\tracked\sub"
```

### E3 — No commit

```
EmptyRepository EMPTY_REPOSITORY "Git repository has no commit: <ROOT>\fresh-repo" code = EMPTY_REPOSITORY
```

### E4 — Symbolic links and submodules

```
git ls-tree -r HEAD: ["100644 blob e4e99d74fddb79136c4be301d17a09eecd2416c1\tapp/Real.php","120000 blob 94e4d2a8d15a7d1ca437bdd0e6f4fd08c4c4e4bb\tlib/link.php","160000 commit 7d74d1b95bdb2b93fa73c89f9b2895c590f67207\tvendor/sub"]
readFiles: {"files":[{"path":"app/Real.php","content":"<?php class Real {}\n"}],"skipped":[{"path":"lib/link.php","reason":"symlink"},{"path":"vendor/sub","reason":"submodule"}]}
```

### E5 — Not UTF-8

```
readFiles: {"files":[{"path":"ok.php","content":"<?php // ñandú ✓\n"}],"skipped":[{"path":"logo.bin","reason":"binary-content"}]}
```

### E6 — Real path

```
realPath(<ROOT>/link-dir) = <OUTSIDE>\real-dir | equals realpath(target): true
realPath(<ROOT>/nope) -> NotAGitRepository NOT_A_GIT_REPOSITORY "Not a Git repository: <ROOT>\nope"
```

### E7 — Framework detection

```
composer require laravel -> laravel
composer require-dev laravel -> laravel
package deps fastify -> fastify
package devDeps fastify -> fastify
both manifests -> laravel
no manifest -> none
composer without laravel -> none
composer invalid JSON -> none
composer require is array -> none
packages/x/package.json only -> none
task-api: 28 commits, 3 authors -> <ROOT>\task-api\.git
real fixtures/task-api copy, readFiles + detectFramework -> fastify
```

### E8 — acme-shop indexed completely

```
counts before BEGIN: {"project":"0","file":"0","symbol":"0","edge":"0","commit":"0","file_commit":"0"}
acme-shop: 32 commits, 3 authors -> <ROOT>\acme-shop\.git
phases: confine > read > redact > analyze > history > save
port calls: realPath > realPath > readFiles > analyze > readHistory > createProject > saveGraph
report: {"projectId":"64558b69-cdff-48b6-81dd-b3242c12ccca","indexedCommit":"4f028db4d51a3321031f3a24b3f36240410ed38c","framework":"laravel","frameworkSource":"detected","files":53,"filesDeleted":0,"symbols":121,"commits":32,"fileCommits":59,"edges":{"total":170,"exact":137,"heuristic":33},"events":[{"type":"secret_redacted","file":"config/services.php","line":21,"column":44,"rule":"aws-access-key-id"}],"commitEvents":[],"diagnostics":[],"skipped":[]}
project row: {"name":"dis-85-demo-acme-shop","root_path":"<ROOT>\\acme-shop","framework":"laravel","language":"php","indexed_commit":"4f028db4d51a3321031f3a24b3f36240410ed38c","indexed_at_set":true,"node_count":174,"edge_count":170}
git rev-parse HEAD: 4f028db4d51a3321031f3a24b3f36240410ed38c | git rev-list --count HEAD: 32
rootPath === realpath(<ROOT>/acme-shop): true
node_count === files + symbols: true | edge_count === edges.total: true
exact + heuristic === total: true
co_changed edges in DB: 1
commits === rev-list count: true
files without 64-hex content_hash: 0
```

### E9 — Planted secret of acme-shop

```
analyzer input config/services.php line 21:         'key' => env('AWS_ACCESS_KEY_ID', '[REDACTED: possible secret]'),
analyzer input matches AKIA key: false
file row config/services.php: {"redacted":true,"content_hash":"c5388bb002abf3e1c334a90bcadfdd25f0a2767f81f2dc07545372c8dad73573"} | sha256(redacted content) matches: true
report.events: [{"type":"secret_redacted","file":"config/services.php","line":21,"column":44,"rule":"aws-access-key-id"}]
symbol rows matching AKIA: 0 | commit rows matching AKIA: 0 | report matches AKIA: false
```

### E8b — Explicit framework

```
createProject received framework: none | report: {"framework":"none","frameworkSource":"explicit"}
project row framework: none
```

### E10 — Error paths

`row counts unchanged` compares the six table counts before and after each call, inside the
transaction.

```
repoPath ../etc -> ForbiddenPathError FORBIDDEN_PATH "Forbidden path: ../etc"
   phases: confine | port calls: (none) | row counts unchanged: true
allowedRoot '' -> IndexingDisabled INDEXING_DISABLED "indexing disabled (fixtures-only mode)"
   phases: confine | port calls: (none) | row counts unchanged: true
junction escaping the root -> ForbiddenPathError FORBIDDEN_PATH "Forbidden path: escape"
   phases: confine | port calls: realPath > realPath | row counts unchanged: true
   requestedPath: escape | message contains link target: false
allowedRoot that does not exist -> IndexingDisabled INDEXING_DISABLED "indexing disabled (fixtures-only mode)"
   phases: confine | port calls: realPath | row counts unchanged: true
readFiles fails (plain-dir is not a repository) -> NotAGitRepository NOT_A_GIT_REPOSITORY "Not a Git repository: <ROOT>\plain-dir"
   phases: confine > read | port calls: realPath > realPath > readFiles | row counts unchanged: true
readFiles fails (fresh-repo has no commit) -> EmptyRepository EMPTY_REPOSITORY "Git repository has no commit: <ROOT>\fresh-repo"
   phases: confine > read | port calls: realPath > realPath > readFiles | row counts unchanged: true
readHistory rejects NotAGitRepository [fault injected] -> NotAGitRepository NOT_A_GIT_REPOSITORY "Not a Git repository: <ROOT>\links"
   phases: confine > read > redact > analyze > history | port calls: realPath > realPath > readFiles > analyze > readHistory | row counts unchanged: true
readHistory resolves with no head [fault injected] -> EmptyRepository EMPTY_REPOSITORY "Git repository has no commit: <ROOT>\links"
   phases: confine > read > redact > analyze > history | port calls: realPath > realPath > readFiles > analyze > readHistory | row counts unchanged: true
analyzer returns a dangling edge [fault injected] -> InvalidGraph INVALID_GRAPH "Invalid graph: edges[0].target: symbol "Ghost" at app/Real.php:99 is not in the graph"
   phases: confine > read > redact > analyze > history > save | port calls: realPath > realPath > readFiles > analyze > readHistory | row counts unchanged: true
   projects named dis-85-demo-invalid: 0
name already taken (acme-shop again, same name) -> ProjectNameTaken PROJECT_NAME_TAKEN "Project name already taken: dis-85-demo-acme-shop"
   phases: confine > read > redact > analyze > history > save | port calls: realPath > realPath > readFiles > analyze > readHistory > createProject | row counts unchanged: true
   projects named dis-85-demo-acme-shop: 1
```

### E11 — Input hygiene

The real repository commits `app/A.php`, `app/D.php` (content with a NUL), the symbolic link
`lib/link.php`, and a history where `app/gone.php` is added and then deleted. Real Git refuses to
commit the backslash and control-character paths, so those, the duplicate `app/A.php`, `/abs.php`
and the empty path are injected right after the first `app/A.php` of the real `readFiles` output.

```
git refused path "app\\B.php": error: Invalid path 'app\B.php'
fatal: git update-index: --cacheinfo cannot add app\B.php
git refused path "app/C\u0007.php": error: Invalid path 'app/C?.php'
fatal: git update-index: --cacheinfo cannot add app/C?.php
invalid paths committed through real git: [] | entries injected after the real readFiles output: ["app/A.php","/abs.php","","app\\B.php","app/C\u0007.php"]
real readFiles paths: ["app/A.php","app/D.php"] | real skipped: [{"path":"lib/link.php","reason":"symlink"}]
analyzer received: [{"path":"app/A.php","content":"<?php class A {}\n"}]
report.skipped: [{"path":"","reason":"invalid-path"},{"path":"/abs.php","reason":"invalid-path"},{"path":"app/A.php","reason":"duplicate-path"},{"path":"app/C\u0007.php","reason":"invalid-path"},{"path":"app/D.php","reason":"binary-content"},{"path":"app\\B.php","reason":"invalid-path"},{"path":"lib/link.php","reason":"symlink"}]
commits saved: [{"message":"feat: A and gone"},{"message":"feat: D, link; drop gone"}]
file_commit links saved: [{"path":"app/A.php","message":"feat: A and gone"}]
history fileCommits mentioning app/gone.php (before filtering): 2
```

### E12 — Redacted analyzer input and commit message

The key is synthetic, built in the script as `'AKIA' + 'DEMOKEY0' + '12345678'`.

```
analyzer input config/keys.php: <?php
return ['aws' => '[REDACTED: possible secret]'];
 | 8+ char key substrings found: 0
file rows redacted flags: [{"path":"app/Clean.php","redacted":false},{"path":"config/keys.php","redacted":true}]
commit row: {"sha":"3b7e35fbe356d60cd23fae71039ecc514f6fd9fc","message":"chore: rotate [REDACTED: possible secret] for staging"} | sha matches HEAD: true | message contains key: false
report.commitEvents: [{"commit":"3b7e35fbe356d60cd23fae71039ecc514f6fd9fc","line":1,"column":15,"rule":"aws-access-key-id"}] | report.events: [{"type":"secret_redacted","file":"config/keys.php","line":2,"column":19,"rule":"aws-access-key-id"}]
serialised report: 8+ char key substrings found: 0
```

### Restoration

```
projects created inside the transaction: 4
ROLLBACK done | demo projects after ROLLBACK: 0
counts after ROLLBACK: {"project":"0","file":"0","symbol":"0","edge":"0","commit":"0","file_commit":"0"}
temp dirs removed
```

Independent check after the script, from `psql` in the container:

```
project|0
file|0
symbol|0
edge|0
commit|0
file_commit|0
```

No screenshots: the change has no UI.

## State

- Before: `project` 0, `file` 0, `symbol` 0, `edge` 0, `commit` 0, `file_commit` 0; `git status`
  clean.
- After: `project` 0, `file` 0, `symbol` 0, `edge` 0, `commit` 0, `file_commit` 0; `git status`
  clean (the fixture copies and their rebuilt `.git` lived in the temp dir; `fixtures/` untouched).
- Restored: yes. The four projects created (`dis-85-demo-acme-shop`, `-explicit`, `-hygiene`,
  `-secret`) existed only inside the transaction and were discarded by `ROLLBACK`; both temp dirs were
  deleted.

## Not demonstrated

- None of the scenarios is left out. Limits of what "real" means here:
  - No CLI or HTTP interface exists for this use case yet (DIS-86 / CM-HU-05b), so the interface
    exercised is the core API with the real adapters, not a transport.
  - Three error scenarios (history failing, history without `head`, invalid graph) need a port to
    misbehave after the real source tree succeeded; they were fault-injected on one port with the
    rest real.
  - In the hygiene scenario, real Git refuses the backslash and control-character paths (evidence
    E11) and cannot hold a duplicate path, an absolute path or an empty path, so those entries were
    injected into the real `readFiles` output; the symlink, the NUL content and the orphan
    `app/gone.php` links came from real Git.

## Handoff

The change is **demonstrably working**: every scenario of `specs/repository-indexing/spec.md` was
exercised against the real Git source tree, PHP analyzer, Git history reader and Postgres store, and
each result matches its `THEN` exactly; the database and the working tree are back to their initial
state. No screenshot or other file was left at the repository root.
