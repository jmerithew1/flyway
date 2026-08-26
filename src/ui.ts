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

/** Wide-tracked geometric caps: titles, labels, buttons, HUD numerals. */
export function display(size: number, color: string = INK.bright, tracking = 0, weight: 300 | 400 | 500 = 400): TextStyle {
  return {
    fontFamily: FONT_DISPLAY,
    fontSize: `${size}px`,
    color,
    fontStyle: `${weight}`,
    letterSpacing: tracking,
  } as TextStyle
}

/** The game's spoken voice: italic garamond, for prompts and story lines. */
export function voice(size: number, color: string = INK.soft, tracking = 0): TextStyle {
  return {
    fontFamily: FONT_BODY,
    fontSize: `${size}px`,
    color,
    fontStyle: 'italic 300',
    letterSpacing: tracking,
  } as TextStyle
}
