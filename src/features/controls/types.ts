import type { Options as ArrowsOptions } from './arrows/types';
import type { Options as BrightnessOptions } from './brightness/types';
import type { Options as ColorOptions } from './color/types';
import type { Options as CustomColorOptions } from './custom-color/types';
import type { Options as DistanceOptions } from './distance/types';
import type { Options as PaletteOptions } from './palette/types';
import type { Options as PowerOptions } from './power/types';
import type { Options as SliderOptions } from './slider/types';
import type { Options as StopOptions } from './stop/types';
import type { Options as TiltOptions } from './tilt/types';

export type ControlType =
  | 'slider'
  | 'arrows'
  | 'stop'
  | 'distance'
  | 'color'
  | 'tilt'
  | 'brightness'
  | 'power'
  | 'palette'
  | 'customColor';

export type LightControlType =
  'brightness' | 'power' | 'palette' | 'customColor';

export type Size = { w: number; h: number };

export type ControlOptions = {
  slider: SliderOptions;
  arrows: ArrowsOptions;
  stop: StopOptions;
  distance: DistanceOptions;
  color: ColorOptions;
  tilt: TiltOptions;
  brightness: BrightnessOptions;
  power: PowerOptions;
  palette: PaletteOptions;
  customColor: CustomColorOptions;
};
