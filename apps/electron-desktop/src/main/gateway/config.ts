import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import JSON5 from "json5";

import { ensureDir } from "../util/fs";

export function readGatewayTokenFromConfig(configPath: string): string | null {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const text = fs.readFileSync(configPath, "utf-8");
    const parsed: unknown = JSON5.parse(text);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const cfg = parsed as {
      gateway?: { auth?: { token?: unknown } };
    };
    const token = cfg.gateway?.auth?.token;
    return typeof token === "string" && token.trim().length > 0 ? token.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Create the initial config file if it doesn't exist yet.
 * Existing configs are patched by `runConfigMigrations()` (config-migrations.ts).
 */
export function ensureGatewayConfigFile(params: { configPath: string; token: string }) {
  ensureDir(path.dirname(params.configPath));

  if (fs.existsSync(params.configPath)) {
    return;
  }

  const minimal = {
    gateway: {
      mode: "local",
      bind: "loopback",
      auth: {
        mode: "token",
        token: params.token,
      },
      controlUi: {
        allowedOrigins: ["null"],
        dangerouslyDisableDeviceAuth: true,
      },
    },
    browser: {
      defaultProfile: "user",
      profiles: {
        user: { driver: "extension", cdpUrl: "http://127.0.0.1:18792", color: "#00AA00" },
      },
      // sigma: SigmaBrowser path as fallback when "openclaw" profile is used directly
      ...(process.platform === "darwin"
        ? { executablePath: "/Applications/Sigma.app/Contents/MacOS/Sigma" }
        : process.platform === "win32"
          ? {
              executablePath: path.win32.join(
                process.env.LOCALAPPDATA || path.win32.join(os.homedir(), "AppData", "Local"),
                "Chromium",
                "Application",
                "sigma.exe"
              ),
            }
          : {}),
    },
    logging: {
      level: "debug",
      consoleLevel: "debug",
    },
  };

  fs.writeFileSync(params.configPath, `${JSON.stringify(minimal, null, 2)}\n`, "utf-8");
}
