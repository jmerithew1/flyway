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
      // The flock sandbox is a development scene and must not be reachable
      // from a shipped URL — ?sandbox exposed an unfinished screen to anyone
      // who guessed the query string.
      params.has('sandbox') && location.hostname === 'localhost'
        ? 'Sandbox'
        : params.has('day')
          ? 'Day'
          : params.has('map')
            ? 'FlywayMap'
            : 'Title',
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

  // ROTATION LEAVES THE CANVAS STALE, AND THE GAME ENDS UP IN A FIFTH OF THE
  // SCREEN. Portrait is blocked, so the game itself TELLS the player to rotate
  // — and doing exactly that was the thing that broke it: measured at 844x390,
  // a portrait->landscape round trip left the canvas 390x180 letterboxed at
  // (227,104), i.e. 21% of the screen, with black on all four sides. Phaser's
  // parentSize was correct; only displaySize was stale, and refresh() fixes it
  // instantly. Debounced because a rotation fires several resize events.
  let refreshT = 0
  const refit = (): void => {
    window.clearTimeout(refreshT)
    refreshT = window.setTimeout(() => game.scale.refresh(), 120)
  }
  window.addEventListener('resize', refit)
  window.addEventListener('orientationchange', refit)
  screen.orientation?.addEventListener?.('change', refit)

  // AND THE WORLD MUST NOT RUN BEHIND THE NOTICE. The portrait block hides the
  // canvas in CSS but the simulation kept going: 30s in portrait cost 3.5
  // daylight and closed the fog by 533px, so a player who turned their phone
  // came back to a run they had already partly lost, invisibly.
  const portrait = window.matchMedia('(orientation: portrait) and (max-width: 900px)')
  const gate = (): void => {
    if (portrait.matches) game.loop.sleep()
    else {
      game.loop.wake()
      refit()
    }
  }
  portrait.addEventListener('change', gate)
  gate()
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
