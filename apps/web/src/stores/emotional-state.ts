/**
 * Emotional state store — passive display of inferred user affect.
 * Used by the EmotionalStateBadge widget. Never shown intrusively.
 */

import { create } from "zustand";

export interface EmotionalSnapshot {
  primaryEmotion: string;
  valence: number;
  arousal: number;
  dominance: number;
  confidence: number;
  timestamp: number;
}

interface EmotionalStateStore {
  current: EmotionalSnapshot | null;
  history: EmotionalSnapshot[];

  update: (snapshot: EmotionalSnapshot) => void;
  reset: () => void;
}

const MAX_HISTORY = 50;

export const useEmotionalState = create<EmotionalStateStore>((set, get) => ({
  current: null,
  history: [],

  update: (snapshot) => {
    const state = get();
    const history = [...state.history, snapshot].slice(-MAX_HISTORY);
    set({ current: snapshot, history });
  },

  reset: () => set({ current: null, history: [] }),
}));
