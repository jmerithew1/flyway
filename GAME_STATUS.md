# FLYWAY — Game Status

Bring the flock home before nightfall. (Formerly MURMURATION; previous
candidate TENSION archived under `archive/tension/`.)

## Production polish pass (2026-08-25, in progress — plan: iridescent-honking-fox)
- **Collider truth**: silhouette-minus-openings colliders (legs/piers solid,
  arch mouths/windows genuinely open, 90px min passages, hand-authored routes
  for 8 gate pieces); organic hangs are soft brush (slow, never kill).
- **Difficulty locked**: danger-time flings (lingering near stone ungathered
  blows birds into the recoverable pool; Gather shields; clean threads free),
  full-price contact everywhere, decaying mercy. Verified: AFK dies at x7338
  (Act 2); formation-aware autopilot 0 resets / 77+ birds home.
- **Feedback layer**: near-miss whoosh+dust, brittle tremble+creak, formation
  snaps, clean-pass golden blooms at real openings, hit-stop + micro-kick,
  feather drama (per-loss puffs / falcon bursts / failure eruption cloud),
  pitch-randomized one-shots, radial glows (no more square sprites).
- **Core abilities**: Surge (tap SPACE), Flare (tap SHIFT), Drafting (clean
  straights build speed + halve gather strain), Falcon Mobbing (late-window
  gather with a big healthy flock drives it off — 0 taken), Echo Call (C/E,
  2.5s reach boost, 6s hoarse cooldown). Prompt queue + timeouts.
- **Final art integrated**: 48 pieces (4-pose falcon sequence, bell tower /
  storm spire / gauntlet gate heroes, seed pods + loose seeds, 2 curtain
  variants, storm wisps, god ray, perched birds, HOME/FLOCK/FLOW rating
  icons, wordmark, title painting, 6 roost markers). Ruins grounded
  (GROUND 948 + world-speed garden). Sources: assets_raw/final_artwork.
- **Pending**: recurring-obstacle content wave, sunbeams/mood plates/music
  escalation, score+streak layer, living title/embed chrome, ability wave 2,
  set-piece beats, migration map, award-jury audit loop. Feather FX sheet
  awaiting owner regen (opaque background); Suno stems awaited.

## Complete game loop (FLYWAY pass, 2026-08-24)
Title screen → Day intro → playable tutorial (steer/gather/spread taught by
level, prompts complete on success) → full Day with: hidden formation strain
(anti-hold: over-gather frays side clusters, over-spread fragments — exposure,
never direct kills), Perfect Flow gates (6, clean-pass detection), golden mote
arcs, stray flocks w/ glow markers, recoverable scattered birds (2.2s window,
Spread widens recovery), moving obstacles (art+colliders together), brittle
curtains, crosswind/updraft/downdraft zones, 2 authored falcon set pieces
(telegraph → 1s window → formation-scaled strike, replaceable art slot at
assets/processed/falcon.png), 5 named landmark checkpoints with identity tones,
meaningful failure sequence, journey storytelling (roost grows on horizon,
light warms), homecoming murmuration (sim birds to 320 + ~260 echoes), results
with per-star reasons, REPLAY loop. Procedural audio with Suno-replaceable
layer slots (public/audio/{pad,bells,wings}.mp3 auto-substitute).

2.5D collider rule: full-width coverage BANDS block (crowns/beams/masses);
narrow verticals (arch legs, mullions) are depth-passable — collision always
matches what the player sees.


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

## Art pipeline (supplied asset kit, integrated 2026-08-24)

**All visible art comes from the owner's 10-sheet art kit** (raw sheets committed
in `assets_raw/`). `tools/extract_assets.py` segments them on their real alpha
channels into 254 pieces under `public/assets/processed/`, with alpha-derived
collider rects and enclosed-opening detection. `tools/build_manifest.py`
generates `src/artManifest.ts` (86 curated pieces, semantic names, families).

Collision stays decoupled from art: `level.ts` features are PLACED PIECES whose
simple invisible rects come from the manifest via one shared `pieceScale()` /
`pieceDisplay()` (width clamp 520px, upscale cap 2.2x to prevent blur; ground/
top mounting resolved from the TRUE post-clamp size — the debug overlay `D`
draws collider outlines over the art to catch mismatch).

Birds are the supplied navy sprites (trio 09/10/11) normalized onto a shared
128px canvas. Art is pre-colored, so the old white-art tint tricks are gone;
strays are marked by a warm radial glow instead.

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
