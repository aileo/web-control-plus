import QuestionMark from '@mui/icons-material/QuestionMark';
import TouchApp from '@mui/icons-material/TouchApp';
import VolumeUp from '@mui/icons-material/VolumeUp';
import SignalCellularAlt from '@mui/icons-material/SignalCellularAlt';
import QrCodeScanner from '@mui/icons-material/QrCodeScanner';
import Checkroom from '@mui/icons-material/Checkroom';
import type { DeviceTypeInfo } from './types';

const accessoryDeviceTypes = {
  UNKNOWN: { label: 'Unknown device', icon: QuestionMark },
  PIEZO_BUZZER: { label: 'Buzzer', icon: VolumeUp },
  DUPLO_TRAIN_BASE_SPEAKER: { label: 'Speaker', icon: VolumeUp },
  REMOTE_CONTROL_BUTTON: { label: 'Button', icon: TouchApp },
  REMOTE_CONTROL_RSSI: { label: 'Signal sensor', icon: SignalCellularAlt },
  MARIO_BARCODE_SENSOR: { label: 'Mario code reader', icon: QrCodeScanner },
  MARIO_PANTS_SENSOR: { label: 'Mario outfit sensor', icon: Checkroom },
} satisfies Record<string, DeviceTypeInfo>;

export default accessoryDeviceTypes;
