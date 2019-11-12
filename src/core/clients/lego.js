// eslint-disable-next-line import/no-unresolved
import { PoweredUP } from 'node-poweredup/src/poweredup-browser';
// eslint-disable-next-line import/no-unresolved
import * as CONSTS from 'node-poweredup/src/consts';
import tinycolor from 'tinycolor2';

const client = new PoweredUP();

/**
 * Translate from consts
 * @param {String} type
 * @param {String|Number} value
 * @return {String|Number}
 */
function translate(type, value) {
  return CONSTS[type][value];
}

/**
 * Returns initials from consts name
 * E.g: BOOST_MOVE_HUB => BMH
 * @param {String} id
 * @return {String}
 */
function compact(id) {
  return id.split('_').reduce((str, part) => str + part[0], '');
}

export default {
  /**
   * Associate new hub to the application
   * @param {Function} callback
   */
  add(callback = (() => {})) {
    client.once('discover', async hub => {
      await hub.connect();
      callback(null, { hub });
    });
    client.scan();
  },

  /**
   * Get hub object from its uuid
   * @param {String} uuid
   * @param {Function} callback
   */
  get(uuid, callback) {
    const hub = client.getConnectedHubByUUID(uuid);

    if (hub) {
      callback(null, hub);
    } else {
      callback(40400);
    }
  },

  /**
   * Call hub method with params
   * @param {String} uuid
   * @param {String} action
   * @param {Array} params
   * @param {Function} callback
   */
  action(uuid, action, params = [], callback = () => {}) {
    const hub = client.getConnectedHubByUUID(uuid);

    if (!hub) {
      return callback(40400);
    }

    if (!hub[action]) {
      return callback(40401);
    }

    return (hub[action])(...params).then(
      results => callback(null, results),
      err => callback(err)
    );
  },

  /**
   * Convert number from const to object
   * @param {String} type
   * @param {Number} value
   * @return {Object}
   */
  constToObject(type, value) {
    const text = translate(type, value);
    return {
      num: value,
      text,
      compact: compact(text),
    };
  },

  /**
   * Generate color from text
   * Used to generate "unique" color for hubs from their uuid
   * @param {String} txt
   * @return {Object}
   */
  colorFromText(txt) {
    const h = txt.split('').reduce((sum, char) => sum + char.charCodeAt(), 0);
    const color = tinycolor({ h: (h % 180) * 2, s: 1, l: 0.5 });
    return {
      hex: color.toHexString(),
      rgb: color.toRgb(),
    };
  },
};
