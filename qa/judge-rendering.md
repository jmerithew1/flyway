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
`0.004` while the same commit dropped the act plates to a peak of `0.056–0.095` — so the gate never
fires for the plate pair that is actually on screen, and the two quads the helper was written to
delete are still drawn every frame at exactly the alpha its own docstring names as invisible.
(2) "Zero allocation in the per-frame path" is true of the six named files and false of the scene
that drives them: `DayScene.update` calls `getBoundingClientRect()` once per frame through
`floatAt`. (3) The per-frame texture re-upload the brief asked about is present and measured —
**4.05 `gl.texImage2D` calls and 20.4 KB of texture upload every frame, at idle, with nothing on
screen changing** — caused by four unguarded `setColor` calls in `drawHud`, in a codebase that
already contains the correct guard in `tunnel.ts`.

And the biggest number in the build was not on the list at all: **145.3 MB of GPU render targets,
122.8 MB of which are Phaser's pre-FX blur pyramid for a feature this game never uses.**

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
codebase is `src/scenes/DayScene.ts:1027` — `this.cameras.main.postFX.addBloom(...)` — and
`PostFXPipeline` takes its buffers from `UTILITY_PIPELINE` (`PostFXPipeline.js:248-252`), not from
the pre-FX pyramid. `src/main.ts:94-113` sets no `disablePreFX`.

Consequence: measured texture inventory is **186.9 MB across 281 keys** (`qa/jr_out/d2.json`), of
which the six act skies alone are 42 MB (`sky_overgrown` etc., 2048×900 = 7.03 MB each, all six
resident from boot). Textures + render targets = **332 MB of GL memory at the desktop size**, before
the wide-phone canvas grows the full-screen targets further. This is the number that decides whether
a mid-range Android drops the WebGL context, and a lost context is a black screen, not a slow one.

**Fix:** `disablePreFX: true` in the game config. One line, no visual change, reclaims 122.8 MB.

## D2 — The touch default runs an 11-pass full-screen bloom

`src/quality.ts:40` — `medium: { fogBlobs: 18, bloom: true, vfxPool: 44, ambient: 0.6, lens: false, decor: 0.8 }`
and `src/quality.ts:53` — `defaultQuality()` returns `medium` on touch.

So the phone default keeps the one thing the file's own doc comment names as the problem:
*"The camera bloom pass. A full-screen post-FX pass is the single most expensive thing on a weak
GPU"* (`src/quality.ts:24-26`). MEDIUM removes the impact lens (which is already free — see A4),
thins the fog blobs and halves the VFX pool, and keeps bloom.

Measured cost: `BloomFXPipeline.onDraw` (`node_modules/phaser/src/renderer/webgl/pipelines/fx/BloomFXPipeline.js`)
issues `copyFrame` + `steps × 2` `copySprite` + `blendFrames` + `copyToGame`. `DayScene.ts:1027`
passes `steps = 4`, so **11 full-screen passes**. My instrumented count agrees exactly: a constant
**11 `bindFramebuffer` calls per frame in every phase measured**, idle included.

On the wide-phone run (`qa/jr_out/m2.json`, viewport 892×412 with `has_touch`), the drawing buffer
is **2078×960 = 2.0 Mpx** and `cameras.main.postPipelines.length === 1` — bloom is attached.
11 × 2.0 Mpx = **22 Mpx of full-screen fill per frame** before a single bird is drawn. At the 4:1
ceiling `backdrop.ts` permits (3840×960 = 3.69 Mpx) it is 40.6 Mpx per frame.

**Fix, in order of preference:** `bloom: false` at MEDIUM (LOW already does this), or keep bloom and
drop `steps` from 4 to 2, which takes 11 passes to 7 for a visually near-identical result at this
strength (0.62/0.34).

## D2b — The fog is 8 of the frame's 16 screens of fill, and it arrives at the worst moment

Not a defect in the sense of a mistake — this is the game's central threat and it is beautifully
made — but it is the second-largest rendering cost in the build and it was not on the claim list, so
it belongs on the record with a number.

`qa/jr_out/d3.json` and `qa/jr_out/m3.json`: at full encroachment the 26 fog blobs contribute
**8.07 screens of alpha-blended fill** at 1536×960 and **6.22–7.28 screens** at the wide-phone
2078×960. Each blob is drawn at roughly 1800×900 — about 120 % of the viewport width — and at up to
alpha 0.95 (`src/nightfall.ts:400-403`). The capture `qa/jr_out/desktop_fog.png` shows the result:
the fog covers the entire frame, and every one of the ~190 world Images, the sky panorama, all three
mood plates and the night veil are drawn underneath it and then completely obscured.

Combined with bloom, the endgame frame is roughly **27 screens of fill**. That is 54 Mpx per frame
at the measured mobile buffer of 2078×960 — the frame where the player most needs stable pacing is
the frame that costs the most, by a factor of about 2.5 over clear sky (6.28 screens).

`quality.ts` already owns the right lever (`fogBlobs` 26/18/12), so this needs no new machinery.
Whether to pull it is a direction call and belongs to the other two judges, not to me — I am
recording the cost, not prescribing the look.

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
`DayScene.update` (`src/scenes/DayScene.ts:1949`):

- `src/scenes/DayScene.ts:2820` — `this.hudDayPct.setColor(low ? '#ff9a7a' : day01 < 0.34 ? '#ffc98a' : '#ffe6bf')`
- `src/scenes/DayScene.ts:2884` — `this.countText.setColor(...)`
- `src/scenes/DayScene.ts:2888` / `2890` — `this.hudFlockLabel.setText('FLOCK').setColor('#c8bad4')`
- `src/scenes/DayScene.ts:2961` — `this.hudDayLabel.setAlpha(0.6 * fade).setColor(d < 0.24 ? '#ffb9a4' : '#c8bad4')`

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
Its docstring (`src/vfx.ts:993-997`) names the problem precisely: *"the ones in the act-plate stack
rewrite their alpha every frame and stay VISIBLE at values around **0.056** — a value no player can
see, costing a full 1536×960 blend each, every frame."*

The gate is set to `0.004`. **0.056 is fourteen times that.** And the same commit that added the gate
also multiplied every act plate by `k = 0.28` (`src/atmosphere.ts:319`, because six painted skies now
carry the act colour), which caps the plate stack at `0.34 × 0.28 = 0.095` and floors it at
`0.2 × 0.28 = 0.056`. Every act plate now lives permanently in the band between the gate and
visibility.

Measured, live (`qa/jr_out/desktop.json` → `phases.A_boot_idle.quads`, boot, idle, clear sky):

```
DRAWN  Rectangle  depth 7.40   alpha 0.0560  MULTIPLY  1536x960  #9fb4ee   <- atmosphere.plateA
DRAWN  Rectangle  depth 7.41   alpha 0.0560  NORMAL    1536x960  #9fb4ee   <- atmosphere.washA
DRAWN  Rectangle  depth 10.9   alpha 0.0085  NORMAL    1536x960  #0d0a1c   <- nightVeil
```

So of the 4 full-screen quads actually drawn at idle, one is the opaque sky panorama and **three are
invisible**. The comment at `src/atmosphere.ts:320-322` claims *"six of them at alpha < 0.004"* were
the waste; after the `k = 0.28` change that description no longer matches the build — the plates are
above the gate, not below it.

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

`src/scenes/DayScene.ts:1779`, unconditionally, once per frame:

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

- `src/scenes/DayScene.ts:1635-1650` — `this.flock.update(rawDt, { intentX: …, intentY: …, gather, spread }, …)`
  builds a fresh config object every frame. This is the exact pattern `src/vfx.ts:33-36` refuses by
  design: *"a `{ }` at a call site fired sixty times a second is 3MB of garbage a minute"*.
- `src/scenes/DayScene.ts:1583` — `cam.getWorldPoint(x, y)` with no `output` argument allocates a
  `Vector2` per frame (Phaser allocates when `output === undefined`).
- `src/scenes/DayScene.ts:2964` — `LANDMARKS.find((l) => !!l.name && l.x > this.flock.centerX)`
  allocates a closure every frame, and `2966` calls `place.toUpperCase()` every frame to compare.
- `src/scenes/DayScene.ts:1947` — `this.scoreText.setText(\`×${this.scoreShown.toFixed(1)}\`)` builds
  two strings per frame (the `setText` itself is correctly guarded by Phaser).
- Per-frame `for…of` over arrays: `this.parallax` (1562), `this.flock.birds` twice (1727, 1755),
  `this.strays` (1790), `PROMPTS` (1866), `this.night.takenThisFrame` (2243), plus four in
  `updateDecor` (2481-2510). Each allocates an iterator. Worth naming only because
  `src/nightfall.ts:288-291` explicitly refuses to do this — *"indexed rather than for-of: this walks
  every bird every frame, and an iterator object per frame is exactly the kind of small steady
  garbage that adds up to a GC pause mid-flight"* — and then `DayScene` walks the same `flock.birds`
  with `for…of` twice on the very next screenful of code.
- `src/scenes/DayScene.ts:1866-1876` and `1887` — `showPrompt('gather', '', () => …)` and
  friends allocate an arrow-function closure at the call site *before* the "already shown" guard
  inside `showPrompt` can reject it. Up to three closures per frame once the flock is past the
  trigger x.
- `src/scenes/DayScene.ts:1802-1815` — while `flock.draft > 0.55` the scene creates a new `Image`
  **and a new tween** every 0.1 s (`src/scenes/DayScene.ts:1809`), i.e. 10 GameObjects + 10 tweens a
  second, in a file whose sibling module opens with "WHY THERE IS NOT A SINGLE TWEEN IN HERE".

None of these is individually large. Together they are the reason the like-for-like profiler number
(A2 below) is not zero, and they sit in the one function that runs unconditionally every frame.

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

## A3 — `warmth` really is MULTIPLY at runtime

`src/scenes/DayScene.ts:495` sets `Phaser.BlendModes.MULTIPLY`, and the live scene agrees — the quad
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

On resolution: the emulated `devicePixelRatio` is 1, but a real phone of that CSS size runs
dpr ≈ 2.6, i.e. ~2320×1070 physical. A 2078×960 buffer is therefore *under*-sampled relative to the
panel, not over — the game renders slightly soft rather than wasting fill. That is the right trade
and I would not change it.

The caveat is D2's, not this file's: the 4:1 ceiling means the *drawing buffer* can reach
3840×960 = 3.69 Mpx, and everything that scales with it scales too — the three full-screen pre-FX
targets, `UtilityPipeline`'s `fullFrame1/2`, and eleven bloom passes. The width derivation is safe;
what is attached to it is not.

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

**2. Take bloom off the touch default — `bloom: false` at MEDIUM in `src/quality.ts:40`, or drop
`steps` from 4 to 2 at `src/scenes/DayScene.ts:1027`.**
Measured at a constant **11 full-screen passes per frame in every phase, idle included** (11
`bindFramebuffer` calls/frame). On the measured wide-phone buffer of 2078×960 that is 22 Mpx of
full-screen fill per frame before the game draws a bird; at the permitted 3840×960 ceiling it is
40.6 Mpx. `quality.ts` already argues this case against itself in its own doc comment and then
ships `bloom: true` at the touch default. Second rather than first only because it costs something
visible, where change 1 costs nothing — but it is the dominant *fill* cost in the frame and it is
paid on the device least able to pay it. If the look must be kept, `steps: 2` takes 11 passes to 7
for a difference I would not expect to survive a blind comparison at strength 0.62/0.34.

**3. Guard the four `setColor` calls in `drawHud` (`DayScene.ts:2820, 2884, 2888/2890, 2961`).**
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
