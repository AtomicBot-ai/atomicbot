import { useCallback, useState } from "react";

type UseAsyncActionOpts = {
  /** Called to set/clear an error message. */
  setError: (value: string | null) => void;
  /** Called to clear the status message on error. */
  setStatus?: (value: string | null) => void;
};

/**
 * Encapsulates the repeated busy / error / try-catch-finally pattern
 * used across onboarding step handlers.
 *
 * Returns `{ busy, run }` where `run` wraps an async function:
 *   - sets `busy` to true
 *   - clears the previous error
 *   - on success: returns the value from `fn`
 *   - on error: calls `setError` with the message, clears status, returns `undefined`
 *   - always: sets `busy` back to false
 */
export function useAsyncAction({ setError, setStatus }: UseAsyncActionOpts) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        setError(String(err));
        setStatus?.(null);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [setError, setStatus],
  );

  return { busy, run } as const;
}
