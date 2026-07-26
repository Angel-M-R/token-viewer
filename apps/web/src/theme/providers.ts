export const PROVIDER_COLORS: Record<string, string> = {
  openai: "#2f9d7e",
  anthropic: "#b86b2b",
  google: "#4776d0",
  azure: "#6f8f2b",
  groq: "#c24b5a",
  xai: "#7d5fb2",
  unknown: "#6e7783",
};

const seriesPalette = [
  "#2f9d7e",
  "#b86b2b",
  "#4776d0",
  "#c24b5a",
  "#6f8f2b",
  "#7d5fb2",
  "#d09c36",
  "#3f8f9b",
  "#8c6f5a",
  "#b14f8a",
];

export function colorForProvider(provider: string | null | undefined): string {
  if (!provider) return PROVIDER_COLORS.unknown;
  return PROVIDER_COLORS[provider.toLowerCase()] ?? hashColor(provider);
}

export function colorForSeries(value: string, index = 0): string {
  return seriesPalette[hash(value || String(index)) % seriesPalette.length] ?? seriesPalette[0];
}

export function chartPalette(): string[] {
  return seriesPalette;
}

function hashColor(value: string): string {
  return seriesPalette[hash(value) % seriesPalette.length] ?? seriesPalette[0];
}

function hash(value: string): number {
  let output = 0;
  for (const char of value) {
    output = (output * 31 + char.charCodeAt(0)) >>> 0;
  }
  return output;
}

