import { ampAdapter } from "./amp.js";
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { cursorAdapter } from "./cursor.js";
import { opencodeAdapter } from "./opencode.js";
import { ompAdapter, piAdapter } from "./pi.js";
import { t3codeAdapter } from "./t3code.js";
import {
  ADAPTER_NAMES,
  OPT_IN_ADAPTER_NAMES,
  type Adapter,
  type AdapterName,
} from "@tokenviewer/core";

const ADAPTERS: Record<AdapterName, () => Adapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  cursor: cursorAdapter,
  opencode: opencodeAdapter,
  amp: ampAdapter,
  pi: piAdapter,
  omp: ompAdapter,
  t3code: t3codeAdapter,
};

export function createAdapter(name: string): Adapter {
  if (!isAdapterName(name)) {
    throw new Error(`unknown adapter: ${name} (available: ${ADAPTER_NAMES.join(", ")})`);
  }

  return ADAPTERS[name]();
}

/** Adapters collected by default; opt-in adapters must be named in the collector config. */
export function allAdapters(): Adapter[] {
  return ADAPTER_NAMES.filter((name) => !OPT_IN_ADAPTER_NAMES.includes(name)).map((name) =>
    ADAPTERS[name](),
  );
}

function isAdapterName(name: string): name is AdapterName {
  return (ADAPTER_NAMES as readonly string[]).includes(name);
}

export { ampAdapter } from "./amp.js";
export { claudeAdapter } from "./claude.js";
export { codexAdapter } from "./codex.js";
export { cursorAdapter } from "./cursor.js";
export { opencodeAdapter } from "./opencode.js";
export { ompAdapter, piAdapter } from "./pi.js";
export { t3codeAdapter } from "./t3code.js";
export * from "./sqlite.js";
