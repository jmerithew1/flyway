# FLYWAY — new art actually needed

Everything else the game needs already exists; 380 painted files were sitting
unregistered and are being wired now. These two sets are the genuine gaps.

---

## SET 1 — Six breakables, one per act (the priority)

**Why:** there are 18 breakable placements across six acts drawn from only 3 art
pieces, and an audit found those three read identically at speed. So every act
breaks the same thing. Each act should own a breakable that is unmistakably its
own.

**The rule that must hold across all six:** cold white-blue light runs *through*
the material — it is the game's universal signal for "this will break", and
nothing inert in the world ever carries cold light. The material changes per
act; the signal never does.

### Prompt

> A single hanging barrier of ruined material, painted in soft dusk pastels
> against a fully transparent background. Cold white-blue light glows from
> *within* the material itself, running through its structure like light through
> cracked ice — not a rim light, not an outline, not a glow behind it. The piece
> is fragile and about to give way. Painterly, illustrated, no outlines, no
> ground, no sky, no cast shadow, nothing behind it. Soft feathered edges that
> fade to full transparency at every border — the art must never run to a hard
> straight edge. Vertical hanging composition, roughly 400x700px.

Generate **six variants**, one per act, each a different material so they read
as different places, and each breaking differently:

| # | Act | Material | How it comes apart |
|---|---|---|---|
| 1 | Dawn approach | thin frost-glazed vines | **shatters** into shards |
| 2 | Sun gate | brittle sun-bleached reed screen | **snaps** into splinters |
| 3 | Overgrown | dense hanging ivy lace, dry and dead | **tears** apart |
| 4 | Wind heights | salt-crusted rope netting | **frays** and unravels |
| 5 | The gauntlet | crumbling plaster lattice | **crumbles** to dust |
| 6 | Homeward | a curtain of dried seed pods | **bursts**, scattering |

---

## SET 2 — Five cages (secondary)

**Why:** cages are currently drawn procedurally as line geometry. They read
clearly but they do not look like they belong in a painted world. Five kinds now
exist mechanically and each should look like what it is at a glance.

### Prompt

> A ruined birdcage, painted in soft dusk pastels against a fully transparent
> background. Warm gold light glows softly from inside it. Painterly and
> illustrated, no outlines, no ground, no sky, no cast shadow, nothing behind
> it. Soft feathered edges fading to full transparency at every border.
> Roughly 400x400px, centred.

Generate **five variants**:

1. **Perched** — a squared box cage resting on small feet. Still, stable, safe.
   This is the first cage a player ever meets, so it must look harmless.
2. **Hanging** — a domed cage on a chain, clearly suspended and able to swing.
3. **High** — a smaller, lighter dome on a long thin chain, built to sway.
4. **Sunken** — a squat, heavy, half-buried cage, dark and settled, low to the
   ground.
5. **Great cage** — much larger and more ornate, with a finial on top and denser
   bars. It must look worth a detour from a long way off, because that is
   exactly the decision it exists to create.

---

## Delivery notes

- Transparent background, PNG or WebP.
- **Soft feathered edges are load-bearing.** An opaque border becomes a hard
  straight line on screen — that caused a recurring "square in the fog" defect
  on this project twice. Every piece must fade to full transparency at its
  border.
- No baked-in sky, ground, sun, halo or shadow. Several existing assets contain
  their own little world inside the cutout and can never composite correctly.
- Palette: the game's dusk violets, warm golds and deep navy. Match the existing
  ruins.
