'use client';

import { create } from 'zustand';

type CanvasState = {
  scale: number;
  offsetX: number;
  offsetY: number;
  setScale: (scale: number) => void;
  setOffset: (offsetX: number, offsetY: number) => void;
  resetView: () => void;
};

export const useCanvasStore = create<CanvasState>((set) => ({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  setScale: (scale) => set({ scale: Math.min(2, Math.max(0.35, scale)) }),
  setOffset: (offsetX, offsetY) => set({ offsetX, offsetY }),
  resetView: () => set({ scale: 1, offsetX: 0, offsetY: 0 }),
}));
