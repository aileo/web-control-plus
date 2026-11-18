import { controlTypes } from './controlTypes';
import type { ControlType, Rect, Size } from './types';

type Occupant = Rect & { id: string };

export const BOARD_COLUMNS = 10;
export const BOARD_ROWS = 6;
export const BOARD_WIDTH = 1440;
export const BOARD_HEIGHT = (BOARD_WIDTH * BOARD_ROWS) / BOARD_COLUMNS;
export const INSTRUCTIONS_TILE = {
  id: 'board-instructions',
  x: 0,
  y: 0,
  w: 3,
  h: 3,
};

export function boardOccupancy(
  controls: ReadonlyMap<string, Occupant>,
  instructions: boolean
): ReadonlyMap<string, Occupant> {
  return instructions
    ? new Map(controls).set(INSTRUCTIONS_TILE.id, INSTRUCTIONS_TILE)
    : controls;
}

export function isSupportedSize(
  type: ControlType,
  size: Size | undefined
): boolean {
  return Boolean(
    controlTypes[type]?.sizes.some(({ w, h }) => w === size?.w && h === size?.h)
  );
}

export function canPlace(
  controls: ReadonlyMap<string, Occupant>,
  rect: Rect | null | undefined,
  excludeId?: string
): boolean {
  if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(Number.isInteger)) {
    return false;
  }
  const { x, y, w, h } = rect;
  return (
    x >= 0 &&
    y >= 0 &&
    w > 0 &&
    h > 0 &&
    x + w <= BOARD_COLUMNS &&
    y + h <= BOARD_ROWS &&
    [...controls.values()].every(
      (other) =>
        other.id === excludeId ||
        x + w <= other.x ||
        other.x + other.w <= x ||
        y + h <= other.y ||
        other.y + other.h <= y
    )
  );
}

export function findSpace(
  controls: ReadonlyMap<string, Occupant>,
  size: Size
): Rect | null {
  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLUMNS; x += 1) {
      const rect = { ...size, x, y };
      if (canPlace(controls, rect)) return rect;
    }
  }
  return null;
}

export function snapSize(
  type: ControlType,
  width: number,
  height: number
): Size {
  if (
    !controlTypes[type] ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    throw new Error('Invalid control size');
  }
  return controlTypes[type].sizes.reduce((closest, size) =>
    (size.w - width) ** 2 + (size.h - height) ** 2 <
    (closest.w - width) ** 2 + (closest.h - height) ** 2
      ? size
      : closest
  );
}
