import { isAxiosError } from 'axios';

interface ApiErrorBody {
  message?: string | string[];
  code?: string;
}

/** Human-readable message from an API/network error. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (isAxiosError<ApiErrorBody>(error)) {
    if (!error.response) return 'Can’t reach the server. Check your connection and try again.';
    if (error.response.status === 429) return 'Too many attempts. Wait a minute and try again.';
    const message = error.response.data?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (message) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function getErrorStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}
