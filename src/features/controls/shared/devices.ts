import { CONSTS } from '../../../core/clients/lego';
import { ledTypes } from '../../../core/leds';

const { DeviceType } = CONSTS;

export const motors = [
  DeviceType.SIMPLE_MEDIUM_LINEAR_MOTOR,
  DeviceType.TRAIN_MOTOR,
  DeviceType.MEDIUM_LINEAR_MOTOR,
  DeviceType.MOVE_HUB_MEDIUM_LINEAR_MOTOR,
  DeviceType.DUPLO_TRAIN_BASE_MOTOR,
  DeviceType.TECHNIC_LARGE_LINEAR_MOTOR,
  DeviceType.TECHNIC_XLARGE_LINEAR_MOTOR,
  DeviceType.TECHNIC_SMALL_ANGULAR_MOTOR,
  DeviceType.TECHNIC_MEDIUM_ANGULAR_MOTOR,
  DeviceType.TECHNIC_LARGE_ANGULAR_MOTOR,
  DeviceType.TECHNIC_MEDIUM_ANGULAR_MOTOR_GREY,
  DeviceType.TECHNIC_LARGE_ANGULAR_MOTOR_GREY,
];

export const lightDevices = Object.keys(ledTypes).map(Number);
