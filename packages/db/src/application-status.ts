export type ApplicationStatus =
  | "pending"
  | "generating"
  | "completed"
  | "failed"
  | "submitted"
  | "archived"
  | "cancelled";

const validTransitions: Record<ApplicationStatus, ApplicationStatus[]> = {
  pending: ["generating", "failed", "archived"],
  generating: ["completed", "failed", "cancelled"],
  completed: ["submitted", "archived"],
  failed: ["generating", "archived", "pending"],
  submitted: ["archived"],
  cancelled: ["archived", "pending"],
  archived: [],
};

export function isValidStatusTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return validTransitions[from]?.includes(to) ?? false;
}

export function getValidNextStatuses(current: ApplicationStatus): ApplicationStatus[] {
  return validTransitions[current] || [];
}
