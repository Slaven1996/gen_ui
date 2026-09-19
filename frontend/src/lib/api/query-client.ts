import { QueryClient } from '@tanstack/react-query';
import { getErrorStatus } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Client errors (401/403/404/422…) won't fix themselves on retry.
      retry: (failureCount, error) => {
        const status = getErrorStatus(error);
        if (status !== undefined && status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
