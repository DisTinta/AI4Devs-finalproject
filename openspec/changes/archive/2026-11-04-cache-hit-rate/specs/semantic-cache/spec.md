## ADDED Requirements

### Requirement: Project cache hit rate

The cache hit rate of a project SHALL be computed from two counts of its `explain` queries
(`graph-store`, "Explain query counts"): `queries`, every `query_log` row of the project with capability
`explain` since the project was created, and `cacheHits`, those of them served from the answer cache,
by exact key or by similarity alike (a similarity hit is logged as an exact hit, "Similarity lookup in
explain"). Rows of the capabilities `impact` and `drift` SHALL NOT count, and the hit count of the cache
entries SHALL NOT be used.

The core SHALL export one pure function that turns the two counts into the hit rate
`{ queries, cacheHits, hitRatePct }`: `queries` and `cacheHits` as given, and `hitRatePct` equal to
100 × `cacheHits` / `queries` in percent rounded to one decimal with the rule of the answer's savings
(`explain`, "Answer usage": computed in tenths of a percent from integer arithmetic, a half rounding up
toward +∞), or `null` when `queries` is `0`. It SHALL accept only counts that are integers from `0` to
`2147483647` with `cacheHits` not greater than `queries`; any other pair SHALL throw a `RangeError`
whose message holds no count.

#### Scenario: The hit rate is rounded to one decimal and null without queries

- **WHEN** the hit rate is computed for the counts (queries, cache hits) `(10, 4)`, `(3, 1)`, `(2, 1)`,
  `(3, 2)`, `(16, 1)`, `(1, 0)`, `(5, 5)` and `(0, 0)`
- **THEN** the results are exactly `{ queries: 10, cacheHits: 4, hitRatePct: 40 }`,
  `{ queries: 3, cacheHits: 1, hitRatePct: 33.3 }`, `{ queries: 2, cacheHits: 1, hitRatePct: 50 }`,
  `{ queries: 3, cacheHits: 2, hitRatePct: 66.7 }`, `{ queries: 16, cacheHits: 1, hitRatePct: 6.3 }`,
  `{ queries: 1, cacheHits: 0, hitRatePct: 0 }`, `{ queries: 5, cacheHits: 5, hitRatePct: 100 }` and
  `{ queries: 0, cacheHits: 0, hitRatePct: null }`

#### Scenario: Impossible counts are rejected

- **WHEN** the hit rate is computed for the counts `(1, 2)`, `(-1, 0)`, `(2.5, 1)`, `(2147483648, 0)`
  and `(Number.NaN, 0)`
- **THEN** each call throws a `RangeError` whose message contains none of the given numbers
