import { transform, pick, each } from 'lodash';

import logger from '../utils/logger';

const bindings = [
  {
    name: 'Subscribe to devices',
    cursors: {
      controls: ['controls'],
      devices: ['devices'],
    },
    actions: ['devices'],
    method({ actions, devices, controls, callback }, { data, target }) {
      actions.devices.updateSubscription({
        devices,
        previousControls: target.path[0] === 'controls'
          ? data.previousData
          : controls,
        currentControls: controls,
      }, callback);
    },
  },
];

function getCursors(state, cursorList) {
  return transform(
    cursorList,
    (collection, path, cursorId) => {
      collection[cursorId] = state.select(path);
      return collection;
    },
    {}
  );
}

function getCursorsData(cursors) {
  return transform(
    cursors,
    (collection, cursor, cursorId) => {
      collection[cursorId] = cursor.get();
      return collection;
    },
    {}
  );
}

export default (state, globalActions) => {
  bindings.forEach(
    ({ name, cursors: cursorList, actions: actionList, method }) => {
      const actions = pick(globalActions, actionList);
      const cursors = getCursors(state, cursorList);

      let running = false;
      each(cursors, cursor => {
        cursor.on('update', (...params) => {
          if (!running) {
            logger.info(`BINDING[${name}]`);
            running = true;
            method({
              actions,
              ...getCursorsData(cursors),
              callback() {
                running = false;
              },
            }, ...params);
          }
        });
      });
    }
  );
};
