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
const STEM_LAYERS = ['pad', 'bells', 'wings'] as const

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
    this.tween(this.master.gain, 0.22, 2.5)

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
    this.noiseGain.gain.value = 0.5
    const wingsLayer = ctx.createGain()
    this.layerGains.set('wings', wingsLayer)
    src.connect(this.noiseFilter).connect(this.noiseGain).connect(wingsLayer).connect(this.master)
    src.start()

    // ---- pad layer: warm slow-detuned bank through a lowpass (or a stem)
    const padGain = ctx.createGain()
    padGain.gain.value = 0.055
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
      }
    }
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
  musicTick(dt: number, progress01: number): void {
    if (!this.ctx || this.stems.has('bells')) return
    this.progress01 = progress01
    this.bellTimer -= dt
    if (this.bellTimer > 0) return
    this.bellTimer = 5.2 - progress01 * 3.1 + Math.random() * 2.4
    const scale = [392, 440, 523.3, 587.3, 659.3, 784]
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
    g.gain.linearRampToValueAtTime(0.045 + progress01 * 0.02, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4)
    const hg = this.ctx.createGain()
    hg.gain.setValueAtTime(0.012, t)
    hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1)
    const dest = this.layerGains.get('bells') ?? this.master
    o.connect(g).connect(dest)
    h.connect(hg).connect(dest)
    o.start(t)
    h.start(t)
    o.stop(t + 2.5)
    h.stop(t + 1.2)
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
    const freq = 380 + gather * 420 - spread * 140 + speed * 160 + this.gStrain * 260
    const q = 0.5 + gather * 1.6 + spread * 0.3 + this.gStrain * 1.4
    this.noiseFilter.frequency.setTargetAtTime(freq, t, 0.4)
    this.noiseFilter.Q.setTargetAtTime(q, t, 0.4)
    this.noiseGain.gain.setTargetAtTime(0.35 + gather * 0.25 + speed * 0.15 - this.sStrain * 0.12, t, 0.5)
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
      }
    } else if (kind === 'spread') {
      // airy exhale bloom
      this.noiseShot(0.3, this.pv(850), this.pv(1700), 0.1, 'highpass', 0.8)
    } else {
      // relieved settling
      this.noiseShot(0.22, this.pv(600), this.pv(320), 0.06, 'lowpass')
    }
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
  }

  /** The homecoming: the fullest musical moment — a slow warm chord swell. */
  homeSwell(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    this.master.gain.setTargetAtTime(0.3, t, 2.0)
    // slow major-add9 pad blooming under everything
    const notes = [196, 246.9, 293.7, 392, 440]
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
    this.master.gain.setTargetAtTime(0.22, t + 1.2, 0.9)
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
    this.master.gain.setTargetAtTime(0.22, this.ctx.currentTime, 1.4)
  }

  /** Musical bloom when birds join — bigger groups, bigger chord. */
  collectBloom(count: number): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const notes = count >= 8 ? [1, 1.25, 1.5, 2] : count >= 3 ? [1, 1.25, 1.5] : [1, 1.5]
    const base = 392
    notes.forEach((ratio, i) => {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = base * ratio
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t + i * 0.05)
      g.gain.linearRampToValueAtTime(0.05 + Math.min(count, 12) * 0.004, t + i * 0.05 + 0.06)
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.9)
      o.connect(g).connect(this.master)
      o.start(t + i * 0.05)
      o.stop(t + i * 0.05 + 1)
    })
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
      for (const [ratio, amp, dur] of [
        [1, 0.16, 2.6],
        [2.02, 0.09, 1.9],
        [2.94, 0.05, 1.3],
        [4.4, 0.03, 0.8],
      ] as Array<[number, number, number]>) {
        const o = this.ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = 196 * ratio
        const g = this.ctx.createGain()
        g.gain.setValueAtTime(amp, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + dur)
        o.connect(g).connect(this.master)
        o.start(t)
        o.stop(t + dur + 0.1)
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
    for (const ratio of [1, 1.5, 2]) {
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
    }
  }

  /** Gradually warm the tone bed as the flock nears home (brighter, softer Q). */
  warmth(amount01: number): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(0.22 + amount01 * 0.06, t, 1.2)
  }

  private tween(param: AudioParam, to: number, seconds: number): void {
    if (!this.ctx) return
    param.setTargetAtTime(to, this.ctx.currentTime, seconds / 3)
  }
}
