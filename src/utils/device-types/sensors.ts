import BatteryStd from '@mui/icons-material/BatteryStd';
import FlashOn from '@mui/icons-material/FlashOn';
import ScreenRotation from '@mui/icons-material/ScreenRotation';
import OpenWith from '@mui/icons-material/OpenWith';
import ColorLens from '@mui/icons-material/ColorLens';
import Speed from '@mui/icons-material/Speed';
import WavingHand from '@mui/icons-material/WavingHand';
import RotateRight from '@mui/icons-material/RotateRight';
import Thermostat from '@mui/icons-material/Thermostat';
import Straighten from '@mui/icons-material/Straighten';
import PanTool from '@mui/icons-material/PanTool';
import type { DeviceTypeInfo } from './types';

const sensorDeviceTypes = {
  VOLTAGE_SENSOR: { label: 'Voltage sensor', icon: BatteryStd },
  CURRENT_SENSOR: { label: 'Current sensor', icon: FlashOn },
  TILT_SENSOR: { label: 'Tilt sensor', icon: ScreenRotation },
  MOTION_SENSOR: { label: 'Movement sensor', icon: OpenWith },
  COLOR_DISTANCE_SENSOR: { label: 'Color & distance', icon: ColorLens },
  MOVE_HUB_TILT_SENSOR: { label: 'Tilt sensor', icon: ScreenRotation },
  DUPLO_TRAIN_BASE_COLOR_SENSOR: { label: 'Color sensor', icon: ColorLens },
  DUPLO_TRAIN_BASE_SPEEDOMETER: { label: 'Speed sensor', icon: Speed },
  TECHNIC_MEDIUM_HUB_GEST_SENSOR: { label: 'Wave sensor', icon: WavingHand },
  TECHNIC_MEDIUM_HUB_ACCELEROMETER: {
    label: 'Movement sensor',
    icon: OpenWith,
  },
  TECHNIC_MEDIUM_HUB_GYRO_SENSOR: { label: 'Spin sensor', icon: RotateRight },
  TECHNIC_MEDIUM_HUB_TILT_SENSOR: {
    label: 'Tilt sensor',
    icon: ScreenRotation,
  },
  TECHNIC_MEDIUM_HUB_TEMPERATURE_SENSOR: {
    label: 'Temperature sensor',
    icon: Thermostat,
  },
  TECHNIC_COLOR_SENSOR: { label: 'Color sensor', icon: ColorLens },
  TECHNIC_DISTANCE_SENSOR: { label: 'Distance sensor', icon: Straighten },
  TECHNIC_FORCE_SENSOR: { label: 'Push sensor', icon: PanTool },
  MARIO_ACCELEROMETER: { label: 'Mario movement sensor', icon: OpenWith },
} satisfies Record<string, DeviceTypeInfo>;

export default sensorDeviceTypes;
