# FLYWAY — game-feel and animation direction, final judging pass

**Build judged:** the frozen snapshot of `04059b4` served at `http://127.0.0.1:5300/flyway/`.
Nothing under `src/` or `tools/` was touched. Everything below is either a code path I
read in that commit or a number I measured against that running build.

**How I played it.** Headless chromium (`--use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader`), scene driven synchronously through `d.update(ts, dtMs)`
with Phaser's Clock and TweenManager pumped every step, verbs pushed through the real
input path (`debugHold.gather/.spread`, `doSurge`, `doFlare`, `echoCall`), pointer
written where `DayScene` actually reads it (`input.activePointer`, because Phaser's DOM
queue never drains under synchronous stepping). **No frame time is reported anywhere in
this document.** Harnesses: `qa/jf_lib.py`, `qa/jf2_pilots.py`, `qa/jf3_tunnel.py`,
`qa/jf4_reckon.py`, `qa/jf5_skill.py`, `qa/jf6_shot.py`. Data:
`qa/shots/feel/{pilots,tunnel,reckon,skill}.json`.

**Provenance note.** The working tree moved during this pass — `HEAD` is now `9f9ab4a`
with uncommitted edits on top. Every line number below was re-derived from
`git show 04059b4:…`, not from the working copy. `tunnel.ts`, `falcon.ts`,
`creatures.ts`, `scatter.ts` and `strays.ts` are byte-identical between the frozen
build and the current tree, so everything in §1(a), §1(b) and the reckoning trace
applies to both. One thing has already moved and I flag it where it lands: `9f9ab4a`
gives the shapes mechanical consequences (`arrow → pierce`, `fan → brake`,
`ring → sweep`), which begins to answer the FLARE finding in §4 — but not the two
places FLARE is actually broken.

---

## THE VERDICT

**The middle of this game is now good, and both of its authored peaks are broken.**

The last assessment's headline defect is genuinely gone. "Hold SPACE and you cannot
lose" measured 200 birds home and 3 losses; the same hold now **dies at x=10,859 with 4
birds and 105 loss events, 59 of them squeezed loose by strain**. The flock cap landed.
The grade discriminates again. Spread earned four demanded jobs. Echo finally has a
supply to rescue. For roughly 18,000 of the route's 26,600px the loop reads: see the
terrain, pick the verb, pay for holding it too long, call back what you dropped. That
is a game, and it wasn't one before.

Then you reach the two moments the whole flight is built toward, and:

1. **The hawk's reckoning cannot be won. Not "is hard". Cannot.** `reckonInput` is
   called with exactly two verbs anywhere in the codebase — `'surge'`
   (`DayScene.ts:1186`) and `'gather'` (`DayScene.ts:1571`). `beginReckoning`
   (`DayScene.ts:3929`) always builds the pool `['gather','surge','flare']` and shuffles
   it, so **`'flare'` is in every sequence and no input path can ever submit it.**
   `falcon.mobNow()` has exactly one call site (`DayScene.ts:3982`), behind that
   sequence completing. Measured: 8 forced arms, 4 offers, **4 endings in phase
   `strike` — "IT BROKE THROUGH". Zero wins.** The game's designated single triumph is
   unreachable dead code, and it blames the player for it.

2. **The tunnel finale's prompt plate shows the wrong verb for most of every window.**
   `renderUI` (`tunnel.ts:1298-1306`) picks the **first hazard by index** in
   `{buildup, impact, decay}`, and a resolved hazard sits in `decay` for
   `DECAY_T = 0.45s` (`tunnel.ts:123`). The climax packs prompts 119–136px apart at
   `speedMult 1.62`, so the next window opens while the last plate is still decaying —
   and the dead plate outranks the live one. Measured across a full instrumented run of
   the finale: **of 184 frames with an answer window open, the plate named the wrong
   verb on 106 (58%)**; in the run that answered, 43 of 70 (61%). Screenshot of the
   frame: `qa/shots/feel/tun_plate_wrong.png` — the plate says **SPLIT · TAP SHIFT**
   while the open window is **surge**.

Nobody has yet played the tunnel working, and after this pass, still nobody has.

---

## 1. IS IT FUN, AND WHERE EXACTLY DOES IT STOP?

**Yes, from about x=2,000 to x=20,000.** That stretch has a real read-and-answer loop
and the losses in it name the verb you failed to press. A pilot that steers around
stone but never presses a verb dies at **x=18,551** having lost 138 birds, and the two
dominant causes are `blown wide — gather in close terrain` (34 of 86 events) and
`the curtain held — surge or gather through` (33). Both of those are the game telling
you, correctly, which button you didn't press. That is authored difficulty.

**It stops being fun in four named places.**

### (a) The reckoning, at the falcon zones (x=8,150 and x=22,300)

Cause: `'flare'` has no submit path (above). Second, compounding cause: the tap/hold
discriminator runs on `simClock` (`DayScene.ts:1506`), and `dt` is multiplied by
`1 - reckonEase * 0.88` (`:1492`) during a reckoning. So the 0.22s tap threshold
(`DayScene.ts:1595`, `:1601`) is worth **~1.8 REAL seconds** while the world crawls, inside a
2.8s window (`RECKON_REAL_TIME`). Consequence: every SPACE press submits `gather` on
the rising edge and `surge` on release. You cannot obey "HOLD SPACE" without also
firing SURGE. Verified in the trace — trial 4, sequence `gather → flare → surge`: the
gather answered (step 0→1), TAP SHIFT did nothing (step stayed 1), the falcon
committed.

### (b) The tunnel finale (x=24,250–25,950)

Cause: the plate occlusion above. Per-hazard blind time from the unanswered run —
the seconds each window spends displaying the *previous* verb:

| # | verb | window | blind | correct plate |
|---|---|---|---|---|
| 0 | flare (SPLIT) | 0.92s | 0.00s | 100% |
| 1 | surge | 0.85s | **0.30s** | 18% |
| 2 | gather | 0.78s | **0.38s** | 12% |
| 3 | flare | 0.71s | **0.37s** | 27% |
| 4 | echo | 0.65s | **0.28s** | 19% |
| 5 | surge | 0.57s | 0.00s | 100% |
| 6 | flare | 0.53s | **0.20s** | 43% |
| 7 | gather | 0.49s | **0.33s** | 13% |
| 8 | surge | 0.45s | **0.33s** | **0%** |

The finale's last prompt shows the correct verb on **0 of 20** frames in which it
is answerable. Breakthrough needs `meter >= 0.995` (`tunnel.ts:775`), i.e. a
clean 9/9 — a hit is `+1/9`, a miss `-0.6/9` (`:1005`, `:1012`), so one miss caps you
at 0.822 and there is no route back. A pilot spamming the plate's verb at 60Hz scored
**8/9, meter 0.822, no breakthrough.** A human reading a plate that is wrong 58% of the
time cannot do better.

### (c) The tunnel has no stakes either, so fixing the plate is not enough

`applyFlock` (`tunnel.ts:1134-1153`): the corridor walls are a spring and a hard stop
and the comment states outright that *"Scraping the lip costs no birds"*. The split
fires whether or not the gate is answered (`:1018-1020`). So the finale is a
nine-question button quiz with an authored camera — the steering, which is the verb the
whole game is about, has zero consequence inside its own climax. And missing it costs
nothing worth noticing: my completing pilot **missed 6 of the 9 prompts and still
brought 112 of 120 birds home at 97% daylight**, because torn birds go into the
recovery window and drift back.

### (d) The strain cost is a rhythm tax, not a resource

`flock.ts:802-819`: above `activeStrain > 0.82` one bird leaves every
`1.15 - (s - 0.82) * 2.2` seconds — 0.97s at the threshold, 0.75s at full. Strain
recovers at `STRAIN_RECOVERY_RATE = 2.2`, so from a pinned clock **0.14s of neutral
drops you back under the squeeze threshold and 0.77s clears the clock entirely**.
Measured over the same route, one variable:

| pilot | gather policy | squeeze losses | outcome |
|---|---|---|---|
| idle | never | 0 | dead, x=11,102, 8 birds |
| hold | continuous | **59** | dead, x=10,859, 4 birds |
| pulse | 3.0s on / 0.9s off | **7** | dead (crude steering) |
| pulse (steering pilot) | held near threats, released at 2.7s | **5** | **HOME, 112/120 birds, 97% daylight** |
| gathr (steering pilot) | held near threats, no release rule | 5 | dead at t=136s |

The read: holding forever is now properly punished, which is the fix working. But a
77%-duty-cycle pulse costs 7 birds instead of 59, and a pilot doing nothing but
steering around stone and pulsing gather **finishes the game with 93% of its flock**,
its daylight dipping to 0.56 once and ending at 0.97. The dominant strategy moved from
"hold SPACE" to "pulse SPACE" and lost some, but not much, of its dominance.

*Harness honesty:* my fourth pilot (`full`, which also spread for motes, surged
brittle and called recoverables) died at x=11,181 — but that is my autopilot being a
worse flier, not the game being harder: it prioritised mote lines over its own
obstacle avoidance and took 21 stone hits. I draw no difficulty conclusion from it.
The squeeze counts above are safe because they are a pure function of gather usage.

---

## 2. IS THE DIFFICULTY AUTHORED OR ARBITRARY?

**Authored where the old loss rules run; arbitrary where the new ones do.**

Five loss paths route through `lossCause()` (`DayScene.ts:3019`), which floats the
reason at the place it happened: the dark (`:2230`), stone (`:2603`), the falcon
(`:3270`), blown wide (`:3414`), the curtain (`:3489`). Those read as fair — the
un-armed pilot's death is 34 "blown wide" + 33 "the curtain held", and both name the
answer.

**Three paths write `lastLossSource` directly and never call `lossCause`, so they say
nothing on screen at the moment of loss:**

- the strain squeeze — `DayScene.ts:812`
- thin air at the ceiling — `DayScene.ts:1747`
- a missed tunnel prompt — `DayScene.ts:779`

Two of those three are the mechanics *this build added*, and the first is the one that
took **59 of 105 birds** in the hold run. The game's new central cost is invisible in
flight. Its only spoken warning, `'too tight — release to regroup'`
(`DayScene.ts:1923`), goes through `showPrompt`, which dedupes by key
(`DayScene.ts:1379`) — **it appears once per run, ever.** After that, a player losing a
bird every second to over-gathering is told nothing at all.

Two further attribution defects, both unchanged from the last pass:

- The failure card still prints `lastLossSource` (`DayScene.ts:4174`) — the **last**
  cause, not the dominant one. A run that dies of 34 wind-blows and 33 curtains will be
  told whatever happened to kill the final bird.
- The ability bar's whole thesis is *"when something is threatening the flock, the verb
  that beats it lights up"* (`hud.ts:12-19`). It suggests `spread` and `flare` for
  moths, `echo` for recoverables, `gather` for the falcon (`DayScene.ts:1660-1663`).
  **There is no `suggest('surge', …)` anywhere in the codebase** — and the brittle
  curtain is the #1 or #2 killer of an unarmed pilot in both of my runs (29 of 72; 33
  of 86). The bar answers four threats and stays dark for the one that kills you most.
  Worse: it lights **FLARE for moths, and flare does nothing to moths.**
  `MothSwarm.shed()` has **zero callers in `src/`**; moths are shed only by holding
  SPREAD (`creatures.ts:628`). The bar's highlight is a false instruction.

---

## 3. WHERE IS THE PEAK, AND DOES THE GAME BUILD TO IT?

**The architecture of a crescendo is genuinely there.** Falcon zone 2 at 22,300 →
Last Arch landmark at 23,200 → the fifth moth cluster at 23,800 → the tunnel at
24,250–25,950 → the roost at 26,600, with the music's intensity term stepping
0.15 → 0.5 → 0.85 at x=14,400 and x=20,400 (`DayScene.ts:1896`) and the journey tier
stepping at 12,000 and 20,400 (`:1902`). Encounters are spread, not clustered; no
creature's first appearance is its first threat (the first moth cluster is forced
harmless, `DayScene.ts:717`; the teaching tunnel has `intensity: 0` so every window is
0.95s wide and every miss costs 0 birds, `tunnel.ts:1479`). That is real authoring and
it deserves credit.

**Both peaks land as anticlimaxes**, for the reasons in §1. And there is a third,
smaller authoring gap underneath them:

**The teaching run does not teach the exam.** `PLAN_EASY_VERB = ['flare','surge']`
(`tunnel.ts:246`). The finale asks for flare ×3, surge ×3, **gather ×2 and echo ×1**
(`:228-238`). The gather prompt and the echo prompt make their first appearance
**at the climax, under cost**, in a corridor running at 1.62x — which is precisely the
rule the schedule's own comment claims to honour ("No encounter's first appearance is
also its first difficulty").

### The daylight raise worked. The fog that is supposed to show it still doesn't.

The 0.024 → 0.029 raise is doing its job on the sim side: a pilot who never presses a
verb dies at **x=11,102** (42% of the route), a pilot who only steers dies at
**x=18,551**, and the meter now actually swings — 0.56 to 1.00 across the completing
run, sawtoothing down between mote arcs and back up through them. There is a real
light economy and it now bites.

But the thing on screen that is supposed to *be* that meter still doesn't move with
it. `encroach` drives the fog, and its alpha saturates at `encroach × 1.5` clamped to
0.95 (`nightfall.ts:376,386`) — maximum from `encroach ≈ 0.63` upward. Measured across
**all four** of my instrumented runs, four different play styles:

| pilot | daylight mean | encroach mean | frames with `encroach ≥ 0.63` |
|---|---|---|---|
| raw | 0.85 | 0.79 | 97 / 117 (83%) |
| gathr | 0.84 | 0.81 | 117 / 137 (85%) |
| pulse (finished, 112 birds) | 0.87 | 0.74 | 129 / 157 (82%) |
| full | 0.81 | 0.77 | 81 / 102 (79%) |

**The fog is painted at or near its maximum for roughly four fifths of every flight,
in a run the player is comfortably winning.** A threat display pinned near maximum
carries no information, and it trains the player to stop looking at the one thing the
whole game is about. This is the same finding as the last pass and the number has not
moved.

---

## 4. DOES THE MOVESET EARN ITS SIZE?

Five is nearly the right number. **It ships six plus a chord**, and one of the five has
no demanded job outside the finale.

| verb | distinct job | demanded by | discoverable | call |
|---|---|---|---|---|
| **STEER** | yes | everything | yes | **Keep.** |
| **GATHER** | yes | `blown wide` — birds flung out of formation in dense terrain, 34 of 86 deaths for a pilot who never presses it (`DayScene.ts:3414`); also the falcon window and the wind zones | yes, first card | **Keep.** Now priced — but the price is dodgeable (§1d). |
| **SPREAD** | yes, and it earned it since the last pass | mote reach `26 → 130px` (`DayScene.ts:2264`); the **only** moth answer (`creatures.ts:628`); the tailwind bank; the scatter recollect radius | yes | **Keep.** This is the biggest quiet improvement in the build. |
| **SURGE** | yes | brittle curtains, the single largest killer of an unarmed pilot | taught on approach (`:3437`) — but **the bar never lights it** | **Keep, and light it.** |
| **ECHO** | yes, and it is the best verb in the game | the squeeze now produces up to 1.3 recoverables/s; Echo stops their 3.4s clock (`scatter.ts:96-98`) and flies them home from any distance at 78% odds | 6s cooldown now visible on the bar | **Keep.** Finally fed. |
| **FLARE** | **no, outside the tunnel** | brakes cruise ×0.38 for 0.4s; sheds nothing; prompted once on a heuristic at x>8,600. Its only demanded work is as a *token* for 3 of the 9 tunnel plates, where its world effect is irrelevant — and as a required reckoning answer that **cannot be submitted** | prompted, but not needed | **Cut it, or give it the moth job the bar already claims it has.** (`9f9ab4a` adds a fan-brake on the speed ceiling, which is a real consequence and moves this from "does nothing" to "does something nobody demands". It does not fix the bar's false moth highlight, and it does not make the verb submittable in a reckoning.) |
| **VORTEX** | duplicated | one LightThief in 26,600px (`DayScene.ts:726`, x=13,400). Its other effect is `callTimer = max(callTimer, 1.6)` (`:4640`) — Echo's job on a different input | gesture, taught once in a 1,100px band | **Cut.** A gesture with one scripted encounter and a borrowed effect is a set piece, not a verb. |
| **BRACE** | no — and it was supposed to be cut | nothing | **taught twice**: `showPrompt('brace')` at x=20,500–21,600 (`:1881`) and on use (`:4561`) | **Cut it properly.** SPACE+SHIFT is live at `:4552`, the world-slow at `:1504`, and while it is held **`gather` and `spread` are both forced false** (`:1568`, `:1570`) — the only input in the game that makes the two main verbs stop answering. The plan says no input is a chord. |

Note the pattern worth copying: **DIVE was cut correctly.** Its teaching block is now an
empty `if (this.scrollX > 6100 && this.scrollX < 7400) { }` (`DayScene.ts:1873`), its
prompt is unscheduled, and the engine capability was left in place because the falcon
uses the stoop internally. That is exactly the right shape of a cut. Brace and Vortex
did not get it.

Teaching load, counted: 5 first-encounter cards (`steer`, `light`, `dark`, `brittle`,
`cage`) plus 16 distinct prompt keys (`steer`, `gather`, `spread`, `regroup`, `surge`,
`flare`, `call`, `vortex`, `brace`, `wind`, `tailwind`, `strain-g`, `strain-s`,
`lowflock`, `leader`, `home`). Cutting brace and vortex removes 2 prompts and buys back
the teaching capacity SURGE and the squeeze both need.

---

## 5. STRONGEST AND WEAKEST

**Strongest thing in the game right now: the loss-and-rescue loop that strain, scatter
and Echo now form together.** Over-hold the formation and it sheds its most frayed bird
into a 3.4s window at 78% recoverable odds; call, and its clock stops and it flies home
to you from any distance under its own power. Every part of that is built, all three
pieces read the same language, and it is the first time in this project's history that
the cost of the dominant verb, the supply for the rescue verb, and the fiction have
been one object. Runner-up, and it deserves naming: `strays.ts:149-157` — a freed cage
bird at the flock ceiling **keeps flying alongside** and rejoins when attrition makes
room, instead of being destroyed for a count that never went up. That is the flock cap
done with care rather than with a clamp.

**Weakest thing in the game right now: both authored climaxes are unwinnable by
construction, and each one tells the player it was their fault.** The reckoning ends on
"IT BROKE THROUGH" after a dead key; the tunnel ends on a breakthrough meter that
cannot be filled because the plate names the previous verb. These are the two moments
the entire 26,600px is built to deliver, they are the two moments a player will judge
the game on, and a player who fails them has no way to learn that the failure was not
theirs. Everything else in this document is tuning. This is the game not working.

---

## THE THREE HIGHEST-VALUE CHANGES REMAINING

### 1. Draw the LIVE window, not the lowest-index hazard. (`tunnel.ts:1298-1306`)

Prefer `impact` over `buildup` over `decay` when choosing `live`, or exclude `decay`
entirely once any later hazard has entered `impact`. This is a handful of lines and it
converts the finale from unreadable to playable: 7 of 9 prompts currently spend
0.20–0.38s of a 0.45–0.85s window showing a verb that is already spent, and the
finale's last prompt is never shown while it can be answered.

Ranked first because it is the cheapest fix with the largest reach — it happens in
every run that gets there, it is the designated exam, and 60 birds (exactly 50% of
`START_BIRDS`) ride on it. While in there, two companions worth the same trip: give the
finale's `gather` and `echo` prompts a first appearance in the teaching run at x=7,000
(`PLAN_EASY_VERB`, `tunnel.ts:246`), and make the corridor walls cost *something*, or
stop claiming that "steering under pressure is the whole second half of this set piece"
(`tunnel.ts:1124`) when a missed prompt is the only thing that can hurt you.

### 2. Make the reckoning answerable — and take the tap threshold off the slowed clock.

Two edits. First, `doFlare` needs the same guard `doSurge` has: `if (this.reckonOn) {
this.reckonInput('flare'); return }` (mirror of `DayScene.ts:1186`). Without it
`'flare'` is in every shuffled sequence and cannot be submitted, so the win rate is 0
and `falcon.mobNow()` is dead code. Second, the surge/flare tap test at
`DayScene.ts:1595` / `:1601` must compare against `rawDt`-accumulated real time, not
`simClock` — during the reckoning the world runs at 12%, which turns the 0.22s tap
window into ~1.8 real seconds and makes every SPACE press submit both `gather` and
`surge`.

Ranked second because it is smaller in code than #1 but restores the one moment the
design calls *"the single triumph the game offers"* — and because a peak that is
currently 0-for-4 is worse than no peak, since the failure line accuses the player.

### 3. Let the squeeze speak, at the place it happens.

Route the strain squeeze (`DayScene.ts:812`) and thin air (`:1747`) through
`lossCause()` like every other loss rule, so *"the formation could not hold"* floats at
the bird that left. Then let the strain warning repeat: `showPrompt` fires once per key
per run (`:1379`), so the only sentence explaining the game's new central cost appears
one time and never again. Mark the 0.82 squeeze threshold on the ability bar's arc —
right now it goes coral at `spent > 0.55` (`hud.ts:418`) and there is no line where the
charging starts. And add `bar.suggest('surge', …)` for an approaching brittle piece,
because the bar's own contract is that the answering verb lights up and the curtain is
the biggest killer in the game.

Ranked third only because #1 and #2 are broken rather than illegible. But this is the
change that decides whether the strain rebalance — the best structural work in this
build — reads as authored or as arbitrary. Right now the player is charged one bird a
second for a cost the game mentions once and then never surfaces again, which is the
exact definition of arbitrary difficulty the last pass wrote this file to remove.

*(Not in the top three, but nearly free and worth doing in the same pass: finish the
cuts. Brace and Vortex are still live, still taught, and Brace is the only input in the
game that makes GATHER and SPREAD stop answering. DIVE shows how to do it.)*
