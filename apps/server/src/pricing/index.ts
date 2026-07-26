import type { UsageRecord } from "@tokenviewer/core";
import type { DbClient } from "../db/client.js";

const MODELS_DEV_URL = "https://models.dev/api.json";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2_000;

export type PricingSource = "catalog" | "stale-catalog" | "fallback" | "stored" | "unknown";

export interface PricingOptions {
  refresh?: boolean;
  cacheTtlMs?: number;
  fetchTimeoutMs?: number;
  fetcher?: typeof fetch;
}

export interface PricingCatalog {
  source: "catalog" | "stale-catalog" | "fallback";
  fetchedAt?: string;
  catalog?: unknown;
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
  provider?: string;
  model: string;
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

export async function loadPricingCatalog(
  db: DbClient,
  options: PricingOptions = {},
): Promise<PricingCatalog> {
  const ttlMs = options.cacheTtlMs ?? CACHE_TTL_MS;
  const cache = readPricingCache(db);
  if (!options.refresh && cache && isFresh(cache.fetchedAt, ttlMs)) {
    return { source: "catalog", fetchedAt: cache.fetchedAt, catalog: cache.catalog };
  }

  try {
    const catalog = await fetchModelsDevCatalog(
      options.fetchTimeoutMs ?? FETCH_TIMEOUT_MS,
      options.fetcher ?? fetch,
    );
    const fetchedAt = new Date().toISOString();
    db.sqlite
      .prepare(
        "INSERT INTO pricing_catalog (id, fetched_at, payload) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET fetched_at = excluded.fetched_at, payload = excluded.payload",
      )
      .run(fetchedAt, JSON.stringify(catalog));
    return { source: "catalog", fetchedAt, catalog };
  } catch {
    if (cache) {
      return { source: "stale-catalog", fetchedAt: cache.fetchedAt, catalog: cache.catalog };
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

export async function repriceAll(db: DbClient, options: PricingOptions = {}): Promise<number> {
  const catalog = await loadPricingCatalog(db, options);
  const rows = db.sqlite.prepare("SELECT * FROM usage_records").all() as unknown as UsageRecordRow[];
  const update = db.sqlite.prepare(
    "UPDATE usage_records SET cost_usd = ?, pricing_source = ? WHERE id = ?",
  );

  db.sqlite.exec("BEGIN");
  try {
    for (const row of rows) {
      const priced = priceUsageRecord(rowToUsageRecord(row), catalog);
      update.run(priced.costUsd, priced.pricingSource, row.id);
    }
    db.sqlite.exec("COMMIT");
    return rows.length;
  } catch (error) {
    db.sqlite.exec("ROLLBACK");
    throw error;
  }
}

function readPricingCache(db: DbClient): { fetchedAt: string; catalog: unknown } | null {
  const row = db.sqlite
    .prepare("SELECT fetched_at, payload FROM pricing_catalog WHERE id = 1")
    .get() as { fetched_at: string; payload: string } | undefined;
  if (!row) {
    return null;
  }

  try {
    const catalog = JSON.parse(row.payload) as unknown;
    return isModelsDevCatalog(catalog) ? { fetchedAt: row.fetched_at, catalog } : null;
  } catch {
    return null;
  }
}

async function fetchModelsDevCatalog(timeoutMs: number, fetcher: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(MODELS_DEV_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`models.dev returned ${response.status}`);
    }
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
    if (!candidate.provider || !pricing.catalog) {
      continue;
    }
    const rates = getCatalogRates(pricing.catalog, candidate.provider, candidate.model);
    if (rates) {
      return {
        provider: candidate.provider,
        model: candidate.model,
        rates,
        source: pricing.source === "stale-catalog" ? "stale-catalog" : "catalog",
      };
    }
  }

  for (const candidate of candidates) {
    if (!candidate.provider) {
      continue;
    }
    const rates = FALLBACK_COSTS[candidate.provider]?.[candidate.model];
    if (rates) {
      return { provider: candidate.provider, model: candidate.model, rates, source: "fallback" };
    }
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

  if (!model) {
    return candidates;
  }

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
  if (slash <= 0 || slash === model.length - 1) {
    return null;
  }
  const provider = normalizeProvider(model.slice(0, slash));
  const bareModel = normalizeModel(model.slice(slash + 1));
  return provider && bareModel ? { provider, model: bareModel } : null;
}

function normalizeProvider(provider: string | undefined): string | undefined {
  if (!provider) {
    return undefined;
  }
  const normalized = provider.trim().toLowerCase();
  return PROVIDER_ALIASES[normalized] ?? normalized;
}

function normalizeModel(model: string | undefined): string | undefined {
  const normalized = model?.trim().toLowerCase();
  return normalized || undefined;
}

function inferProvider(model: string): string | undefined {
  if (model.startsWith("gpt-") || /^o\d/.test(model)) {
    return "openai";
  }
  if (model.startsWith("claude-")) {
    return "anthropic";
  }
  return undefined;
}

function getCatalogRates(catalog: unknown, provider: string, model: string): RateTable | null {
  const root = asRecord(catalog);
  const providerEntry = asRecord(root?.[provider]);
  const models = asRecord(providerEntry?.["models"]);
  const modelEntry = asRecord(models?.[model]);
  return toRateTable(modelEntry?.["cost"]);
}

function selectContextRates(rates: RateTable, record: UsageRecord): RateTable {
  const contextTokens = record.inputTokens + record.cacheReadTokens + record.cacheWriteTokens;
  let selected = rates;
  let selectedSize = 0;

  for (const tier of rates.tiers ?? []) {
    const tierRecord = asRecord(tier);
    const tierInfo = asRecord(tierRecord?.["tier"]);
    const size = typeof tierInfo?.["size"] === "number" ? tierInfo["size"] : 0;
    if (tierInfo?.["type"] !== "context" || contextTokens < size || size < selectedSize) {
      continue;
    }
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
  if (!record) {
    return null;
  }

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

function rowToUsageRecord(row: UsageRecordRow): UsageRecord {
  return {
    agent: row.agent,
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    timestamp: row.ts,
    session: row.session ?? undefined,
    project: row.project ?? undefined,
    billedCost: row.billed_cost_usd ?? undefined,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    reasoningTokens: row.reasoning_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    sourceFile: "",
    recordHash: row.record_hash,
  };
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

function isFresh(fetchedAt: string, ttlMs: number): boolean {
  const fetchedTime = new Date(fetchedAt).getTime();
  return Number.isFinite(fetchedTime) && Date.now() - fetchedTime <= ttlMs;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

interface UsageRecordRow {
  id: number;
  record_hash: string;
  agent: string;
  provider: string | null;
  model: string | null;
  ts: string;
  session: string | null;
  project: string | null;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  billed_cost_usd: number | null;
}
