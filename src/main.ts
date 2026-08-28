import Phaser from 'phaser'
import { W as VIEW_W, H as VIEW_H } from './backdrop'
import { createCoreTextures, loadArt, resolveFalconTexture } from './textures'
import { SandboxScene } from './scenes/SandboxScene'
import { DayScene } from './scenes/DayScene'
import { TitleScene } from './scenes/TitleScene'
import { ResultsScene } from './scenes/ResultsScene'
import { FlywayMapScene } from './scenes/FlywayMapScene'

/** Fade out the branded boot veil in index.html and take it out of the DOM. */
function dismissBootVeil(): void {
  const veil = document.getElementById('boot-veil')
  if (!veil) return
  veil.classList.add('gone')
  window.setTimeout(() => veil.remove(), 700)
}

class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload(): void {
    loadArt(this)
  }

  create(): void {
    createCoreTextures(this)
    resolveFalconTexture(this)
    // art is decoded and the first real scene is one line away: hand the
    // screen over from the wordmark veil to the game
    dismissBootVeil()
    const params = new URLSearchParams(window.location.search)
    this.scene.start(
      params.has('sandbox') ? 'Sandbox' : params.has('day') ? 'Day' : params.has('map') ? 'FlywayMap' : 'Title',
    )
  }
}

// pre-check the optional falcon art slot AND wait for webfonts, then boot —
// Phaser measures text at creation, so booting early bakes fallback metrics
const fontsReady = document.fonts
  ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))])
  : Promise.resolve()

Promise.all([fontsReady]).finally(() => {
  const game = new Phaser.Game(config)
  // debug handle for the headless verification harness
  ;(window as unknown as Record<string, unknown>).__game = game
  // failsafe: never leave the player staring at a veil if a load stalls
  window.setTimeout(dismissBootVeil, 8000)
})

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#3f3760',
  scale: {
    // FIT, not ENVELOP. ENVELOP covers the viewport and CROPS the remainder,
    // which cut the bottom controls off any phone wider than about 2.2:1 — a
    // Pixel in landscape lost roughly half its height and both formation pads.
    // Because the canvas width is now derived from the device's own aspect
    // (see backdrop.ts), FIT matches it almost exactly: no crop, and no bars
    // except on unusually tall viewports, where a small bar is far better than
    // an unreachable control.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // four simultaneous pointers: the left thumb on the floating joystick, a
  // right thumb on a formation pad, and room for the second right-hand digit
  // players use for chords (Phaser tracks one by default)
  input: { activePointers: 4 },
  scene: [BootScene, TitleScene, SandboxScene, DayScene, ResultsScene, FlywayMapScene],
}
