const activeGenerations = new Map<string, number>();
const GLOBAL_LIMIT = 20; // max concurrent generations across all users
const USER_LIMIT = 5; // max concurrent generations per user
let globalCount = 0;

export async function acquireGenerationSlot(userId: string): Promise<() => void> {
  while (true) {
    const userCount = activeGenerations.get(userId) || 0;

    if (globalCount < GLOBAL_LIMIT && userCount < USER_LIMIT) {
      activeGenerations.set(userId, userCount + 1);
      globalCount += 1;

      return () => {
        const current = activeGenerations.get(userId) || 0;
        if (current > 1) {
          activeGenerations.set(userId, current - 1);
        } else {
          activeGenerations.delete(userId);
        }
        globalCount -= 1;
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export function checkGenerationSlotAvailable(userId: string): boolean {
  const userCount = activeGenerations.get(userId) || 0;
  return globalCount < GLOBAL_LIMIT && userCount < USER_LIMIT;
}
