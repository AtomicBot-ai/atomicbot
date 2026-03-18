import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";

const STATE_FILENAME = "desktop-state.json";
const EXEC_APPROVALS_PATH = path.join(homedir(), ".openclaw", "exec-approvals.json");

type AllowlistEntry = {
  id?: string;
  pattern: string;
  lastUsedAt?: number;
  lastUsedCommand?: string;
  lastResolvedPath?: string;
};

type ExecApprovalsFile = {
  version: 1;
  socket?: { path?: string; token?: string };
  defaults?: {
    security?: string;
    ask?: string;
    askFallback?: string;
    autoAllowSkills?: boolean;
  };
  agents?: Record<
    string,
    {
      security?: string;
      ask?: string;
      askFallback?: string;
      autoAllowSkills?: boolean;
      allowlist?: AllowlistEntry[];
    }
  >;
};

type ExecApprovalsMigration = {
  version: number;
  description: string;
  apply: (file: ExecApprovalsFile) => boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeAllowlistEntries(
  existing: AllowlistEntry[] | undefined,
  patterns: string[]
): AllowlistEntry[] {
  const list = Array.isArray(existing) ? existing : [];
  const seen = new Set(list.map((e) => e.pattern.trim().toLowerCase()).filter(Boolean));
  const next = [...list];
  for (const pattern of patterns) {
    const normalized = pattern.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push({ pattern });
  }
  return next;
}

// Common safe patterns (cross-platform).
// Each Unix binary also gets a .exe variant so the allowlist works on Windows.
const UNIX_SAFE_BINS = [
  // Navigation / read
  "ls",
  "cat",
  "pwd",
  "echo",
  "head",
  "tail",
  "wc",
  "file",
  "which",
  "whoami",
  "date",
  "uname",
  "env",
  "printenv",
  "hostname",
  // Search
  "grep",
  "rg",
  "find",
  "fd",
  "ag",
  "fzf",
  // Git
  "git",
  // Directory
  "mkdir",
  "tree",
  "du",
  "df",
  "dirname",
  "basename",
  "realpath",
  // Text processingтам   "sort", "uniq", "cut", "tr", "sed", "awk", "diff", "less", "more",
];

// Windows-native standalone executables (not PowerShell cmdlets).
// Note: PowerShell cmdlets (Get-ChildItem etc.) are not standalone binaries;
// they run inside pwsh/powershell which is handled as a shell wrapper by exec policy.
const WINDOWS_ONLY_BINS = [
  // File system / info
  "dir",
  "type",
  "where",
  "findstr",
  "attrib",
  "icacls",
  "xcopy",
  "robocopy",
  "move",
  "copy",
  "del",
  "ren",
  "mklink",
  // System info
  "systeminfo",
  "tasklist",
  "ver",
  "hostname",
  "whoami",
  "wmic",
  // Networking (read-only diagnostics)
  "ipconfig",
  "nslookup",
  "ping",
  "tracert",
  "netstat",
  "pathping",
  // Environment / shell
  "set",
  "setx",
  "cmd",
  "start",
  "timeout",
  // Package managers / dev tools
  "winget",
  "choco",
  "scoop",
  // Utilities
  "clip",
  "certutil",
  "reg",
  "sc",
  "schtasks",
];

const DEFAULT_SAFE_ALLOWLIST_PATTERNS = [
  ...UNIX_SAFE_BINS.flatMap((bin) => [`**/${bin}`, `**/${bin}.exe`]),
  ...WINDOWS_ONLY_BINS.flatMap((bin) => [`**/${bin}`, `**/${bin}.exe`]),
];

const EXEC_APPROVALS_MIGRATIONS: ExecApprovalsMigration[] = [
  {
    version: 1,
    description: "Pre-populate allowlist with common safe patterns and enable autoAllowSkills",
    apply: (file) => {
      let changed = false;

      if (!file.defaults) {
        file.defaults = {};
      }
      if (file.defaults.autoAllowSkills !== true) {
        file.defaults.autoAllowSkills = true;
        changed = true;
      }

      if (!file.agents) {
        file.agents = {};
      }
      const agentId = "main";
      if (!file.agents[agentId]) {
        file.agents[agentId] = {};
      }
      const agent = file.agents[agentId];
      const merged = mergeAllowlistEntries(agent.allowlist, DEFAULT_SAFE_ALLOWLIST_PATTERNS);
      if (merged.length !== (agent.allowlist?.length ?? 0)) {
        agent.allowlist = merged;
        changed = true;
      }

      return changed;
    },
  },
];

// ---------------------------------------------------------------------------
// State persistence (uses shared desktop-state.json with a separate version key)
// ---------------------------------------------------------------------------

function readExecApprovalsStateVersion(stateDir: string): number {
  try {
    const statePath = path.join(stateDir, STATE_FILENAME);
    if (!fs.existsSync(statePath)) return 0;
    const raw: unknown = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    if (isPlainObject(raw) && typeof raw.execApprovalsVersion === "number") {
      return raw.execApprovalsVersion;
    }
  } catch {
    // Corrupted or missing — treat as version 0.
  }
  return 0;
}

function writeExecApprovalsStateVersion(stateDir: string, version: number): void {
  const statePath = path.join(stateDir, STATE_FILENAME);
  let existing: Record<string, unknown> = {};
  try {
    if (fs.existsSync(statePath)) {
      const raw: unknown = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      if (isPlainObject(raw)) {
        existing = raw;
      }
    }
  } catch {
    // Start fresh if corrupted.
  }
  existing.execApprovalsVersion = version;
  fs.writeFileSync(statePath, `${JSON.stringify(existing, null, 2)}\n`, "utf-8");
}

function loadExecApprovalsFile(): ExecApprovalsFile {
  try {
    if (!fs.existsSync(EXEC_APPROVALS_PATH)) {
      return { version: 1 };
    }
    const raw = fs.readFileSync(EXEC_APPROVALS_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (isPlainObject(parsed) && (parsed as ExecApprovalsFile).version === 1) {
      return parsed as ExecApprovalsFile;
    }
  } catch {
    // Corrupted — start fresh.
  }
  return { version: 1 };
}

function saveExecApprovalsFile(file: ExecApprovalsFile): void {
  const dir = path.dirname(EXEC_APPROVALS_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(EXEC_APPROVALS_PATH, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export function runExecApprovalsMigrations(params: { stateDir: string }): void {
  const { stateDir } = params;
  const currentVersion = readExecApprovalsStateVersion(stateDir);
  const pending = EXEC_APPROVALS_MIGRATIONS.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return;

  const file = loadExecApprovalsFile();
  let fileChanged = false;
  let appliedUpTo = currentVersion;

  for (const migration of pending) {
    try {
      if (migration.apply(file)) {
        fileChanged = true;
      }
      appliedUpTo = migration.version;
    } catch (err) {
      console.warn(`[exec-approvals-migrations] v${migration.version} failed:`, err);
      break;
    }
  }

  if (fileChanged) {
    saveExecApprovalsFile(file);
  }
  if (appliedUpTo > currentVersion) {
    writeExecApprovalsStateVersion(stateDir, appliedUpTo);
  }
}
