/**
 * Temporal task queue constants.
 *
 * One task queue per bounded workflow family. Cognitive-cycle workflows
 * live on `COGNITIVE_TASK_QUEUE`. Keep the name stable — changing it
 * orphans in-flight workflows on production servers.
 */

export const COGNITIVE_TASK_QUEUE = "retune-cognitive";
