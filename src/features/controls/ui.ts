import type { ControlType } from './types';
import type { ControlUIModule } from './shared/control-ui';
import slider from './slider/ui';
import arrows from './arrows/ui';
import stop from './stop/ui';
import distance from './distance/ui';
import color from './color/ui';
import tilt from './tilt/ui';
import brightness from './brightness/ui';
import power from './power/ui';
import palette from './palette/ui';
import customColor from './custom-color/ui';

const controlUI: { [K in ControlType]: ControlUIModule<K> } = {
  slider,
  arrows,
  stop,
  distance,
  color,
  tilt,
  brightness,
  power,
  palette,
  customColor,
};

export default controlUI;
