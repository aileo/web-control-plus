export type Options = {
  mode: 'speed' | 'servo' | 'step';
  servoMin: number | '';
  servoMax: number | '';
  autoReturnToCenter: boolean;
  speed: number;
  angle: number;
  stopOnRelease: boolean;
  forwardKey: string;
  stopKey: string;
  backwardKey: string;
};
