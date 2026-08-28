# FLYWAY — visual / cinematic judging pass

**Build judged:** frozen snapshot of `04059b4`, served at `http://127.0.0.1:5300/flyway/`. Nothing rebuilt.
**Lane:** art direction, composition, staging, whether this reads as a world or as illustrated PNGs being moved.
**Method:** headless chromium (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`), scene posed
through `window.__day` (`scrollX`, `night.daylight`, `night.edgeX`, `arrivalGrade`, `finishing`), Phaser's loop
put to sleep before each capture so nothing is torn. 73 captures under `C:\dev\game-week\qa\vjudge\shots\`;
32 read frame by frame with the Read tool. Every number below comes from `qa\vjudge\hist.py`,
`qa\vjudge\edges.py` or `qa\vjudge\greenscan.py` run over those PNGs. No FPS claims anywhere.

Luminance is reported on the sRGB value scale (0 = black, 1 = white), HUD strip and control bar cropped out.
`dark10` = fraction of the frame below 0.10. `hot85` = fraction above 0.85. `mid25_75` = fraction inside the
soft band the earlier audit named.

---

## VERDICT

The title screen is now the best frame in the game and it is genuinely good. **None of what makes it good
reached the 25,400px of flight.** The single fault named as the biggest reason this reads indie — no black,
no white, everything in the mid band — is *completely unfixed in gameplay*, and I can point at the exact
mechanism in `src/atmosphere.ts` that makes it impossible to fix by repainting.

Three things that were called out as broken *are* fixed, and I want to say so plainly: the six acts do read as
six places, the colossal silhouette register exists now, and the fog reads as pursuing rather than growing.

---

## 1. NO BLACK AND NO WHITE — still true, in every single flight frame

**29 flight and arrival captures. `dark10 = 0.0000` in all 29. `hot85 = 0.0000` in all 29.** Not one pixel
below 10% value, not one above 85%, anywhere in the game after you press BEGIN FLIGHT.

| frame | p0.1 | p50 | p99.9 | dark10 | hot85 | mid25–75 | range |
|---|---|---|---|---|---|---|---|
| `title_1536x960` | **0.001** | 0.103 | **0.871** | **0.4755** | **0.0013** | **0.095** | **0.870** |
| A1 Dawn Approach | 0.226 | 0.429 | 0.686 | 0.0000 | 0.0000 | 0.993 | 0.460 |
| A2 The Sun Gate | 0.149 | 0.335 | 0.577 | 0.0000 | 0.0000 | 0.774 | 0.428 |
| A3 The Overgrown | 0.163 | 0.325 | 0.456 | 0.0000 | 0.0000 | 0.975 | 0.293 |
| A4 Wind Heights | 0.201 | 0.428 | 0.615 | 0.0000 | 0.0000 | 0.959 | 0.414 |
| A5 The Gauntlet | 0.136 | 0.229 | 0.646 | 0.0000 | 0.0000 | 0.313 | 0.509 |
| A6 Homeward Light | 0.144 | 0.196 | 0.470 | 0.0000 | 0.0000 | 0.324 | 0.325 |
| tunnel finale x=24250 | 0.180 | 0.333 | 0.515 | 0.0000 | 0.0000 | **0.915** | 0.334 |
| GOLDEN arrival | 0.148 | 0.310 | 0.515 | 0.0000 | 0.0000 | 0.817 | 0.367 |

The title screen has **55% of its frame below 10% value and a real hot core above 92%**, with only 8% of it in
the soft band. Act 1 has **99.3%** of its frame inside the soft band. That is the whole story in two numbers.

### The mechanism — this is not a painting problem

`src/atmosphere.ts` composites each act with **two full-screen rectangles**:

- `makePlate()` — full-screen `Rectangle`, `BlendModes.MULTIPLY`, `tintAlpha` **0.20–0.34** (`ACT_PLATES`)
- `makeWash()` — full-screen `Rectangle`, **normal blend**, `washAlpha` **0.20–0.42**

A live scene probe at x=23,400 listed the full-screen rectangles actually on stage: **four of them**, at alpha
0.10, 0.10, 0.15 and 0.35, on top of the plate/wash pair.

A normal-blend rectangle of colour C at alpha a gives `out = (1−a)·src + a·C`. **That is a hard floor of
`a·V(C)` under every pixel in the frame** — no source pixel, however black, can get below it. The Overgrown's
wash is `0x4f9e6a` (V≈0.54) at α 0.42 → floor ≈ 0.23; measured p0.1 for that act is 0.163 with p5 at 0.26.
Homeward's wash is `0xe8913f` (V≈0.62) at α 0.34 → floor ≈ 0.21; measured p0.1 is 0.144. The MULTIPLY plate
does the same job at the top end: it can only darken, so it caps the highlight. The two together are a
mathematical guarantee that the frame lives in the middle, and no amount of repainting the art underneath
can escape it.

Evidence: `A1_dawn.png`, `A2_sungate.png` … `A6_homeward.png`, `title_1536x960.png` in `qa\vjudge\shots\`.

### Corollary: nightfall does not get dark, it gets *flat*

Same x, same composition, daylight 0.90 → 0.03:

| daylight | p0.1 | p99.9 | range | mid25–75 |
|---|---|---|---|---|
| 0.90 | 0.126 | 0.527 | 0.401 | 0.796 |
| 0.50 | 0.126 | 0.464 | 0.338 | 0.666 |
| 0.20 | 0.126 | 0.396 | 0.270 | 0.555 |
| 0.03 | 0.126 | 0.363 | **0.237** | 0.453 |

The floor never moves. The ceiling comes down. Losing the light does not produce darkness — it produces a
narrower grey. The game's whole premise is *outrun the dark*, and the dark is currently the least dramatic
state the frame can be in. (`F_day090.png` … `F_day003.png`.)

---

## 2. The prompt and HUD layer sits ON the picture, and it stacks

The plates themselves are good — dark navy, warm hairline, generous padding, text legible. The problem is
that **there is no exclusivity and no reserved slot.**

`V_tunnel_24160.png` — the approach to the finale, in front of the `gauntlet_gate` monument — has **five
message surfaces on screen at once**, stacked down the middle:

1. `SPLIT / TAP SHIFT` verb plate
2. `THE FLOCK FOLLOWS YOU / Move the mouse…` card, directly beneath it
3. `a bird is BLINKING OUT — hold SPACE to pull it back in` pill, in a *third* visual style (grey plate)
4. the day-intro copy `120 birds / Reach the roost.` bleeding through both
5. the always-on ability bar

Together they cover the top ~45% of the frame and the entire crown of the monument the shot exists to show.
`A6_homeward.png` shows four at once with the falcon `BREAKTHROUGH` meter — a hard-edged black bar floating
free in the sky — landing on top of the `THE DARK IS COMING` card. `A1_dawn.png` and `act1_dawn.png` show the
same card-over-banner collision.

Two further specifics:
- The `BREAKTHROUGH` meter is an **unstyled hard-cornered black rectangle** with the label under it. It is the
  one UI element that has no plate language at all, and it is the one that appears at the tensest moments.
- In `F_day090.png` the `THE FLOCK FOLLOWS YOU` card is composited over a bright sky at effectively 5%
  contrast — it is a ghost. The plate does not adapt to what is behind it, so it is either a hole punched in
  the picture (over the fog) or invisible (over the sunset).

Answer to the brief's question: **the text sits on top of the world, and there can be three plates of it at
once.**

---

## 3. The graded arrival — only two of the three are readable

Posed at the roost with the ceremony fully played out (`finishTimer` 7.0, perched birds landed).

| grade | what the frame actually shows | perched | fog `encroach` |
|---|---|---|---|
| GOLDEN | lit tree, hot roost lamp, 44 birds on the branches, flock still streaming in | 44 | 0.18 |
| HARRIED | fog has eaten the left half and half the tree, lamp dimmed, fewer birds on branches | 29 | 0.93 |
| HUNTED (fog-triggered) | **a featureless purple cloud. No tree, no flock, no lamp, nothing.** | 0 | 1.00 |
| HUNTED (daylight-triggered) | **lit tree, warm sunset, hot lamp — indistinguishable from GOLDEN** | 0 | 0.22 |

`W_golden.png`, `W_harried.png` — these two work. GOLDEN vs HARRIED is exactly the read the brief asked for
and you get it with the sound off in one frame. Good.

`W_hunted.png` and `E_hunted.png` (two independent poses) are the same result: **the entire frame is fog.**
And this is not me over-driving it. `gradeArrival()` sets hunted when `behind < 380`; `Nightfall.encroach` is
`clamp((screenEdge + 620) / (viewW·0.62))`, so at the *most generous* hunted state `encroach ≈ 0.99`. The fog
owns the whole screen by construction. There is nothing to read, so the ending does not read as an ending —
it reads as a lost render.

`Y_hunted_bydaylight.png` is the other half of the problem. `gradeArrival()` also sets hunted on
`day < 0.25` alone, with the fog anywhere. Posed that way, the HUNTED arrival is a lit tree under a warm
sunset with the roost lamp burning. It looks like a triumph. The grade has three names and two pictures, and
neither picture is the one it is supposed to be.

---

## 4. Hard edges and boxes — mostly clean, two real ones left

**The 248-piece feathering pass worked.** I checked every fog and light-shaft asset directly:

| asset | max border alpha | mean 2px ring alpha |
|---|---|---|
| all 16 of `fog_wall_00..03`, `fog_edge_00`, `fog_puff_00`, `fog_bank_*`, `fog_cloud_mid`, `fogroll`, `god_ray`, `shaft_*` | **0.000** | **0.000** |

So no shipped fog or ray art has a hard border. But two of twelve mid/late-act captures still contain a
**full-height ruled vertical edge**, found by `edges.py` (mean |Δ| per column over 80% of the frame height):

- `A6b_homeward.png` — **x = 914, mean |Δ| = 0.192, present on 99% of the column.** Looking at it: violet fog
  to the left of the line, a pale milky panel to the right, with a second step at x≈1440. This is the "white
  box around the fog cloud" the owner reported, still shipping. It is a **compositing/layer boundary**, not an
  unfeathered PNG.
- `A5_gauntlet.png` — **x = 62, mean |Δ| = 0.194, 99% of the column.** A pale vertical band pasted down the
  left edge; sampled at y=500 the value steps from (124,118,145) at x=60 to (69,61,99) at x=64.

Elsewhere the fog is clean. `X_fogbox.png` is the fog at its best — tendrils leaning into frame from the
left, a genuinely ragged boundary, no straight line anywhere, and it does read as *coming for me* rather than
*growing*. `E_hunted.png`'s apparent centre seam measured at |Δ| = 0.005, i.e. a soft gradient, not an edge.
I looked hard and found no rectangle in the fog blob field itself.

**The one that is in every frame:** the nearest layer to the camera — the foreground grass strip — is a
`tileSprite` with **visible hard repeat seams**. `zz_ground_F_day090.png` (bottom 90px, contrast boosted)
shows the identical grass silhouette repeated verbatim three times across the frame with hard vertical cuts;
measured steps of 0.08–0.10 at x ≈ 470, 845 and 1015. The closest thing to the player's eye is wallpaper.
That is the single loudest "Phaser moving PNGs" tell left in the build.

Lesser: the `god_ray` sprites read as ruled diagonal quads against flat sky — measured as a straight
~500px boundary at only 4.2% luminance step (`zz_beamedge.png`, contrast boosted to show it). Borderline;
noticeable on a good display, invisible on a phone. Not worth a fix before the three below.

---

## 5. Things that are genuinely fixed — briefly

- **The title screen is the game's best frame, and it is a poster, not a menu.** `dark10` 0.476, `hot92`
  0.0008, `mid25_75` 0.095, range 0.870. Near-black ruins on the left, lit roost on the right, the
  murmuration as one silhouetted ribbon in the hot band. It holds at 1536×960, 1280×800 and 844×390.
  `edges.py` found no ruled band boundary — the strongest horizontal steps are the BEGIN FLIGHT button's own
  edges. This is the proof that the team knows exactly how to do it.
- **The six acts read as six places.** Not one painting recoloured. Measured mean saturation 0.171 (Overgrown,
  sage) vs 0.377 (Gauntlet) vs 0.391 (Homeward, orange); Wind Heights is visibly bleached; the Sun Gate is
  peach on warm stone; Homeward's horizon is genuinely orange. Compare `A3_overgrown.png` and
  `A6_homeward.png` — different worlds.
- **The colossal register exists.** `G_fog_day050.png` (half-buried `colossus_head` filling the left third),
  `A3_overgrown.png` (`colossus_ribcage`), `F_day090.png` (`colossus_torso_draped`), `V_tunnel_24160.png`
  (`gauntlet_gate`) all read as monumental and are staged behind the play plane so they never look like
  hazards. This complaint is answered.
- **The flock is the darkest thing in a clear frame.** In `F_day090.png` the p0.1 of the whole frame (0.126)
  *is* bird pixels — the birds are the darkest value in the picture and they read cleanly against the warm
  sky. In fog they vanish entirely, which is the fault of §1 and §3, not of the birds.

*(Note for the record: an earlier pass of mine found Phaser `__MISSING` texture boxes in the world. On
re-check those appear **only** in captures taken by stepping the scene with a synthetic clock via
`d.update(ts, dtMs)` — never in any of the ~20 real-time captures. It is a harness artefact, not a build
defect. Same for the "green diagonals" I thought I saw in the Overgrown: that act's wash is literally green
(`0x4f9e6a` at α 0.42), so an ADD-blend god ray over it reads green. Both retracted.)*

*(Also for the record: I could not get the tunnel corridor to ease into its `run` phase under harness
driving — it jumped `approach → breakout`. `V_tunnel_24520.png` shows the wall slabs parked out as loose
hard-edged dark quads floating in the sky, but I do not trust that as a picture of the intended finale and
am not ranking it. The finale's composition at x=24,250 is untested by me and should be judged by hand.)*

---

## THE THREE HIGHEST-VALUE VISUAL CHANGES REMAINING

### 1. Delete the full-screen normal-blend wash. Put a black and a hot value back in every frame.

Highest consequence because it is the only finding that touches **all 29 flight frames**, and because it is
the fault the earlier audit already named as the single biggest reason this reads soft — and it is still
100% present. `dark10 = 0.0000, hot85 = 0.0000` across the entire game is not a matter of taste.

The reason it survived a repaint is that it cannot be repainted away: `makeWash()` in `src/atmosphere.ts`
puts a full-screen normal-blend rectangle at α 0.20–0.42 over the frame, which is an arithmetic floor under
every pixel. Move the act's hue into the art or into a hue-only operation that preserves the extremes (a
gradient-map, or a wash masked to the sky band so the foreground and the flock stay out of it), and let the
MULTIPLY plate stay. Then give each act one thing that goes near-black — the nearest monument, the
foreground band, a repoussoir mass at frame left, whichever the composition wants — and one genuinely hot
value, which the level already has authored for you: the roost lamps, the sunbeam landings and the mote
chain are all in place and all currently capped at ~0.50.

The proof this is achievable in this engine, with this art, is one scene away: the title screen already does
exactly this and measures 0.001 → 0.871.

### 2. One message slot. One plate at a time.

Second because it is on screen for most of the flight, it is what the brief's *INTUITIVE* half is being
judged on, and it is the cheapest of the three. Five surfaces stacked over the crown of the finale monument
(`V_tunnel_24160.png`) is not a styling problem — the plates are well made — it is a missing queue.

Concretely: one reserved region, one message visible at a time, everything else queued behind it; move the
slot off the optical centre so it stops landing on whatever the frame is composed around; give the falcon
`BREAKTHROUGH` meter the same plate language as everything else instead of a bare black rectangle; and make
the plate's opacity respond to what is behind it, so it stops being either a hole in the fog or a ghost on
the sunset.

### 3. Make the HUNTED arrival readable — and make the grade actually determine the picture.

Third by frequency, first by weight-per-frame: it is the last thing a losing player sees, and right now one
of the three endings is a featureless purple cloud and another is indistinguishable from a win.

Two separate fixes, both small:
- At `finishing`, punch the roost out of the fog — clamp `Nightfall.encroach` during the arrival ceremony, or
  mask the fog around the tree — so the hunted frame shows *the lit tree with the dark closing on it and no
  birds on the branches*, which is the read the brief asks for and which HARRIED already achieves.
- `gradeArrival()` sets hunted on `day < 0.25` **or** `behind < 380`, but only the second one changes the
  picture. Either drive the visual from whichever condition fired, or make the ceremony itself carry the
  grade (lamp brightness, sky, how much of the tree the fog holds) rather than leaving it to whatever the
  fog happened to be doing.

---

### Runner-up, if a fourth lands

Re-cut the foreground ground strip so it stops repeating on a visible ~545px pitch with hard seams
(`zz_ground_F_day090.png`). It is the nearest layer to the eye and the most literal instance of the thing
this whole effort is trying to stop looking like.

---

**Artefacts:** `C:\dev\game-week\qa\vjudge\shots\` (73 PNGs) · harness `C:\dev\game-week\qa\vjudge\lib.py`,
`acts2.py`, `main1.py`, `main2.py`, `ends2.py`, `final.py`, `title.py` · measurement `hist.py`, `edges.py`,
`greenscan.py`. Nothing under `src/` or `tools/` was touched.
