import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LocalQuotaSnapshotsResponse } from "../../data/contracts";
import { CopilotQuotaCards } from "./CopilotQuotaCards";

vi.mock("../../charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

describe("CopilotQuotaCards", () => {
  it("renders a card with complete quota data", () => {
    render(<CopilotQuotaCards data={response([group("angel-mac", 42, "2026-08-01T00:00:00.000Z")])} theme="tokenviewer-light" isLoading={false} />);

    expect(screen.getByText("angel-mac")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByLabelText("angel-mac Copilot quota gauge")).toBeInTheDocument();
    expect(screen.getByLabelText("angel-mac Copilot quota trend")).toBeInTheDocument();
  });

  it("shows an empty reset marker when resetsAt is absent", () => {
    render(<CopilotQuotaCards data={response([group("angel-mac", 12, null)])} theme="tokenviewer-light" isLoading={false} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders one card per machine and omits empty data", () => {
    const { rerender } = render(
      <CopilotQuotaCards
        data={response([
          group("angel-mac", 10, null),
          group("aon-mac", 20, null),
          group("aon-mac-m5", 30, null),
        ])}
        theme="tokenviewer-light"
        isLoading={false}
      />,
    );
    expect(screen.getAllByLabelText(/Copilot quota gauge/)).toHaveLength(3);

    rerender(<CopilotQuotaCards data={response([])} theme="tokenviewer-light" isLoading={false} />);
    expect(screen.queryByLabelText(/Copilot quota gauge/)).not.toBeInTheDocument();
  });
});

function response(groups: LocalQuotaSnapshotsResponse["groups"]): LocalQuotaSnapshotsResponse {
  return { provider: "copilot", groups };
}

function group(
  machine: "angel-mac" | "aon-mac" | "aon-mac-m5",
  percentUsed: number,
  resetsAt: string | null,
): LocalQuotaSnapshotsResponse["groups"][number] {
  return {
    machine,
    provider: "copilot",
    latest: {
      takenAt: "2026-07-05T10:00:00.000Z",
      percentUsed,
      plan: "Pro",
      resetsAt,
    },
    series: [
      { takenAt: "2026-07-04T10:00:00.000Z", percentUsed: Math.max(0, percentUsed - 5) },
      { takenAt: "2026-07-05T10:00:00.000Z", percentUsed },
    ],
  };
}
