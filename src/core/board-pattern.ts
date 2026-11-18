import { BOARD_COLUMNS, BOARD_ROWS } from './control-layout';
import type { Rect } from './types';

const sizes: readonly (readonly [number, number])[] = [
  [1, 2],
  [2, 1],
  [2, 2],
  [1, 3],
  [3, 1],
  [3, 2],
  [2, 3],
  [2, 4],
  [4, 2],
  [6, 2],
  [2, 6],
];
const colors = ['primary', 'info', 'success', 'error', 'secondary'] as const;

export default function createBoardPattern(
  random: () => number = Math.random
): Array<Rect & { color: (typeof colors)[number] }> {
  const plates: Array<Rect & { color: (typeof colors)[number] }> = [];
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)];

  function divide(x: number, y: number, w: number, h: number): void {
    const supported = sizes.some(
      ([width, height]) => w === width && h === height
    );
    const cuts: Array<readonly [number, number, number, number][]> = [];
    for (let width = 1; width < w; width += 1) {
      if (width * h > 1 && (w - width) * h > 1) {
        cuts.push([
          [x, y, width, h],
          [x + width, y, w - width, h],
        ]);
      }
    }
    for (let height = 1; height < h; height += 1) {
      if (w * height > 1 && w * (h - height) > 1) {
        cuts.push([
          [x, y, w, height],
          [x, y + height, w, h - height],
        ]);
      }
    }
    if (supported && (!cuts.length || random() < 0.7)) {
      plates.push({ x, y, w, h, color: pick(colors) });
      return;
    }
    // Both child rectangles must remain large enough to hold a supported plate.
    const cut = cuts.length ? pick(cuts) : undefined;
    if (!cut)
      throw new Error('Cannot partition the board into supported plates');
    cut.forEach(([rectX, rectY, rectW, rectH]) =>
      divide(rectX, rectY, rectW, rectH)
    );
  }

  divide(0, 0, BOARD_COLUMNS, BOARD_ROWS);
  return plates;
}
