# MURMURATION — Game Status

(Previous candidate TENSION archived under `archive/tension/`.)

## How to run
```
npm run dev
```
- Day (default): http://localhost:5199 (browser-pane preview picks an auto port)
- Flock sandbox: `?sandbox` · bird-sprite inspection: `?sandbox&birds=26`
- `D` toggles the debug overlay in both scenes.

## Controls
- **Mouse** — steer (cursor = intention, not position)
- **SPACE (hold)** — gather: narrow dense stream, slightly faster
- **SHIFT (hold)** — spread: broad cloud, collects strays, slower

## Art pipeline (rebuilt 2026-08-24)

**All visible art is authored SVG in `public/art/`** — 16 files, loaded by a real
`BootScene.preload()` via `this.load.svg()` and rasterized at load. No runtime
primitives are used as final artwork. `src/ruins.ts` (the old Graphics kit) is
deleted; only particle textures (`softdot`, `leaf`) remain procedural.

Assets live in `public/`, **not** `src/`, deliberately: Vite inlines assets under
4 KB as *percent-encoded* data URIs, and Phaser's loader fast-paths `data:` URLs
through `atob()`, which throws on percent-encoding — an uncaught exception that
kills the whole load queue. It works in dev and hard-crashes `vite build`.
Serving from `public/` bypasses Vite's transform entirely. **`npm run build` +
`vite preview` is therefore part of verification, not a dev-only check.**

Colliders and art are decoupled: `level.ts` owns collision geometry, `DayScene`
places sprites over it and never re-derives it. (Previously `f.hw * (f.huge ?
1.15 : 1.45)` appeared verbatim in both files — the drawn circle and the
collision circle were literally the same expression, which is why the art read
as developer geometry.)

## Systems
- `src/flock.ts` — 120-bird boid sim, fixed timestep, spatial hash. Envelope is
  asymmetric along heading (dense leading edge, streaming tail) with a per-bird
  leash multiplier for a ragged boundary. Measured in game: neutral 405×349
  (26% screen width), gather 558×87 (6.4:1 stream), spread 619×468 (40%).
- `src/level.ts` — declarative Day layout, 24 features over ~26,600px.
  **Pacing rule is enforced in code**: `pacingReport()` asserts nothing sits
  closer than a 2s reaction window at that section's speed (currently 0
  violations, min gap 450px). The old pressure-section grinder was exactly this
  — 330px gaps at 224px/s, ~1.5s of warning.
- Routes: every large ruin offers several viable ways through (safe arch /
  skill window / reward opening with strays / multi-opening spread / brittle
  shortcut / auto-splitting pillar). 11 stray groups, 5–14 birds each, 90 total.
- Bird loss capped per moment; survivors deflect toward the flock; stranded
  stragglers peel away; rubber-band mercy slows the world when the flock falls
  behind. Below 35 → scatter, fade, restart at the latest of 10 checkpoints.
- `src/audio.ts` — procedural WebAudio only (no samples): filtered-noise wing
  bed that brightens on gather and widens on spread, collision thuds, roost
  chime. There is **no composed music track**.

## Verified
- `npx tsc --noEmit` clean; `npm run build` passes; **built output loads all
  textures with 0 console errors** (checked via `vite preview`).
- Autopilot drove the full Day end to end: reached the roost approach with 44
  birds, 43 strays found, 6 checkpoint recoveries, never a full restart, no
  errors, no stuck points.
- Bird sprite gate: 26 birds rendered at real gameplay scale and inspected.

## Known gaps
- Real-hardware FPS unconfirmed (headless SwiftShader runs ~5 fps, so all
  timing above is derived from the fixed-timestep sim, not wall clock).
- Full-run length is ~2.5 min clean; the 3–5 min target assumes some resets.
- Backplate is still canvas-painted (`src/backdrop.ts`), structured so a
  painted plate can replace it; ruin/bird/foreground art is all SVG.
