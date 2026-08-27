# FLYWAY — Owner Request Tracker

Every item the owner has asked for, with its state and how it gets verified.
Nothing is marked DONE on the strength of code existing — DONE means a
screenshot was captured and read, or a number was measured.

Legend: ✅ done & verified · 🟡 landed, needs a look · ⏳ not started

---

## A. Readability & comprehension

| # | Request | State | Verification |
|---|---------|-------|--------------|
| A1 | Tell breakable from unbreakable at a glance | 🟡 | Cold charge runs *through* the material (its own texture, additive) + dark flakes shed + strains under charge. Needs a look in situ. |
| A2 | Home screen must explain **all** moves | 🟡 | Was 3 lines naming only steer/gather/spread. Now 4 lines naming surge, flare, call and dive too. Needs a look. |
| A3 | Teaching prompt clipped off the left edge | ✅ | Was clamped to a fixed 210px margin while centre-origin; now clamped by the string's own half-width. |
| A4 | "about to be lost" phrasing makes no sense | ✅ | Copy dropped. At-risk birds BLINK (rate accelerates with danger) instead of glowing. |
| A4b | Lost birds: strobe faster, then fall | ✅ | Two beats: ~0.38s stall strobing 16→62Hz, then the strobe stops dead and it drops at 1150px/s². `shots/loss_drama.png` |
| A5 | Explain *why* gather/call matter, up front | ⏳ | Brief pause + overlay early in the flight, rather than nagging mid-air. |
| A8 | **Staged tutorial** — don't introduce everything at once; each move pops up mid-play, at the moment it matters, then takes effect | ⏳ | Audit all ~16 one-time prompts for pacing and trigger placement. Title card stays full reference; in-flight teaching is one thing at a time. |
| A6 | "Collecting the light" — purpose is unclear | ⏳ | **Owner: make it branches or something physical instead of light.** Agreed — abstract light has no readable purpose, but a bird carrying NESTING MATERIAL explains itself with no tutorial at all. Collect twigs/seed heads; what you carry home BUILDS the roost, so the arrival ceremony pays off the whole flight. Art on hand: `seed_loose_00..08`, `branch_cluster`, `leaf_strand`. Pairs with H1 (the trail teaches the route). |
| A7 | Birds render inside/behind ruins — looks flyable when it isn't | ⏳ | Owner's call: do NOT fill the ruins in. A decorative cutout with no real opening should simply be SOLID collider, so the silhouette variety survives but you cannot fly through it. Only arch-sized, clearly-read gaps stay passages — raise MIN_PASSAGE and re-derive. |

## B. The cage (strays you collect to grow the flock)

| # | Request | State | Verification |
|---|---------|-------|--------------|
| B1 | Not a "weird square" — an enclosure, like a cage | ✅ | Procedural birdcage: dome, hook, 7 bars, 3 hoops. Captured in `shots/cage2.png`. |
| B2 | Birds must be *inside* it | ✅ | Orbit radius cut 18-60 → 9-31, bob halved, lean clamped. Verified in `shots/cage2.png`. |
| B3 | Cage should fall / break dramatically; birds fly to the flock | 🟡 | Bursts white, shockwave ring, 7 bars scatter, cage tumbles and falls 260px spinning. Needs a look. |
| B4 | **Mechanism** to open it — intention and purpose | ⏳ | Currently opens by proximity, which is passive. Should require a Surge hit. |
| B5 | Multiple cage types: sizes, heights, hanging vs sitting | ⏳ | Variant table + placements. |

## C. Abilities

| # | Request | State | Verification |
|---|---------|-------|--------------|
| C1 | Surge must actually do something | ✅ | Was 325→326 px/s (nothing). Now a world-frame impulse: +52% peak, settles back to cruise. |
| C2 | Abilities should form **shapes**, not blink/flash | 🟡 | Surge→arrowhead, flare→fan, call→ring. Chevron visible in `shots/shape_arrow.png` frame 2; wants to be crisper and held longer. |
| C3 | Echo call: ripples of sound, detection, dramatic return | ⏳ | Currently 3 rings + threads. Needs the full sonar read. |
| C4 | Every ability needs a clear, recurring purpose | 🟡 | Surge now opens cages (B4) as well as bursting curtains. Others need auditing. |

## G. Level & obstacle design

| # | Request | State | Verification |
|---|---------|-------|--------------|
| G1 | More moving obstacles | ⏳ | Currently a handful of pendulum movers. |
| G2 | Variations: moving *openings*, not just moving walls | ⏳ | Gaps that travel or open/close on a beat. |
| G3 | Mario-esque pacing pressure — keep up or die and restart at the save | ⏳ | Rhythm gates the player must match; checkpoint restore already exists. |

## K. LIGHT AS FUEL — the idea that ties the game together

Owner: "if they don't collect the light, can the whole screen start getting
darker... causing them to need more light to continue?"

Yes. This is the strongest structural idea we have, because it makes the
game's own premise — *bring the flock home before nightfall* — into something
the player can SEE and ACT ON, instead of an invisible par time compared
against at the results screen.

**The mechanic.** Daylight is a resource that drains as you fly. Motes are
light. Collecting them holds nightfall back; ignoring them lets the dark close
in. Run low and the world dims, the horizon goes cold, and the flock struggles.

**Why it fixes so much at once:**
- A6 — light finally has an obvious purpose. Nobody needs it explained: the
  screen is getting darker and the glowing things make it brighter.
- H1 — motes become a TRAIL along the route you should fly (the DKC banana
  arc). Following the light is simultaneously the safe line and the fuel.
- H4 — continuous pacing pressure without an anxiety clock. Dawdling costs
  daylight. This is the "keep pace or pay" demand, expressed diegetically.
- I5 — running low IS the drama. No invented fail state needed.
- The nightfall bonus stops being an abstract par and becomes the whole game.

**Design guards:**
- There must be a floor on darkness. It may become tense and beautiful; it may
  never become unreadable — obstacles stay legible at minimum light, or the
  mechanic converts skill into guesswork.
- Telegraph it early: the first dimming should be unmistakable and survivable,
  with light clearly available (the four-step lesson, H3).
- Recovering should feel great — grabbing a rich mote arc after running dark
  should visibly push the dusk back.
- Dusk still advances slowly on its own, so the last act is golden regardless;
  light buys time, it does not stop the day.

Open question for the owner: light-as-fuel and nesting material (A6's branches)
can BOTH exist — light is the fuel you spend, twigs are the treasure you carry
home and see built into the roost at arrival. Recommend shipping light-as-fuel
first, since it changes how the whole level plays.

### K1b. What darkness unlocks — the glow language

Owner: light-as-fuel "allows us to add a lot of glowing features... or if it
looks like it should glow can glow more now."

Correct, and there is a hard technical reason it matters: **glow only reads
against darkness.** Additive blending adds light to what is already there, so
on the current bright dusk sky our glows wash out — measured this session, the
cage tinted warm gold (0xffb35e) rendered nearly white, and the breakable
charge had to fight a pale background to be seen at all. Every glow in the
game is currently working at a fraction of its strength.

As daylight drains, all of it comes alive for free. And glow stops being
decoration and becomes the game's one meaning: **glowing = light = life = the
thing you need.**

| # | Element | What darkness buys it | State |
|---|---------|----------------------|-------|
| K1b-1 | Motes | Become the visual heartbeat — the brightest thing on screen, and the thing you need. Reads as fuel without a word of explanation | ⏳ |
| K1b-2 | Sunbeams / god rays | Currently pale washes on a pale sky. In gloom they are shafts, and threading one becomes a real image | ⏳ |
| K1b-3 | Flock rim-light | Birds passing near a light source catch it. Makes light PHYSICAL rather than a counter, and it is cheap: additive tint scaled by proximity | ⏳ |
| K1b-4 | The cage | It holds living birds; it should be warm against the cold. Its glow finally lands instead of blowing to white | ⏳ |
| K1b-5 | Landmarks / checkpoints | Glow up as you approach, so the horizon pulls you forward and a checkpoint reads as a beacon (I6) | ⏳ |
| K1b-6 | **The roost** | The destination becomes literally the light you are flying toward — a warm glow on the horizon that grows the whole game. This is the strongest single image the mechanic offers | ⏳ |
| K1b-7 | Breakable charge | The cold ice-white signature separates from warm gold far more cleanly in gloom, so the two meanings stop competing | ⏳ |

Consequence for art direction: the six act palettes (E3) should be re-checked
once light drains, since several were tuned bright. Dusk is no longer only the
last act — it is a state the player moves in and out of.

### K2. Light as the game's identity (marketing)

Owner: the light mechanic should drive the marketing — cover art, start page,
the quote. It is the game's unique obstacle, so it should be the thing people
see first.

This lands well because the tagline already on the title screen — *"Bring the
flock home before nightfall."* — stops being flavour and becomes a literal
description of the mechanic. Nothing needs re-pitching; it needs pointing at.

| # | Surface | Change | State |
|---|---------|--------|-------|
| K2a | Title premise line | Sharpen so it names the stakes as a mechanic, not a mood — the dark is closing and the light is what holds it back | ⏳ |
| K2b | Title art | The wordmark already sits in a dusk sky. Push the contrast: gathering light on one side, dark closing from the other, so the screen states the game | ⏳ |
| K2c | Cover / hero capture | Compose the submission still on the mechanic: a murmuration threading a shaft of light with dusk closing behind it | ⏳ |
| K2d | Submission copy | Lead with the hook: a flock racing the dark, where the light you gather is the time you have left | ⏳ |

## J. The HUD — make it read like a real game

Owner: "you never redid the UI component that tells how many birds are left,
adds more info for the user, makes it like a real game." Correct — the layout
was fixed this session (it was overlapping itself), but it was never
*designed*. It is a bare number and a multiplier floating in the corners.

| # | Element | Now | Should be | State |
|---|---------|-----|-----------|-------|
| J1 | Flock counter | Bare "118" | A designed readout: flock glyph, count, and a slender arc that DRAINS as birds are lost, so losing is visible without reading a number | ⏳ |
| J2 | Journey progress | Nothing | A ribbon from roost to roost with landmark ticks and your position on it. This is the single biggest "real game" addition — it gives place, progress and a sense of how far is left (the platformer convention the owner asked for) | ⏳ |
| J3 | Mastery multiplier | "×1.0" | Designed, with the streak reading off it | ⏳ |
| J4 | Carried nesting material | Nothing | Count of what you are bringing home (A6) | ⏳ |
| J5 | Nightfall pressure | Nothing on screen | The daylight meter from section K, read along the journey ribbon — the most important readout in the game once light is fuel | ⏳ |
| J6 | Critical state | Counter changes colour | Below ~25 birds the whole readout goes urgent (ties to I5) | ⏳ |

Style guard: thin, warm, engraved — not chunky game-UI boxes. It should look
like it belongs on the same page as the wordmark.

## H. Platformer grammar, in our own voice

Owner: take mechanics, gameplay and UI/UX from the Mario / Donkey Kong Country
lineage, but keep FLYWAY's style. Those games are the reference for *legible*
difficulty: you fail and know exactly why, and the level taught you before it
tested you. None of that requires their look.

| # | Borrowing | Their version | Ours | State |
|---|-----------|---------------|------|-------|
| H1 | **Collectibles that teach the route** | DKC banana trails arc along the line you are meant to take; Mario coin trails mark the safe jump | This is also the answer to "I don't understand collecting the light" (A6). Motes stop being scattered decoration and become an ARC through the correct gap — the light shows you the line, and taking it is its own reward | ⏳ |
| H2 | **Rhythm gates** | Rotating fire bars, swinging ropes, timed platforms | Openings that open and close on a visible beat, so you read the tempo and commit. Answers G2 | ⏳ |
| H3 | **The four-step lesson** | Introduce safe → develop → twist → conclude | Every obstacle family gets a harmless first encounter, then a real one, then a variation, then a finale. Answers A8's "smooth introductions" and the "nothing one-and-done" rule | ⏳ |
| H3b | **First-encounter card** | Owner: when something NEW appears, a card pops up that you can actually read, explaining the move, then you dismiss it and play on | A small in-world card on first encounter only. The world eases (never a hard freeze), the card names the thing and the move that answers it, any input dismisses it, and it never returns. This is what makes the introduction *smooth* rather than a prompt you miss at speed | ⏳ |
| H4 | **Pressure sections** | Auto-scroll levels; keeping pace is the challenge | A stretch where the scroll pressure tightens and falling behind actually costs birds. Answers G3 | ⏳ |
| H5 | **Launchers** | DKC barrel cannons | Updraft columns that catch a spread flock and fling it — a ride, not a hazard | ⏳ |
| H6 | **Anticipation frames** | Every hazard telegraphs before it hurts | Already partly here (falcon shadow, brittle strain). Audit every hazard for a tell | ⏳ |
| H7 | **UI: level card, checkpoint feedback, end tally** | Course intro, flagpole tally | Day card, roost ceremony, feather tally — mostly built; needs the checkpoint moment to read as a *save*, so a death feels recoverable rather than punishing | 🟡 |

Style guard: no coins, no lives counter, no cartoon outlines, no bouncy squash.
The murmuration, the ruins, the dusk palette and the quiet voice all stand.

## I. Drama pass — the moments that sell the game

Owner: "add more drama to lots of places... dramatic game features and
mechanics that make it more exciting."

Drama is not sparkle everywhere — that flattens into noise. It is a small
number of moments that hit HARD, with quiet between them so they land. Each
beat below names what currently happens, and what should.

| # | Moment | Now | Should be | State |
|---|--------|-----|-----------|-------|
| I1 | **Falcon strike** | A sprite crosses the screen and some birds vanish | The sky dims, the score drops out to a single held note, time dips ~70ms, the dive is a hard streak, impact throws a feather burst, the screech lands on the hit. Answers D1 | ⏳ |
| I2 | **Brittle break** | Alpha fade + dark leaves — the audit called it invisible | It EXPLODES: shards thrown along your heading, a shaft of light through the new hole, hit-stop on contact, the flock punches through in arrow form | ⏳ |
| I3 | **Mobbing the falcon** | Resolves quietly | The one triumph in the game: the flock rises as a column, the screech turns to a retreat, music swells, the predator flees the frame | ⏳ |
| I4 | **Act transitions** | Colour crossfades | A curtain rising: light sweeps across, the act name lands, the score changes voice. Six of these already exist as palettes — make each an *arrival* | ⏳ |
| I5 | **Critical flock ("last stand")** | A colour change on the counter | Below ~25 birds the world reads desperate: score thins to almost nothing, colour drains, wingbeats go loud and ragged. Recovering from it should feel earned | ⏳ |
| I6 | **Checkpoint reached** | Passes silently | A landmark threshold you fly THROUGH — light gate, a held chord, the name of the place. Makes dying feel survivable (H7) | ⏳ |
| I7 | **Big multi-bird loss** | Same as losing one | A gut punch: brief desaturation, the flock's voice cracks, the strobe-and-fall en masse | ⏳ |
| I8 | **Cage break** | Built this session | Verify it lands as hard as it reads on paper | 🟡 |
| I9 | **Roost arrival** | Ceremony exists | Verify it plays as a climax, not a menu | 🟡 |

Rule: drama is EARNED and RARE. Between beats the game stays quiet and pretty —
that contrast is what makes the beats hit. No sustained shake, ever.

## D. Creatures & drama

| # | Request | State | Verification |
|---|---------|-------|--------------|
| D1 | Hawk needs more oomph — looks weird and awkward | ⏳ | Facing + sprite fragments + scale fixed; the *set piece* still needs weight. |
| D2 | At-risk markers ("weird circles") — blink/flash, not glow | ✅ | Rings now reserved for the worst 6 in real danger; the birds themselves strobe. |
| D3 | Loss should be dramatic | ✅ | See A4b. |

## E. Verified fixed earlier this session

| # | Item | Evidence |
|---|------|----------|
| E1 | Canvas centred twice — cropped the HUD off every phone and ~14% off 1080p | HUD on-screen both platforms; `shots/mobile_fixed.png` |
| E2 | Text contrast as low as 1.12:1 against a 3:1 floor | Worst string now 2.91:1; 21/22 pass |
| E3 | All six acts measured the same pink sky | Saturation now spans 0.07–0.58, luminance 0.43–0.72; `shots/acts_sheet.png` |
| E4 | Falcon flew backwards; sprites held neighbour-frame junk | Faces travel; 4 poses cleaned; scale cut from ~11× flock |
| E5 | Music inaudible (bells ≈ −51 dBFS under the wing bed) | Score now leads the bed; master 0.30 → 0.42 |
| E6 | Console error on every load (`falcon.png`) | Legacy slot removed |
| E7 | HUD overlapped itself on mobile | Stacks off measured type heights; `shots/hud_left.png` |
| E8 | Popups overstruck into garbage | Callouts claim separate lanes |
| E9 | At-risk rings pinned at their cap all game | Gated to real danger, top 6 worst |

## F. Standing instruction

Loop: build → look → agent audit (judges + critics, desktop **and** mobile) →
fix → re-audit, until no critical or major findings remain.
