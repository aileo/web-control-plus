import type {
  Control,
  ControlType,
  DeviceInfo,
  LightControlType,
} from '../../core/types';
import { hasAbsoluteAngle } from '../../core/position-motor';
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

// Only an explicitly verified adapter may enable position controls.
export function motorPositionCapabilities(device?: DeviceInfo | null) {
  const verified = Boolean(
    device?.connected && hasAbsoluteAngle(device.positionDriver)
  );
  const finiteAngle = device?.positionDriver?.finiteAngle;
  return {
    absolutePosition: verified,
    finiteAngle: Boolean(
      verified &&
      finiteAngle &&
      Number.isFinite(finiteAngle.minDegrees) &&
      Number.isFinite(finiteAngle.maxDegrees) &&
      finiteAngle.minDegrees > 0 &&
      finiteAngle.maxDegrees >= finiteAngle.minDegrees
    ),
    positionFeedback: verified,
    safeStop: verified,
  };
}

export function supportsServo(device?: DeviceInfo | null): boolean {
  return Boolean(device?.connected && device.servoDriver);
}

export function supportsStep(device?: DeviceInfo | null): boolean {
  return supportsServo(device) || motorPositionCapabilities(device).finiteAngle;
}

export function stepAngleRange(device?: DeviceInfo | null) {
  if (motorPositionCapabilities(device).finiteAngle)
    return device?.positionDriver?.finiteAngle;
  if (supportsServo(device)) return { minDegrees: 1, maxDegrees: 0x7fffffff };
  return undefined;
}

type MotorMode = 'speed' | 'servo' | 'step';
type ControlChoice = ControlProposal & { motorMode?: MotorMode };

export function getControlChoices(device?: DeviceInfo | null): ControlChoice[] {
  return getControlTypes(device).flatMap<ControlChoice>((definition) => {
    if (definition.type !== 'slider' && definition.type !== 'arrows')
      return [{ ...definition }];
    const modes: MotorMode[] = ['speed'];
    if (supportsServo(device)) modes.push('servo');
    if (definition.type === 'arrows' && supportsStep(device))
      modes.push('step');
    const labels = { speed: 'Speed', servo: 'Servo', step: 'Step' };
    return modes.map((motorMode) => ({
      ...definition,
      motorMode,
      label: `${definition.label} - ${labels[motorMode]}`,
    }));
  });
}

// Resolve the direction multiplier applied by a control's motor settings.
export function motorDirection(control: Control | undefined): number {
  return control
    ? (controlTypes[control.type].motorDirection?.(control) ?? 1)
    : 1;
}
