// Accent / theme tokens. Mirrors `axion/src/utils/accentTheme.ts` but emits
// plain JS objects (no DOM) so we can feed them to React Native styles.

import type { AccentColor, Theme } from '../types/domain';

interface RGB { r: number; g: number; b: number }

export const ACCENT_HEX: Record<AccentColor, string> = {
  red:    '#ef4444',
  blue:   '#3b82f6',
  green:  '#22c55e',
  purple: '#a855f7',
  orange: '#f97316'
};

function hexToRgb(hex: string): RGB {
  const v = Number.parseInt(hex.replace('#', ''), 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

function rgba({ r, g, b }: RGB, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface AccentPalette {
  hex: string;
  base: string;
  strong: string;
  soft: string;
  ring: string;
  glow1: string;
  glow2: string;
}

export function buildAccentPalette(accent: AccentColor, theme: Theme): AccentPalette {
  const hex = ACCENT_HEX[accent] ?? ACCENT_HEX.green;
  const rgb = hexToRgb(hex);
  const isLight = theme === 'light';
  return {
    hex,
    base:   rgba(rgb, isLight ? 0.9  : 0.75),
    strong: rgba(rgb, isLight ? 1.0  : 0.92),
    soft:   rgba(rgb, isLight ? 0.2  : 0.15),
    ring:   rgba(rgb, isLight ? 0.4  : 0.35),
    glow1:  rgba(rgb, isLight ? 0.16 : 0.2),
    glow2:  rgba(rgb, isLight ? 0.08 : 0.12)
  };
}

// Surface tokens — kept in lockstep with `tailwind.config.js` so the values
// can be referenced from both NativeWind classes and inline styles.
export const COLORS = {
  bg:        '#08070d',
  bgElev:    '#101018',
  surface:   '#15151f',
  surfaceHi: '#1c1c28',
  border:    '#26263b',
  text:      '#f3f4f6',
  textMuted: '#9ca3af',
  textDim:   '#6b7280'
} as const;
