/**
 * Pure error-to-string conversion used by both store slices and UI components.
 * Extracted from ui/shared/toast.ts to break the store→UI dependency.
 */
export function errorToMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message || "Unknown error";
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message || "Unknown error";
  }

  try {
    const json = JSON.stringify(error);
    if (!json || json === "{}" || json === "[]") {
      return "Unknown error";
    }
    return json;
  } catch {
    return String(error);
  }
}
