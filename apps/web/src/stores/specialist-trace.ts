/**
 * Specialist trace store — tracks which specialists ran, their timing,
 * and provides a timeline for the trace UI.
 */

import { create } from "zustand";

export interface TraceEntry {
  seq: number;
  specialist: string;
  displayName: string;
  goalKind: string;
  latencyMs: number;
  costUsd: number;
  writesCount: number;
  conflictsCount: number;
  timestamp: number;
}

interface SpecialistTraceState {
  entries: TraceEntry[];
  totalTicks: number;
  totalLatencyMs: number;
  totalCostUsd: number;

  addEntry: (entry: TraceEntry) => void;
  reset: () => void;
}

export const useSpecialistTrace = create<SpecialistTraceState>((set, get) => ({
  entries: [],
  totalTicks: 0,
  totalLatencyMs: 0,
  totalCostUsd: 0,

  addEntry: (entry) => {
    const state = get();
    set({
      entries: [...state.entries, entry],
      totalTicks: state.totalTicks + 1,
      totalLatencyMs: state.totalLatencyMs + entry.latencyMs,
      totalCostUsd: state.totalCostUsd + entry.costUsd,
    });
  },

  reset: () => set({ entries: [], totalTicks: 0, totalLatencyMs: 0, totalCostUsd: 0 }),
}));
