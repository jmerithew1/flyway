# FLYWAY — rendering / performance / technical-art judgement

**Build judged:** frozen snapshot of `04059b4`, served at `http://127.0.0.1:5300/flyway/?day`.
Nothing was rebuilt, no dev server was started, `src/` and `tools/` were not touched.

**Instruments** (all under `qa/`, all read-only against the frozen build):

| file | what it measures |
|---|---|
| `qa/jr_probe.py` | GL work per frame by wrapping the live `WebGLRenderingContext` (`drawElements`/`drawArrays`/`texImage2D`/`texSubImage2D`/`bindFramebuffer`/`useProgram`); full-screen-quad inventory with live alpha + blend mode; tweens; display list; render targets; texture inventory |
| `qa/jr_probe2.py` | per-`Text`-object repaint attribution (wraps each `Text.updateText`); Chrome sampling heap profiler for allocation attribution; GC-bracketed heap delta; impact-lens attach/detach lifecycle |
| `qa/jr_probe3.py` | measured on-screen overdraw — sums the clipped viewport area of every object Phaser will actually draw |
| `qa/jr_profile_frozen.py` | `tools/profile.py` copied **verbatim** except the URL and the boot-wait count, so the baseline numbers are compared like for like |
| `qa/jr_quality.py` | control experiment: forces the stored quality tier before boot and reads the tier's observable fingerprints back out of the live scene |
| `qa/jr_tunnelload.py` | the same GL counters with the tunnel actually running — a short driven run never reaches one |
| `qa/jr_wideboot.py` | boot ladder across every aspect `backdrop.ts` permits, 2.17:1 to the 4:1 clamp |
| `qa/jr_artifact.py` | chases two visual artifacts seen in the tunnel captures — failed requests, unresolved textures, and what is actually drawn in the bottom band |

Chromium headless with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
`is_mobile` was **not** set (mobile runs use `has_touch=True` + an Android UA); `animations='disabled'`
was **not** passed to `page.screenshot()`. **No frame time or FPS figure is reported anywhere below** —
under SwiftShader they are meaningless. Everything quoted is a count, a ratio, a byte figure, or a
capture I actually read.

Raw output: `qa/jr_out/*.json`, `qa/jr_out/*.log`, captures in `qa/jr_out/*.png`.

---

## Verdict in one paragraph

**The "smoother" half of the claim is real and it is measurable.** Active tweens fell 395 → 74, the
off-screen visible objects fell 779 → 278, and the Chrome sampling heap profiler cannot find any
allocation attributable to `creatures.ts`, `tunnel.ts`, `hud.ts`, `vfx.ts`, `nightfall.ts` or
`obstacles.ts` above noise over 20 seconds of driven play. The custom impact pipeline genuinely
detaches. Those claims survive attack.

**Three of the specific claims do not survive intact.** (1) `gateQuad` was given a threshold of
`0.004` even though the act plates had *already* been dropped to a peak of `0.056–0.095` one commit
earlier — so the gate never fires for the plate pair that is actually on screen, and the two quads
the helper was written to delete are still drawn every frame at exactly the alpha its own docstring
names as invisible.
(2) "Zero allocation in the per-frame path" is true of the six named files and false of the scene
that drives them: `DayScene.update` calls `getBoundingClientRect()` once per frame through
`floatAt`. (3) The per-frame texture re-upload the brief asked about is present and measured —
**4.05 `gl.texImage2D` calls and 20.4 KB of texture upload every frame, at idle, with nothing on
screen changing** — caused by four unguarded `setColor` calls in `drawHud`, in a codebase that
already contains the correct guard in `tunnel.ts`.

Two things that were not on the claim list at all turned out to matter more than most of it.
**145.3 MB of GPU render targets, 122.8 MB of which are Phaser's pre-FX blur pyramid for a feature
this game never uses.** And **bloom is unconditional in this build** — `src/quality.ts` does not
exist at `04059b4` and the served bundle contains no trace of it, so the 11 full-screen passes I
measured run on every device with no tier and no way to switch them off. I found that by control
experiment, not by reading: forcing the quality setting to LOW changed nothing (D2).

**A methodology note the reader is entitled to.** Eight files under `src/` have moved since
`04059b4`. Every line number below has been re-derived against `git show 04059b4:<file>` rather
than the working tree, and I checked each finding against the diff.

---

## Measured state of the frame

Desktop, 1536×960, driven (`qa/jr_out/desktop.json`):

| | boot idle | flying | fog closing |
|---|---|---|---|
| draw calls / frame | 30.0 | 39.0 | 43.2 |
| vertices / frame | 39 807 | 44 926 | 47 120 |
| `bindFramebuffer` / frame | **11** | **11** | **11** |
| shader program swaps / frame | 6.2 | 6.0 | 6.0 |
| `texImage2D` / frame | **4.05** | **4.03** | **6.70** |
| texture upload / frame | **20.4 KB** | **20.4 KB** | **40.3 KB** |
| active tweens | 74 | 73 | 91 |
| display list | 1349 | 1347 | 1366 |
| visible | 499 | 502 | 560 |
| of those, off-screen | 278 | 277 | 277 |
| full-screen quads drawn | 4 of 24 | 5 of 24 | 6 of 17 |

Against the stated baseline of **395 tweens** and **779 of 998 visible objects off-screen**:

- tweens **395 → 74** (−81 %). Confirmed, and it holds under load — the only reading above 100 was
  205 during a deliberately-fired spectacle.
- the display list *grew* (998 → 1349) but visible fell to 499 and off-screen-visible to 278
  (−64 %). The culling is doing real work; the growth is pooled objects parked invisible.
- draw calls at 30–43 with fog, bloom, the ability bar, the decor set, moths, the light-thief and
  the tunnel all live is **healthy**. This is not a draw-call-bound frame. One line, moving on.
- the tween figure reproduces under the project's own tool: `qa/jr_profile_frozen.py` (`tools/profile.py`
  verbatim but for the URL) reads **72/73/74** across three independent runs, and
  **1343–1367 display / 492–498 visible / 276–278 off-screen**. See A2b for why its heap figure is
  not usable on this machine.

### With the tunnel live

A short driven run never reaches a tunnel, and the brief names it, so `qa/jr_tunnelload.py`
teleports the flock into the mouth of the first one (x = 7000, length 900) and measures the same
counters with the tunnel actually running (`qa/jr_out/tunnelload.json`):

| | armed / approach | tunnel `run`, p = 0.73 | tunnel `run`, p = 0.83 |
|---|---|---|---|
| draw calls / frame | 44.4 | 42.0 | 41.6 |
| `bindFramebuffer` / frame | 11 | 11 | 11 |
| `texImage2D` / frame | 7.47 | 4.03 | 4.05 |
| display list | 1371 | 1400 | 1400 |
| visible | 554 | 623 | 625 |
| active tweens | 104 | 116 | 116 |

**44 draw calls and 116 tweens is the busiest state I could produce** — tunnel running, fog
encroaching, bloom on, the ability bar live, the light-thief present, the whole decor set placed.
Claim 3: **confirmed, comfortably.** Note that `texImage2D` stays pinned at ~4/frame throughout,
which is D3 again: those four repaints are constant, independent of what the game is doing.

### Measured overdraw

`qa/jr_probe3.py` sums the clipped on-screen area of every object Phaser will actually draw, as a
multiple of the viewport (`qa/jr_out/d3.json`, 1536×960, flock driven):

| phase | on-screen overdraw | largest contributors |
|---|---|---|
| clear sky (daylight 1.00) | **6.28 × viewport** | 151 world Images 1.46; sky panorama 1.12; plateA 1.00; washA 1.00; nightVeil 1.00 |
| fog closing (daylight 0.15, encroach 1.00) | **15.95 × viewport** | **26 fog blobs 8.07**; 184 Images 1.49; panorama 1.12; plateA/washA/warmth/nightVeil 1.00 each |
| fog overhead (daylight 0.00) | **15.26 × viewport** | 26 fog blobs 7.39; 189 Images 1.51 |

Bloom's eleven full-screen passes sit on top of that, so the endgame frame is roughly
**27 screens of fill**. This is a fill-bound frame, not a draw-call- or CPU-bound one, and that is
the correct thing to know about it. See D2 and D2b.

---

# CONFIRMED DEFECTS

Ranked by consequence.

## D1 — 122.8 MB of GPU render targets allocated for a feature the game never uses

`qa/jr_out/desktop.json` → `renderTargets`: **95 render targets, 145.3 MB** at 1536×960.

```
UtilityPipeline    4 targets    22.5 MB
FxPipeline        91 targets   122.8 MB   <-- 87 square targets, 32² stepping to 928², ×3 each
```

Source of the 91: `node_modules/phaser/src/renderer/webgl/PipelineManager.js:403-431` —
`if (!disablePreFX)` builds `qty = ceil(min(renderWidth, renderHeight) / 32)` tiers, three
`RenderTarget`s per tier, plus three full-screen ones. `RenderTarget`'s constructor calls `resize()`,
which creates the GL texture immediately — this is real, resident GPU memory, allocated at boot,
whether or not anything ever asks for it.

**The game never asks for it.** `grep -rn "preFX" src/` returns nothing. The only FX call in the
codebase is `src/scenes/DayScene.ts:1011` — `this.cameras.main.postFX.addBloom(...)` — and
`PostFXPipeline` takes its buffers from `UTILITY_PIPELINE` (`PostFXPipeline.js:248-252`), not from
the pre-FX pyramid. `src/main.ts:94-113` sets no `disablePreFX`.

Consequence: measured texture inventory is **186.9 MB across 281 keys** (`qa/jr_out/d2.json`), of
which the six act skies alone are 42 MB (`sky_overgrown` etc., 2048×900 = 7.03 MB each, all six
resident from boot). Textures + render targets = **332 MB of GL memory at the desktop size**, before
the wide-phone canvas grows the full-screen targets further. This is the number that decides whether
a mid-range Android drops the WebGL context, and a lost context is a black screen, not a slow one.

**Fix:** `disablePreFX: true` in the game config. One line, no visual change, reclaims 122.8 MB.

## D2 — Bloom is unconditional in the judged build: 11 full-screen passes on every device, with no way to turn it off

**Correction to my own first reading, and it makes the finding worse, not better.**
I initially wrote this up from `src/quality.ts` in the working tree. That file **does not exist at
`04059b4`**:

```
$ git show 04059b4:src/quality.ts
fatal: path 'src/quality.ts' exists on disk, but not in '04059b4'
$ curl -s .../assets/index-CyHhw0TR.js | grep -c "flyway-quality"
0
```

The served bundle contains no quality system at all. `git show 04059b4:src/scenes/DayScene.ts:1011`
is an unconditional statement:

```ts
this.bloom = this.cameras.main.postFX.addBloom(0xffffff, 1, 1, 0.62, 0.34, 4)
```

I caught this by control experiment rather than by reading. `qa/jr_quality.py` forces
`localStorage['flyway-quality'] = 'low'` via an init script before the bundle evaluates, then reads
the tier's observable fingerprints back out of the live scene (`qa/jr_out/quality.json`):

| run | `stored` | `fogBlobs` | `vfxPool` | camera post-FX | lens allowed | `bindFramebuffer`/frame |
|---|---|---|---|---|---|---|
| desktop, forced **LOW** | `"low"` | 26 | 72 | 1 | true | 11 |
| desktop, forced **MEDIUM** | `"medium"` | 26 | 72 | 1 | true | 11 |
| desktop, default | `null` | 26 | 72 | 1 | true | 11 |
| **phone landscape** (`has_touch`, `pointer: coarse` = true, `maxTouchPoints` = 1) | `null` | 26 | 72 | 1 | true | 11 |

(LOW should be 12 blobs, a pool of 24, **0** post-FX and no lens. MEDIUM should be 18/44/1/false.)

Every value is the *maximum* value in every run. The setting is stored and **entirely ignored**,
because the build predates the code that would read it. Note the fourth row in particular: the
phone context is correctly detected as touch (`pointer: coarse` true, `maxTouchPoints` 1,
`isTouch` true) and still gets the desktop maximum. So in the game as judged there is no MEDIUM,
no LOW, no touch default and no escape hatch: **every device runs bloom, 26 fog blobs and a
72-sprite VFX pool.**

Cost, measured: `BloomFXPipeline.onDraw`
(`node_modules/phaser/src/renderer/webgl/pipelines/fx/BloomFXPipeline.js`) issues `copyFrame` +
`steps × 2` `copySprite` + `blendFrames` + `copyToGame`. `DayScene.ts:1011` passes `steps = 4`, so
**11 full-screen passes**. My instrumented count agrees exactly: a constant **11 `bindFramebuffer`
calls per frame in every phase measured** — boot idle, flying, fog closing, tunnel running, and
with the tier forced to LOW.

On the wide-phone canvas (`qa/jr_out/m2.json`, viewport 892×412 with `has_touch`) the drawing
buffer is **2078×960 = 2.0 Mpx**, so that is **22 Mpx of full-screen fill per frame** before the
game draws a bird. At the 4:1 ceiling `backdrop.ts` permits and I confirmed boots (3840×960 =
3.69 Mpx) it is **40.6 Mpx per frame**.

**What the owner has already done about it, and what is still wrong.** The working tree adds
`src/quality.ts` with three tiers and wires `DayScene` to skip `addBloom` at LOW. That is the right
shape and it is the fix for this finding. But the tier it selects for touch still keeps the
expensive part:

- `src/quality.ts:40` — `medium: { fogBlobs: 18, bloom: true, vfxPool: 44, ambient: 0.6, lens: false, decor: 0.8 }`
- `src/quality.ts:53` — `defaultQuality()` returns `medium` on touch

(Those two are the only line references in this document that point at the **working tree** rather
than at `04059b4`, for the obvious reason that the file does not exist in the judged build.)

MEDIUM drops the impact lens (which A4 shows is already free), thins the fog and halves the VFX
pool — and keeps the one thing the same file's doc comment names as the problem: *"The camera bloom
pass. A full-screen post-FX pass is the single most expensive thing on a weak GPU"*
(`src/quality.ts:24-26`). So the phone default will still pay 11 passes.

**Fix:** for the judged build, there is no toggle — the tier work in the tree is the fix and should
land. When it does, set `bloom: false` at MEDIUM (LOW already does), or keep bloom and drop `steps`
from 4 to 2, which takes 11 passes to 7 for a difference I would not expect to survive a blind
comparison at strength 0.62/0.34.

*Note on the tree-vs-build hazard generally:* eight files under `src/` have moved since `04059b4`
(`git diff --stat 04059b4 -- src/`): `quality.ts` (new), `DayScene.ts`, `nightfall.ts`, `flock.ts`,
`hud.ts`, `level.ts`, `touch.ts`, `TitleScene.ts`. **Every line number in this document has been
re-derived against `git show 04059b4:<file>`, not against the working tree.** I checked the diff
for each remaining finding: none of D1, D3, D4, D5 or D6 is touched by the drift.

## D2b — The fog is 8 of the frame's 16 screens of fill, and it arrives at the worst moment

Not a defect in the sense of a mistake — this is the game's central threat and it is beautifully
made — but it is the second-largest rendering cost in the build and it was not on the claim list, so
it belongs on the record with a number.

`git show 04059b4:src/nightfall.ts:70` is `const BLOBS = 26` — a constant, with no tier behind it in
this build (D2). `qa/jr_out/d3.json` and `qa/jr_out/m3.json`: at full encroachment those 26 blobs contribute
**8.07 screens of alpha-blended fill** at 1536×960 and **6.22–7.28 screens** at the wide-phone
2078×960. Each blob is drawn at roughly 1800×900 — about 120 % of the viewport width — and at up to
alpha 0.95 (`src/nightfall.ts:396-399`). The capture `qa/jr_out/desktop_fog.png` shows the result:
the fog covers the entire frame, and every one of the ~190 world Images, the sky panorama, all three
mood plates and the night veil are drawn underneath it and then completely obscured.

Combined with bloom, the endgame frame is roughly **27 screens of fill**. That is 54 Mpx per frame
at the measured mobile buffer of 2078×960 — the frame where the player most needs stable pacing is
the frame that costs the most, by a factor of about 2.5 over clear sky (6.28 screens).

The working tree's `quality.ts` already introduces the right lever (`fogBlobs` 26/18/12), so once
that lands this needs no new machinery. Whether to pull it is a direction call and belongs to the
other two judges, not to me — I am recording the cost, not prescribing the look.

## D3 — Four Phaser Text canvases are repainted and re-uploaded to the GPU every frame, for nothing

This is the exact thing the brief asked about, and it is present.

Measured two independent ways. First, by wrapping every live `Text.updateText` (26 objects hooked)
over 60 driven frames — `qa/jr_out/d2.json` → `textIdle`:

```
1.00 /frame   countText        "120"        depth 20
1.00 /frame   hudFlockLabel    "FLOCK"      depth 20.1
1.00 /frame   hudDayLabel      "DAYLIGHT"   depth 20.1
1.04 /frame   hudDayPct        "93%"/"92%"/"94%"/"95%"  depth 20   (summed across the values it took)
```

Second, from the GL side: **4.05 `gl.texImage2D` calls per frame, 20.4 KB uploaded per frame**, at
idle, in a phase where the flock count, the word FLOCK and the word DAYLIGHT are all constant.
The two numbers agree to within a rounding error.

Cause — `Text.setText` guards on value (`node_modules/phaser/src/gameobjects/text/Text.js`,
`if (value !== this._text)`), but **`setColor` does not**:
`TextStyle.setColor` → `this.update(false)` → `parent.updateText()` unconditionally
(`TextStyle.js`), and `updateText` ends in
`this.frame.source.glTexture = this.renderer.canvasToTexture(canvas, ...)`. Every call is a full
canvas 2D repaint plus a synchronous `texImage2D`.

The four unguarded call sites, all inside `drawHud()` which runs every frame from
`DayScene.update` (`src/scenes/DayScene.ts:1932`):

- `src/scenes/DayScene.ts:2798` — `this.hudDayPct.setColor(low ? '#ff9a7a' : day01 < 0.34 ? '#ffc98a' : '#ffe6bf')`
- `src/scenes/DayScene.ts:2862` — `this.countText.setColor(...)`
- `src/scenes/DayScene.ts:2866` / `2868` — `this.hudFlockLabel.setText('FLOCK').setColor('#c8bad4')`
- `src/scenes/DayScene.ts:2939` — `this.hudDayLabel.setAlpha(0.6 * fade).setColor(d < 0.24 ? '#ffb9a4' : '#c8bad4')`

Three of the four take the *same* colour on essentially every frame of a normal run.

This is not a subtle-API trap the author could not have known about, because **the correct guard is
already in this codebase**, written by the same hand, with a comment describing this exact failure:

> `src/tunnel.ts:1288-1296`
> `/** Guarded exactly as `setText` already is: Phaser repaints the whole text canvas on a colour change, so setting the same colour every frame is a per-frame allocation and a texture re-upload for no visual difference. */`
> `private shownColor = ''`
> `private setVerbColor(c: string): void { if (this.shownColor === c) return; ... }`

`src/hud.ts:368-372` guards the same way (`if (this.labelLit[i] !== want)`). The ability bar and the
tunnel got it right; the HUD in `DayScene` did not. A per-frame `texImage2D` is one of the worst
things to do to a tiled mobile GPU — it forces a pipeline flush at an arbitrary point in the frame.

**Fix:** four `if (cached !== next)` guards, following `tunnel.ts:1291`.

## D4 — `gateQuad`'s threshold is 14× lower than the alphas it was written to catch

The helper works. Its threshold does not.

`src/vfx.ts:1003-1007`:
```ts
export function gateQuad(rect, alpha) {
  const on = alpha > 0.004
  ...
}
```
Its docstring (`src/vfx.ts:990-1002`) names the problem precisely: *"the ones in the act-plate stack
rewrite their alpha every frame and stay VISIBLE at values around **0.056** — a value no player can
see, costing a full 1536×960 blend each, every frame."*

The gate is set to `0.004`. **0.056 is fourteen times that.**

And the reduction that put the plates there was already in the tree when the gate was written.
`src/atmosphere.ts:319` multiplies every act plate by `k = 0.28` (because six painted skies now
carry the act colour), which caps the plate stack at `0.34 × 0.28 = 0.095` and floors it at
`0.2 × 0.28 = 0.056`. That `k` landed in `525740f`; the `0.004` gate landed in `2e199ee`, one
commit later, and both are ancestors of the judged `04059b4`. So the threshold was chosen *after*
the values it needed to catch had already moved, and the docstring beside it even names the number
it is failing to catch. Every act plate now lives permanently in the band between the gate and
visibility.

Measured, live (`qa/jr_out/desktop.json` → `phases.A_boot_idle.quads`, boot, idle, clear sky):

```
DRAWN  Rectangle  depth 7.40   alpha 0.0560  MULTIPLY  1536x960  #9fb4ee   <- atmosphere.plateA
DRAWN  Rectangle  depth 7.41   alpha 0.0560  NORMAL    1536x960  #9fb4ee   <- atmosphere.washA
DRAWN  Rectangle  depth 10.9   alpha 0.0085  NORMAL    1536x960  #0d0a1c   <- nightVeil
```

So of the 4 full-screen quads actually drawn at idle, one is the opaque sky panorama and **three are
invisible**. The comment at `src/atmosphere.ts:320-322` claims *"six of them at alpha < 0.004"* were
the waste; with `k = 0.28` in place that description does not match the build — the plates are
above the gate, not below it. The overdraw probe agrees independently: `qa/jr_out/d3.json` bills
`mood plate d7.4` and `mood plate d7.41` at **1.00 screen each, in every phase including clear
sky**, plus `warmth` at 1.00 once it engages and `nightVeil` at 1.00.

It is a real improvement (the *B* pair, `plateB`/`washB`, is correctly gated to `visible = false`
between act transitions, and 20 of 24 candidate quads are off), but the headline pair it was written
for is still drawn every frame. `warmth` was also measured drawn at alpha **0.0045** (flying phase) —
0.0005 above the gate.

Related, minor: `src/atmosphere.ts:334` re-enables `warmth` with a raw `setAlpha`, bypassing
`gateQuad`, so the final act can leave it visible below threshold.

**Fix:** raise the threshold to something a player can actually perceive over a painted sky —
`0.03` would gate both plates off at their floor while leaving the mid-act values (0.07–0.095)
drawn — or, better, gate on `alpha × k` intent rather than post-multiplied alpha.

## D5 — `DayScene.update` forces a DOM layout every frame

`src/scenes/DayScene.ts:1762`, unconditionally, once per frame:

```ts
const chainAt = this.floatAt(this.flock.centerX - this.scrollX, this.flock.centerY + 96)
this.chainText.setPosition(chainAt.x, chainAt.y)
```

`floatAt` (`src/scenes/DayScene.ts`, `private floatAt`) opens with `const safe = safeArea(this)`, and
`safeArea` (`src/ui.ts:88`) calls **`canvas.getBoundingClientRect()`** plus reads `window.innerWidth` /
`window.innerHeight`. That is a forced style/layout flush from inside the game loop, sixty times a
second, to position a text object that is transparent for almost the whole run.

On top of the layout flush, one pass of `floatAt` allocates: the `DOMRect`, the `safeArea` result
object, the `clashes` closure, a `[cy - step, cy + step]` array per search step, the returned
`{ x, y }`, and one `{ x, y, until: now + 900 }` pushed into `floatLanes` — which therefore holds
~54 entries at 60 fps and is scanned by `Array.prototype.some` with a closure on every call.

The sampling profiler does see it (`qa/jr_out/m2.json` → `allocTop`, `floatAt @ index:16`), just at a
small byte count — the cost here is the layout flush, not the bytes.

**Fix:** cache `safeArea` and invalidate it on the resize/orientation handler that `src/main.ts:63-77`
already owns; and skip the whole call when `chainText.alpha <= 0.01`.

## D6 — "Zero allocation in the per-frame path" is a claim about six files, and the seventh is the hot one

The six named files pass. I read every `update()` in them and the profiler agrees (A1 below).
`DayScene.update` — which calls all six — does not. Beyond D5:

- `src/scenes/DayScene.ts:1618-1633` — `this.flock.update(rawDt, { intentX: …, intentY: …, gather, spread }, …)`
  builds a fresh config object every frame. This is the exact pattern `src/vfx.ts:33-36` refuses by
  design: *"a `{ }` at a call site fired sixty times a second is 3MB of garbage a minute"*.
- `src/scenes/DayScene.ts:1566` — `cam.getWorldPoint(x, y)` with no `output` argument allocates a
  `Vector2` per frame (Phaser allocates when `output === undefined`).
- `src/scenes/DayScene.ts:2942` — `LANDMARKS.find((l) => !!l.name && l.x > this.flock.centerX)`
  allocates a closure every frame, and `2944` calls `place.toUpperCase()` every frame to compare.
- `src/scenes/DayScene.ts:1930` — `this.scoreText.setText(\`×${this.scoreShown.toFixed(1)}\`)` builds
  two strings per frame (the `setText` itself is correctly guarded by Phaser).
- Per-frame `for…of` over arrays: `this.parallax` (1545), `this.flock.birds` twice (1710, 1738),
  `this.strays` (1773), `PROMPTS` (1849), `this.night.takenThisFrame` (2222), plus four in
  `updateDecor` (2460-2488). Each allocates an iterator. Worth naming only because
  `src/nightfall.ts:284-287` explicitly refuses to do this — *"indexed rather than for-of: this walks
  every bird every frame, and an iterator object per frame is exactly the kind of small steady
  garbage that adds up to a GC pause mid-flight"* — and then `DayScene` walks the same `flock.birds`
  with `for…of` twice on the very next screenful of code.
- `src/scenes/DayScene.ts:1849-1859` and `1870` — `showPrompt('gather', '', () => …)` and
  friends allocate an arrow-function closure at the call site *before* the "already shown" guard
  inside `showPrompt` can reject it. Up to three closures per frame once the flock is past the
  trigger x.
- `src/scenes/DayScene.ts:1789-1802` — while `flock.draft > 0.55` the scene creates a new `Image`
  **and a new tween** every 0.1 s (`src/scenes/DayScene.ts:1792`), i.e. 10 GameObjects + 10 tweens a
  second, in a file whose sibling module opens with "WHY THERE IS NOT A SINGLE TWEEN IN HERE".

None of these is individually large — the sampling profiler puts the whole of `DayScene.update`'s
JS allocation in the low kilobytes (A1). D5's layout flush is the one with a real cost. The reason
to list the rest is that they sit in the single function that runs unconditionally every frame, and
that the claim as written invites the reader to believe the per-frame path is clean when the file
that owns the per-frame path was never in scope.

---

# DESIGNED THIS WAY — the defence holds

## A1 — the six named files really are allocation-free

I read every `update()` in `creatures.ts` (609, 1170), `tunnel.ts` (722), `hud.ts` (295),
`vfx.ts` (473), `nightfall.ts` (255) and every exported entry point in `obstacles.ts`. No object
literal, array literal, closure, `map`/`filter`/`slice`/spread or template string in any of them.
Scratch state is pre-sized in constructors (`creatures.ts:451 litBuf`, `nightfall.ts:102 takenThisFrame` cleared with `.length = 0` at `256`, `atmosphere.ts:152-154 litX/litY/litCount`);
`obstacles.ts` uses module-level shared result structs (`scratchField:137`, `scratchAvoid`) with the
convenience wrappers documented as returning a shared buffer.

Confirmed by instrument, not just by reading: the Chrome sampling heap profiler
(`HeapProfiler.startSampling`, interval 512 B) over **20 seconds of driven play** attributes
**0.06 MB total** across all JS, and not one site in those six files appears above noise. The
largest game-code entries are `floatAt` (0.5 KB), `drawHud` (1.0 KB) and two audio helpers
(`held` 1.8 KB, `pv` 1.3 KB). `qa/jr_out/m2.json` → `allocTop`.

## A2 — the tween and off-screen numbers are honest

Baseline 395 tweens → measured 74/73/91. Baseline 779-of-998 visible off-screen → measured
278-of-499. Both hold across every phase I drove. The display list growing to 1349 while visible
falls to 499 is the pooling working as intended, not a regression: Phaser's per-entry cost for a
`visible = false` object is one flag test in `willRender`.

## A2b — GC pressure: the project's own metric cannot adjudicate this on this machine, and I will not pretend otherwise

`qa/jr_profile_frozen.py` is `tools/profile.py` verbatim but for the URL, run three times against
the frozen build (`qa/jr_out/profile_frozen.txt`). Its `heapGrowthKB / 60 frames`:

| run | clear sky | fog closing |
|---|---|---|
| 1 | 908 KB | −3756 KB *(a GC landed inside the window — void)* |
| 2 | 1289 KB | 138 KB |
| 3 | 6644 KB | 4820 KB |

Against the quoted baseline of **3100 KB / 60 frames**, runs 1 and 2 are a 2.4–3.4× improvement and
run 3 is a regression. **The spread is larger than the effect, so this number decides nothing.**
Two things make it unreliable here, and both would have applied to the baseline measurement too:

1. Under SwiftShader a 60-frame window is ~40 seconds of wall clock (the frame median in these runs
   was 566–773 ms). Anything that allocates on *time* rather than on *frames* — and this game has a
   large WebAudio score that creates oscillator/gain/filter nodes on musical intervals — is counted
   roughly 25× more heavily than it would be in a real 1-second window.
2. Two other judges were driving their own headless Chromium sweeps on this machine throughout;
   run 3 coincided with a viewport ladder. Slower frames mean more wall clock per window means more
   time-driven allocation.

So I am reporting it and declining to draw a conclusion from it. **The instrument that does settle
the question is the sampling heap profiler** (A1), because it attributes bytes to call sites and is
insensitive to wall-clock stretching: 0.06 MB over 20 seconds of driven play, nothing from the six
claimed files, largest game-code sites `drawHud` at 1.0 KB and `floatAt` at 0.5 KB.

A note on my own earlier numbers: `qa/jr_probe.py` also reports `heapGrowthKB`, and those figures
(2.0–6.6 MB / 60 frames) are **contaminated by the probe itself** — wrapping `gl.drawElements` and
friends allocates an `arguments` object on every one of the 30–43 GL calls per frame. They are in
`qa/jr_out/desktop.json` for completeness and are not cited anywhere in this judgement.

## A3 — `warmth` really is MULTIPLY at runtime

`src/scenes/DayScene.ts:493` sets `Phaser.BlendModes.MULTIPLY` (the quad is built at `477`), and the live scene agrees — the quad
at depth 7.5, fill `#ff9a5c`, reads back `MULTIPLY` in every phase (`qa/jr_out/desktop.json` →
`phases.B_flying.quads`). The OVERLAY→NORMAL silent fallback the comment describes is genuine
(Phaser's WebGL renderer implements NORMAL/ADD/MULTIPLY/SCREEN/ERASE only) and the fix took effect.
Claim 2's blend half: **confirmed**.

## A4 — the impact post-FX pipeline is genuinely detached in steady state

The strongest of the claims, and it survives cleanly. `qa/jr_out/d2.json` → `lens`:

```json
{"before": ["13"], "during": ["13", "cs"], "attachedFlag": true,
 "after": ["13"], "lensAfter": 0, "attachedAfter": false, "useLens": true, "pipeOK": true}
```

`"13"` is Phaser's bloom post-FX; `"cs"` is the minified `ImpactPipeline`. It appears only while the
lens is live and is gone once `lens` decays to 0. Every steady-state phase I measured
(`camPost` in `qa/jr_out/desktop.json`) shows exactly one post pipeline. `src/vfx.ts:597-608`
removes the held instance rather than calling `resetPostPipeline`, which correctly preserves the
camera's bloom — and `lensCache` is nulled with it so the cache cannot outlive the pipeline.

The 11 framebuffer binds per frame are **all** bloom. The custom pipeline costs nothing between
impacts. Claim 4: **confirmed as stated.**

## A5 — draw calls, program swaps and `texSubImage2D`

30–43 draw calls, 6 program swaps, **0** `texSubImage2D` per frame. There is no batching problem
here and no dynamic-atlas churn. Fine, one line.

## A6 — the derived canvas width is safe on real hardware, with one caveat

`src/backdrop.ts:34-51` derives `W = clamp(1536, 3840, round(960 × landscape aspect))`. Measured on
a Pixel-7-shaped landscape viewport (892×412, `has_touch`, Android UA): canvas and drawing buffer
both **2078×960**, CSS size 891.8×412 (`qa/jr_out/m2.json` → `canvas`). The aspect matches the
device exactly, so `Phaser.Scale.FIT` neither crops nor pillarboxes — the reasoning in the file is
correct and the implementation delivers it.

I walked the whole permitted range as a touch device (`qa/jr_wideboot.py`, `qa/jr_out/wideboot.json`).
Every aspect boots, the derivation is exact, and no context is lost:

| viewport | derived canvas = drawing buffer | context lost | `MAX_TEXTURE_SIZE` |
|---|---|---|---|
| 892×412 (2.17:1) | 2078×960 | no | 8192 |
| 1100×412 (2.67:1) | 2563×960 | no | 8192 |
| 1236×412 (3.00:1) | 2880×960 | no | 8192 |
| 1442×412 (3.50:1, Android chromeless) | 3360×960 | no | 8192 |
| 1648×412 (4.00:1, at the clamp) | 3840×960 | no | 8192 |

(An earlier run at 3.5:1 failed to reach DayScene. That was contention — two other judges were
driving concurrent headless Chromium sweeps on this machine — and it reproduced clean once the
ladder was run with a 300 s boot budget. **I am not reporting it as a defect.**)

On resolution: the emulated `devicePixelRatio` is 1, but a real phone of that CSS size runs
dpr ≈ 2.6, i.e. ~2320×1070 physical. A 2078×960 buffer is therefore *under*-sampled relative to the
panel, not over — the game renders slightly soft rather than wasting fill. That is the right trade
and I would not change it.

The caveat is D2's, not this file's: the 4:1 ceiling means the *drawing buffer* can reach
3840×960 = 3.69 Mpx, and everything that scales with it scales too — the three full-screen pre-FX
targets, `UtilityPipeline`'s `fullFrame1/2`, and eleven bloom passes. The width derivation is safe;
what is attached to it is not.

---

# CHASED AND REJECTED

Things that looked like findings and are not. Recording them because a judgement is only worth
what its discipline is worth.

**A bright green grid across the bottom of the frame.** Present in both captures from
`qa/jr_tunnelload.py` (`qa/jr_out/tunnel_mid-run.png`, `tunnel_late.png`) — a regular green lattice
in the bottom ~86 px, full width. I traced it to the depth-6 foreground-ground `TileSprite`
(`qa/jr_out/artifact.json` → the `[0, 874, 1536, 86]` entry). **It did not reproduce in normal
play** (`qa/jr_out/artifact_normal.png` is clean) and it did not reproduce in a second teleported
run (`qa/jr_out/artifact_tunnel.png` is clean). Both tunnel runs reached the tunnel by my setting
`scrollX` forward ~5000 px in a single frame, which drives `fgGround.tilePositionX` through the
same jump; the most likely cause is SwiftShader's handling of a TileSprite's fill pattern under a
large instantaneous offset, i.e. my instrument. **Not reported as a defect.** The one reason to
keep it in mind: the checkpoint rewind performs a real single-frame `scrollX` jump, so if the owner
ever sees this in play, that is where to look.

**No missing or failed art.** `qa/jr_artifact.py` logged zero failed requests, zero HTTP ≥ 400 and
zero unresolved texture sources across all 281 keys; Phaser's `__MISSING` placeholder is not even
registered. The `ERR_CONNECTION_REFUSED` console errors in every run are the Google Fonts request
from the served page, blocked in this sandbox — harness, not build (see the phone-risk table, row 7,
for the part of that which *is* worth acting on).

**A wide-phone boot failure.** An early run at 3.5:1 never reached DayScene. It reproduced clean on
a proper ladder with a 300 s budget; the machine was carrying two other judges' concurrent headless
sweeps. Not a defect — see A6 for the ladder that boots at every permitted aspect.

**Tunnel wall seams.** The corridor is built from `tunnel-band` images on a 76 px pitch, each
76 × 320 at alpha 0.98, and adjacent semi-transparent quads visibly double-blend where they abut —
the seams are legible in both tunnel captures. The cause is technical (abutting alpha-blended
quads, not opaque ones); whether it matters is a look call, so I am handing it to the cinematic
judge rather than ranking it.

---

# WHAT FALLS OVER ON A MID-RANGE PHONE

Brief item 5, consolidated. In order of how badly it ends.

| # | risk | measured | verdict |
|---|---|---|---|
| 1 | **GL memory** — 186.9 MB textures + 145.3 MB render targets = **332 MB** at 1536×960, more as the derived width grows the full-screen targets | `qa/jr_out/d2.json`, `qa/jr_out/desktop.json` | **Real.** This is the crash-class risk: Chrome on Android drops the WebGL context rather than swapping, and a lost context is a black screen. 122.8 MB of it is reclaimable with one config line (D1). |
| 2 | **Fill rate** — ~27 screens of full-screen fill in the endgame (11 bloom passes + 8 screens of fog + ~8 of world) | `qa/jr_out/d3.json`, GL bind counts | **Real.** This is a fill-bound frame, and in the judged build there is no quality tier to fall back to — bloom is unconditional and the fog blob count is a hard-coded 26 (D2, D2b). |
| 3 | **Per-frame texture re-upload** — 4.05 `texImage2D`/frame, 20.4 KB/frame, three of them redundant | `qa/jr_out/d2.json` → `textIdle`; GL instrumentation | **Real,** and worse on a tiler than the byte count suggests: each one forces a flush mid-frame (D3). |
| 4 | **Framebuffer size** — `backdrop.ts` permits a 3840×960 drawing buffer | `qa/jr_out/m2.json`: 892×412 CSS → 2078×960 buffer | **Safe as a sizing decision.** At a real phone's dpr ≈ 2.6 the buffer is *under* native, not over. The risk is what is attached to it (rows 1–2), not the derivation. See A6. |
| 5 | **Texture count** — 281 keys, 8192 `MAX_TEXTURE_SIZE`, largest source 2166×705 | `qa/jr_out/wideboot.json`, `qa/jr_out/d2.json` | **Fine on size.** No source approaches the limit. The problem is total bytes (row 1), not any single texture. |
| 6 | **Draw calls / batching** — 30–43 per frame, 6 program swaps, 0 `texSubImage2D` | `qa/jr_out/desktop.json` | **Fine.** One line, moving on. |
| 7 | **Webfont dependency at boot** — `src/main.ts:49-53` races `document.fonts.ready` against a 2500 ms timer before creating the game, because Phaser bakes text metrics at creation | the served page requests Jost + Cormorant Garamond from `fonts.googleapis.com` | **Worth knowing.** On a phone with a slow or blocked network this costs a flat 2.5 s of boot and *then* measures text with fallback metrics anyway. Self-hosting the two faces removes both the delay and the metric lottery. Not a defect in this build's rendering; a startup risk. |
| 8 | **Off-screen work** | 1349 display entries, 499 visible, 278 off-screen | **Handled.** The culling in `updateDecor`, `updateMotes` and the creature modules is real and measured (A2). |

---

# THE THREE HIGHEST-VALUE RENDERING CHANGES REMAINING

**1. `disablePreFX: true` in the Phaser game config (`src/main.ts:94`).**
One line. Reclaims **122.8 MB of resident GPU render targets** (91 of the 95 the renderer holds),
with literally zero visual change, because `grep -rn "preFX" src/` proves the game never uses a
pre-FX effect and `PostFXPipeline.js:248-252` shows bloom draws from the Utility pipeline instead.
It is first because it is the largest single resource figure in the build, the cheapest possible
fix, and because GPU-memory exhaustion is the failure mode that turns a phone black rather than
merely slow — 186.9 MB of textures plus 145.3 MB of targets is 332 MB before the wide-phone canvas
grows the full-screen ones further. Nothing else on this list has that ratio of payoff to risk.

**2. Land the quality tier, and then take bloom off the touch default.**
Measured at a constant **11 full-screen passes per frame in every phase, idle included and with the
setting forced to LOW** (11 `bindFramebuffer` calls/frame, `qa/jr_out/quality.json`). On the
measured wide-phone buffer of 2078×960 that is 22 Mpx of full-screen fill per frame before the game
draws a bird; at the 3840×960 ceiling I confirmed boots, 40.6 Mpx.

Two steps, because the judged build has no tier at all. First, ship the `src/quality.ts` work
already sitting in the working tree — that is the fix for the "no escape hatch" half, and it is
correctly designed. Second, when it lands, change `bloom: true` to `false` at MEDIUM
(`src/quality.ts:40`, **working tree** — this file does not exist at `04059b4`), because
MEDIUM is the touch default (`src/quality.ts:53`) and it currently
keeps the exact cost its own doc comment identifies as the worst thing to give a weak GPU. If the
look must be kept on phones, `steps: 4 → 2` at the `addBloom` call takes 11 passes to 7 for a
difference I would not expect to survive a blind comparison at strength 0.62/0.34.

Second rather than first only because it costs something visible, where change 1 costs nothing —
but it is the dominant *fill* cost in the frame and it is paid on the device least able to pay it.

**3. Guard the four `setColor` calls in `drawHud` (`DayScene.ts:2798, 2862, 2866/2868, 2939`).**
Measured cost: **4.05 `gl.texImage2D` calls and 20.4 KB of texture upload every frame at idle**,
confirmed independently by hooking `Text.updateText` (1.00 + 1.00 + 1.00 + 1.04 repaints/frame,
attributed to `countText`, `hudFlockLabel`, `hudDayLabel`, `hudDayPct`). Three of the four are
setting an unchanged colour. A synchronous texture upload mid-frame is one of the most disruptive
things you can do to a tiled mobile GPU, and this one happens sixty times a second to redraw the
word "FLOCK" in the colour it already was. It ranks third only because the byte count is small next
to changes 1 and 2 — but it is the cheapest of the three to implement correctly, because the exact
guard already exists in this repository at `src/tunnel.ts:1288-1296`, written with a comment that
describes this defect precisely. Copy that pattern four times.

*Runner-up, worth a line:* raise `gateQuad`'s threshold (`src/vfx.ts:1004`) from `0.004` to ~`0.03`
so it actually catches the 0.056 act plates it was written for. Two full-screen blends per frame —
real, but an order of magnitude below bloom's eleven.
