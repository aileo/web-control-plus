import type { DeviceTypeInfo } from './types';
import accessoryDeviceTypes from './accessories';
import lightDeviceTypes from './lights';
import motorDeviceTypes from './motors';
import sensorDeviceTypes from './sensors';

const deviceTypes = {
  ...accessoryDeviceTypes,
  ...lightDeviceTypes,
  ...motorDeviceTypes,
  ...sensorDeviceTypes,
} satisfies Record<string, DeviceTypeInfo>;

// Return the metadata for a device type, falling back to UNKNOWN.
export function getDeviceType(type: string | undefined): DeviceTypeInfo {
  if (type && Object.hasOwn(deviceTypes, type)) {
    return deviceTypes[type as keyof typeof deviceTypes];
  }
  return deviceTypes.UNKNOWN;
}

export default deviceTypes;
