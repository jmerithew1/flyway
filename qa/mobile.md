# FLYWAY — mobile QA pass

**Lane:** mobile only (desktop is another agent's).
**Method:** Playwright Chromium with real device emulation — `is_mobile=True`, `has_touch=True`,
`device_scale_factor=2`, Pixel 7 Android UA. Every interaction is a CDP `Input.dispatchTouchEvent`
touch, never a mouse click. Production build only (`npx vite build`), served over HTTP under the
`/flyway/` base path.
**Captures:** 93 PNGs in `C:\dev\game-week\qa\mobile-shots\`. Probe sources are `qa/p*.py`,
`qa/mdrv.py` (driver), `qa/contrast.py`, `qa/boxes.py`, `qa/edges.py`, `qa/zoom.py`.

## Builds tested

The app was rebuilt three times by another agent while this pass was running, so findings were
re-checked against the newest build before writing.

| Build | When tested | Notes |
|---|---|---|
| `index-BNVFtfoe.js` | most of the pass | matched the live deploy at the time |
| `index-CaqK42El.js` | re-verified | HEAD `c413eeb` + working tree |
| `index-DWHDtSDl.js` | final verification | HEAD `77012f6`, current at time of writing |

Live deploy `https://jmerithew1.github.io/flyway/` served `index-Boay7hvk.js` at the end of the
pass — one build behind local. **Every finding below was re-confirmed present in the current
`src/` tree** (grep receipts in the "Still present" column), so none of them are stale.

---

## Harness note — read this before trusting any "tap didn't work" claim

Headless Chromium runs Phaser on SwiftShader at roughly 5 fps. With the main thread blocked that
hard, a touchstart and touchend sent 60 ms apart **arrive at the DOM ~1000 ms apart** — measured,
not assumed:

```
intended 60ms  -> DOM event.timeStamp gap 1034.8ms -> Phaser pointer dur 1034.8ms -> tap:false
intended 150ms -> DOM event.timeStamp gap 1585.4ms -> Phaser pointer dur 1585.4ms -> tap:false
```

`touch.ts` treats anything over `TAP_MS = 220` as a hold, so **every tap-fired ability looked
broken and none of them were.** The driver now stamps both events via CDP's `timestamp` parameter
(`mdrv.py: tap_stamped`), after which the same taps register correctly (`tap:true`, PAUSE pauses,
SURGE/FLARE/ECHO fire). Evidence: `qa/mobile-shots/taptime_844x390_taptime_log.txt`.

I very nearly filed "the pause button does nothing on touch" as a P1. It was the harness. Anyone
re-running this must use `tap_stamped`.

**No FPS numbers are reported anywhere in this document.** Findings are visual or counted.

---

## Per-viewport verdict: cropping and bars

Canvas width derives from the device aspect (`backdrop.ts deriveWidth()`), `Phaser.Scale.FIT`.

| Viewport | Aspect | Canvas | Rendered CSS box | Bars L/T/R/B | Cropped? | Verdict |
|---|---|---|---|---|---|---|
| 844×390 | 2.164 | 2078×960 | 844 × 389.9 @ (0,0) | 0 / 0 / 0 / 0.1 | no | **PASS** |
| 932×430 | 2.167 | 2081×960 | 932 × 429.9 @ (0,0) | 0 / 0 / 0 / 0.1 | no | **PASS** |
| 2400×780 | 3.077 | 2954×960 | 2400 × 780.0 @ (0,0) | 0 / 0 / 0 / 0.0 | no | **PASS** |
| 390×844 (portrait) | — | 2078×960 | canvas `visibility: hidden` | n/a | n/a | **PASS** — notice shown, game invisible |

The 0.1 px bottom residue is sub-pixel rounding of `389.906` against a 390 px viewport, not a bar.

All six touch pads are fully on screen at every landscape viewport, whole disc inside the frame:

| Pad | 844×390 radius (CSS px) | 932×430 | 2400×780 |
|---|---|---|---|
| GATHER / SPREAD | 34.9 | 38.5 | 69.9 |
| DIVE / CALL | 20.3 | 22.4 | 40.6 |
| PAUSE | 15.4 | 17.0 | 30.9 |

**So: the scaling rewrite works. No crop and no bars at any of the four viewports on first load.**
That is the single most important thing asked for and it passes — *until the phone is rotated*
(see P1).

## Fog verdict: genuinely clean

Captured at daylight ≈ 0.9, 0.5, 0.2 and 0.03 at 844×390, 932×430 and 2400×780 — twelve captures,
every one read with the Read tool, every one also run through a straight-edge detector
(`qa/edges.py`, `qa/boxes.py`) that flags any column or row holding a large derivative for a long
contiguous run.

**Zero vertical straight runs anywhere in the fog at any daylight level or viewport.** The only
straight edges the detector found were the daylight meter rail, the modal card's own border, the
canvas bottom row, and stone architecture. Zoomed inspection of the fog wall at 3% daylight
(`play_844x390_06_fog_0p03.png`, `vp_932x430_fog_0p03.png`) shows soft, organic, fully feathered
smoke with no seam or box.

The birdcage and window-grille monuments — which read as "boxes" at a glance in a thumbnail — are
wireframe art with fully transparent interiors, confirmed at 5–6× zoom (`z_cage.png`,
`z_gridbox.png`). They are not artefacts.

**The 63 feathered assets did the job. The owner's "big black boxes in the fog" is fixed for the
fog.** It is *not* fixed everywhere — see P3, which is the same defect class in a different place.

---

# Findings, ranked by consequence

## P1 — Rotating to portrait and back leaves the game in a 21%-area box with black bars on all four sides

**Still present:** yes, reproduced on `index-DWHDtSDl.js` (newest build).

The game's own `#rotate` notice instructs the player to turn the phone. Turning it and turning it
back is therefore a first-class path, and it breaks the fit that the entire scaling rewrite exists
to protect.

**Steps** (844×390, real orientation emulation via CDP `Emulation.setDeviceMetricsOverride` with
`screenOrientation`, so `orientationchange` fires and `screen.orientation.type` changes exactly as
on a phone):

1. Load `/flyway/?day` in landscape 844×390. Canvas fills the screen.
2. Rotate to portrait 390×844. Notice appears, canvas hidden. Correct.
3. Rotate back to landscape 844×390.

**Expected:** canvas fills 844×390 again.
**Actual:** canvas renders at **390×180 positioned at (227, 104)** — 227 px of black left and
right, 104 px top and bottom. The game occupies 21% of the screen area and every thumb pad shrinks
to well under half its designed size.

It does not self-correct. Sampled every 2.5 s for 20 s — identical every sample. Still wrong after
22 s in the orientation-emulation run.

**Diagnosis, which is also the fix:**

```
after rotating back:   parentSize = 844x390   (CORRECT — the game knows the viewport)
                      displaySize = 390x180   (STALE — fitted to the portrait width)
window.dispatchEvent(new Event('resize'))  ->  no change
window.__game.scale.refresh()              ->  displaySize 844x390, canvas 844x390. Fixed.
```

Phaser's ScaleManager updates `parentSize` but never re-applies the fit. Only an explicit
`scale.refresh()` recovers it. A listener on `orientationchange` / `resize` that calls
`this.scale.refresh()` should close it.

Reproduces at every landscape viewport, always fitting to the portrait width:

| Viewport | Canvas box after the round trip | Screen area used |
|---|---|---|
| 844×390 | 390 × 180 @ (227, 104) | 21% |
| 932×430 | 430 × 198 @ (251, 115) | 21% |
| 2400×780 | 780 × 253 @ (810, 263) | 11% |

**Captures:** `final_back_landscape.png`, `orient_orient_back_landscape.png`,
`orient_orient_after_refresh.png` (shows `scale.refresh()` restoring it),
`vp_932x430_restored_landscape.png` (the clearest — a tiny game in a sea of black).
**Data:** `mobile-shots/final.json`, `mobile-shots/orient.json`, `mobile-shots/rot_844x390.json`.

**Caveat, stated honestly:** this is orientation *emulation*. It fires the real events and updates
`screen.orientation`, and the game's own `parentSize` tracks it correctly, so the stale
`displaySize` is the game's own state — but it has not been confirmed on physical hardware.
Given the consequence, it is worth ninety seconds on the owner's actual phone before anything else
in this document.

---

## P2 — On the Results screen the two buttons share 104 px of hit area, and a tap in the visual gap starts the wrong one

**Still present:** yes — `ResultsScene.ts:183-184` (`cx - 175` / `cx + 175`) unchanged.

This is the owner's "the button and the click box aren't aligning" complaint. It is **not** on
BEGIN FLIGHT (that one is correct — see "What is working"). It is here.

`ResultsScene.mk()` places the two buttons at `cx ± 175` and pads each hit box by ±60 px
horizontally. On desktop the labels are narrow enough for that to work. On touch the 1.65×
type ramp in `ui.ts` widens them until the padded boxes overlap.

**Measured at 844×390, canvas 2078 wide:**

```
REPLAY FLIGHT     label 513.2 – 799.2   (w 286)   hit box  453.2 – 859.2
CONTINUE JOURNEY  label 815.2 – 1197.2  (w 382)   hit box  755.2 – 1257.2
                       visual gap: 16.0 px        hit overlap: 104.0 px
```

16 logical px of visual gap is ≈ 6.5 CSS px on an 844-wide phone — roughly 1 mm. In the capture
the two labels read as one run: "REPLAY FLIGHTCONTINUE JOURNEY".

**Steps:** finish a flight to reach Results, wait for the full ceremony reveal, tap at logical
(807.2, 898) — 8 px right of REPLAY FLIGHT's last glyph, 8 px left of CONTINUE JOURNEY's first,
i.e. dead centre of the visual gap and well inside REPLAY FLIGHT's hit box.
**Expected:** nothing, or REPLAY FLIGHT.
**Actual:** **CONTINUE JOURNEY fires** — the scene becomes `FlywayMap`.

Tapping the *visual centre* of REPLAY FLIGHT does work correctly (scene becomes `Day`), so the
targets are not offset — they are too wide and too close, and the overlap band silently belongs to
the wrong one.

Also in that same bottom strip (see `res_844x390_results_full.png`): "NEW BEST FLIGHT" overlaps the
three feather captions above it, and the "press R" / "press J" sub-labels are clipped by the
bottom edge of the screen.

**Captures:** `btn_results_before_overlap_tap.png`, `res_844x390_results_full.png`.
**Data:** `mobile-shots/btn.json`, `mobile-shots/res_844x390.json`.

---

## P3 — Hard-edged rectangles are still drawn around the CALL pad and around large bird sprites

**Still present:** yes — `textures.ts:122` `ctx.fillRect(0, 0, size, size)` unchanged.

The fog is clean, but the "black box" defect class is not gone. It has moved to blended quads.

**Steps:** play to the roost arrival (or `?day` then let the finish ceremony run). Look at the
large arriving birds and at the CALL pad.

**Expected:** a bird, and a round pad. **Actual:** each sits inside a visible, perfectly
axis-aligned, hard-cornered rectangle darker than the sky. The birds get **two nested rectangles**.

Measured across the CALL pad's square edge at y=430 (values are RGB, screenshot pixels):

```
x=1345  [152 117 121]      <- sky
x=1350  [137 108 116]      <- inside the square, one step, no gradient
...     (flat for 140px)
x=1490  [142 111 117]
x=1495  [152 116 120]      <- back to sky
```

A ~6% luminance step with a sub-5px transition, held flat for 140 px, with a matching horizontal
edge — a rectangle, not a glow. Its size is **172 logical px square** centred exactly on the CALL
pad at (1748, 598).

**Strongest lead:** `hud.ts` sizes the ability-bar answer-glow at `glowR = isTouch ? 3.1` × the
pad's gauge radius. For CALL that is `3.1 × (50 × 0.92 + 10) = 173.6` — the measured square. Those
glows are `softdot` images, and `softdot` is **the one texture in `textures.ts` generated with
`ctx.fillRect(0, 0, size, size)` over its whole square** rather than being clipped to a circle the
way `touchpad-soft` and `alarmring` are. It is also the only texture that measures a non-zero alpha
at its own quad edge (ring max 3/255, ring mean 0.38, sampled in-page from the live texture).

**Captures:** `z_callpad_stretch.png` (contrast-stretched, unmistakable), `z_birdboxes.png`
(4× zoom, no stretch — ten boxed birds, visible unaided), `z_box_stretch.png` (one bird, the two
nested rectangles), `scen_844x390_81_finish_1.png` (the unmodified source frame).
**Data:** `mobile-shots/box.json`.

**Caveat, stated honestly:** the software renderer can differ from hardware GL at blended quad
edges, so a renderer artefact cannot be fully excluded. Against that: the edges are exact,
repeatable, present in unmodified captures without stretching, and land precisely on a size the
game's own arithmetic produces. Worth one look on the owner's phone at the roost arrival.

---

## P4 — Pause offers no restart on a phone, and its only instructions are three keyboard keys

**Still present:** yes — `DayScene.ts:4597` unchanged. **This confirms the owner's report.**

**Steps:** play, tap the PAUSE pad at its visual centre (logical 1986, 78).
**Expected:** a pause menu a thumb can use.
**Actual:** the game pauses correctly and the veil reads, in full:

> **PAUSED**
> *P to fly on · M mute · R restart the day*

Three keyboard keys, on a device with no keyboard. There is no tappable control of any kind.

Verified exhaustively while paused — none of these do anything: tap GATHER, tap SPREAD, tap CALL,
tap DIVE, tap the dead centre of the screen. The state stays `paused: true` after every one. The
**only** working action is tapping the PAUSE pad again, which resumes. **A phone player cannot
restart the day at all.**

**Captures:** `pause_844x390_paused_90ms.png`, `pause_844x390_paused_90ms_after_probes.png`.
**Data:** `mobile-shots/pause_844x390.json`.

---

## P5 — Reward toasts and alert prompts overprint each other, the daylight HUD, and the modal cards; some run off the left edge

**Still present:** yes — `DayScene.ts:2931` (`safe.x + 210`), `:2937` (lane spacing 42),
`:2121` (`Clamp(..., 220, VIEW_W - 220)`) all unchanged.

Reproduced in normal play (no checkpoint jumping) and again in five separate scenarios.
Machine-measured from Phaser's own text bounds, not eyeballed:

**Runs pushed off the left edge of the canvas:**

| Text | x | width | px clipped |
|---|---|---|---|
| `PERFECT FLOW   ×+0.30` | −51.5 | 523 | 51.5 |
| `2 CLEAN IN A ROW` | −34.5 | 489 | 34.5 |

**Overlapping pairs (horizontal × vertical overlap in logical px):**

| A | B | overlap |
|---|---|---|
| `a bird is BLINKING OUT — hold GATHER…` | `PERFECT FLOW` | 313 × 36 |
| `PERFECT FLOW   ×+0.30` | `PERFECT FLOW` | 313 × 12 |
| `hold GATHER through tight stone…` | `THE FLOCK FOLLOWS YOU` card body | 283 × ~3 (same y band) |
| `BREAKTHROUGH` (tunnel) | `It takes birds that fall behind…` card body | 228 × 28 |
| `87%` (daylight readout) | `DAYLIGHT` label | 56 × 8 |

The daylight one is permanent — it is in every single gameplay frame. Zoomed
(`z_daylight.png`), the percentage's dark halo sits on top of the "DAYLIGHT" label and dims it.

**Likely mechanism:** `floatAt()` clamps a toast's centre to `safe.x + 210 … safe.x + safe.w − 210`
and separates lanes by a fixed 42 px, and `perfectFlowFeedback()` clamps to a raw
`220 … VIEW_W − 220` while bypassing `floatAt()` entirely (so it gets no lane de-clash at all).
All three constants are desktop measurements. `ui.ts` multiplies every font size by
`UI_SCALE = 1.65` on touch, so the strings are ~65% wider and taller than those margins assume —
they overflow the clamp and share lanes.

**Worst case captured:** `play_844x390_05_stick_deflected.png` — five text runs stacked in the
upper left during normal play, with `CLEAN PASS` and `+1 BIRD` overprinted into illegible mush
("CLEAN PASS+1BIRDDD") and "FREED" sitting on top of the daylight meter.

**Other captures:** `scen_844x390_21_tunnel_teach_5.png` (PERFECT FLOW printed twice, clipped),
`scen_844x390_31_tunnel_finale_0.png` ("CLEAN IN A ROW" with its leading number cut off),
`scen_844x390_70_failing.png` (the failure ceremony with a teaching card drawn over it),
`scen_844x390_80_near_roost.png`.

### P5b — the tunnel at speed

At the finale mouth (`scen_844x390_31_tunnel_finale_2.png`) the tunnel's own prompt plate reads
**"SPLIT / TAP SPREAD"** — correct touch wording, large, legible, well contrasted. Good.

But it is butted directly against a modal teaching card whose own instruction is *"tap to
continue"*, with a third prompt running in from the left underneath it. Two different instructions
about tapping, on top of each other, at the game's biggest moment. The tunnel copy itself is
readable at speed; **the problem is what is stacked on it.**

(Part of that stack is an artefact of my checkpoint-jump re-arming cards out of order and is
flagged as such — but `BREAKTHROUGH` overlapping the card body by 228 × 28 px is measured, and the
prompt-under-card collision reproduced in the un-jumped failure run too.)

---

## P6 — In-game HUD and pad labels fail the 3:1 contrast floor

Measured from rendered pixels, not eyeballed (`qa/contrast.py`): glyph core = 97th percentile
luminance inside the text's bounds; ground = 35th percentile of the surrounding band; WCAG
relative luminance; ratio = (L_hi + 0.05) / (L_lo + 0.05). Text bounds are sampled immediately
before *and* after each capture and only runs whose bounds did not move are measured, so nothing
mid-tween is compared against pixels from a different instant.

**Method validation** — the same code, same run, scores the Results screen's copy 4.5–8.25 and the
teaching card's title 4.98. It is not a broken metric; the low numbers below are real.

Bright sky / dark sky, 844×390:

| Text | height (CSS px) | bright | dark |
|---|---|---|---|
| `DAYLIGHT` | 10.0 | **1.11** | **1.62** |
| `FLOCK` | 9.5 | **1.07** | **1.75** |
| `CALL` (pad label) | 9.5 | **1.35** | **1.58** |
| `DIVE` (pad label) | 9.5 | **1.37** | **1.73** |
| `II` (pause glyph) | 9.0 | **1.05** | **1.73** |
| `SUN GATE` | 10.0 | **1.34** | **2.17** |
| `tap · FLARE` | 8.5 | **2.54** | **1.87** |
| `tap · SURGE` | 8.5 | 3.51 | **2.12** |
| `SPREAD` (pad label) | 13.5 | **2.18** | **2.76** |
| `GATHER` (pad label) | 13.5 | **2.36** | **2.66** |
| `120` (flock count) | 21.5 | **1.09** | 4.23 |

Every bolded value is below the 3:1 floor for large text. The pad labels are the worst offenders in
practice because they are white-on-near-white: the pads are filled `#fdf2e4` at 0.4–0.72 alpha and
the labels are `#fff4e2`. Visible in `z_callpad_stretch.png` — "CALL" is white type on a white
disc, held together only by its thin dark stroke.

On the Results screen the failures are `FLOW` 1.39, `1 / 6 Perfect Flows needed` 1.47,
`press R` 1.73, `PERFECT FLOW` 1.85, `press J` 2.00, `Reached the roost.` 2.10,
`Returned with 120 birds.` 2.41.

**Data:** `mobile-shots/stat_844x390.json`, `mobile-shots/res_844x390.json`.
**Overlay proof the sampling boxes land on the right glyphs:** `z_boxes_overlay.png`,
`z_overlay_crop.png`.

---

## P7 — Keyboard instructions shown to phone players

`level.ts` carries a proper `{key, touch}` table and a comment reading "a phone must never be told
to press SPACE". Four strings escaped it:

| Where | String shown on touch | Guard |
|---|---|---|
| `DayScene.ts:2003` | **`loose — tap SPACE`** | none at all |
| `ResultsScene.ts:183` | `press R` | none |
| `ResultsScene.ts:184` | `press J` | none |
| `FlywayMapScene.ts:330` | `click, or press R` | none |
| `FlywayMapScene.ts:331` | `esc` | none |

`loose — tap SPACE` is the worst: it is a *teaching* label over a brittle piece, telling the player
the one thing they need to do, in a vocabulary their device does not have. Captured live in the
teaching-tunnel run (text-bounds dump, `scen_844x390_tunnel.json`).

The Results and Map buttons do respond to taps, so those three are wrong copy rather than dead
controls — but they still tell a phone player to press keys.

---

## P8 — The world keeps running behind the "Turn your phone" notice

**Steps:** start a flight in landscape, rotate to portrait, wait.

**Expected:** the run holds while the player is being told to rotate.
**Actual:** the simulation never stops. Measured over 30 s in portrait:

```
before portrait : scrollX 169  birds 117  daylight 0.958  fogEdge -783
t = 3s          : scrollX 193  birds 117  daylight 0.953  fogEdge -737
t = 33s         : scrollX 313  birds 117  daylight 0.923  fogEdge -250
```

The world scrolled 144 px, daylight fell 3.5 points, and the fog closed **533 px** on the flock
while the screen showed nothing but an instruction. The canvas is correctly invisible
(`visibility: hidden`) — so the game is genuinely hidden, as intended — but it is not stopped.
A long fumble to rotate costs the player daylight they cannot see draining.

---

# What is working — verified, not assumed

- **The scaling rewrite.** No crop and no bars at 844×390, 932×430 or 2400×780 on first load. The
  wide-Android case (3.077 aspect → 2954×960 canvas) fills the screen exactly. This was the highest
  risk item and it passes.
- **Portrait blocking.** The notice shows, the canvas is `visibility: hidden`, and the game is
  genuinely not visible behind it at 390×844. (It is still *running* — P8.)
- **BEGIN FLIGHT alignment.** Measured the label's rendered ink centre against its hit zone's
  centre: **(1038.5, 812) vs (1039.0, 812.5)** — within 0.5 logical px. Tapping the visual centre
  starts the game. The owner's alignment complaint does not apply here.
- **The pads and the ability bar are ONE system.** The verb gauges are drawn onto the same pads the
  thumb presses, from the same `touchLayout()` both files import. No second control layer anywhere
  in 93 captures.
- **Every pad works on touch** once a real tap is delivered: GATHER/SPREAD hold, tap fires
  SURGE/FLARE, CALL fires ECHO, DIVE holds, PAUSE pauses and resumes.
- **The floating joystick.** Materialises under the thumb in the left half, deflects the intention
  point, and self-centres on release (intent returned to home x=872.76 exactly).
- **Failure and recovery.** Drove the flock to 11 birds; the ceremony ran, named the cause, and the
  checkpoint return restored 120 birds and resumed play. Tap-to-continue works. No crash.
- **Level finish.** Played to the end and reached the Results scene. Results content fits inside
  the canvas — no text off-canvas at 2078 wide.
- **Checkpoint return accepts a tap.** `input.once('pointerdown')`, confirmed live.
- **Monuments and lamps read at phone size.** The 13 monuments are legible and do not clutter; the
  birdcage and grille pieces are clean wireframe art at 5–6× zoom.
- **Console and network are clean.** Across every run, at every viewport: **zero console errors,
  zero page errors, zero warnings, zero HTTP ≥ 400, zero failed requests.** (The only 404s seen all
  session were `vite preview`'s cached file table going stale after the app was rebuilt underneath
  it — a harness problem, reproduced and explained, not a product one. The pass was finished on a
  plain static server.)
- **Robustness.** Spammed all five pads in rotation, tapped during cards and transitions, tapped
  nothing at all for 25 s, held GATHER continuously — no crash, no stuck state, no console noise.

---

# The owner's three standing complaints

| Complaint | Verdict |
|---|---|
| "Big black boxes in the fog" | **Fixed in the fog** — 12 fog captures across 3 viewports × 4 daylight levels, zero box artefacts, verified by straight-edge detection and by eye at zoom. **Not fixed everywhere:** hard-edged rectangles remain around the CALL pad and large bird sprites (P3). |
| "The begin flight button and the click box aren't aligning" | **Fixed on BEGIN FLIGHT** (0.5 px). **Still broken on Results**, where a tap in the gap between the two buttons starts the wrong one (P2). |
| Text legibility at phone size | **Still failing.** Eleven HUD and pad labels measure 1.05–2.76 against a 3:1 floor (P6). Card and Results body copy are fine (4.5–8.3). |
| "There's not a restart option on pause on mobile" | **Confirmed** (P4). No tappable restart exists; the pause copy names three keyboard keys. |

---

# Is this equally fun on a phone, or merely playable?

Honestly: **it is more than playable and not yet equal.**

What lands on a phone is the thing the game is actually about. The murmuration reads beautifully at
this size — better than I expected, because the flock is a mass rather than a set of small targets,
so it survives the shrink that would kill a game made of small readable objects. The floating
joystick is the right call: the control comes to the thumb instead of the thumb hunting for it, and
GATHER/SPREAD as big held pads with tap-to-fire is a genuinely good translation of the
SPACE/SHIFT grammar rather than a port of it. The art holds up completely — the monuments, the
lamps, the roost tree at the end, and especially the fog, which at 3% daylight is the best-looking
thing in the build and now has no boxes in it. The wide-Android case showing *more world* rather
than a cropped one is a real win and it works.

What keeps it from equal is that the phone gets a second-class text layer. The game talks to the
player constantly — prompts, toasts, cause-of-loss lines, teaching cards — and on a phone those
messages are 65% larger while the layout constants that keep them apart are still desktop-sized.
The result is that in the moments with the most to say (a reward chain, a failure, the tunnel
mouth) the words pile onto each other, run off the left edge, and print over the daylight meter.
Desktop gets a game that explains itself; the phone gets the same explanations shouted over one
another. That is a layout-constant problem, not a design problem — P5 is probably a handful of
numbers multiplied by `UI_SCALE`, and it would close most of the gap on its own.

Two other things are squarely in the way of "equal". A phone player cannot restart from pause at
all, which on a device where you get interrupted every few minutes is the single most-wanted
button in the game. And the pad labels are white on white; the controls read as glowing smudges
until you have learned their positions, which a first-time player has not.

And P1 is the one that would decide it. Right now the game tells the player to turn their phone,
and if they ever turn it back it plays in a quarter of the screen with black bars on every side —
which is precisely the defect the last two days of scaling work were spent eliminating, reachable
by the one action the game explicitly asks for. That is worth checking on real hardware before
anything else here, because if it reproduces on a physical device it outranks every other finding
in this document, and if it does not, then this build is in good shape and the rest is polish.

Fix P1, P4 and P5 and I would call it equal.
