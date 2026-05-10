/**
 * Goal DAG store — tracks active, satisfied, and abandoned goals
 * for the force-directed graph visualization.
 */

import { create } from "zustand";

export interface GoalNode {
  id: string;
  kind: string;
  priority: number;
  status: "pending" | "active" | "satisfied" | "abandoned";
  emittedBy: string;
  parentId: string | null;
  satisfiedBy: string | null;
  timestamp: number;
}

interface GoalDagState {
  goals: GoalNode[];

  addGoal: (goal: GoalNode) => void;
  satisfyGoal: (id: string, by: string) => void;
  abandonGoal: (id: string) => void;
  activateGoal: (id: string) => void;
  reset: () => void;
}

export const useGoalDag = create<GoalDagState>((set, get) => ({
  goals: [],

  addGoal: (goal) => set({ goals: [...get().goals, goal] }),

  satisfyGoal: (id, by) =>
    set({
      goals: get().goals.map((g) =>
        g.id === id ? { ...g, status: "satisfied" as const, satisfiedBy: by } : g,
      ),
    }),

  abandonGoal: (id) =>
    set({
      goals: get().goals.map((g) => (g.id === id ? { ...g, status: "abandoned" as const } : g)),
    }),

  activateGoal: (id) =>
    set({
      goals: get().goals.map((g) => (g.id === id ? { ...g, status: "active" as const } : g)),
    }),

  reset: () => set({ goals: [] }),
}));
