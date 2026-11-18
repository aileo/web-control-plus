import type React from 'react';
import type { Control, Rect } from '../core/types';

export type DialogBusyProps = {
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
};

export type LayoutGesture = 'move' | 'resize';
export type StartGesture = (
  event: React.PointerEvent<HTMLElement>,
  control: Control,
  kind: LayoutGesture
) => void;

export type LayoutPreview = { id: string; rect: Rect; valid: boolean };
export type BoardRef = React.RefObject<HTMLDivElement | null>;
