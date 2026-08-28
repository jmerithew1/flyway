// THROWAWAY verification harness for src/hud.ts — delete after screenshots.
import Phaser from 'phaser'
import { W, H, paintBackdrop } from './backdrop'
import { createCoreTextures } from './textures'
import { AbilityBar } from './hud'
import { isTouch, touchLayout, TouchControls } from './touch'
import { safeArea } from './ui'

class HarnessScene extends Phaser.Scene {
  bar!: AbilityBar
  constructor() {
    super('Harness')
  }
  create(): void {
    createCoreTextures(this)
    paintBackdrop(this)
    this.add.image(0, 0, 'backdrop').setOrigin(0).setDisplaySize(W, H).setDepth(0)
    if (isTouch) new TouchControls(this)
    this.bar = new AbilityBar(this)
    const w = window as unknown as Record<string, unknown>
    w.__bar = this.bar
    w.__harness = this
    w.__safe = safeArea(this)
    w.__pads = touchLayout(safeArea(this))
  }
  update(_t: number, delta: number): void {
    this.bar.update(Math.min(0.05, delta / 1000))
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  backgroundColor: '#3f3760',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 4 },
  scene: [HarnessScene],
})
;(window as unknown as Record<string, unknown>).__game = game
