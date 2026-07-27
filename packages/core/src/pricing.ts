import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type { UsageRecord } from "./types.js";

const MODELS_DEV_URL = "https://models.dev/api.json";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2_000;

export type PricingSource = "catalog" | "stale-catalog" | "fallback" | "stored" | "unknown";

export interface PricingOptions {
  refresh?: boolean;
  cacheTtlMs?: number;
  fetchTimeoutMs?: number;
  fetcher?: typeof fetch;
  now?: () => Date;
}

export interface PricingCatalog {
  source: "catalog" | "stale-catalog" | "fallback";
  fetchedAt?: string;
  catalog?: unknown;
}

export interface PricingCatalogCacheEntry {
  fetchedAt: string;
  catalog: unknown;
}

export interface PricingCatalogCache {
  read(): Promise<PricingCatalogCacheEntry | null>;
  write(entry: PricingCatalogCacheEntry): Promise<void>;
}

export interface PricedRecord {
  costUsd: number | null;
  pricingSource: PricingSource;
}

interface RateTable {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
  tiers?: unknown[];
  context_over_200k?: RateTable;
}

interface ResolvedRates {
  rates: RateTable;
  source: "catalog" | "stale-catalog" | "fallback";
}

const FALLBACK_COSTS: Record<string, Record<string, RateTable>> = {
  openai: {
    "gpt-5.5": {
      input: 5,
      output: 30,
      cache_read: 0.5,
      context_over_200k: { input: 10, output: 45, cache_read: 1 },
    },
    "gpt-5.5-pro": { input: 30, output: 180 },
    "gpt-5.4": { input: 2.5, output: 15, cache_read: 0.25 },
    "gpt-5.4-mini": { input: 0.75, output: 4.5, cache_read: 0.075 },
    "gpt-5.4-nano": { input: 0.2, output: 1.25, cache_read: 0.02 },
    "gpt-5.4-pro": { input: 30, output: 180 },
    "gpt-5.3-codex": { input: 1.75, output: 14, cache_read: 0.175 },
  },
  anthropic: {
    "claude-opus-4-7": { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
  },
};

const PROVIDER_ALIASES: Record<string, string> = {
  anthropic: "anthropic",
  claude: "anthropic",
  openai: "openai",
};

const MODEL_ALIASES: Record<string, string> = {
  "gpt-5.5-chat-latest": "gpt-5.5",
};

export function createFilePricingCatalogCache(cachePath: string): PricingCatalogCache {
  return {
    async read() {
      try {
        const parsed = JSON.parse(await readFile(cachePath, "utf8")) as unknown;
        const entry = asRecord(parsed);
        const fetchedAt = entry?.["fetchedAt"];
        const catalog = entry?.["catalog"];
        return typeof fetchedAt === "string" && isModelsDevCatalog(catalog)
          ? { fetchedAt, catalog }
          : null;
      } catch {
        return null;
      }
    },
    async write(entry) {
      await mkdir(dirname(cachePath), { recursive: true });
      const temporaryPath = `${cachePath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
        await rename(temporaryPath, cachePath);
      } finally {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
      }
    },
  };
}

export async function loadPricingCatalog(
  cache: PricingCatalogCache | null,
  options: PricingOptions = {},
): Promise<PricingCatalog> {
  const now = options.now ?? (() => new Date());
  const cached = await cache?.read().catch(() => null);
  if (
    !options.refresh &&
    cached &&
    isFresh(cached.fetchedAt, options.cacheTtlMs ?? CACHE_TTL_MS, now())
  ) {
    return { source: "catalog", fetchedAt: cached.fetchedAt, catalog: cached.catalog };
  }

  try {
    const catalog = await fetchModelsDevCatalog(
      options.fetchTimeoutMs ?? FETCH_TIMEOUT_MS,
      options.fetcher ?? fetch,
    );
    const fetchedAt = now().toISOString();
    await cache?.write({ fetchedAt, catalog }).catch(() => undefined);
    return { source: "catalog", fetchedAt, catalog };
  } catch {
    if (cached && isModelsDevCatalog(cached.catalog)) {
      return { source: "stale-catalog", fetchedAt: cached.fetchedAt, catalog: cached.catalog };
    }
    return { source: "fallback" };
  }
}

export function priceUsageRecord(record: UsageRecord, catalog: PricingCatalog): PricedRecord {
  const resolved = resolveRates(record, catalog);
  if (!resolved) {
    return {
      costUsd: null,
      pricingSource: (record.billedCost ?? 0) > 0 ? "stored" : "unknown",
    };
  }

  const rates = selectContextRates(resolved.rates, record);
  const inputRate = rates.input ?? 0;
  const outputRate = rates.output ?? 0;
  const cacheReadRate = rates.cache_read ?? inputRate;
  const cacheWriteRate = rates.cache_write ?? inputRate;
  const outputTokens = record.outputTokens + record.reasoningTokens;

  return {
    costUsd:
      (record.inputTokens * inputRate +
        record.cacheReadTokens * cacheReadRate +
        record.cacheWriteTokens * cacheWriteRate +
        outputTokens * outputRate) /
      1_000_000,
    pricingSource: resolved.source,
  };
}

async function fetchModelsDevCatalog(timeoutMs: number, fetcher: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(MODELS_DEV_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`models.dev returned ${response.status}`);
    const catalog = await response.json();
    if (!isModelsDevCatalog(catalog)) {
      throw new Error("models.dev response did not match expected shape");
    }
    return catalog;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveRates(record: UsageRecord, pricing: PricingCatalog): ResolvedRates | null {
  const candidates = modelCandidates(record.provider, record.model);

  for (const candidate of candidates) {
    if (!candidate.provider || !pricing.catalog) continue;
    const rates = getCatalogRates(pricing.catalog, candidate.provider, candidate.model);
    if (rates) {
      return {
        rates,
        source: pricing.source === "stale-catalog" ? "stale-catalog" : "catalog",
      };
    }
  }

  for (const candidate of candidates) {
    if (!candidate.provider) continue;
    const rates = FALLBACK_COSTS[candidate.provider]?.[candidate.model];
    if (rates) return { rates, source: "fallback" };
  }
  return null;
}

function modelCandidates(
  providerInput: string | undefined,
  modelInput: string | undefined,
): { provider?: string; model: string }[] {
  const candidates: { provider?: string; model: string }[] = [];
  let provider = normalizeProvider(providerInput);
  let model = normalizeModel(modelInput);
  if (!model) return candidates;

  const prefixed = splitProviderModel(model);
  if (prefixed) {
    provider = provider ?? prefixed.provider;
    model = prefixed.model;
  }

  addCandidate(candidates, provider, model);
  addCandidate(candidates, provider, MODEL_ALIASES[model]);
  const inferred = provider ?? inferProvider(model);
  addCandidate(candidates, inferred, model);
  addCandidate(candidates, inferred, MODEL_ALIASES[model]);

  for (const fallbackProvider of Object.keys(FALLBACK_COSTS)) {
    addCandidate(candidates, fallbackProvider, model);
    addCandidate(candidates, fallbackProvider, MODEL_ALIASES[model]);
  }
  return candidates;
}

function addCandidate(
  candidates: { provider?: string; model: string }[],
  provider: string | undefined,
  model: string | undefined,
): void {
  if (!model || candidates.some((candidate) => candidate.provider === provider && candidate.model === model)) {
    return;
  }
  candidates.push({ provider, model });
}

function splitProviderModel(model: string): { provider: string; model: string } | null {
  const slash = model.indexOf("/");
  if (slash <= 0 || slash === model.length - 1) return null;
  const provider = normalizeProvider(model.slice(0, slash));
  const bareModel = normalizeModel(model.slice(slash + 1));
  return provider && bareModel ? { provider, model: bareModel } : null;
}

function normalizeProvider(provider: string | undefined): string | undefined {
  if (!provider) return undefined;
  const normalized = provider.trim().toLowerCase();
  return PROVIDER_ALIASES[normalized] ?? normalized;
}

function normalizeModel(model: string | undefined): string | undefined {
  const normalized = model?.trim().toLowerCase();
  return normalized || undefined;
}

function inferProvider(model: string): string | undefined {
  if (model.startsWith("gpt-") || /^o\d/.test(model)) return "openai";
  if (model.startsWith("claude-")) return "anthropic";
  return undefined;
}

function getCatalogRates(catalog: unknown, provider: string, model: string): RateTable | null {
  const providerEntry = asRecord(asRecord(catalog)?.[provider]);
  const models = asRecord(providerEntry?.["models"]);
  return toRateTable(asRecord(models?.[model])?.["cost"]);
}

function selectContextRates(rates: RateTable, record: UsageRecord): RateTable {
  const contextTokens = record.inputTokens + record.cacheReadTokens + record.cacheWriteTokens;
  let selected = rates;
  let selectedSize = 0;

  for (const tier of rates.tiers ?? []) {
    const tierRecord = asRecord(tier);
    const tierInfo = asRecord(tierRecord?.["tier"]);
    const size = typeof tierInfo?.["size"] === "number" ? tierInfo["size"] : 0;
    if (tierInfo?.["type"] !== "context" || contextTokens < size || size < selectedSize) continue;
    const tierRates = toRateTable(tierRecord);
    if (tierRates) {
      selected = { ...rates, ...tierRates };
      selectedSize = size;
    }
  }

  if (selected === rates && rates.context_over_200k && contextTokens > 200_000) {
    selected = { ...rates, ...rates.context_over_200k };
  }
  return selected;
}

function toRateTable(value: unknown): RateTable | null {
  const record = asRecord(value);
  if (!record) return null;
  const rates: RateTable = {};
  const input = numberValue(record["input"]);
  const output = numberValue(record["output"]);
  const cacheRead = numberValue(record["cache_read"]);
  const cacheWrite = numberValue(record["cache_write"]);
  const contextOver200k = toRateTable(record["context_over_200k"]);
  if (input !== undefined) rates.input = input;
  if (output !== undefined) rates.output = output;
  if (cacheRead !== undefined) rates.cache_read = cacheRead;
  if (cacheWrite !== undefined) rates.cache_write = cacheWrite;
  if (Array.isArray(record["tiers"])) rates.tiers = record["tiers"];
  if (contextOver200k) rates.context_over_200k = contextOver200k;
  return rates.input !== undefined || rates.output !== undefined ? rates : null;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isModelsDevCatalog(value: unknown): boolean {
  const catalog = asRecord(value);
  const openai = asRecord(catalog?.["openai"]);
  const anthropic = asRecord(catalog?.["anthropic"]);
  return Boolean(asRecord(openai?.["models"]) || asRecord(anthropic?.["models"]));
}

function isFresh(fetchedAt: string, ttlMs: number, now: Date): boolean {
  const fetchedTime = new Date(fetchedAt).getTime();
  return Number.isFinite(fetchedTime) && now.getTime() - fetchedTime <= ttlMs;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
