import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { LocalRepositoryProvider } from "./data/repositoryContext";
import { representativeRepository } from "./data/testFixtures";

vi.mock("./charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

describe("local dashboard integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("smokes the local dashboard for all identities", async () => {
    window.history.replaceState(null, "", "/?range=all");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <LocalRepositoryProvider repository={representativeRepository()}>
          <App />
        </LocalRepositoryProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByLabelText("angel-mac Copilot quota gauge")).toBeInTheDocument();
    expect(screen.getByLabelText("old-mac Copilot quota gauge")).toBeInTheDocument();
    expect(screen.getByLabelText("mac-m5 Copilot quota gauge")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "angel-mac" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "old-mac" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "mac-m5" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Daily usage chart" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Calendar heatmap" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Models" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
