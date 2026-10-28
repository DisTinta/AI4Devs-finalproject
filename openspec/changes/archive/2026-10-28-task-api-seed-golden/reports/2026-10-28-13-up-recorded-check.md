# Task 13.6: recorded check "Up builds the fixture history the seed indexed"

*Agent's text. Run of 2026-10-28, after the archive step of the autonomous run stopped (design Follow-ups AR1).*

Setting: a clean clone of `feature/dis-32-task-api-seed-golden` at `e032cd4` in the scratchpad
(`git clone --config core.longpaths=true`), with no `fixtures/acme-shop/.git` and no
`fixtures/task-api/.git`. Its `.env` is a copy of `.env.example`, with `POSTGRES_PORT=55442` and that port
in `DATABASE_URL`, and the Compose project name is `dis32upcheck`. Before the check, ports 3000, 5173 and
55442 were free. A Node driver started `npm run up` in Git Bash. Once it printed `Server listening`, the
driver ended the process tree with `taskkill /T /F`, because the tool cannot send Ctrl+C. It then ran the
checks and started `up` a second time over the existing `.git` directories. At the end,
`docker compose down -v` removed the clone's volume and network.

`[up]` lines and builder summaries, the same in both runs (the absolute paths shortened):

```text
[up] docker compose up -d --wait
[up] npm install
[up] npm run db:migrate
[up] npm run db:seed
[up] node fixtures/build-history.mjs acme-shop
acme-shop: 32 commits, 3 authors -> <clone>\fixtures\acme-shop\.git
[up] node fixtures/build-history.mjs task-api
task-api: 28 commits, 3 authors -> <clone>\fixtures\task-api\.git
[up] npm run dev
{"level":30,…,"msg":"Server listening at http://127.0.0.1:3000"}
```

Run 1 took 105 s to reach the listening API and run 2 took 35 s.

| Check | Run 1 | Run 2 |
|---|---|---|
| `git -C fixtures/acme-shop rev-parse HEAD` | `4f028db4d51a3321031f3a24b3f36240410ed38c` | same |
| `git -C fixtures/task-api rev-parse HEAD` | `83397076ae519d2cd8dc43af627e4efacae6ca21` | same |
| `git status --porcelain` of the clone | empty | empty |
| `npm run verify` | six `✓` lines, `acme-shop: 3/3 golden answers match`, `task-api: 3/3 golden answers match`, exit 0 | same, exit 0 |
| `git hash-object seeds/graph-dump.sql seeds/cache/acme-shop.json seeds/cache/task-api.json fixtures/build-history.mjs` | `be94e85…`, `1c14cb0…`, `661d181…`, `69ba33e…` | same |

Both `HEAD`s equal the `indexed_commit` of their project in `seeds/graph-dump.sql`. The four hashes equal
those of the branch (`be94e857ab3d407a760ded8c208dbd56d812c34b`, `1c14cb0af873ebfcc5cd11d587bbf149f204349f`,
`661d18191d9d42a0b8831c3ef9e811bc0d572c76`, `69ba33edcdafba6230bc2a316e4f88724156c4bb`). The author's
database was not touched.
