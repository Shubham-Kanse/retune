/**
 * In-process registry mapping applicationId → AbortController.
 * The stream route registers on start; the cancel route calls abortGeneration().
 * Supports AbortSignal.any() to merge client-disconnect + explicit cancel.
 */

const registry = new Map<string, AbortController>();

export function registerGeneration(applicationId: string): AbortController {
  const ctrl = new AbortController();
  registry.set(applicationId, ctrl);
  return ctrl;
}

export function abortGeneration(applicationId: string): boolean {
  const ctrl = registry.get(applicationId);
  if (!ctrl) return false;
  ctrl.abort();
  registry.delete(applicationId);
  return true;
}

export function deregisterGeneration(applicationId: string): void {
  registry.delete(applicationId);
}

export function isGenerationActive(applicationId: string): boolean {
  return registry.has(applicationId);
}
