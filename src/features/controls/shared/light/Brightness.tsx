import React from 'react';
import SliderFace, { RangeInput } from '../SliderFace';

// Render the brightness slider for a light control.
function Brightness({
  value,
  step,
  vertical,
  onChange,
}: {
  value: number;
  step: number;
  vertical: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <SliderFace
      speed={value}
      min={0}
      max={100}
      vertical={vertical}
      input={
        <RangeInput
          aria-label="Light brightness"
          vertical={vertical}
          min={0}
          max={100}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      }
    />
  );
}

export default Brightness;
