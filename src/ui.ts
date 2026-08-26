/**
 * Type system — one source of truth for every glyph the game draws.
 *
 * DISPLAY is a light geometric sans (Jost) used in wide-tracked caps for
 * titles, labels and buttons: the contemporary indie-UI voice that lets the
 * painted wordmark carry the brand. BODY is a high-contrast garamond used
 * sparingly, in italics, for the game's spoken lines — the flock's voice.
 * Both ship with system fallbacks so a blocked webfont never breaks layout.
 */

export const FONT_DISPLAY = '"Jost", "Century Gothic", "Avenir Next", "Segoe UI", system-ui, sans-serif'
export const FONT_BODY = '"Cormorant Garamond", "Iowan Old Style", Palatino, Georgia, serif'

export const INK = {
  bright: '#f6f1fa', // primary titles
  warm: '#f6d9b8', // earned / gold accents
  soft: '#c6bcd4', // secondary copy
  dim: '#96899f', // tertiary, unearned
  alert: '#e0a898', // low-flock warning
} as const

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle

/**
 * Touch devices render the 1536x960 canvas at roughly 0.4, so a 13px label
 * lands near 5 device px — unreadable (audit: mobile-text-below-legible-size).
 * Every size in the game flows through display()/voice(), so one ramp here
 * fixes the whole UI at once.
 */
const UI_SCALE = ((): number => {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  const touchy = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
  return coarse || touchy ? 1.65 : 1
})()

const sized = (px: number): string => `${Math.round(px * UI_SCALE)}px`

/** Wide-tracked geometric caps: titles, labels, buttons, HUD numerals. */
export function display(size: number, color: string = INK.bright, tracking = 0, weight: 300 | 400 | 500 = 400): TextStyle {
  return {
    fontFamily: FONT_DISPLAY,
    fontSize: sized(size),
    color,
    fontStyle: `${weight}`,
    letterSpacing: tracking,
  } as TextStyle
}

/** The game's spoken voice: italic garamond, for prompts and story lines. */
export function voice(size: number, color: string = INK.soft, tracking = 0): TextStyle {
  return {
    fontFamily: FONT_BODY,
    fontSize: sized(size),
    color,
    fontStyle: 'italic 300',
    letterSpacing: tracking,
  } as TextStyle
}

/**
 * Visible logical rect. Scale.ENVELOP fills the viewport by CROPPING the
 * canvas, so on a landscape phone ~125 logical px are lost top and bottom.
 * Any UI placed against the raw 1536x960 canvas would sit off-screen — HUD,
 * pads and chrome must anchor to this instead (audit: mobile HUD cropped).
 */
export function safeArea(scene: Phaser.Scene): { x: number; y: number; w: number; h: number } {
  const gw = scene.scale.width
  const gh = scene.scale.height
  const vw = scene.scale.parentSize.width || gw
  const vh = scene.scale.parentSize.height || gh
  const k = Math.max(vw / gw, vh / gh)
  const w = Math.min(gw, vw / k)
  const h = Math.min(gh, vh / k)
  return { x: (gw - w) / 2, y: (gh - h) / 2, w, h }
}
