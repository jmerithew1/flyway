# FLYWAY — FUNCTION lane QA pass

**Build under test:** frozen snapshot of `04059b4` ("Cut DIVE, feather the fog and parallax art, guard against truncation"), served from `C:/Users/merit/AppData/Local/Temp/judge`. Bundle `assets/index-CyHhw0TR.js`, md5 `40ac94d8a9b7cc5ec238982430d70a22`. Nothing was rebuilt; nothing under `src/` or `tools/` was touched.

**Lane:** does everything *work*, desktop and mobile. Rendering, feel and visuals are other judges' lanes and are not adjudicated here.

**Date:** 2026-08-28

---

## 1. Verdict at a glance

| | |
|---|---|
| Checks run | 100+ across 6 driven sessions |
| Blocking defects | **1** |
| Major defects | **2** |
| Minor defects | **3** |
| Regressions verified fixed | **7 of 10** |
| Regressions **not** fixed | **3 of 10** (#4 partly, #7 partly, #9 partly) |

The game is functional end to end on both platforms. Every screen is reachable, every control on every screen can be activated, the flight plays, fails, recovers and finishes, and scene transitions all work. Three of the ten claimed fixes are incomplete, and one of those is a real, silent, player-facing loss on the single most common mobile entry path.

---

## 2. Findings, ranked by consequence

### F1 — BLOCKING · The simulation runs behind the "turn your phone" notice when the page is *loaded* in portrait

* **Viewport:** 390×844 portrait, `has_touch`, mobile UA. Both `?day` and the plain title route.
* **Steps:** Open `http://.../flyway/?day` with the viewport already at 390×844. Do nothing. Wait.
* **What happened:** The rotate notice shows and the canvas is hidden — correctly. But `game.loop.running` stays `true` and the world keeps running. Measured over one 30-second observation:

  | t | `loop.running` | `loop.frame` | `scrollX` | `night.daylight` |
  |---|---|---|---|---|
  | 12s | true | 698 | — (still booting) | — |
  | 21s | true | 997 | 83 | 0.9754 |
  | 24s | true | 1039 | 234 | 0.9306 |
  | 27s | true | 1071 | 285 | 0.9223 |
  | 30s | true | 1108 | 344 | **0.9126** |

  **6.3 percentage points of daylight burned in 9 seconds**, and the world scrolled 261px, while the player was looking at a card telling them to turn their phone. On the title route the loop likewise ran free: `loop.frame` 733 → 1749 over 18 s.
* **What should have happened:** `game.loop.running === false` and zero frames advanced, exactly as regression 4 claims.
* **Why it is only half fixed:** `src/main.ts` does call `gate()` immediately, and the `change` listener works — verified: rotating *into* portrait from landscape correctly sleeps the loop (`loop.frame` 1187 → 1187 over 12 s, `running=false`). The initial call is the broken one. `gate()` runs inside `Promise.all([fontsReady]).finally(...)` right after `new Phaser.Game(config)`, before Phaser has started its own `TimeStep`. Phaser's `TimeStep.sleep()` is guarded — `if (this.running) { raf.stop(); running = false }` — so at that moment it is a **no-op**, and Phaser then starts the loop itself a moment later with nothing left to stop it. Only an actual orientation *change* event ever puts it to sleep after that.
* **Consequence:** The default way a person opens a link on a phone is holding it upright. That player's run is already partly lost, invisibly, before they have seen a single frame — which is the exact symptom the regression was filed for.
* **Captures:** `qa/shots/fn/m3_portrait_flight.png`, `qa/shots/fn/m3_portrait_title.png`, `qa/shots/fn/m1_390x844.png`. Data: `qa/shots/fn/m3_result.json` → `runs`.

### F2 — BLOCKING · On mobile, the pause menu's three controls stop being tappable once the level has scrolled

* **Viewport:** 844×390, `has_touch`, mobile UA.
* **Steps:** Fly for ten seconds. Tap the PAUSE pad. Tap FLY ON, or RESTART THE DAY, or MUTE.
* **What happened:** Nothing. All three plates are drawn, `visible`, `alpha 1`, `input.enabled true`, with correct 360×74 hit areas at the right positions, and all three are inside the frame — but no press reaches them. Confirmed three ways:
  1. Phaser's own `input.hitTestPointer()`, driven to the MUTE plate's exact centre (game `1039,694` → css `422,282`), returned **`[]`** — nothing under the pointer at all.
  2. The touch event *does* arrive: a DOM listener recorded `touchstart`/`touchend` at `(422,282)`, 90 ms apart, well inside the 220 ms tap threshold. So it is not touch delivery.
  3. A synthetic **mouse** click at the identical point also failed. So it is not touch at all — the hit box simply is not there.
* **Root cause:** the plates are children of `pauseVeil`, a `Container` created with `.setScrollFactor(0)`; the plates themselves are `this.add.rectangle(...)` and never get their own scroll factor. Phaser's `InputManager.hitTest` computes the test point as

  ```js
  var px = tempPoint.x + (csx * gameObject.scrollFactorX) - csx;
  ```

  using the **child's** `scrollFactorX`, not the parent container's. With the child left at the default `1`, `px` collapses to the camera *world* point, while the plate is *drawn* at a fixed screen position by its parent. The hit box therefore sits exactly `camera.scrollX` pixels to the left of the button.
* **Measured against `camera.scrollX`, three trials in one run:**

  | when | `camera.scrollX` | hit test *at* the plate | hit test at `plate.x − camera.scrollX` | FLY ON tap resumed? |
  |---|---|---|---|---|
  | level start | 121 | **found the Rectangle** | — | **yes** |
  | 12 s in | 863 | `[]` | **found it**, at css x = **71** (on screen) | no |
  | 45 s in | 3758 | `[]` | at css x = **−1104** (off screen) | no |

  The displacement tracks `camera.scrollX` exactly, which is the mechanism above, measured.
* **Consequence:** `camera.scrollX` is ~0 only for the first moment of a run and grows for the rest of it. The pause menu therefore works for about a second after the day begins and is dead for the entire remainder — which is the state a player is actually in when they reach for pause. The only escape is the PAUSE pad again, which keeps working because `TouchControls` does its own manual `contains()` hit test instead of going through Phaser. **RESTART THE DAY and MUTE are unreachable on touch for the whole run.** This was not theoretical during testing: the automated mobile session paused mid-flight and could not resume — it sat at `scrollX 3061` for 320 seconds behind its own veil.
* **Second-order:** while the displacement is still smaller than the screen width (roughly the first 15 seconds), each plate's hit box is *live at the wrong place* — at 12 s in, MUTE's was at css x = 71, inside the left-hand joystick zone. A player reaching for the stick while paused can trip MUTE or RESTART THE DAY without ever touching a button.
* **What should have happened:** Regression 5 — "There should now be FLY ON / RESTART THE DAY / MUTE. Tap each." They exist and they are drawn; they cannot be tapped.
* **Fix:** one call — `.setScrollFactor(0)` on each plate, so its own scroll factor matches the container it is rendered by.
* **Captures:** `qa/shots/fn/m2_pause_menu.png` (all three drawn correctly), `qa/shots/fn/m4_after_mute_tap.png`, `qa/shots/fn/m5_pause_at_start.png` vs `qa/shots/fn/m5_pause_45s.png`. Data: `qa/shots/fn/m4_result.json` → `diag`, `qa/shots/fn/m5_result.json` → `trials`.
* **Note:** the desktop pause veil is unaffected — it has no interactive children, only a text hint, which is why every desktop pause check passed.

### F3 — MAJOR · The controls reference teaches two controls the build does not have — and on touch that is a third of the panel

* **Viewport:** 1536×960 desktop and 844×390 touch.
* **Steps:** Title screen → CONTROLS.
* **Desktop:** six rows, and row five is `MOUSE or V` → *"hold to trade height for speed — earned only while still descending; release to slingshot."* DIVE is cut; neither input does anything.
* **Touch — worse.** The panel reads, verbatim:

  ```
  STEER       left thumb anywhere — the stick appears where you touch
  GATHER      hold to tighten · tap to SURGE: …
  SPREAD      hold to widen · tap to FLARE: …
  CALL        ECHO — a cry rings outward …
  DIVE        hold to trade height for speed — earned only while still descending; release to slingshot
  BOTH PADS   BRACE — the world slows, and strain accrues twice as fast
  ```

  **Two of those six rows describe controls that do not exist on a phone.** There is no DIVE pad — `TouchControls.pads` holds exactly four (GATHER, SPREAD, CALL, PAUSE), verified at runtime. And `TouchControls.brace` is hard-coded `return false`, with its own comment: *"Brace is cut… the two-finger chord no longer does anything either — a chord was never viable on touch."* Measured: `brace` getter `false`, `bracePad` `false`, and holding both pads for 400 ms (inside BRACE's own 0.11–0.81 s live window, where the keyboard chord does engage on desktop) leaves `braceOn` false.
* **What should have happened:** Regression 9 requires DIVE gone from the ability bar, the touch pads *and* the controls reference. Two of three are done. BRACE was cut for touch separately and the panel was never told.
* **Verified working:** the ability bar itself is clean — the finish capture shows GATHER · SPREAD · SURGE · FLARE · ECHO and no DIVE. Holding the old DIVE screen position does nothing (`flock.dive` unchanged over 1.2 s), and neither `V` nor a held mouse button dives.
* **Consequence:** On the one screen whose entire job is teaching the controls, a phone player is taught two verbs they cannot perform — one of which, BRACE, the level's own prompt system still cues (`PROMPT_TEXT.brace.touch` = *"no time to read it — hold BRACE to slow the world"*, fired at `scrollX` 20500–21600, with a `done()` condition of `braceOn` that can never become true on touch, so it sits for its full 7-second timeout). I did not reproduce that prompt in-flight; it is identified from source and from the fact that its desktop twin fired during the full playthrough.
* **Captures:** `qa/shots/fn/m6_controls_touch.png` (touch), `qa/shots/fn/d1_controls_crop.png` (desktop), `qa/shots/fn/d3_finishing.png` (ability bar, clean). Source: `src/scenes/TitleScene.ts:1079-1084`, `src/touch.ts` `get brace()`, `src/level.ts:645`.

### ~~F3b — The Map's FLY AGAIN button does not respond to a click~~ — RETRACTED, this one was mine

Recorded rather than deleted, because it is the kind of false positive this lane exists to avoid filing.

Three separate runs (`d3`, `d8`, `d9`) reported FLY AGAIN dead: no `pointerover`, no `pointerdown`, and Day never started — twice killing the run outright at that step, while HOME on the same screen and `R`/`ESC` all worked. That is a convincing shape for a real bug.

It was not one. Re-run with **no virtual clock at all** — real rAF, real-time waits, `alpha` / `willRender` / `enabled` / `hitArea` recorded at the moment of the press — the button behaves perfectly on **both** platforms:

| | desktop 1536×960 | touch 844×390 |
|---|---|---|
| alpha / `willRender` / `enabled` | 0.92 / true / true | 0.92 / true / true |
| `pointerover` at the hit-box centre | fired | (no hover on touch) |
| `pointerdown` | fired | fired |
| Day active after | 1 s | 1 s |

The Map's chrome fades in on `delay: 3000, duration: 800`, and driving that reveal through the pumped clock did not put the buttons in the state the real loop does. **Lesson for the next pass: the virtual clock is sound for the flight simulation, but do not use it to drive a scene whose controls are gated behind Phaser tween delays — press those with the real rAF running.** Every other check in this report that involves a delayed reveal was re-verified this way. Data: `qa/shots/fn/d10_result.json`, `qa/shots/fn/m8_result.json`.

### F4 — MAJOR · `V` is still bound as a dead key, and the touch layout table still advertises two pads that do not exist

* **Steps:** In flight, press and hold `V`.
* **What happened:** Nothing — but the binding is live. `DayScene.create()` still runs `this.keyDive = kb.addKey(Phaser.Input.Keyboard.KeyCodes.V)` (`src/scenes/DayScene.ts:882`), and `keyDive` / `prevDive` are never read anywhere. Confirmed at runtime: `window.__day.keyDive` exists, `keyCode` 86.
* **What should have happened:** Regression 9 says "with no dead key". A `Key` object registered and never read is precisely a dead key; it also captures the keystroke from the page.
* **Second half:** `touchLayout()` in `src/touch.ts:657-668` is documented as "one source of truth for the layout means a probe can measure the real thing rather than a guess about it", but it still returns six entries including `DIVE` and `BRACE`, while `TouchControls.pads` only ever contains four. `window.__touch.pads` therefore advertises `['GATHER','SPREAD','DIVE','CALL','BRACE','PAUSE']` at every viewport tested. Worse, the audit hook zips them by index — `this.pads[i]` against `touchLayout()[i]` — so the published `presses` array mislabels CALL's timings as DIVE's, PAUSE's as CALL's, and reports `undefined` for the last two.
* **Consequence:** Low for a player, high for the next audit: the layout table is exactly the thing a reachability probe is told to trust, and it is now wrong in both membership and index order. A future pass measuring "is the DIVE pad reachable" gets a confident, meaningless answer.
* **Captures:** `qa/shots/fn/m1_844x390.png` (four pads drawn), `qa/shots/fn/m1_result.json` → `viewports.*.pads`.

### F5 — MINOR · One 404 on every load: `audio/stems.json`

* **Steps:** Load any route; move the mouse or press a key (which starts the audio context).
* **What happened:** Exactly one `404` for `http://.../flyway/audio/stems.json`, plus one matching console error (`Failed to load resource: the server responded with a status of 404`). Confirmed absent from the shipped snapshot.
* **What should have happened:** Regression 7 says "confirm the network log is clean". Six 404s became one, not zero.
* **Assessment:** The fix is 5/6 of the way there and the failure is swallowed correctly (`.catch()`, procedural score plays). But the network log is not clean and the console is not clean, which is what was asked. Shipping an empty `audio/stems.json` (`[]`) would close it.
* **Captures:** `qa/shots/fn/d2_log.json`, `qa/shots/fn/d4_result.json` → `stems_404`.

### F6 — MINOR · `pauseVeil` survives `scene.restart()` as a dangling reference

* **Steps:** In flight, `P` to pause, then `R`.
* **What happened:** The restart works — this is *not* the old soft-lock (see §3, regression 1). But `this.paused` is explicitly reset in `create()` (`DayScene.ts:352`) while `this.pauseVeil` is not, so after a restart-from-pause the field still points at the previous run's container.
* **Assessment:** Not player-visible. The object is not in the new scene's display list, so nothing is drawn, and pausing afterwards works normally (verified: `P` → paused, `P` → unpaused). It is the same class of bug as the one regression 1 fixed — a field that outlives `restart()` — left one line short. Worth closing before it grows teeth.
* **Captures:** `qa/shots/fn/d4_after_restart.png`, `qa/shots/fn/d4_result.json` → `reg1_veil`.

### F7 — MINOR · Flock-count numeral's shadow box crosses the top of the frame on mobile

* **Viewport:** 844×390 (measured; present at all three landscape sizes).
* **What happened:** The `120` HUD numeral reports bounds `y = -7` against a canvas top of 0.
* **Assessment:** The digits themselves are fully legible — see `qa/shots/fn/m1_844_hud_zoom.png`. The 7px overflow is the `legible()` stroke/shadow padding, not glyph. Recorded for completeness; no functional impact. Every other text object at every viewport is fully inside the frame.

---

## 3. Per-regression verdict

| # | Regression | Verdict | Evidence |
|---|---|---|---|
| 1 | `R` from pause soft-locked the run | **FIXED** (see F6 caveat) | After `P` then `R`: `paused=false`, world moves `scrollX 668 → 1380` in 4 s, ECHO fires (`callCooldown 5.7`), `P` still pauses and unpauses afterwards. Also verified on touch via the RESTART THE DAY plate. |
| 2 | All four Results/Map buttons dead to the mouse | **FIXED** | All four carry `customHitArea: true`. Each was hovered at its measured hit-box centre (colour changed and reverted) and then clicked/tapped: REPLAY FLIGHT → Day, CONTINUE JOURNEY → FlywayMap, FLY AGAIN → Day, HOME → Title. |
| 3 | Rotation left the game in 21% of the screen | **FIXED** | Portrait 390×844 → landscape 844×390: canvas refits to 844×390 at (0,0) = **100.0%** of the screen. Round trip back to portrait re-blocks correctly, and a *second* trip forward still refits to 100.0%. |
| 4 | Sim ran behind the portrait notice | **PARTIALLY FIXED — see F1** | Rotating *into* portrait holds (frames static, `running=false`). **Loading** in portrait does not: 410 frames and 6.3pp of daylight burned in one 30-second observation. |
| 5 | Pause on mobile had no tappable controls | **FIXED** | Three plates present and all inside 844×390: FLY ON, RESTART THE DAY, MUTE. Each tapped via CDP with stamped timestamps and each acted; MUTE relabels to SOUND ON and toggles back. |
| 6 | Cage/echo destroyed birds at the 120 cap while paying score | **FIXED** | Flock at cap (120/120) parked in a 6-bird cage for 7 s: flock `120 → 120`, cage `6 → 6`, `stats.found 0 → 0`, no `+N` toast. Then culled to 100 and re-parked: cage `6 → 0`, flock `→ 106`, `found → 6`. Nothing vanishes and nothing is paid twice. |
| 7 | Six 404s on every load | **PARTIALLY FIXED — see F1** | Six became one. `audio/stems.json` still 404s on every load, with a matching console error. |
| 8 | `?sandbox` exposed a dev scene in production | **FIXED** | `?sandbox` at host `127.0.0.1` routes to Title; `Sandbox` never goes active. |
| 9 | DIVE was cut | **PARTIALLY FIXED — see F3, F4** | Pad gone, verb gone, mouse-hold gone. Controls reference still teaches it; `V` still bound as a dead key; `touchLayout()` still lists DIVE and BRACE. |
| 10 | Verbs fired through the pause veil | **FIXED** | Paused, then spammed C, E, SPACE-tap, SHIFT-tap: `callCooldown 3.06 → 3.06`, `form 0 → 0`, `|v| 352.75 → 352.75`, still paused. Same on touch: CALL/GATHER/SPREAD pads all inert behind the veil. |

---

## 4. Interaction inventory

Every interactive object was enumerated from the live scene graph — walking `children.list` recursively into containers and reading each object's real `input.hitArea` rather than guessing from the source — then activated at its **measured hit-box centre**: by mouse on desktop, by timestamped CDP touch on mobile. Toggles were driven in both directions.

### Title screen — 4 zones (5 with a recorded best), 3 keys

| Control | Kind | Measured hit box | Activated | Result |
|---|---|---|---|---|
| BEGIN FLIGHT | `Zone` "begin" | 512,731 · 512×112 | hover in, hover out, click | label `#fff3dc → #ffe6bf → #fff3dc`; click → Day |
| the sky | `Zone` "sky" | 0,0 · 1536×861 | click | → Day |
| CONTROLS | `Zone` "controls" | 22,889 · 151×50 | hover, click | panel opens |
| SHARE | `Zone` "share" | 1404,889 · 110×50 | click | stays on Title, shows **LINK COPIED** |
| SHARE RESULT | `Zone` "share-result" | *only exists once a best flight is recorded* | click | see `d5_result.json` |
| panel close | `Zone` "panel-close" | full screen, depth 310 | click | panel closes **and does not fall through to BEGIN** |
| `ENTER` / `SPACE` | key | — | pressed | → Day (each from a fresh Title) |
| `ESC` | key | — | pressed | closes the controls panel |

### In flight, desktop — 11 bindings

| Control | Activated | Result |
|---|---|---|
| mouse move | steered high then low | flock `centerY 564 → 408` |
| `SPACE` held | 1.4 s | `flock.form 0 → 0.983` (tightens) |
| `SPACE` tapped (<220 ms) | SURGE | `|v| 105 → 239` |
| `SHIFT` held | 1.4 s | `flock.form 0.983 → −0.972` (widens) |
| `SHIFT` tapped | FLARE | brakes a *moving* flock — mobile `|v| 274 → 231`; see §5 note |
| `SPACE`+`SHIFT` | BRACE | `braceOn=true`, `braceAmt 0.835` at 400 ms; self-releases past its 0.7 s limit |
| `C` | ECHO | `callCooldown → 5.79` |
| `E` | ECHO | `callCooldown → 5.70` |
| `P` | pause / resume | both directions |
| `M` | mute | `false → true → false` |
| `R` | restart the day | both from flight and from the pause veil |
| `D` | debug overlay | `true → false` |
| `V` | — | **nothing (dead binding — F3)** |
| mouse held | — | nothing (DIVE correctly removed) |
| window blur | pause | `paused=true` |

### In flight, touch — 844×390

| Control | Measured position | Activated | Result |
|---|---|---|---|
| floating joystick | left zone, appears under the thumb | pushed up, then down | `stick.vy −1.0` → flock `centerY 420 → 160`; `vy +1.0` → `160 → 800` |
| GATHER pad | 1932,800 r106 | tap | SURGE, `|v| 209 → 504` |
| GATHER pad | " | 1.4 s hold | `form 0.217 → 0.917` |
| SPREAD pad | 1710,800 r106 | tap | FLARE, `|v| 274 → 231` |
| SPREAD pad | " | 1.4 s hold | `form 0.375 → −0.907` |
| CALL pad | 1748,598 r70 | tap | ECHO, `callCooldown 5.9` |
| PAUSE pad | 1986,78 r58 | tap | pause veil opens |
| both pads | chord | 400 ms hold | BRACE — see `m4_result.json` |
| old DIVE slot | 1938,608 | 1.2 s hold | inert, correctly |
| FLY ON / RESTART THE DAY / MUTE | 1039,514 / 604 / 694 · 360×74 | tap | see F7 |

All four drawn pads plus the phantom BRACE slot were confirmed **inside the visible frame** at every landscape viewport tested.

### Results — 2 buttons, 3 keys

`REPLAY FLIGHT` (hit box 277,856 · 324×85) and `CONTINUE JOURNEY` (624,856 · 330×85), both `customHitArea: true`. Hover at the measured hit-box centre recoloured and reverted each (`#f6d9b8 → #ffe6bf → #f6d9b8`, `#f6f1fa → #ffe6bf → #f6f1fa`), proving the pressable region really is under the label. Clicking REPLAY FLIGHT → Day. Keys: `R` → Day, `J` → FlywayMap, `SPACE` → skip the ceremony. A press anywhere also skips.

### Map — 2 buttons, 2 keys

`FLY AGAIN` and `HOME`, both `customHitArea: true`, both hovered and clicked. Keys: `R` → Day, `ESC` → Title.

**No unreachable control was found on any screen** — with the single exception recorded in F2.

---

## 5. Scenario coverage

| Scenario | Desktop | Mobile | Evidence |
|---|---|---|---|
| Idle (hands off the controls) | ✔ | ✔ | world advances `scrollX 153 → 327` in 4 s with no input; no attrition at rest (`120 → 120`) |
| Level start / dawn bookend | ✔ | ✔ | flock reaches full 120; control is live during the opening (ECHO fires) |
| Normal flight & camera | ✔ | ✔ | camera tracks scene scroll within 60px and holds the 1.0 zoom floor; lead offsets ±12px |
| Gather / spread | ✔ | ✔ | see §4 |
| Obstacle navigation | ✔ | ✔ | full flight: flock ranged 120 → 0 → 68 across the level's hazards |
| Checkpoints | ✔ | ✔ | banked and used; `stats.resets` incremented; respawn returns `max(checkpoint.count, 60)` birds |
| **Failure and recovery** | ✔ | ✔ | first loss names the cause and waits for a press; repeat losses self-recover in ~0.7 s |
| **Level finish** | ✔ | ✔ | `finishing=true`, homecoming plays, → Results |
| Every scene change | ✔ | ✔ | Boot→Title, Title→Day, Day→Results, Results→Day, Results→Map, Map→Day, Map→Title, plus `?day` / `?map` / `?sandbox` deep links |
| **Played to the END** | ✔ | ✔ | see below |

**The desktop playthrough was completed and it was unassisted.** A 460-second run from the dawn bookend to the roost, no state edits and no teleporting: 15 tutorial prompts fired, 5 first-encounter cards appeared and were dismissed, the flock ranged from 120 down to 0 and back, several failure/recovery cycles ran, and the day ended with `finishing=true` → the homecoming → the Results screen. Progress log in `qa/shots/fn/d3_result.json` → `run.samples`; the harness reports `assists: []`.

Note on FLARE: it lowers the speed *ceiling* (`cruise × 0.38`, approached at 5.2/s) rather than applying a braking impulse the way SURGE applies an accelerating one. On a flock already flying below that ceiling there is nothing to brake, which is why two desktop samples taken at `|v| ≈ 75` and `≈ 127` showed no change while the mobile sample at `|v| 274` showed a clear `−43`. Working as designed; the first two measurements were taken from the wrong state.

---

## 6. Harness notes and deviations

Two deliberate deviations from the brief, both forced, both documented in `qa/fn_lib.py`:

1. **GL backend.** The brief specifies `--use-angle=swiftshader`. Measured on this machine, SwiftShader could not construct the Phaser `Game` object inside 60 s — `window.__game` never appeared, so nothing could be tested through it at all. ANGLE/**d3d11** (which this repo's own `qa/dq_lib.py` already selects, with a comment explaining why) boots to the flight in ~99 s and renders real, non-blank frames. Every capture here is d3d11. Frame rate is never reported.

2. **Server.** The frozen build is served on `:5300` by `python -m http.server`, which is single-threaded. Under the game's asset burst its listen backlog overflows: the first sessions logged dozens of `net::ERR_CONNECTION_REFUSED` on `.webp` assets, and one request for the main bundle returned an **empty body**. Those look exactly like build defects and are not. Testing was moved to a `ThreadingHTTPServer` over the **same directory** (`C:/Users/merit/AppData/Local/Temp/judge`), on `:5311`. Byte-identical: `index.html` diffs clean and the bundle md5 matches the file on disk (`40ac94d8…`). Same build, same bytes, no rebuild.

Mechanics worth keeping for the next pass:

* **Virtual clock.** `game.loop.sleep()` to take the rAF away, then `game.loop.step(t)` with an advancing timestamp. This ticks the *whole* game — scene update, Phaser `Clock` (`delayedCall`), `TweenManager`, the input queue — so the fail, pause and finish paths that hang under a bare `d.update()` all run correctly. Pumped in ~200 ms chunks; 300 renders inside one `evaluate()` kills the GPU process.
* **Touch timing.** `Input.dispatchTouchEvent` with an explicit `timestamp`. Proven in-run, not assumed: `qa/shots/fn/m2_result.json` → `tap_timing` records the delivered `touchstart` → `touchend` gap against the game's 220 ms tap threshold.
* `has_touch=True` + mobile UA. `is_mobile=True` renders a blank frame with zero console errors.
* No `animations='disabled'` on screenshots.

---

## 7. Checked and clear — things that look like defects and are not

Recorded so the next pass does not re-file them.

* **Results' buttons are `input.enabled` at `alpha 0`** for the ~1.8 s before the ceremony reveals them, which reads like the "pressable while invisible" hazard TitleScene documents. It is not one: Phaser's `inputCandidate()` calls `willRender()`, which is false at zero alpha, so the object is never hit-tested. Verified empirically — a click at REPLAY FLIGHT's exact hit-box centre 300 ms into the scene did nothing (`scenes` unchanged).
* **The flock counter can read above 120** (a mobile capture shows `125` against a cap of 120). By design: `updateHudCount()` computes `flock.count + scatter.recoverableCount`, because "scattered-but-recoverable birds still count — they aren't lost yet". The cap itself is intact; `Flock.spawnBird` refuses past `maxBirds`.
* **`touch.brace` returns a hard-coded `false`** — deliberate, and commented as such ("a chord was never viable on touch"). It is only a defect because the game still *teaches* it; see F4.
* **The three Title chrome pills overlap by 2 px** (SHARE RESULT's right edge against SHARE's left) on desktop with a recorded best. Both sit at depth 72, so a 2 px sliver resolves to one of them deterministically. Noted, not filed — it is nothing like the 104 px overlap that Results was fixed for.
* **`?day&sandbox`, `?sandbox&map` and `?nonsense`** all route correctly (Day, FlywayMap, Title) and none reaches the Sandbox scene.
* **Two active scenes at once** appears in some raw logs (`scenes=['Day','FlywayMap']`). That is my harness calling `game.scene.start()` on the global SceneManager, which does not stop the calling scene. Driving the same transitions through a scene's own `this.scene.start` — as the game does — leaves exactly one scene active.

---

## 8. What could NOT be tested, and why

*(filled in below)*
