# Q1 context pack latency, before and after the batched read (DIS-39, task group 39c)

**Change:** `explain-use-case` · **Tasks:** 9.1 (before), 9.11 (after) · **Design:** D9, D10 ·
**Date:** 2026-10-13 · **Machine:** the author's Windows 11 workstation, local Postgres in Docker.

## Method

A scratchpad `tsx` script (never committed) that:

1. copies `fixtures/acme-shop` (without `.git`) to a temporary directory and rebuilds its history
   there with `buildOne`;
2. opens one transaction on the local database, indexes the copy inside it under a unique name
   (`measure-<timestamp>`; the committed sample already holds `acme-shop`) and rolls the transaction
   back at the end, so the local database ends as it started;
3. builds the pack of Q1 (`¿Cómo se calcula el precio final de un pedido?`, budget 8000, 2 hops)
   three times with `gitSourceTreeWith` over a wrapper of `spawnReaderGit` that counts the processes
   it starts, plus 2 per `readFileAt` / `readFilesAt` call for `assertRepositoryRoot`, which runs
   through simple-git and is not seen by the wrapper (so the figure is comparable to DIS-28's ≈145);
4. times each build with `performance.now()` and deletes the temporary copy in `finally`.

`SELECT count(*) FROM project` was 0 before and 0 after each run.

## Results

| | Files read | Single-file reads | Batched reads | Git processes | Time per run (ms) | Median (ms) |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Before (per-file `readFileAt`) | 29 | 29 | 0 | 145 | 10 970 · 10 643 · 10 825 | **10 825** |
| After (one `readFilesAt`) | 29 | 0 | 1 | 6 | 625 · 565 · 580 | **580** |

The processes per pack go from five per file (two repository checks, `cat-file --batch-check`,
`ls-tree`, `cat-file blob`) to six in all: two repository checks, the commit check, one `ls-tree`
of the whole tree, one `cat-file --batch-check` over the requested objects and one
`cat-file --batch`. The median time drops by about 18×.

## Limits

- Measured on acme-shop only (a small repository): the whole-tree `ls-tree` grows with the number of
  entries of the repository, not with the pack, and that cost is not visible here (design, Risks).
- Wall time on one Windows machine, three runs; it shows the order of magnitude, not a benchmark.

## Decision on a cap of the files a pack reads

Pending the author (task 9.11): she reads the median above and decides whether to cap the files a pack
reads; the decision and its threshold go to `design.md` → Follow-ups.
