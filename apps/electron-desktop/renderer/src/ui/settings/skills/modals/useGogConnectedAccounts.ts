import React from "react";
import { getDesktopApiOrNull } from "@ipc/desktopApi";

export function parseEmailsFromAuthList(stdout: string): string[] {
  const text = (stdout || "").trim();
  if (!text) return [];

  // Try JSON format first (gogAuthList --json)
  try {
    const parsed = JSON.parse(text) as { accounts?: unknown };
    const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    const emails = accounts
      .map((a) => (a && typeof a === "object" ? (a as { email?: unknown }).email : undefined))
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim());
    if (emails.length > 0) return emails;
  } catch {
    // Not JSON -- fall through to line-based parsing.
  }

  // Plain text: extract email-like tokens from each line
  const emailRe = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
  const found = text.match(emailRe);
  return found ? [...new Set(found)] : [];
}

export function useGogConnectedAccounts(isConnected: boolean) {
  const [connectedEmails, setConnectedEmails] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!isConnected) {
      return;
    }
    const api = getDesktopApiOrNull();
    if (!api) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.gogAuthList();
        if (cancelled) {
          return;
        }
        if (res.ok && res.stdout?.trim()) {
          setConnectedEmails(parseEmailsFromAuthList(res.stdout));
        }
      } catch {
        // Best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  return { connectedEmails };
}
