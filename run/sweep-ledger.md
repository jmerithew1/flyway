# Audit sweep ledger

Measured at commit `a94dd0e` · 2026-08-28. Lanes carry forward with the date
they were actually measured; a carried verdict is never re-dated.

| Lane | Verdict | Evidence |
|---|---|---|
| 1 Static | PASS | `tsc --noEmit` 0 errors; `vite build` green |
| 2 Tests | **MISSING** | there is no test suite — no `test` script, no spec files. The de-facto gates are `tools/rubric_check.py` (11 checks), `tools/pilot.py`, `motion_census`, `lane_census`, `border_audit` |
| 3 Code audit | 11 findings, 9 fixed | see below |
| 4 Security | clean | no secrets in repo or `dist`; only `localStorage`, already try/caught. Low stakes: static client game, no backend, no auth |
| 5 Deployment | IN PROGRESS | desktop QA agent verifying the live build matches HEAD |
| 6 Rubric closure | 55 sections / 55 rows, no stale statuses | `COVERAGE.md` + `tools/rubric_check.py` MAP check |
| 7 Edge cases | NOT RUN | not folded into another lane; genuinely not run |
| 8 Interaction | IN PROGRESS | desktop + mobile QA agents |

## Receipts proven capable of failing (red→green watched this session)
- `border_audit.py` — 63 findings → PASS
- `lane_census.py` — 0 fly-under → PASS
- `motion_census.py` — 7 dead bands → PASS
- `rubric_check.py::check_wired` — 60 false positives (broken regex) → 8 real → PASS
- `pilot.py` — now exits non-zero when it cannot reach the server

## Confirmed defects fixed this sweep
| # | Severity | Defect |
|---|---|---|
| C1 | CRITICAL | `TunnelSequence.verb()` had **zero callers** — 7 of the finale's 9 prompts were unanswerable, stripping ~46 birds with no possible input, and the breakthrough meter's ceiling was 0.222 against a 0.995 threshold, so the payoff was mathematically unreachable |
| C2 | CRITICAL | `homecomingJoiners` incremented before a capped `spawnBird` could refuse, so **every run reported the same ~33 birds arrived** regardless of play |
| C3 | HIGH | `squeezedThisFrame` was cleared per fixed-step, not per frame — at 30fps roughly **half of all strain losses vanished silently**: no scatter, no recovery, no recorded cause |
| C4 | HIGH | `tunnel.reset` / `moths.reset` / `thief.reset` never called on checkpoint restore — a retry flew an **empty corridor** with hazards already spent |
| C5 | HIGH | decor pieces skipped colliders but not opening zones — **4 free clean-pass awards** per run at zero risk |
| C7 | MEDIUM | cage freeing and echo recovery **destroyed birds** the flock cap refused, awarding score for a rescue that did not happen |
| C9 | MEDIUM | squeeze and tunnel losses never reached `stats.lost`, which gates the clean-pass award |
| C10 | MEDIUM | per-frame `setColor` (canvas repaint + texture re-upload) and per-frame `getPostPipeline` in two modules documented as allocation-free |
| C11 | LOW | flock start count and cap were two constants that agreed by coincidence |

## OWED BY YOU — blocked on an action only the owner can take
- **GitLab push.** The supplied token is expired (`invalid_token` from the API, not a push failure). It is also now in the chat transcript in plain text and should be revoked regardless. Safest path: `glab auth login` once, so the credential lands in the OS keychain.

## DROPPED BY ME — scope calls, the owner's to overturn
- **Monuments without painted openings are scenery, not obstacles.** Four with real openings are solid encounters; the rest (head, hand, foot, torso, statue, bell tower) are background scale. Making them solid would be a wall with no visible route past it. The owner already challenged this once and I kept it after explaining.
- **`unhush` left unwired** — `hush` schedules its own restore; nothing opens a window of unknown length.
- **10 art files left unregistered** — a warm-rim-lit hawk set that contradicts the light grammar, and a superseded low-res sky set.

## KNOWN OPEN — not fixed
- **The AFK gate is flaky.** Across runs a parked pointer died at 6,385 / 10,438 / 13,460 and survived twice. Cause identified: the world scrolls the flock forward whether or not anyone steers, and the ceiling costs nothing, so an idle run can ride the top of the screen the length of the flight. A ceiling penalty was written and **reverted** — it also punished a competent pilot (115 birds home → 0).
- **C6: the QA driver runs a build where no Phaser timer or tween fires.** Two fail paths hang under it and the prompt system deadlocks after the first prompt. Some balance numbers quoted in comments were measured on that harness.
- **C8: real stone (`aqueduct_run`, `root_tangle` at x=25000) sits inside the finale corridor**, and `ownsWorldX` / `checkpointX` are written but uncalled.
- **Lane 2 (tests) and lane 7 (edge cases) did not run.**
