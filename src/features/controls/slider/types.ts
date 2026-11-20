export type Options = {
  mode: 'speed' | 'servo';
  servoMin: number | '';
  servoMax: number | '';
  autoReturnToCenter: boolean;
  resetOnRelease: boolean;
  reverseRotation: boolean;
  increase10Key: string;
  increase1Key: string;
  decrease1Key: string;
  decrease10Key: string;
};
