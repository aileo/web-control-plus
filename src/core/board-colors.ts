export const BOARD_COLORS = {
  red: { label: 'Red', background: '#ffd9dc' },
  blue: { label: 'Blue', background: '#d8eaff' },
  green: { label: 'Green', background: '#d8f3df' },
  purple: { label: 'Purple', background: '#eadcff' },
} as const;

export type BoardColor = keyof typeof BOARD_COLORS;

export function isBoardColor(value: unknown): value is BoardColor {
  return typeof value === 'string' && Object.hasOwn(BOARD_COLORS, value);
}
