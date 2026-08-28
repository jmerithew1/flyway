# FLYWAY — design lead assessment

**Pass 1 · production build (`npx vite build`, `dist/assets/index-CNb4IJiG.js`), desktop 1536×960.**
QA's `qa/desktop.md` and `qa/mobile.md` did not exist at the time of writing; everything
below is my own play pass plus source. This file is updated as their reports land.

`npm run build` failed (`src/vfx.ts(551,35): TS2345` — vfx owner mid-edit), so per
instruction I built with `npx vite build`, which succeeded. **Noted:** the shipped
bundle currently does not typecheck.

How I played it: a stepped, instrumented pilot driving the real input path
(`qa/dl_play.py`), a steer-only "first-timer" variant, and a faithful pass that also
pumps Phaser's TweenManager and Clock (`qa/dl_toast.py`, `qa/dl_fail.py`) so nothing
reported here is an artifact of a frozen game loop. Every screenshot cited was opened
and read.

---

## THE VERDICT

**The game is beautiful and it is not yet a game.** It is a 135-second flight with one
dominant input, no attrition, no crescendo, and an ending you cannot fail to earn. The
art, the fog, the cage break and the failure card are genuinely good. The *play* is not.

The one-sentence version: **hold SPACE and you cannot lose.**

Verified, same pilot, same route, one variable:

| | Gather held ~73% | Gather never pressed |
|---|---|---|
| Finished | x=25,404 (home) | died at x=20,756 |
| Birds | **200** (started 120) | 0 |
| Loss events | **3**, all before x=2,000 | 65 |
| Daylight floor | 0.68 | — |

That is the entire difficulty curve: one binary. There is no middle, no cost to the
dominant choice, and nothing the other six verbs are needed for.

And it is not that Gather is *strong* — it is that it is **free**. `gatherStrain` sat
pinned at **1.00 from x≈13,500 to the roost**, roughly 60 seconds at maximum strain,
and cost me **zero birds**. §8b4 states the law the whole design rests on — *"Gather
runs a strain clock, so you cannot hold it forever, and you will lose birds. That is
exactly what gives Echo permanent work."* **That is not true in the shipped code.**
Strain's only consequences are: Surge weakened 40% (`src/flock.ts:548`), the flow award
voided above 0.92 (`src/scenes/DayScene.ts:1905`), a one-time text prompt, an audio
darkening — and it makes the falcon commit (`src/falcon.ts:427`). None of them take a
bird. The clock that is supposed to be the game's central pressure is decorative.

Where it stops being fun, precisely: **it never starts.** The competent timeline
(`qa/shots/dl/play2.json`) shows birds going 117 → 123 → 132 → 137 → 142 → 148 → 200,
monotonically upward, for 135 seconds. Nothing is ever at stake. The moment of highest
tension in my entire run was **t=4.1s**, when I had not yet realised nothing could
hurt me.

The second-order damage is worse than the first. Because you arrive with 221 of a
starting 120, `gradeArrival` (`DayScene:4606-4612`) needs `held ≥ 0.7` for GOLDEN and
you show up at **1.84** — so the conditional ending §8e was built for grades a run it
can no longer distinguish. And because permanent Gather requires `gatherStrain < 0.4`
to be *false*, the mobbing triumph — §8b6's "the single triumph the game offers" —
is **permanently locked out by the dominant strategy** (`src/falcon.ts:410`). The
optimal way to play the game disables the best thing in it, and nothing tells you.

**Strongest thing in the game:** the failure card (`qa/shots/fail/f2_+90.png`). Cause,
count, run metrics, the promise, and it waits for your press. §8d and §8d-bis are
genuinely delivered and it is the most confident screen in the build. Runner-up: the
cage break at x≈9,469 — wreck falling, freed birds rising through it — which is three
seconds of real drama.

**Weakest thing in the game:** the moveset. Nine verbs ship in flight one — steer,
gather, spread, surge, flare, echo, dive, vortex **and Brace** — which is the exact
count §8a identified as the cause of "we didn't grasp the controls", and it has not
gone down. I counted **17 teaching events** in one run (5 cards + 12 distinct prompts).
Six of the nine have no demanded job.

---

## THE THREE HIGHEST-VALUE CHANGES, IN ORDER

### 1. Make strain take birds. Nothing else fixes the game.

Everything wrong above is one defect wearing four costumes. Gather is free, so it is
dominant; because it is dominant there is no attrition; because there is no attrition
Echo has nothing to retrieve, the grade cannot discriminate, and the run has no shape.

**Do:** above ~0.75 `gatherStrain`, birds start squeezing *loose* — into the recovery
window, not into the ground — at a rising rate. Same for spread. That single change
turns on, at once: a real cost for the dominant verb; a stream of recoverable birds
that gives Echo the permanent job §8b3 promised; an attrition curve the grade can read;
and the §8b4 loss law, because now every avoidable loss really does trace to how you
are holding formation.

**And show it.** §8b5's ability bar does not exist (verified: `src/ui.ts` is typography
only; the desktop HUD is flock dial, journey ribbon, daylight, multiplier — the entire
lower half of the screen is empty in every capture I read). Gather strain, spread
strain and Echo's 6s cooldown are shown **nowhere on desktop**. Echo's cooldown has
exactly one surface in the whole game and it is a touch-pad dim (`src/touch.ts:571`).
Charging a cost you cannot see is the definition of arbitrary — and you are about to
make that cost lethal, so the arc has to land first.

*Do not* solve this by making stone hurt more. The difficulty must come from the
formation dial, because that is the dial the whole design points at.

### 2. Cap the flock at what you started with.

You arrive with **221 birds after starting with 120** (`qa/shots/dl/x24900.png`). The
premise is "bring the flock home before nightfall". You do not bring a flock home; you
farm one. Every loss is instantly refunded by the next cage, so no loss ever lands,
and the ending grade is decided before you take off.

**Do:** cages and rescues top you back up *toward* your starting count and never past
it. If the roster needs to be bigger, start bigger. This is close to a one-line change
and it is the cheapest large win available — it restores stakes to every one of the 65
loss events my un-gathered run produced, and it makes change #1 *felt* rather than
merely true.

It also makes §9e's roost light ("driven by birds you still have") mean something,
and makes GOLDEN/HARRIED/HUNTED separable again.

### 3. The run needs a peak — and the cheapest one is already built and switched off.

There is no crescendo. The last 5,000px are indistinguishable from the first 5,000px:
same loss rate (zero), same daylight band, same encroach sawtooth. §8b8c's split-tunnel
finale — the plan's designated exam and climax — **does not exist in code**. Notably,
its *entire audio layer is written and wired to nothing*: `tunnelEnter`,
`setTunnelSpeed`, `tunnelPrompt`, `tunnelPromptHit`, `tunnelBreakthrough`,
`tunnelAbort` all live in `src/audio.ts:2195-2347` with no caller outside that file.

Before building it, take the free one: **fixing #1 unlocks the mobbing triumph you
already have.** `falcon.ts:410` gates mobbing on `gatherStrain < 0.4` — impossible
under the current dominant strategy. Give strain teeth and mobbing becomes reachable
by the exact skill the game teaches (hold a big flock together *and know when to let
go*), which is a far better crescendo than a scripted corridor and costs almost
nothing. §9e Wave 3's colossus then has its face.

Then build the tunnel as the authored finale. In that order.

---

## VERB-BY-VERB

The test for each: does it have a distinct demanded job, and would a first-time player
discover and use it?

| Verb | Distinct job? | Discovered & used? | Call |
|---|---|---|---|
| **Steer** | yes | yes | **Keep.** Feel unimproved: `intentLagRate` floor is still **2.2** (`flock.ts:328`) and there is no threading assist — §8c/R31 unbuilt. Owned by `reward`, ACTIVE. |
| **Gather** | yes | yes (first card) | **Keep — and price it.** See #1. |
| **Spread** | on paper | **no** | **Keep, but fix.** The harvest job is real now (reach `26 + 104·spread01`, ~20→130px, `DayScene:2016-2019`). But my competent pilot used it **1% of the time** because Gather is safer everywhere and spread still pays the **−12% speed tax** the plan ordered cut to 0.04 (`flock.ts:82`, unchanged). Motes do not magnetise — they flip `taken` and vanish on the same frame (`DayScene:2043-2049`); the ten-streaks-arriving image in §8b was never built. Delete the tax, build the magnetise, and give it one place where spread is the *only* answer. |
| **Surge** | yes (pierce brittle) | taught, not landing | **Keep.** "The curtain held" was my **second-largest killer — 19 of 65 loss events** in the un-gathered run. The verb works; the teaching does not. |
| **Flare** | **no** | prompted at x=9,150, never needed | **Cut, or give it the moth job.** I completed the flight twice without ever needing to brake. §8b7 already assigns Flare/Spread the job of shedding night-moths — 5 moth clusters *are* placed (`DayScene:655-661`). Wire that and it earns its slot; otherwise it is a key that exists to be taught. |
| **Echo Call** | yes, and it is the best idea in the game | **no** | **Keep — it is the most interesting verb and it is starved.** Genuinely improved: it freezes a scattered bird's life timer (`scatter.ts:98`), recoverable odds are 0.78 (`scatter.ts:49`, above the 0.75 target). But: (a) it *still* sums into the shared `spread01` for scatter recollect and cage reach (`DayScene:1523-1528`) — the collision §8b said deletion was step one of; (b) the recovery countdown arc §8b3b calls essential **does not exist** — no Graphics object in `scatter.ts` at all; (c) fog tendrils are **decorative** (`nightfall.ts:408-458` sets sprite transforms only — no tether, no held flag, nothing to snap), so the permanent job §8b promised never arrives; (d) 6s cooldown invisible on desktop; (e) ~240 `delayedCall`s per cast (`DayScene:1193-1199`). |
| **Dive** | **no** | prompted, no reason to press | **Cut it or build §8b's COMMIT properly — do not ship the middle.** It has *no* visual language: no `'stoop'` shape (`formShape` accepts only arrow/fan/ring, `flock.ts:387`), no speed streaks, no camera move, and no aiming shadow for the intent point it drops 340px (`config.ts:44`). So committing to a dive literally means the steering stops answering and **nothing on screen explains why**. There is no deep light placed low that only a stoop can reach. As shipped this is a button that makes the game feel broken. |
| **Vortex** | yes, in principle | **no** | **Cut, or place more thieves.** The gesture is the most intuitive mapping in the game and I agree with the plan about that. But its only reason to exist is **one** LightThief at x=13,400 (`DayScene:664`) across 25,400px. A verb with a single scripted encounter is a set piece, not a verb. |
| **Brace** | no — and it was **cut** | taught anyway | **CUT IT. The cut was started and abandoned halfway.** The touch getter is stubbed to `false` with a comment saying Brace is cut (`touch.ts`), but the desktop chord is fully live: SPACE+SHIFT at `DayScene:4223`, world-slow at `:1350`, and a prompt that teaches it — *"no time to read it — hold SPACE + SHIFT to slow the world"* (`level.ts:462`). **I photographed it on screen at x=21,257** (`qa/shots/dl/x21000.png`). This is the ninth verb, the only chord in a game whose plan says *"No input in the game is a chord"*, and §8b9 called it the least coherent element in the moveset. Removing it costs nothing and buys back teaching capacity for the verbs that matter. |
| **Harmony** | removed | — | Comment residue only (`flock.ts:509,631`). Cosmetic. |

**Net recommendation: ship five verbs, not nine.** Steer, Gather, Spread, Surge, Echo.
Cut Brace outright. Cut Dive and Vortex *unless* the work in §8b (COMMIT's whole visual
language + low light to reach) and a real thief population land — half-built verbs are
worse than absent ones, because they teach the player that pressing things does nothing.
Flare survives only if it gets the moth job.

---

## IS THE DIFFICULTY AUTHORED OR ARBITRARY?

**Arbitrary, in both directions.** With Gather, nothing can hurt you. Without it, the
un-gathered run lost **20+ birds in seven seconds** between x=21,000 and x=22,500,
alternating three causes with no time to read any of them. Neither is authored.

§8b4's one loss law is not achieved. Six paths still exist and **three are silent** —
no `lastLossSource`, no on-screen cause:

- brittle curtain slip-through while spread (`DayScene:3193-3201`) — and this is the
  only loss gated on player *technique*, so it is precisely the one that must speak;
  the branch directly below it has a line
- recovery window expiry (`DayScene:1714`)
- straggler cull (`DayScene:3468-3500`)

Two more problems with the cause system, both verified on screen:

1. **The failure card names the wrong thing.** It prints `lastLossSource` — the *last*
   event, not the dominant one. My run died of attrition: 28× "blown wide", 19× "the
   curtain held", 12× "struck the stone", 6× "the dark". The card said **"struck the
   stone"** (`qa/shots/fail/f2_+90.png`). That is not a lesson, it is a coincidence
   presented as a lesson — the exact defect §8d exists to remove. Name the *dominant*
   cause of the run.
2. **It contradicts itself.** 1.5s before that card, the break frame
   (`qa/shots/fail/f0_break.png`) says *"the flock is too small to hold together"* —
   which is the `lowflock` prompt (`DayScene:1691`), not a cause at all.

And the break frame itself is the weakest beat in the sequence: at the moment of
failure I had **38 birds, 38 scattered, 77% daylight, and no fog anywhere in frame**.
I could find two birds in the picture. Nothing in that image explains why the run
ended. §8d.1 calls naming the cause on the frame of impact "the biggest fix" — the
card does it 1.5s later; the frame of impact does not.

Also worth an owner's attention: **falcon kills never increment `stats.lost`** (removal
happens inside `falcon.ts:509-513`, bypassing the `if (!scatter.spawn(...)) stats.lost++`
idiom every other path uses). The results screen under-counts the one predator whose
entire purpose is permanent loss.

---

## THE LIGHT ECONOMY DOES NOT READ

§8b8a's law — *"the meter IS the fog's distance behind you"* — is true in the code
(`nightfall.ts:247`) and **false on screen**. Across 25 timeline samples, daylight
stayed in 0.68–1.00 while `encroach` swung between **0.00 and 1.00** roughly every
1,000px. The fog's alpha saturates at `encroach × 1.5` clamped to 0.95
(`nightfall.ts:376,386`), i.e. it is at maximum from encroach ≈ 0.63 — which was true
in **17 of 25 samples**. So the dark looks maximally present almost all the time,
including at x=1,121 four seconds in with **99% daylight** (`qa/shots/dl/x00900.png`,
fog owning 45% of the frame before the player could possibly have made a mistake).

A threat display that is pinned near maximum carries no information, and it trains the
player to ignore the thing the whole game is about. Give encroach real dynamic range,
or drive the fog's presence from something the player's actions actually move.

---

## THE FLOCK IS NOT THE SUBJECT OF ITS OWN FRAMES

Read across eight captures:

- At x=1,121 the murmuration is a ~180px grey smudge in the top-right corner while the
  fog owns nearly half the frame.
- **At x=18,002, holding 143 birds, I could not locate my own flock in the frame at
  all** (`qa/shots/dl/x17600.png`).
- At x=5,300 the flock is clipped off the left edge while the camera leads right
  (`qa/shots/toast/pump_05300.png`).

The one frame where it works is x=13,841 — ~156 birds spread against clean sky,
individual silhouettes legible, and it is genuinely lovely. That frame is the target;
it is the exception.

The §9a art findings I could confirm by looking, unchanged: every frame is mid-tone
(sky 60–75%, ruins 55–70%, foreground ~35%, nothing near-black, nothing hot — R11
fails on every capture I read); nothing is rim-lit and nothing casts a shadow (the two
columns in `pump_05300` have identical left and right faces with a low sun behind);
motes still render as ringed pearls with dark rims rather than as light (seven visible
at y≈425 in the same frame); light shafts show hard straight polygon edges
(`x09200.png`, `x21000.png`).

**R10 fails — straight edges are still live.** Clearest instances I read: a full-height
vertical seam at x≈163 in `x13500.png`; hard rectangular plate edges bottom-right in
`x17600.png`; and several crisp rectangular blocks visible in the desaturated failure
background (`f0_break.png`, `f5_+200.png`).

Credit: the acts *do* differ more than "one painting recoloured" — x=2,700 is lavender,
x=5,300 hot orange-pink, x=13,500 pale mauve, x=24,900 warm amber. §9a.3 is partly
addressed.

---

## QA TRIAGE

QA's own reports had not landed. This triages my findings on the same scale, and is
the frame I will apply to theirs. **Cosmetic** = looks wrong, plays fine.
**Corrosive** = passes every functional check and quietly ruins the feel.
**Fatal** = the run cannot proceed or the build is not shippable.

### Fatal
- None observed in play. No crash, no console error beyond the Phaser banner, no stuck
  state, no unreachable control across ~8 full-length runs.
- *Build-level:* `npm run build` fails typecheck (`src/vfx.ts:551`). Owner is mid-edit,
  so this is expected churn — but it must not be true at ship.

### Corrosive — fix now
1. **Gather is free and dominant** (§8b4's strain law unimplemented). Ranked #1 above.
2. **The flock grows past its start count**; the ending grade cannot discriminate. #2.
3. **No crescendo**; the tunnel does not exist and mobbing is locked out by #1. #3.
4. **Brace still ships and is taught** — a cut verb, the only chord, on screen at
   x=21,257. Half-removed is the worst state.
5. **Costs are invisible**: no ability bar, no strain arcs, Echo's cooldown desktop-invisible.
6. **Three silent loss paths** + the failure card naming the *last* cause rather than
   the dominant one, and contradicting the break frame 1.5s earlier.
7. **Fog presence is pinned near maximum** — the threat readout carries no information.
8. **Two unaware teaching systems still live**: 5 cards (`DayScene:4160`) and ~20
   `showPrompt` sites. They also disagree — the light card teaches SHIFT as "spread
   wide and sweep light in", the spread prompt teaches SHIFT as "strays out there —
   hold SHIFT to reach them", which is stale since Echo owns retrieval.
9. **Stale copy the plan explicitly ordered deleted is still live**: `PROMPT_TEXT.gather`
   = *"birds glowing are about to be lost"* (`level.ts:455`).
10. **Falcon kills never increment `stats.lost`** — the results screen under-counts.
11. **Dead-but-shipped feature code**: `src/vfx.ts` (954 lines) and `src/camera.ts`
    (365) are **imported by nothing**; `audio.ts`'s tunnel layer and `score.ts`'s
    `HarvestChain` are orphaned while `DayScene` runs a second chain implementation.
    R38/R40 are unmet *today*; both owners are ACTIVE so this may be work in flight —
    flagged, not indicted.
12. **Failure-card body text is very low contrast** (roughly #8b84a0 on #2a2540) — R14
    is at risk on the one screen the player reads most carefully.

### Cosmetic — worth doing, not now
- Motes render as ringed pearls rather than light.
- Light-shaft assets show hard polygon edges.
- Residual HUD ghosts drawn faintly over the failure card.
- Harmony comment residue in `flock.ts`.

### Not a defect — my own error, recorded so it is not repeated
My first capture set appeared to show **25–40 overlapping reward toasts** burying the
art. **That was an artifact of my stepped harness**: manually calling `d.update()`
without pumping the TweenManager means each popup's destroy-on-complete never fires.
With the managers pumped (`qa/dl_toast.py`), peak simultaneous visible Text was **23,
most of it the HUD**, and the rendered frame is clean and readable
(`qa/shots/toast/pump_05300.png`). The real issue is much smaller: identical labels can
stack (I logged 9 simultaneous "+1 BIRD") because the popup slot cycle is only 4 wide
and a cage frees 11 birds at once. **Cosmetic.** Reported here because the false version
was dramatic and I want it on the record that it was checked and withdrawn.

### Tooling — consequential, and the most important thing here that is not a game defect
- **`tools/pilot.py`'s Gather and Spread are silently inert.** It drives them with
  `d.touch.gather = ...` / `d.touch.spread = ...`, but both are **getter-only accessors**
  (`src/touch.ts:553,558`), so in sloppy-mode `evaluate` the assignment is a no-op. Its
  reported `gatherPct` counts its own intention, not the game's state. **R4 (the
  two-sided difficulty contract) and R5 ("a skilled pilot finishes with most of the
  flock") are currently being proven by a probe that never forms up.** I hit this
  myself and only caught it because I logged `flock.form`, which stayed at 0.00 for a
  whole run while the probe reported 72% gather. Fix: drive `d.keySpace.isDown` /
  `d.keyShift.isDown`, and assert on observed `flock.form` so a silent no-op can never
  read as a pass. Every balance conclusion drawn from that gate should be re-taken
  afterwards.
- **`npx vite preview` serves a blank page.** `vite.config.ts` sets `base` only when
  `command === 'build'`, so preview serves at `/` while `dist/index.html` references
  `/flyway/`. Pass `--base /flyway/` or serve the bundle under a `flyway/` prefix.
  Doesn't affect the GitHub Pages deploy; will waste anyone's afternoon who verifies
  locally.
- **Boot decodes 230 assets — ~40s headless.** Directional only, but worth a real
  measurement on a mid phone before ship.

---

## WHAT I COULD NOT TEST

- **Mobile.** No pass run; `qa/mobile.md` did not exist. R15/R42 unassessed by me.
- **Audio.** Headless with no listener; §13/R28/R29 unassessed.
- **Real frame rate.** Headless SwiftShader only — no FPS claim is made anywhere above,
  and none should be read into it. R1/R3 unassessed.
- **The title screen and share controls** (§8g.3, R26) — not reached this pass.
- **The deployed URL** (R18).
- **The arrival ceremony past the first seconds**, and GOLDEN/HARRIED/HUNTED side by
  side (R9) — I only ever produced GOLDEN, which is itself the finding.
- **The tunnel** (§8b8c) — does not exist to test.
- **Repeat-failure timing** (R23's "under 1s on a repeat") — I captured only a first loss.

---

## WHAT I THINK THE PLAN ITSELF HAS WRONG

1. **§8b4 states the strain law as though it were implemented.** It is the load-bearing
   sentence of the whole difficulty design and it is not true in the code. Everything
   downstream — Echo's permanent job, the one loss law, "generous to mastery,
   unforgiving to sloppiness" — is built on a clock that costs nothing. This should be
   the first line of the next wave, not one entry among fifty.

2. **Nothing in the plan caps the flock.** §8b0 adds cages that pay birds, §8f adds a
   second wind that restores you to 45, the checkpoint restores you to 75 — and no
   section anywhere says the flock may not exceed what it started with. The result is
   that the plan's own centrepiece fantasy ("bring the flock home") is contradicted by
   its own reward design, and §8e's graded ending is evaluated against a ratio that is
   always ≥ 1. One line fixes it and its absence is doing real damage.

3. **The verb budget was decided and then not enforced.** §8b8 concludes "flight one
   therefore teaches six verbs" and §8a says nine shipping is the direct cause of the
   comprehension failure. Nine still ship, Brace included, and Brace is *taught by a
   prompt*. A plan that resolves a scope question needs a check that the resolution
   landed — the way `COVERAGE.md` + `rubric_check.py` catch a missing owner, something
   should catch a cut verb that still has a prompt string.

4. **§14b extended flight one to "everything reachable in one flight" without revisiting
   the teaching budget.** §8b7a called teaching capacity a budget and split the roster
   across two flights precisely to protect it; §14b then merged them back and argued
   capacity is "about pacing, not a hard verb count". Maybe — but the current build
   fires **17 teaching events** in 135 seconds, and the plan no longer has a stated
   ceiling to check that against. Put a number back.

5. **The plan has no line about what the player is looking at.** It has extensive art
   direction and extensive mechanics, and nothing that says *the murmuration must be
   the most legible thing in the frame.* That is why it is possible to hold 143 birds
   and not find them in the picture, and no rubric line fails for it. R13 covers the
   flock compositing *inside* the world; nothing covers it being *findable*.

6. **Minor, but real:** §8b3c's loss table promises the falcon is the one loss that is
   never recoverable and is therefore meaningful — while `stats.lost` never counts it.
   The design and the accounting disagree.
