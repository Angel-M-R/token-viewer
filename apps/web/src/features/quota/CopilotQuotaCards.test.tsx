import type { QuotaSnapshotsResponse } from "@tokenviewer/core/schemas";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CopilotQuotaCards } from "./CopilotQuotaCards";

vi.mock("../../charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

describe("CopilotQuotaCards", () => {
  it("renders a card with complete quota data", () => {
    render(<CopilotQuotaCards data={response([account("octocat", 42, "2026-08-01T00:00:00.000Z")])} theme="tokenviewer-light" isLoading={false} />);

    expect(screen.getByText("octocat")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByLabelText("octocat Copilot quota gauge")).toBeInTheDocument();
    expect(screen.getByLabelText("octocat Copilot quota trend")).toBeInTheDocument();
  });

  it("shows an empty reset marker when resetsAt is absent", () => {
    render(<CopilotQuotaCards data={response([account("octocat", 12, null)])} theme="tokenviewer-light" isLoading={false} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders one card per account and omits empty data", () => {
    const { rerender } = render(
      <CopilotQuotaCards data={response([account("octocat", 10, null), account("mona", 20, null)])} theme="tokenviewer-light" isLoading={false} />,
    );
    expect(screen.getAllByLabelText(/Copilot quota gauge/)).toHaveLength(2);

    rerender(<CopilotQuotaCards data={response([])} theme="tokenviewer-light" isLoading={false} />);
    expect(screen.queryByLabelText(/Copilot quota gauge/)).not.toBeInTheDocument();
  });
});

function response(accounts: QuotaSnapshotsResponse["accounts"]): QuotaSnapshotsResponse {
  return { provider: "copilot", accounts };
}

function account(
  login: string,
  percentUsed: number,
  resetsAt: string | null,
): QuotaSnapshotsResponse["accounts"][number] {
  return {
    account: login,
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
