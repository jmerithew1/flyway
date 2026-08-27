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
| G3 | Mario-esque pacing pressure — keep up or die and restart at the save | ⏳ | Now carried by the wall of night (K1a) rather than an invented rule. |
| G4 | **Moving things that can CATCH birds** | ⏳ | Active snatchers, not just walls to avoid: sweeping vine tendrils that swing across a gap, rotating briar wheels (the fire-bar analog), grasping roots that rise from below, swinging web nets (`web_net` art already exists). A caught bird should be recoverable by Echo Call, which gives the retrieve verb constant work. |

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

### K1a. The geometry: light ahead, an advancing wall of night behind

**Owner corrected an earlier call of mine, and the correction is right.** I had
argued a pursuing wall contradicts collecting, since motes cost time to gather
and a wall punishes lost time. Owner: collecting light *pushes the wall back* —
so gathering is not in tension with the chase, gathering is how you FIGHT it.
That holds. The contradiction only exists if a detour is time-negative, and it
is not if the light picked up buys back more than the detour spent.

Their version is also simply better: a visible advancing wall has a LOCATION,
so the player can watch themselves winning or losing against it. A shrinking
radius is abstract by comparison.

**What it LOOKS like (owner):** not a clean wall — a billowing smoke-fog,
scary, rolling in like a curse. Roiling dark cloud with tendrils that reach
forward out of the murk. This is a better image than a wall AND it unifies two
requests: **the fog's tendrils ARE the catchers (G4).** They reach out, snatch
a straggler, and withdraw into the cloud. One threat with a face, rather than
a hazard system and a separate wall system.

Craft notes: layered scrolling noise at 2-3 parallax depths so it churns rather
than slides; a bright rim where it eats into the lit air, so the boundary reads
at a glance; tendrils as animated curls that telegraph BEFORE they grab (H5 —
every hazard must have a tell); the flock's own light pushes visibly into it.

**The committed design:**

- **Light is AHEAD.** The roost glows on the horizon and grows all flight.
  Goal and resource are the same thing.
- **A wall of night advances from BEHIND**, always visible, always readable as
  gaining or receding. You know at a glance how much room you have.
- **Collecting motes pushes it back** — visibly and satisfyingly, so light is
  the weapon against it rather than a side objective.
- **When it reaches the flock it EATS BIRDS from the trailing edge.** Not an
  instant loss. It expresses itself in the currency the game already runs on,
  and it keeps gather (stay tight), echo (retrieve the taken) and surge
  (outrun a bad patch) all pointed at one threat.
- **Intensity grows.** The wall advances faster each act, so the final stretch
  is a genuine race and the difficulty curve rides the mechanic itself.

**THE BALANCE INVARIANT — the one number that makes or breaks this:**
a mote arc must return MORE wall-pushback than the detour to reach it costs.
If it does not, collecting is a trap, players learn to ignore light, and the
whole mechanic dies. Tune to this and verify it with a probe: compare wall
distance for a flight that takes every arc against one that flies straight.

Tuning guards: the wall must never feel unfair on a competent line, the first
time it takes a bird must be survivable and unmistakable, and it must be
visible long before it is dangerous. Verify two-sided as with the difficulty
lock — an unskilled run bleeds to it, a competent one always has room.

### K1c. How the darkness actually works

Owner: "is it the whole screen or how's it work?"

Not a uniform dim, and not a wall. **A shrinking pool of light around the
flock.** Daylight is a 0..1 level that drains as you fly; as it falls the lit
radius contracts and dark closes in from the screen edges, strongest from
behind since that is where night comes from. Motes expand the pool back out.

Why this shape: the player can SEE the boundary and see which of their birds
are near it. "The light I am flying in is shrinking and my stragglers are at
the edge of it" is a thought a player can have without being told. A uniform
screen dim gives no spatial information and nothing to act on.

Implementation sketch: a radial mask centred slightly ahead of the flock,
radius driven by the daylight level, offset back-weighted so the trailing edge
goes dark first. Birds outside the lit radius accrue the same danger clock
already used for stone, so the loss path and its drama are shared.

### K1d. One verb per ability — fixing the overlap

Owner: "how does echo work exactly? It seems too similar to gather." and
"surge seems like it's a boost? I still don't get spread either."

Both fair, and the second is a design failure rather than a communication one:
SPREAD has no clear purpose in the current build. The light mechanic gives
every move exactly one job.

| Move | Verb | What it is for | Cost |
|------|------|----------------|------|
| **Hold GATHER** | SURVIVE | Tight flock: nobody trails into the dark, shielded from stone | Collects almost no light; slower |
| **Hold SPREAD** | HARVEST | Wide flock sweeps a huge area of motes — **this is how you gather light** | Birds trail, exposed to the dark and the falcon |
| **Tap SURGE** | BREAK THROUGH | Burst a brittle curtain, smash a cage, cross a dark patch | Strain; ragged if spammed |
| **Tap FLARE** | STOP | Hold at a mote cluster, kill momentum before a wall | Strain |
| **ECHO CALL** | RETRIEVE | Acts ONLY on birds no longer in the flock — scattered, caged, taken by the dark | Cooldown |

The gather/spread pair becomes the game's central dial — survive vs harvest —
and it is a decision the player faces constantly instead of a formation toggle
with no stakes. It also teaches itself the first time motes drift past out of
reach of a tight flock.

**Echo vs Gather, made visually distinct:** Gather CONTRACTS the flock you
have. Echo REACHES OUT — sonar rings sweep outward, every lost bird they touch
lights up as a detected ping, then those birds streak home on trails of light.
Same goal, opposite gesture, completely different image. Answers C3's ask for
ripples, detection and a dramatic return.

### K1e. Mote placement — the level design of light

Owner: "the light should be scattered. Cleverly placed motes, etc, to challenge
and keep interesting for diff skills. Maybe each mote affects darkness a
version amount."

Motes stop being ambient decoration and become the level's actual design
surface. Two systems:

**Varying value.** Not all light is equal — this is the classic coin / red-coin
/ star ladder, and it lets one placement serve every skill level.

| Type | Worth | Where it lives |
|------|-------|----------------|
| Drifting mote | small | Scattered along the safe line. A cautious player stays alive on these alone |
| Mote arc | medium, and pays as a SET | Strung through a gap or around an obstacle — flying the arc cleanly is the reward. This is the DKC banana trail (H1): the light teaches the route |
| Deep light | large | Behind a brittle curtain, inside a tight passage, low in a dive, out wide where the fog can reach. Only reachable by spending an ability and taking a risk |

**Clever placement is how difficulty is expressed.** The same stretch serves a
nervous player (hug the safe motes, survive) and a greedy one (spread wide,
dive for the deep light, push the fog far back and score). Nobody is locked
out, and skill is paid in daylight rather than in a difficulty setting.

Design rules:
- Every deep-light cache must have a visible route in AND a route out.
- A mote arc must obey the balance invariant (K1a): worth more pushback than
  the detour costs.
- Deep light near the fog's reach makes greed genuinely dangerous — that is
  where the tension lives.
- Never place light where the only way to reach it is a collision.

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

## L. Mobile must be outstanding

Owner: "make sure playing on mobile is outstanding. Maybe a movement joystick
on one side and buttons on the other. Keep intriguing and engaging for our
short attention spans."

| # | Item | Now | Should be | State |
|---|------|-----|-----------|-------|
| L1 | Steering | Drag anywhere on the sky | A floating joystick on the LEFT half — appears where the thumb lands, so there is no fixed target to find. Keeps the intention-point feel while giving a real control surface | ⏳ |
| L2 | Abilities | Four corner pads | A right-hand cluster: GATHER / SPREAD held, SURGE / FLARE / CALL tapped, thumb-reachable without looking | ⏳ |
| L3 | Reachability | Untested against real thumb arcs | Verify every control sits inside a natural thumb sweep at 844x390 and on taller phones | ⏳ |
| L4 | First 20 seconds | Same opening as desktop | Mobile players decide fast. Something must happen inside 10 seconds — light to grab, fog on the horizon, a cage in view | ⏳ |
| L5 | Session shape | One long flight | Respect short attention: the first act should be a complete, satisfying beat on its own | ⏳ |
| L6 | Performance | ~5.4ms/frame measured | Re-verify with fog, glow and light all live — these are the expensive additions | ⏳ |

## M. The bookends, and the drama the owner actually wants

| # | Item | State |
|---|------|-------|
| M1 | **Flock wipe = an eruption of feathers FLOODING the screen** — not a tasteful puff. The most dramatic single frame in the game | ⏳ |
| M2 | **The arrival is a MOMENT** — the world pauses, the camera takes it, and the flock streams down to the roost like a shot from a film. Right now it hands you a results panel | ⏳ |
| M3 | **The ending is CONDITIONAL.** Owner: "if the fog almost got you, you don't get the successful win moment - they swirl above the covered tree." Arrive clean and the roost is golden and the flock settles; arrive hunted, with the dark on your heels, and the roost is under fog, the birds circle above it unable to settle, and the music withholds its resolution. The ending should tell you how you did before a single number appears | ⏳ |
| M4 | **Manoeuvring should feel seamless** — the owner does not like how movement feels around some obstacles. Threading a gap should feel like flight, not like fighting the steering | ⏳ |
| M5 | **Skill ceiling**: a player who collects everything well should finish with MOST of the flock, while the run still feels challenging. Generous to mastery, unforgiving to sloppiness | ⏳ |
| M6 | More unique dramatic effects throughout, in the same register as M1 | ⏳ |

## N. Live playtest feedback (owner + other players)

| # | Item | State |
|---|------|-------|
| N1 | Flock wipe reads as an eruption flooding the screen | ✅ 3 layers: per-bird burst, screen-space downpour in waves, huge close-up feathers, hit-stop + kick |
| N2 | **People were confused whether the game was over, restarting, or what happened** when the flock fell apart | ⏳ the eruption is fixed but the COPY and the flow after it are not — must say plainly what just happened and what comes next |
| N3 | Freeing a cage must matter: burst, fall, birds flying out, notification | ✅ white flash, shockwave, FREED callout, each bird streaks home on a trail |
| N4 | Mote collection needs more oomph | 🟡 bloom + bigger brighter motes; the collect burst itself could go further |
| N5 | The "teleport" of collection must be apparent | 🟡 freed birds streak now; echo-call recovery still needs the same treatment |
| N6 | At-risk birds: flashing/radiating blink, not a circling ring | ✅ pulses radiate from the bird, quickening; bird strobes hard via setTintFill |
| N7 | **Can't see the blinking** — needs to be more apparent still | ⏳ verify at play scale, not in a still |
| N8 | **Beginning must SLOW DOWN and introduce controls ONE AT A TIME — people did not grasp the controls** | 🟡 first-encounter cards exist; the opening needs to be genuinely paced, one control per beat |
| N9 | "Which objects can be destroyed" must be in the opening walkthrough | ⏳ |
| N10 | **SPREAD is the least-used ability and needs a real purpose** | 🟡 it is now how you harvest light; the game must TEACH that and demand it |
| N11 | Surge should look better | ⏳ |
| N12 | Visuals must not read dull | 🟡 bloom added |
| N13 | Square in the fog | ✅ art ran to its own frame edge; extraction now dissolves every border |
| N14 | Hawk reads as a floating sticker | ⏳ |
| N15 | Loading screen reads as broken | ✅ progress rail + premise line |
| N16 | Start screen dated; ability explanation still wrong | ⏳ |
| N17 | Roost hop-off opening and the ending sequence must both be CLEAR | ⏳ |
| N18 | Equally fun on mobile | ⏳ |
| N19 | Deploy live | ⏳ |
| N20 | Performance: 395 tweens, 779/998 objects off-screen, 3.1MB garbage per 60 frames | ⏳ diagnosed; mote tween removal + culling must be redone (first attempt corrupted the file) |

**Tooling answer (owner asked whether to bring in another tool):** no new tool
needed. The biggest available visual win was Phaser's own WebGL post-FX, which
was simply not switched on — now it is. HTML/CSS is the right tool for exactly
one thing, the loading screen, because it renders before Phaser exists; it
cannot composite with the game's rendering, only sit on top of it. The other
high-value lever is MORE PAINTED ART of the kind the owner has been generating
— that has been the single biggest quality jump so far.

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
