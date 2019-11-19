import Baobab, { monkey } from 'baobab';
import { times, constant } from 'lodash';

const state = new Baobab(
  {
    navigation: {
      page: 'main',
      modal: {
        name: null,
        context: {},
      },
    },
    hubs: [],
    devices: [],
    controls: [],
    grid: {
      rows: 6,
      cols: 10,
      size: [
        [1, 1],
        [2, 1],
        [4, 1],
        [6, 1],
        [8, 1],
        [2, 2],
        [4, 2],
      ].reduce((collection, [w, h]) => {
        collection.push({ w, h });
        if (w !== h) {
          collection.push({ w: h, h: w });
        }
        return collection;
      }, []),
      matrix: monkey({
        cursors: {
          rows: ['grid', 'rows'],
          cols: ['grid', 'cols'],
          controls: ['controls'],
        },
        get({ rows, cols, controls }) {
          const matrix = times(rows, () => times(cols, constant(false)));
          controls.forEach(({ x, y, w, h }) => {
            times(
              w,
              offsetX => times(
                h,
                offsetY => {
                  matrix[y + offsetY][x + offsetX] = true;
                }
              )
            );
          });

          return matrix;
        },
      }),
    },
  },
  {
    cursorSingletons: false,
  }
);

export default state;
