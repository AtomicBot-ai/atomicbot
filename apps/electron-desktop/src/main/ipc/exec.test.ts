/**
 * Tests for shared exec helpers (createBinaryNotFoundResult, checkBinaryExists,
 * runSyncCheck, runCommand).
 */
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkBinaryExists, createBinaryNotFoundResult, runCommand, runSyncCheck } from "./exec";

// ── createBinaryNotFoundResult ─────────────────────────────────────────────────

describe("createBinaryNotFoundResult", () => {
  it("returns a well-formed not-found ExecResult", () => {
    const result = createBinaryNotFoundResult("/usr/bin/memo", "npm run prepare:memo");
    expect(result).toEqual({
      ok: false,
      code: null,
      stdout: "",
      stderr: "memo binary not found at: /usr/bin/memo\nRun: npm run prepare:memo",
      resolvedPath: null,
    });
  });

  it("extracts binary name from full path", () => {
    const result = createBinaryNotFoundResult("/a/b/c/fancy-tool", "make install");
    expect(result.stderr).toContain("fancy-tool binary not found");
  });
});

// ── checkBinaryExists ──────────────────────────────────────────────────────────

describe("checkBinaryExists", () => {
  beforeEach(() => {
    vi.spyOn(fs, "existsSync");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when binary exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const result = checkBinaryExists("/usr/bin/node", "install node");
    expect(result).toBeNull();
  });

  it("returns not-found result when binary is missing", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = checkBinaryExists("/missing/bin", "npm run prepare");
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect(result!.stderr).toContain("binary not found");
  });
});

// ── runSyncCheck ───────────────────────────────────────────────────────────────

describe("runSyncCheck", () => {
  it("returns ok:true for successful command", () => {
    const result = runSyncCheck({ bin: "echo", args: ["hello"], cwd: "." });
    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("hello");
    expect(result.resolvedPath).toBe("echo");
  });

  it("returns ok:false for failing command", () => {
    const result = runSyncCheck({ bin: "false", args: [], cwd: "." });
    expect(result.ok).toBe(false);
    expect(result.code).not.toBe(0);
  });

  it("captures stderr output", () => {
    const result = runSyncCheck({
      bin: "sh",
      args: ["-c", "echo err >&2; exit 1"],
      cwd: ".",
    });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("err");
  });

  it("passes custom env to child process", () => {
    const result = runSyncCheck({
      bin: "sh",
      args: ["-c", 'echo "$TEST_EXEC_VAR"'],
      cwd: ".",
      env: { ...process.env, TEST_EXEC_VAR: "custom_value" },
    });
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("custom_value");
  });
});

// ── runCommand ─────────────────────────────────────────────────────────────────

describe("runCommand", () => {
  it("resolves with ok:true for successful command", async () => {
    const result = await runCommand({
      bin: "echo",
      args: ["hello world"],
      cwd: ".",
      timeoutMs: 5000,
    });
    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("hello world");
    expect(result.resolvedPath).toBe("echo");
  });

  it("resolves with ok:false for non-zero exit", async () => {
    const result = await runCommand({
      bin: "sh",
      args: ["-c", "exit 42"],
      cwd: ".",
      timeoutMs: 5000,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(42);
  });

  it("captures both stdout and stderr", async () => {
    const result = await runCommand({
      bin: "sh",
      args: ["-c", "echo out; echo err >&2"],
      cwd: ".",
      timeoutMs: 5000,
    });
    expect(result.stdout).toContain("out");
    expect(result.stderr).toContain("err");
  });

  it("times out and kills long-running command", async () => {
    const result = await runCommand({
      bin: "sleep",
      args: ["60"],
      cwd: ".",
      timeoutMs: 100,
    });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("timeout after 100ms");
  });

  it("writes stdin when input is provided", async () => {
    const result = await runCommand({
      bin: "cat",
      args: [],
      cwd: ".",
      timeoutMs: 5000,
      input: "piped content",
    });
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("piped content");
  });

  it("handles spawn error for non-existent binary", async () => {
    const result = await runCommand({
      bin: "/nonexistent/binary/xyz",
      args: [],
      cwd: ".",
      timeoutMs: 5000,
    });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("ENOENT");
  });

  it("passes custom env to child process", async () => {
    const result = await runCommand({
      bin: "sh",
      args: ["-c", 'echo "$MY_TEST_VAR"'],
      cwd: ".",
      timeoutMs: 5000,
      env: { ...process.env, MY_TEST_VAR: "async_value" },
    });
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("async_value");
  });
});
