import Phaser from 'phaser'
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

Promise.all([
  fetch('assets/processed/falcon.png', { method: 'HEAD' })
    .then((r) => {
      ;(window as unknown as Record<string, unknown>).__hasFalconArt = r.ok
    })
    .catch(() => {
      ;(window as unknown as Record<string, unknown>).__hasFalconArt = false
    }),
  fontsReady,
]).finally(() => {
  const game = new Phaser.Game(config)
  // debug handle for the headless verification harness
  ;(window as unknown as Record<string, unknown>).__game = game
  // failsafe: never leave the player staring at a veil if a load stalls
  window.setTimeout(dismissBootVeil, 8000)
})

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1536,
  height: 960,
  backgroundColor: '#3f3760',
  scale: {
    // FIT letterboxed 26% of a landscape phone away (audit: mobile-pillarbox).
    // ENVELOP fills the viewport and lets the extra width show more world,
    // which is exactly right for a side-scroller; desktop is unchanged
    // because its aspect already matches.
    mode: Phaser.Scale.ENVELOP,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // three simultaneous pointers: a GATHER thumb, a SPREAD thumb, and the
  // finger on the sky that does the steering (Phaser tracks one by default)
  input: { activePointers: 3 },
  scene: [BootScene, TitleScene, SandboxScene, DayScene, ResultsScene, FlywayMapScene],
}
