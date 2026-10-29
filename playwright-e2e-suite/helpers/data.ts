import type { TestInfo } from '@playwright/test';

/**
 * Unique, readable names so parallel tests (and retries) never collide,
 * even when they share one running server.
 */
export function uniqueName(prefix: string, testInfo?: TestInfo): string {
  const worker = testInfo ? `w${testInfo.workerIndex}-r${testInfo.retry}` : 'x';
  const random = Math.random().toString(36).slice(2, 7);
  return `${prefix} ${worker}-${Date.now().toString(36)}-${random}`;
}
