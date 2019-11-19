import { times } from 'lodash';

export default {
  getAvaillableSlots({ state }) {
    const { matrix, rows, cols } = state.get('grid');

    // walk throught matrix to get max sizes for each cell
    const availlables = matrix.map((row, y) => row.map((occupied, x) => {
      // no need to go further if cell is occupied
      if (occupied) {
        return [];
      }

      // for each height
      const heights = times(Math.min(rows - y, 8), height => height).reduce(
        (collection, height) => {
          // get previous row max width
          const previousRowMaxWidth = height > 0
            ? collection[height - 1]
            : Infinity;

          let width = 0;
          const maxWidth = Math.min(previousRowMaxWidth, cols - x);
          // while cell is free and we don't reach previous row limit
          // or the grid edge
          while (!matrix[y + height][x + width] && width < maxWidth) {
            width += 1;
          }
          collection.push(width);
          return collection;
        },
        []
      );

      // add empty value for height: 0
      heights.unshift(null);
      return heights;
    }));

    return availlables;
  },

  getMaxSizes({ actions }) {
    const slots = actions.grid.getAvaillableSlots();

    return times(9).map(
      height => Math.max(
        ...slots.map(
          row => row.map(
            cell => cell[height] || 0
          )
        ).flat()
      )
    );
  },

  addControl({ actions, state, callback }, { control }) {
    const slots = actions.grid.getAvaillableSlots();
    const { rows, cols } = state.get('grid');

    for (let d = 0; d < rows + cols - 1; d += 1) {
      let y = Math.min(d, rows - 1);

      while (y >= 0) {
        const x = d - y;
        if (slots[y][x][control.h] >= control.w) {
          state.select('controls').push({ x, y, ...control });
          return state.once('update', () => callback());
        }
        y -= 1;
      }
    }

    return callback();
  },
};
