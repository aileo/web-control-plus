import { pick, includes, each } from 'lodash';

import { components } from '../../components/modules/controls/Control';

function getDeviceInfo(device) {
  return pick(device, [
    'connected',
    'busy',
    'type',
  ]);
}

function getDeviceModes(devicesIndex, controls, key, modes = {}) {
  controls.forEach(control => {
    control.devices.forEach(({ mac, port }, index) => {
      modes[mac] = modes[mac] || {};
      modes[mac][port] = modes[mac][port] || {};

      const { type } = devicesIndex[mac][port];
      const component = components[control.type];

      if (includes(component.devices[index].type, type.num)) {
        modes[mac][port][key] = component.devices[index].mode;
      }
    });
  });
  return modes;
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
    const cursor = actions.devices.select(deviceInfo);
    if (cursor.exists()) {
      cursor.set(deviceInfo);
    } else {
      state.select('devices').push(deviceInfo);
    }
    state.select('events').set([deviceInfo.mac, deviceInfo.port], {});
    state.select('commands').set([deviceInfo.mac, deviceInfo.port], {});
    state.once('update', () => callback());
  },

  /**
   * Store event data in state
   * @param {String} hubId
   * @param {String} portName
   * @param {String} event
   * @param {Any} data
   */
  update({ state, callback }, { hub, portName, event, data }) {
    state.set(['events', hub.primaryMACAddress, portName, event], data);
    return state.once('update', () => callback());
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

  setSpeed({ clients, state }, { mac, port, speed }) {
    clients.lego.action(
      { mac },
      'setMotorSpeed',
      [port].concat(speed)
    );

    state.select('commands', mac, port).set('speed', speed);
  },

  subscribe({ clients, callback }, { mac, port, mode }) {
    clients.lego.action(
      { mac },
      'subscribe',
      [port, mode],
      err => callback(err)
    );
  },

  unsubscribe({ clients, callback }, { mac, port }) {
    clients.lego.action(
      { mac },
      'unsubscribe',
      [port],
      err => callback(err)
    );
  },

  updateSubscription(
    { actions, callback },
    { previousControls, currentControls, devices }
  ) {
    const devicesIndex = devices.reduce((collection, device) => {
      collection[device.mac] = collection[device.mac] || {};
      collection[device.mac][device.port] = device;
      return collection;
    }, {});
    const subscriptions = getDeviceModes(
      devicesIndex,
      currentControls,
      'current',
      getDeviceModes(devicesIndex, previousControls, 'previous')
    );

    each(subscriptions, (ports, mac) => {
      each(ports, (modes, port) => {
        const { previous } = modes;
        const { current } = modes;

        if (previous !== current) {
          if (current === undefined) {
            actions.devices.unsubscribe({ mac, port });
          } else {
            actions.devices.subscribe({ mac, port, mode: current });
          }
        }
      });
    });

    callback();
  },
};
