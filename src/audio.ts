/**
 * Restrained procedural audio — no samples, everything synthesized with
 * WebAudio. A continuous filtered-noise "wing" bed that brightens on Gather
 * and widens on Spread, soft collision thuds, and a warm chime at the roost.
 */
export class GameAudio {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private noiseGain!: GainNode
  private noiseFilter!: BiquadFilterNode
  private started = false

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
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    this.noiseFilter = ctx.createBiquadFilter()
    this.noiseFilter.type = 'bandpass'
    this.noiseFilter.frequency.value = 420
    this.noiseFilter.Q.value = 0.6
    this.noiseGain = ctx.createGain()
    this.noiseGain.gain.value = 0.5
    src.connect(this.noiseFilter).connect(this.noiseGain).connect(this.master)
    src.start()
  }

  /** form: -1 spread .. 0 neutral .. 1 gather. speed: rough flock speed 0..1 normalized. */
  setFlockState(form: number, speed: number): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const gather = Math.max(form, 0)
    const spread = Math.max(-form, 0)
    // gather: brighter, tighter, faster rush. spread: lower, airier, wider (via Q)
    const freq = 380 + gather * 420 - spread * 140 + speed * 160
    const q = 0.5 + gather * 1.6 + spread * 0.3
    this.noiseFilter.frequency.setTargetAtTime(freq, t, 0.4)
    this.noiseFilter.Q.setTargetAtTime(q, t, 0.4)
    this.noiseGain.gain.setTargetAtTime(0.35 + gather * 0.25 + speed * 0.15, t, 0.5)
  }

  /** Soft thud/scatter sound on a bird-loss event. */
  collisionThump(): void {
    if (!this.ctx) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(180, t)
    o.frequency.exponentialRampToValueAtTime(60, t + 0.18)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.18, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
    o.connect(g).connect(this.master)
    o.start(t)
    o.stop(t + 0.25)
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
