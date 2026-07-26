import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export interface PathContext {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  platform?: NodeJS.Platform;
}

export interface T3DatabaseLocation {
  path: string;
  scope: string;
}

function envValue(context: PathContext | undefined, name: string): string | undefined {
  const value = (context?.env ?? process.env)[name];
  return value && value.trim() ? value : undefined;
}

function platform(context?: PathContext): NodeJS.Platform {
  return context?.platform ?? process.platform;
}

export function homePath(context?: PathContext): string {
  return context?.homeDir ?? homedir();
}

export function resolveHomePath(value: string, context?: PathContext): string {
  if (value === "~") {
    return homePath(context);
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return join(homePath(context), value.slice(2));
  }
  return isAbsolute(value) ? value : resolve(value);
}

export function configDir(context?: PathContext): string {
  return join(
    resolveHomePath(envValue(context, "XDG_CONFIG_HOME") ?? join(homePath(context), ".config"), context),
    "tokenviewer",
  );
}

export function configFilePath(context?: PathContext): string {
  return join(configDir(context), "config.json");
}

export function stateDir(context?: PathContext): string {
  const xdgStateHome = envValue(context, "XDG_STATE_HOME");
  if (xdgStateHome) {
    return join(resolveHomePath(xdgStateHome, context), "tokenviewer");
  }

  if (platform(context) === "darwin") {
    return join(homePath(context), "Library", "Application Support", "tokenviewer");
  }

  return join(resolveHomePath(join(homePath(context), ".local", "state"), context), "tokenviewer");
}

export function collectorStatePath(context?: PathContext): string {
  return join(stateDir(context), "collector-state.json");
}

export function xdgDataHome(context?: PathContext): string {
  return resolveHomePath(
    envValue(context, "XDG_DATA_HOME") ?? join(homePath(context), ".local", "share"),
    context,
  );
}

export function xdgConfigHome(context?: PathContext): string {
  return resolveHomePath(envValue(context, "XDG_CONFIG_HOME") ?? join(homePath(context), ".config"), context);
}

export function claudeProjectsDir(context?: PathContext): string {
  const root = envValue(context, "CLAUDE_CONFIG_DIR") ?? join(homePath(context), ".claude");
  return join(resolveHomePath(root, context), "projects");
}

export function codexRoots(context?: PathContext): string[] {
  const root = resolveHomePath(envValue(context, "CODEX_HOME") ?? join(homePath(context), ".codex"), context);
  return uniqueStrings([join(root, "sessions"), join(root, "archived_sessions")]);
}

export function cursorUserDirs(context?: PathContext): string[] {
  return uniqueStrings([
    join(homePath(context), "Library", "Application Support", "Cursor", "User"),
    join(xdgConfigHome(context), "Cursor", "User"),
    join(
      resolveHomePath(
        envValue(context, "APPDATA") ?? join(homePath(context), "AppData", "Roaming"),
        context,
      ),
      "Cursor",
      "User",
    ),
  ]);
}

export function opencodeDatabasePaths(context?: PathContext): string[] {
  return uniqueStrings([
    join(xdgDataHome(context), "opencode", "opencode.db"),
    platform(context) === "darwin"
      ? join(homePath(context), "Library", "Application Support", "opencode", "opencode.db")
      : undefined,
  ]);
}

export function ampThreadsDir(context?: PathContext): string {
  return join(xdgDataHome(context), "amp", "threads");
}

export function piSessionsDir(context?: PathContext): string {
  return join(homePath(context), ".pi", "agent", "sessions");
}

export function t3DatabaseCandidates(context?: PathContext): T3DatabaseLocation[] {
  const locations: T3DatabaseLocation[] = [];
  const seen = new Set<string>();
  const explicitState = envValue(context, "T3CODE_STATE_DIR");

  if (explicitState) {
    addT3Location(locations, seen, join(resolveHomePath(explicitState, context), "state.sqlite"), "state");
  }

  for (const baseDir of uniqueStrings([
    envValue(context, "T3CODE_HOME"),
    join(homePath(context), ".t3"),
  ])) {
    addT3Location(locations, seen, join(resolveHomePath(baseDir, context), "userdata", "state.sqlite"), "userdata");
    addT3Location(locations, seen, join(resolveHomePath(baseDir, context), "dev", "state.sqlite"), "dev");
  }

  return locations;
}

function addT3Location(
  locations: T3DatabaseLocation[],
  seen: Set<string>,
  path: string,
  scope: string,
): void {
  if (seen.has(path)) {
    return;
  }
  seen.add(path);
  locations.push({ path, scope });
}

function uniqueStrings(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
