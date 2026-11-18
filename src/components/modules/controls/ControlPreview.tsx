import React from 'react';
import { Box } from '@mui/material';
import { controlOptions, controlTypes } from '../../../core/controlTypes';
import { tileSx } from '../../../theme/lego';
import SliderFace from './SliderFace';
import { ArrowsFace } from './Arrows';
import { StopFace } from './Stop';
import Distance from './Distance';
import Color from './Color';
import Tilt from './Tilt';
import { PowerFace, PaletteFace } from './Light';
import { CustomColorFace } from './CustomColor';
import type { ControlType } from '../../../core/types';

function ControlPreview({
  type,
  hubColor,
}: {
  type: ControlType;
  hubColor?: string;
}) {
  let face;
  if (type === 'power') face = <PowerFace />;
  else if (type === 'brightness')
    face = <SliderFace speed={70} min={0} max={100} />;
  else if (type === 'palette') face = <PaletteFace />;
  else if (type === 'customColor')
    face = (
      <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
        <CustomColorFace />
      </Box>
    );
  else if (type === 'slider') face = <SliderFace />;
  else if (type === 'arrows') face = <ArrowsFace preview />;
  else if (type === 'stop') face = <StopFace preview />;
  else if (type === 'distance') {
    face = (
      <Distance
        control={{ w: 1 }}
        device={{
          type: { num: controlTypes.distance.devices[0] },
          events: { distance: [120] },
        }}
      />
    );
  } else if (type === 'color') {
    face = <Color control={{ w: 1 }} device={{ events: { color: [9] } }} />;
  } else if (type === 'tilt') {
    face = (
      <Tilt
        control={{ w: 1, options: controlOptions('tilt') }}
        device={{ events: { tilt: [-15, 20] } }}
      />
    );
  } else throw new Error('Unknown control preview');
  return (
    <Box
      aria-hidden="true"
      data-control-preview={type}
      sx={{
        ...tileSx(hubColor),
        width: 176,
        maxWidth: '100%',
        height: 136,
        p: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      {face}
    </Box>
  );
}

export default ControlPreview;
