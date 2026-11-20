import type {
  Control,
  ControlType,
  DeviceInfo,
  LightControlType,
} from '../../core/types';
import type {
  ControlDefinitions,
  ControlProposal,
  ShortcutField,
} from './shared/types';
import slider from './slider/definition';
import arrows from './arrows/definition';
import stop from './stop/definition';
import distance, { distanceRanges } from './distance/definition';
import color from './color/definition';
import tilt from './tilt/definition';
import brightness from './brightness/definition';
import power from './power/definition';
import palette from './palette/definition';
import customColor from './custom-color/definition';

export const controlTypes: ControlDefinitions = {
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

export { distanceRanges };

export const shortcutFields = Object.fromEntries(
  Object.entries(controlTypes).map(([type, definition]) => [
    type,
    definition.shortcutFields,
  ])
) as Record<ControlType, readonly ShortcutField[]>;

// Identify control types whose output is a light setting.
export function isLightControlType(
  type: string | undefined
): type is LightControlType {
  return ['brightness', 'power', 'palette', 'customColor'].some(
    (candidate) => candidate === type
  );
}

// Check whether a control type can operate on the selected device and hub.
export function isCompatible(
  type: ControlType | string | undefined,
  device: Pick<DeviceInfo, 'type' | 'hubType'> | null | undefined
): boolean {
  if (!type || !Object.hasOwn(controlTypes, type) || !device) return false;
  const definition = controlTypes[type as ControlType];
  return Boolean(
    definition.devices.includes(device.type.num) &&
    (definition.isCompatible?.(device) ?? true)
  );
}

// List control definitions supported by the selected device.
export function getControlTypes(
  device: Pick<DeviceInfo, 'type' | 'hubType'> | null | undefined
): ControlProposal[] {
  return (Object.keys(controlTypes) as ControlType[])
    .filter((type) => isCompatible(type, device))
    .map((type) => {
      const { label, defaults, motor, devices, sizes, mode } =
        controlTypes[type];
      return { type, label, defaults, motor, devices, sizes, mode };
    });
}

// Resolve the direction multiplier applied by a control's motor settings.
export function motorDirection(control: Control | undefined): number {
  return control
    ? (controlTypes[control.type].motorDirection?.(control) ?? 1)
    : 1;
}
