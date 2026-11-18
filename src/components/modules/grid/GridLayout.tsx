import React, { useLayoutEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { alpha, lighten } from '@mui/material/styles';
import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  BOARD_WIDTH,
  BOARD_HEIGHT,
} from '../../../core/control-layout';
import createBoardPattern from '../../../core/board-pattern';
import { legoColors, studSx } from '../../../theme/lego';
import type { BoardRef } from '../../types';

const plates = createBoardPattern();

function GridLayout({
  boardRef,
  children,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  alignTop = false,
}: React.PropsWithChildren<{
  boardRef: BoardRef;
  onPointerMove: React.PointerEventHandler<HTMLDivElement>;
  onPointerUp: React.PointerEventHandler<HTMLDivElement>;
  onPointerCancel: React.PointerEventHandler<HTMLDivElement>;
  alignTop?: boolean;
}>) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const { width, height } = viewport.current!.getBoundingClientRect();
      setScale(
        Math.max(0, Math.min(width / BOARD_WIDTH, height / BOARD_HEIGHT))
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, []);
  return (
    <Box
      ref={viewport}
      data-board-viewport
      sx={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: 'flex',
        alignItems: alignTop ? 'flex-start' : 'center',
        justifyContent: 'center',
      }}
    >
      <Box
        data-board-frame
        sx={{
          position: 'relative',
          flexShrink: 0,
          width: BOARD_WIDTH * scale,
          height: BOARD_HEIGHT * scale,
        }}
      >
        <Box
          ref={boardRef}
          data-control-board
          role="region"
          aria-label="Control board, 10 columns and 6 rows"
          tabIndex={-1}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onPointerCancel}
          sx={{
            display: 'grid',
            position: 'absolute',
            overflow: 'hidden',
            bgcolor: legoColors.plate,
            width: BOARD_WIDTH,
            height: BOARD_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            gridTemplateColumns: `repeat(${BOARD_COLUMNS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${BOARD_ROWS}, minmax(0, 1fr))`,
          }}
        >
          {plates.map(({ x, y, w, h, color }, plateId) => (
            <React.Fragment key={`${x},${y}`}>
              {Array.from({ length: w * h }, (_, index) => (
                <Box
                  key={index}
                  aria-hidden="true"
                  data-stud
                  data-plate-cell={plateId}
                  sx={(theme) => ({
                    ...studSx,
                    bgcolor: lighten(theme.palette[color].main, 0.9),
                    fontSize: '0.875rem',
                    gridColumn: x + (index % w) + 1,
                    gridRow: y + Math.floor(index / w) + 1,
                  })}
                />
              ))}
              <Box
                aria-hidden="true"
                data-board-plate={`${w}x${h}`}
                data-plate-id={plateId}
                sx={{
                  position: 'relative',
                  pointerEvents: 'none',
                  gridColumn: `${x + 1} / span ${w}`,
                  gridRow: `${y + 1} / span ${h}`,
                  boxShadow: `inset 0 0 0 1px ${alpha(legoColors.dark, 0.25)}`,
                }}
              />
            </React.Fragment>
          ))}
          {children}
        </Box>
      </Box>
    </Box>
  );
}

export default GridLayout;
