export const ADAPTER_NAMES = [
  "claude",
  "codex",
  "cursor",
  "opencode",
  "amp",
  "pi",
  "t3code",
] as const;

export type AdapterName = (typeof ADAPTER_NAMES)[number];

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

export interface MachineEnvelope {
  machineName: string;
  machineToken: string;
}

export interface IngestPayload extends MachineEnvelope {
  records: UsageRecord[];
}

export interface IngestResult {
  accepted: number;
  duplicates: number;
}

export interface IngestClient {
  ingest(payload: IngestPayload): Promise<IngestResult>;
}
