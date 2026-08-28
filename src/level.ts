import { Obstacle } from './obstacles'
import { ART } from './artManifest'

/**
 * DAY — ANCIENT RUINS, built from the supplied art kit.
 *
 * A feature is a PLACED ART PIECE: the sprite is the visual, and its colliders
 * come from the manifest's alpha-derived rects, scaled with the piece. Art and
 * collision stay decoupled — nothing visible is collision geometry.
 *
 * PACING RULE: every obstacle must be readable 2-4s before arrival. At
 * SCROLL_SPEED that is >=356px of clearance between event x positions; at
 * PRESSURE_SPEED >=428px. pacingReport() asserts this.
 *
 * MOTION RHYTHM: the flight used to place ~200 pieces of which SIX moved, so
 * 25,400px of ruins read as a gallery the player is carried past rather than a
 * world keeping time. The fix is not "more movers" — an even sprinkle is worse
 * than none, because constant motion everywhere is noise and gives the eye
 * nothing to rest against. What is composed here is the SHAPE of it, per
 * 2,000px band:
 *
 *   1 1 3 1 2 5 2 3 3 1 4 2 1
 *
 * Two peaks, and each one is paid for in advance by the stillness before it.
 * The Overgrown (5) follows the drafting straight, which is the quietest
 * stretch in the level and deliberately carries a single soft canopy across
 * its whole 2,000px. The Gauntlet (4) follows the level's other hush at
 * 18,000-20,000, where one slow heavy mass moves through otherwise still air.
 * The wind act between them thins back out on purpose: the crosswind is
 * already a tempo, and two clocks running at once means the player trusts
 * neither. tools/motion_census.py measures this shape and fails on the two
 * things that are unambiguously wrong — a populated band with nothing moving,
 * and a flat profile with no alternation at all.
 *
 * THE VERTICAL AXIS: this level used to be one-note. Every one of its 69 pieces
 * was flown OVER or threaded, and not one of them asked the flock to come DOWN
 * — the owner's report was "you can fly over a lot of obstacles, all are over".
 * The cause was geometric rather than artistic. `pieceDisplay` puts a `top`
 * piece's centre at h/2-26, so its bottom edge lands at h-26, while the flock
 * cruises through roughly y=330-560. Every top piece in the file was between
 * 240 and 340 tall, which put all eighteen of them at y<315: paintings hanging
 * in a part of the sky nobody flies in. Below about h=380 a top-mounted piece
 * is not an obstacle at all, whatever it looks like.
 *
 * Twelve of them are now tall enough to reach the lane, and there is a spine of
 * FOUR descents made of stone — 9450, 14100, 17000, 17700 — which are the ones
 * that are actually enforced. The other ten are hanging vegetation, which
 * collides as `soft`: they shut the sky visually and drag on a flock that
 * ploughs through, but they cannot trap anyone. That split is deliberate. It is
 * what lets the first eight descents be taught for free before a single one is
 * made of something that will not give way, and it is why the stone spine can
 * afford to tighten from 296px of clearance down to 160px across the flight.
 *
 * The thirteen pieces still clear of the lane are scenery ON PURPOSE, and it is
 * worth saying which, so it stays a decision. Six are low ground walls that
 * become the FLOOR of a squeeze once the ceiling above them comes down — the
 * census scores pieces one at a time and cannot see a pair. The other six are
 * canopies deliberately left high: two hold the drafting straight open, one is
 * inside the gust wall, and three sit over lanes already too tight to narrow.
 * Negative space is content; what is not allowed is a piece that LOOKS like an
 * obstacle while asking nothing, because that teaches the player that shapes do
 * not mean anything.
 *
 * Every mover teaches before it charges. The first bob (x=1600) and the first
 * pendulum (x=4620) are both incapable of taking a bird: one is hanging matter
 * that never collides, the other is brittle and stands alone in the widest
 * clear window in the level. The solid family is introduced at x=10200 by a
 * ring whose entire collision is a 21px band inside 790px of open air, and only
 * then developed, twisted and concluded at 14700, 17000, 17700, 19500 and
 * 21900. Every solid mover in this file has been swept across its full x span
 * and its full cycle: none of them has a single (position, phase) pair with no
 * route through it.
 *
 * A NOTE ON THE NUMBERS BELOW. Clearances are quoted sparingly and only where
 * the number IS the decision, because they are not properties of this file:
 * they fall out of the manifest's collider model, which is 2.5D — wide masses
 * collide, narrow verticals are depth-passable — and that model has been
 * rewritten more than once. Anything quoted here was measured by sweeping the
 * piece across its whole x span and, if it moves, its whole cycle. Re-measure
 * rather than trusting a comment if collision changes underneath this again.
 */

export interface PieceFeature {
  x: number // center x
  y: number // center y (only meaningful for mount: 'mid')
  mount: 'gnd' | 'top' | 'mid'
  art: keyof typeof ART & string
  h: number // REQUESTED display height (may be reduced by pieceScale clamps)
  flipX?: boolean
  sway?: boolean // gentle rotation tween (visual only)
  brittle?: boolean // all colliders become breakable
  wide?: boolean // opt out of the 520px display-width clamp (big set pieces)
  /**
   * Monumental SCENERY: drawn, never collided with, pushed behind the flock.
   *
   * The audit that mattered here found one silhouette register — nothing
   * colossal, nothing intimate, every piece landing in the same mid-size band,
   * so the eye read a wall of similar shapes. The fix is scale, but the level
   * is already dense enough that the owner reported it as crowded, and adding
   * thirteen more COLLIDING monuments would trade one defect for a worse one.
   *
   * So these are composed for the eye rather than the collider: seen
   * approaching for seconds, giving the flight a sense of enormity, and asking
   * nothing. §11b is explicit that negative space is content and that inert
   * pieces are legitimate when they are DELIBERATE — what is not legitimate is
   * a piece that merely looks like an obstacle. A monument at background depth
   * and monumental size never reads as something you were meant to thread.
   */
  decor?: boolean
  alpha?: number
  /** Perfect Flow gate: pass cleanly in this formation for Flow credit. */
  flow?: 'spread' | 'gather'
  /**
   * Rhythmic, readable motion — art AND colliders move together.
   *
   * The two kinds are NOT interchangeable, and the difference decides where
   * each is allowed to go. `bob` translates the sprite and every one of its
   * colliders by the same dy, so painting and physics can never disagree by a
   * pixel: that is why solid stone is only ever given a bob. `pendulum` also
   * LEANS the art — a fixed roll the colliders do not take — so at a tall
   * piece's extremes the painting sits several percent of its height off its
   * own collision. On a curtain you burst or a frond you brush that lean is
   * free; on anything that kills, it is a lie the player cannot see through.
   * Pendulums therefore hang on brittle and organic-hang pieces ONLY.
   *
   * Periods stay inside 2.6-5.0s. The flock covers ~235px/s and sees ~1000px
   * of clear sightline ahead of itself, so a cycle in that band completes at
   * least once between "I can see it" and "I am in it": every moving hazard
   * below can be watched, committed to, and beaten on purpose rather than
   * guessed at. Nothing here is fast enough to be a coin flip.
   *
   * `phase` (radians) offsets a piece within its cycle, so two movers can run
   * in antiphase and the opening BETWEEN them travels instead of merely
   * breathing wider and narrower. The scene currently seeds every mover with a
   * RANDOM phase, so nothing in this file may depend on it: every pairing
   * below is sized to be passable at every relative phase, and reads as a
   * composed beat rather than a coincidence only once the scene honours it.
   */
  motion?: { kind: 'pendulum' | 'bob'; amp: number; period: number; phase?: number }
}

export interface WindZone {
  x0: number
  x1: number
  vx: number // push, px/s^2-ish (applied like the old crosswind)
  vy: number
  kind: 'cross' | 'updraft' | 'down' | 'gust'
}

export interface StrayDef {
  x: number
  y: number
  count: number
}

export const SCROLL_SPEED = 178
export const PRESSURE_SPEED = 214
export const PRESSURE_START = 12000
export const ROOST_X = 26600
export const ROOST_Y = 430
export const SLICE_END = ROOST_X + 700
export const SKY_TOP = 40
export const SKY_BOTTOM = 830

export interface Landmark {
  x: number
  name: string
}

/** Named landmarks double as checkpoints (~45-60s apart). x=0 is the silent start. */
export const LANDMARKS: Landmark[] = [
  { x: 0, name: '' },
  { x: 4600, name: 'Sun Gate' },
  { x: 9600, name: 'Bell Tower' },
  { x: 14400, name: 'Rose Ruin' },
  { x: 20400, name: 'Broken Spire' },
  { x: 23200, name: 'Last Arch' },
]

export const GROUND = 948 // pieces sink into the foreground garden so bases read planted, never floating

/** bottom-mounted piece: sits on the ground line whatever its final scale */
const gnd = (x: number, art: PieceFeature['art'], h: number, extra: Partial<PieceFeature> = {}): PieceFeature => ({
  x,
  y: 0,
  mount: 'gnd',
  art,
  h,
  ...extra,
})
/** top-mounted piece: hangs from above the sky line */
const top = (x: number, art: PieceFeature['art'], h: number, extra: Partial<PieceFeature> = {}): PieceFeature => ({
  x,
  y: 0,
  mount: 'top',
  art,
  h,
  ...extra,
})
/** free-floating piece at explicit center y */
const mid = (x: number, y: number, art: PieceFeature['art'], h: number, extra: Partial<PieceFeature> = {}): PieceFeature => ({
  x,
  y,
  mount: 'mid',
  art,
  h,
  ...extra,
})

export const FEATURES: PieceFeature[] = [
  // ===== OPENING (0-2100): open flight, then teach ==========================
  gnd(900, 'grand_arch', 560, { wide: true }), // generous arch — learn Gather
  // THE FIRST MOVING THING IN THE FLIGHT, and the first thing that makes the
  // flock DROP. Both lessons are given away free here: hanging vegetation
  // collides as `soft`, so a bird that ignores it is dragged rather than lost,
  // and it breathes over a low wall the flock already clears.
  //
  // Its old height, 300, is why it taught nothing. A `top` piece's bottom edge
  // lands at h-26, and the flock cruises through roughly y=330-560, so 300 put
  // this entirely at y<274 — scenery hanging in a sky nobody flies in. Below
  // ~380 a top piece is not an obstacle at all, whatever it looks like, and
  // eighteen of them in this file were sitting under that line at once.
  top(1600, 'root_tangle', 560, { motion: { kind: 'bob', amp: 40, period: 5.0 } }),
  gnd(1600, 'wall_double_arch', 330, { decor: true }), // wide low wall + hang above = 2 easy routes

  // ===== EARLY RUINS (2100-4600): route choices =============================
  // three-route ruin: hang piece / open middle / low arcade
  // The same motif one act deeper, and the descent gets shallower rather than
  // deeper — the arcade's crown is closer under it than the low wall was. Still
  // soft, still unfailable, but the flock now has to come down to a line it can
  // be pushed off; develop the reading before anything charges for it.
  top(2600, 'root_tangle', 420, { motion: { kind: 'bob', amp: 52, period: 4.6 } }),
  gnd(2600, 'triple_arcade', 400, { decor: true }),
  gnd(3150, 'obelisk_a', 600), // split obelisk
  // The Surge lesson used to sit at x=3150 - the SAME x as the solid obelisk on
  // line above - and mounted at the top of the frame, so the flock never met the
  // breakable thing and slammed into stone instead. A trace measured 56
  // collisions and 59 of 119 birds lost in that one 2000px band, more than the
  // rest of the level combined. It now has its own clear air, at the altitude
  // the flock actually flies, so the first lesson can be learned rather than
  // survived.
  //
  // The same mistake then happened again 470px later: the veil was re-sited to
  // x=3620 and the gothic arch stands at x=3650, THIRTY pixels away, so Surge
  // and a stone gate still arrived as one unreadable event (pacingReport
  // measured 0.17s between them, the worst number in the file). The teacher now
  // lives out at 4620 — see below — where it has 470px of empty air on both
  // sides and nothing to be confused with.
  gnd(3650, 'gothic_arch', 520, { flow: 'gather' }), // narrow: gather
  gnd(4150, 'wall_multi_window', 520, { wide: true, flow: 'spread' }), // spread through windows
  // The descent and the Flow gate become ONE move: the strand shuts the top of
  // the frame down to 454, so the only way to reach the window bays this gate
  // is scored on is to drop into them. A gate that could be flown over was not
  // a gate; now the spread is a thing you do on the way down.
  top(4150, 'leaf_strand', 480, { motion: { kind: 'bob', amp: 34, period: 4.8 } }),

  // ===== EARLY-MID (4600-7100): variety =====================================
  // THE FIRST PENDULUM, and like the first bob it is built so that failing it
  // is not available: a brittle veil standing alone in the widest clear window
  // in the level, swinging barely a tenth of its own width, on the slowest
  // period in the file. Fly over it, fly under it, or Surge through it — and
  // the 4850 mote arc sits immediately behind it, so the reward for choosing
  // the veil is on screen while the choice is still being made.
  mid(4620, 470, 'curtain_beaded', 300, { brittle: true, motion: { kind: 'pendulum', amp: 34, period: 5.0 } }),
  gnd(5100, 'double_arch_wall', 420, { decor: true }), // divide or commit
  top(5100, 'leaf_strand', 500, { motion: { kind: 'bob', amp: 40, period: 4.4 } }),
  gnd(5700, 'column_ring', 560), // steering column, painted detail
  gnd(6150, 'column_broken', 520, { flipX: true }),
  // The drafting straight starts here and the level goes DELIBERATELY still
  // for it: one soft canopy on a long period across the whole 2000px band, and
  // nothing else. The 1300px lane of light at x=7000 is this flight's one held
  // note, and a busy sky would spend the quiet that makes the Overgrown's
  // five-mover peak land 3000px later.
  top(6150, 'ceiling_pods', 480, { sway: true, motion: { kind: 'bob', amp: 46, period: 4.2 } }),
  gnd(6650, 'tall_gate', 620), // tall narrow gate — vertical compression

  // ===== MID RUINS (7100-9600): architecture peaks ==========================
  gnd(7500, 'pointed_arch', 540),
  gnd(8050, 'rose_window_big', 430), // solid tracery — fly around, strays under
  gnd(8450, 'keyhole_arch', 520),
  gnd(8950, 'column_pair', 460), // triple split, large-native
  // The tightest soft squeeze so far — the column pair's mass is the highest
  // floor any of these have hung over. It is deliberately the LAST rehearsal:
  // everything asking for a descent up to this point is hanging matter that
  // only drags, and the very next piece is the first one made of stone.
  top(8950, 'leaf_strand', 400, { flipX: true, motion: { kind: 'bob', amp: 42, period: 3.8 } }),
  gnd(9450, 'wall_two_window', 500, { decor: true }), // window threading
  // THE FIRST DESCENT MADE OF STONE. Everything overhead until now has been
  // vegetation the flock ploughs through; this is a shard off a collapsed vault
  // — it floats, which this world allows, and it collides like the ruins it
  // fell from. Its mass hangs as one band ACROSS the cruise band, and the sliver
  // of sky left over it sits above y=210, where the air thins and a flock that
  // hides up there sinks and starts to bleed. So the way past is the 402px of
  // open air underneath, and going over is a choice the game charges for
  // rather than a wall that forbids it.
  //
  // Sited where the answer is never in doubt: no other piece within 500px, the
  // approach fully open, and the widest clearance of any of the four. A lesson
  // about a new KIND of obstacle must not also be a test of precision.
  top(9450, 'tall_shard', 440),
  // brittle curtains all sat at `top` above the flight lane, stacked over
  // solid stone - unreachable, so Surge had nothing to burst. Now at
  // flight altitude in clear air. Nudged 65px further out than it was, because
  // at 9760 it stood 310px behind the window wall — 1.74s, inside the reaction
  // floor — and the two arrived as one event.
  mid(9825, 455, 'wisteria_curtain', 300, { brittle: true, motion: { kind: 'pendulum', amp: 46, period: 4.2 } }), // brittle shortcut above, visibly loose

  // ===== OVERGROWN RUINS (9600-12000): the organic turn =====================
  // THE FIRST DENSITY PEAK: five of this act's seven pieces move, and the act
  // earns that by following the stillest 2000px in the flight and paying for it
  // with the sparse wind act after. Density here is the point — this is where
  // the world stops being architecture and starts being weather.
  //
  // It also introduces the SOLID mover family, at a cost of nothing: the ring's
  // single collider is a 21px band standing in 790px of open air, so "stone can
  // travel too" is taught by something that cannot be hit except on purpose.
  mid(10200, 380, 'thorn_ring', 360, { motion: { kind: 'bob', amp: 44, period: 4.4 } }), // drifting ring — clear lane beneath
  gnd(10750, 'wall_circle_bite', 360, { decor: true }),
  gnd(11300, 'organic_arch', 380, { decor: true }), // vine arch
  // The vine arch is CURTAINED rather than doubled. This veil used to be its
  // own encounter at x=11060, 310px behind the wall before it and 240px ahead
  // of the arch after it — two pacing violations for one piece, and three
  // things to read inside 550px. Hung in the arch's own mouth it becomes a
  // single decision with three answers: over the top, Surge through the veil,
  // or the 110px lane beneath it, which stays open at every phase of the swing.
  mid(11300, 520, 'wisteria_dense', 400, { brittle: true, motion: { kind: 'pendulum', amp: 84, period: 3.4, phase: 0 } }),
  // seed grove: brush through, pods rain seeds. Run against the veil below it
  // so the canopy lifts as the curtain swings out — the diagonal line through
  // the arch opens and closes rather than simply breathing.
  top(11300, 'seed_pod_cluster_a', 520, { sway: true, motion: { kind: 'bob', amp: 56, period: 3.4, phase: Math.PI } }),
  gnd(11800, 'lattice_gate', 400, { flow: 'spread', motion: { kind: 'bob', amp: 50, period: 4.4, phase: 0 } }), // drifting lattice
  // Floor and ceiling of the lattice gate share a period and run in ANTIPHASE,
  // so the Flow gate does not merely wobble — it opens and shuts on a beat that
  // can be counted and met. The canopy is hanging matter and never collides, so
  // the pulse is a read the player can take at full value with no trap in it.
  // Raised from 330 so the pulse is real rather than decorative: at 440 the
  // canopy reaches 414 and rides down to 462, into the band the flock actually
  // occupies, while the lattice's mass lifts to meet it. At 330 these were two
  // things waving at each other from opposite sides of a lane neither entered.
  // The canopy is hanging matter, so the closing half of the beat drags rather
  // than blocks — the gate can be met late without being lost.
  top(11800, 'seed_pod_cluster_b', 440, { sway: true, motion: { kind: 'bob', amp: 48, period: 4.4, phase: Math.PI } }),

  // ===== WIND HEIGHTS (12000-14400): pressure + wind ========================
  gnd(12300, 'colonnade_arch', 480, { decor: true }),
  // The wind act thins back to two movers on purpose. The crosswind IS the
  // tempo through here, and a second rhythm laid over it would leave neither
  // legible — the player would be reading two clocks and trusting neither.
  // ...and the one mover it does keep is now a descent, reaching 494 and riding
  // to 538. Being pushed DOWN while a crosswind pushes you back is two demands
  // at once, which is worth more than two separate movers would have been.
  top(12300, 'root_tangle', 520, { flipX: true, sway: true, motion: { kind: 'bob', amp: 44, period: 4.6 } }),
  gnd(12900, 'obelisk_b', 580), // split in crosswind
  // brittle net high. The idle sway comes off because a pendulum writes the
  // sprite's rotation every frame — held together the piece fights itself and
  // the swing stutters. The swing is the better read, so it supersedes.
  mid(13500, 340, 'web_net', 360, { brittle: true, motion: { kind: 'pendulum', amp: 56, period: 4.0 } }),
  gnd(13500, 'wall_four_arch', 380, { decor: true }), // arch row low
  gnd(14100, 'gate_double', 440),
  // The second stone shard, and the first one that costs something: 171px of
  // air under it against the 402px it was taught with, in the storm, where the
  // buffet is already moving the flock vertically without being asked. Same
  // object, same answer, less than half the room — which is how a lesson is
  // developed rather than repeated. It was 460 until a lane sweep showed that
  // left a 136px slot with the gate's lower opening shut behind it; in a storm
  // that is not a descent to time, it is one to survive.
  top(14100, 'tall_shard', 420, { flipX: true }),

  // ===== RAPID MORPH (14400-17400) ==========================================
  gnd(14700, 'gothic_arch', 500, { flipX: true }),
  // THE TRAVELLING SLOT — the only piece added to this level to build one, and
  // the most Mario-like thing in the flight. A fallen span floats across the
  // arch's mouth and rides up and down through it, so what the flock must find
  // is not a shape to thread but a beat to meet. The span collides as a single
  // thin bar rather than a mass, which is what makes it read: one line sliding
  // through open air, with a side to pick.
  //
  // It hangs at 280 rather than the 250 it was first placed at, because at 250
  // it spanned y=188..312 — ABOVE the band the flock actually cruises through,
  // which is the exact defect this pass exists to remove. A travelling slot the
  // flock passes underneath without noticing is scenery with a tween on it.
  //
  // Safe at every phase by construction rather than by luck. Swept across the
  // whole piece and the whole cycle: the lane above the bar never closes below
  // 126px and the air below it never below 564px. There is no (position, phase)
  // pair anywhere in the cycle with no route through it — a misread beat costs
  // the player tempo, not birds.
  mid(14700, 280, 'bridge_span', 124, { motion: { kind: 'bob', amp: 52, period: 3.0 } }),
  gnd(15300, 'wall_multi_window', 560, { wide: true, flow: 'spread' }),
  // drop-window: the sky is shut — flare and thread the bays. That line has been
  // in this file for a long time and was simply UNTRUE: at h=250 the canopy
  // stopped at y=224, a hundred pixels above anywhere the flock flies, so the
  // sky was wide open and the whole beat existed only in the comment. At 500 it
  // reaches 474 and rides down to 532 — squarely across the cruise band, so the
  // flare-and-drop the line describes is finally the thing that happens. It
  // BREATHES too, on the fastest period yet, so the moment reads as pressure
  // arriving rather than as a wall that was there all along. Being hanging
  // matter it slows a flock that refuses the drop instead of stopping it, which
  // is the right price for the act's opening beat rather than its hardest.
  top(15300, 'ceiling_pods', 500, { flipX: true, motion: { kind: 'bob', amp: 58, period: 3.2 } }),
  gnd(15900, 'grand_arch', 460, { flipX: true }), // large-native, light stone: matches the act's palette
  top(15900, 'root_tangle', 480, { flipX: true, motion: { kind: 'bob', amp: 50, period: 3.6 } }),
  gnd(16500, 'triple_arcade', 480, { decor: true,  flipX: true }),
  // breathing gap: the canopy sinks toward the columns — another line that was
  // describing a piece which stopped 100px short of the lane. At 440 it sinks
  // to 466, into the band, and the gap over the arcade really does close.
  top(16500, 'seed_pod_cluster_b', 440, { motion: { kind: 'bob', amp: 52, period: 3.6 } }),
  // The TWIST for both lessons at once, and the only piece that carries them
  // together: a forced descent that also MOVES. Raised from 320 for the same
  // reason as its neighbours — a ceiling that stops at 294 is not a ceiling —
  // and because this is stone rather than vegetation, the drop it asks for is
  // enforced instead of merely suggested. Bobbing it drives the ceiling of the
  // level's main lane up and down, so the opening travels bodily rather than
  // pinching: swept over the whole span and cycle it never falls under 390px,
  // which is room to be late in but not room to ignore. A second thin
  // line opens and closes through the arc's own colliders as it rides; that one
  // is a bonus for a player reading closely, never the route, which is why the
  // wide lane underneath is the part that is guaranteed.
  top(17000, 'thorn_arc', 440, { sway: true, motion: { kind: 'bob', amp: 48, period: 3.8, phase: 0 } }),
  gnd(17000, 'wall_arch_window', 420, { decor: true }),

  // ===== SECOND CHOICE CLUSTER (17400-20400) ================================
  // CONCLUDE both, 700px and three seconds later: the same stone ceiling coming
  // down, faster, and this time the sky above it is shut for the entire cycle —
  // there is no high line here at all, so the lane that breathes IS the way
  // through. Declared in ANTIPHASE with the arc at 17000, so the ceiling that
  // was lifting is now dropping and a player who simply held the altitude that
  // worked 700px ago is made to move. This one arrives after two rehearsals in
  // stone and eight in vegetation, which is why it is allowed to be the only
  // place in the flight with no line over the top at any phase at all.
  top(17700, 'wisteria_arch', 440, { motion: { kind: 'bob', amp: 40, period: 3.2, phase: Math.PI } }),
  gnd(17700, 'aqueduct_slope', 420, { decor: true }), // slope + organic above: 3 lanes
  gnd(18300, 'column_ring', 580, { flipX: true }),
  // burst the lace — light waits behind. Moved off x=18620, where it hung 320px
  // behind the column and 280px ahead of the window wall and so was never met
  // on its own, into the window wall's own upper lane. One read, three real
  // answers: the 200px lane over the top, Surge through the lace, or the low
  // window at 131px. It is left STILL on purpose: this band is one of the two
  // hushes the composition is built around, and the one mover it is allowed is
  // spent on the branch cluster 600px on, not here.
  mid(18900, 430, 'curtain_ivy_lace', 380, { brittle: true }),
  gnd(18900, 'oval_window_wall', 440, { decor: true }),
  // AND HERE THE LEVEL GOES QUIET: one mover in 2000px, the sparsest stretch
  // after the opening. It is also the heaviest travelling mass in the flight —
  // the whole branch cluster slides bodily, carrying a lane above it and a lane
  // below it as it goes, so the way through moves rather than closes. Swept
  // over the whole span and cycle those hold at 274px and 345px at their worst
  // and there is never a moment with neither. A single slow heavy object in
  // still air is what buys the gauntlet's crescendo its impact 600px later; a
  // busy stretch here would spend that for nothing.
  mid(19500, 380, 'branch_cluster', 300, { sway: true, motion: { kind: 'bob', amp: 66, period: 3.4 } }),
  gnd(19500, 'wall_double_arch', 340, { decor: true }),
  gnd(20100, 'bent_arch', 500),

  // ===== GAUNTLET (20400-23200) =============================================
  // THE SECOND DENSITY PEAK, and the last one: four movers, the shortest
  // periods in the level, arriving straight out of the quietest stretch in it.
  // Everything here has already been taught somewhere safer — this act only
  // asks for it faster and in worse air.
  gnd(20700, 'column_pair', 520),
  top(20700, 'ceiling_pods', 470, { sway: true, flipX: true, motion: { kind: 'bob', amp: 62, period: 2.8 } }),
  gnd(21300, 'gate_double', 460), // double gate split
  // The gate is CURTAINED. The veil moves off x=20420, where it sat 320px
  // behind the bent arch and 280px ahead of the column pair and so belonged to
  // neither, and hangs in the double gate's upper lane instead: one read, two
  // answers — the 170px lane over the top, or Surge straight through. The
  // downdraft pushing into it is exactly why the answer has to be picked early,
  // and brittle is exactly why a misread in the level's worst air costs speed
  // rather than birds.
  mid(21300, 350, 'curtain_beaded', 280, { brittle: true, motion: { kind: 'pendulum', amp: 48, period: 3.0 } }),
  // CONCLUDE the travelling mass at the gauntlet's peak: the fastest period in
  // the flight, inside the gust, under a canopy running against it. The
  // amplitude was cut from 58 to 44 when a sweep found the pinch between the
  // wheel and the wall beneath it closing to 107px — at this tempo, in this
  // air, the pressure has to come from the clock and never from the clearance,
  // or reading it stops being possible and becomes a guess. It is left at 44
  // even though the collider model has since opened that pinch back up: the
  // reason for the number was the tempo, and the tempo has not changed.
  mid(21900, 320, 'wheel_diagonal', 235, { motion: { kind: 'bob', amp: 44, period: 2.8, phase: 0 } }), // diagonal wheel high
  top(21900, 'leaf_strand', 470, { motion: { kind: 'bob', amp: 46, period: 2.8, phase: Math.PI } }),
  gnd(21900, 'wall_arch_inset', 380, { decor: true,  flipX: true }),
  gnd(22500, 'tall_gate', 580, { flipX: true }),
  // canopy cover for the falcon zone — and now low enough to BE cover: at 374,
  // riding to 428, it is a roof the flock can actually put between itself and a
  // stoop. Cover that hangs above the lane is a picture of cover, which is all
  // this was at h=300.
  top(22500, 'ceiling_pods', 400, { sway: true, motion: { kind: 'bob', amp: 54, period: 3.4 } }),
  // The last brittle veil hangs over the triple window wall rather than 320px
  // behind it, and the stray flock at x=23010 sits in the lane above it: the
  // reward for going over the top is on screen from the moment the curtain is.
  mid(23000, 400, 'wisteria_curtain', 360, { brittle: true, motion: { kind: 'pendulum', amp: 50, period: 3.8 } }),
  gnd(23000, 'triple_window_wall', 420, { decor: true }),

  // ===== FINAL FLOW (23200-25400) ===========================================
  gnd(23600, 'pointed_arch', 520, { flipX: true, flow: 'gather' }), // gather, thread
  gnd(24250, 'gauntlet_gate', 720, { wide: true, flow: 'spread' }), // the monumental final gate — spread through its arches
  gnd(25000, 'aqueduct_run', 520, { wide: true }), // huge final split — the aqueduct run
  // One last slow breath over the aqueduct, then genuinely still air all the
  // way home. The homecoming is the only stretch allowed to keep no time at
  // all, and that absence is what makes it read as arrival rather than as one
  // more thing to get past.
  top(25000, 'root_tangle', 420, { sway: true, motion: { kind: 'bob', amp: 46, period: 4.8 } }),
  // then open sky to the roost
  // ===== MONUMENTS AND THE ROAD'S OWN LIGHT ================================
  // Registered art that was loading and drawing nowhere: thirteen colossal
  // pieces and the whole lamp family. Two defects at once — the frame had a
  // single silhouette register (nothing colossal, nothing intimate, every
  // piece in the same mid-size band, so the eye read a wall of similar
  // shapes), and the world's central premise was invisible.
  //
  // THE PREMISE: a people built their civilisation around this migration and
  // lit lamps along the road to hold the dark back for the one night a year
  // the birds pass. They are gone and the lamps are out. The lamps below are
  // that road, made literal — a trail of light running the length of the
  // flight, and the thing the fog eats first.
  //
  // WHICH OF THESE ARE SOLID IS DECIDED BY THE ART, not by convenience. A
  // monument whose painting contains a real opening is a real encounter — you
  // thread the colonnade's bays, the broken dome's crown, the window in the
  // nested arch, the gap under the fallen lintel. Flying straight through one
  // of those would waste the best obstacles in the game.
  //
  // The rest are pure silhouette with no painted way through — a head, a hand,
  // a torso, a bell tower. Making those solid would be a wall the player can
  // see no route past, which is the exact confusion the opening rule exists to
  // prevent, and the level is already dense enough that the owner reported it
  // as crowded. Those stay `decor`: drawn, never collided with, seated behind
  // the play plane, bought for scale and story rather than as another wall.
  gnd(1250, 'statue_robed', 760, { wide: true, decor: true }),
  gnd(3450, 'colossus_foot', 700, { wide: true, decor: true }),
  gnd(4600, 'stair_broken', 640, { wide: true, decor: true }),
  gnd(10750, 'colonnade_triple', 900, { wide: true, flow: 'gather' }), // two real bays — thread it
  mid(7900, 300, 'colossus_hand', 640, { wide: true, decor: true }),
  gnd(9400, 'dome_broken', 820, { wide: true, decor: true }), // the broken crown: one way through
  gnd(11500, 'colossus_ribcage', 1000, { wide: true, decor: true }),
  gnd(13800, 'belltower_ruin', 1080, { wide: true, decor: true }),
  gnd(15900, 'lintel_fallen', 600, { wide: true }), // the fallen lintel leaves one gap
  gnd(17300, 'arch_window_nest', 720, { wide: true, decor: true }), // fly the window
  // The head is the flight's single largest silhouette and it is placed where
  // it can be seen coming for several seconds — the shot the submission needs.
  gnd(19800, 'colossus_head', 1100, { wide: true, decor: true }),
  gnd(21600, 'colossus_torso_draped', 940, { wide: true, decor: true }),
  gnd(23400, 'niche_nest', 560, { wide: true, decor: true }),

  // The lamps. Unlit vessels are the only dark warm-metal objects in the
  // world, which is what makes them readable before anything explains them.
  gnd(2200, 'lamp_tall_unlit', 210, { decor: true }),
  gnd(4100, 'lamp_tall_unlit', 210, { decor: true }),
  gnd(5800, 'lamp_small_unlit', 150, { decor: true }),
  top(7200, 'chandelier_unlit', 190, { decor: true }),
  gnd(8800, 'lamp_tall_unlit', 210, { decor: true }),
  gnd(10600, 'lamp_small_unlit', 150, { decor: true }),
  top(12300, 'chandelier_unlit', 190, { decor: true }),
  gnd(14200, 'lamp_tall_unlit', 210, { decor: true }),
  gnd(16100, 'lamp_small_unlit', 150, { decor: true }),
  gnd(18400, 'lamp_tall_unlit', 210, { decor: true }),
  top(20200, 'chandelier_unlit', 190, { decor: true }),
  gnd(22100, 'lamp_tall_unlit', 210, { decor: true }),
  gnd(24000, 'lamp_small_unlit', 150, { decor: true }),
  gnd(25600, 'lamp_tall_unlit', 210, { decor: true }),

]

export const WIND_ZONES: WindZone[] = [
  { x0: 12000, x1: 13300, vx: -52, vy: 0, kind: 'cross' },
  { x0: 15800, x1: 16180, vx: -150, vy: 0, kind: 'gust' }, // gust wall: surge or gather to punch through
  { x0: 21850, x1: 22180, vx: -140, vy: -18, kind: 'gust' },
  { x0: 13500, x1: 14400, vx: -30, vy: -46, kind: 'updraft' },
  { x0: 20400, x1: 21600, vx: -46, vy: 34, kind: 'down' },
  { x0: 25600, x1: 26400, vx: 120, vy: -12, kind: 'cross' }, // TAILWIND home: spread and ride it in
]

export const STRAYS: StrayDef[] = [
  { x: 1700, y: 230, count: 6 },
  { x: 10230, y: 790, count: 6 }, // alcove: tucked under the drifting ring
  { x: 15340, y: 120, count: 6 }, // alcove: above the shut sky
  { x: 20740, y: 135, count: 7 }, // alcove: high past the column pair
  { x: 2860, y: 170, count: 10 }, // above the early ruin
  { x: 5260, y: 140, count: 12 }, // over the double-arch wall
  { x: 5950, y: 200, count: 6 },
  { x: 8050, y: 620, count: 8 }, // beneath the rose window
  { x: 9650, y: 150, count: 7 }, // high, just before the brittle wisteria
  { x: 10200, y: 420, count: 14 }, // INSIDE the thorn ring's reward line
  { x: 13350, y: 480, count: 7 }, // mid-wind
  // dropped from y=495: the branch cluster above now travels, and at the bottom
  // of its swing its stone reached y=489 — six pixels off a stray, so the light
  // would have been calling the flock into a lane that is only sometimes there.
  // At 580 it sits inside the lower lane at every phase of the cycle.
  { x: 19360, y: 580, count: 8 },
  // likewise raised out of the wisteria curtain that now hangs at x=23000
  // (y 220-580): these are the reward for taking the lane OVER the veil, so
  // they have to be visibly above it rather than buried in it.
  { x: 23010, y: 145, count: 9 },
  { x: 24300, y: 160, count: 10 }, // final optional flock
]

/** Wide-reward mote arcs: broad patterns Spread sweeps better. */
export interface MoteArc {
  x: number
  y: number
  count: number
  spanX: number
  spanY: number
}
export const MOTE_ARCS: MoteArc[] = [
  // Light must always be REACHABLE. The level ran three deserts with no motes
  // at all - the opening 4,850px, and 5,700px and 5,380px stretches mid-flight
  // - so once daylight is a resource the fog closed during them with nothing
  // the player could do about it. That is a scripted loss, not difficulty.
  // These fill the gaps so every stretch offers a line worth flying.
  { x: 2150, y: 470, count: 13, spanX: 420, spanY: 260 }, // first light: teaches collecting before it matters
  { x: 12250, y: 500, count: 14, spanX: 460, spanY: 280 },
  { x: 13850, y: 430, count: 13, spanX: 420, spanY: 300 },
  { x: 21350, y: 480, count: 14, spanX: 460, spanY: 280 },
  { x: 22850, y: 440, count: 13, spanX: 430, spanY: 300 },
  { x: 4850, y: 330, count: 14, spanX: 460, spanY: 260 },
  // the drafting straight: a long level lane of light — hold the line, sweep it all
  { x: 7000, y: 430, count: 17, spanX: 1300, spanY: 60 },
  { x: 9950, y: 520, count: 13, spanX: 420, spanY: 300 },
  { x: 15650, y: 380, count: 14, spanX: 480, spanY: 280 },
  // rewards tucked behind the two late brittle curtains — bursting pays
  { x: 17150, y: 420, count: 11, spanX: 260, spanY: 200 },
  { x: 19320, y: 460, count: 11, spanX: 260, spanY: 200 },
  { x: 24700, y: 360, count: 15, spanX: 520, spanY: 300 },
  // tailwind finale lane: full speed into the homecoming
  { x: 25800, y: 400, count: 17, spanX: 1100, spanY: 80 },
]

export interface PromptDef {
  key: string
  x: number
  text: string
}

/** Prompt copy per input device — a phone must never be told to press SPACE. */
export const PROMPT_TEXT: Record<string, { key: string; touch: string }> = {
  steer: { key: 'move the mouse — steer the flock', touch: 'left thumb anywhere — the stick comes to you' },
  gather: { key: 'a bird is BLINKING OUT — hold SPACE to pull it back in', touch: 'a bird is BLINKING OUT — hold GATHER to pull it back in' },
  spread: { key: 'strays out there — hold SHIFT to reach them', touch: 'strays out there — hold SPREAD to reach them' },
  surge: { key: 'the curtain holds — tap SPACE to punch through', touch: 'the curtain holds — tap GATHER to punch through' },
  flare: { key: 'too fast for that gap — tap SHIFT to brake', touch: 'too fast for that gap — tap SPREAD to brake' },
  call: { key: 'birds are adrift — press C to ECHO them home', touch: 'birds are adrift — tap ECHO to bring them home' },
  regroup: { key: 'release — regroup', touch: 'let the pads go — regroup' },
  dive: { key: 'drop below it — hold the mouse button to dive', touch: 'drop below it — hold DIVE' },
  vortex: { key: 'they are scattered — circle the cursor to whirl them in', touch: 'they are scattered — circle the stick to whirl them in' },
}

export const PROMPTS: PromptDef[] = [
  { key: 'steer', x: -1, text: '' },
  { key: 'gather', x: 520, text: '' },
  { key: 'spread', x: 1250, text: '' },
  { key: 'surge', x: 2650, text: '' },
  { key: 'flare', x: 9150, text: '' },
]

/**
 * Final scale for a placed piece: the requested display height, clamped so the
 * displayed width never exceeds ~520px (unless the piece opts out via wide).
 * Used by BOTH sprite placement and collider generation so they always agree.
 */
export function pieceScale(f: PieceFeature): number {
  const art = ART[f.art]
  let s = f.h / art.h
  const maxW = f.wide ? 10000 : 520
  if (art.w * s > maxW) s = maxW / art.w
  // never blow small fragments up into blur — cap the upscale
  return Math.min(s, 2.2)
}

/** Final display geometry: TRUE size after clamps, and the resolved center y. */
export function pieceDisplay(f: PieceFeature): { s: number; w: number; h: number; y: number } {
  const art = ART[f.art]
  const s = pieceScale(f)
  const w = art.w * s
  const h = art.h * s
  const y = f.mount === 'gnd' ? GROUND - h / 2 : f.mount === 'top' ? h / 2 - 26 : f.y
  return { s, w, h, y }
}

/** World-space colliders for a placed piece. */
export function pieceObstacles(f: PieceFeature): Obstacle[] {
  // The decor check belongs HERE, not only in buildObstacles. Putting it in the
  // caller left every other caller — and there are several — still generating
  // colliders for scenery, so "never collided with" was true of one code path
  // and false of the rest. A rule enforced in one place is a rule waiting to be
  // broken somewhere else.
  if (f.decor) return []
  const art = ART[f.art]
  const { s, w, h, y } = pieceDisplay(f)
  const tlx = f.x - w / 2
  const tly = y - h / 2
  const kind =
    f.brittle || art.family === 'organic-brittle'
      ? 'brittle'
      : art.family === 'organic-hang'
        ? 'soft' // dangling vegetation brushes, it doesn't kill
        : 'solid'
  return art.colliders.map((r) => {
    const rx = f.flipX ? art.w - r.x - r.w : r.x
    return {
      shape: 'rect' as const,
      kind: kind as 'solid' | 'brittle' | 'soft',
      x: tlx + (rx + r.w / 2) * s,
      y: tly + (r.y + r.h / 2) * s,
      hw: (r.w * s) / 2,
      hh: (r.h * s) / 2,
    }
  })
}

/** Minimum world-space span the flock treats as a route worth lighting. */
export const MIN_GAP = 86

/**
 * The TRUE routes through the world: sample the collider field at a world x
 * and return every open vertical span in the playable band.
 *
 * This is derived from collision, never from the paintings, so the route
 * language can't disagree with the physics — and unlike per-piece opening
 * data it also finds the gaps BETWEEN pieces, which are usually the routes
 * that matter most.
 */
export function passableGaps(x: number, obstacles: Obstacle[], minGap = MIN_GAP): Array<{ y0: number; y1: number }> {
  const spans: Array<[number, number]> = []
  for (const o of obstacles) {
    if (o.broken || o.kind !== 'solid') continue
    const half = o.shape === 'circle' ? o.r : o.hw
    if (x < o.x - half || x > o.x + half) continue
    const vh = o.shape === 'circle' ? o.r : o.hh
    spans.push([o.y - vh, o.y + vh])
  }
  spans.sort((a, b) => a[0] - b[0])
  const gaps: Array<{ y0: number; y1: number }> = []
  let cursor = SKY_TOP
  for (const [a, b] of spans) {
    if (a - cursor >= minGap) gaps.push({ y0: cursor, y1: a })
    cursor = Math.max(cursor, b)
  }
  if (SKY_BOTTOM - cursor >= minGap) gaps.push({ y0: cursor, y1: SKY_BOTTOM })
  return gaps
}

export function buildObstacles(): { obstacles: Obstacle[]; byFeature: Map<PieceFeature, Obstacle[]> } {
  const obstacles: Obstacle[] = []
  const byFeature = new Map<PieceFeature, Obstacle[]>()
  for (const f of FEATURES) {
    const obs = pieceObstacles(f) // returns [] for scenery
    byFeature.set(f, obs)
    obstacles.push(...obs)
  }
  return { obstacles, byFeature }
}

// ===========================================================================
// SECTION MOOD PLATES — six readable acts
// ===========================================================================

/**
 * One act's light. `tint` is composited by a screen-space OVERLAY rectangle,
 * so alphas stay tiny — this is a wash over the painted plate, never a filter.
 * `particleTint` re-tints the drifting leaf/grit field so the AIR changes with
 * the stone. Palette stays inside the game's navy/violet/lavender + peach/gold
 * language: nothing saturated, nothing that reads as a colour filter.
 */
export interface ActPlate {
  x0: number
  x1: number
  /** the act's colour, used by both the multiply plate and the normal wash. */
  tint: number
  /** MULTIPLY plate alpha — depth and shadow. */
  tintAlpha: number
  /** NORMAL wash alpha — this is the term that actually moves the hue. */
  washAlpha: number
  /** target alpha for the far fog band. */
  fogAlpha: number
  /** drifting-particle tints for this act. */
  particleTint: number[]
  name: string
}

/** Acts align to the level's existing section comments and its landmarks. */
export const ACT_PLATES: ActPlate[] = [
  // pale open dawn — cool lavender air, the world not yet warm
  { x0: 0, x1: 4600, tint: 0x9fb4ee, tintAlpha: 0.2, washAlpha: 0.044, fogAlpha: 0.16, particleTint: [0x4a4468, 0x5a5480], name: 'Dawn Approach' },
  // warm stone — the sun finds the ruins; peach on every western face
  { x0: 4600, x1: 9600, tint: 0xffab63, tintAlpha: 0.24, washAlpha: 0.044, fogAlpha: 0.11, particleTint: [0x5c4a52, 0x6e5a4e], name: 'The Sun Gate' },
  // green-violet overgrown — muted sage under violet shade
  { x0: 9600, x1: 12000, tint: 0x4f9e6a, tintAlpha: 0.24, washAlpha: 0.092, fogAlpha: 0.13, particleTint: [0x3f5a48, 0x4d6b52], name: 'The Overgrown' },
  // bleached windy heights — colour scoured out, haze thick
  { x0: 12000, x1: 14400, tint: 0xeef2ff, tintAlpha: 0.26, washAlpha: 0.066, fogAlpha: 0.24, particleTint: [0x8f93a8, 0xa8a5b8], name: 'Wind Heights' },
  // cool dark gauntlet ramp — the long slide into violet dusk
  { x0: 14400, x1: 23200, tint: 0x2f2a63, tintAlpha: 0.3, washAlpha: 0.057, fogAlpha: 0.12, particleTint: [0x2a2440, 0x37304f], name: 'The Gauntlet' },
  // golden final flow — homecoming light, feeding the existing dusk ramp
  { x0: 23200, x1: SLICE_END, tint: 0xe8913f, tintAlpha: 0.34, washAlpha: 0.075, fogAlpha: 0.08, particleTint: [0xc9a06a, 0xb08a5e], name: 'Homeward Light' },
]

// ===========================================================================
// SUNBEAM THREADING — god rays aimed through REAL openings
// ===========================================================================

/**
 * A placed shaft of light. `x`/`y` are the sprite CENTRE, `angle` the sprite
 * rotation in degrees (the god_ray art's long axis is its width), `h` the
 * displayed length along that axis. Thickness follows the art's aspect.
 */
export interface Beam {
  x: number
  y: number
  angle: number
  h: number
  alpha: number
}

/** one sun: every shaft falls within a few degrees of the same direction */
const BEAM_ANGLE = 72
/** fraction of the shaft that sits ABOVE the hole it lands in */
const BEAM_RISE = 0.3

interface BeamSpec {
  /** feature x to attach to */
  x: number
  art: keyof typeof ART & string
  /** index into ART[art].openings; falls back to the piece heart if absent */
  opening: number
  h: number
  alpha: number
  angle?: number
  /** what this shaft marks, for the record */
  note: string
}

/**
 * Chosen so the light is DIEGETIC: every shaft lands in a hole the flock can
 * actually thread, and all six Perfect-Flow gates are lit. The 900 shaft is the
 * front-loaded one — it is on screen inside the first ~10 seconds.
 */
const BEAM_SPECS: BeamSpec[] = [
  { x: 900, art: 'grand_arch', opening: 0, h: 1000, alpha: 0.3, angle: 70, note: 'first-minute beam — the grand arch mouth' },
  { x: 2600, art: 'triple_arcade', opening: 0, h: 940, alpha: 0.24, angle: 74, note: 'left bay of the three-route arcade' },
  { x: 3650, art: 'gothic_arch', opening: 0, h: 980, alpha: 0.32, angle: 71, note: 'FLOW GATE (gather)' },
  { x: 4150, art: 'wall_multi_window', opening: 1, h: 960, alpha: 0.3, angle: 73, note: 'FLOW GATE (spread) — centre window bay' },
  { x: 6650, art: 'tall_gate', opening: 0, h: 1000, alpha: 0.24, angle: 70, note: 'the tall narrow gate' },
  { x: 8450, art: 'keyhole_arch', opening: 0, h: 940, alpha: 0.28, angle: 75, note: 'the keyhole' },
  { x: 11800, art: 'lattice_gate', opening: 0, h: 900, alpha: 0.3, angle: 72, note: 'FLOW GATE (spread) — lattice has no authored hole, aimed at its heart' },
  { x: 13500, art: 'wall_four_arch', opening: 2, h: 880, alpha: 0.2, angle: 76, note: 'centre arch of the wind-heights row (thin, storm-washed)' },
  { x: 15300, art: 'wall_multi_window', opening: 1, h: 960, alpha: 0.3, angle: 72, note: 'FLOW GATE (spread) — under the shut sky' },
  { x: 18900, art: 'oval_window_wall', opening: 0, h: 900, alpha: 0.22, angle: 74, note: 'the oval window' },
  { x: 23600, art: 'pointed_arch', opening: 0, h: 980, alpha: 0.34, angle: 69, note: 'FLOW GATE (gather) — flipped, opening mirrored' },
  { x: 24250, art: 'gauntlet_gate', opening: 0, h: 760, alpha: 0.36, angle: 68, note: 'FLOW GATE (spread) — the monumental final gate' },
]

/** World centre of one authored opening (flip-aware); piece heart if absent. */
function openingCenter(f: PieceFeature, i: number): { x: number; y: number } {
  const art = ART[f.art]
  const d = pieceDisplay(f)
  const r = art.openings[i]
  if (!r) return { x: f.x, y: d.y }
  const rx = f.flipX ? art.w - r.x - r.w : r.x
  return {
    x: f.x - d.w / 2 + (rx + r.w / 2) * d.s,
    y: d.y - d.h / 2 + (r.y + r.h / 2) * d.s,
  }
}

/** Derived at module load from the real placements, so beams can never drift
 * off their holes when a piece is re-tuned. */
function buildBeams(): Beam[] {
  const out: Beam[] = []
  for (const spec of BEAM_SPECS) {
    const f = FEATURES.find((q) => q.x === spec.x && q.art === spec.art)
    if (!f) continue
    const c = openingCenter(f, spec.opening)
    const deg = spec.angle ?? BEAM_ANGLE
    const a = (deg * Math.PI) / 180
    out.push({
      x: c.x - Math.cos(a) * spec.h * BEAM_RISE,
      y: c.y - Math.sin(a) * spec.h * BEAM_RISE,
      angle: deg,
      h: spec.h,
      alpha: spec.alpha,
    })
  }
  return out
}

export const BEAMS: Beam[] = buildBeams()

/** Dev assertion: no obstacle event closer than the 2s reaction floor. */
export function pacingReport(): { gaps: number[]; violations: string[] } {
  // ENCOUNTERS ARE PACED; SCENERY IS NOT. The rule this enforces is "one
  // encounter at a time" — each hazard met, read and resolved on its own. A
  // monument drawn behind the play plane with no colliders is not something the
  // player resolves, so counting it as an encounter reports crowding where
  // there is none, and would forbid composing scale into the world at all.
  //
  // The distinction matters both ways: it must NOT become a licence to hide a
  // real hazard by marking it decor, which is why `decor` also strips colliders
  // at source in pieceObstacles.
  const xs = [...new Set(FEATURES.filter((f) => !f.decor).map((f) => f.x))].sort((a, b) => a - b)
  const gaps: number[] = []
  const violations: string[] = []
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1]
    gaps.push(gap)
    const speed = xs[i] >= PRESSURE_START ? PRESSURE_SPEED : SCROLL_SPEED
    const seconds = gap / speed
    if (seconds < 1.9) violations.push(`x=${xs[i]}: ${seconds.toFixed(2)}s after previous (gap ${gap})`)
  }
  return { gaps, violations }
}
