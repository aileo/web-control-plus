import tinycolor from 'tinycolor2';

export type RgbColor = { r: number; g: number; b: number };
type HueRange = readonly [number, number];
type HubColor = { hex: string; rgb: RgbColor };
type HubColorCalibration = {
  gains: RgbColor;
  gamma: number;
  excludedHues: HueRange[];
};

export const hubColorPalette: Record<string, HubColor> = {
  red: { hex: '#ff8a80', rgb: { r: 255, g: 0, b: 0 } },
  orange: { hex: '#ffb74d', rgb: { r: 255, g: 128, b: 0 } },
  yellow: { hex: '#ffd54f', rgb: { r: 255, g: 255, b: 0 } },
  lime: { hex: '#dce775', rgb: { r: 128, g: 255, b: 0 } },
  green: { hex: '#66cc88', rgb: { r: 0, g: 255, b: 0 } },
  blue: { hex: '#64b5f6', rgb: { r: 0, g: 0, b: 255 } },
  violet: { hex: '#b388ff', rgb: { r: 128, g: 0, b: 255 } },
};

export const hubColorCalibration: HubColorCalibration = {
  gains: { r: 1, g: 0.5, b: 1 },
  gamma: 1,
  excludedHues: [] as HueRange[],
};

// Apply hub LED calibration and brightness to an RGB color.
export function calibrateRGB(rgb: RgbColor, brightness = 100): RgbColor {
  const { gains, gamma } = hubColorCalibration;
  // Apply the channel-specific gain and gamma before scaling brightness.
  const scale = (channel: keyof RgbColor): number =>
    Math.round(
      (Math.min(255, 255 * (rgb[channel] / 255) ** gamma * gains[channel]) *
        brightness) /
        100
    );
  return { r: scale('r'), g: scale('g'), b: scale('b') };
}

// Derive a stable calibrated hub color from arbitrary text.
export function colorFromText(text: string): {
  name: string;
  hex: string;
  rgb: RgbColor;
  ledRgb: RgbColor;
} {
  const { gains, gamma, excludedHues } = hubColorCalibration;
  if (
    excludedHues.some(
      ([start, end]) =>
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end > 360 ||
        start >= end
    )
  ) {
    throw new Error('Invalid excluded hub hue range');
  }
  const colors = Object.entries(hubColorPalette).filter(([, color]) => {
    const hue = tinycolor(color.rgb).toHsv().h;
    return !excludedHues.some(([start, end]) => hue >= start && hue < end);
  });
  if (!colors.length) throw new Error('Hub colors must allow at least one hue');
  if (
    !Number.isFinite(gamma) ||
    gamma <= 0 ||
    (['r', 'g', 'b'] as const).some(
      (channel) => !Number.isFinite(gains[channel]) || gains[channel] < 0
    ) ||
    !(['r', 'g', 'b'] as const).some((channel) => gains[channel] > 0)
  ) {
    throw new Error('Invalid hub LED calibration');
  }
  const hash = [...text].reduce(
    (value, character) =>
      (value * 31 + (character.codePointAt(0) ?? 0)) % 4294967296,
    0
  );
  const selected = colors[hash % colors.length];
  if (!selected) throw new Error('Hub colors must allow at least one hue');
  const [name, { hex, rgb }] = selected;
  const ledRgb = calibrateRGB(rgb);
  if (!Object.values(ledRgb).some((value) => value > 0)) {
    throw new Error('Hub LED calibration produces an off color');
  }
  return { name, hex, rgb: { ...rgb }, ledRgb };
}
