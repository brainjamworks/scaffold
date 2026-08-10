# Phase 5 Semantic Projection Measurement

**Measured:** 2026-08-10
**Decision:** retain the complete two-pass projection; no production optimization in Phase 5

## Environment

- macOS (`darwin`)
- Node `v24.19.0`
- Vite Plus / Vitest unit project
- Command:
  `vp exec --filter @scaffold/core -- vp test run src/document/authoring/semantic-document/semantic-document-performance.test.ts src/document/model/semantic-document/semantic-document-projection-scale.test.ts --reporter=verbose`
- Each timing fixture received one unrecorded warm-up followed by 15 complete projections.
- Durations and heap observations are diagnostic evidence, not CI thresholds.

## Mounted Update Boundary

The mounted controller and Document Outline test observed semantic snapshot identity and revision
through real Tiptap transactions.

- Each of two document edits produced exactly one complete replacement snapshot: revisions `1`
  and `2`.
- A selection-only transaction reused the same semantic snapshot.
- Outline expansion, pointer movement, scrolling and two repeated indexed reveals produced no
  projection replacement.
- Presentation-only work continued to update the hierarchy view without modifying the document or
  the controller's semantic snapshot.

## Broad Fixture

| Measure                            |           Result |
| ---------------------------------- | ---------------: |
| Surfaces                           |              100 |
| Blocks                             |            2,000 |
| ProseMirror nodes                  |            3,102 |
| Semantic items                     |            3,000 |
| Projector callbacks per projection |              100 |
| Warmed samples                     |               15 |
| Median complete projection         |        10.390 ms |
| 95th-percentile sample             |        22.603 ms |
| Observed heap delta across samples | 46,868,520 bytes |

The heap delta is a gross `process.memoryUsage().heapUsed` observation without forced garbage
collection. It does not represent retained heap and is not used as an acceptance threshold.

## Deep Fixture

| Measure                            |   Result |
| ---------------------------------- | -------: |
| Semantic owner depth               |      256 |
| ProseMirror nodes                  |      259 |
| Semantic items                     |      257 |
| Projector callbacks per projection |      256 |
| Warmed samples                     |       15 |
| Median complete projection         | 0.778 ms |
| 95th-percentile sample             | 3.558 ms |

One additional deep projection recorded call frequency at the candidate constant-factor sites:

| Call site                      | Calls |
| ------------------------------ | ----: |
| `Object.freeze`                | 3,599 |
| Embedded node ID `safeParse`   | 1,027 |
| ProseMirror `Node.forEach`     |   262 |
| ProseMirror `Node.descendants` |     1 |

The existing depth-doubling structural-work assertions remained green after this measurement.

## Decision

Retain the current projection-scoped two-pass index and immutable complete-snapshot boundary.

- The mounted lifecycle rebuilds only for document changes and exactly once per edit.
- Broad and depth evidence remains structurally linear.
- Freeze and ID-parse calls are frequent, but this run does not attribute a material share of the
  observed duration or retained memory to either site. Changing either would therefore be
  speculative.
- Repeated content-root discovery was not observed as a broad traversal hotspot in the deep
  profile (`Node.descendants`: one call).
- No incremental `StepMap`/`Mapping` cache, Table of Contents engine or snapshot mutability change
  is justified by this evidence.

If future production telemetry or a representative mounted-browser profile identifies complete
projection as a bottleneck, route a follow-up spike that profiles one candidate at a time. The
first candidates remain freeze placement, repeated embedded-ID parsing and content-root discovery;
incremental transaction mapping remains outside Phase 5.
