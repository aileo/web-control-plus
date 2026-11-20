import Lightbulb from '@mui/icons-material/Lightbulb';
import GridOn from '@mui/icons-material/GridOn';
import type { DeviceTypeInfo } from './types';

const lightDeviceTypes = {
  LIGHT: { label: 'Light', icon: Lightbulb },
  HUB_LED: { label: 'Hub light', icon: Lightbulb },
  TECHNIC_3X3_COLOR_LIGHT_MATRIX: { label: 'Light grid', icon: GridOn },
} satisfies Record<string, DeviceTypeInfo>;

export default lightDeviceTypes;
