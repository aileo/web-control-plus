import { getContrastRatio } from '@mui/material/styles';

const yellow = '#ffed00';
const gray = '#e8e9eb';
const green = '#04a777';
const blue = '#2b59c3';
const red = '#e3000b';

const texts = ['#000000', '#ffffff'] as const;

function getContrastText(color: string): string {
  return texts.reduce(
    (acc, text): { contrast: number; value: string } => {
      const contrast = getContrastRatio(color, text);
      if (contrast > acc.contrast) {
        acc.contrast = contrast;
        acc.value = text;
      }
      return acc;
    },
    { contrast: 0, value: '' }
  ).value;
}

function colorBuilder(hex: string): { main: string; contrastText: string } {
  return {
    main: hex,
    contrastText: getContrastText(hex),
  };
}

export default {
  primary: colorBuilder(yellow),
  secondary: colorBuilder(gray),
  success: colorBuilder(green),
  info: colorBuilder(blue),
  warning: colorBuilder(yellow),
  error: colorBuilder(red),
};
