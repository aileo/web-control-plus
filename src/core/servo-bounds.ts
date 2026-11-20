export type ServoBounds = { servoMin: number; servoMax: number };

export const defaultServoBounds: ServoBounds = {
  servoMin: -180,
  servoMax: 180,
};

export function validServoBounds(min: unknown, max: unknown): boolean {
  return (
    typeof min === 'number' &&
    typeof max === 'number' &&
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    min >= -0x7fffffff &&
    max <= 0x7fffffff &&
    min <= 0 &&
    max >= 0 &&
    min < max
  );
}

export function requireServoBounds(options: Record<string, unknown>): void {
  if (typeof options.autoReturnToCenter !== 'boolean')
    throw new Error('Invalid auto return to center setting');
  if (
    options.mode === 'servo' &&
    !validServoBounds(options.servoMin, options.servoMax)
  )
    throw new Error(
      'Enter ordered whole-degree Servo bounds that contain zero'
    );
}
