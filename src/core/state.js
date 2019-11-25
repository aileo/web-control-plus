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
    events: {},
    controls: [],
    commands: {},
    grid: {
      rows: 6,
      cols: 10,
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
