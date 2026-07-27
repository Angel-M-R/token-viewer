import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  ADAPTER_NAMES,
  activePublisherMachineSchema,
  configFilePath,
  resolveHomePath,
  type AdapterName,
  type ActivePublisherMachine,
} from "@tokenviewer/core";
import { z } from "zod";

export interface CollectorConfig {
  copilotToken?: string;
  machineName: ActivePublisherMachine;
  checkoutPath: string;
  expectedRemoteUrl?: string;
  agents?: AdapterName[];
}

const externalGitRemoteSchema = z.string().min(1).superRefine((remote, context) => {
  try {
    const url = new URL(remote);
    if (url.username || url.password || url.search || url.hash) {
      context.addIssue({
        code: "custom",
        message: "must not contain embedded Git credentials or URL parameters",
      });
    }
  } catch {
    // SCP-style SSH and filesystem remotes rely on external Git credentials.
  }
});

const configSchema = z
  .object({
    copilotToken: z.string().min(1).optional(),
    machineName: activePublisherMachineSchema,
    checkoutPath: z.string().min(1),
    expectedRemoteUrl: externalGitRemoteSchema.optional(),
    agents: z.array(z.enum(ADAPTER_NAMES)).optional(),
  })
  .strict();

export async function loadCollectorConfig(): Promise<CollectorConfig> {
  const path = configFilePath();
  const raw = await readFile(path, "utf-8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  });

  if (raw === null) {
    throw new Error(`collector config not found at ${path}; run tokenviewer-collector init`);
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

  return { ...result.data, checkoutPath: resolveHomePath(result.data.checkoutPath) };
}

export async function saveCollectorConfig(config: CollectorConfig): Promise<void> {
  const path = configFilePath();
  const parsed = configSchema.parse(config);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
  await chmod(path, 0o600);
}
