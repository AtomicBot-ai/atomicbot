import * as fs from "node:fs";
import * as path from "node:path";

const STATE_FILENAME = "desktop-state.json";

type LlamacppMigration = {
  version: number;
  description: string;
  apply: (dataDir: string) => boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

const LLAMACPP_MIGRATIONS: LlamacppMigration[] = [
  {
    version: 1,
    description: "Remove legacy backend folder so a fresh download uses the new structure",
    apply: (dataDir) => {
      const backendDir = path.join(dataDir, "backend");
      if (!fs.existsSync(backendDir)) return false;
      fs.rmSync(backendDir, { recursive: true, force: true });
      console.log(`[llamacpp-migrations] Removed legacy backend dir: ${backendDir}`);
      return true;
    },
  },
];

// ---------------------------------------------------------------------------
// State persistence (shares desktop-state.json with other migration runners)
// ---------------------------------------------------------------------------

function readLlamacppStateVersion(stateDir: string): number {
  try {
    const statePath = path.join(stateDir, STATE_FILENAME);
    if (!fs.existsSync(statePath)) return 0;
    const raw: unknown = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    if (isPlainObject(raw) && typeof raw.llamacppMigrationVersion === "number") {
      return raw.llamacppMigrationVersion;
    }
  } catch {
    // Corrupted or missing — treat as version 0.
  }
  return 0;
}

function writeLlamacppStateVersion(stateDir: string, version: number): void {
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
  existing.llamacppMigrationVersion = version;
  fs.writeFileSync(statePath, `${JSON.stringify(existing, null, 2)}\n`, "utf-8");
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export function runLlamacppMigrations(params: {
  stateDir: string;
  dataDir: string;
}): { backendDeleted: boolean } {
  const { stateDir, dataDir } = params;
  const currentVersion = readLlamacppStateVersion(stateDir);
  const pending = LLAMACPP_MIGRATIONS.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return { backendDeleted: false };

  let appliedUpTo = currentVersion;
  let backendDeleted = false;

  for (const migration of pending) {
    try {
      if (migration.apply(dataDir)) {
        backendDeleted = true;
      }
      appliedUpTo = migration.version;
    } catch (err) {
      console.warn(`[llamacpp-migrations] v${migration.version} failed:`, err);
      break;
    }
  }

  if (appliedUpTo > currentVersion) {
    writeLlamacppStateVersion(stateDir, appliedUpTo);
  }

  return { backendDeleted };
}
