import Autorenew from '@mui/icons-material/Autorenew';
import DirectionsRailway from '@mui/icons-material/DirectionsRailway';
import type { DeviceTypeInfo } from './types';

const motorDeviceTypes = {
  SIMPLE_MEDIUM_LINEAR_MOTOR: { label: 'Motor', icon: Autorenew },
  TRAIN_MOTOR: { label: 'Train motor', icon: DirectionsRailway },
  MEDIUM_LINEAR_MOTOR: { label: 'Motor', icon: Autorenew },
  MOVE_HUB_MEDIUM_LINEAR_MOTOR: { label: 'Motor', icon: Autorenew },
  DUPLO_TRAIN_BASE_MOTOR: { label: 'Train motor', icon: DirectionsRailway },
  TECHNIC_LARGE_LINEAR_MOTOR: { label: 'Big motor', icon: Autorenew },
  TECHNIC_XLARGE_LINEAR_MOTOR: { label: 'Extra-big motor', icon: Autorenew },
  TECHNIC_MEDIUM_ANGULAR_MOTOR: { label: 'Motor', icon: Autorenew },
  TECHNIC_LARGE_ANGULAR_MOTOR: { label: 'Big motor', icon: Autorenew },
  TECHNIC_SMALL_ANGULAR_MOTOR: { label: 'Small motor', icon: Autorenew },
  TECHNIC_MEDIUM_ANGULAR_MOTOR_GREY: { label: 'Motor', icon: Autorenew },
  TECHNIC_LARGE_ANGULAR_MOTOR_GREY: { label: 'Big motor', icon: Autorenew },
} satisfies Record<string, DeviceTypeInfo>;

export default motorDeviceTypes;
