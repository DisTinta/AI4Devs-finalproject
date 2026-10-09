# Manual Interface Testing Report

- Date: 2026-10-09
- Change: seed-load-and-projects (DIS-92)
- Step: 12. Backend: Manual Interface Testing
- Environment: Windows 11, Git Bash, Docker Desktop, `pgvector/pgvector:pg16` from `docker compose`;
  `DATABASE_URL` and `AUTHOR_HASH_SALT` loaded from `.env` without printing them (`set -a; . ./.env; set +a`).
  The OS user name is masked as `<user>` in paths.

## 12.1 Initial state

- local `project` rows: 0; `git status --porcelain fixtures`: empty
- `seeds/graph-dump.sql` and `packages/web/src/data/sample-projects.ts`: the regeneration of task 7.2
  (`a677e3e8…`, `62a2b908…`)

## 12.2 `npm run db:seed`, twice

```text
$ npm run --silent db:seed            # run 1
1 project loaded
  acme-shop  php/laravel  174 nodes · 170 edges
exit=0, stderr empty
a794456d-6d1b-5b55-a360-13fec83dc7bc|acme-shop|t|174|170

$ npm run --silent db:seed            # run 2
1 project loaded
  acme-shop  php/laravel  174 nodes · 170 edges
exit=0, stderr empty
a794456d-6d1b-5b55-a360-13fec83dc7bc|acme-shop|t|174|170
```

Same stdout, same id, same counts: idempotent.

## 12.3 `npm run cli -- projects`, an own project, and loading again

```text
$ npm run --silent cli -- projects
acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample
exit=0

# own project: a copy of fixtures/acme-shop with its history rebuilt by buildOne under
# C:/Users/<user>/AppData/Local/Temp/claude/…/scratchpad/repos-u5pjlE (the allowed root)
$ ALLOWED_REPOS_DIR=<that dir> npm run --silent cli -- index acme-shop --name dis92-manual --language php
Indexed project 00c309cd-5b92-471b-bb9d-056e5834e3a4
  commit:      4f028db4d51a3321031f3a24b3f36240410ed38c
  framework:   laravel (detected)
exit=0

$ npm run --silent cli -- projects
acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample
dis92-manual  00c309cd-5b92-471b-bb9d-056e5834e3a4  php/laravel  174 nodes · 170 edges  2026-10-09T08:46:44.058Z

$ npm run --silent db:seed
1 project loaded
  acme-shop  php/laravel  174 nodes · 170 edges
a794456d-6d1b-5b55-a360-13fec83dc7bc|acme-shop|t|174|170|2024-05-06 09:31:00+00
00c309cd-5b92-471b-bb9d-056e5834e3a4|dis92-manual|f|174|170|2026-10-09 08:46:44.058622+00
```

The own project keeps its id, counts and `indexed_at`. The real indexing of the fixture gives the same counts as the
seed (174 / 170).

## 12.4 Error cases

```text
$ DATABASE_URL= npm run --silent db:seed
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
exit=1

$ DATABASE_URL='postgres://u:s3cret@127.0.0.1:1/db' npm run --silent db:seed
stdout=[]  stderr={"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}
exit=1     occurrences of "s3cret" or "postgres://" in stderr: 0

# non-sample acme-shop: the loaded sample deleted with psql, then the fixture copy indexed as "acme-shop"
$ npm run --silent db:seed
{"error":{"code":"PROJECT_NAME_TAKEN","message":"a project named \"acme-shop\" already exists and is not a sample","details":{"name":"acme-shop"}}}
exit=1     project rows and file count identical before and after ("db unchanged")
e906dc40-b922-4756-b359-7dbd9337205f|acme-shop|f|174|170
00c309cd-5b92-471b-bb9d-056e5834e3a4|dis92-manual|f|174|170

$ npm run --silent cli -- projects extra
{"error":{"code":"USAGE","message":"too many arguments. Expected 0 arguments but got 1.","details":{}}}
exit=2

$ npm run --silent cli -- projects --json
{"error":{"code":"USAGE","message":"unknown option '--json'","details":{}}}
exit=2
```

## 12.5 `make up` (Git Bash)

Run with `timeout 180 make up` after removing the manual projects (database at 0 projects):

```text
npm run db:migrate
No migrations to run!
npm run db:seed
1 project loaded
  acme-shop  php/laravel  174 nodes · 170 edges
[1]   VITE v5.4.21  ready in 1005 ms
[0] {"level":30,…,"msg":"Server listening at http://0.0.0.0:3000"}
```

Exit 124: the timeout stopped `npm run dev` while it was serving (the `npm error code 143` lines are that SIGTERM).
No process was left listening on 3000 or 5173. `npm install` did not change `package-lock.json`. The line differs from
the illustrative `2 projects loaded` block of `readme.md` §1.4 until CM-HU-18 (PH-02, design D5).

## 12.6 State restored

- Deleted `dis92-manual` and the manual non-sample `acme-shop` (before 12.5), and the sample loaded by `make up`
  (after): local `project` rows back to 0, as at baseline
- `git status --porcelain fixtures`: empty; `git clean -ndX fixtures/acme-shop`: empty
- `seeds/graph-dump.sql` and `packages/web/src/data/sample-projects.ts`: unchanged since task 7.2
- The scratchpad copy of the fixture stays in the session scratchpad (outside the repository)

## Outcome

- Status: PASS
- Blocking issues: none
