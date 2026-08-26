import Phaser from 'phaser'
import { createCoreTextures, loadArt, resolveFalconTexture } from './textures'
import { SandboxScene } from './scenes/SandboxScene'
import { DayScene } from './scenes/DayScene'
import { TitleScene } from './scenes/TitleScene'
import { ResultsScene } from './scenes/ResultsScene'
import { FlywayMapScene } from './scenes/FlywayMapScene'

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
  new Phaser.Game(config)
})

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1536,
  height: 960,
  backgroundColor: '#3f3760',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, SandboxScene, DayScene, ResultsScene, FlywayMapScene],
}
