import { waterfall } from 'async';
import { values } from 'lodash';

const bootstrapEvents = [
  'attach',
  'detach',
];

const hubTimeout = {};

export default {
  /**
   * Search for new hub to add
   */
  add({ callback, clients, actions }) {
    waterfall([
      cb => clients.lego.add(cb),
      ({ hub }, cb) => actions.hubs.update({ uuid: hub.uuid }, cb),
      (hub, cb) => actions.hubs.bootsrap({ uuid: hub.uuid }, cb),
    ], callback);
  },

  /**
   * Apply some initial action to newly associated hub
   */
  bootsrap({ clients, callback, actions, logger }, { uuid }) {
    logger.info('bootsrap hub', { uuid });
    waterfall(
      [
        // get hub from client
        cb => clients.lego.get(uuid, cb),

        // Unsuscribe to TILT event (as they spam, at least on BOOST MOVE HUB)
        (hub, cb) => {
          if (hub._ports.TILT) {
            logger.info('Disable tilt update', { uuid });
            return hub.unsubscribe('TILT').then(
              () => cb(null, hub),
              err => cb(err)
            );
          }

          return cb(null, hub);
        },

        // apply led color from uuid
        (hub, cb) => {
          const { rgb } = clients.lego.colorFromText(hub.uuid);
          clients.lego.action(hub.uuid, 'setLEDRGB', values(rgb), err => {
            cb(err, hub);
          });
        },

        // Attach to some event (bootstrapEvents) to refresh hub local state
        (hub, cb) => {
          logger.info('Bootstrap events', { uuid });
          bootstrapEvents.forEach(event => {
            hub.on(event, (...data) => {
              logger.debug('Event', { event, data });
              actions.hubs.update({ uuid });
            });
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
     * an event.
     */
    actions.hubs.resetTimeout({ uuid });

    // get hub from client
    lego.get(uuid, (err, hub) => {
      if (err) {
        return callback(err);
      }

      // update state with collected data
      state.set(['hubs', uuid], {
        uuid: hub.uuid,
        name: hub.name,
        type: lego.constToObject('HubType', hub.getHubType()),
        color: lego.colorFromText(hub.uuid).hex,
        system: {
          firmware: hub.firmwareVersion,
          batteryLevel: hub.batteryLevel,
          current: hub.current,
          voltage: hub.voltage,
          rssi: hub.rssi,
        },
        /**
         * Ugly part that should be refined
         */
        ports: Object.keys(hub._ports).reduce((ports, name) => {
          ports[name] = {
            name,
            uuid: `${hub.uuid}-${name}`,
            connected: hub._ports[name].connected,
            busy: hub._ports[name].busy,
            type: lego.constToObject('DeviceType', hub._ports[name].type),
            value: hub._ports[name].value,
          };
          return ports;
        }, {}),
      });

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
