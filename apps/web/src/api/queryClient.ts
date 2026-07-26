import { keepPreviousData, QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
      placeholderData: keepPreviousData,
      retry: 1,
    },
  },
});

