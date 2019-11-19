import { transform, each } from 'lodash';

import state from './state';
import clients from './clients';
import logger from '../utils/logger';

// Actions collections
import navigation from './actions/navigation';
import hubs from './actions/hubs';
import devices from './actions/devices';
import grid from './actions/grid';

const helpers = {
  /**
   * Return first function found in a and b
   * @param {Any} a
   * @param {Any} b
   * @return {Function}
   */
  getCallback(a, b) {
    if (typeof a === 'function') return a;
    if (typeof b === 'function') return b;
    return () => {};
  },
  /**
   * Return a if it is an object, empty object else
   * @param {Any} a
   * @return {Object}
   */
  getParams(a) {
    return typeof a === 'object' ? a : {};
  },
};

export default transform(
  {
    navigation,
    hubs,
    devices,
    grid,
  },
  (actions, collection, scope) => {
    actions[scope] = actions[scope] || {};
    each(
      collection,
      (action, name) => {
        /**
         * Wrap every actions to inject actions, state, clients and logger
         * in every method local scope
         */
        actions[scope][name] = (_params, _callback) => {
          // get params and callback
          const params = helpers.getParams(_params);
          const callback = helpers.getCallback(_params, _callback);

          // log action calls
          logger.info(`ACTION[${scope}.${name}]`);
          logger.debug(`ACTION[${scope}.${name}]`, { params });

          // real method call
          return action(
            {
              callback: (error, ...results) => {
                if (error) {
                  logger.error(`ACTION[${scope}.${name}]`, error, ...results);
                }
                callback(error, ...results);
              },
              clients,
              state,
              actions,
              logger,
            },
            params
          );
        };
      }
    );
  },
  {}
);
