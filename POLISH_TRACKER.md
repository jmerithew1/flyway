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
| A4 | "about to be lost" phrasing makes no sense | ⏳ | Replace with a dramatic loss read: bird blinks, then falls straight down. |
| A5 | Explain *why* gather/call matter, up front | ⏳ | Brief pause + overlay early in the flight, rather than nagging mid-air. |
| A6 | "Collecting the light" — purpose is unclear | ⏳ | Needs a stated reason and a visible payoff. |
| A7 | Birds render inside/behind ruins — looks flyable when it isn't | ⏳ | Occlusion/depth against solid stone; the arch angle reads passable but the collider refuses. |

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

## D. Creatures & drama

| # | Request | State | Verification |
|---|---------|-------|--------------|
| D1 | Hawk needs more oomph — looks weird and awkward | ⏳ | Facing + sprite fragments + scale fixed; the *set piece* still needs weight. |
| D2 | At-risk markers ("weird circles") need fixing | ⏳ | Currently pale rings; tied to A4's loss drama. |
| D3 | Loss should be dramatic | ⏳ | Blink, then fall straight down. |

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
