export const ADAPTER_NAMES = [
  "claude",
  "codex",
  "cursor",
  "opencode",
  "amp",
  "pi",
  "omp",
  "t3code",
] as const;

export type AdapterName = (typeof ADAPTER_NAMES)[number];

// T3 Code drives the Claude and Codex CLIs, whose own logs are already collected, so its
// usage would be counted twice. It stays available only when listed explicitly in config.
export const OPT_IN_ADAPTER_NAMES: readonly AdapterName[] = ["t3code"];

export interface UsageRecord {
  agent: AdapterName | string;
  provider?: string;
  model?: string;
  timestamp?: string;
  session?: string;
  project?: string;
  billedCost?: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  sourceFile: string;
  recordHash: string;
}

export type HashableUsageRecord = Omit<UsageRecord, "recordHash"> & {
  recordHash?: string;
  nativeId?: string;
};

export interface FileCursor {
  size: number;
  mtimeMs: number;
  lastByteOffset?: number;
}

export type FileCursorMap = Record<string, FileCursor>;

export type FileSkipReason = "unchanged" | "missing" | "unreadable" | "malformed" | "unsupported";

export interface UsageOptions {
  since?: Date;
  cursors?: FileCursorMap;
  full?: boolean;
  onFileComplete?: (file: string, cursor: FileCursor) => void;
  onFileSkipped?: (file: string, reason: FileSkipReason) => void;
  onWarning?: (message: string) => void;
}

export interface Adapter {
  name: AdapterName;
  detect(): Promise<boolean>;
  usage(options?: UsageOptions): AsyncGenerator<UsageRecord>;
}
