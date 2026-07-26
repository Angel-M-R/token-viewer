import type { CSSProperties } from "react";
import { colorForProvider } from "../../theme/providers";

export function ProviderBadge({ provider }: { provider: string | null }) {
  const label = provider ?? "unknown";
  return (
    <span className="provider-badge" style={{ "--provider-color": colorForProvider(label) } as CSSProperties}>
      {label}
    </span>
  );
}
