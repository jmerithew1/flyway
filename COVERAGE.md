# FLYWAY — plan coverage map

**Why this file exists.** Requests kept getting dropped. Not through disagreement
— they were agreed, written into a long prose plan, and then lost, because
"is anything missing?" was being answered from memory. It was answered wrong
repeatedly: 14 painted creature sprites never loaded, the falcon's pose art was
never wired so a live `textures.exists` check silently always failed, 6 of ~200
level pieces moved, and 86 manifest entries pointed at deleted `.png` files.

Every plan section appears here exactly once, with the rubric line that proves it
and the owner doing it. `tools/rubric_check.py` parses this file and **fails if
any section has no rubric line or no owner**, so a gap is now a build failure
rather than something noticed by accident.

Status: `DONE` shipped and verified · `ACTIVE` being worked now · `QUEUED` next.

| § | Section | Rubric | Owner | Status |
|---|---|---|---|---|
| 1 | Frame pacing and allocation | R1 R2 R3 | main | DONE |
| 2 | Motion continuity and pose bridging | R16 | vfx | ACTIVE |
| 3 | CameraDirector | R40 | vfx | ACTIVE |
| 4 | Depth, parallax and occlusion | R13 | art-wiring | ACTIVE |
| 5 | Environmental continuity and contact | R16 | vfx | ACTIVE |
| 6 | Seamless transitions | R17 | main | ACTIVE |
| 7 | VFXDirector, four-tier intensity | R38 R39 | vfx | ACTIVE |
| 8a | Structural blockers | R9 | main | DONE |
| 8b | Real jobs for the three broken verbs | R7 | main | QUEUED |
| 8b2 | Teaching: read slow, then practise slow | R6 | main | QUEUED |
| 8b3 | What Echo can and cannot retrieve | R7 | main | QUEUED |
| 8b3b | The recovery window must be visible | R6 | main | QUEUED |
| 8b3c | What is permanently lost | R7 | main | QUEUED |
| 8b4 | ONE loss law | R8 | main | QUEUED |
| 8b5 | Costs on the HUD: cooldowns and strain | R6 R7 | main | QUEUED |
| 8b6 | The hawk: presence, purpose, counters | R20 | art-wiring | ACTIVE |
| 8b6b | How a flock fights | R7 | main | QUEUED |
| 8b7 | Creatures of the flyway | R22 | creatures | DONE |
| 8b7a | Teaching capacity is a budget | R6 | main | QUEUED |
| 8b7b | Difficulty by conflicting demands | R7 | level | ACTIVE |
| 8b8 | Shapes should DO something | R7 | main | QUEUED |
| 8b0 | Gratification: streak, ruins that pay | R30 | reward | ACTIVE |
| 8b8a | The light economy and its law | R6 | main | DONE |
| 8b8b | The right fiction test | R7 | main | DONE |
| 8b8c | THE TUNNEL | R16 R17 | main | QUEUED |
| 8b9 | Cohesion audit | R7 | main | DONE |
| 8c | Manoeuvring feel (M4) | R31 | reward | ACTIVE |
| 8d | Failure, in four named beats | R8 | main | DONE |
| 8d-bis | The checkpoint return | R23 | main | DONE |
| 8e | The conditional ending, graded | R9 | main | DONE |
| 8f | Addiction: chain, retry, record | R30 | reward | ACTIVE |
| 8f-bis | The reward IS the gameplay | R30 R31 | reward | ACTIVE |
| 8g | Four missing owner requests | R24 R25 R26 R27 | main | ACTIVE |
| 8 | Comprehension | R6 | main | QUEUED |
| 9a | Why it reads "indie" | R11 R12 R46 | art-wiring | ACTIVE |
| 9b | The world as a universe | R12 | level | ACTIVE |
| 9d | Rendering truths | R3 | vfx | ACTIVE |
| 9e | Effects ranked by impact-to-cost | R38 R39 | vfx | ACTIVE |
| 9f | Further world moments | R30 | art-wiring | ACTIVE |
| 9c | Showcase moments and new art | R38 | vfx | ACTIVE |
| 10 | Manoeuvring feel and skill ceiling | R4 R5 R31 | reward | ACTIVE |
| 11 | Level content: rhythm and pressure | R19 R21 | level | ACTIVE |
| 11b | Composition: authored, not accumulated | R19 | level | ACTIVE |
| 11c | THE WORLD MUST MOVE | R21 R22 R45 | level | ACTIVE |
| 11d | Each act needs its own vocabulary | R35 | level | QUEUED |
| 12 | Mobile must be equally fun | R15 | main | QUEUED |
| 13 | Sound doing dramatic work | R28 R29 | audio | ACTIVE |
| 14 | First impression and shipping | R18 R26 | title | ACTIVE |
| 14b | Scope: extend flight one | R14 | main | DONE |
| 15 | World and story framing | R12 | level | QUEUED |
| 16 | Quality settings | R15 | main | QUEUED |
| cinematic | Cinematic architecture | R17 | vfx | ACTIVE |
| 17 | Repository and codebase hygiene | R32 R33 R34 | main | QUEUED |
| 18 | Continuous QA, desktop and mobile | R41 R42 | qa-desktop, qa-mobile | ACTIVE |
| 18b | Review loop: QA finds, design decides, owners fix | R43 | design-lead | ACTIVE |

## Owners

| Owner | Files it may write |
|---|---|
| `main` | `src/scenes/DayScene.ts`, `src/strays.ts`, `src/flock.ts`, `src/config.ts` |
| `creatures` | `src/creatures.ts` |
| `level` | `src/level.ts` |
| `title` | `src/scenes/TitleScene.ts` |
| `nightfall` | `src/nightfall.ts` |
| `audio` | `src/audio.ts` |
| `reward` | `src/score.ts` |
| `art-wiring` | `tools/build_manifest.py`, `src/artManifest.ts`, `src/textures.ts`, `src/falcon.ts` |
| `vfx` | `src/vfx.ts`, `src/camera.ts` |
| `qa-desktop` | *(none — reports only)* |
| `qa-mobile` | *(none — reports only)* |
| `design-lead` | *(none — judgement only)* |

Ownership is disjoint on purpose. Three agents once edited `DayScene.ts`
concurrently and broke the build; every wave since has had non-overlapping file
ownership, and that is why they have not collided again.
