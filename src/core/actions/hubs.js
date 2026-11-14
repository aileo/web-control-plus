import { waterfall } from 'async';

const hubTimeout = {};

/**
 * Helper to get hub's system data
 * @param {Object} hub
 */
function getSystemInfo(hub) {
  const voltage = hub.getDeviceAtPort('VOLTAGE_SENSOR');
  const current = hub.getDeviceAtPort('CURRENT_SENSOR');
  return {
    firmware: hub.firmwareVersion,
    batteryLevel: hub.batteryLevel,
    current: current && current.values.current
      && current.values.current.current,
    voltage: voltage && voltage.values.voltage
      && voltage.values.voltage.voltage,
    rssi: hub.rssi,
  };
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
        ({ hub }, cb) => actions.hubs.register({ hub }, err => cb(err, hub)),
        // Bootstrap hub (led color, event listeners)
        (hub, cb) => actions.hubs.bootsrap({ hub }, err => cb(err, hub)),
        // Init hub refresh timeout
        (hub, cb) => {
          actions.hubs.resetTimeout(hub);
          cb(null, hub);
        },
      ],
      callback
    );
  },

  selectByUuid({ state }, { uuid }) {
    return state.select('hubs', { uuid });
  },

  selectByMac({ state }, { mac }) {
    return state.select('hubs', { mac });
  },

  /**
   * Add hub information to state
   * @param {LPF2Hub} hub
   */
  register({ clients, state, actions, callback }, { hub }) {
    const { lego } = clients;
    // Add generic hub information to state
    const hubInfo = {
      uuid: hub.uuid,
      name: hub.name,
      mac: lego.identity(hub),
      online: true,
      type: lego.constToObject('HubType', hub.type),
      color: lego.colorFromText(hub.uuid).hex,
      system: getSystemInfo(hub),
    };
    const cursor = actions.hubs.selectByUuid({ uuid: hub.uuid });
    if (cursor.exists()) {
      cursor.set(hubInfo);
    } else {
      state.select('hubs').push(hubInfo);
    }

    state.once('update', () => callback());
  },

  /**
   * Set builtin LED to color determined from uuid
   * @param {String} id
   */
  setLED({ clients, callback }, { hub }) {
    const { lego } = clients;
    const { rgb } = lego.colorFromText(hub.uuid);
    const led = hub.getDevicesByType(lego.CONSTS.DeviceType.HUB_LED)[0];
    if (!led) return callback(new Error('Hub LED not found'));
    return Promise.resolve(led.setRGB(rgb.r, rgb.g * 0.5, rgb.b * 0.5))
      .then(() => callback(), callback);
  },

  /**
   * Apply some initial action to newly associated hub
   * @param {String} id
   */
  bootsrap({ actions, clients, callback }, { hub }) {
    hub.on('attach', device => {
      actions.devices.register({ hub, device });
      if (device.type === clients.lego.CONSTS.DeviceType.HUB_LED) {
        actions.hubs.setLED({ hub });
      }
    });
    hub.on('detach', device => {
      actions.devices.register({ hub, device, detached: true });
    });
    hub.ports.forEach(portName => {
      actions.devices.register({ hub, portName });
    });
    hub.on('disconnect', () => {
      actions.hubs.clearTimeout({ uuid: hub.uuid });
      actions.hubs.selectByUuid({ uuid: hub.uuid }).set('online', false);
    });
    actions.hubs.setLED({ hub });
    callback();
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
    const hub = lego.get({ uuid });
    if (!hub) {
      actions.hubs.clearTimeout({ uuid });
      return callback(40400);
    }

    // update state with collected data
    const hubData = actions.hubs.selectByUuid({ uuid });

    hubData.set('name', hub.name);
    hubData.set('mac', lego.identity(hub));
    hubData.set('online', true);
    hubData.set('system', getSystemInfo(hub));

    state.once('update', () => callback());
    return null;
  },

  /**
   * Disconnect from hub by uuid
   * @param {String} uuid
   */
  disconnect({ clients, actions, callback }, { uuid }) {
    actions.hubs.clearTimeout({ uuid });
    actions.hubs.selectByUuid({ uuid }).set('online', false);
    clients.lego.action({ uuid }, 'disconnect', undefined, callback);
  },

  /**
   * Shutdown hub by uuid
   * @param {String} uuid
   */
  shutdown({ clients, actions, callback }, { uuid }) {
    actions.hubs.clearTimeout({ uuid });
    actions.hubs.selectByUuid({ uuid }).set('online', false);
    clients.lego.action({ uuid }, 'shutdown', undefined, callback);
  },

  /**
   * Remove hub by uuid
   * @param {String} uuid
   */
  remove({ state, actions }, { uuid }) {
    const data = actions.hubs.selectByUuid({ uuid });
    state
      .get('devices')
      .filter(d => d.mac === data.get('mac'))
      .forEach(({ mac, port }) => actions.devices.remove({ mac, port }));
    data.unset();
  },

  /**
   * Rename hub
   * @param {String} uuid
   * @param {String} name
   */
  rename({ clients, callback }, { uuid, name }) {
    clients.lego.action({ uuid }, 'setName', [name], callback);
  },
};
