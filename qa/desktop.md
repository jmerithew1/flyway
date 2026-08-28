# FLYWAY — Desktop QA & Interaction audit

**Lane:** desktop QA + interaction inventory (lane 8)
**Viewport:** 1536 x 960, headless Chromium (Playwright 1.62), real GPU via `--use-angle=d3d11`
**Date:** 2026-08-28
**Harness:** `qa/dq_*.py` (read-only; nothing under `src/` or `tools/` was touched)
**Captures:** `qa/shots/desk/`

---

## 0. Builds under test — read this before reading anything else

The repo moved **three times** while this audit ran. Every finding below names the build it
was observed on.

| Tag | Bundle | Source | Where it was used |
|-----|--------|--------|-------------------|
| B1 | `index-BNVFtfoe.js` | commit `eea7ed3` (the HEAD named in the brief) | first exploratory passes |
| B2 | `index-CaqK42El.js` | owner's **uncommitted** working tree, rebuilt into `dist/` at 01:47 mid-audit | some mid-audit captures (`70_mon_*`, `85_finishing`) |
| **B3** | `index-BVN40k8w.js` | commit `7821bc6` | **pinned server on :5310 — every finding below was re-verified here** |
| B4 | `index-Boay7hvk.js` | commit `77012f6` | what the live site serves at the end of the audit |

I re-baselined onto **B3** the moment I noticed the drift, and re-verified every ranked
finding against it. B3 was, at the time, **byte-identical to the live deploy**.

I then re-checked each ranked finding against the *source* at `77012f6` (= B4 = live now).
**All of the ranked defects below are still present in that code.** Nothing here is stale.

### Live deploy identity — VERIFIED CURRENT, twice

Do not accept HTTP 200 as proof; I didn't. Two independent proofs:

1. **Byte identity.** `https://jmerithew1.github.io/flyway/assets/index-Boay7hvk.js` downloads to
   md5 `01b1c6d972c2c461555274d45a60c474`. Building commit `77012f6` in a clean worktree
   produces `dist/assets/index-Boay7hvk.js` with **the identical md5**. Earlier in the audit
   the same test passed for `index-BVN40k8w.js` vs commit `7821bc6`
   (md5 `083a45ab4148eedf59555a2a2326ff12`, `cmp` reported byte-identical).
2. **Behavioural.** I drove the *live* site into flight and read the running scene
   (`qa/dq_live.py`, captures `L01`–`L04`):
   - ability bar present with all six verbs: `['GATHER','SPREAD','SURGE','FLARE','ECHO','DIVE']`, alpha 0.95
   - both tunnels registered: `[{x:7000,name:'The Narrows'}, {x:24250,name:'The Tunnel'}]`
   - **29** monument/lamp sprites in the live display list (13 monuments + 14 lamps + extras)

   These are all today's work. The live build is not stale.

**Caveat the brief should know:** the brief names `eea7ed3` as HEAD. Master is now `77012f6`,
three commits further on (`c413eeb` "Audit fixes: unanswerable tunnel prompts…", `7821bc6`,
`77012f6`). The live site is *ahead of* the commit the brief pinned, not behind it.

### Environment note that will bite the next person

`npx vite preview` **does not serve the `/flyway/` base**. `vite.config.ts` sets
`base: command === 'build' ? '/flyway/' : '/'`, and preview runs as `command === 'serve'`, so
preview serves at `/` while the built `index.html` links `/flyway/assets/...`. Requesting
`http://localhost:5210/flyway/` returns the SPA fallback for *everything* — including
`assets/index-*.js` (served as `text/html`) — so the page renders only the boot veil with a
broken wordmark image and never boots. The exact command in the brief reproduces a dead page.
Use `npx vite preview --base /flyway/` (and beware Git Bash mangling `/flyway/` into a Windows
path — pass it from PowerShell, or use `qa/dq_serve.py` which mimics GitHub Pages exactly).

---

## 1. Ranked findings

### F1 — CRITICAL. `R` from the pause screen soft-locks the run. Build B3, still in `77012f6`.

**Steps**
1. Start a flight. Press `P`. The pause card reads *"P to fly on · M mute · **R restart the day**"*.
2. Press `R` — the only restart the game offers anywhere.

**What happened.** The day restarts (`scrollX` back to 0, 120 birds) **and stays paused
forever**. Measured: `paused: true`, `scrollX: 0` at +5s and still `0` at +11s — the world
never advances. Because `update()` returns early while paused, every HUD element drawn from
`update()` never draws: the ability bar has its six *labels* but **no icons and no plate**, the
DAYLIGHT ribbon is an empty label with no bar, the flock dial has no arc. The `PAUSED` veil
belonged to the old scene instance and was destroyed on shutdown, so **nothing on screen says
the game is paused.** The player sees a frozen, half-drawn game.

The only escape is pressing `P` again, which is signposted nowhere at that point.

**What should have happened.** `R` restarts into a live, running day.

**Root cause.** `DayScene.paused` is a class *property initialiser* (`private paused = false`,
`src/scenes/DayScene.ts:4352` at `77012f6`). Property initialisers run in the constructor.
`this.scene.restart()` (`DayScene.ts:865`) re-runs `init/preload/create` but **not** the
constructor, so `paused` keeps its previous value. Any field initialised at declaration rather
than in `create()` has the same problem.

**Same root cause, lesser symptom:** `debugVisible` also leaks. Press `D` (debug overlay on),
press `R` — after the restart `debugVisible === true` but `debugText.visible === false`, so the
`D` key is now inverted: the first press *hides* an already-hidden overlay.
(`muted` also leaks, but persisting a mute preference is probably wanted — flagging only.)

**Captures:** `V13_after_R.png`, `W02_R_from_pause.png`, `W03_R_from_pause_plus6s.png`,
`W04_after_P_recovery.png`, `W05_debug_after_restart.png`. Repro: `qa/dq_v2.py`.

**Note:** `R` pressed while *running* is fine — the bug needs the pause, which is exactly the
path the pause card advertises.

---

### F2 — CRITICAL. Every button on RESULTS and on the FLYWAY MAP is dead to the mouse. Build B3, still in `77012f6`.

Four buttons — **REPLAY FLIGHT**, **CONTINUE JOURNEY**, **FLY AGAIN**, **HOME** — cannot be
clicked. Clicking the visible label does nothing at all: no hover highlight, no press.

I hit-mapped each one by walking the pointer over a grid and asking Phaser's own
`input.hitTestPointer()` what was under it. `#` = this button responds, `.` = nothing:

```
'CONTINUE JOURNEY'  bounds=[654,886,270,25]  hitArea=[-60,-30,390,85]  customHitArea=false
   dy -60  .....................
   dy -45  .....................
   dy -30  .##############......   <- the ONLY live row, 30px ABOVE the label
   dy -15  .....................
   dy  +0  .....................   <- the label itself: dead
   dy +15  .....................
```

All four behave identically: the live hit strip is one ~15px band **30 pixels above** the
glyphs and offset ~50px to the **left**, ending before the label's right edge.

**Root cause.** `ResultsScene.ts:175` and `FlywayMapScene.ts:318` both do:

```ts
btn.input!.hitArea = new Phaser.Geom.Rectangle(-60, -30, btn.width + 120, btn.height + 60)
btn.input!.hitAreaCallback = Phaser.Geom.Rectangle.Contains
```

without setting `btn.input.customHitArea = true`. Phaser resets a Text object's hit-area
`width`/`height` to the glyph size on every re-render while `customHitArea` is false — and the
buttons re-render on `pointerover` (`btn.setColor(...)`). The offsets `x:-60, y:-30` survive;
the size is snapped back. Result: a label-sized rectangle displaced up-left, entirely off the
label. This is **the exact bug the Title screen already documents and fixes** — see the comment
at `TitleScene.ts:677` ("Hover reported the button; the press missed it") — the fix was never
carried to the other two scenes.

**Consequence:** a mouse-only player who reaches the roost has **no clickable way out of the
results screen.** Only the keyboard works (`R`, `J` on results; `R`, `ESC` on the map — all
verified PASS). The screen prints "press R" / "press J" underneath, so it is survivable, but
the primary affordance is broken.

**Secondary:** both results buttons are `setInteractive()` from creation while still at
`alpha: 0` (they fade in at ~+3.4 s). They are clickable while invisible.

**Captures:** `R01_results_full.png`, `R02_after_replay_click.png`, `R03_after_continue_click.png`,
`X01_results.png`, `M01_map.png`. Repro: `qa/dq_v6.py` (hit map), `qa/dq_v4.py`, `qa/dq_v3.py`.

---

### F3 — HIGH. The checkpoint card promises a bird count the game does not deliver. Build B3, still in `77012f6`.

**Steps.** Fly until the flock scatters. Read the card. Press a key. Count the flock.

**What happened.** The card read **"108 BIRDS WILL FLY AGAIN"** (`checkpoint.count === 108`).
After the return:

| after | flock count |
|-------|-------------|
| +0.5 s | 90 |
| +1.5 s | 87 |
| +3.0 s | 86 |
| +6.0 s | 84 |

Promised 108, delivered 90 and falling — 22 % short and still bleeding. A second run showed the
same shape (card said 107, count read 60 immediately after the return).

**What should have happened.** The number on the card is a promise the restore should honour.

**Captures:** `M10_fail_card.png`, `N05_fog.png`, `N06_after_return.png`.
Repro: `qa/dq_v9.py` (`ABUSE 4`), `qa/dq_v5.py`.

**Related, same screen:** the metrics line read *"34 of 120 still flying · 6 lights gathered"*
while the live HUD counter next to it read **39**, and *"85 called back"* against a 120-bird
start. The tallies on this card do not reconcile with each other or with the HUD. Worth a
pass with a calculator.

---

### F4 — HIGH. Every camera push-in magnifies and crops the fixed HUD. Build B3, still in `77012f6`.

**Steps.** Trigger any `camDir.pushIn()` — the tunnel split fires `pushIn(1.06, 500)`
(`DayScene.ts`), and the mob beat fires `pushIn(1.07, 700)` (`camera.ts:230`).

**What happened.** `cam.zoom` reaches **1.058–1.060** (measured). Phaser's camera zoom scales
`scrollFactor(0)` objects too, so the entire HUD is blown up around the screen centre and
pushed past the viewport edges. At zoom 1.058 with a 1536×960 canvas, 42 px is lost off each
side and 27 px off the top and bottom. Observed in the frame:

- the flock dial ring at top-left is **cut in half by the top edge**
- the multiplier reads "×1." — the final digit is **off-screen right**
- the DAYLIGHT percentage is clipped against the top edge
- the ability bar labels are **clipped at the bottom edge**; the bar's plate is gone below it
- the left-margin "N scattered / Recovered N" lines lose their first characters

`camera.ts`'s own header guards the *zoom-out* direction ("below zoom 1.0 the frame visibly
tears at the border") and clamps `minZoom`. The zoom-**in** direction cropping the HUD is not
guarded.

**What should have happened.** The camera may push in on the world; the screen-space HUD must
not move.

**Captures:** `Z01_zoomed_hud.png` (pushed) vs `Z02_rest_hud.png` (rest) — same frame, same
scene, only the zoom differs. Also visible in the wild at `25_after_echo.png` (the tunnel
split). Repro: `qa/dq_v6.py`.

---

### F5 — MEDIUM. Once you open CONTROLS, `SPACE` and `ENTER` never start the flight again. Build B3, still in `77012f6`.

**Steps**
1. Load the title. (`SPACE` works here — verified; `ENTER` works here — verified.)
2. Click **CONTROLS**.
3. Press `SPACE`, press `ENTER` — correctly nothing happens (the panel guard blocks it).
4. Close the panel (`ESC`, or a click — both verified working).
5. Press `SPACE`. Press `ENTER`.

**What happened.** Neither key does anything, ever again. The screen still says **"or press
SPACE"** directly under the button. Only the mouse can start the game from that point on.

**What should have happened.** `SPACE`/`ENTER` keep working after the card is dismissed.

**Root cause.** `TitleScene.ts:734-735` register the two keys with `once(...)`, and
`beginFlight()` returns early when `this.panel` is set (`if (this.started || this.panel) return`).
The guard fires, does nothing — and the one-shot listener is spent.

**Capture:** `V02_title_keys_dead.png`. Repro: `qa/dq_v1.py` (`### T-2`), `qa/dq_title2.py`.

---

### F6 — MEDIUM. The pause screen has no clickable control at all, and keys still fire through it.

Two problems on one screen. Build B3, still in `77012f6`.

**6a — no clickable control.** With the game paused, Phaser reports **zero** input-enabled
objects in the scene. The veil is a rectangle plus two Text objects; nothing is interactive.
The owner already reported "there's not a restart option on pause on mobile" — **it is the same
on desktop**, and desktop only survives because the card names the keys in text
(`P to fly on · M mute · R restart the day`) — in 18 px italic serif at low contrast over the
scrim, which is the least legible type on the screen. And the one restart it names is F1.

**6b — Echo fires while paused.** With the world stopped (`scrollX` delta measured at exactly
`0.0` over 3 s), pressing `C` (or `E`):

```
callCooldown before C : 0
callCooldown after  C : 6     <- the full six-second cooldown, spent from the pause menu
still paused          : true
```

`echoCall()` (`DayScene.ts`) has no `paused` guard. Its **first line is
`this.tunnel.verb('echo')`** — so a key pressed on the pause screen can also answer a live
tunnel prompt while the world is frozen. `M` (mute) is meant to work while paused; `C`/`E` are
not, and an accidental press silently costs the player their rescue.

**Captures:** `V11_paused.png`, `V12_paused_echo.png`. Repro: `qa/dq_v1.py` (`### D-2`).

---

### F7 — MEDIUM. Rescue toasts stack on top of each other and print an unreadable smear.

When several birds return in the same instant the "+1 BIRD" floaters spawn at the same point
and overprint. Captured mid-flight: three or four overlapping toasts render as
**"+11 BIRDDDD"**, with two more "+1 BIRD" lines 40 px above, also overlapping.

**Capture:** `Z20_split_1.png` (centre of frame). Nothing in the console; purely visual.

---

### F8 — MEDIUM. Hard-edged rectangular seams cut across the painted world.

At certain scroll positions a **perfectly axis-aligned, stepped rectangular boundary** appears
over the art — a straight vertical run, a horizontal jog, another vertical run — with a visible
tone shift across it. It crosses the sky, a ruin and a hanging vine in one straight line, so it
is an overlay quad, not painting.

Measured objectively rather than by eye: mean horizontal luminance gradient per column over
rows 0–360. Typical background is **0.3–3.8**; at the seam it measures **12.65** at `x = 1476`
(and **6.4–6.9** at other scroll positions). It is scroll-position dependent — it comes and
goes over roughly 60 px of travel.

**Captures:** `zz_seam_1476.png` (2× crop — unmistakable), `S00_frozen.png` (full frame, hard-
frozen via `game.loop.sleep()` so the two reference shots are pixel-identical),
`70_mon_06300_colonnade_triple.png` + `zz_crop_topright.png` (a second instance, build B2).

**Attribution: inconclusive, and I want to be honest about that.** My layer-toggle method is
unreliable for background layers (hiding the sky removes all the image content in the band and
collapses the metric regardless). The layers whose *screen* edges coincide with the measured
seam at that frame were: `fg_tr_column` (depth 6.6, `scrollFactor 0`, left edge x=1469),
`statue_robed` (depth 1.2, right edge x=1483), and four `panorama_*` plates (depth −6,
`scrollFactor 0`, alphas 0.50/0.55/0.60/0.50, four different widths stacked at the same x —
a shape that *would* produce exactly this nested-rectangle stepping). I checked the source art
(`public/assets/processed/sky/sky_sun_gate.webp`, and the 2× variant) for a baked-in seam —
there is none. **This one needs the owner's eye on the captures.**

---

### F9 — LOW. The live site logs six 404s and six console errors on every load.

```
404  https://jmerithew1.github.io/flyway/audio/wings.mp3
404  https://jmerithew1.github.io/flyway/audio/bells.mp3
404  https://jmerithew1.github.io/flyway/audio/pad.mp3      (each requested twice)
```

`Audio.tryLoadStems()` probes for optional Suno stems at `audio/<layer>.mp3` and swallows the
failure (`.catch(() => undefined)`), so it is harmless *by design* — `public/audio/` does not
exist and is not meant to. But these are **the only console errors the deployed game produces**,
they are red, and they fire twice per session (both `audio.start()` entry points). Anyone who
opens devtools during a demo sees six red 404s. A `HEAD` probe, a manifest, or a build-time
existence check would silence them.

**Log:** `qa/shots/desk/live_logs.json`.

---

### F10 — LOW. The developer sandbox scene ships in production and is reachable from the public URL.

`https://jmerithew1.github.io/flyway/?sandbox` loads a bare debug harness: grey primitive
obstacles on a gradient, a `birds 120 fps 10 form 0.00` readout top-left. `main.ts` routes
`params.has('sandbox')` to `SandboxScene`, which is in the production scene list.

Not reachable by accident, but it is a live debug surface with an fps counter on a graded
submission.

**Capture:** `L03_live_sandbox.png`.

---

### F11 — LOW / observation. The vortex gesture did not fire, and is not documented anywhere.

I drove two full circles at 120 px radius (well over `GESTURE_MIN_RADIUS = 42`) at ~40 Hz;
`flock.vortex` stayed at `0.00`. The gesture is also absent from the CONTROLS card, so a player
has no way to learn it exists.

**Caveat:** synthetic pointer motion may not reproduce a human gesture's timing, so I am not
calling this broken — only that it did not respond to a generous synthetic input and is
undiscoverable. **Capture:** `P04_vortex.png`.

---

## 2. What landed today, and whether it works

### The ability bar (`src/hud.ts`) — WORKS

Renders low-centre, six icons with labels: `GATHER SPREAD SURGE FLARE ECHO DIVE`.
Plate `[556, 860.4, 424×79.4]`, icons at x = 588/660/732/804/876/948, y = 890, r = 20, alpha 0.95.
Labels at y = 915, bottom edge 922 on a 960 canvas — tight but clear.

**The arcs move.** Holding `SPACE`, `arcT[0]` (GATHER) drained `1.00 → 0.75 → 0.69`, and under
a longer hold to `0.116 → 0.00`, while the other five stayed at 1.00. The suggestion highlight
works too — ECHO lights up when the dark has a bird (`23_gather_strained.png`).

**It does not obscure anything** at rest. At camera push-in it is clipped by the bottom edge —
that is F4, not the bar's fault.

### The tunnel (`src/tunnel.ts`) — WORKS, and here are the numbers the brief asked for

Answering the owner's three questions directly, all measured on B3 (= live):

**"Does the split actually hold two streams apart, or do cohesion forces drag them back
together?"** → **It holds.** Sampled every frame while `splitEase > 0.6` (83 frames): the gap
between the two lane means was **min 107 px, max 248 px, mean 203 px**. Within-lane spread
(standard deviation) ran 1–56 px and 6–70 px. The separation is 3–4× the internal spread, so
the two streams are cleanly distinct for the whole corridor and do **not** merge.
Series sample: `[107, 210, 195, 214, 218, 216, 212, 207, 185]`.
**Capture:** `Z20_split_1.png`. Repro: `qa/dq_v8.py`.

**"Does the meter fill?"** → **Yes, to 1.0, and breakthrough fires.** Frame-accurate timeline
for The Narrows (x = 7000), answering each prompt inside its impact window:

```
118453 ms  hz0 flare  -> impact
118675 ms  hz0 flare  -> decay   hit=true   meter 0.5
119822 ms  hz1 surge  -> impact
120592 ms  hz1 surge  -> decay   hit=true   meter 1.0
FINAL: meter=1  brokeThrough=true
```

A miss subtracts rather than zeroing, as designed (observed 0.5 → 0.2 on a missed surge).
Repro: `qa/dq_v7.py`.

**"Can you reach the roost through it?"** → **Yes.** Full autopilot run reached `finishing` at
scrollX 25455 with **114 birds** and handed off to the Results scene. Captures
`85_finishing.png`, `E20_results_early.png`.

**One measured caveat worth the owner's attention.** The prompt window closes on *whichever
comes first*: `h.t >= h.window`, or `cx > h.x + 70`. In the teaching tunnel (nominal window
0.95 s) the distance rule closed a window at **770 ms** and another at **672 ms** — 70–80 % of
the advertised time. The finale runs `window = lerp(0.95, 0.42, a·intensity)` at
`intensity = 1`, so its last prompts are authored at **0.45 s** and the distance rule can cut
that further. In one run my answer arrived **75 ms after** the window closed and was silently a
no-op *after* the miss had already torn birds off. I am not calling the finale unfair — I could
not drive it well enough to judge — but those are the numbers.

### 13 monuments and 14 lamps — CORRECT, scenery reads as scenery

Photographed all 13 at ~centre-screen (`70_mon_*.png`). Nine decor pieces sit at depth 1.2
behind the flock and read unambiguously as distant scale — the `colossus_head` at 19800 is a
genuinely good shot, and the birds visibly fly *in front of* it. The four solid encounters
read as passable where they are passable:

- **colonnade_triple** (6300) — three arches with clearly threadable bays. Best obstacle in the
  captures.
- **dome_broken** (9400), **lintel_fallen** (15900), **arch_window_nest** (17300) — all present
  and readable.

No decor piece read as an obstacle in any capture. The live display list carries **29** of these
sprites, confirming the whole set shipped.

### Strain removes birds, and Echo brings them back — WORKS

Holding `GATHER` continuously: `120 → 115 → 110 → 104 → 101 → 98 → 94 → 92 → 87 → 85 → 82`
while `gatherStrain` pinned at 1.000 and `arcT[0]` at 0.00. The on-screen prompt
"too tight — release to regroup" appeared, and the left margin tracked "N scattered /
Recovered N". Three `C` presses recovered birds (72 → 79 across the sequence; a later run
showed 85 recovered in one flight). Flock cap `maxBirds` reads 120 and was never exceeded.

### Camera and VFX directors — RUNNING

Zoom rests at exactly 1.0, pushes to 1.058–1.060 and pulls back cleanly. Speed lines, air-wall,
echo rings, feather puffs, downpour and scatter cloud all render. The push-in's HUD cropping is
F4.

### The checkpoint return — WORKS, with F3's number problem

First loss shows the full card and **waits**: still `failing` after 6 s with no input, then
recovered **0.2 s** after a key. Card copy is good and names the cause
("THE FLOCK SCATTERED / struck the stone / … / Returning to Sun Gate"). Repeat behaviour I
could not time cleanly — see §5.

### The graded arrival — PRESENT, NOT DISCRIMINATED

`arrivalGrade` (`golden`/`harried`/`hunted`, `DayScene.ts:4847-4856`) drives `audio.arrivalCeremony()`
and the arrival visuals. It exists and runs. I reached the roost twice and did not get a
distinguishing capture of all three grades — see §5.

---

## 3. Interaction inventory — every control, activated

Legend: **PASS** = does what it says. **FAIL** = defect. All on B3 unless noted.

### Title screen

| Control | How | Result |
|---|---|---|
| `BEGIN FLIGHT` (Zone `begin`, 508×112 @ 768,786) | click | **PASS** → Day |
| Sky (Zone `sky`, 1536×860, depth 1) | click anywhere above the chrome row | **PASS** → Day (intentional; documented in source) |
| `CONTROLS` (Zone, 155×48 @ 106,914) | click | **PASS** → controls card opens |
| Controls card | click anywhere (closer zone, depth 310) | **PASS** → closes |
| Controls card | `ESC` | **PASS** → closes |
| `SHARE` (Zone, 114×48 @ 1451,914) | click | **PASS** → "LINK COPIED" toast appears |
| `SPACE` on a clean title | key | **PASS** → Day |
| `ENTER` on a clean title | key | **PASS** → Day |
| `SPACE` / `ENTER` while the card is open | key | **PASS** (correctly blocked) |
| `SPACE` / `ENTER` after the card is closed | key | **FAIL — permanently dead (F5)** |

Note: the controls card lists five verbs (STEER / SPACE / SHIFT / C / MOUSE). The ability bar
shows six. `E` is a working synonym for `C` and is not mentioned. The vortex gesture is not
mentioned at all (F11).

### In flight

| Control | How | Result |
|---|---|---|
| Steer | mouse move | **PASS** — intent tracks the pointer |
| `GATHER` | hold `SPACE` | **PASS** — form → +1, strain accrues, arc drains, birds shed above threshold |
| `SURGE` | tap `SPACE` (<0.22 s) | **PASS** — `flock.surge()` fires; resolved a live tunnel prompt |
| `SPREAD` | hold `SHIFT` | **PASS** — form → −1, `spreadStrain` → 1.0 |
| `FLARE` | tap `SHIFT` | **PASS** — `flock.flare()` fires; resolved the tunnel SPLIT prompt |
| `ECHO` | `C` | **PASS** — cooldown 0 → 6, wavefront, birds recovered |
| `ECHO` | `E` | **PASS** — same handler |
| `DIVE` | hold `V` | **PASS** — `dive=true`, centreY 430 → 683, release gives `diveLift 0.44` |
| `DIVE` | hold left mouse button | **PASS** — `dive=true`, release gives lift |
| `BRACE` | hold `SPACE`+`SHIFT` | **PASS** — `braceOn=true`, `flock.bracing=true`, `braceAmt 0.98` |
| Vortex | circular mouse gesture | **did not fire** (F11) |
| `P` pause / unpause | key | **PASS** — world stops dead (`scrollX` delta 0.00 over 3 s) |
| `M` mute | key | **PASS** — flag flips, toast shows, works while paused |
| `D` debug overlay | key | **PASS** first time; **FAIL** (inverted) after a scene restart (F1) |
| `R` restart, while running | key | **PASS** |
| `R` restart, from pause | key | **FAIL — soft-locks (F1)** |
| Pause screen | any clickable control | **FAIL — none exist (F6a)** |
| `C`/`E` while paused | key | **FAIL — spends the cooldown, answers tunnel prompts (F6b)** |
| First-encounter card, "press any key to continue" | any key | **PASS** |
| Fail card, "PRESS ANY KEY TO FLY AGAIN" | any key | **PASS** — 0.2 s to flying |
| Fail card, click | pointer | **PASS** — bound alongside the key |

### Results screen

| Control | How | Result |
|---|---|---|
| `REPLAY FLIGHT` | click the label | **FAIL (F2)** |
| `CONTINUE JOURNEY` | click the label | **FAIL (F2)** |
| `R` | key | **PASS** → Day |
| `J` | key | **PASS** → FlywayMap |
| `SPACE` | key | **PASS** — skips the ceremony, all odometers snap to final |
| click anywhere | pointer | **PASS** — same skip |
| Buttons while `alpha: 0` | click | **latent** — interactive ~3.4 s before they are visible |

### Flyway map

| Control | How | Result |
|---|---|---|
| `FLY AGAIN` | click the label | **FAIL (F2)** |
| `HOME` | click the label | **FAIL (F2)** |
| `R` | key | **PASS** → Day |
| `ESC` | key | **PASS** → Title |

---

## 4. Try-to-break results

| Attack | Result |
|---|---|
| Mash 13 different keys on the first-encounter card | No crash. `P` correctly paused; everything else inert. Scene intact. (`N01`) |
| Mash 8 keys during pause | No scene change, no crash — except `C`/`E` (F6b). (`28_paused_mashed`) |
| Fly backwards (pointer hard left) 25 s | No crash. Slow attrition 120 → 115. Rubber-band mercy keeps the scroll advancing rather than stalling. (`N02`) |
| Fly into the ceiling 20 s | No crash, **zero** birds lost — centreY clamps at ~166–217. The ceiling is completely safe; the floor is not (below). Asymmetry worth a design look. (`N03`) |
| Fly into the floor 20 s | No crash; steady attrition 117 → 107, centreY 785–844 (below `SKY_BOTTOM = 830`). (`N04`) |
| Sit still at the screen's left edge | Fails as intended. (`N05`) |
| Hold `GATHER` for 30 s continuously | Sheds 38 birds, prompt fires, arc bottoms out, no crash, birds recoverable. |
| Hold `SPREAD` for 24 s | `spreadStrain` pins at 1.0, attrition, no crash. |
| Fail twice in one run | Recovers both times. |
| Freeze the game loop and toggle 264 display objects | No crash, no leaked state. |

**Console and network across ~15 driven sessions on the local pinned build: zero errors, zero
page errors, zero 404s.** The only 404s anywhere in this audit are the three optional audio
stems on the live host (F9). Everything else logged as "failed" in my capture files is
`net::ERR_ABORTED` from my own `page.goto()` cancelling in-flight asset loads — harness noise,
not a defect.

---

## 5. What I could NOT test, and why

1. **The finale tunnel at x = 24250, played well.** I reached it and it ran (phase advanced,
   prompts appeared, split fired, `speedMult` ramped), but my driver answered only 2 of its 9
   prompts and the meter peaked at **0.16**. The teaching run's meter *does* reach 1.0, so the
   mechanism is proven — but **nobody has yet filled the finale's meter**, and I cannot say
   whether a human can. Its climax windows are authored at 0.45 s and the distance rule can
   shorten them. This is the single biggest remaining unknown.

2. **The three arrival grades.** `golden` / `harried` / `hunted` are computed from daylight
   remaining, distance from the fog and flock held. I arrived twice, both times in the same
   band, and did not capture a visual or audio comparison of all three. Whether they read as
   *different endings* to a player is untested.

3. **Audio.** Headless Chromium blocks the AudioContext until a real gesture and I have no way
   to listen. Every audio call is fire-and-forget with no return value, so I could confirm the
   calls happen but not that anything is audible, in tune, or mixed. The whole audio lane is
   unverified.

4. **Frame rate / performance.** Deliberately not reported, per the brief. I did have to swap
   the renderer to get a playable clock: under SwiftShader the sim ran at ~1.5 rAF/s and, since
   `dt` clamps at 1/20, the game advanced **13× slower than wall time** (scroll measured at
   2.2 px/s against a nominal 178). `--use-angle=d3d11` gave the real GPU and ~34–53 fps. No
   timing number in this report should be read as a claim about the owner's machine.

5. **Exact attribution of the rectangular seam (F8).** Explained in the finding. The artifact
   is measured and captured; the responsible layer is not identified.

6. **The repeat-failure retry time.** The design target is "flying again inside a second"
   (`tBack = 700 ms`). My measurement read 3.01 s, but that window included a screenshot call,
   and my second failure happened at a *different* landmark (`failsHere` reset to 1), so it may
   not have taken the repeat path at all. **Not a finding — an unmeasured claim.**

7. **The `SHARE RESULT` variant of the title chrome.** It only appears once a best flight is
   recorded in `localStorage`; I tested `SHARE` on a fresh profile only.

8. **Resolutions other than 1536×960**, and the whole touch layer — out of this lane.

9. **`arch_window_nest`, `dome_broken` and `lintel_fallen` as *encounters*.** I photographed
   them and confirmed they read as passable, but my autopilot steers to the widest gap in the
   collider field, so it never had to *thread* one under pressure. Whether they are fun, or
   fair, is untested.

---

## 6. Reproduction

Serve a pinned build exactly as GitHub Pages does, then run any script:

```
git worktree add /tmp/fw-head <commit> && cd /tmp/fw-head && npx vite build
python qa/dq_serve.py "<abs path>/fw-head/dist" 5310
FLYWAY_URL=http://127.0.0.1:5310/flyway/ python -u qa/dq_v2.py     # F1  restart soft-lock
FLYWAY_URL=http://127.0.0.1:5310/flyway/ python -u qa/dq_v6.py     # F2  button hit map + F4 zoom
FLYWAY_URL=http://127.0.0.1:5310/flyway/ python -u qa/dq_v9.py     # F3  checkpoint promise + abuse
FLYWAY_URL=http://127.0.0.1:5310/flyway/ python -u qa/dq_v1.py     # F5  title keys + F6 pause
FLYWAY_URL=http://127.0.0.1:5310/flyway/ python -u qa/dq_v7.py     # tunnel meter fills to 1.0
FLYWAY_URL=http://127.0.0.1:5310/flyway/ python -u qa/dq_v8.py     # split separation
python -u qa/dq_live.py                                            # live deploy smoke
```
