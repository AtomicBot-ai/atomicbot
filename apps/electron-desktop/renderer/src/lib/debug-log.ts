const DEBUG = typeof import.meta !== "undefined" && import.meta.env?.DEV;

export function debugLog(tag: string, ...args: unknown[]): void {
  if (DEBUG) console.log(`[${tag}]`, ...args);
}

export function debugWarn(tag: string, ...args: unknown[]): void {
  if (DEBUG) console.warn(`[${tag}]`, ...args);
}

export function debugError(tag: string, ...args: unknown[]): void {
  if (DEBUG) console.error(`[${tag}]`, ...args);
}
