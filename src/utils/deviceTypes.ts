import QuestionMark from '@mui/icons-material/QuestionMark';
import Autorenew from '@mui/icons-material/Autorenew';
import TouchApp from '@mui/icons-material/TouchApp';
import Speed from '@mui/icons-material/Speed';
import ScreenRotation from '@mui/icons-material/ScreenRotation';
import VolumeUp from '@mui/icons-material/VolumeUp';
import Lightbulb from '@mui/icons-material/Lightbulb';
import ColorLens from '@mui/icons-material/ColorLens';
import DirectionsRailway from '@mui/icons-material/DirectionsRailway';
import Straighten from '@mui/icons-material/Straighten';
import BatteryStd from '@mui/icons-material/BatteryStd';
import FlashOn from '@mui/icons-material/FlashOn';
import OpenWith from '@mui/icons-material/OpenWith';
import RotateRight from '@mui/icons-material/RotateRight';
import WavingHand from '@mui/icons-material/WavingHand';
import SignalCellularAlt from '@mui/icons-material/SignalCellularAlt';
import Thermostat from '@mui/icons-material/Thermostat';
import PanTool from '@mui/icons-material/PanTool';
import GridOn from '@mui/icons-material/GridOn';
import QrCodeScanner from '@mui/icons-material/QrCodeScanner';
import Checkroom from '@mui/icons-material/Checkroom';
import type { SvgIconComponent } from '@mui/icons-material';

type DeviceTypeInfo = { label: string; icon: SvgIconComponent };

const deviceTypes = {
  UNKNOWN: { label: 'Unknown device', icon: QuestionMark },
  SIMPLE_MEDIUM_LINEAR_MOTOR: { label: 'Motor', icon: Autorenew },
  TRAIN_MOTOR: { label: 'Train motor', icon: DirectionsRailway },
  LIGHT: { label: 'Light', icon: Lightbulb },
  VOLTAGE_SENSOR: { label: 'Voltage sensor', icon: BatteryStd },
  CURRENT_SENSOR: { label: 'Current sensor', icon: FlashOn },
  PIEZO_BUZZER: { label: 'Buzzer', icon: VolumeUp },
  HUB_LED: { label: 'Hub light', icon: Lightbulb },
  TILT_SENSOR: { label: 'Tilt sensor', icon: ScreenRotation },
  MOTION_SENSOR: { label: 'Movement sensor', icon: OpenWith },
  COLOR_DISTANCE_SENSOR: {
    label: 'Color & distance',
    icon: ColorLens,
  },
  MEDIUM_LINEAR_MOTOR: { label: 'Motor', icon: Autorenew },
  MOVE_HUB_MEDIUM_LINEAR_MOTOR: { label: 'Motor', icon: Autorenew },
  MOVE_HUB_TILT_SENSOR: { label: 'Tilt sensor', icon: ScreenRotation },
  DUPLO_TRAIN_BASE_MOTOR: { label: 'Train motor', icon: DirectionsRailway },
  DUPLO_TRAIN_BASE_SPEAKER: { label: 'Speaker', icon: VolumeUp },
  DUPLO_TRAIN_BASE_COLOR_SENSOR: { label: 'Color sensor', icon: ColorLens },
  DUPLO_TRAIN_BASE_SPEEDOMETER: { label: 'Speed sensor', icon: Speed },
  TECHNIC_LARGE_LINEAR_MOTOR: { label: 'Big motor', icon: Autorenew },
  TECHNIC_XLARGE_LINEAR_MOTOR: { label: 'Extra-big motor', icon: Autorenew },
  TECHNIC_MEDIUM_ANGULAR_MOTOR: { label: 'Motor', icon: Autorenew },
  TECHNIC_LARGE_ANGULAR_MOTOR: { label: 'Big motor', icon: Autorenew },
  TECHNIC_MEDIUM_HUB_GEST_SENSOR: { label: 'Wave sensor', icon: WavingHand },
  REMOTE_CONTROL_BUTTON: { label: 'Button', icon: TouchApp },
  REMOTE_CONTROL_RSSI: { label: 'Signal sensor', icon: SignalCellularAlt },
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
  TECHNIC_3X3_COLOR_LIGHT_MATRIX: { label: 'Light grid', icon: GridOn },
  TECHNIC_SMALL_ANGULAR_MOTOR: { label: 'Small motor', icon: Autorenew },
  MARIO_ACCELEROMETER: { label: 'Mario movement sensor', icon: OpenWith },
  MARIO_BARCODE_SENSOR: { label: 'Mario code reader', icon: QrCodeScanner },
  MARIO_PANTS_SENSOR: { label: 'Mario outfit sensor', icon: Checkroom },
  TECHNIC_MEDIUM_ANGULAR_MOTOR_GREY: { label: 'Motor', icon: Autorenew },
  TECHNIC_LARGE_ANGULAR_MOTOR_GREY: { label: 'Big motor', icon: Autorenew },
} satisfies Record<string, DeviceTypeInfo>;

export function getDeviceType(type: string | undefined): DeviceTypeInfo {
  if (type && Object.hasOwn(deviceTypes, type)) {
    return deviceTypes[type as keyof typeof deviceTypes];
  }
  return deviceTypes.UNKNOWN;
}

export default deviceTypes;
