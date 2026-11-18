import { CONSTS } from './clients/lego';
import { ledCapabilities, ledTypes } from './leds';
import type {
  Control,
  ControlOptions,
  ControlType,
  DeviceInfo,
  LightControlType,
  Size,
} from './types';

const { DeviceType, HubType } = CONSTS;

type ShortcutField = {
  option: string;
  label: string;
  delta?: number;
  direction?: number;
  speed?: number;
  action?: 'on' | 'off';
};

type ControlDefinition = {
  label: string;
  defaults: Record<string, unknown>;
  motor?: boolean;
  devices: readonly number[];
  sizes: readonly Size[];
  mode?: (type: number, hubType?: number) => number;
};

type Shortcut = {
  key: string;
  label: string;
  action?: 'on' | 'off';
  delta?: number;
  speed?: number;
  stopOnRelease: boolean;
};

export const shortcutFields: Record<ControlType, readonly ShortcutField[]> = {
  slider: [
    { option: 'increase10Key', label: 'Increase by 10', delta: 10 },
    { option: 'increase1Key', label: 'Increase by 1', delta: 1 },
    { option: 'decrease1Key', label: 'Decrease by 1', delta: -1 },
    { option: 'decrease10Key', label: 'Decrease by 10', delta: -10 },
  ],
  arrows: [
    { option: 'forwardKey', label: 'Forward', direction: 1 },
    { option: 'stopKey', label: 'Stop', speed: 0 },
    { option: 'backwardKey', label: 'Backward', direction: -1 },
  ],
  stop: [{ option: 'stopKey', label: 'Stop', speed: 0 }],
  distance: [],
  color: [],
  tilt: [],
  brightness: [],
  palette: [],
  customColor: [],
  power: [
    { option: 'onKey', label: 'On', action: 'on' },
    { option: 'offKey', label: 'Off', action: 'off' },
  ],
};

function keyDefaults(type: ControlType): Record<string, string> {
  return Object.fromEntries(
    shortcutFields[type].map(({ option }) => [option, ''])
  );
}

export function normalizeShortcutKey(key: unknown): string | null {
  if (typeof key !== 'string') return null;
  if ([' ', 'Enter', 'Tab', 'Escape'].includes(key)) return null;
  if ([...key].length === 1) return key.toLowerCase();
  return [
    'Backspace',
    'Delete',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End',
    'PageUp',
    'PageDown',
  ].includes(key)
    ? key
    : null;
}

export const shortcutLabel = (key: string): string =>
  key === ' ' ? 'Space' : key;

export const motorDirection = (control: Control | undefined): number =>
  control?.type === 'slider' && control.options.reverseRotation ? -1 : 1;

export function controlShortcuts(control: Control): Shortcut[] {
  return shortcutFields[control.type].flatMap((field) => {
    const key = Object.entries(control.options).find(
      ([option]) => option === field.option
    )?.[1];
    if (typeof key !== 'string' || !key) return [];
    const delta =
      typeof field.delta === 'number'
        ? field.delta * motorDirection(control)
        : undefined;
    const speed =
      typeof field.direction === 'number' && control.type === 'arrows'
        ? field.direction * control.options.speed
        : field.speed;
    return [
      {
        key,
        label: field.label,
        action: field.action,
        delta,
        speed,
        stopOnRelease:
          typeof field.delta === 'number'
            ? control.type === 'slider' && control.options.resetOnRelease
            : Boolean(
                field.direction &&
                control.type === 'arrows' &&
                control.options.stopOnRelease
              ),
      },
    ];
  });
}

// Reported millimeters; the color sensor subtracts a 20mm offset.
export const distanceRanges: Record<number, number> = {
  [DeviceType.COLOR_DISTANCE_SENSOR]: 234,
  [DeviceType.MOTION_SENSOR]: 5100,
};

const motors = [
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

const squareSizes: readonly Size[] = [
  { w: 1, h: 1 },
  { w: 2, h: 2 },
];
const sliderSizes: readonly Size[] = [
  { w: 1, h: 2 },
  { w: 2, h: 1 },
  { w: 1, h: 4 },
  { w: 4, h: 1 },
  { w: 1, h: 6 },
  { w: 6, h: 1 },
  { w: 8, h: 1 },
];
const colorSizes: readonly Size[] = [
  { w: 1, h: 1 },
  { w: 1, h: 2 },
  { w: 2, h: 1 },
  { w: 2, h: 2 },
];
const lightDevices = Object.keys(ledTypes).map(Number);

export function isLightControlType(
  type: string | undefined
): type is LightControlType {
  return ['brightness', 'power', 'palette', 'customColor'].some(
    (candidate) => candidate === type
  );
}

export const controlTypes: Record<ControlType, ControlDefinition> = {
  slider: {
    label: 'Motor slider',
    defaults: {
      resetOnRelease: false,
      reverseRotation: false,
      ...keyDefaults('slider'),
    },
    motor: true,
    devices: motors,
    sizes: sliderSizes,
  },
  arrows: {
    label: 'Motor arrows',
    defaults: { speed: 100, stopOnRelease: true, ...keyDefaults('arrows') },
    motor: true,
    devices: motors,
    sizes: [
      { w: 1, h: 2 },
      { w: 2, h: 1 },
    ],
  },
  stop: {
    label: 'Stop',
    defaults: keyDefaults('stop'),
    motor: true,
    devices: motors,
    sizes: squareSizes,
  },
  distance: {
    label: 'Distance',
    defaults: { scale: 'progressive' },
    devices: [DeviceType.COLOR_DISTANCE_SENSOR, DeviceType.MOTION_SENSOR],
    sizes: squareSizes,
    mode: (type) => (type === DeviceType.COLOR_DISTANCE_SENSOR ? 8 : 0),
  },
  color: {
    label: 'Color',
    defaults: { stability: 0 },
    devices: [
      DeviceType.COLOR_DISTANCE_SENSOR,
      DeviceType.TECHNIC_COLOR_SENSOR,
      DeviceType.DUPLO_TRAIN_BASE_COLOR_SENSOR,
    ],
    sizes: squareSizes,
    mode: (type, hubType) => {
      if (type === DeviceType.COLOR_DISTANCE_SENSOR) {
        return hubType === HubType.WEDO2_SMART_HUB ? 0 : 8;
      }
      return type === DeviceType.DUPLO_TRAIN_BASE_COLOR_SENSOR ? 1 : 0;
    },
  },
  tilt: {
    label: 'Tilt',
    defaults: {
      rollAxis: 0,
      pitchAxis: 1,
      rollReverseFactor: 1,
      pitchReverseFactor: 1,
    },
    devices: [
      DeviceType.TILT_SENSOR,
      DeviceType.MOVE_HUB_TILT_SENSOR,
      DeviceType.TECHNIC_MEDIUM_HUB_TILT_SENSOR,
    ],
    sizes: squareSizes,
    mode: () => 0,
  },
  brightness: {
    label: 'Brightness',
    defaults: {},
    devices: lightDevices,
    sizes: sliderSizes,
  },
  power: {
    label: 'On/Off',
    defaults: keyDefaults('power'),
    devices: lightDevices,
    sizes: [{ w: 1, h: 1 }],
  },
  palette: {
    label: 'Color palette',
    defaults: {},
    devices: lightDevices,
    sizes: colorSizes,
  },
  customColor: {
    label: 'Custom color',
    defaults: {},
    devices: lightDevices,
    sizes: colorSizes,
  },
};

export function isCompatible(
  type: ControlType | string | undefined,
  device: Pick<DeviceInfo, 'type' | 'hubType'> | null | undefined
): boolean {
  if (isLightControlType(type)) {
    const capabilities = ledCapabilities(device?.type.num, device?.hubType);
    if (!capabilities) return false;
    if (type === 'brightness') return capabilities.step !== null;
    if (type === 'palette') return capabilities.color !== null;
    if (type === 'customColor') return capabilities.color === 'rgb';
    return true;
  }
  if (!type || !Object.hasOwn(controlTypes, type) || !device) return false;
  return Boolean(
    controlTypes[type as ControlType].devices.includes(device.type.num) &&
    !(
      type === 'distance' &&
      device.type.num === DeviceType.COLOR_DISTANCE_SENSOR &&
      device.hubType === HubType.WEDO2_SMART_HUB
    )
  );
}

export function getControlTypes(
  device: Pick<DeviceInfo, 'type' | 'hubType'> | null | undefined
): Array<{ type: ControlType } & ControlDefinition> {
  return (Object.keys(controlTypes) as ControlType[])
    .filter((type) => isCompatible(type, device))
    .map((type) => ({ type, ...controlTypes[type] }));
}

export function controlOptions<K extends ControlType>(
  type: K,
  options: unknown = {}
): ControlOptions[K] {
  if (!Object.hasOwn(controlTypes, type)) {
    throw new Error('Unknown control type');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Invalid control options');
  }
  const { defaults } = controlTypes[type];
  const supplied = options as Record<string, unknown>;
  const result: Record<string, unknown> = { ...defaults, ...supplied };
  if (Object.keys(supplied).some((key) => !Object.hasOwn(defaults, key))) {
    throw new Error('Unknown control option');
  }
  shortcutFields[type].forEach(({ option }) => {
    if (result[option] === '') return;
    const key = normalizeShortcutKey(result[option]);
    if (!key)
      throw new Error(
        'Choose a single key (Tab, Escape, Space, and Enter are reserved)'
      );
    result[option] = key;
  });
  if (type === 'arrows' && typeof result.stopOnRelease !== 'boolean') {
    throw new Error('Invalid stop-on-release setting');
  }
  if (type === 'slider' && typeof result.resetOnRelease !== 'boolean') {
    throw new Error('Invalid reset-on-release setting');
  }
  if (type === 'slider' && typeof result.reverseRotation !== 'boolean') {
    throw new Error('Invalid reverse rotation setting');
  }
  if (
    type === 'arrows' &&
    (!Number.isInteger(result.speed) ||
      typeof result.speed !== 'number' ||
      result.speed < 1 ||
      result.speed > 100)
  ) {
    throw new Error('Choose a whole-number speed between 1 and 100');
  }
  if (
    type === 'distance' &&
    (typeof result.scale !== 'string' ||
      !['progressive', 'linear'].includes(result.scale))
  ) {
    throw new Error('Choose Progressive or Linear distance scale');
  }
  if (
    type === 'color' &&
    (typeof result.stability !== 'number' ||
      ![0, 150, 400].includes(result.stability))
  ) {
    throw new Error('Choose a supported color stability');
  }
  if (type === 'tilt') {
    if (
      ![result.rollAxis, result.pitchAxis].every(
        (axis) => typeof axis === 'number' && [0, 1, 2].includes(axis)
      )
    ) {
      throw new Error('Choose an X, Y, or Z tilt axis');
    }
    if (
      ![result.rollReverseFactor, result.pitchReverseFactor].every(
        (value) => typeof value === 'number' && [1, -1].includes(value)
      )
    ) {
      throw new Error('Invalid tilt reversal');
    }
  }
  // Expose typed options only after validating their runtime shape.
  return result as ControlOptions[K];
}
