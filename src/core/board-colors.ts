export const BOARD_COLORS = {
  red: { label: 'Red' },
  blue: { label: 'Blue' },
  green: { label: 'Green' },
  purple: { label: 'Purple' },
} as const;

export type BoardColor = keyof typeof BOARD_COLORS;

// Check whether an unknown value is a supported board color.
export function isBoardColor(value: unknown): value is BoardColor {
  return typeof value === 'string' && Object.hasOwn(BOARD_COLORS, value);
}
