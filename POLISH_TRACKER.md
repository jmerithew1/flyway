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
| A6 | "Collecting the light" — purpose is unclear | ⏳ | Needs a stated reason and a visible payoff. |
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
| H4 | **Pressure sections** | Auto-scroll levels; keeping pace is the challenge | A stretch where the scroll pressure tightens and falling behind actually costs birds. Answers G3 | ⏳ |
| H5 | **Launchers** | DKC barrel cannons | Updraft columns that catch a spread flock and fling it — a ride, not a hazard | ⏳ |
| H6 | **Anticipation frames** | Every hazard telegraphs before it hurts | Already partly here (falcon shadow, brittle strain). Audit every hazard for a tell | ⏳ |
| H7 | **UI: level card, checkpoint feedback, end tally** | Course intro, flagpole tally | Day card, roost ceremony, feather tally — mostly built; needs the checkpoint moment to read as a *save*, so a death feels recoverable rather than punishing | 🟡 |

Style guard: no coins, no lives counter, no cartoon outlines, no bouncy squash.
The murmuration, the ruins, the dusk palette and the quiet voice all stand.

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
