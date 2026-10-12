
/** The transport surfaces the raw response body; pull out the API's message when there is one. */
export function describeChatError(error: Error): string {
  try {
    const body = JSON.parse(error.message) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join('. ');
    if (body.message) return body.message;
  } catch {
    // Not JSON — fall through.
  }
  return error.message || 'The assistant is unavailable right now.';
}
