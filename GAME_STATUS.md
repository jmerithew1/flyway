# MURMURATION — Game Status

(Previous candidate TENSION archived under `archive/tension/`.)

## How to run
```
npm install
npm run dev
```
- Slice (default): http://localhost:5199 (or the port Vite prints; browser-pane preview uses an auto port)
- Flock sandbox: add `?sandbox`
- `D` toggles the debug overlay (fps / form / scrollX) in both scenes.

## Controls
- **Mouse** — steer (cursor = intention, not position)
- **SPACE (hold)** — gather: narrow dense stream, slightly faster
- **SHIFT (hold)** — spread: broad cloud, collects strays, slower

## Built so far

### Phase 1 — flock feel (core of the game)
- `src/flock.ts`: 120-bird boid sim, fixed-timestep substepping (correct at any fps),
  spatial hash. Forces: local cohesion/separation/alignment, per-bird *delayed* cursor
  intent (front reacts before tail; sharp reversals whip), elliptical global envelope
  (wide cloud at neutral, stretched along heading when gathered), internal swirl,
  obstacle avoidance with anticipation + side preference (natural splits), soft speed
  shepherding with far-cursor chase boost.
- Form axis: gather/spread quick attack, slow release ("shape memory").
- Measured (heading frame, 5–95%): neutral ~213 len, gather ~213×58 stream,
  spread ~368+ cloud. Tuned by TUNING table at top of flock.ts.

### Phase 2 — ~40s Ancient Ruins slice (`src/scenes/SliceScene.ts`)
Redesign pass (owner brief 2026-08-24): real swallow silhouettes with 3 canvas flap
frames + glider variation (`textures.ts`), authored ruin kit (`src/ruins.ts`:
broken columns w/ jagged crowns & coursing, arch crowns w/ keystones, voussoir
round windows, vines, rubble), and a dense decision-every-2–4s layout defined as
`FEATURES` in SliceScene: three-route tower (1700) → split pillar (2450) →
spread comb ×3 openings (3100) → gather arch-gate (3800) → cluster: column (4400)
→ high slot (4900) → low gate (5350); 21 strays in 3 pockets; ends x=5600.
Fairness systems: per-moment loss cap, survivor deflection toward the flock,
straggler peel-away, and rubber-band mercy (scroll slows 45% when the flock falls
behind 30% screen — prevents the left-edge death grind).
- Painted world (`src/backdrop.ts`): canvas-painted sky/sun/ridges/mist/distant ruins,
  tileable aqueduct parallax strip (0.14×), low dark foliage strip (0.5×), two
  drifting fog bands, leaves + motes particles. Zero external assets.
- Bird loss: per-contact rolls, capped ≈6 per 0.7s (small mistakes 2–5, never mass
  death), survivors deflect toward flock (never bounce backward), hopeless
  stragglers (>760px behind for 3s) peel away as scatter birds; ~30% of scattered
  birds are recoverable if the flock returns quickly.
- Strays (`src/strays.ts`): idle orbit, attracted at 200px (+220 when spread),
  stream in one-by-one and join the real sim.
- HUD: bird icon + count only; prompts float near the flock and fade after use.

### Parked for later (built, not wired): `src/scenes/GameScene.ts`, `UIScene`,
`ResultsScene` reference, `src/level/day2.ts` full Day-2 layout, checkpoints,
brittle-curtain breakthrough. Do not extend until the slice is approved.

## Verification
- Playwright headless drive (SwiftShader ≈4–13 fps → slow-mo; sim itself is
  fixed-timestep so behavior matches 60fps). Scripts in the session scratchpad.
- Choreographed slice run: ~120 → ~64 birds with sloppy machine steering; a clean
  gathered pass through the narrow gap loses 0. Stray collection verified 10/10.
- Real-hardware FPS still needs owner confirmation (target 60).

## Guardrails in force
No formation buttons, no attack button, no falcon/roost/scoring yet, flock feel >
environment detail, mockup palette (lavender/peach/dark navy) is the visual target.
