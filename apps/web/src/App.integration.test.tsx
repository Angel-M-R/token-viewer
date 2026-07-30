import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { UserConfig } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import viteConfig from "../vite.config";
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

  it("renders every local aggregate view from snapshots without API or public-host configuration", async () => {
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
    expect(screen.getByRole("img", { name: "Daily usage chart" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Hourly heatmap" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Calendar heatmap" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Models" })).toBeInTheDocument();
    expect(screen.queryByText(/dashboard token|login|individual records/i)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    const config = viteConfig as UserConfig;
    expect(config.server?.proxy).toBeUndefined();
    expect(config.server?.host).toBeUndefined();
    expect(config.base).toBeUndefined();
  });
});
