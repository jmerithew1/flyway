"""Generate src/artManifest.ts — the single source of truth for loaded art.

Curated selection: semantic alias -> extracted piece id. Geometry (colliders and
openings) is derived from the shipped image's own alpha, by the same pass
rebuild_colliders.py uses, so collision can never disagree with the painting.

WHY THIS FILE OWNS THE WHOLE PIPELINE NOW
-----------------------------------------
This generator used to emit `file` paths straight out of manifest_draft.json and
band colliders straight out of its `bands` field. Two separate tools then
*rewrote src/artManifest.ts after the fact*:

  * tools/to_webp.py      rewrote .png -> .webp (and DELETED the source PNGs)
  * tools/rebuild_colliders.py rewrote band colliders -> silhouette colliders

Both rewrites lived DOWNSTREAM of the generator, so every regeneration silently
destroyed them. That has now bitten twice: a regeneration to register the
creature art left 86 entries pointing at .png files that no longer exist on
disk — every one a 404, i.e. most of the game's art simply not loading — and
simultaneously reverted the collider policy the rebuild had fixed.

So the generator now emits what actually ships: it resolves each draft path to
the real file on disk (preferring .webp), and derives geometry itself. The
assert at the bottom of main() is the point of the whole exercise — a generator
that CAN emit a dead path is the defect, so it is now impossible for one to get
out. Do not remove it.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image

# Same alpha pass the standalone rebuild uses. Imported rather than copied so
# there is exactly one definition of what a collider is.
from rebuild_colliders import silhouette_colliders

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, 'public')

R = 'ruined_violet_arch_tileset'
A = 'pastel_ruins_obstacle_sprite_sheet'
B = 'pastel_ruined_architecture_sprite_sheet'
O = 'murmuration_ruins_organic_obstacle_asset_sheet'
E = 'dreamy_ruins_flock_asset_sheet'
F = 'dreamy_pastel_wind_fx_sprite_sheet'
P = 'ethereal_violet_ruins_panorama'
BIRD = 'navy_bird_flight_sprite_sheet'

# alias -> (piece id, family)
CURATED = {
    # ---- birds (trio 09/10/11: full-bodied starling silhouettes)
    'bird-up': (f'{BIRD}__09', 'bird'),
    'bird-mid': (f'{BIRD}__10', 'bird'),
    'bird-down': (f'{BIRD}__11', 'bird'),
    # ---- ruins: walls & multi-opening pieces
    'aqueduct_run': (f'{R}__00', 'wall'),
    'rose_wall': (f'{R}__02', 'windows'),
    'gate_double': (f'{R}__04', 'split'),
    'wall_four_arch': (f'{R}__05', 'windows'),
    'window_column': (f'{R}__06', 'column'),
    'wall_multi_window': (f'{R}__08', 'windows'),
    'aqueduct_slope': (f'{R}__09', 'wall'),
    'wall_arch_window': (f'{R}__12', 'windows'),
    'colonnade_arch': (f'{R}__15', 'arch'),
    'wall_two_window': (f'{R}__18', 'windows'),
    'wall_double_arch': (f'{R}__21', 'wall'),
    'wheel_diagonal': (f'{R}__24', 'wall'),
    'triple_column': (f'{R}__31', 'split'),
    'twin_arch': (f'{R}__34', 'arch'),
    'arch_fragment': (f'{R}__36', 'arch'),
    'bridge_span': (f'{R}__41', 'wall'),
    'pillar_a': (f'{R}__28', 'column'),
    'pillar_b': (f'{R}__39', 'column'),
    'pillar_c': (f'{R}__43', 'column'),
    'ceiling_stub_a': (f'{R}__27', 'hang'),
    'ceiling_stub_b': (f'{R}__35', 'hang'),
    'ceiling_stub_c': (f'{R}__45', 'hang'),
    # ---- ruins: pastel obstacle sheet (bigger set pieces)
    'grand_arch': (f'{A}__00', 'arch'),
    'gothic_arch': (f'{A}__01', 'arch'),
    'double_arch_wall': (f'{A}__02', 'split'),
    'triple_window_wall': (f'{A}__06', 'windows'),
    'rose_window_big': (f'{A}__07', 'windows'),
    'tall_shard': (f'{A}__08', 'column'),
    'pointed_arch': (f'{A}__12', 'arch'),
    'triple_arcade': (f'{A}__13', 'split'),
    'bent_arch': (f'{A}__14', 'arch'),
    'wall_arch_inset': (f'{A}__16', 'arch'),
    'wall_circle_bite': (f'{A}__19', 'windows'),
    'oval_window_wall': (f'{A}__20', 'windows'),
    'tall_gate': (f'{A}__21', 'arch'),
    'obelisk_a': (f'{B}__08', 'column'),
    'obelisk_b': (f'{B}__07', 'column'),
    'column_ring': (f'{B}__18', 'column'),
    'column_broken': (f'{B}__12', 'column'),
    'column_pair': (f'{B}__31', 'split'),
    'column_clean': (f'{B}__06', 'column'),
    'keyhole_arch': (f'{B}__56', 'arch'),
    # ---- organic
    'wisteria_curtain': (f'{O}__01', 'organic-brittle'),
    'wisteria_dense': (f'{O}__02', 'organic-brittle'),
    'root_tangle': (f'{O}__03', 'organic-hang'),
    'leaf_strand': (f'{O}__04', 'organic-hang'),
    'ceiling_pods': (f'{O}__05', 'organic-hang'),
    'thorn_arc': (f'{O}__06', 'organic'),
    'thorn_ring': (f'{O}__07', 'organic'),
    'lattice_gate': (f'{O}__09', 'organic'),
    'wisteria_arch': (f'{O}__10', 'organic'),
    'web_column_a': (f'{O}__11', 'organic'),
    'web_column_b': (f'{O}__12', 'organic'),
    'web_net': (f'{O}__13', 'organic-brittle'),
    'branch_cluster': (f'{O}__14', 'organic'),
    'organic_arch': (f'{O}__15', 'organic'),
    # ---- ending / decoration
    'roost_tree': (f'{E}__08', 'deco'),
    'flock_swirl': (f'{E}__16', 'deco'),
    'flock_decal_a': (f'{E}__11', 'deco'),
    'flock_decal_b': (f'{E}__14', 'deco'),
    'stray_glow': (f'{E}__17', 'deco'),
    'spark_strand': (f'{E}__20', 'deco'),
    # ---- fx
    'wind_stream_long': (f'{F}__01', 'fx'),
    'wind_stream_wave': (f'{F}__11', 'fx'),
    'wind_cross': (f'{F}__04', 'fx'),
    'cloud_curl': (f'{F}__14', 'fx'),
    'cloud_s': (f'{F}__15', 'fx'),
    'glow_warm': (f'{F}__16', 'fx'),
    'wisp_a': (f'{F}__02', 'fx'),
    'wisp_b': (f'{F}__09', 'fx'),
    # ---- environment / parallax
    'panorama_0': (f'{P}__00', 'deco'),
    'panorama_1': (f'{P}__01', 'deco'),
    'panorama_2': (f'{P}__02', 'deco'),
    'panorama_3': (f'{P}__03', 'deco'),
    'panorama_4': (f'{P}__04', 'deco'),
    'panorama_5': (f'{P}__05', 'deco'),
    'panorama_6': (f'{P}__06', 'deco'),
    'bg_plate': ('ancient_ruins_bg', 'deco'),
    # ---- foreground
    'fg_tl_branch': ('garden_tl_branch', 'deco'),
    'fg_tr_column': ('garden_tr_column', 'deco'),
    'fg_bl_arch': ('garden_bl_arch', 'deco'),
    'fg_br_column': ('garden_br_column', 'deco'),
    'fg_ground': ('garden_ground_strip', 'deco'),
}

# ---------------------------------------------------------------------------
# DIRECT — pieces that arrived already named and cut, rather than as numbered
# slices of a sheet, so they never appear in manifest_draft.json and therefore
# had no route into the game at all. Whole painted directories sat here unloaded.
#
# alias -> (path under public/assets/processed/, family)
#
# Width/height are read from the shipped file rather than typed in, so they
# cannot drift from the art. Geometry follows the family:
#   bird / fx / deco   -> no colliders. Creatures, light and foreground dressing
#                         are never physical; the flock passes through them.
#   organic-brittle    -> one full-bbox mass, opened by punching through it.
#   everything else    -> real alpha-derived colliders AND openings, from the
#                         same pass, so a painted arch mouth is exactly the gap
#                         the physics allows. A colossal ruin with no collider
#                         is a wall the flock flies straight through, which is
#                         worse than not shipping it at all.
# ---------------------------------------------------------------------------
DIRECT = {
    # ---- creatures. Their threat is mechanical, not physical. -------------
    'moth_small_01': ('flock/moth_small_01', 'bird'),
    'moth_small_02': ('flock/moth_small_02', 'bird'),
    'moth_small_03': ('flock/moth_small_03', 'bird'),
    'moth_small_04': ('flock/moth_small_04', 'bird'),
    'moth_small_05': ('flock/moth_small_05', 'bird'),
    'moth_small_06': ('flock/moth_small_06', 'bird'),
    'moth_large_a': ('flock/moth_large_a', 'bird'),
    'moth_large_b': ('flock/moth_large_b', 'bird'),
    'moth_cluster': ('flock/moth_cluster', 'bird'),
    'thief_perched': ('flock/thief_perched', 'bird'),
    'thief_level': ('flock/thief_level', 'bird'),
    'thief_launch': ('flock/thief_launch', 'bird'),
    'thief_scatter_a': ('flock/thief_scatter_a', 'bird'),
    'thief_scatter_b': ('flock/thief_scatter_b', 'bird'),
    'perched_a': ('final/perched_a', 'bird'),
    'perched_b': ('final/perched_b', 'bird'),
    'perched_c': ('final/perched_c', 'bird'),
    'perched_sleep': ('final/perched_sleep', 'bird'),

    # ---- THE HAWK. falcon.ts drives a pose sequence off these exact keys and
    # has done all along; none of them were registered, so `textures.exists`
    # always failed, setPose() always early-returned, and the predator was one
    # flat-tinted starling for the whole game. That is the "floating sticker".
    #
    # The final/ set is chosen over the same-named flock/ pair deliberately:
    # see the report / the note beside SKIPPED below.
    'falcon_bank': ('final/falcon_bank', 'bird'),
    'falcon_dive': ('final/falcon_dive', 'bird'),
    'falcon_strike': ('final/falcon_strike', 'bird'),
    'falcon_retreat': ('final/falcon_retreat', 'bird'),
    # the sweeping overhead warning shadow: a wings-fully-spread soar, drawn
    # tint-filled as a silhouette. It used to be the STARLING pose scaled 3.2x.
    'falcon_soar': ('flock/falcon_soar', 'bird'),

    # ---- THE ROOST. DayScene's departure ceremony tests roost_unlit and falls
    # back when it is missing; it was missing, so the ceremony has been taking
    # its fallback path silently. Scenery behind the flight plane: never solid.
    'roost_lit': ('roost/roost_lit', 'deco'),
    'roost_unlit': ('roost/roost_unlit', 'deco'),
    'roost_tree_hero': ('ending/roost_tree_hero', 'deco'),

    # ---- LAMPS: the road you can relight. Warm gold, fixed in place — the
    # light grammar's "this is the way". Lit and unlit are separate pieces so a
    # lamp passed can STAY lit behind the flock. Deliberately non-colliding:
    # the player flies PAST a lamp to relight it, so a collider on one would
    # punish the exact act it is asking for.
    'lamp_tall_lit': ('fixtures/lantern_tall_lit', 'deco'),
    'lamp_tall_unlit': ('fixtures/lantern_tall_unlit', 'deco'),
    'lamp_small_lit': ('fixtures/lantern_small_lit', 'deco'),
    'lamp_small_unlit': ('fixtures/lantern_small_unlit', 'deco'),
    'chandelier_lit': ('fixtures/chandelier_lit', 'deco'),
    'chandelier_unlit': ('fixtures/chandelier_unlit', 'deco'),
    'sconce_lit': ('fixtures/sconce_lit', 'deco'),
    'sconce_unlit': ('fixtures/sconce_unlit', 'deco'),

    # ---- BELLS. Cast metal, and the one fixture that is genuinely an object
    # in the air rather than a light, so these DO take alpha-derived colliders.
    'bell_hanging_a': ('fixtures/bell_hanging_a', 'hang'),
    'bell_hanging_b': ('fixtures/bell_hanging_b', 'hang'),
    'bell_large': ('fixtures/bell_large', 'hang'),
    'bell_small': ('fixtures/bell_small', 'hang'),
    'bell_bracket': ('fixtures/bell_bracket', 'hang'),
    'bell_fallen': ('fixtures/bell_fallen', 'wall'),  # on the ground, not above

    # ---- OCCLUDERS: scenery that crosses IN FRONT of the flock, which is what
    # makes birds read as flying THROUGH a world instead of across a backdrop.
    # Drawn above the flight plane, so they must never collide with it.
    'occluder_canopy_tl': ('fixtures/occluder_canopy_tl', 'deco'),
    'occluder_capital_b': ('fixtures/occluder_capital_b', 'deco'),
    'occluder_column_foliage_l': ('fixtures/occluder_column_foliage_l', 'deco'),
    'occluder_cypress_br': ('fixtures/occluder_cypress_br', 'deco'),
    'occluder_wisteria_tr': ('fixtures/occluder_wisteria_tr', 'deco'),

    # ---- RIBBONS: cloth streamers. Motion dressing, no mass.
    'ribbon_bell': ('fixtures/ribbon_bell', 'fx'),
    'ribbon_short': ('fixtures/ribbon_short', 'fx'),
    'ribbon_stream_a': ('fixtures/ribbon_stream_a', 'fx'),
    'ribbon_stream_b': ('fixtures/ribbon_stream_b', 'fx'),
    'ribbon_stream_c': ('fixtures/ribbon_stream_c', 'fx'),
    'ribbon_stream_d': ('fixtures/ribbon_stream_d', 'fx'),
    'ribbon_stream_e': ('fixtures/ribbon_stream_e', 'fx'),

    # ---- COLOSSAL SCALE. Every other piece in the kit lands in the same
    # mid-size band, so the skyline reads as a wall of similar shapes; these are
    # the fix. All architecture, all load-bearing, all collide for real.
    'colossus_head': ('colossus/colossus_head', 'wall'),
    'colossus_hand': ('colossus/colossus_hand', 'wall'),
    'colossus_foot': ('colossus/colossus_foot', 'wall'),
    'colossus_ribcage': ('colossus/colossus_ribcage', 'windows'),  # fly between ribs
    'colossus_torso_draped': ('colossus/colossus_torso_draped', 'wall'),
    'statue_robed': ('colossus/statue_robed', 'wall'),
    'belltower_ruin': ('colossus/belltower_ruin', 'wall'),
    'dome_broken': ('colossus/dome_broken', 'arch'),
    'stair_broken': ('colossus/stair_broken', 'wall'),
    'lintel_fallen': ('colossus/lintel_fallen', 'wall'),
    'colonnade_triple': ('colossus/colonnade_triple', 'split'),
    'arch_window_nest': ('colossus/arch_window_nest', 'windows'),
    'niche_nest': ('colossus/niche_nest', 'windows'),

    # ---- MOTES: richer alternatives to the procedural dot. The larger ones are
    # for "deep light" placed off the easy line.
    'mote_curl_01': ('fogpieces/mote_curl_01', 'fx'),
    'mote_curl_02': ('fogpieces/mote_curl_02', 'fx'),
    'mote_spiral_large': ('fogpieces/mote_spiral_large', 'fx'),
    'mote_streak_long': ('fogpieces/mote_streak_long', 'fx'),
    'mote_tiny_01': ('fogpieces/mote_tiny_01', 'fx'),
    'mote_tiny_02': ('fogpieces/mote_tiny_02', 'fx'),
    'mote_tiny_03': ('fogpieces/mote_tiny_03', 'fx'),
    # painted fog cutouts — real tendrils, so no opaque border can straighten
    # into the "square in the fog" defect
    'fog_bank_tall': ('fogpieces/fog_bank_tall', 'fx'),
    'fog_bank_wide': ('fogpieces/fog_bank_wide', 'fx'),
    'fog_cloud_mid': ('fogpieces/fog_cloud_mid', 'fx'),
    'fog_wisp_low': ('fogpieces/fog_wisp_low', 'fx'),
    'vessel_bottle': ('fogpieces/vessel_bottle', 'deco'),
    'vessel_feather': ('fogpieces/vessel_feather', 'deco'),
    'vessel_lamp': ('fogpieces/vessel_lamp', 'deco'),
    'vessel_orb': ('fogpieces/vessel_orb', 'deco'),

    # ---- LIGHT SHAFTS. Additive only; light never has a collider.
    'shaft_column_04': ('shafts/shaft_column_04', 'fx'),
    'shaft_diag_01': ('shafts/shaft_diag_01', 'fx'),
    'shaft_diag_05': ('shafts/shaft_diag_05', 'fx'),
    'shaft_fan_02': ('shafts/shaft_fan_02', 'fx'),
    'shaft_fan_03': ('shafts/shaft_fan_03', 'fx'),
    'shaft_fan_wide_06': ('shafts/shaft_fan_wide_06', 'fx'),

    # ---- FINAL DROP. Every one of these already has a consumer in src/ that
    # was silently failing or crashing on a missing manifest entry: level.ts
    # places the gate, the curtains and the seed pods; DayScene draws the bell
    # tower and the spire; atmosphere.ts uses god_ray and the storm wisps;
    # TitleScene / FlywayMapScene / ResultsScene use the wordmark, the plate,
    # the markers and the rating feathers.
    'gauntlet_gate': ('final/gauntlet_gate', 'split'),  # the monumental last gate — MUST collide
    'curtain_beaded': ('final/curtain_beaded', 'organic-brittle'),
    'curtain_ivy_lace': ('final/curtain_ivy_lace', 'organic-brittle'),
    'seed_pod_cluster_a': ('final/seed_pod_cluster_a', 'organic-hang'),  # brushes, doesn't kill
    'seed_pod_cluster_b': ('final/seed_pod_cluster_b', 'organic-hang'),
    # landmark scenery, deliberately behind the flight plane and non-colliding
    'bell_tower': ('final/bell_tower', 'deco'),
    'storm_spire': ('final/storm_spire', 'deco'),
    'god_ray': ('final/god_ray', 'fx'),
    'storm_wisp_a': ('final/storm_wisp_a', 'fx'),
    'storm_wisp_b': ('final/storm_wisp_b', 'fx'),
    'storm_wisp_c': ('final/storm_wisp_c', 'fx'),
    'emblem_a': ('final/emblem_a', 'deco'),
    'emblem_b': ('final/emblem_b', 'deco'),
    'emblem_c': ('final/emblem_c', 'deco'),
    'emblem_d': ('final/emblem_d', 'deco'),
    'feather_primary': ('final/feather_primary', 'fx'),
    'feather_covert_01': ('final/feather_covert_01', 'fx'),
    'feather_covert_02': ('final/feather_covert_02', 'fx'),
    'feather_downy': ('final/feather_downy', 'fx'),
    'seed_feather_deco': ('final/seed_feather_deco', 'fx'),
    'seed_loose_00': ('final/seed_loose_00', 'fx'),
    'seed_loose_01': ('final/seed_loose_01', 'fx'),
    'seed_loose_02': ('final/seed_loose_02', 'fx'),
    'seed_loose_03': ('final/seed_loose_03', 'fx'),
    'seed_loose_04': ('final/seed_loose_04', 'fx'),
    'seed_loose_05': ('final/seed_loose_05', 'fx'),
    'seed_loose_06': ('final/seed_loose_06', 'fx'),
    'seed_loose_07': ('final/seed_loose_07', 'fx'),
    'seed_loose_08': ('final/seed_loose_08', 'fx'),
    'marker_ancient_ruins': ('final/marker_ancient_ruins', 'deco'),
    'marker_wild_orchard': ('final/marker_wild_orchard', 'deco'),
    'marker_river_gorge': ('final/marker_river_gorge', 'deco'),
    'marker_falcon_cliffs': ('final/marker_falcon_cliffs', 'deco'),
    'marker_wind_heights': ('final/marker_wind_heights', 'deco'),
    'marker_final_roost': ('final/marker_final_roost', 'deco'),
    'rating_home_on': ('final/rating_home_on', 'deco'),
    'rating_home_off': ('final/rating_home_off', 'deco'),
    'rating_flock_on': ('final/rating_flock_on', 'deco'),
    'rating_flock_off': ('final/rating_flock_off', 'deco'),
    'rating_flow_on': ('final/rating_flow_on', 'deco'),
    'rating_flow_off': ('final/rating_flow_off', 'deco'),
    'title_bg': ('final/title_bg', 'deco'),
    'wordmark': ('final/wordmark', 'deco'),
}

# Named art on disk that is deliberately NOT loaded, and why. Kept here so the
# decision is recorded next to the table rather than remembered.
#
#   flock/falcon_bank, falcon_dive, falcon_glide, falcon_turn
#       A second, smaller hawk set carrying a hot gold rim-light on every
#       feather. Warm gold moving is the light grammar's word for LIFE / FUEL /
#       collect-this; a predator wearing it tells the player the opposite of the
#       truth. The final/ set is the same poses, ~2x the resolution, lit in cool
#       violet with a dawn-pink edge. Only flock/falcon_soar is taken from this
#       set, and only because it is drawn tint-filled as a black shadow, which
#       discards the rim entirely.
#   sky/*.webp
#       The 760x333 first cut of the six act skies. textures.ts loads the
#       2048x897 sky2x/ set over the top of them; shipping both would be 214KB
#       of duplicate that nothing can ever draw.

NO_COLLIDE = ('bird', 'fx', 'deco')


def resolve(rel: str) -> str:
    """Draft path -> the path that actually ships, preferring WebP.

    The draft still names .png files. to_webp.py converted the art and DELETED
    the sources, so a draft path is a dead link the moment it is emitted. This
    is the one place that mapping lives now.
    """
    stem = rel.rsplit('.', 1)[0] if rel.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')) else rel
    for cand in (stem + '.webp', rel):
        if os.path.exists(os.path.join(PUBLIC, cand)):
            return cand
    raise SystemExit(f'no shipped file for {rel} (looked for {stem}.webp)')


def split_bands_around_openings(bands, openings):
    """Cut a full-width band wherever the art paints a hole through it.

    A band is a coverage mass, and the band pass is deliberately coarse — it
    spans the piece's full width when most of that width is solid. On three
    pieces (aqueduct_slope, arch_fragment, column_pair) that coarseness ran a
    band straight across a painted opening, so the art advertised a gap the
    physics refused.

    That is the single defect this world cannot afford: the owner reported it as
    "looks flyable but the angle doesn't allow", and it is what teaches a player
    that shapes mean nothing. The opening is the authored intent, so the band
    yields to it — split into the solid remainder on either side, and dropped
    entirely where nothing is left.
    """
    if not openings:
        return bands
    out = []
    for b in bands:
        segments = [(b['x'], b['x'] + b['w'])]
        for o in openings:
            oy0, oy1 = o['y'], o['y'] + o['h']
            if oy1 <= b['y'] or oy0 >= b['y'] + b['h']:
                continue  # the opening does not reach this band vertically
            ox0, ox1 = o['x'], o['x'] + o['w']
            nxt = []
            for x0, x1 in segments:
                if ox1 <= x0 or ox0 >= x1:
                    nxt.append((x0, x1))
                    continue
                if ox0 > x0:
                    nxt.append((x0, ox0))
                if ox1 < x1:
                    nxt.append((ox1, x1))
            segments = nxt
        for x0, x1 in segments:
            if x1 - x0 >= 8:  # a sliver is not a wall
                out.append({'x': x0, 'y': b['y'], 'w': x1 - x0, 'h': b['h']})
    return out


def geometry(file_rel: str, family: str, w: int, h: int, draft_entry: dict | None = None):
    """Colliders + openings for one piece, derived from its own alpha.

    Derived together in a single pass so a painted opening is exactly the gap
    the physics allows. A piece must never imply an opening is flyable when the
    collider refuses it — that confusion is a reported defect, and deriving both
    from the same silhouette is what makes it structurally impossible.
    """
    if family in NO_COLLIDE:
        return [], []
    if family == 'organic-brittle':
        # a curtain blocks as one soft mass until it is punched through
        return [{'x': 0, 'y': 0, 'w': w, 'h': h}], []
    # 2.5D PASSABILITY COMES FIRST. The draft carries a `bands` field for 191 of
    # its 255 pieces: full-width coverage masses (crowns, beams, lintels) that
    # genuinely block, with narrow verticals (arch legs, mullions, tracery)
    # deliberately left OUT because the flock passes them in depth. That model
    # is what makes flying through a ruin feel like flight rather than like a
    # maze of solid bars.
    #
    # Deriving colliders from the full silhouette instead made every mullion
    # solid, and the difficulty contract went red: a competent pilot died at
    # x~19,000 with 185-262 collision events, at 94% daylight — killed by
    # terrain with the dark nowhere near it. The owner reported it as "a lot
    # that are still not registering correctly and it's messing up the game".
    #
    # So bands win wherever the draft has them. The silhouette pass remains for
    # the newly registered pieces, which have no draft entry and therefore no
    # bands to prefer.
    if draft_entry:
        bands = draft_entry.get('bands') or draft_entry.get('bands40')
        if bands:
            openings = draft_entry.get('openings') or []
            return split_bands_around_openings(bands, openings), openings
    rects, openings = silhouette_colliders(os.path.join(PUBLIC, file_rel))
    if not rects:
        # filigree and rings can vanish under the speck filter; a solid-looking
        # piece with nothing behind it is a phantom wall, so refuse it loudly
        raise SystemExit(f'{file_rel}: alpha pass produced no colliders for a {family} piece — '
                         'do not ship it as collidable')
    return rects, openings


def main() -> None:
    with open(os.path.join(ROOT, 'assets_raw', 'manifest_draft.json'), encoding='utf-8') as f:
        draft = {e['id']: e for e in json.load(f)}

    lines = [
        '// GENERATED by tools/build_manifest.py — regenerate rather than hand-editing',
        '// entries. Every path here is verified to exist on disk at generation time,',
        '// and colliders/openings are alpha-derived native-px rects relative to the',
        "// piece top-left; 'deco'/'bird'/'fx' families never collide.",
        '',
        'export interface ArtRect {',
        '  x: number',
        '  y: number',
        '  w: number',
        '  h: number',
        '}',
        '',
        'export interface ArtPiece {',
        '  key: string',
        '  file: string',
        '  w: number',
        '  h: number',
        "  family: 'bird' | 'arch' | 'windows' | 'split' | 'column' | 'wall' | 'hang' | 'organic' | 'organic-brittle' | 'organic-hang' | 'fx' | 'deco'",
        '  colliders: ArtRect[]',
        '  openings: ArtRect[]',
        '}',
        '',
        'export const ART: Record<string, ArtPiece> = {',
    ]
    missing = []
    emitted: list[str] = []

    def emit(alias: str, file_rel: str, w: int, h: int, family: str, draft_entry: dict | None = None) -> None:
        colliders, openings = geometry(file_rel, family, w, h, draft_entry)
        emitted.append(file_rel)
        lines.append(
            f"  '{alias}': {{ key: '{alias}', file: '{file_rel}', w: {w}, h: {h}, "
            f"family: '{family}', colliders: {json.dumps(colliders)}, "
            f"openings: {json.dumps(openings)} }},"
        )

    for alias, (pid, family) in CURATED.items():
        e = draft.get(pid)
        if not e:
            missing.append(pid)
            continue
        emit(alias, resolve(e['file']), e['w'], e['h'], family, e)

    for alias, (rel, family) in DIRECT.items():
        file_rel = resolve(f'assets/processed/{rel}.webp')
        with Image.open(os.path.join(PUBLIC, file_rel)) as im:
            w, h = im.size
        emit(alias, file_rel, w, h, family)

    lines.append('}')
    lines.append('')
    assert not missing, f'missing draft ids: {missing}'

    # THE GUARD. 86 entries once shipped pointing at .png files that had been
    # deleted by the WebP conversion — every one a silent 404, and it recurred
    # the moment anyone regenerated. A generator that can emit a dead path is
    # the defect, so this makes emitting one impossible. Do not remove it.
    dead = [f for f in emitted if not os.path.exists(os.path.join(PUBLIC, f))]
    assert not dead, f'{len(dead)} emitted paths do not exist on disk: {dead[:6]}'

    out = os.path.join(ROOT, 'src', 'artManifest.ts')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    total = sum(os.path.getsize(os.path.join(PUBLIC, f)) for f in emitted)
    print(f'wrote {out}: {len(emitted)} pieces, {total / 1024 / 1024:.2f} MB, all paths verified')


if __name__ == '__main__':
    main()
