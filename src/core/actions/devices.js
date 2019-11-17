import { pick } from 'lodash';

function getDeviceInfo(device) {
  return pick(device, [
    'connected',
    'busy',
    'type',
    'value',
  ]);
}

export default {
  select({ state }, { mac, port }) {
    return state.select('devices', { mac, port });
  },

  /**
   * Register new device (even if no device...)
   * @param {String} hubId
   * @param {String} portName
   */
  register({ clients, state, actions, callback }, { hub, portName }) {
    const { lego } = clients;
    const device = hub._ports[portName];
    const deviceInfo = getDeviceInfo(device);
    deviceInfo.mac = hub.primaryMACAddress;
    deviceInfo.port = portName;
    deviceInfo.type = lego.constToObject('DeviceType', deviceInfo.type);
    // erase eventData has it now refer to a new data
    deviceInfo.eventData = {};
    const cursor = actions.devices.select(
      { mac: deviceInfo.mac, port: deviceInfo.port }
    );
    if (cursor.exists()) {
      cursor.set(deviceInfo);
    } else {
      state.select('devices').push(deviceInfo);
    }
    state.once('update', () => callback());
  },

  /**
   * Store event data in state
   * @param {String} hubId
   * @param {String} portName
   * @param {String} event
   * @param {Any} data
   */
  update({ state, actions, callback }, { hub, portName, event, data }) {
    // update device with event data
    actions.devices
      .select({ mac: hub.primaryMACAddress, port: portName })
      .set(event, data);
    state.once('update', () => callback());
  },

  action({ clients, callback }, { mac, portName, action, params }) {
    clients.lego.action(
      { mac },
      action,
      [portName].concat(params),
      err => callback(err)
    );
  },

  remove({ actions }, { mac, port }) {
    actions.devices.select({ mac, port }).unset();
  },
};
