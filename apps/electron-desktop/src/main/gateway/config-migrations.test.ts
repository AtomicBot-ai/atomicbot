import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DESKTOP_CONFIG_MIGRATIONS, runConfigMigrations } from "./config-migrations";

describe("DESKTOP_CONFIG_MIGRATIONS", () => {
  it("has strictly increasing version numbers", () => {
    for (let i = 1; i < DESKTOP_CONFIG_MIGRATIONS.length; i++) {
      expect(DESKTOP_CONFIG_MIGRATIONS[i]!.version).toBeGreaterThan(
        DESKTOP_CONFIG_MIGRATIONS[i - 1]!.version
      );
    }
  });
});

describe("runConfigMigrations", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cfg-mig-test-"));
    configPath = path.join(tmpDir, "openclaw.json");
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("skips when config file does not exist", () => {
    runConfigMigrations({ configPath, stateDir: tmpDir });
    expect(fs.existsSync(path.join(tmpDir, "desktop-state.json"))).toBe(false);
  });

  it("applies all migrations to a bare config", () => {
    const bare = {
      gateway: {
        mode: "local",
        bind: "loopback",
        auth: { mode: "token", token: "tok" },
        controlUi: { allowedOrigins: ["http://localhost:3000"] },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(bare));

    runConfigMigrations({ configPath, stateDir: tmpDir });

    const result = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(result.gateway.controlUi.allowedOrigins).toContain("null");
    expect(result.gateway.controlUi.allowInsecureAuth).toBe(true);
    expect(result.gateway.controlUi.dangerouslyDisableDeviceAuth).toBe(true);
    expect(result.browser.defaultProfile).toBe("openclaw");
    expect(result.plugins.entries["computer-use"].enabled).toBe(true);

    const state = JSON.parse(fs.readFileSync(path.join(tmpDir, "desktop-state.json"), "utf-8"));
    expect(state.configVersion).toBe(DESKTOP_CONFIG_MIGRATIONS.length);
  });

  it("enables computer-use plugin when not previously configured", () => {
    const cfg = { gateway: { mode: "local", bind: "loopback" } };
    fs.writeFileSync(configPath, JSON.stringify(cfg));

    runConfigMigrations({ configPath, stateDir: tmpDir });

    const result = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(result.plugins.entries["computer-use"].enabled).toBe(true);
  });

  it("does not re-enable computer-use if already enabled", () => {
    const cfg = {
      plugins: { entries: { "computer-use": { enabled: true } } },
    };
    fs.writeFileSync(configPath, JSON.stringify(cfg));

    runConfigMigrations({ configPath, stateDir: tmpDir });

    const result = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(result.plugins.entries["computer-use"].enabled).toBe(true);
  });

  it("does not re-apply migrations on second run", () => {
    const cfg = {
      gateway: {
        mode: "local",
        bind: "loopback",
        auth: { mode: "token", token: "tok" },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(cfg));

    runConfigMigrations({ configPath, stateDir: tmpDir });
    const afterFirst = fs.readFileSync(configPath, "utf-8");

    runConfigMigrations({ configPath, stateDir: tmpDir });
    const afterSecond = fs.readFileSync(configPath, "utf-8");

    expect(afterSecond).toBe(afterFirst);
  });

  it("only applies pending migrations when partially migrated", () => {
    const cfg = {
      gateway: {
        mode: "local",
        bind: "loopback",
        auth: { mode: "token", token: "tok" },
        controlUi: {
          allowedOrigins: ["null"],
          allowInsecureAuth: true,
          dangerouslyDisableDeviceAuth: true,
        },
      },
      browser: { defaultProfile: "openclaw" },
      tools: {
        exec: {
          safeBins: ["gh"],
        },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(cfg));
    // Simulate already at version 2.
    fs.writeFileSync(path.join(tmpDir, "desktop-state.json"), JSON.stringify({ configVersion: 2 }));

    runConfigMigrations({ configPath, stateDir: tmpDir });

    const result = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(result.browser.defaultProfile).toBe("openclaw");
    expect(result.tools.exec.safeBinProfiles.gh).toEqual({});

    const state = JSON.parse(fs.readFileSync(path.join(tmpDir, "desktop-state.json"), "utf-8"));
    expect(state.configVersion).toBe(DESKTOP_CONFIG_MIGRATIONS.length);
  });

  it("preserves existing browser.defaultProfile if already set", () => {
    const cfg = {
      gateway: {
        mode: "local",
        bind: "loopback",
        auth: { mode: "token", token: "tok" },
        controlUi: {
          allowedOrigins: ["null"],
          allowInsecureAuth: true,
          dangerouslyDisableDeviceAuth: true,
        },
      },
      browser: { defaultProfile: "chrome" },
    };
    fs.writeFileSync(configPath, JSON.stringify(cfg));

    runConfigMigrations({ configPath, stateDir: tmpDir });

    const result = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(result.browser.defaultProfile).toBe("chrome");
  });

  it("skips v1 when gateway is not local/loopback", () => {
    const cfg = {
      gateway: { mode: "remote", bind: "0.0.0.0" },
    };
    fs.writeFileSync(configPath, JSON.stringify(cfg));

    runConfigMigrations({ configPath, stateDir: tmpDir });

    const result = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(result.gateway.controlUi).toBeUndefined();
    // v2 still applies
    expect(result.browser.defaultProfile).toBe("openclaw");
  });

  it("handles corrupted desktop-state.json gracefully", () => {
    const cfg = {
      gateway: {
        mode: "local",
        bind: "loopback",
        auth: { mode: "token", token: "tok" },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(cfg));
    fs.writeFileSync(path.join(tmpDir, "desktop-state.json"), "not json");

    runConfigMigrations({ configPath, stateDir: tmpDir });

    const result = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(result.gateway.controlUi.allowedOrigins).toContain("null");
    expect(result.gateway.controlUi.allowInsecureAuth).toBe(true);
    expect(result.browser.defaultProfile).toBe("openclaw");
  });

  it("scaffolds safeBinProfiles from configured safeBins (platform-aware)", () => {
    const cfg = {
      tools: {
        exec: {
          safeBins: ["gh", "python3", "memo", "remindctl", "head", "which"],
        },
      },
      agents: {
        list: [
          {
            id: "ops",
            tools: {
              exec: {
                safeBins: ["gog", "node"],
              },
            },
          },
        ],
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(cfg));

    runConfigMigrations({ configPath, stateDir: tmpDir });

    const result = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(result.tools.exec.safeBinProfiles.gh).toEqual({});
    expect(result.tools.exec.safeBinProfiles.head).toEqual({});
    expect(result.tools.exec.safeBinProfiles.which).toEqual({});
    expect(result.tools.exec.safeBinProfiles.python3).toBeUndefined();
    if (process.platform === "win32") {
      expect(result.tools.exec.safeBinProfiles.memo).toBeUndefined();
      expect(result.tools.exec.safeBinProfiles.remindctl).toBeUndefined();
    } else {
      expect(result.tools.exec.safeBinProfiles.memo).toEqual({});
      expect(result.tools.exec.safeBinProfiles.remindctl).toEqual({});
    }
    expect(result.agents.list[0].tools.exec.safeBinProfiles.gog).toEqual({});
    expect(result.agents.list[0].tools.exec.safeBinProfiles.node).toBeUndefined();
  });
});
