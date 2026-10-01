// Colours of the drawn bomb (an artwork, like Starburst: its own palette, not the site tokens).
import type { Color } from '@mini-jeux/shared/games/defusal-data';

export const PAINT: Readonly<Record<Color, string>> = {
  red: '#d63a2f',
  blue: '#2f6fd6',
  yellow: '#f2c933',
  white: '#f4f1e8',
  black: '#1d1d1f',
  green: '#3aa655',
  purple: '#8a4fd1',
};

export const METAL = '#5b5f66';
export const PANEL = '#2b2e33';
export const LED_ON = '#62e07a';
export const LED_OFF = '#1f3324';
export const MARKER = '#62e07a';
export const TARGET = '#e5483b';
export const DOT = '#ffffff';
export const WALL = '#e8e2d0';
