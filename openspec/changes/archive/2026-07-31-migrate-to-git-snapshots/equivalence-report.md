# v1 to v2 Daily Snapshot Equivalence Report

Generated: 2026-07-30T20:55:38.690Z
v1 comparison source: HEAD (read-only, recovered from Git history)
Status: PASS
v1 files compared: 310
v2 files compared: 313
Days with expected day-boundary reassignment: 91
Unresolved mismatches: 0

The report contains aggregate totals only. Source locations and raw records are intentionally omitted.

The v1 to v2 migration reassigns each hourly row from its UTC hour to the matching
`Europe/Madrid` local day before collapsing the hour. Rows near midnight therefore move
between adjacent days, and days at the edges of the set can appear or disappear. Those
differences are expected reassignments, not data loss: per-machine grand totals across the
whole set are compared independently and must match exactly.

## Per-Machine Grand Totals

| Machine | Metric | v1 | v2 | Match |
| --- | --- | ---: | ---: | --- |
| angel-mac | requests | 72416 | 72416 | yes |
| angel-mac | inputTokens | 350255781 | 350255781 | yes |
| angel-mac | outputTokens | 23457338 | 23457338 | yes |
| angel-mac | reasoningTokens | 12193817 | 12193817 | yes |
| angel-mac | cacheReadTokens | 5572863010 | 5572863010 | yes |
| angel-mac | cacheWriteTokens | 19357473 | 19357473 | yes |
| angel-mac | estimatedCost | 5087.9963639 | 5087.996363899999 | yes |
| angel-mac | billedCost | 149.24918825 | 149.24918824999997 | yes |
| angel-mac | unpricedRequests | 2962 | 2962 | yes |
| old-mac | requests | 47894 | 47894 | yes |
| old-mac | inputTokens | 266107789 | 266107789 | yes |
| old-mac | outputTokens | 14682621 | 14682621 | yes |
| old-mac | reasoningTokens | 8676168 | 8676168 | yes |
| old-mac | cacheReadTokens | 3078206775 | 3078206775 | yes |
| old-mac | cacheWriteTokens | 7102568 | 7102568 | yes |
| old-mac | estimatedCost | 2951.6414148499994 | 2951.6414148500007 | yes |
| old-mac | billedCost | 84.59480554999999 | 84.59480555 | yes |
| old-mac | unpricedRequests | 1702 | 1702 | yes |

## Expected Day-Boundary Reassignments

| Machine | Date | Kind | Metrics reassigned |
| --- | --- | --- | --- |
| angel-mac | 2025-09-11 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, unpricedRequests |
| angel-mac | 2025-09-12 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, unpricedRequests |
| angel-mac | 2025-09-13 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, unpricedRequests |
| angel-mac | 2025-09-14 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, unpricedRequests |
| angel-mac | 2025-09-18 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-09-19 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-09-20 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-09-21 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-09-26 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-09-27 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-09-28 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-09-29 | added | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, estimatedCost, billedCost, unpricedRequests |
| angel-mac | 2025-10-11 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-10-12 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-10-18 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-10-19 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-10-26 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-10-27 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-11-08 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-11-09 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-11-23 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2025-11-24 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-02-07 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-02-08 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-03-10 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-03-11 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-03-13 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-03-14 | added | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, estimatedCost, billedCost, unpricedRequests |
| angel-mac | 2026-03-15 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-03-16 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-03-20 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-03-21 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-03-22 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-03-23 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-03-24 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-03-31 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-04-01 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-04-25 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-04-26 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-04-27 | added | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, estimatedCost, billedCost, unpricedRequests |
| angel-mac | 2026-05-24 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-05-25 | added | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, estimatedCost, billedCost, unpricedRequests |
| angel-mac | 2026-05-30 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, unpricedRequests |
| angel-mac | 2026-05-31 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, unpricedRequests |
| angel-mac | 2026-06-04 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost, unpricedRequests |
| angel-mac | 2026-06-05 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost, unpricedRequests |
| angel-mac | 2026-06-06 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-06-07 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-06-12 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-06-13 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-06-14 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-06-15 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-06-16 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-06-17 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-06-21 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-06-22 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-06-28 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-06-29 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-07-04 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-07-05 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, estimatedCost |
| angel-mac | 2026-07-06 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, estimatedCost |
| angel-mac | 2026-07-07 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-07-08 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-07-09 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-07-10 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-07-11 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-07-12 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-07-13 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-07-16 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-07-17 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-07-18 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-07-19 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, estimatedCost |
| angel-mac | 2026-07-20 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, estimatedCost |
| angel-mac | 2026-07-21 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-07-22 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| angel-mac | 2026-07-23 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, estimatedCost, billedCost |
| angel-mac | 2026-07-24 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, estimatedCost, billedCost |
| angel-mac | 2026-07-26 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost, unpricedRequests |
| angel-mac | 2026-07-27 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost, unpricedRequests |
| old-mac | 2026-02-02 | removed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, estimatedCost, billedCost, unpricedRequests |
| old-mac | 2026-02-03 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| old-mac | 2026-04-06 | changed | requests, inputTokens, outputTokens, cacheReadTokens, estimatedCost |
| old-mac | 2026-04-07 | changed | requests, inputTokens, outputTokens, cacheReadTokens, estimatedCost |
| old-mac | 2026-06-02 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost, billedCost |
| old-mac | 2026-06-03 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost, billedCost |
| old-mac | 2026-06-05 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost, billedCost |
| old-mac | 2026-06-06 | added | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, estimatedCost, billedCost, unpricedRequests |
| old-mac | 2026-07-05 | removed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens, estimatedCost, billedCost, unpricedRequests |
| old-mac | 2026-07-06 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost, unpricedRequests |
| old-mac | 2026-07-08 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |
| old-mac | 2026-07-09 | changed | requests, inputTokens, outputTokens, reasoningTokens, cacheReadTokens, estimatedCost |

## Unresolved Mismatches

No unresolved mismatches: every day-level difference is reproduced by re-running the documented migration over the v1 set.

## Prior History

This report replaces the SQLite-era equivalence report. That earlier run compared the v1
hourly snapshots against the legacy SQLite database for `angel-mac` and the retired legacy
Mac and recorded 0 unresolved overlap mismatches and 137 expected additions outside legacy
coverage for `angel-mac`. The legacy database no longer exists on any machine, so the v1
snapshots recovered from Git history are the only remaining comparison source and the
classifications above supersede it.

Cutover remains blocked while any unresolved mismatch or grand-total difference is outstanding.
