import { waterfall } from 'async';
import { pick } from 'lodash';

const registerEvents = [
  'attach',
  'detach',
];
const deviceEvents = [
  'accel',
  'button',
  'color',
  'colorAndDistance',
  'distance',
  'rotate',
  'speed',
  'temp',
  'tilt',
];

const hubTimeout = {};

/**
 * Helper to get hub's system data
 * @param {Object} hub
 */
function getSystemInfo(hub) {
  return pick(hub, [
    'firmware',
    'batteryLevel',
    'current',
    'voltage',
    'rssi',
  ]);
}

export default {
  /**
   * Search for new hub to add
   */
  add({ callback, clients, actions }) {
    waterfall(
      [
        // Get hub from client scan
        cb => clients.lego.add(cb),
        // register new hub in state
        ({ hub }, cb) => actions.hubs.register({ uuid: hub.uuid }, cb),
        // Bootstrap hub (led color, event listeners)
        (hub, cb) => actions.hubs.bootsrap({ uuid: hub.uuid }, cb),
        // Init hub refresh timeout
        (hub, cb) => {
          actions.hubs.resetTimeout({ uuid: hub.uuid });
          cb(null, hub);
        },
      ],
      callback
    );
  },

  /**
   * Add hub information to state
   * @param {String} uuid
   */
  register({ callback, clients, state, actions }, { uuid }) {
    const { lego } = clients;
    waterfall(
      [
        // get hub from client
        cb => lego.get(uuid, cb),
        (hub, cb) => {
          // Add generic hub information to state
          state.select('hubs').set(uuid, {
            uuid: hub.uuid,
            name: hub.name,
            type: lego.constToObject('HubType', hub.getHubType()),
            color: lego.colorFromText(hub.uuid).hex,
            system: getSystemInfo(hub),
          });

          // register devices
          Object.keys(hub._ports).forEach(portName => {
            actions.devices.register({ hubUuid: hub.uuid, portName });
          });

          state.once('update', () => cb(null, hub));
        },
      ],
      callback
    );
  },

  /**
   * Set builtin LED to color determined from uuid
   * @param {String} uuid
   */
  setLED({ clients, callback }, { uuid }) {
    const { lego } = clients;
    waterfall(
      [
        // get hub from client
        cb => lego.get(uuid, cb),
        (hub, cb) => {
          const { rgb } = lego.colorFromText(hub.uuid);
          lego.action(
            hub.uuid,
            'setLEDRGB',
            // HACK : green and blue leds are brighter than red ones
            // Lower G & B values then to match the screen display
            [rgb.r, rgb.g * 0.5, rgb.b * 0.5],
            err => cb(err, hub)
          );
        },
      ],
      callback
    );
  },

  /**
   * Apply some initial action to newly associated hub
   * @param {String} uuid
   */
  bootsrap({ actions, callback }, { uuid }) {
    waterfall(
      [
        // Set hub LED from uuid
        cb => actions.hubs.setLED({ uuid }, cb),
        // Unsuscribe to TILT event (as they spam, at least on BOOST MOVE HUB)
        (hub, cb) => hub.unsubscribe('TILT').then(
          () => cb(null, hub),
          // ignore error on this one
          () => cb(null, hub)
        ),
        (hub, cb) => {
          // Attach to some event (registerEvents)
          // to refresh hub's devices local state
          registerEvents.forEach(event => {
            hub.on(event, portName => actions.devices.register({
              hubUuid: hub.uuid,
              portName,
            }));
          });

          // Attach to some event (registerEvents)
          // to refresh hub's devices measurements state
          deviceEvents.forEach(event => {
            hub.on(event, (portName, ...data) => actions.devices.update({
              hubUuid: hub.uuid,
              portName,
              event,
              data,
            }));
          });

          cb(null, hub);
        },
      ],
      callback
    );
  },

  /**
   * Clear hub refresh timeout by uuid
   * @param {String} uuid
   */
  clearTimeout(ctx, { uuid }) {
    if (hubTimeout[uuid]) {
      clearTimeout(hubTimeout[uuid]);
    }
  },

  /**
   * Reset hub refresh timeout by uuid
   * @param {String} uuid
   */
  resetTimeout({ actions }, { uuid }) {
    actions.hubs.clearTimeout({ uuid });
    hubTimeout[uuid] = setTimeout(() => actions.hubs.update({ uuid }), 1000);
  },

  /**
   * Update hub local state by uuid
   * @param {String} uuid
   */
  update({ clients, state, actions, callback }, { uuid }) {
    const { lego } = clients;
    /**
     * reset hub refresh timeout
     * prevent this method from being call too often when already call from
     * an event (updateEvents).
     */
    actions.hubs.resetTimeout({ uuid });

    // get hub from client
    lego.get(uuid, (err, hub) => {
      if (err) {
        return callback(err);
      }

      // update state with collected data
      const hubData = state.select(['hubs', uuid]);
      hubData.set('name', hub.name);
      hubData.set('system', getSystemInfo(hub));

      return callback(null, hub);
    });
  },

  /**
   * Disconnect from hub by uuid
   * @param {String} uuid
   */
  disconnect({ clients, state, actions, callback }, { uuid }) {
    actions.hubs.clearTimeout({ uuid });
    state.set(['hubs', uuid], undefined);
    clients.lego.action(uuid, 'disconnect', undefined, callback);
  },

  /**
   * Shutdown hub by uuid
   * @param {String} uuid
   */
  shutdown({ clients, state, actions, callback }, { uuid }) {
    actions.hubs.clearTimeout({ uuid });
    state.set(['hubs', uuid], undefined);
    clients.lego.action(uuid, 'shutdown', undefined, callback);
  },

  /**
   * Rename hub
   * @param {String} uuid
   * @param {String} name
   */
  rename({ clients, callback }, { uuid, name }) {
    clients.lego.action(uuid, 'setName', [name], callback);
  },
};
