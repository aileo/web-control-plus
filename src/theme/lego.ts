import { alpha } from '@mui/material/styles';

export const legoColors = {
  blue: '#009ee3',
  red: '#de0029',
  yellow: '#fff700',
  light: '#f8f9fa',
  dark: '#343a40',
  plate: '#e8e9eb',
};

export const studSx = {
  position: 'relative',
  bgcolor: 'inherit',
  pointerEvents: 'none',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: '20%',
    left: '20%',
    width: '60%',
    height: '60%',
    borderRadius: '50%',
    bgcolor: 'inherit',
    border: `1px solid ${alpha(legoColors.dark, 0.4)}`,
    boxShadow: [
      `inset -2px -2px 2px ${alpha(legoColors.dark, 0.4)}`,
      'inset 2px 2px 2px #ffffffaa',
      `2px 2px 8px ${alpha(legoColors.dark, 0.4)}`,
    ].join(','),
  },
  '&::after': {
    content: '"WCP"',
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: '#ffffff99',
    fontSize: 'inherit',
    fontStyle: 'italic',
    fontWeight: 'bold',
    textShadow: `1px 1px 2px ${alpha(legoColors.dark, 0.5)}`,
  },
};

export function tileSx(hubColor = legoColors.light) {
  return {
    bgcolor: legoColors.light,
    color: legoColors.dark,
    backgroundImage: `linear-gradient(135deg, ${alpha(
      hubColor,
      0.24
    )}, transparent 75%)`,
    border: `1px solid ${alpha(legoColors.dark, 0.4)}`,
    borderRadius: 0,
    boxShadow: [
      `inset -2px -2px 2px ${alpha(legoColors.dark, 0.3)}`,
      `3px 3px 8px ${alpha(legoColors.dark, 0.35)}`,
    ].join(','),
  };
}
