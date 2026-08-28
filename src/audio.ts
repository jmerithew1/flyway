/**
 * Restrained procedural audio — no samples, everything synthesized with
 * WebAudio. A continuous filtered-noise "wing" bed that brightens on Gather
 * and widens on Spread, soft collision thuds, and a warm chime at the roost.
 */
/**
 * Suno replacement slots: drop a stem at public/audio/<layer>.mp3 and that
 * procedural layer is replaced at runtime with zero code changes.
 * Layers: pad, bells, wings (the wing bed itself).
 */
import {
  BRACE_DETUNE,
  BRACE_TONE_MULT,
  VOICE_CALM_SHARE,
  VOICE_DENSITY_FLOOR,
  VOICE_GAP_MAX,
  VOICE_GAP_MIN,
  VOICE_PEAK,
} from './config'

const STEM_LAYERS = ['pad', 'bells', 'wings'] as const

// ---- act key-color: each act nudges the whole palette up a few semitones.
// Pad bank + bell motif + drone all shift together, so intervals (and the
// pentatonic character) are preserved — color changes, never dissonance.
const ACT_SEMIS = [0, 2, 4] as const
// G-major pentatonic motif (G4 A4 C5 D5 E5 G5), precomputed per act.
const BELL_BASE = [392, 440, 523.3, 587.3, 659.3, 784] as const
const BELL_TABLES: ReadonlyArray<ReadonlyArray<number>> = ACT_SEMIS.map((s) =>
  BELL_BASE.map((f) => f * Math.pow(2, s / 12)),
)
// Low D2 — the fifth below the pad's G root, dropped an octave.
const DRONE_BASE = 73.42
const DRONE_FREQS: ReadonlyArray<number> = ACT_SEMIS.map((s) => DRONE_BASE * Math.pow(2, s / 12))

// ---- the light ladder: two octaves of G-major pentatonic, precomputed once.
// One rung per mote, so a chain is a RISING RUN. The old five-note cycle reset
// to the bottom every fifth mote, which meant the ladder fell back under the
// player at exactly the moment they were doing best — the melodic shape
// contradicted the reward. It PLATEAUS at the top rather than climbing on:
// 17-mote lanes exist, and two more octaves would put the run's best moment in
// a phone speaker's shriek band.
const LADDER = [392, 440, 523.25, 587.33, 659.25, 784, 880, 1046.5, 1174.66, 1318.5] as const
/** Nothing is ever synthesized above this. Phones exaggerate 2-4kHz badly. */
const CEIL_HZ = 1400
/**
 * Simultaneous one-shot voices. Past this the FREQUENT cheap sources (chirps,
 * motes, moth chatter, tunnel ticks) drop out rather than turning a phone into
 * mud — set pieces are exempt, because they are the reason a budget exists.
 */
const VOICE_BUDGET = 26
/**
 * The pre-beat window. Every big moment eases the score DOWN for this long
 * before it lands, so the impact arrives into near-silence. Measured from the
 * defect it fixes: a set piece stacked on top of a full mix reads as busier,
 * never as bigger.
 */
const HUSH_LEAD = 0.35

export class GameAudio {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private noiseGain!: GainNode
  private noiseFilter!: BiquadFilterNode
  private noiseBuf: AudioBuffer | null = null
  private started = false
  private layerGains = new Map<string, GainNode>()
  private stems = new Map<string, AudioBuffer>()
  private bellTimer = 0
  private bellStep = 0
  private progress01 = 0
  // ---- journey / escalation state
  private padVoices: Array<{ osc: OscillatorNode; baseDetune: number }> = []
  private actIdx = 0
  private bellDensity = 1 // 0..1 motif density (flock grief thins it)
  private motifBoost = 1 // >=1, from gauntlet intensity
  private padTarget = 0.055
  private bellsTarget = 1
  private wingsTarget = 1
  private drone: OscillatorNode | null = null
  private droneGain: GainNode | null = null

  // ---- adaptive score state ------------------------------------------------
  // The journey's *wants*, before the run's condition thins them. Kept apart
  // from the applied targets so setRunState and setJourney can arrive in any
  // order, at any rate, without either clobbering the other's contribution.
  private padBase = 0.26
  private bellsBase = 0.7
  private wingsBase = 0.62
  private dayLight = 1
  private flockR = 1
  private speed = 0
  // Re-applying five AudioParams sixty times a second buys nothing audible and
  // churns the automation timeline, so the mix only moves when it has moved.
  private lastMixAt = -1
  private lastMixDay = -1
  private lastMixFlock = -1
  /**
   * Until this ctx time, applyMix must not touch the layer gains. Set pieces
   * schedule multi-second gain shapes (hush windows, mob swells, ceremonies)
   * and the journey mix repaints every 0.5s — without this hold, every one of
   * those shapes was silently overwritten within half a second of starting.
   */
  private mixHoldUntil = 0
  /** The lone sustained tone the score thins down TO as the dark closes. */
  private holdOsc: OscillatorNode | null = null
  private holdGain: GainNode | null = null
  /** Scales the flock chirps during a hush — the ambience leaves too. */
  private hushDuck = 1

  // ---- roost homing call ---------------------------------------------------
  private roostProx = -1 // <0 = follow journey progress
  private roostTimer = 3.5
  private roostPan: StereoPannerNode | null = null
  private roostBus: GainNode | null = null

  // ---- voice census (see liveVoices / peakVoices) --------------------------
  private live = 0
  private peak = 0

  /** Must be called from a user gesture (first pointer move / keydown). */
  start(): void {
    if (this.started) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    this.started = true
    this.ctx = new Ctx()
    const ctx = this.ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0.0
    this.master.connect(ctx.destination)
    this.tween(this.master.gain, 0.42, 1.4)

    // pink-ish noise buffer, looped, through a bandpass "wing rush" filter
    const bufSize = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.04 * white) / 1.04
      data[i] = last * 3.2
    }
    this.noiseBuf = buffer
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    this.noiseFilter = ctx.createBiquadFilter()
    this.noiseFilter.type = 'bandpass'
    this.noiseFilter.frequency.value = 420
    this.noiseFilter.Q.value = 0.6
    this.noiseGain = ctx.createGain()
    this.noiseGain.gain.value = 0.34
    const wingsLayer = ctx.createGain()
    this.layerGains.set('wings', wingsLayer)
    src.connect(this.noiseFilter).connect(this.noiseGain).connect(wingsLayer).connect(this.master)
    src.start()

    // ---- pad layer: warm slow-detuned bank through a lowpass (or a stem)
    const padGain = ctx.createGain()
    padGain.gain.value = 0.16
    this.layerGains.set('pad', padGain)
    padGain.connect(this.master)
    const bellsGain = ctx.createGain()
    bellsGain.gain.value = 1
    this.layerGains.set('bells', bellsGain)
    bellsGain.connect(this.master)
    this.tryLoadStems()
    if (!this.stems.has('pad')) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 640
      lp.connect(padGain)
      for (const [freq, detune] of [
        [98, -4],
        [147, 3],
        [196, -2],
        [247, 5],
      ] as Array<[number, number]>) {
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.value = freq
        o.detune.value = detune
        const g = ctx.createGain()
        g.gain.value = 0.22
        // slow independent breathing per voice
        const lfo = ctx.createOscillator()
        lfo.frequency.value = 0.05 + Math.random() * 0.06
        const lfoGain = ctx.createGain()
        lfoGain.gain.value = 0.09
        lfo.connect(lfoGain).connect(g.gain)
        o.connect(g).connect(lp)
        o.start()
        lfo.start()
        this.padVoices.push({ osc: o, baseDetune: detune })
      }
    }
  }

  /** Lazy low-fifth drone that sits under the pad during gauntlet intensity.
   * Lives whether the pad is procedural or a stem; hard-capped at gain 0.05. */
  private ensureDrone(): GainNode | null {
    if (!this.ctx) return null
    if (this.droneGain) return this.droneGain
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = DRONE_FREQS[this.actIdx]
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 240
    const g = ctx.createGain()
    g.gain.value = 0
    o.connect(lp).connect(g).connect(this.master)
    o.start()
    this.drone = o
    this.droneGain = g
    return g
  }

  // ---- voice census + explicit release -------------------------------------

  /**
   * Register a one-shot source and tear its chain down when it ends.
   *
   * WebAudio will eventually collect a finished source, but the gain and filter
   * downstream of it stay wired to master until it does, and on a phone a run
   * of 179 motes plus a few thousand chirps is enough of a graph to matter. The
   * `ended` event is the only moment we can know a voice is really done, so it
   * is where the chain is cut. One closure per one-shot — an EVENT cost, never
   * a per-frame one.
   */
  private held(src: AudioScheduledSourceNode, a?: AudioNode | null, b?: AudioNode | null, c?: AudioNode | null): void {
    this.live++
    if (this.live > this.peak) this.peak = this.live
    src.onended = () => {
      this.live--
      src.disconnect()
      a?.disconnect()
      b?.disconnect()
      c?.disconnect()
    }
  }

  /** Frequent cheap voices ask first; set pieces do not. Keeps a phone legible. */
  private budget(): boolean {
    return this.live < VOICE_BUDGET
  }

  /**
   * The set pieces' own ceiling. They are exempt from the ordinary budget —
   * a hawk strike that drops half its voices is not a hawk strike — but two of
   * them can genuinely land together (a cage breaking as the falcon dives), and
   * measured, that stacks past sixty simultaneous oscillators. Past this the
   * DECORATIVE tails of a set piece are skipped while its transient and its
   * cadence always play, so the moment is never silently downgraded to nothing.
   */
  private crowded(): boolean {
    return this.live > VOICE_BUDGET * 2
  }

  /**
   * The absolute ceiling, above which a set piece skips its SUSTAINED voices
   * (never its transient, and never its mix shaping — those are what carry the
   * moment). Measured: realistic play peaks at 28 simultaneous voices and sits
   * at a median of 12, so nothing reachable by playing ever meets this. It
   * exists because long-tailed voices — the homecoming chord holds five for
   * sixteen seconds — mean an unlucky pile-up decays slowly, and an unbounded
   * pile-up on a phone is a dropped frame rate the player blames on the game.
   */
  private saturated(): boolean {
    return this.live > VOICE_BUDGET * 4
  }

  /** Live one-shot voice count — instrumentation for the perf budget. */
  get liveVoices(): number {
    return this.live
  }

  /** Highest simultaneous one-shot voice count seen this session. */
  get peakVoices(): number {
    return this.peak
  }

  // ---- the adaptive mix ----------------------------------------------------

  /**
   * The run, continuously. This is what makes the score track the flight rather
   * than merely accompany it.
   *
   * daylight01 IS the distance to the dark, so it drives the score by SUBTRACTION:
   * bells drop out first, then the pad thins, then the wing bed narrows, and
   * what is left is one held tone. Adding tension layers as things get worse
   * makes a game louder, which reads as busier — emptying out is what reads as
   * frightening, and it costs negative CPU, which is the right direction on a
   * phone that is already struggling when the fog is on screen.
   *
   * Allocation-free and safe to call every frame: it only writes AudioParams
   * when a value has actually moved, and at most ten times a second.
   */
  setRunState(daylight01: number, flockRatio01: number, speed01: number): void {
    this.dayLight = daylight01 > 1 ? 1 : daylight01 < 0 ? 0 : daylight01
    this.flockR = flockRatio01 > 1 ? 1 : flockRatio01 < 0 ? 0 : flockRatio01
    this.speed = speed01 > 1 ? 1 : speed01 < 0 ? 0 : speed01
    if (!this.ctx) return
    const now = this.ctx.currentTime
    const moved =
      Math.abs(this.dayLight - this.lastMixDay) > 0.008 || Math.abs(this.flockR - this.lastMixFlock) > 0.012
    if (!moved || now - this.lastMixAt < 0.1) return
    this.lastMixAt = now
    this.lastMixDay = this.dayLight
    this.lastMixFlock = this.flockR
    this.applyMix()
    this.updateHoldNote()
  }

  /** Bells go first, then the pad, then the bed — in that order, always. */
  private bellsThin(): number {
    const d = (this.dayLight - 0.3) / 0.34
    return d < 0 ? 0 : d > 1 ? 1 : d
  }
  private padThin(): number {
    const d = (this.dayLight - 0.1) / 0.4
    return 0.18 + 0.82 * (d < 0 ? 0 : d > 1 ? 1 : d)
  }
  private wingsThin(): number {
    const d = this.dayLight / 0.5
    return 0.5 + 0.5 * (d < 0 ? 0 : d > 1 ? 1 : d)
  }

  /**
   * Fold the journey's wants and the run's condition into the three layer gains.
   * Speed only ever touches the bed, never the score — a fast flock should feel
   * like more air, not like a key change.
   */
  private applyMix(tau = 1.1): void {
    if (!this.ctx) return
    const pad = this.padBase * this.padThin()
    const bells = this.bellsBase * this.bellsThin()
    const wings = this.wingsBase * this.wingsThin() * (1 + this.speed * 0.12)
    this.padTarget = pad
    this.bellsTarget = bells
    this.wingsTarget = wings
    const t = this.ctx.currentTime
    // a set piece owns the layers while its shape runs; the targets are still
    // recorded above so whatever restores them lands on the current mix
    if (t < this.mixHoldUntil) return
    this.layerGains.get('pad')?.gain.setTargetAtTime(pad, t, tau)
    this.layerGains.get('bells')?.gain.setTargetAtTime(bells, t, tau)
    this.layerGains.get('wings')?.gain.setTargetAtTime(wings, t, 1.6)
  }

  /**
   * The single held note the score empties out into. It is G4 — the same tonic
   * the light ladder resolves to — deliberately in the midrange, because a
   * phone speaker reproduces nothing below ~300Hz and the one thing left
   * sounding is the last thing allowed to be inaudible.
   *
   * Created lazily and TORN DOWN when it fades out, so a run that never gets
   * dark never builds the graph, and a run that recovers does not leave an
   * oscillator running silently into master for the next twenty minutes.
   */
  private updateHoldNote(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    // fades in as the bells leave, full when only the bed is left
    const want = Math.max(0, Math.min(1, (0.44 - this.dayLight) / 0.3))
    if (want <= 0.001) {
      if (this.holdGain && this.holdOsc) {
        const g = this.holdGain
        const o = this.holdOsc
        this.holdGain = null
        this.holdOsc = null
        g.gain.cancelScheduledValues(t)
        g.gain.setTargetAtTime(0, t, 0.8)
        o.stop(t + 3.2)
        this.held(o, g)
      }
      return
    }
    if (!this.holdGain) {
      const base = 392 * Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = base
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 1500
      const g = ctx.createGain()
      g.gain.value = 0.0001
      o.connect(lp).connect(g).connect(this.master)
      o.start(t)
      this.holdOsc = o
      this.holdGain = g
      // the census counts it only when it finally stops (see the fade-out above)
    }
    // it BREATHES rather than sitting flat, so a held note reads as a held
    // breath and not as a stuck tone the player assumes is a bug
    this.holdGain.gain.setTargetAtTime(0.052 * want, t, 1.4)
  }

  // ---- silence as an instrument --------------------------------------------

  /**
   * Ease the whole score and ambience DOWN ahead of a beat, then bring it back.
   *
   * This is the single strongest technique available here and it costs negative
   * performance: it turns work off. The restore is scheduled inside the same
   * call on purpose — a hush whose caller forgets to release it is a game that
   * goes permanently quiet, which is the one unrecoverable audio defect.
   *
   * @param lead   seconds of easing-down BEFORE the beat lands
   * @param hold   seconds of near-silence after the beat, before the score returns
   * @param keep   the one voice allowed to keep sounding through the window
   */
  hush(lead = HUSH_LEAD, hold = 0.3, keep: 'none' | 'wings' | 'note' = 'none'): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const back = t + lead + hold
    this.mixHoldUntil = Math.max(this.mixHoldUntil, back)
    const tau = Math.max(0.04, lead / 3)
    for (const layer of STEM_LAYERS) {
      const g = this.layerGains.get(layer)
      if (!g) continue
      g.gain.cancelScheduledValues(t)
      const floor = layer === 'wings' && keep === 'wings' ? this.wingsTarget * 0.35 : 0.02
      g.gain.setTargetAtTime(floor, t, tau)
    }
    this.hushDuck = 0.15
    this.restoreLayers(back, 0.55)
    // the duck on the chirps lifts with the layers, not before them
    this.holdGain?.gain.setTargetAtTime(keep === 'note' ? 0.075 : 0.02, t, tau)
    this.duckFor((lead + hold) * 1000)
  }

  private hushClear = 0

  /**
   * The chirp duck is the one part of a hush that cannot live on the audio
   * clock — voiceTick reads a scalar. A single owned timer, always cancelled
   * before it is replaced: two overlapping set pieces used to leave a stale
   * timer that lifted the duck in the middle of the second one.
   */
  private duckFor(ms: number): void {
    this.hushDuck = 0.15
    if (this.hushClear) clearTimeout(this.hushClear)
    this.hushClear = setTimeout(() => {
      this.hushDuck = 1
      this.hushClear = 0
      this.updateHoldNote()
    }, ms) as unknown as number
  }

  /** Explicit release for windows whose length is not known up front (tunnel). */
  unhush(tau = 0.7): void {
    if (!this.ctx) return
    this.mixHoldUntil = 0
    this.hushDuck = 1
    if (this.hushClear) {
      clearTimeout(this.hushClear)
      this.hushClear = 0
    }
    this.restoreLayers(this.ctx.currentTime, tau)
    this.updateHoldNote()
  }

  /** Replace procedural layers with any stems found at public/audio/<layer>.mp3. */
  private tryLoadStems(): void {
    if (!this.ctx) return
    for (const layer of STEM_LAYERS) {
      fetch(`audio/${layer}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
        .then((buf) => this.ctx!.decodeAudioData(buf))
        .then((audio) => {
          this.stems.set(layer, audio)
          const src = this.ctx!.createBufferSource()
          src.buffer = audio
          src.loop = true
          const gain = this.layerGains.get(layer)
          if (gain) {
            if (layer === 'wings') this.noiseGain.gain.value = 0 // silence procedural bed
            src.connect(gain)
            src.start()
          }
        })
        .catch(() => undefined) // no stem: procedural layer stays
    }
  }

  /**
   * Sparse pentatonic bell motif; density grows with journey progress so the
   * melody strengthens as home nears. Call every frame with dt + progress.
   */
  musicTick(dt: number, progress01: number, intensity01 = 0): void {
    if (!this.ctx) return
    this.progress01 = progress01
    // gauntlet drone: fades in above ~0.55 intensity, out below — smooth, capped
    const droneOn = intensity01 > 0.55
    if (droneOn || this.droneGain) {
      const g = this.ensureDrone()
      if (g) {
        const target = droneOn ? Math.min(0.05, 0.015 + intensity01 * 0.035) : 0
        g.gain.setTargetAtTime(target, this.ctx.currentTime, droneOn ? 1.6 : 1.0)
      }
    }
    this.motifBoost = 1 + Math.max(0, Math.min(1, intensity01)) * 0.35
    this.roostTick(dt)
    if (this.stems.has('bells')) return
    this.bellTimer -= dt
    if (this.bellTimer > 0) return
    // density: journey progress quickens the motif; intensity nudges it further;
    // a grieving (thinned) flock stretches the silences instead
    const interval = (5.2 - progress01 * 3.1 + Math.random() * 2.4) / this.motifBoost
    this.bellTimer = interval / Math.max(0.3, this.bellDensity)
    const scale = BELL_TABLES[this.actIdx]
    const step = (this.bellStep + 1 + ((Math.random() * 2) | 0)) % scale.length
    this.bellStep = step
    const f = scale[step]
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    const h = this.ctx.createOscillator()
    h.type = 'sine'
    h.frequency.value = f * 2.01
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.1 + progress01 * 0.04, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4)
    const hg = this.ctx.createGain()
    hg.gain.setValueAtTime(0.028, t)
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1)
    const dest = this.layerGains.get('bells') ?? this.master
    o.connect(g).connect(dest)
    h.connect(hg).connect(dest)
    o.start(t)
    h.start(t)
    o.stop(t + 2.5)
    h.stop(t + 1.2)
    this.held(o, g)
    this.held(h, hg)
  }

  // ---- the roost's call ----------------------------------------------------

  /**
   * Override the homing call's strength. Left unset it follows journey progress,
   * which is already roost proximity — so the call works with no new call site
   * at all. Set it explicitly wherever the geometry stops being "distance along
   * x" (the tunnel, where home is close but progress is not).
   * Pass a negative number to hand control back to journey progress.
   */
  setRoostProximity(p01: number): void {
    this.roostProx = p01 < 0 ? -1 : p01 > 1 ? 1 : p01
  }

  /**
   * A falling fifth, from far away, getting closer for twenty-five thousand
   * pixels. This is the whole navigation HUD: it tells the player there is a
   * destination and roughly how far it is, without a single pixel.
   *
   * Three things carry distance, and only one of them is level — a phone
   * speaker in a noisy room will lose a quiet call entirely, so the call also
   * gets BRIGHTER (the low-pass opens) and MORE FREQUENT as home nears. Pan is
   * a fourth cue for headphones and is never load-bearing.
   */
  private roostTick(dt: number): void {
    if (!this.ctx) return
    const p = this.roostProx >= 0 ? this.roostProx : this.progress01
    this.roostTimer -= dt
    if (this.roostTimer > 0) return
    // the gap is re-rolled whether or not the call sounds, so a skipped call
    // never turns into a per-frame budget test
    this.roostTimer = (12 - p * 8.6) * (0.75 + Math.random() * 0.5)
    if (!this.budget()) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const semis = ACT_SEMIS[this.actIdx]
    const shift = Math.pow(2, semis / 12)
    const open = 420 + p * p * 2100 // closed and muffled until it is genuinely near
    const level = 0.014 + p * 0.06
    // D5 answered by G4 — a fall to the tonic, which is where the whole run
    // resolves. Near the roost a third voice joins: the colony, not one bird.
    const notes = p > 0.72 ? 3 : 2
    for (let i = 0; i < notes; i++) {
      const f = (i === 0 ? 587.33 : i === 1 ? 392 : 293.66) * shift
      const at = t0 + i * (0.42 - p * 0.1)
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = this.pv(f, 0.004)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = open
      lp.Q.value = 0.7
      const g = ctx.createGain()
      const amp = level * (i === 0 ? 1 : i === 1 ? 0.85 : 0.5)
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(amp, at + 0.1)
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.5 + p * 0.9)
      let tail: AudioNode = g
      if (typeof ctx.createStereoPanner === 'function') {
        const pan = ctx.createStereoPanner()
        pan.pan.value = (1 - p) * 0.5 // ahead and to the right, centring on arrival
        g.connect(pan)
        tail = pan
        tail.connect(this.master)
        o.connect(lp).connect(g)
        o.start(at)
        o.stop(at + 2.5 + p)
        this.held(o, lp, g, pan)
        continue
      }
      o.connect(lp).connect(g).connect(this.master)
      o.start(at)
      o.stop(at + 2.5 + p)
      this.held(o, lp, g)
    }
  }

  /**
   * Music as state feedback — call every ~0.5s. The day's arc escalates the
   * layers (early: wings + sparse pad → mid: fuller pad, bells enter → late:
   * everything rich), the flock's health breathes through pad/bell fullness
   * (losses thin the score, recovery re-blooms it over ~4s), and each act
   * recolors the palette a few semitones up. Richer, never louder: all shaping
   * happens under the fixed master ceiling, and because it drives the shared
   * layerGains it shapes Suno stems and procedural layers identically.
   */
  setJourney(progress01: number, flockRatio01: number, act: number): void {
    if (!this.ctx) return
    const p = Math.max(0, Math.min(1, progress01))
    const r = Math.max(0, Math.min(1, flockRatio01))
    const t = this.ctx.currentTime

    // ---- act key-color (pad detune center + bell/drone tables shift together)
    const idx = Math.max(0, Math.min(BELL_TABLES.length - 1, Math.round(act) - 1))
    if (idx !== this.actIdx) {
      this.actIdx = idx
      this.applyPadDetune(3.0)
      this.drone?.frequency.setTargetAtTime(DRONE_FREQS[idx], t, 3.0)
    }

    // ---- flock health: below ~half strength the score grieves with the flock
    const health = Math.max(0, Math.min(1, (r - 0.15) / 0.4)) // 0 at 15%, 1 at 55%
    const padHealth = 0.45 + health * 0.55
    const bellHealth = 0.3 + health * 0.7
    // grief lands quickly (τ≈0.9s); recovery re-blooms over ~4s (τ≈1.4s)
    // The music used to sit 20-30 dB under the wing bed, which made a game
    // with a full adaptive score read as having no music at all. The bed is
    // atmosphere; the pad and bells are the score, and they lead now.
    // These are the journey's WANTS only. setRunState thins them by daylight,
    // and applyMix is the single place the two are combined — before, two
    // callers wrote the same three gains and the last one to run won.
    this.padBase = (0.26 + p * 0.2) * padHealth
    this.bellsBase = (0.7 + Math.min(1, p * 1.6) * 0.5) * bellHealth
    this.wingsBase = 0.62 - p * 0.12 // bed recedes as the music fills in
    this.applyMix(this.padBase * this.padThin() > this.padTarget ? 1.4 : 0.9)

    // motif density follows the same grief/re-bloom shape (~0.5s call cadence)
    const densWant = bellHealth
    const k = densWant > this.bellDensity ? 0.12 : 0.3 // rise ≈4s, fall ≈1.5s
    this.bellDensity += (densWant - this.bellDensity) * k
  }

  /**
   * A 2s pad+bell bloom for ceremonies (departure/arrival). Reuses the layer
   * gains and the pentatonic tables — safe to call anytime, even pre-start.
   */
  celebrationSwell(strength01 = 1): void {
    if (!this.ctx) return
    const s = Math.max(0, Math.min(1, strength01))
    const ctx = this.ctx
    const t = ctx.currentTime
    const pad = this.layerGains.get('pad')
    const bells = this.layerGains.get('bells')
    // the journey mix repaints every 0.5s and used to erase this swell before
    // it had finished rising; the hold makes the shape survive its own length
    this.mixHoldUntil = Math.max(this.mixHoldUntil, t + 2.2)
    // swell up over ~0.6s, settle back to the journey targets by ~2s
    pad?.gain.setTargetAtTime(this.padTarget * (1 + 0.9 * s), t, 0.25)
    pad?.gain.setTargetAtTime(this.padTarget, t + 0.9, 0.5)
    bells?.gain.setTargetAtTime(Math.min(1.4, this.bellsTarget * (1 + 0.6 * s) + 0.15), t, 0.25)
    bells?.gain.setTargetAtTime(this.bellsTarget, t + 0.9, 0.5)
    // two gentle motif notes riding the swell (skip when a bell stem sings)
    if (!this.stems.has('bells')) {
      const scale = BELL_TABLES[this.actIdx]
      const dest = bells ?? this.master
      ;[scale[0], scale[2]].forEach((f, i) => {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = this.pv(f, 0.015)
        const g = ctx.createGain()
        const at = t + 0.1 + i * 0.35
        g.gain.setValueAtTime(0, at)
        g.gain.linearRampToValueAtTime(0.05 + 0.025 * s, at + 0.05)
        g.gain.exponentialRampToValueAtTime(0.0001, at + 1.8)
        o.connect(g).connect(dest)
        o.start(at)
        o.stop(at + 1.9)
        this.held(o, g)
      })
      this.bellTimer = Math.min(this.bellTimer, 1.2) // let the motif answer soon
    }
  }

  private gStrain = 0
  private sStrain = 0

  private thin = false

  /** Low-flock warning: the bed audibly thins when few birds remain. */
  setThin(on: boolean): void {
    if (this.thin === on || !this.ctx) return
    this.thin = on
    this.noiseGain.gain.setTargetAtTime(on ? 0.2 : 0.4, this.ctx.currentTime, 0.8)
  }

  /** Hidden formation strain shapes the wing bed: faster/tenser under gather
   * strain, thinner/fragmented under spread strain. */
  setStrain(gatherStrain: number, spreadStrain: number): void {
    this.gStrain = gatherStrain
    this.sStrain = spreadStrain
  }

  /** form: -1 spread .. 0 neutral .. 1 gather. speed: rough flock speed 0..1 normalized. */
  setFlockState(form: number, speed: number): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const gather = Math.max(form, 0)
    const spread = Math.max(-form, 0)
    // gather: brighter, tighter, faster rush. spread: lower, airier, wider (via Q)
    // strain: wingbeats speed up and tense (freq/Q up); over-spread thins the bed
    // brace: the whole bed darkens and slows — this method owns noiseFilter, so
    // braceTone() only flips the flag and the shaping happens here
    const brace = this.braced ? BRACE_TONE_MULT : 1
    const freq = (380 + gather * 420 - spread * 140 + speed * 160 + this.gStrain * 260) * brace
    const q = 0.5 + gather * 1.6 + spread * 0.3 + this.gStrain * 1.4
    const tau = this.braced ? 0.16 : 0.4
    this.noiseFilter.frequency.setTargetAtTime(freq, t, tau)
    this.noiseFilter.Q.setTargetAtTime(q, t, tau)
    this.noiseGain.gain.setTargetAtTime(0.35 + gather * 0.25 + speed * 0.15 - this.sStrain * 0.12, t, 0.5)
  }

  /** Storm pressure: the wing bed roughens and widens as weather closes in. */
  setStormy(amount01: number): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const a = Math.max(0, Math.min(1, amount01))
    this.noiseFilter.Q.setTargetAtTime(0.6 + a * 2.2, t, 0.6)
    this.noiseGain.gain.setTargetAtTime(0.5 + a * 0.35, t, 0.6)
  }

  // ---- Phase 8: brace tone + flock voice ------------------------------------

  private braced = false
  private braceDetune = 0

  /** Pad + drone detune, recomputed from act colour and brace bend together so
   * neither can clobber the other. */
  private applyPadDetune(tau: number): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const cents = ACT_SEMIS[this.actIdx] * 100 + this.braceDetune
    for (const v of this.padVoices) v.osc.detune.setTargetAtTime(v.baseDetune + cents, t, tau)
    this.drone?.detune.setTargetAtTime(this.braceDetune, t, tau)
  }

  /**
   * Brace: while the world eases down, the score thickens with it — the wing
   * bed darkens (BRACE_TONE_MULT on the bandpass, applied in setFlockState) and
   * the pad/drone bend BRACE_DETUNE cents flat. Subtle by design: this plays
   * under a 0.7s window and must never announce itself as an effect.
   */
  braceTone(on: boolean): void {
    if (this.braced === on) return
    this.braced = on
    this.braceDetune = on ? BRACE_DETUNE : 0
    if (!this.ctx) return
    this.applyPadDetune(on ? 0.12 : 0.35)
  }

  private voiceCount = 0
  private voiceCalm = 0
  private voiceTimer = 0

  /** Flock Voice inputs. count01: flock size as a fraction of full strength.
   * calm01: how settled the flock is (1 = neutral, unstrained, unhurried). */
  setVoice(count01: number, calm01: number): void {
    this.voiceCount = Math.max(0, Math.min(1, count01))
    this.voiceCalm = Math.max(0, Math.min(1, calm01))
  }

  /**
   * Sparse chirp chorus — call every frame with dt. A big calm flock chatters;
   * a small or panicked one falls nearly silent. Everything is randomized (gap,
   * cluster size, pitch via pv(), stagger, sweep direction) so it never loops
   * audibly, and every chirp sits under the bell motif in level. No ctx: no-op.
   */
  voiceTick(dt: number): void {
    if (!this.ctx) return
    this.voiceTimer -= dt
    if (this.voiceTimer > 0) return
    const density = this.voiceCount * (1 - VOICE_CALM_SHARE + VOICE_CALM_SHARE * this.voiceCalm)
    // the gap is re-rolled even when the flock is too thin to sing, so silence
    // never turns into a per-frame density test
    this.voiceTimer = (VOICE_GAP_MAX + (VOICE_GAP_MIN - VOICE_GAP_MAX) * density) * (0.55 + Math.random() * 0.95)
    if (density < VOICE_DENSITY_FLOOR || !this.budget()) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    // 1-3 birds answer each other; louder flocks answer in bigger groups
    const voices = 1 + ((Math.random() * (1 + density * 2)) | 0)
    for (let i = 0; i < voices; i++) {
      const t = t0 + Math.random() * 0.14 + i * (0.055 + Math.random() * 0.07)
      const up = Math.random() < 0.68
      const f0 = this.pv(1750 + Math.random() * 900, 0.06)
      const f1 = up ? f0 * (1.2 + Math.random() * 0.35) : f0 * (0.72 + Math.random() * 0.16)
      const dur = 0.045 + Math.random() * 0.05
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(f0, t)
      o.frequency.exponentialRampToValueAtTime(Math.max(f1, 60), t + dur)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = f0
      bp.Q.value = 1.4
      const g = ctx.createGain()
      // the flock's chatter is ambience, so it leaves with the score during a
      // hush — otherwise the "silence" before a set piece is full of birds
      const peak = VOICE_PEAK * this.hushDuck * (0.5 + 0.5 * density) * (0.6 + Math.random() * 0.7)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.3)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05)
      o.connect(bp).connect(g).connect(this.master)
      o.start(t)
      o.stop(t + dur + 0.08)
      this.held(o, bp, g)
    }
  }

  /** Master mute — the whole graph ducks, nothing is torn down. */
  setMuted(on: boolean): void {
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(on ? 0 : 0.42, this.ctx.currentTime, 0.05)
  }

  /** ±ratio random pitch so repeated one-shots never sound stamped. */
  private pv(base: number, ratio = 0.08): number {
    return base * (1 + (Math.random() * 2 - 1) * ratio)
  }

  /** Short filtered-noise one-shot (whooshes, snaps, rustles). */
  private noiseShot(dur: number, f0: number, f1: number, peak: number, type: BiquadFilterType = 'bandpass', q = 1.1): void {
    if (!this.ctx || !this.noiseBuf) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.playbackRate.value = this.pv(1, 0.1)
    const f = ctx.createBiquadFilter()
    f.type = type
    f.Q.value = q
    f.frequency.setValueAtTime(f0, t)
    f.frequency.exponentialRampToValueAtTime(Math.max(f1, 40), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.25)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.master)
    src.start(t, Math.random() * 1.2, dur + 0.05)
    this.held(src, f, g)
  }

  /** Near-miss: a brief high air-rush — danger acknowledged, not punished. */
  nearMissWhoosh(): void {
    this.noiseShot(0.32, this.pv(1500), this.pv(2400), 0.085, 'bandpass', 1.6)
  }

  /** Rising creak as a brittle curtain charges toward breaking. */
  brittleCreak(charge01: number): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(this.pv(85 + charge01 * 120), t)
    o.frequency.exponentialRampToValueAtTime(this.pv(60 + charge01 * 80), t + 0.11)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.05 + charge01 * 0.09, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + 0.15)
    this.held(o, g)
    this.noiseShot(0.1, this.pv(340), this.pv(180), 0.05, 'lowpass')
  }

  /** One-shot transient for formation press/release edges. */
  formSnap(kind: 'gather' | 'spread' | 'release'): void {
    if (kind === 'gather') {
      // wing-snap fwoomp: tight noise burst + quick pitch drop
      this.noiseShot(0.11, this.pv(750), this.pv(380), 0.15)
      if (this.ctx) {
        const ctx = this.ctx
        const t = ctx.currentTime
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.setValueAtTime(this.pv(230), t)
        o.frequency.exponentialRampToValueAtTime(110, t + 0.1)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.09, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
        o.connect(g).connect(this.master)
        o.start(t)
        o.stop(t + 0.14)
        this.held(o, g)
      }
    } else if (kind === 'spread') {
      // airy exhale bloom
      this.noiseShot(0.3, this.pv(850), this.pv(1700), 0.1, 'highpass', 0.8)
    } else {
      // relieved settling
      this.noiseShot(0.22, this.pv(600), this.pv(320), 0.06, 'lowpass')
    }
  }

  /** Surge: a whipcrack air-rush that scales with the pulse's health. */
  surgeWhoosh(strength = 1): void {
    this.noiseShot(0.34, this.pv(520), this.pv(1900), 0.14 * strength, 'bandpass', 1.2)
  }

  /** Echo Call: rising chirp cascade; weak strength = hoarse, half-voiced. */
  echoCall(strength = 1): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const n = strength > 0.5 ? 4 : 2
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      const f0 = this.pv(1150 + i * 160, 0.05)
      o.frequency.setValueAtTime(f0, t + i * 0.13)
      o.frequency.exponentialRampToValueAtTime(f0 * 1.8, t + i * 0.13 + 0.11)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t + i * 0.13)
      g.gain.exponentialRampToValueAtTime(0.1 * strength, t + i * 0.13 + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.13 + 0.3)
      o.connect(g).connect(this.master)
      o.start(t + i * 0.13)
      o.stop(t + i * 0.13 + 0.35)
      this.held(o, g)
    }
    if (strength <= 0.5) this.noiseShot(0.25, this.pv(700), this.pv(400), 0.06, 'bandpass', 2.5)
  }

  /** Golden two-note bloom for a clean pass through an opening. */
  cleanPassBloom(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const base = this.pv(660, 0.04)
    ;[base, base * 1.5].forEach((f, i) => {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t + i * 0.09)
      g.gain.exponentialRampToValueAtTime(0.085, t + i * 0.09 + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.8)
      o.connect(g).connect(this.master)
      o.start(t + i * 0.09)
      o.stop(t + i * 0.09 + 0.85)
      this.held(o, g)
    })
  }

  /** Soft thud/scatter sound on a bird-loss event. */
  collisionThump(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(this.pv(180, 0.12), t)
    o.frequency.exponentialRampToValueAtTime(60, t + 0.18)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.18, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + 0.25)
    this.held(o, g)
  }

  /** The homecoming: the fullest musical moment — a slow warm chord swell. */
  homeSwell(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    this.master.gain.setTargetAtTime(0.42, t, 2.0)
    // slow major-add9 pad blooming under everything. Sixteen-second tails are
    // the longest voices in the game, so they are the first thing a pile-up
    // must be allowed to trim.
    const notes = this.saturated() ? [196, 293.7] : [196, 246.9, 293.7, 392, 440]
    notes.forEach((f, i) => {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t + i * 0.4)
      g.gain.linearRampToValueAtTime(0.035, t + i * 0.4 + 2.2)
      g.gain.linearRampToValueAtTime(0.022, t + 12)
      g.gain.linearRampToValueAtTime(0.0001, t + 16)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 900
      o.connect(lp).connect(g).connect(this.master)
      o.start(t + i * 0.4)
      o.stop(t + 16.2)
      this.held(o, lp, g)
    })
  }

  /** Falcon telegraph: distant descending screech; the music thins under it. */
  falconScreech(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    // FM cry: carrier swept down with vibrato, bandpassed
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(2350, t)
    o.frequency.exponentialRampToValueAtTime(1150, t + 0.55)
    const vib = ctx.createOscillator()
    vib.frequency.value = 26
    const vibGain = ctx.createGain()
    vibGain.gain.value = 90
    vib.connect(vibGain).connect(o.frequency)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2100
    bp.Q.value = 4
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.06)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.65)
    o.connect(bp).connect(g).connect(this.master)
    o.start(t)
    vib.start(t)
    o.stop(t + 0.7)
    vib.stop(t + 0.7)
    this.held(o, bp, g)
    this.held(vib, vibGain)
    // music thins: pull the bed down for a couple of seconds
    this.noiseGain.gain.setTargetAtTime(0.16, t, 0.4)
    this.noiseGain.gain.setTargetAtTime(0.4, t + 2.6, 0.8)
  }

  /** Strike missed: a huge air rush, then release. */
  falconMiss(): void {
    this.airRush(0.34, 0.8)
  }

  /** Strike connected: sharp wing burst + brief musical drop. */
  falconHit(): void {
    this.airRush(0.42, 0.5)
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(0.1, t, 0.15)
    this.master.gain.setTargetAtTime(0.34, t + 1.2, 0.9)
  }

  // ------------------------------------------------------- I1 / I3 predator

  /**
   * I1 — the score DROPS OUT to a single held note the instant the dive
   * commits. Pad, bells and the wing bed all duck away; one low sustained
   * tone carries the fall, so the impact lands in near-silence.
   */
  strikeHeldNote(dur = 1.4): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    // everything musical steps aside — and STAYS aside: the 0.5s journey
    // repaint used to bring the full mix back on top of the held note, which
    // is exactly the moment the silence was supposed to be doing the work
    this.mixHoldUntil = Math.max(this.mixHoldUntil, t + dur * 0.72)
    for (const layer of STEM_LAYERS) {
      const g = this.layerGains.get(layer)
      if (!g) continue
      g.gain.cancelScheduledValues(t)
      g.gain.setTargetAtTime(layer === 'wings' ? 0.22 : 0.05, t, 0.05)
    }
    this.duckFor(dur * 800)
    // ONE note, low, unresolved — a held breath rather than a chord
    const base = DRONE_BASE * Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
    for (const [mult, amp, type] of [
      [1, 0.075, 'triangle'],
      [2, 0.028, 'sine'],
    ] as Array<[number, number, OscillatorType]>) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = base * mult
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(amp, t + 0.07)
      g.gain.setValueAtTime(amp, t + dur * 0.62)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g).connect(this.master)
      o.start(t)
      o.stop(t + dur + 0.05)
      this.held(o, g)
    }
    // the score returns only after the beat has resolved
    this.restoreLayers(t + dur * 0.72, 0.7)
  }

  /** Put pad / bells / wings back where the journey mix wants them. */
  private restoreLayers(at: number, tau: number): void {
    const pad = this.layerGains.get('pad')
    pad?.gain.setTargetAtTime(this.padTarget, at, tau)
    const bells = this.layerGains.get('bells')
    bells?.gain.setTargetAtTime(this.bellsTarget, at, tau)
    const wings = this.layerGains.get('wings')
    wings?.gain.setTargetAtTime(this.wingsTarget, at, tau)
  }

  /**
   * I1 — the cry that lands ON the hit. The telegraph screech is distant and
   * falling; this one is close: a hard transient, a wider throat, and a
   * shorter, angrier sweep.
   */
  falconStrikeScreech(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    // transient crack — the talon contact itself
    const len = Math.floor(ctx.sampleRate * 0.09)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
    const nsrc = ctx.createBufferSource()
    nsrc.buffer = buf
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 900
    const ng = ctx.createGain()
    ng.gain.value = 0.3
    nsrc.connect(hp).connect(ng).connect(this.master)
    nsrc.start(t)
    this.held(nsrc, hp, ng)
    // the cry: steeper and louder than the telegraph
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(2750, t)
    o.frequency.exponentialRampToValueAtTime(720, t + 0.38)
    const vib = ctx.createOscillator()
    vib.frequency.value = 33
    const vg = ctx.createGain()
    vg.gain.value = 130
    vib.connect(vg).connect(o.frequency)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1750
    bp.Q.value = 2.6
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
    o.connect(bp).connect(g).connect(this.master)
    o.start(t)
    vib.start(t)
    o.stop(t + 0.55)
    vib.stop(t + 0.55)
    this.held(o, bp, g)
    this.held(vib, vg)
  }

  /**
   * I3 — the same throat, but the cry BREAKS UPWARD and thins as the bird
   * goes: a retreat, not a threat. Read against falconStrikeScreech, which
   * falls, this is unmistakably the predator losing.
   */
  falconRetreatScreech(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(900, t)
    o.frequency.exponentialRampToValueAtTime(2600, t + 0.5)
    o.frequency.exponentialRampToValueAtTime(3100, t + 1.1)
    const vib = ctx.createOscillator()
    vib.frequency.value = 21
    const vg = ctx.createGain()
    vg.gain.value = 70
    vib.connect(vg).connect(o.frequency)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(1600, t)
    // it recedes: the band closes down as the distance opens
    bp.frequency.exponentialRampToValueAtTime(3400, t + 1.1)
    bp.Q.value = 5
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.05)
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.6)
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.35)
    o.connect(bp).connect(g).connect(this.master)
    o.start(t)
    vib.start(t)
    o.stop(t + 1.4)
    vib.stop(t + 1.4)
    this.held(o, bp, g)
    this.held(vib, vg)
  }

  /**
   * I3 — the flock wins. The one moment the score is allowed to be loud: the
   * layers come back up over a rising open chord that resolves UP, and the
   * wing bed roars with the column.
   */
  mobSwell(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.setTargetAtTime(0.5, t, 0.35)
    this.master.gain.setTargetAtTime(0.42, t + 3.2, 1.2)
    // the run's one loud moment gets to keep the layers for its whole length
    this.mixHoldUntil = Math.max(this.mixHoldUntil, t + 4.2)
    // wings surge: 120 birds climbing at once
    const wings = this.layerGains.get('wings')
    wings?.gain.cancelScheduledValues(t)
    wings?.gain.setTargetAtTime(Math.min(1.6, this.wingsTarget * 1.7 + 0.3), t, 0.12)
    wings?.gain.setTargetAtTime(this.wingsTarget, t + 1.6, 0.8)
    const pad = this.layerGains.get('pad')
    pad?.gain.cancelScheduledValues(t)
    pad?.gain.setTargetAtTime(Math.min(1.5, this.padTarget * 2.2 + 0.35), t, 0.3)
    pad?.gain.setTargetAtTime(this.padTarget, t + 3.0, 1.2)
    const bells = this.layerGains.get('bells')
    bells?.gain.cancelScheduledValues(t)
    bells?.gain.setTargetAtTime(Math.min(1.6, this.bellsTarget * 1.5 + 0.25), t, 0.25)
    bells?.gain.setTargetAtTime(this.bellsTarget, t + 3.0, 1.2)
    // a rising open-fifth-to-major figure — entries stacked upward
    const base = 196 * Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
    const ratios = this.saturated() ? [1, 1.5] : [1, 1.5, 2, 2.5, 3]
    ratios.forEach((r, i) => {
      const o = ctx.createOscillator()
      o.type = i > 2 ? 'triangle' : 'sawtooth'
      o.frequency.value = base * r
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.setValueAtTime(700, t)
      lp.frequency.linearRampToValueAtTime(2600, t + 1.4)
      const g = ctx.createGain()
      const at = t + i * 0.14
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(0.05 - i * 0.005, at + 0.5)
      g.gain.linearRampToValueAtTime(0.03 - i * 0.004, at + 2.0)
      g.gain.linearRampToValueAtTime(0.0001, at + 3.4)
      o.connect(lp).connect(g).connect(this.master)
      o.start(at)
      o.stop(at + 3.5)
      this.held(o, lp, g)
    })
    this.restoreLayers(t + 4.2, 1.2)
  }

  /**
   * I2 — the curtain does not fade, it SHATTERS: a hard crack, a spray of
   * chip transients, and a short bright ring as light comes through the hole.
   */
  brittleShatter(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    // the crack
    const len = Math.floor(ctx.sampleRate * 0.3)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) {
      const k = i / len
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 2.2)
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(2600, t)
    bp.frequency.exponentialRampToValueAtTime(600, t + 0.28)
    bp.Q.value = 0.8
    const g = ctx.createGain()
    g.gain.value = 0.34
    src.connect(bp).connect(g).connect(this.master)
    src.start(t)
    this.held(src, bp, g)
    // chips: short high clicks scattering after the crack
    for (let i = 0; i < (this.crowded() ? 3 : 7); i++) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      const at = t + 0.02 + Math.random() * 0.26
      o.frequency.setValueAtTime(1400 + Math.random() * 2200, at)
      const cg = ctx.createGain()
      cg.gain.setValueAtTime(0.05 + Math.random() * 0.04, at)
      cg.gain.exponentialRampToValueAtTime(0.0005, at + 0.09)
      o.connect(cg).connect(this.master)
      o.start(at)
      o.stop(at + 0.1)
      this.held(o, cg)
    }
    // light through the hole: a brief bright fifth
    for (const f of [784, 1176]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      const og = ctx.createGain()
      og.gain.setValueAtTime(0, t + 0.05)
      og.gain.linearRampToValueAtTime(0.045, t + 0.16)
      og.gain.exponentialRampToValueAtTime(0.0005, t + 1.5)
      o.connect(og).connect(this.master)
      o.start(t + 0.05)
      o.stop(t + 1.55)
      this.held(o, og)
    }
  }

  private airRush(amp: number, dur: number): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const len = ctx.sampleRate * dur
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(900, t)
    lp.frequency.exponentialRampToValueAtTime(3600, t + dur * 0.4)
    lp.frequency.exponentialRampToValueAtTime(500, t + dur)
    const g = ctx.createGain()
    g.gain.value = amp
    src.connect(lp).connect(g).connect(this.master)
    src.start(t)
    this.held(src, lp, g)
  }

  /** Failure: everything falls away to wind; only the noise bed survives, quiet. */
  failureFade(): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.setTargetAtTime(0.06, t, 1.2)
    this.noiseFilter.frequency.setTargetAtTime(220, t, 1.0)
    this.noiseFilter.Q.setTargetAtTime(0.4, t, 1.0)
  }

  /** Gameplay resumes: bed swells back. */
  failureRecover(): void {
    if (!this.ctx) return
    // 0.42 is the game's baseline master (see start / setMuted). Recovering to
    // 0.34 meant every retry left the game permanently ~2dB quieter than the
    // attempt before it, compounding across a session of retries.
    this.master.gain.setTargetAtTime(0.42, this.ctx.currentTime, 1.4)
    this.noiseFilter.Q.setTargetAtTime(0.6, this.ctx.currentTime, 1.0)
  }

  /** Musical bloom when birds join — bigger groups, bigger chord. */
  /**
   * The light ladder — one rung per mote, climbing while the chain holds.
   *
   * Two things were wrong before. It played the SAME notes at every chain
   * length (only the note COUNT changed, at thresholds), so there was no ladder
   * at all; and every note carried a 0.9s tail with stop(t+1). Arc geometry is
   * ~33px spacing at ~235px/s, i.e. a mote every ~0.14s — so a 17-mote lane
   * spawned up to 68 overlapping oscillators inside 2.4 seconds. That is mud,
   * and it destroys the very thing the ladder exists to communicate.
   *
   * The ladder is PENTATONIC, not chromatic. This world is G-major pentatonic
   * (see BELL_TABLES) over a D2 drone: a rising semitone leaves the key by the
   * second mote and beats against the drone by the fourth. Rungs cycle every
   * five and escalate in TIMBRE rather than climbing forever — two octaves up
   * would put a 17-mote sweep at 2.6kHz, piercing at seven notes a second, and
   * shrillest exactly when the player is doing best.
   */
  collectBloom(count: number): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const n = Math.max(1, count)
    const semis = ACT_SEMIS[Math.min(this.actIdx, ACT_SEMIS.length - 1)] ?? 0
    const shift = Math.pow(2, semis / 12)
    // one rung per mote, climbing for ten and then holding at the top while the
    // TIMBRE keeps escalating — a run that plateaus still reads as a run
    const rung = Math.min(n - 1, LADDER.length - 1)
    const cycle = Math.min(3, Math.floor((n - 1) / 5)) // 0..3, then it holds
    const capped = Math.min(LADDER[rung] * shift, CEIL_HZ)
    this.chainLen = n

    // short and clean, so consecutive rungs stay individually audible
    const dur = 0.16 + cycle * 0.03
    const peak = 0.05 + Math.min(cycle, 3) * 0.012

    const voices: Array<[OscillatorType, number, number]> = [['sine', 1, 1]]
    // the extras are colour, not information — they yield first under load
    if (this.budget()) {
      if (cycle >= 1) voices.push(['sine', 1.5, 0.45]) // a fifth
      if (cycle >= 2) voices.push(['triangle', 0.5, 0.5]) // an octave beneath
      if (cycle >= 3) voices.push(['sine', 2.02, 0.22]) // the world's bell partial
    }

    for (const [type, ratio, amp] of voices) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = Math.min(capped * ratio, CEIL_HZ * 1.6)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(peak * amp, t + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
      o.connect(g).connect(this.master)
      o.start(t)
      o.stop(t + dur + 0.02)
      this.held(o, g)
    }
    // every fifth rung is a NAMED tier in the game — mark it, or the tiers are
    // a screen event with no sound and the ladder has no landmarks
    if (n % 5 === 0 && this.budget()) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = Math.min(784 * shift * (n >= 15 ? 1.5 : 1), CEIL_HZ * 1.6)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t + 0.03)
      g.gain.linearRampToValueAtTime(0.038, t + 0.05)
      g.gain.exponentialRampToValueAtTime(0.0006, t + 0.9)
      o.connect(g).connect(this.master)
      o.start(t + 0.03)
      o.stop(t + 0.95)
      this.held(o, g)
    }
  }

  /** Longest chain seen by collectBloom, so the chain endings can be graded. */
  private chainLen = 0

  /**
   * The chain LANDS. A rising run with no cadence is a question nobody answers,
   * and 179 motes' worth of unanswered questions is why a good ladder can still
   * feel unrewarding. This is the resolution: down onto the tonic, with the
   * fifth and the octave under it, warm and unhurried.
   *
   * Call when a chain of any length lapses cleanly (the window simply expired).
   */
  chainResolve(length: number): void {
    if (!this.ctx) return
    const n = Math.max(0, length || this.chainLen)
    this.chainLen = 0
    if (n < 3) return // a two-mote chain is not a phrase and does not need a cadence
    const ctx = this.ctx
    const t = ctx.currentTime
    const shift = Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
    const weight = Math.min(1, n / 12)
    // G below the run, its fifth, its octave — the ladder's home
    for (const [ratio, amp, delay, dur] of [
      [1, 0.075, 0, 1.5],
      [1.5, 0.04, 0.055, 1.2],
      [2, 0.03, 0.11, 1.0],
    ] as Array<[number, number, number, number]>) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = 392 * shift * ratio
      const g = ctx.createGain()
      const at = t + delay
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(amp * (0.55 + 0.45 * weight), at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0006, at + dur)
      o.connect(g).connect(this.master)
      o.start(at)
      o.stop(at + dur + 0.05)
      this.held(o, g)
    }
  }

  /**
   * The chain BREAKS. Deliberately the same gesture as the cadence played
   * backwards — it falls off the ladder instead of landing on it, and the wing
   * bed dips with it. Small, never punishing: the player must be able to hear
   * that something was lost without being told off for it.
   */
  chainBreak(length: number): void {
    if (!this.ctx) return
    const n = Math.max(0, length || this.chainLen)
    this.chainLen = 0
    if (n < 3) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const shift = Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
    // A6 down to D4 — inside the same pentatonic, so it cannot clash, but it
    // is the only descending figure in the collect vocabulary
    for (const [f, delay] of [
      [440, 0],
      [293.66, 0.09],
    ] as Array<[number, number]>) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = f * shift
      const g = ctx.createGain()
      const at = t + delay
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(0.05, at + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0006, at + 0.5)
      o.connect(g).connect(this.master)
      o.start(at)
      o.stop(at + 0.55)
      this.held(o, g)
    }
    // the air goes out of it too — a 400ms dip, gone before it can annoy
    const wings = this.layerGains.get('wings')
    wings?.gain.setTargetAtTime(this.wingsTarget * 0.55, t, 0.08)
    wings?.gain.setTargetAtTime(this.wingsTarget, t + 0.4, 0.3)
  }

  /** Landmark tone — each named place has a stable identity (Bell Tower = bell). */
  landmarkTone(name: string): void {
    if (!this.ctx) return
    // stable pitch per name so restarts replay the same tone
    let h = 0
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997
    const base = 262 * Math.pow(2, (h % 12) / 12)
    if (name === 'Bell Tower') {
      // a real bell: strike + inharmonic partials, long decay
      const t = this.ctx.currentTime
      const partials: Array<[number, number, number]> = [
        [1, 0.16, 2.6],
        [2.02, 0.09, 1.9],
        [2.94, 0.05, 1.3],
        [4.4, 0.03, 0.8],
      ]
      for (const [ratio, amp, dur] of this.saturated() ? partials.slice(0, 2) : partials) {
        const o = this.ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = 196 * ratio
        const g = this.ctx.createGain()
        g.gain.setValueAtTime(amp, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + dur)
        o.connect(g).connect(this.master)
        o.start(t)
        o.stop(t + dur + 0.1)
        this.held(o, g)
      }
      return
    }
    this.chime(base, 0)
  }

  /** Warm rising chime — roost arrival / star reveal. */
  chime(baseFreq = 440, delay = 0): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    for (const ratio of this.saturated() ? [1] : [1, 1.5, 2]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = baseFreq * ratio
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.09, t + 0.4)
      g.gain.exponentialRampToValueAtTime(0.001, t + 2.2)
      o.connect(g).connect(this.master)
      o.start(t)
      o.stop(t + 2.3)
      this.held(o, g)
    }
  }

  /** Gradually warm the tone bed as the flock nears home (brighter, softer Q). */
  warmth(amount01: number): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    // DayScene calls this every frame while finishing, and the arrival ceremony
    // shapes the master over twelve seconds — without this the ceremony's swell
    // was overwritten sixty times a second and never audibly happened
    if (t < this.mixHoldUntil) return
    this.master.gain.setTargetAtTime(0.34 + amount01 * 0.08, t, 1.2)
  }

  // =========================================================================
  // NIGHT-MOTHS — a parasite, so it is heard as a WEIGHT, not as an alarm
  // =========================================================================

  private mothSrc: AudioBufferSourceNode | null = null
  private mothGain: GainNode | null = null
  private mothFilter: BiquadFilterNode | null = null
  private mothLfo: OscillatorNode | null = null
  private mothLfoGain: GainNode | null = null
  private mothLoad = -1

  /** Moths land: a soft papery flutter, one per moth, quiet and close. */
  mothCling(count = 1): void {
    if (!this.ctx) return
    const n = Math.max(1, Math.min(4, count)) // more than four reads as noise, not as four
    for (let i = 0; i < n; i++) {
      if (!this.budget()) break
      // dry, dull and mid-band: a phone can hear this, and it must not be
      // mistaken for the bright mote chime or the flock's own chirps
      this.noiseShot(0.13 + Math.random() * 0.06, this.pv(520, 0.2), this.pv(240, 0.2), 0.055, 'bandpass', 2.2)
    }
  }

  /**
   * How much moth is on the flock, 0..1. Safe every frame: it only rebuilds
   * the drain voice when the load has genuinely moved, and it TEARS THE VOICE
   * DOWN at zero rather than leaving a loop running silently for the rest of
   * the run — a looping buffer source is real CPU on a phone even at gain 0.
   */
  setMothDrain(load01: number): void {
    if (!this.ctx || !this.noiseBuf) return
    const load = load01 > 1 ? 1 : load01 < 0 ? 0 : load01
    if (Math.abs(load - this.mothLoad) < 0.02) return
    this.mothLoad = load
    const ctx = this.ctx
    const t = ctx.currentTime
    if (load <= 0.02) {
      if (this.mothGain && this.mothSrc) {
        const g = this.mothGain
        const src = this.mothSrc
        const f = this.mothFilter
        const lfo = this.mothLfo
        const lg = this.mothLfoGain
        this.mothGain = null
        this.mothSrc = null
        this.mothFilter = null
        this.mothLfo = null
        this.mothLfoGain = null
        g.gain.setTargetAtTime(0, t, 0.35)
        src.stop(t + 1.4)
        lfo?.stop(t + 1.4)
        this.held(src, f, g)
        if (lfo) this.held(lfo, lg)
      }
      return
    }
    if (!this.mothGain) {
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuf
      src.loop = true
      src.playbackRate.value = 0.62 // slowed noise: heavier, more like wingskin
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 330
      f.Q.value = 3.4
      const g = ctx.createGain()
      g.gain.value = 0.0001
      // the flutter: an irregular tremor rather than a steady hiss, so it reads
      // as something ALIVE on the birds instead of as a filter setting
      const lfo = ctx.createOscillator()
      lfo.type = 'triangle'
      lfo.frequency.value = 7.4
      const lg = ctx.createGain()
      lg.gain.value = 140
      lfo.connect(lg).connect(f.frequency)
      src.connect(f).connect(g).connect(this.master)
      src.start(t)
      lfo.start(t)
      this.mothSrc = src
      this.mothGain = g
      this.mothFilter = f
      this.mothLfo = lfo
      this.mothLfoGain = lg
    }
    this.mothGain.gain.setTargetAtTime(0.03 + load * 0.075, t, 0.5)
    this.mothFilter?.frequency.setTargetAtTime(300 + load * 260, t, 0.6)
    this.mothLfo?.frequency.setTargetAtTime(6.5 + load * 5.5, t, 0.6)
  }

  /**
   * Moths shed. The relief has to be BIGGER than the cling was, or shaking
   * them off feels like nothing happened — so this is a rising exhale, not a
   * mirror of the landing sound.
   */
  mothShed(count = 1): void {
    if (!this.ctx) return
    const n = Math.max(1, Math.min(8, count))
    const s = Math.min(1, 0.35 + n * 0.12)
    this.noiseShot(0.34, this.pv(360), this.pv(1500), 0.09 * s, 'bandpass', 1.0)
    const ctx = this.ctx
    const t = ctx.currentTime
    const shift = Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
    // two rungs up the ladder — the flock is lighter, and the score says so
    for (const [f, d] of [
      [523.25, 0],
      [659.25, 0.07],
    ] as Array<[number, number]>) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f * shift
      const g = ctx.createGain()
      const at = t + d
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(0.045 * s, at + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0006, at + 0.55)
      o.connect(g).connect(this.master)
      o.start(at)
      o.stop(at + 0.6)
      this.held(o, g)
    }
  }

  // =========================================================================
  // THE LIGHT-THIEF — a corvid rattle, deliberately nothing like the falcon
  // =========================================================================

  /**
   * Its call while it shadows you. near01 brings it closer: louder, brighter,
   * and with more pulses in the rattle. The falcon is a falling sawtooth
   * SCREECH; this is a dry mid-band RATTLE, so a player never has to guess
   * which predator they are hearing.
   */
  thiefCall(near01 = 0.5): void {
    if (!this.ctx || !this.budget()) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const n = near01 > 1 ? 1 : near01 < 0 ? 0 : near01
    const pulses = 2 + Math.round(n * 2)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 700 + n * 500
    bp.Q.value = 3.2
    const bus = ctx.createGain()
    bus.gain.value = 0.05 + n * 0.11
    bp.connect(bus).connect(this.master)
    for (let i = 0; i < pulses; i++) {
      const at = t0 + i * (0.115 + Math.random() * 0.03)
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.setValueAtTime(this.pv(310, 0.07), at)
      o.frequency.exponentialRampToValueAtTime(this.pv(210, 0.07), at + 0.07)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(0.5 - i * 0.06, at + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0006, at + 0.075)
      o.connect(g).connect(bp)
      o.start(at)
      o.stop(at + 0.09)
      // the shared bus is torn down with the LAST pulse only
      if (i === pulses - 1) this.held(o, g, bp, bus)
      else this.held(o, g)
    }
  }

  /**
   * The theft. The ladder run backwards, fast, with the bed sucked out under
   * it: unmistakably the collect sound in reverse, which is the only way to
   * say "that light was yours" without a word of UI.
   */
  thiefTheft(amount01 = 1): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const s = Math.max(0.35, Math.min(1, amount01))
    this.hush(0.09, 0.5, 'wings') // barely a lead — a theft is sudden by nature
    const shift = Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
    for (let i = 0; i < 5; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = Math.min(LADDER[6 - i] * shift, CEIL_HZ)
      const g = ctx.createGain()
      const at = t + i * 0.045
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(0.055 * s, at + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0006, at + 0.2)
      o.connect(g).connect(this.master)
      o.start(at)
      o.stop(at + 0.22)
      this.held(o, g)
    }
    // the suck: a rush that runs DOWN, the inverse of every good thing here
    this.noiseShot(0.4, this.pv(1600), this.pv(260), 0.1 * s, 'bandpass', 1.4)
  }

  /**
   * It disgorges the hoard. This is a payout, so it is the ladder forwards,
   * wide and fast — the run's most generous sound after the arrival itself.
   * Voice count is capped hard: a hoard of thirty motes must not become thirty
   * simultaneous oscillators on a phone.
   */
  thiefDisgorge(count = 6): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const n = Math.max(1, Math.min(this.crowded() ? 4 : 10, count))
    const shift = Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
    this.mixHoldUntil = Math.max(this.mixHoldUntil, t + 2.4)
    const bells = this.layerGains.get('bells')
    bells?.gain.cancelScheduledValues(t)
    bells?.gain.setTargetAtTime(Math.min(1.5, this.bellsTarget * 1.5 + 0.2), t, 0.15)
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = Math.min(LADDER[Math.min(i, LADDER.length - 1)] * shift, CEIL_HZ)
      const g = ctx.createGain()
      const at = t + i * 0.062
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(0.06, at + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0006, at + 0.34)
      o.connect(g).connect(this.master)
      o.start(at)
      o.stop(at + 0.36)
      this.held(o, g)
    }
    this.restoreLayers(t + 2.4, 0.9)
    this.chainResolve(Math.max(6, n))
  }

  // =========================================================================
  // THE CAGE — strain, failure, wreckage, and the birds that come out of it
  // =========================================================================

  private cageHushed = false

  /**
   * The mount straining. Call repeatedly as the charge builds; the sound tenses
   * with it, and past ~0.8 it opens the pre-beat silence window on its own, so
   * the break lands into a hole whatever the caller remembers to do.
   */
  cageStrain(charge01: number): void {
    if (!this.ctx) return
    const c = charge01 > 1 ? 1 : charge01 < 0 ? 0 : charge01
    if (c < 0.15) this.cageHushed = false
    if (c > 0.8 && !this.cageHushed) {
      this.cageHushed = true
      // the world gets quiet BEFORE the thing breaks, which is what makes the
      // break expensive; 'wings' survives so the moment is not a dropout
      this.hush(HUSH_LEAD, 0.9, 'wings')
    }
    if (!this.budget()) return
    const ctx = this.ctx
    const t = ctx.currentTime
    // metal, not wood: a high inharmonic pair over a groaning low, so the cage
    // and the brittle curtains are never confused for each other
    for (const [ratio, amp] of [
      [1, 0.05 + c * 0.05],
      [2.76, 0.02 + c * 0.03],
    ] as Array<[number, number]>) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      const f = this.pv((190 + c * 150) * ratio, 0.03)
      o.frequency.setValueAtTime(f, t)
      o.frequency.linearRampToValueAtTime(f * (1.06 + c * 0.1), t + 0.18)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(amp, t + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0006, t + 0.2)
      o.connect(g).connect(this.master)
      o.start(t)
      o.stop(t + 0.22)
      this.held(o, g)
    }
  }

  /**
   * THE CAGE GIVES WAY — the full life cycle in one scheduled call, so the
   * caller cannot get the ordering wrong: the failure snaps, the wreck falls
   * away over the next second, and the freed birds rise out of the hole a beat
   * later. Everything is scheduled on the audio clock rather than on game
   * timers, so a paused or stuttering frame cannot desynchronise it.
   */
  cageBreak(freed = 8): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const n = Math.max(1, Math.min(24, freed))
    this.cageHushed = false
    this.mixHoldUntil = Math.max(this.mixHoldUntil, t + 2.8)

    // 1) THE FAILURE — one hard metal snap
    this.noiseShot(0.16, this.pv(2600), this.pv(700), 0.28, 'bandpass', 0.9)
    for (const [ratio, amp, dur] of [
      [1, 0.12, 0.9],
      [2.41, 0.06, 0.6],
      [3.83, 0.035, 0.4],
    ] as Array<[number, number, number]>) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = 330 * ratio
      const g = ctx.createGain()
      g.gain.setValueAtTime(amp, t)
      g.gain.exponentialRampToValueAtTime(0.0006, t + dur)
      o.connect(g).connect(this.master)
      o.start(t)
      o.stop(t + dur + 0.05)
      this.held(o, g)
    }

    // 2) THE WRECK FALLING — scattered low knocks over the next second. A
    // sound that appears and vanishes has no weight; the debris is the decay.
    const debris = this.crowded() ? 2 : 5
    for (let i = 0; i < debris; i++) {
      const at = t + 0.14 + i * 0.13 + Math.random() * 0.09
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(this.pv(240, 0.25), at)
      o.frequency.exponentialRampToValueAtTime(90, at + 0.16)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.075 - i * 0.011, at)
      g.gain.exponentialRampToValueAtTime(0.0006, at + 0.2)
      o.connect(g).connect(this.master)
      o.start(at)
      o.stop(at + 0.22)
      this.held(o, g)
    }

    // 3) THE BIRDS RISING — a climbing pentatonic cascade whose length is the
    // number of birds you actually freed, so a big cage sounds like a big win
    const shift = Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
    const rungs = Math.min(this.crowded() ? 4 : LADDER.length, 3 + Math.round(n / 3))
    for (let i = 0; i < rungs; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = Math.min(LADDER[i] * shift, CEIL_HZ)
      const g = ctx.createGain()
      const at = t + 0.42 + i * 0.07
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(0.05, at + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0006, at + 0.5)
      o.connect(g).connect(this.master)
      o.start(at)
      o.stop(at + 0.52)
      this.held(o, g)
    }
    this.noiseShot(0.5, this.pv(300), this.pv(1300), 0.09, 'bandpass', 0.9)
    this.restoreLayers(t + 1.5, 0.8)
    this.mixHoldUntil = Math.max(this.mixHoldUntil, t + 2.4)
  }

  // =========================================================================
  // THE CHECKPOINT RETURN — a loss that names itself, and the flight back
  // =========================================================================

  /**
   * The loss toll. Same pentatonic set, but centred on E rather than G, which
   * turns the world's key into its own relative minor — grief without a single
   * note that could clash with anything already sounding.
   *
   * The CAUSE picks the timbre, so a player can hear what killed them before
   * the text arrives: the dark is a slow swallowed bell, stone is a dead thud
   * with no ring, the falcon keeps its throat, and a plain scatter is a hollow
   * fifth that simply empties out.
   */
  lossToll(cause: 'dark' | 'stone' | 'falcon' | 'scatter' = 'scatter'): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    this.mixHoldUntil = Math.max(this.mixHoldUntil, t + 4.5)
    this.duckFor(4000)
    for (const layer of STEM_LAYERS) {
      const g = this.layerGains.get(layer)
      if (!g) continue
      g.gain.cancelScheduledValues(t)
      g.gain.setTargetAtTime(layer === 'wings' ? 0.14 : 0.01, t, 0.35)
    }
    // E minor pentatonic — the same five notes the whole game is built from
    const shift = Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
    const cfg =
      cause === 'dark'
        ? { f: 329.63, ring: 3.4, bright: 0.35, edge: 0.0 }
        : cause === 'stone'
          ? { f: 293.66, ring: 0.55, bright: 0.2, edge: 0.34 }
          : cause === 'falcon'
            ? { f: 392, ring: 1.6, bright: 0.8, edge: 0.22 }
            : { f: 246.94, ring: 2.4, bright: 0.45, edge: 0.0 }
    const toll: Array<[number, number]> = [
      [1, 0.13],
      [1.5, 0.05],
      [2.02, 0.03 * cfg.bright],
    ]
    for (const [ratio, amp] of this.saturated() ? toll.slice(0, 1) : toll) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = cfg.f * shift * ratio
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(amp, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0005, t + cfg.ring)
      o.connect(g).connect(this.master)
      o.start(t)
      o.stop(t + cfg.ring + 0.1)
      this.held(o, g)
    }
    if (cfg.edge > 0) this.noiseShot(0.22, this.pv(900), this.pv(180), cfg.edge, 'lowpass', 0.8)
    // and then nothing: the pause after the toll is the point
  }

  /**
   * The flock flies back in. The one job here is to make a retry feel like
   * being handed something rather than being sent back — so it RISES, and the
   * mix comes home with it.
   */
  flockReturns(count = 60): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const s = Math.min(1, count / 110)
    this.duckFor(0) // the toll's duck ends HERE, not on its own schedule
    // wingbeats arriving from off-stage: quiet, then near
    this.noiseShot(1.1, this.pv(240), this.pv(900), 0.11, 'bandpass', 0.8)
    const shift = Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
    // G, D, G — an open, unambiguous "we are back", no minor third anywhere
    const back: Array<[number, number]> = [
      [196, 0],
      [293.66, 0.28],
      [392, 0.56],
    ]
    for (const [f, d] of this.saturated() ? back.slice(0, 1) : back) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = f * shift
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.setValueAtTime(500, t + d)
      lp.frequency.linearRampToValueAtTime(2200, t + d + 1.2)
      const g = ctx.createGain()
      const at = t + d
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(0.055 + 0.02 * s, at + 0.25)
      g.gain.exponentialRampToValueAtTime(0.0006, at + 2.2)
      o.connect(lp).connect(g).connect(this.master)
      o.start(at)
      o.stop(at + 2.3)
      this.held(o, lp, g)
    }
    this.mixHoldUntil = 0
    this.restoreLayers(t + 0.4, 1.1)
    this.updateHoldNote()
  }

  // =========================================================================
  // CEREMONIES — departure and arrival
  // =========================================================================

  /**
   * The tree empties. Silence first, then one call, then the air fills: the
   * departure is the player's first lesson that this score gets out of the way
   * before anything important happens.
   */
  departureCeremony(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    this.mixHoldUntil = Math.max(this.mixHoldUntil, t + 4.0)
    this.duckFor(1800)
    for (const layer of STEM_LAYERS) {
      const g = this.layerGains.get(layer)
      if (!g) continue
      g.gain.cancelScheduledValues(t)
      g.gain.setValueAtTime(0.01, t)
    }
    const shift = Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
    // one bird calls, and then the whole tree answers
    const call: Array<[number, number, number, number]> = [
      [587.33, 0.25, 0.075, 1.6],
      [392, 0.6, 0.065, 1.9],
      [784, 1.35, 0.05, 2.2],
      [293.66, 1.35, 0.05, 2.6],
    ]
    for (const [f, d, amp, dur] of this.saturated() ? call.slice(0, 2) : call) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f * shift
      const g = ctx.createGain()
      const at = t + d
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(amp, at + 0.12)
      g.gain.exponentialRampToValueAtTime(0.0006, at + dur)
      o.connect(g).connect(this.master)
      o.start(at)
      o.stop(at + dur + 0.1)
      this.held(o, g)
    }
    // the lift-off itself: hundreds of wings, arriving late and swelling
    this.noiseShot(1.6, this.pv(200), this.pv(1100), 0.13, 'bandpass', 0.7)
    const wings = this.layerGains.get('wings')
    wings?.gain.setTargetAtTime(this.wingsTarget * 1.35, t + 1.2, 0.5)
    this.restoreLayers(t + 3.0, 1.2)
  }

  /**
   * How the day ended, told in sound alone. The three grades must be
   * distinguishable with the screen off, so they differ in the two things ears
   * separate best — whether the phrase RESOLVES, and whether it has a third:
   *
   *   GOLDEN  — full major triad, rising, resolving up. The only complete
   *             cadence in the game.
   *   HARRIED — the same root and fifth with the third missing and the top
   *             note falling away unanswered: home, but hollow.
   *   HUNTED  — the same five notes centred on E instead of G, no resolution,
   *             and the wind left running underneath. It does not finish.
   */
  arrivalCeremony(grade: 'golden' | 'harried' | 'hunted'): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    // silence first, always — the arrival is the most expensive moment here
    this.mixHoldUntil = Math.max(this.mixHoldUntil, t + 12)
    this.duckFor(3000)
    for (const layer of STEM_LAYERS) {
      const g = this.layerGains.get(layer)
      if (!g) continue
      g.gain.cancelScheduledValues(t)
      g.gain.setTargetAtTime(layer === 'wings' && grade === 'hunted' ? 0.3 : 0.02, t, 0.14)
    }
    this.holdGain?.gain.setTargetAtTime(grade === 'hunted' ? 0.06 : 0.0001, t, 0.4)
    this.roostProx = 1
    const shift = Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
    const t0 = t + 0.55 // the hole the ceremony lands into

    // [freq, delay, peak, attack, dur]
    const golden: Array<[number, number, number, number, number]> = [
      [196, 0, 0.06, 0.5, 7],
      [293.66, 0.35, 0.055, 0.5, 6.5],
      [392, 0.7, 0.06, 0.4, 6],
      [493.88, 1.15, 0.05, 0.5, 5.5], // the third — GOLDEN alone gets it
      [587.33, 1.6, 0.05, 0.4, 5],
      [784, 2.2, 0.045, 0.3, 4.5],
    ]
    const harried: Array<[number, number, number, number, number]> = [
      [196, 0, 0.055, 0.6, 5],
      [293.66, 0.45, 0.05, 0.6, 4.4],
      [392, 0.95, 0.045, 0.5, 3.6],
      [587.33, 1.9, 0.032, 0.5, 2.0], // reaches, then simply stops
    ]
    const hunted: Array<[number, number, number, number, number]> = [
      [164.81, 0, 0.055, 0.9, 6],
      [246.94, 0.8, 0.042, 0.9, 5],
      [329.63, 2.0, 0.036, 1.1, 4], // an unanswered question, left hanging
    ]
    const full = grade === 'golden' ? golden : grade === 'harried' ? harried : hunted
    // the root, the fifth and the top note are the grade; the inner voices are
    // colour, and colour is what yields when the graph is already saturated
    const plan = this.saturated() ? full.slice(0, 3) : full
    for (const [f, d, peak, atk, dur] of plan) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = f * shift
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      // GOLDEN opens up as it rises; HUNTED closes down as it fades
      lp.frequency.setValueAtTime(grade === 'hunted' ? 1400 : 700, t0 + d)
      lp.frequency.linearRampToValueAtTime(grade === 'hunted' ? 420 : 2800, t0 + d + dur * 0.7)
      const g = ctx.createGain()
      const at = t0 + d
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(peak, at + atk)
      g.gain.linearRampToValueAtTime(peak * 0.6, at + dur * 0.7)
      g.gain.linearRampToValueAtTime(0.0001, at + dur)
      o.connect(lp).connect(g).connect(this.master)
      o.start(at)
      o.stop(at + dur + 0.1)
      this.held(o, lp, g)
    }
    // GOLDEN is the one moment the score is allowed to be bright and loud
    if (grade === 'golden') {
      this.master.gain.cancelScheduledValues(t)
      this.master.gain.setTargetAtTime(0.5, t0, 1.2)
      // the chimes are spaced 0.42s apart, so this only ever trims the tail
      for (let i = 0; i < (this.crowded() ? 2 : 5); i++) {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = Math.min(LADDER[5 + i] * shift, CEIL_HZ)
        const g = ctx.createGain()
        const at = t0 + 2.6 + i * 0.42
        g.gain.setValueAtTime(0, at)
        g.gain.linearRampToValueAtTime(0.04, at + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0006, at + 2.4)
        o.connect(g).connect(this.master)
        o.start(at)
        o.stop(at + 2.5)
        this.held(o, g)
      }
    } else if (grade === 'hunted') {
      // no cadence and no chime — just the wind the flock arrived in
      this.master.gain.setTargetAtTime(0.3, t, 2.0)
      this.noiseFilter.frequency.setTargetAtTime(260, t, 1.6)
      this.noiseFilter.Q.setTargetAtTime(0.5, t, 1.6)
    }
  }

  // =========================================================================
  // THE TUNNEL — speed, prompts under pressure, and the way out
  // =========================================================================

  private tunSrc: AudioBufferSourceNode | null = null
  private tunFilter: BiquadFilterNode | null = null
  private tunGain: GainNode | null = null
  private tunSpeed = 0

  /**
   * Into the tunnel. Silence, then the world CLOSES: the open bed is replaced
   * by a narrow resonant rush whose pitch rides the flock's speed. The contrast
   * is the whole effect, so the hush is not optional here.
   */
  tunnelEnter(): void {
    if (!this.ctx || !this.noiseBuf) return
    const ctx = this.ctx
    const t = ctx.currentTime
    // A plain hush() would schedule its own restore and bring the open sky back
    // half a second into the tunnel. The tunnel holds the layers DOWN for its
    // whole length instead, and tunnelBreakthrough/tunnelAbort are the only
    // things that give them back.
    this.mixHoldUntil = t + 1e6
    this.duckFor(HUSH_LEAD * 1000)
    for (const layer of STEM_LAYERS) {
      const g = this.layerGains.get(layer)
      if (!g) continue
      g.gain.cancelScheduledValues(t)
      g.gain.setTargetAtTime(0.015, t, HUSH_LEAD / 3)
    }
    this.holdGain?.gain.setTargetAtTime(0.07, t, 0.12) // one thing keeps sounding
    this.roostProx = 0.82 // home is close now, whatever the x axis says
    if (this.tunGain) return
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 260
    f.Q.value = 5.5 // narrow and resonant: stone close on both sides
    const g = ctx.createGain()
    g.gain.value = 0.0001
    src.connect(f).connect(g).connect(this.master)
    src.start(t)
    g.gain.setTargetAtTime(0.34, t + HUSH_LEAD, 0.45)
    this.tunSrc = src
    this.tunFilter = f
    this.tunGain = g
  }

  /**
   * The tunnel's speed, 0..1. Allocation-free and safe every frame — like the
   * rest of the per-frame surface it only writes a param when the value moved,
   * because sixty automation events a second buys nothing a player can hear.
   */
  setTunnelSpeed(p01: number): void {
    const p = p01 > 1 ? 1 : p01 < 0 ? 0 : p01
    if (Math.abs(p - this.tunSpeed) < 0.015) return
    this.tunSpeed = p
    if (!this.ctx || !this.tunGain) return
    const t = this.ctx.currentTime
    this.tunFilter?.frequency.setTargetAtTime(260 + p * 900, t, 0.18)
    this.tunFilter?.Q.setTargetAtTime(5.5 + p * 6, t, 0.25)
    this.tunGain.gain.setTargetAtTime(0.3 + p * 0.28, t, 0.2)
    if (this.tunSrc) this.tunSrc.playbackRate.setTargetAtTime(0.85 + p * 0.9, t, 0.25)
  }

  /**
   * A verb prompt appears with a clock on it. The tick climbs the ladder as the
   * window closes, so urgency is heard as PITCH and not as volume — volume is
   * the one axis a phone speaker in a noisy room cannot deliver.
   */
  tunnelPrompt(urgency01 = 0): void {
    if (!this.ctx || !this.budget()) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const u = urgency01 > 1 ? 1 : urgency01 < 0 ? 0 : urgency01
    const shift = Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = Math.min(LADDER[Math.min(LADDER.length - 1, Math.round(u * 5) + 2)] * shift, CEIL_HZ)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1400
    bp.Q.value = 1.6
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.03 + u * 0.02, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.09)
    o.connect(bp).connect(g).connect(this.master)
    o.start(t)
    o.stop(t + 0.1)
    this.held(o, bp, g)
  }

  /** Prompt answered — a rung of the same ladder the motes climb, so the two
   * reward systems are audibly the same currency. */
  tunnelPromptHit(streak = 1): void {
    this.collectBloom(Math.max(1, streak))
  }

  /** Prompt missed. Not a buzzer: the tunnel simply narrows on you for a beat. */
  tunnelPromptMiss(): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.tunFilter?.Q.setTargetAtTime(16, t, 0.06)
    this.tunFilter?.Q.setTargetAtTime(5.5 + this.tunSpeed * 6, t + 0.35, 0.3)
    this.chainBreak(3)
  }

  /**
   * OUT. The loudest silence in the game: everything stops for a third of a
   * second, then the walls are gone — the resonant rush is replaced by open
   * air and the whole score comes back at once.
   */
  tunnelBreakthrough(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    // 1) the walls close to nothing — the buildup is a REMOVAL
    if (this.tunGain && this.tunSrc) {
      const g = this.tunGain
      const src = this.tunSrc
      const f = this.tunFilter
      this.tunGain = null
      this.tunSrc = null
      this.tunFilter = null
      this.tunSpeed = 0
      g.gain.cancelScheduledValues(t)
      g.gain.setTargetAtTime(0.0001, t, 0.09)
      src.stop(t + 0.9)
      this.held(src, f, g)
    }
    // 2) the impact, into the hole
    this.noiseShot(1.5, this.pv(340), this.pv(2600), 0.2, 'bandpass', 0.6)
    const shift = Math.pow(2, ACT_SEMIS[this.actIdx] / 12)
    const at0 = t + 0.3
    for (const [ratio, amp] of [
      [1, 0.07],
      [1.5, 0.055],
      [2, 0.05],
      [3, 0.035],
    ] as Array<[number, number]>) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = 392 * shift * ratio
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.setValueAtTime(600, at0)
      lp.frequency.linearRampToValueAtTime(3000, at0 + 1.1)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, at0)
      g.gain.linearRampToValueAtTime(amp, at0 + 0.16)
      g.gain.linearRampToValueAtTime(amp * 0.5, at0 + 2.2)
      g.gain.linearRampToValueAtTime(0.0001, at0 + 4.2)
      o.connect(lp).connect(g).connect(this.master)
      o.start(at0)
      o.stop(at0 + 4.3)
      this.held(o, lp, g)
    }
    // 3) the decay: the sky comes back and the score with it
    this.roostProx = -1
    this.unhush(0.8)
  }

  /** Bail-out for the tunnel state if the run ends inside it (fail, restart). */
  tunnelAbort(): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    if (this.tunGain && this.tunSrc) {
      const g = this.tunGain
      const src = this.tunSrc
      const f = this.tunFilter
      this.tunGain = null
      this.tunSrc = null
      this.tunFilter = null
      this.tunSpeed = 0
      g.gain.setTargetAtTime(0.0001, t, 0.2)
      src.stop(t + 1.0)
      this.held(src, f, g)
    }
    this.roostProx = -1
    this.unhush(1.0)
  }

  /**
   * Everything the run owns, released. A restart that leaves the moth drain,
   * the tunnel rush, the held note and a pending hush timer alive from the
   * previous attempt is the exact shape of a leak that only shows up on the
   * fourth retry, on a phone, as a dead battery.
   */
  resetRun(): void {
    this.setMothDrain(0)
    this.tunnelAbort() // also clears mixHoldUntil and the chirp duck via unhush
    this.dayLight = 1
    this.lastMixDay = -1
    this.lastMixFlock = -1
    this.chainLen = 0
    this.cageHushed = false
    this.roostProx = -1
    this.roostTimer = 3.5
    // The arrival ceremony holds the mix down for twelve seconds. Restarting
    // inside that window used to begin the next run in near-silence with no way
    // to tell why, so the hold is dropped explicitly rather than waited out.
    this.mixHoldUntil = 0
    this.updateHoldNote()
    this.applyMix(0.4)
    if (this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime)
      this.master.gain.setTargetAtTime(0.42, this.ctx.currentTime, 0.6)
      this.noiseFilter.Q.setTargetAtTime(0.6, this.ctx.currentTime, 0.6)
    }
  }

  private tween(param: AudioParam, to: number, seconds: number): void {
    if (!this.ctx) return
    param.setTargetAtTime(to, this.ctx.currentTime, seconds / 3)
  }
}
