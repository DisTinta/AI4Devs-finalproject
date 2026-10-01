## ADDED Requirements

### Requirement: Co-change edges

The domain SHALL derive co-change edges from a history's file–commit links and the set of paths
present in the snapshot (the known paths), with no I/O, as follows:

- A commit's files are the distinct paths of its links. A commit with more than 100 files SHALL be
  ignored entirely: it contributes no pair and is not counted for any file. A commit with exactly
  100 files SHALL be counted.
- For a file, `commits(F)` is the set of distinct counted commits that touch it, known path or not.
- For every unordered pair of distinct known paths {A, B} with `|commits(A) ∩ commits(B)| >= 2`
  there SHALL be exactly one edge, with:
  - `source` = the file whose path is smaller in UTF-8 byte order, `target` = the other file (both
    file endpoints, never symbols);
  - `kind` = `co_changed`, `resolution` = `heuristic`, `extractor` = `git`;
  - `weight` = `|commits(A) ∩ commits(B)| / |commits(A) ∪ commits(B)|`, a number in (0, 1].
- No other pair SHALL yield an edge. A pair with an endpoint outside the known paths yields none.
- The edges SHALL be ordered by `source` path, then `target` path, in UTF-8 byte order, and the same
  input SHALL always yield the same output.
- The derivation SHALL use only paths and shas: author data (`authorHash`) and line counts SHALL NOT
  affect the result.

#### Scenario: Files changed together form a weighted edge

- **GIVEN** links where `a.ts` and `b.ts` are both touched by commits `s1`, `s2` and `s3`, and `b.ts`
  also by `s4`
- **WHEN** the co-change edges are derived with known paths `a.ts` and `b.ts`
- **THEN** the result is exactly one edge: source file `a.ts`, target file `b.ts`, kind
  `co_changed`, resolution `heuristic`, extractor `git`, weight 0.75

#### Scenario: A single shared commit is not enough

- **GIVEN** links where `a.ts` and `b.ts` share exactly one commit, and `c.ts` shares no commit with
  either
- **WHEN** the co-change edges are derived with all three known
- **THEN** the result is empty

#### Scenario: Each pair yields one edge from the smaller path

- **GIVEN** links, listed in an arbitrary order, where `z.ts`, `m.ts` and `Z.ts` all change together
  in two commits
- **WHEN** the co-change edges are derived twice from the same input
- **THEN** both results are equal and are exactly the edges `Z.ts → m.ts`, `Z.ts → z.ts` and
  `m.ts → z.ts`, in that order, each with weight 1

#### Scenario: A path outside the snapshot yields no edge but still counts

- **GIVEN** links where `a.ts` and `b.ts` share commits `s1` and `s2`, `a.ts` and `old.ts` share
  `s1`, `s2` and `s3`, and `old.ts` is not a known path
- **WHEN** the co-change edges are derived with known paths `a.ts` and `b.ts`
- **THEN** the result is exactly one edge `a.ts → b.ts` with weight 2/3

#### Scenario: A commit with more than 100 files is ignored

- **GIVEN** links where `a.ts` and `b.ts` share commits `s1` and `s2` with no other file, and two
  commits `big1` and `big2` each touch 101 files, among them `a.ts` and `c.ts` (not `b.ts`)
- **WHEN** the co-change edges are derived with every path known
- **THEN** the result is exactly one edge `a.ts → b.ts` with weight 1

#### Scenario: A commit with exactly 100 files is counted

- **GIVEN** the links of the previous scenario, except that `big1` and `big2` each touch exactly 100
  files, among them `a.ts` and `c.ts`
- **WHEN** the co-change edges are derived with every path known
- **THEN** the result contains `a.ts → b.ts` with weight 0.5 and `a.ts → c.ts` with weight 0.5

#### Scenario: An empty history yields no edges

- **WHEN** the co-change edges are derived from no links
- **THEN** the result is empty

#### Scenario: Duplicate links in one commit count once

- **GIVEN** links where `a.ts` is touched by commits `s1` and `s2`, `b.ts` by `s1`, `s2` and `s3`,
  and the link of `a.ts` to `s1` appears twice
- **WHEN** the co-change edges are derived with known paths `a.ts` and `b.ts`
- **THEN** the result is exactly one edge `a.ts → b.ts` with weight 2/3

#### Scenario: Author hash and line counts do not affect co-change

- **GIVEN** two histories with the same commits and the same links (same paths and shas), which
  differ only in every commit's `authorHash` and in every link's `linesAdded` and `linesRemoved`
  (present in one, absent or different in the other)
- **WHEN** the co-change edges are derived from each with the same known paths
- **THEN** both results are equal

### Requirement: Co-change edges persist with the snapshot

Co-change edges derived with the snapshot's file paths as known paths SHALL be accepted by the graph
validation of `graph-store` and SHALL persist through `StorePort.saveGraph` in the same snapshot as
the project's files, with their `weight`. Because `saveGraph` replaces all of a project's edges, a
caller that also has other edges SHALL save them in that same snapshot.

#### Scenario: The documented fixture pairs are persisted

- **GIVEN** `fixtures/acme-shop` and `fixtures/task-api` rebuilt by `node fixtures/build-history.mjs`,
  and one new project for each
- **WHEN** each history is read, its co-change edges are derived with the distinct paths of its links
  as known paths, and a graph with those files, the history and those edges is saved
- **THEN** the acme-shop project has exactly one `co_changed` edge, with extractor `git` and
  resolution `heuristic`, from `app/Services/DiscountService.php` to
  `app/Services/ShippingService.php`, weight 1
- **AND** the task-api project has exactly one `co_changed` edge, with extractor `git` and
  resolution `heuristic`, from `src/schemas/task.schema.ts` to `src/services/task.service.ts`,
  weight 0.75

### Requirement: Fixture histories record every listed file

The fixture history builder (`node fixtures/build-history.mjs`) SHALL make every file that a
manifest entry lists change in that entry's commit, so that the built `git log` holds every
file–commit link the manifest documents:

- A non-final touch whose content would equal what the previous commits left SHALL get the
  throwaway `hist:rN` marker, so the file still changes.
- When a listed file cannot change in its commit — a final touch whose tracked content equals what
  the previous commits left, or a re-touch of a file type that takes no marker (`.json`) — the build
  SHALL fail with an error naming the fixture, the commit index and the path. No link SHALL be
  dropped silently.
- Whether the build succeeds or fails, the fixture's tracked source files SHALL keep their original
  content.

#### Scenario: A re-touch with no new content still records the file

- **GIVEN** a temporary fixture with a tracked file `x.ts` and a manifest whose commits 0 and 1 both
  list `x.ts` with the same `before` snapshot, and whose commit 2 lists `x.ts` plainly
- **WHEN** its history is built
- **THEN** the built repository has 3 commits and each of them changes `x.ts`
- **AND** `x.ts` in the working tree has its original content

#### Scenario: A final touch that changes nothing fails the build

- **GIVEN** a temporary fixture whose manifest's commit 0 lists `x.ts` with a `before` snapshot equal
  to `x.ts`'s tracked content, and whose commit 1 (its last touch) lists `x.ts` plainly
- **WHEN** its history is built
- **THEN** the build fails with an error naming the fixture, `commit 1` and `x.ts`
- **AND** `x.ts` in the working tree has its original content

#### Scenario: A re-touch that cannot be marked fails the build

- **GIVEN** a temporary fixture whose manifest's commits 0 and 1 both list `c.json` with the same
  `before` snapshot, and whose commit 2 lists `c.json` plainly
- **WHEN** its history is built
- **THEN** the build fails with an error naming the fixture, `commit 1` and `c.json`
- **AND** `c.json` in the working tree has its original content
