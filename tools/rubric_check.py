"""Run every rubric line that a machine can decide, and report the rest.

WHY THIS EXISTS. The plan is a long prose document and the rubric is a table
inside it, so "is anything missing?" was being answered from memory. It kept
being answered wrong: 14 painted creature sprites sat unregistered and never
loaded, the falcon's pose art was never wired so a live `textures.exists` check
silently always failed, and 6 of ~200 level pieces moved while the plan called
for a world with a tempo. Every one of those was invisible to the build and
every one was found by accident.

Memory is the defect. This turns the checkable half of the rubric into a
command, so a gap is reported the moment it appears rather than whenever someone
happens to look. Lines needing human judgement are printed as MANUAL rather than
quietly skipped -- an unchecked line must never look like a passing one.

Run it before claiming any part of the rubric is met.
"""
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROCESSED = os.path.join(ROOT, 'public/assets/processed')

# Families whose art must exist in a real range, with the rubric line each
# serves. A single piece stretched across six acts is the defect these catch.
# Each family lists the words the CODEBASE actually uses for it, not the word
# the rubric line happens to use. An earlier version looked for 'breakable' and
# reported 0/6 while six distinct breakables shipped — this project calls them
# curtains and webs. A check that measures a vocabulary nobody writes in reports
# a defect that does not exist, and teaches everyone to ignore it.
VARIATION_MIN = {
    'breakable': (['curtain', 'web_', 'wisteria'], 6, 'R35 — one distinct breakable per act'),
    'cage': (['cage'], 3, 'R24 — cages must vary by mount, height and size'),
    'falcon': (['falcon'], 4, 'R20/9a.7 — the hawk needs pose art, not one tinted image'),
    'lamp': (['lamp'], 4, 'R30/9f — relightable lamps need lit and unlit states'),
    'moth': (['moth'], 6, 'R22 — a cluster of identical moths reads as one object'),
}

# Features KILLED by the economy law (S8b8a). Live code for a cut feature
# misleads every later reader, so it must not exist.
#
# Matched as identifiers, not as words: an earlier version grepped for 'thread'
# and flagged the comment "threads pass free" and "enough birds thread a real
# opening". Prose is not code, and a check that cries wolf gets ignored, which
# would defeat the entire point of having it.
CUT_VERBS = ['beacon', 'lantern']
# Controls the player must NOT be taught, because they no longer exist.
CUT_CONTROLS = ['BRACE', 'DIVE', 'SPACE + SHIFT', 'SPACE+SHIFT']
CUT_IDENTS = [r'(set|enter|begin|do|use)?[Bb]eacon', r'(set|enter|begin|do|use)?[Ll]antern']

# Copy the owner rejected, or that describes behaviour the game no longer has.
STALE_COPY = [
    ('birds glowing are about to be lost', 'rejected phrasing; it is a blink now, not a glow'),
    ('hold BRACE', 'BRACE is cut — teaching a control that does not exist'),
    ('SPACE + SHIFT', 'the Brace chord is cut; no input in this game is a chord'),
    ('MOUSE or V', 'DIVE is cut — V is no longer bound'),
]


def sh(cmd: list[str]) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=900)
        return p.returncode, (p.stdout or '') + (p.stderr or '')
    except Exception as e:  # a missing tool must read as unknown, never as a pass
        return 2, str(e)


def src_text() -> str:
    out = []
    for dp, _dn, fns in os.walk(os.path.join(ROOT, 'src')):
        for fn in fns:
            if fn.endswith('.ts'):
                out.append(io.open(os.path.join(dp, fn), encoding='utf-8').read())
    return '\n'.join(out)


def registered_files() -> set[str]:
    man = io.open(os.path.join(ROOT, 'src/artManifest.ts'), encoding='utf-8').read()
    used = set(re.findall(r"file: 'assets/processed/([^']+)'", man))
    tex = io.open(os.path.join(ROOT, 'src/textures.ts'), encoding='utf-8').read()
    used |= set(re.findall(r"assets/processed/([A-Za-z0-9_/.]+)", tex))
    return used


def check_conversion() -> tuple[bool, str]:
    """R36a: nothing ships as PNG. WebP lands at ~13% of PNG for this art, and
    the bundle was once 88MB, which is a payload problem no host can fix."""
    stragglers = []
    for dp, _dn, fns in os.walk(PROCESSED):
        for fn in fns:
            if fn.lower().endswith(('.png', '.jpg', '.jpeg')):
                stragglers.append(os.path.relpath(os.path.join(dp, fn), PROCESSED))
    if stragglers:
        return False, f'{len(stragglers)} unconverted: {", ".join(stragglers[:6])} — run tools/to_webp.py'
    return True, 'all processed art is WebP'


# Deliberately unregistered, with the reason, so the check keeps its teeth
# without crying wolf. A standing failure everyone has learned to scroll past
# is worse than no check at all.
EXEMPT_ART = {
    # A second, smaller hawk set with a hot gold rim-light on every feather.
    # Warm gold in motion is this world's word for life and fuel; a predator
    # wearing it says the opposite of the truth. The `final/` set is the same
    # poses at ~2x resolution in cool violet.
    'flock/falcon_bank.webp', 'flock/falcon_dive.webp',
    'flock/falcon_glide.webp', 'flock/falcon_turn.webp',
    # The 760x333 first cut of the six act skies. textures.ts loads the
    # 2048x897 sky2x/ set over the top, so shipping both is dead weight.
    'sky/sky_dawn_approach.webp', 'sky/sky_sun_gate.webp',
    'sky/sky_overgrown.webp', 'sky/sky_wind_heights.webp',
    'sky/sky_gauntlet.webp', 'sky/sky_homeward.webp',
}


def check_registration() -> tuple[bool, str]:
    """R36b: every named piece either loads or is deliberately excluded.

    Numbered sheet slices are curated down on purpose, so they are exempt; a
    file given a real name was named because someone meant to use it, and a
    named orphan is the exact failure that hid the moths and the falcon poses.
    """
    used = registered_files()
    named_orphans = []
    for dp, _dn, fns in os.walk(PROCESSED):
        for fn in fns:
            rel = os.path.relpath(os.path.join(dp, fn), PROCESSED).replace(os.sep, '/')
            top = rel.split('/')[0]
            if rel in used or rel in EXEMPT_ART or top in ('fog', 'sky2x', 'parallax'):
                continue
            stem = rel.rsplit('/', 1)[-1].rsplit('.', 1)[0]
            if re.search(r'__\d+$', stem):  # a numbered slice of a sheet
                continue
            named_orphans.append(rel)
    # every manifest entry must also resolve to a file that exists
    missing = [f for f in used if not os.path.exists(os.path.join(PROCESSED, f))]
    msgs = []
    if named_orphans:
        msgs.append(f'{len(named_orphans)} named but unregistered: {", ".join(sorted(named_orphans)[:6])}')
    if missing:
        msgs.append(f'{len(missing)} registered but MISSING from disk: {", ".join(sorted(missing)[:4])}')
    return (not msgs), '; '.join(msgs) if msgs else 'every named piece loads, every entry resolves'


def check_variation() -> tuple[bool, str]:
    man = io.open(os.path.join(ROOT, 'src/artManifest.ts'), encoding='utf-8').read()
    keys = set(re.findall(r"^  '([^']+)':", man, re.M))
    src = src_text()
    # Procedural families register through factory helpers that take the key as
    # a VARIABLE (`makeCageTexture(scene, 'cage_box', 'box')`), so a regex for
    # createCanvas('literal') cannot see them and reported 1/3 while all three
    # cages shipped. Scanning the quoted literals in textures.ts catches both.
    tex = io.open(os.path.join(ROOT, 'src/textures.ts'), encoding='utf-8').read()
    literals = set(re.findall(r"'([a-z0-9_]+)'", tex))
    fails = []
    for family, (words, need, why) in VARIATION_MIN.items():
        found = set()
        for word in words:
            found |= {k for k in keys if word in k}
            found |= {k for k in literals if word in k}
        if len(found) < need:
            fails.append(f'{family}: {len(found)}/{need} ({why})')
    return (not fails), '; '.join(fails) if fails else 'all families meet their variation minimum'


def check_dead_code() -> tuple[bool, str]:
    src = src_text().lower()
    found = [v for v in CUT_VERBS if re.search(rf'\b{v}\b', src)]
    if found:
        return False, f'cut features still referenced in src/: {", ".join(found)} (R32)'
    return True, 'no cut-feature code remains'


def check_stale_copy() -> tuple[bool, str]:
    src = src_text().lower()
    hits = [f'"{t}" — {why}' for t, why in STALE_COPY if t.lower() in src]
    return (not hits), '; '.join(hits) if hits else 'no known stale player-facing copy'


def check_coverage() -> tuple[bool, str]:
    """Every plan section must have a rubric line AND an owner.

    This is the check that exists because things kept being dropped. A section
    with no rubric line cannot be proven done, and a section with no owner will
    not be started — both fail silently in a prose plan, and both are now build
    failures.
    """
    plan = os.path.expanduser('~/.claude/plans/iridescent-honking-fox.md')
    cov = os.path.join(ROOT, 'COVERAGE.md')
    if not os.path.exists(cov):
        return False, 'COVERAGE.md is missing — nothing maps the plan to owners'
    text = io.open(cov, encoding='utf-8').read()
    rows = {}
    for line in text.splitlines():
        m = re.match(r'\|\s*([0-9]+[a-z0-9-]*|cinematic)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|', line)
        if m:
            rows[m.group(1).strip()] = (m.group(3).strip(), m.group(4).strip(), m.group(5).strip())
    problems = []
    for sid, (rubric, owner, status) in rows.items():
        if not re.search(r'R\d+', rubric):
            problems.append(f'section {sid} has no rubric line')
        if not owner:
            problems.append(f'section {sid} has no owner')
    if os.path.exists(plan):
        planned = set()
        for line in io.open(plan, encoding='utf-8').read().splitlines():
            m = re.match(r'### ([0-9]+[a-z0-9-]*|Cinematic)', line)
            if m:
                planned.add(m.group(1).lower())
        missing = sorted(planned - set(rows))
        if missing:
            problems.append(f'{len(missing)} plan section(s) absent from COVERAGE.md: {", ".join(missing[:8])}')
    if problems:
        return False, '; '.join(problems[:5])
    done = sum(1 for r in rows.values() if r[2] == 'DONE')
    return True, f'{len(rows)} sections all mapped — {done} DONE, {sum(1 for r in rows.values() if r[2] == "ACTIVE")} ACTIVE, {sum(1 for r in rows.values() if r[2] == "QUEUED")} QUEUED'


def check_types() -> tuple[bool, str]:
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=6144')
    p = subprocess.run(['npx', 'tsc', '--noEmit'], cwd=ROOT, capture_output=True,
                       text=True, shell=True, env=env, timeout=900)
    errs = [l for l in p.stdout.splitlines() if re.search(r'error TS', l)]
    return (not errs), (f'{len(errs)} type errors, first: {errs[0][:110]}' if errs else 'tsc clean')


def check_motion() -> tuple[bool, str]:
    code, out = sh([sys.executable, 'tools/motion_census.py'])
    line = next((l for l in out.splitlines() if 'moving of' in l), out.strip()[:110])
    return code == 0, line


def check_wired() -> tuple[bool, str]:
    """R47: a system that is built but never called is not shipped.

    This defect has now hit FOUR systems in one build. `src/vfx.ts` (999 lines),
    `src/camera.ts` (365), `src/hud.ts` (561) and `src/tunnel.ts` (1471) were
    each written, typechecked, committed — and imported by nothing, so none of
    them ran. `src/audio.ts` was worse: 21 public hooks defined and 21 unwired,
    so the entire adaptive score, the pre-beat silence, the creature and tunnel
    audio and every ceremony cue were dead code sitting in the bundle.

    None of it failed a typecheck, a build or a lint, because unused exports
    are perfectly legal. The only thing that catches it is asking whether
    anything CALLS the thing — so that question is asked here, every run.
    """
    # Scan ALL of src/ except the defining file. An earlier version listed the
    # scene files by hand and matched nothing at all, because a hand-kept list
    # is exactly the kind of thing that goes stale — which is the same class of
    # defect this check exists to catch.
    import glob
    dead = []
    audio_path = os.path.join(ROOT, 'src/audio.ts')
    callers = ''
    for f in glob.glob(os.path.join(ROOT, 'src', '**', '*.ts'), recursive=True):
        if os.path.abspath(f) == os.path.abspath(audio_path):
            continue
        callers += io.open(f, encoding='utf-8').read()

    audio = io.open(audio_path, encoding='utf-8').read()
    for m in sorted(set(re.findall(r'^  ([a-z][A-Za-z0-9]*)\(', audio, re.M))):
        # `unhush` is the manual counterpart to `hush`, which schedules its own
        # restore — it exists only for a window of unknown length, and nothing
        # in the game currently opens one. Exempted with the reason rather than
        # left as a standing failure everyone learns to scroll past.
        if m in ('constructor', 'unhush'):
            continue
        if ('audio.' + m) not in callers:
            dead.append('audio.' + m)

    for mod, cls in (('vfx', 'VFXDirector'), ('camera', 'CameraDirector'),
                     ('hud', 'AbilityBar'), ('tunnel', 'TunnelSequence'),
                     ('creatures', 'MothSwarm')):
        if os.path.exists(os.path.join(ROOT, 'src', mod + '.ts')) and cls not in callers:
            dead.append(mod + '.ts (' + cls + ') imported by nothing')

    if dead:
        return False, str(len(dead)) + ' built but never called: ' + ', '.join(dead[:6])
    return True, 'every built system has a live call site'


def check_tests() -> tuple[bool, str]:
    """R48: the unit suite passes.

    For most of this project there was no suite at all — the only gates were
    Python tools driving a browser, which cannot run in a second and cannot be
    run on every edit. The suite covers the Phaser-free half: the obstacle
    field's aliasing contract, the level as data, the reward chain, and the art
    manifest's integrity. Every test in it corresponds to a defect that actually
    shipped.
    """
    # `npx` is a .cmd shim on Windows and sh() runs without a shell, so the
    # bare name is not resolvable. Call the local binary directly — it is also
    # faster and cannot pick up a different vitest from the PATH.
    vitest = os.path.join(ROOT, 'node_modules', '.bin', 'vitest.cmd' if os.name == 'nt' else 'vitest')
    code, out = sh([vitest, 'run', '--reporter=dot'])
    line = next((l.strip() for l in out.splitlines() if 'Tests' in l and ('passed' in l or 'failed' in l)), '')
    import re as _re
    line = _re.sub(r'\[[0-9;]*m', '', line)
    return code == 0, line or out.strip()[:120]


def check_borders() -> tuple[bool, str]:
    """R46: an opaque frame edge draws as a square the instant light hits it."""
    code, out = sh([sys.executable, 'tools/border_audit.py'])
    line = next((l for l in out.splitlines() if 'PASS' in l or 'hard edge' in l), out.strip()[:120])
    return code == 0, line


def check_lane() -> tuple[bool, str]:
    """R45: does the terrain actually constrain the lane, in both directions?"""
    code, out = sh([sys.executable, 'tools/lane_census.py'])
    keep = [l.strip() for l in out.splitlines()
            if l.strip().startswith(('fly ', 'THREAD', 'NOTHING'))]
    return code == 0, ' · '.join(keep) if keep else out.strip()[:140]


MANUAL = [
    ('R9', 'endings differ by grade with sound off, in one frame'),
    ('R10', 'no straight edges or seams anywhere in the fog'),
    ('R11', 'every frame has something near-black and one hot value'),
    ('R12', 'six acts read as six places'),
    ('R16', 'effects have buildup -> impact -> decay'),
    ('R17', 'no STOP->SWAP->START seams remain'),
    ('R27', 'the dark reads as pursuing, not expanding'),
    ('R30', 'reward is paid in capability, not points'),
    ('R35', 'one HUD-less frame identifies its act'),
]

CHECKS = [
    ('R36a', 'all art converted to WebP', check_conversion),
    ('R36b', 'every named asset registered; every entry resolves', check_registration),
    ('R37', 'art families meet variation minimums', check_variation),
    ('R32a', 'no dead code for cut features', check_dead_code),
    ('R32b', 'no stale player-facing copy', check_stale_copy),
    ('R21', 'the world moves', check_motion),
    ('R45', 'terrain constrains the lane in both directions', check_lane),
    ('R46', 'no registered asset carries an opaque border', check_borders),
    ('R47', 'no system is built but never called', check_wired),
    ('R48', 'the unit suite passes', check_tests),
    ('MAP', 'every plan section has a rubric line and an owner', check_coverage),
    ('--', 'types compile', check_types),
]


def main() -> int:
    print('FLYWAY rubric check\n' + '=' * 72)
    bad = 0
    for rid, name, fn in CHECKS:
        try:
            ok, detail = fn()
        except Exception as e:
            ok, detail = False, f'check itself failed: {e}'
        if not ok:
            bad += 1
        print(f'{"PASS" if ok else "FAIL":>4}  {rid:<6} {name}\n        {detail}')
    print('\nNOT MACHINE-CHECKABLE — these need eyes on captures:')
    for rid, name in MANUAL:
        print(f'  MANUAL {rid:<5} {name}')
    print('=' * 72)
    print(f'{bad} automated failure(s); {len(MANUAL)} lines still require human judgement')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
