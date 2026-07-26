import { describe, expect, it } from "vitest";
import {
  claudeProjectsDir,
  codexRoots,
  collectorStatePath,
  configFilePath,
  stateDir,
} from "../src/index.js";

describe("platform paths", () => {
  it("uses XDG config for collector config", () => {
    expect(
      configFilePath({ homeDir: "/home/a", env: { XDG_CONFIG_HOME: "/xdg/config" } }),
    ).toBe("/xdg/config/tokenviewer/config.json");
  });

  it("uses XDG state override and Application Support on macOS by default", () => {
    expect(
      collectorStatePath({
        homeDir: "/Users/a",
        platform: "darwin",
        env: { XDG_STATE_HOME: "/xdg/state" },
      }),
    ).toBe("/xdg/state/tokenviewer/collector-state.json");

    expect(stateDir({ homeDir: "/Users/a", platform: "darwin", env: {} })).toBe(
      "/Users/a/Library/Application Support/tokenviewer",
    );
  });

  it("respects agent home overrides", () => {
    expect(claudeProjectsDir({ homeDir: "/home/a", env: { CLAUDE_CONFIG_DIR: "/custom/claude" } })).toBe(
      "/custom/claude/projects",
    );
    expect(codexRoots({ homeDir: "/home/a", env: { CODEX_HOME: "/custom/codex" } })).toEqual([
      "/custom/codex/sessions",
      "/custom/codex/archived_sessions",
    ]);
  });
});
