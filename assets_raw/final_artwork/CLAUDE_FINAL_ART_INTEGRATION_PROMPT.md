# FLYWAY — FINAL ART ASSET INTEGRATION + PROGRESSION LAYER HANDOFF (UPDATED)

I am providing:

`flyway_final_artwork_updated.zip`

This ZIP contains the final approved visual asset system for FLYWAY, including the NEW dedicated feather FX sheet.

Treat this package as the game's **visual source of truth**.

The current FLYWAY build already has working gameplay systems and a strong visual direction.

## DO NOT RESTART THE PROJECT.
## DO NOT REBUILD WORKING GAMEPLAY SYSTEMS.
## DO NOT REGRESS THE CURRENT VISUAL QUALITY.

This is an **integration, preprocessing, composition, and polish pass**, not a greenfield rebuild.

---

# FIRST ACTIONS

Before changing anything:

1. Extract the ZIP into the repo.
2. Read `README_ASSET_MANIFEST.md` completely.
3. Inspect every supplied asset folder.
4. Inspect the existing project implementation.
5. Identify which systems already work.
6. Preserve those systems.
7. Integrate the supplied art into the current architecture rather than duplicating systems.

Do not start by rewriting scenes or rendering systems.

---

# VISUAL DIRECTION IS LOCKED

The approved art language is:

- painterly 2D / 2.5D
- navy / violet / lavender
- warm peach / sunset gold
- pale warm stone
- atmospheric haze
- elegant silhouettes
- nature reclaiming architecture
- migrating birds
- restrained luminous accents
- illustrated indie-game feel

Do NOT introduce:

- generic SaaS-style UI
- neon arcade visuals
- raw rectangles
- primitive code-drawn ruins
- procedural bird triangles
- fish-like birds
- placeholder gradients
- cartoon UI unrelated to the game
- a second competing art style

Protect the visual identity.

---

# TARGET ASSET STRUCTURE

Keep original supplied files intact.

Place source artwork somewhere like:

```text
public/assets/source/
```

Create processed runtime assets under:

```text
public/assets/processed/
```

Do NOT directly render entire sprite sheets during gameplay.

---

# REQUIRED PREPROCESSING PIPELINE

For all sprite sheets:

1. inspect alpha/transparency
2. identify each usable sprite
3. crop tightly
4. preserve anti-aliased edges
5. remove unwanted matte/background pixels
6. normalize transparent padding
7. choose consistent anchor/pivot locations
8. export individual PNG files
9. use human-readable filenames
10. preserve untouched source sheets

If a source asset looks correct but renders poorly at gameplay scale, adjust crop, padding, scale, pivot, alpha, tint, or composition in the processed asset layer.

Do NOT destructively edit the original sources.

---

# CORE GAMEPLAY ART

The current game already has working flock gameplay.

Preserve the underlying gameplay code.

Use the supplied artwork to support it.

## Bird flight sprites

Source:

`core_gameplay/bird_flight_sprite_sheet.png`

Continue using this as the primary flying-bird art unless actual gameplay-scale inspection proves a real readability issue.

Use multiple flap states asynchronously.

Birds must unmistakably read as birds.

Never revert to triangles, arrows, line glyphs, fish-like symbols, or paper-airplane shapes.

The flock should remain the hero of the screen.

## Existing ruin obstacles

Sources include:

```text
core_gameplay/ruins_obstacle_sheet_01.png
core_gameplay/ruins_obstacle_sheet_02.png
core_gameplay/ruins_tileset.png
```

Use these as the architectural vocabulary.

Build varied compositions from them.

Do not repeatedly show the same arch.

Use broken arches, narrow arches, multi-window walls, towers, columns, circular openings, fractured walls, diagonal structures, paired pillars, and monumental gates.

## Art and collision remain separate

Visible ruin art should be beautiful.
Underlying collision may remain simple.
Do not render debug primitives in production.

## Organic obstacles

Source:

`core_gameplay/organic_obstacle_sheet.png`

Use for vine curtains, root openings, thorn rings, organic tunnels, hanging vegetation, breakable barriers, and overgrown sections.

## Ancient Ruins background

Source:

`core_gameplay/ancient_ruins_background.png`

Use this as the approved foundation for the current Ancient Ruins flight.

Do NOT replace it with a procedural gradient.

---

# FALCON — FINAL SET-PIECE ART

Source:

`setpieces/falcon_animation_sheet.png`

Extract:

```text
falcon_bank.png
falcon_dive.png
falcon_strike.png
falcon_retreat.png
```

Use the four poses as an authored sequence rather than rotating one sprite.

Preferred sequence:

```text
flock reacts
→ large shadow crosses upper screen
→ screech
→ falcon_bank
→ falcon_dive
→ falcon_strike
→ falcon_retreat
```

`falcon_retreat.png` is specifically for successful defense, mobbing, or **The Falcon Turns Away**.

If the falcon catches birds:

- talons visibly intersect exposed flock area
- flock buckles away
- feather burst appears
- affected birds scatter
- bird count updates clearly
- music/audio dips briefly

If the player defends successfully:

- the falcon narrowly misses
- large air whoosh
- flock compresses/reforms
- falcon transitions to retreat

---

# HERO LANDMARKS

Source:

`setpieces/hero_landmarks_sheet.png`

Extract:

```text
bell_tower.png
storm_spire.png
gauntlet_gate.png
```

## Bell Tower

Use as scenery, named checkpoint, midpoint identity, restart identity, and map/level identity.

When reached:

> **Bell Tower reached**

When restarting:

> **Returning to Bell Tower**

## Storm Spire

Use for Wind Heights / Storm Crossing. Preserve its leaning weathered silhouette. Light banner movement may reinforce wind direction.

## Massive Gauntlet Gate

Use as a final-act gameplay hero obstacle with 2–3 meaningful flyable gaps. It must feel huge relative to the flock.

---

# SEED POD SYSTEM

Source:

`setpieces/seed_curtain_storm_light_sheet.png`

Extract:

```text
seed_pod_cluster_01.png
seed_pod_cluster_02.png
seed_loose_01.png
seed_loose_02.png
seed_loose_03.png
```

Hanging pods are environmental sources.
Loose glowing seeds are the actual interactive Seed Carry objects.

Do not make the pods themselves behave like arcade pickups.

---

# BRITTLE CURTAIN VARIANTS

Extract from the same sheet:

```text
curtain_beaded_01.png
curtain_ivy_lace_01.png
```

Use alongside the existing curtain assets so repeated curtain placements do not look duplicated.

---

# GOD RAY / LIGHT SHAFT

Extract:

```text
god_ray_01.png
```

Use sparingly for Sunbeam Threading, route emphasis, emotional arrival moments, or select Perfect Flow compositions.

---

# STORM CLOUD WISPS

Extract:

```text
storm_wisp_01.png
storm_wisp_02.png
storm_wisp_03.png
```

Use in Storm Crossing / Wind Heights at different parallax speeds.
Do not obscure the flock or collision openings.

---

# NEW — DEDICATED FEATHER FX SHEET

Source:

`setpieces/feather_fx_sheet.png`

This is a NEW, dedicated 4-piece transparent feather sheet and supersedes the old single loose-feather extraction for particle/VFX use.

It contains exactly:

1. one long primary flight feather
2. one curved covert feather
3. a second curved covert feather
4. one soft downy fluff tuft

The source is deliberately high resolution so the extractor can crop each piece cleanly and runtime scaling can remain crisp.

Auto-extract the four separated components as:

```text
feather_primary.png
feather_covert_01.png
feather_covert_02.png
feather_downy.png
```

Validate that all four outputs preserve transparent alpha and soft edges.

## feather_primary.png

Use as the HERO feather shape for:

- results-screen reveal/accent
- loading/transition screen
- branded “before nightfall” flourish
- occasional large drifting feather

This should NOT be the bulk particle in a burst.

## feather_covert_01.png + feather_covert_02.png

These are the main burst particles.

Use them for:

- normal bird-loss puffs
- falcon snatches
- collision scatter
- brittle-impact debris where feather motion is appropriate

Randomize modestly:

- rotation
- scale
- velocity
- spin direction
- alpha

Use both variants together so a burst does not look duplicated.

## feather_downy.png

This is the soft “cloud” element.

Use it for:

- **The Flock Scattered** failure eruption
- falcon snatches
- severe collisions
- large bird-loss moments

The downy tuft should move slower, drift more softly, and fade more gradually than the covert feathers.

It is what makes a feather burst feel airy rather than like hard confetti.

## FEATHER EVENT RECIPES

### Small loss

Use roughly:

- 2–4 covert feathers
- optional 1 small downy tuft

### Medium collision / bird scatter

Use roughly:

- 4–8 covert feathers
- 1–2 downy tufts

### Falcon snatch

Use roughly:

- 6–12 covert feathers
- 2–4 downy tufts
- optional single primary feather drifting behind as a readable hero beat

### Failure eruption / THE FLOCK SCATTERED

Use a broader soft cloud:

- multiple covert feathers
- several downy tufts at varying scales
- 1–2 larger primary feathers drifting through the transition

Do not spawn so many high-res sprites that performance suffers. Runtime scale them appropriately and cap particle counts.

## IMPORTANT DISTINCTION

The new physical feather FX sheet is NOT the same thing as the HOME / FLOCK / FLOW rating system.

- `setpieces/feather_fx_sheet.png` = physical feathers / VFX / transitions
- `progression/feather_rating_system.png` = category UI for HOME / FLOCK / FLOW

Do not replace the distinct rating icons with generic physical feathers.

---

# PERCHED BIRDS

Source:

`setpieces/perched_birds_sheet.png`

Extract approximately:

```text
perched_bird_01.png
perched_bird_02.png
perched_bird_03.png
```

Use for roost arrival, Roost Hop, title-screen branches, map-current-location ambience, birds resting after a flight, and final roost scenes.

Do NOT use these as flying sprites.

---

# BRANDING — FLYWAY WORDMARK

Source:

`progression/flyway_wordmark.png`

This is the approved wordmark.

Use on title screen, submission page, branded transition/loading treatment, and key art.

Do not shrink the detailed painted wordmark into tiny UI.

---

# TITLE / HOME SCREEN

Source:

`progression/title_home_background.png`

Use as the title/home visual foundation.

Suggested structure:

```text
FLYWAY

Bring the flock home before nightfall.

BEGIN FLIGHT
```

Possible future options only when functional:

```text
CONTINUE MIGRATION
FLYWAY MAP
SETTINGS
```

Do not show fake or unfinished menu items.

Use subtle ambient motion:

- distant flock movement
- gentle branch motion
- slight cloud/haze drift
- restrained parallax
- atmospheric sound/music

Do not make this a static web page.

---

# PROGRESSION LAYER

The main progression concept is a migration.
Each level is a flight from one roost to another.

## Migration map concept

Source:

`progression/migration_map_concept.png`

IMPORTANT: this asset is the final composition/art-direction reference, but it includes baked title/labels/route/nodes.

Do NOT use those baked UI elements as live game state.

The runtime map must dynamically control:

- current roost
- unlocked destination
- locked region
- route illumination
- completed route
- earned feathers
- selected destination
- bird count
- best performance
- replay state

The current visual journey supports:

```text
Ancient Ruins
→ Wild Orchard
→ River Gorge
→ Falcon Cliffs
→ Wind Heights / Storm Crossing
→ Final Flyway / Winter Roost
```

Only expose levels that actually exist.

---

# ROOST / DESTINATION MARKERS

Source:

`progression/roost_destination_markers.png`

Extract:

```text
marker_ancient_ruins.png
marker_wild_orchard.png
marker_river_gorge.png
marker_falcon_cliffs.png
marker_wind_heights.png
marker_final_roost.png
```

Use for map nodes, destination previews, level unlock reveals, and post-flight identity.

Map state should read as:

- completed = full/clear color + illuminated route + earned feathers
- current = slightly brighter marker + tiny circling flock + current bird count
- future = visible but cooler/foggier
- locked = atmospheric mist, not generic disabled gray buttons

---

# HOME / FLOCK / FLOW FEATHER RATING SYSTEM

Source:

`progression/feather_rating_system.png`

Use feathers instead of generic stars.

Categories:

## HOME
Completion — reached the roost.

## FLOCK
Preservation / growth — returned with enough birds.

## FLOW
Mastery — flew cleanly and earned enough Flow opportunities.

Extract earned and unearned states for each.

Keep the three mechanically distinct.

---

# RESULTS SCREEN

After arrival, keep the real roost/environment visible behind results whenever practical.

Suggested data:

```text
ANCIENT RUINS — HOME

Returned      118
Found         +24
Lost           26

HOME    [feather]
FLOCK   [feather]
FLOW    [feather]

Flow: 3 / 4

REPLAY FLIGHT
CONTINUE JOURNEY
```

Reveal progressively:

1. Returned
2. Found
3. Lost
4. HOME feather
5. FLOCK feather
6. FLOW feather
7. actions

Use `feather_primary.png` as a restrained hero flourish during the reveal/loading transition if desired, but preserve the distinct HOME/FLOCK/FLOW category icons.

---

# PROGRESSION DATA

Store structured result data such as:

```text
levelId
startingBirds
strayBirdsFound
scatteredBirdsRecovered
birdsPermanentlyLost
birdsArrived
perfectFlows
totalFlowOpportunities
checkpointsUsed
homeFeather
flockFeather
flowFeather
bestBirdCount
bestFlowCount
completed
```

Do not hardcode display values independently of actual gameplay state.

---

# TITLE → FLIGHT → ROOST → MAP

Preferred progression flow:

```text
TITLE
↓
BEGIN FLIGHT

DAY / DESTINATION INTRO
↓
GAMEPLAY

FINAL CHALLENGE
↓
OPEN FLIGHT

ROOST ARRIVAL
↓
RESULTS

CONTINUE JOURNEY
↓
ATMOSPHERIC TRANSITION

FLYWAY MAP
↓
COMPLETED ROUTE REVEAL

NEXT DESTINATION
```

Avoid jarring hard cuts where possible.

---

# LEVEL IDENTITIES

## Ancient Ruins
Warm sunset, stone architecture, open air, ruined arches. Gameplay: Gather, Spread, Neutral, basic routes, first Flow.

## Wild Orchard
Orchard trees, flowers, organic ruins, hanging vegetation, seed pods. Gameplay: rescue flocks, Seed Carry, brittle curtains, moving plant obstacles, recovery.

## River Gorge
Water, mist, pale stone, natural channels, cliffs. Gameplay: splitting/rejoining, irregular channels, multi-opening mastery.

## Falcon Cliffs
Exposed sky, cliffs, predator territory, protective architecture. Gameplay: exposure, cover, falcon set pieces, preserve-vs-reward decisions.

## Wind Heights / Storm Crossing
Storm wisps, torn banners, weathered spires. Gameplay: timing, moving openings, weather cues, pressure sequences.

## Final Flyway
Culmination, monumental horizon, final roost, biggest sky, strongest light. Gameplay: mastery remix, hardest combinations, final migration payoff.

---

# AUDIO HOOKS

The visual package does NOT contain generated music stems.

Prepare:

```text
public/audio/pad.mp3
public/audio/bells.mp3
public/audio/wings.mp3
```

The game must fail gracefully if these are absent.

---

# DO NOT REBUILD CURRENT GAMEPLAY LOGIC

Preserve existing implementations for:

- Gather strain
- Spread cohesion loss
- Neutral recovery
- bird count
- gain/loss
- scattered/recoverable birds
- Perfect Flow
- route choice
- brittle barriers
- moving obstacles
- falcon logic
- checkpoints
- restart transitions

Integrate the art into these systems rather than creating parallel replacements.

---

# FAILURE / RESTART

Preferred sequence:

```text
flock becomes unsustainable
↓
birds scatter
↓
covert feathers + downy fluff erupt
↓
music thins
↓
colors desaturate slightly
↓
soft fade

THE FLOCK SCATTERED

Returning to Bell Tower

62 birds

↓
fade back into checkpoint
```

Use `feather_downy.png` prominently here because the soft cloud is part of the emotional read.

Do not say `YOU DIED`.

---

# VISUAL INTEGRATION QA

After integrating assets, run the actual game at normal scale.

Inspect:

- bird readability
- obstacle readability
- falcon scale
- falcon pose transitions
- seed readability
- curtain readability
- feather burst readability
- downy cloud readability
- HUD clarity
- result feather clarity
- map readability
- title composition
- background/foreground balance

For each major scene:

1. run it
2. capture screenshot if possible
3. inspect at normal size
4. identify top 3 visual problems
5. fix processed asset scale/crop/placement
6. run again

Do this for title, gameplay, falcon set piece, checkpoint/restart, results, and migration map.

---

# SPECIFIC QA FOR NEW FEATHER FX

Check that:

- primary feather remains crisp when used large
- covert feathers still read when scaled down for bursts
- downy tuft looks soft rather than like a hard circular sprite
- burst particles do not overwhelm the flock
- falcon snatch feels airy and dramatic rather than arcade-like
- failure eruption has enough downy fluff to create a soft cloud
- particle counts stay performant
- rating feathers remain visually distinct from physical feather particles

If the extractor splits the sheet incorrectly, fix extraction boundaries in preprocessing rather than modifying the source art.

---

# PERFORMANCE

Use cached textures, atlases where appropriate, sensible particle caps, reduced-resolution distant layers, and no unnecessary per-frame image processing.

The flock must stay smooth.

---

# FINAL QUALITY BAR

The integration is complete only if:

- birds clearly read as birds
- flock remains primary focal point
- obstacles look painterly and intentional
- falcon has distinct visual phases
- seed pods look like seed pods
- loose seeds look interactive
- curtain variants visibly differ
- Bell Tower is recognizable
- gauntlet gate feels monumental
- Storm Crossing has distinct atmosphere
- title screen looks like the same game as gameplay
- results use actual gameplay data
- HOME/FLOCK/FLOW remain distinct
- physical feather FX look soft and intentional
- failure/falcon bursts use downy fluff convincingly
- map reads as migration, not a level grid
- dynamic progress is not baked into art

---

# FINAL IMPLEMENTATION PRIORITY

1. preprocess all source assets
2. integrate gameplay set pieces
3. integrate and validate the NEW feather FX sheet
4. polish the current Ancient Ruins flight
5. title screen
6. results screen
7. progression data
8. migration map
9. visual QA
10. audio hooks

---

# MOST IMPORTANT INSTRUCTION

The supplied ZIP is not merely inspiration.
It is the approved production visual library.

Use code for:

- game logic
- physics
- flock behavior
- state
- animation
- scrolling
- progression
- UI behavior

Use supplied art for:

- birds
- ruins
- organic obstacles
- falcon
- landmarks
- weather
- light
- physical feather FX
- title identity
- map identity
- results identity
- progression visuals

Do not let programmer art replace finished artwork.

Do not simply place every asset once and call the integration complete.

After integration, play the game and inspect actual scenes. If an asset is too large, too small, badly cropped, visually inconsistent, hard to identify, competing with the flock, or awkwardly positioned, adjust processed crop, scale, pivot, alpha, tint, depth, placement, or composition until it works in the actual game.

Preserve the original source files.

The final result should feel like one deliberately art-directed game from:

# TITLE → FLIGHT → SET PIECES → ROOST → RESULTS → FLYWAY MAP.
