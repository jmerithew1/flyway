import Phaser from 'phaser'
import { createCoreTextures, loadArt } from './textures'
import { SandboxScene } from './scenes/SandboxScene'
import { DayScene } from './scenes/DayScene'
import { ResultsScene } from './scenes/ResultsScene'

class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload(): void {
    loadArt(this)
  }

  create(): void {
    createCoreTextures(this)
    const params = new URLSearchParams(window.location.search)
    this.scene.start(params.has('sandbox') ? 'Sandbox' : 'Day')
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 1536,
  height: 960,
  backgroundColor: '#3f3760',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, SandboxScene, DayScene, ResultsScene],
})
