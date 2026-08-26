# FLYWAY Final Visual Asset Manifest

## Status
Visual direction is locked. These are the approved source assets for the current game and progression layer.

Important: several files are sprite sheets. Preprocess them into individual transparent PNGs before runtime use. Do not render entire sheets in-game.

The migration map file is a CONCEPT/COMPOSITION reference because its labels/path are baked into the image. Use it to build the interactive map, but do not use it as the final clickable runtime map unless the baked UI is acceptable. Ideally create/use a clean backplate and draw route, labels, nodes, feathers, lock states, and selection states dynamically.

No MP3 audio stems are included in this package.

## Core gameplay
- `core_gameplay/ancient_ruins_background.png` — main Ancient Ruins painted background.
- `core_gameplay/ancient_ruins_parallax.png` — optional distant parallax/depth layer.
- `core_gameplay/foreground_garden_overlay.png` — sparse foreground framing.
- `core_gameplay/bird_flight_sprite_sheet.png` — primary flight bird poses; slice into 3+ animation poses.
- `core_gameplay/ruins_obstacle_sheet_01.png` — reusable stone obstacle sprites.
- `core_gameplay/ruins_obstacle_sheet_02.png` — more stone/arch/column variation.
- `core_gameplay/ruins_tileset.png` — additional ruin pieces for obstacle composition.
- `core_gameplay/organic_obstacle_sheet.png` — vines, roots, thorn rings, organic barriers.
- `core_gameplay/wind_fx_sheet.png` — wind/leaf/haze/lightweight atmospheric effects.
- `core_gameplay/roost_flock_sheet.png` — roost/tree/flock ending support assets.

## Set pieces / new additions
- `setpieces/falcon_animation_sheet.png` — four falcon poses: bank/pre-attack, dive, talons-forward strike, retreat/turn-away.
- `setpieces/hero_landmarks_sheet.png` — bell tower, storm/weathered spire/torn arch, massive gauntlet gate.
- `setpieces/seed_curtain_storm_light_sheet.png` — seed-pod clusters, loose glowing seeds, brittle curtain variants, storm wisps, god-ray/light shaft.
- `setpieces/feather_fx_sheet.png` — dedicated 4-piece feather FX sheet: one long primary flight feather, two curved covert feathers, and one downy fluff tuft. Source resolution 1536×1024 RGBA; intended for automatic extraction into individual sprites.
- `setpieces/perched_birds_sheet.png` — simplified perched/resting birds matching the flock style.

## Progression layer
- `progression/flyway_wordmark.png` — final cleaner FLYWAY wordmark.
- `progression/migration_map_concept.png` — migration-map art direction and node layout reference.
- `progression/roost_destination_markers.png` — location/roost landmark vignettes for map and level-select.
- `progression/feather_rating_system.png` — HOME/FLOCK/FLOW visual language plus earned/unearned states.
- `progression/title_home_background.png` — title/main-menu backdrop.
- `progression/level_previews_and_keyart.png` — level preview direction and submission/key-art reference.

## Reference
- `reference/flyway_asset_guide.png` — overview sheet showing intended usage/relationships.

## Runtime integration principles
1. Keep current painterly art direction intact.
2. Separate visible art from collision geometry. Primitive colliders may stay invisible underneath sprites.
3. Slice sprite sheets in a preprocessing step and export individual RGBA PNGs into `public/assets/processed/`.
4. Preserve alpha; remove any dark/checkerboard matte pixels if needed.
5. Normalize sprite pivots/anchors and trim transparent padding.
6. Keep obstacle art readable against the sky; flock must remain the visual focus.
7. Use major landmarks as both scenery and checkpoint identity.
8. Use the falcon poses as an authored sequence, not one looping enemy sprite.
9. Use seed-pod clusters as sources; use loose glowing seeds as the gameplay carry/collect item.
10. The dedicated `feather_fx_sheet.png` supersedes the old single loose-feather extraction for particle/VFX use. Auto-extract exactly four pieces: `feather_primary.png`, `feather_covert_01.png`, `feather_covert_02.png`, and `feather_downy.png`. Use the primary as the hero/result/loading feather, coverts as the bulk of burst particles, and the downy tuft to create the soft cloud feel in failure eruptions and falcon snatches.
11. Use perched birds only for roost/title/map quiet-state moments, not as flight sprites.
12. Use HOME/FLOCK/FLOW feathers on results and map completion states; simplify at tiny icon sizes. The feather rating artwork is category UI; the new feather FX sheet is physical/VFX imagery and should not replace the rating distinctions.
13. Do not bake dynamic progress UI into the map. Route glow, node state, labels, counts, feathers, fog/locks, and current location should be dynamic overlays.
