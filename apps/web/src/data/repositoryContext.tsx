import { createContext, type ReactNode, useContext } from "react";
import type { LocalSnapshotRepository } from "./repository";

const RepositoryContext = createContext<LocalSnapshotRepository | null>(null);

export function LocalRepositoryProvider({
  repository,
  children,
}: {
  repository: LocalSnapshotRepository;
  children: ReactNode;
}) {
  return <RepositoryContext value={repository}>{children}</RepositoryContext>;
}

export function useProvidedLocalRepository(): LocalSnapshotRepository | null {
  return useContext(RepositoryContext);
}
