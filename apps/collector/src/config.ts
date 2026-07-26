import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { configFilePath, ADAPTER_NAMES, type AdapterName } from "@tokenviewer/core";
import { z } from "zod";

export interface CollectorConfig {
  serverUrl?: string;
  machineToken?: string;
  copilotToken?: string;
  machineName: string;
  agents?: AdapterName[];
  intervalMinutes?: number;
}

const configSchema = z.object({
  serverUrl: z.string().url().optional(),
  machineToken: z.string().min(1).optional(),
  copilotToken: z.string().min(1).optional(),
  machineName: z.string().min(1).optional(),
  agents: z.array(z.enum(ADAPTER_NAMES)).optional(),
  intervalMinutes: z.number().int().positive().optional(),
});

export async function loadCollectorConfig(): Promise<CollectorConfig> {
  const path = configFilePath();
  const raw = await readFile(path, "utf-8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  });

  if (raw === null) {
    return { machineName: hostname() };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid config ${path}: JSON malformado (${(error as Error).message})`);
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    const field = result.error.issues[0]?.path.join(".") || "<root>";
    const message = result.error.issues[0]?.message ?? "valor invalido";
    throw new Error(`invalid config ${path}: ${field} ${message}`);
  }

  return {
    ...result.data,
    machineName: result.data.machineName ?? hostname(),
  };
}

export async function saveCollectorConfig(config: CollectorConfig): Promise<void> {
  const path = configFilePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  await chmod(path, 0o600);
}
