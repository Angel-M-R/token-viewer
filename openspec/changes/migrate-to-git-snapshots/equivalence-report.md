# SQLite Snapshot Equivalence Report

Generated: 2026-07-27T08:48:35.141Z
Machines: angel-mac, old-mac
Status: PASS
Unresolved overlap mismatches: 0
Expected additions outside legacy coverage: 137

The report contains aggregate dimensions and sanitized quota values only. Source locations and raw records are intentionally omitted.

Strict metric comparison is limited to the overlapping SQLite/snapshot coverage. Valid snapshot metrics outside SQLite coverage are recorded as expected additions and do not block the gate.

## Coverage

| Machine | SQLite | Snapshots | Strict overlap |
| --- | --- | --- | --- |
| angel-mac | 2025-09-11 to 2026-07-22 | 2025-09-11 to 2026-07-27 | 2025-09-11 to 2026-07-22 |
| old-mac | 2025-09-16 to 2026-07-22 | 2025-09-16 to 2026-07-22 | 2025-09-16 to 2026-07-22 |

## Expected Additions

| Scope | Machine | Date | Agent | Provider | Model | Metric | SQLite | Snapshot | Explanation |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- |
| usage | angel-mac | 2026-07-23 | claude | anthropic | claude-opus-4-8 | cacheReadTokens | 0 | 4259417 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | claude | anthropic | claude-opus-4-8 | cacheWriteTokens | 0 | 140822 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | claude | anthropic | claude-opus-4-8 | estimatedCost | 0 | 4.097901 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | claude | anthropic | claude-opus-4-8 | inputTokens | 0 | 126 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | claude | anthropic | claude-opus-4-8 | outputTokens | 0 | 43497 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | claude | anthropic | claude-opus-4-8 | requests | 0 | 67 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | codex | openai | gpt-5.6-sol | cacheReadTokens | 0 | 7778560 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | codex | openai | gpt-5.6-sol | estimatedCost | 0 | 6.937384999999999 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | codex | openai | gpt-5.6-sol | inputTokens | 0 | 385413 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | codex | openai | gpt-5.6-sol | outputTokens | 0 | 17204 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | codex | openai | gpt-5.6-sol | reasoningTokens | 0 | 20164 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | codex | openai | gpt-5.6-sol | requests | 0 | 117 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | opencode | anthropic | claude-opus-4-8 | billedCost | 0 | 5.901111 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | opencode | anthropic | claude-opus-4-8 | cacheReadTokens | 0 | 3447892 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | opencode | anthropic | claude-opus-4-8 | cacheWriteTokens | 0 | 413528 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | opencode | anthropic | claude-opus-4-8 | estimatedCost | 0 | 5.901111 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | opencode | anthropic | claude-opus-4-8 | inputTokens | 0 | 108 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | opencode | anthropic | claude-opus-4-8 | outputTokens | 0 | 63683 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | opencode | anthropic | claude-opus-4-8 | requests | 0 | 54 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | opencode | openai | gpt-5.6-sol | cacheReadTokens | 0 | 76643328 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | opencode | openai | gpt-5.6-sol | estimatedCost | 0 | 88.902204 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | opencode | openai | gpt-5.6-sol | inputTokens | 0 | 6422232 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | opencode | openai | gpt-5.6-sol | outputTokens | 0 | 356378 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | opencode | openai | gpt-5.6-sol | reasoningTokens | 0 | 259268 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-23 | opencode | openai | gpt-5.6-sol | requests | 0 | 1452 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-fable-5 | cacheReadTokens | 0 | 12267336 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-fable-5 | cacheWriteTokens | 0 | 173570 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-fable-5 | estimatedCost | 0 | 20.106750999999992 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-fable-5 | inputTokens | 0 | 664 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-fable-5 | outputTokens | 0 | 113263 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-fable-5 | requests | 0 | 104 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-opus-4-8 | cacheReadTokens | 0 | 3273709 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-opus-4-8 | cacheWriteTokens | 0 | 25720 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-opus-4-8 | estimatedCost | 0 | 2.3287745 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-opus-4-8 | inputTokens | 0 | 39 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-opus-4-8 | outputTokens | 0 | 21239 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-opus-4-8 | requests | 0 | 21 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-opus-5 | cacheReadTokens | 0 | 869032 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-opus-5 | cacheWriteTokens | 0 | 160699 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-opus-5 | estimatedCost | 0 | 1.53463975 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-opus-5 | inputTokens | 0 | 11 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-opus-5 | outputTokens | 0 | 3828 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | claude | anthropic | claude-opus-5 | requests | 0 | 6 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | opencode | openai | gpt-5.6-sol | cacheReadTokens | 0 | 663040 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | opencode | openai | gpt-5.6-sol | estimatedCost | 0 | 0.5081 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | opencode | openai | gpt-5.6-sol | inputTokens | 0 | 17514 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | opencode | openai | gpt-5.6-sol | outputTokens | 0 | 1942 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | opencode | openai | gpt-5.6-sol | reasoningTokens | 0 | 1025 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-24 | opencode | openai | gpt-5.6-sol | requests | 0 | 11 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | claude | anthropic | claude-haiku-4-5-20251001 | cacheReadTokens | 0 | 11609 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | claude | anthropic | claude-haiku-4-5-20251001 | cacheWriteTokens | 0 | 8918 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | claude | anthropic | claude-haiku-4-5-20251001 | estimatedCost | 0 | 0.0131884 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | claude | anthropic | claude-haiku-4-5-20251001 | inputTokens | 0 | 10 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | claude | anthropic | claude-haiku-4-5-20251001 | outputTokens | 0 | 174 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | claude | anthropic | claude-haiku-4-5-20251001 | requests | 0 | 1 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | claude | anthropic | claude-opus-5 | cacheReadTokens | 0 | 2077619 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | claude | anthropic | claude-opus-5 | cacheWriteTokens | 0 | 62831 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | claude | anthropic | claude-opus-5 | estimatedCost | 0 | 1.9122132500000002 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | claude | anthropic | claude-opus-5 | inputTokens | 0 | 72 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | claude | anthropic | claude-opus-5 | outputTokens | 0 | 19214 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | claude | anthropic | claude-opus-5 | requests | 0 | 38 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | codex | openai | gpt-5.6-sol | cacheReadTokens | 0 | 27682560 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | codex | openai | gpt-5.6-sol | estimatedCost | 0 | 24.640457999999995 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | codex | openai | gpt-5.6-sol | inputTokens | 0 | 1549954 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | codex | openai | gpt-5.6-sol | outputTokens | 0 | 51658 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | codex | openai | gpt-5.6-sol | reasoningTokens | 0 | 44617 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | codex | openai | gpt-5.6-sol | requests | 0 | 396 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | anthropic | claude-opus-5 | billedCost | 0 | 33.91465124999999 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | anthropic | claude-opus-5 | cacheReadTokens | 0 | 30423530 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | anthropic | claude-opus-5 | cacheWriteTokens | 0 | 2038385 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | anthropic | claude-opus-5 | estimatedCost | 0 | 33.91465124999999 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | anthropic | claude-opus-5 | inputTokens | 0 | 856 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | anthropic | claude-opus-5 | outputTokens | 0 | 238348 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | anthropic | claude-opus-5 | requests | 0 | 428 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | openai | gpt-5.6-sol | cacheReadTokens | 0 | 94952448 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | openai | gpt-5.6-sol | estimatedCost | 0 | 108.32982600000004 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | openai | gpt-5.6-sol | inputTokens | 0 | 6252834 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | openai | gpt-5.6-sol | outputTokens | 0 | 419915 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | openai | gpt-5.6-sol | reasoningTokens | 0 | 254647 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | openai | gpt-5.6-sol | requests | 0 | 1468 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | xai | grok-4.5 | billedCost | 0 | 2.317628 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | xai | grok-4.5 | cacheReadTokens | 0 | 2954240 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | xai | grok-4.5 | estimatedCost | 0 | 2.3176279999999996 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | xai | grok-4.5 | inputTokens | 0 | 518569 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | xai | grok-4.5 | outputTokens | 0 | 17940 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | xai | grok-4.5 | reasoningTokens | 0 | 47763 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | opencode | xai | grok-4.5 | requests | 0 | 59 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | t3code | openai | gpt-5.6-sol | cacheReadTokens | 0 | 13216256 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | t3code | openai | gpt-5.6-sol | estimatedCost | 0 | 9.771488000000002 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | t3code | openai | gpt-5.6-sol | inputTokens | 0 | 467972 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | t3code | openai | gpt-5.6-sol | outputTokens | 0 | 14219 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | t3code | openai | gpt-5.6-sol | reasoningTokens | 0 | 13231 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-25 | t3code | openai | gpt-5.6-sol | requests | 0 | 140 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | claude | anthropic | claude-haiku-4-5-20251001 | cacheReadTokens | 0 | 11609 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | claude | anthropic | claude-haiku-4-5-20251001 | cacheWriteTokens | 0 | 8556 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | claude | anthropic | claude-haiku-4-5-20251001 | estimatedCost | 0 | 0.0122259 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | claude | anthropic | claude-haiku-4-5-20251001 | inputTokens | 0 | 10 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | claude | anthropic | claude-haiku-4-5-20251001 | outputTokens | 0 | 72 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | claude | anthropic | claude-haiku-4-5-20251001 | requests | 0 | 1 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | anthropic | claude-opus-5 | billedCost | 0 | 15.157394499999999 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | anthropic | claude-opus-5 | cacheReadTokens | 0 | 8970789 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | anthropic | claude-opus-5 | cacheWriteTokens | 0 | 1316856 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | anthropic | claude-opus-5 | estimatedCost | 0 | 15.157394499999999 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | anthropic | claude-opus-5 | inputTokens | 0 | 300 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | anthropic | claude-opus-5 | outputTokens | 0 | 97606 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | anthropic | claude-opus-5 | requests | 0 | 150 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | openai | gpt-5.6-sol | cacheReadTokens | 0 | 163022336 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | openai | gpt-5.6-sol | estimatedCost | 0 | 175.48096299999997 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | openai | gpt-5.6-sol | inputTokens | 0 | 9963225 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | openai | gpt-5.6-sol | outputTokens | 0 | 921071 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | openai | gpt-5.6-sol | reasoningTokens | 0 | 550718 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | openai | gpt-5.6-sol | requests | 0 | 2924 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | openai | gpt-5.6-sol-fast | cacheReadTokens | 0 | 16483328 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | openai | gpt-5.6-sol-fast | inputTokens | 0 | 1313976 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | openai | gpt-5.6-sol-fast | outputTokens | 0 | 146496 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | openai | gpt-5.6-sol-fast | reasoningTokens | 0 | 64995 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | openai | gpt-5.6-sol-fast | requests | 0 | 435 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | openai | gpt-5.6-sol-fast | unpricedRequests | 0 | 435 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | xai | grok-4.5 | billedCost | 0 | 4.834844 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | xai | grok-4.5 | cacheReadTokens | 0 | 9432960 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | xai | grok-4.5 | estimatedCost | 0 | 4.834844 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | xai | grok-4.5 | inputTokens | 0 | 652327 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | xai | grok-4.5 | outputTokens | 0 | 29826 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | xai | grok-4.5 | reasoningTokens | 0 | 86891 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-26 | opencode | xai | grok-4.5 | requests | 0 | 143 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-27 | opencode | openai | gpt-5.6-sol | cacheReadTokens | 0 | 57551360 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-27 | opencode | openai | gpt-5.6-sol | estimatedCost | 0 | 55.11150500000002 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-27 | opencode | openai | gpt-5.6-sol | inputTokens | 0 | 2251307 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-27 | opencode | openai | gpt-5.6-sol | outputTokens | 0 | 338272 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-27 | opencode | openai | gpt-5.6-sol | reasoningTokens | 0 | 164371 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-27 | opencode | openai | gpt-5.6-sol | requests | 0 | 692 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-27 | opencode | openai | gpt-5.6-sol-fast | cacheReadTokens | 0 | 44625920 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-27 | opencode | openai | gpt-5.6-sol-fast | inputTokens | 0 | 2227508 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-27 | opencode | openai | gpt-5.6-sol-fast | outputTokens | 0 | 236662 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-27 | opencode | openai | gpt-5.6-sol-fast | reasoningTokens | 0 | 126901 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-27 | opencode | openai | gpt-5.6-sol-fast | requests | 0 | 599 | Expected snapshot-only addition outside legacy coverage. |
| usage | angel-mac | 2026-07-27 | opencode | openai | gpt-5.6-sol-fast | unpricedRequests | 0 | 599 | Expected snapshot-only addition outside legacy coverage. |

## Overlap Mismatches

No equivalence mismatches detected inside strict overlap.

Cutover remains blocked while any overlap mismatch is unresolved or lacks explicit user acceptance.
