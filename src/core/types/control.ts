import type { BoardColor } from '../board-colors';
import type {
  ControlOptions,
  ControlType,
  LightControlType,
  Size,
} from '../../features/controls/types';

export type { ControlOptions, ControlType, LightControlType, Size };
export type Rect = Size & { x: number; y: number };
export type BoardOccupant = Rect & { id: string };

type ControlBase<K extends ControlType, Options> = Rect & {
  id: string;
  uuid: string;
  port: string;
  title: string;
  type: K;
  options: Options;
};

export type ControlOf<K extends ControlType> = ControlBase<
  K,
  ControlOptions[K]
>;

export type Control = { [K in ControlType]: ControlOf<K> }[ControlType];

export type Board = {
  id: string;
  name: string;
  controlIds: string[];
  color?: BoardColor;
};
