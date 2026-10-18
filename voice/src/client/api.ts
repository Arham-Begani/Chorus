export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code?: string,
  ) {
    super(message);
  }
  get retryable() {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}
export async function requestJSON<T = unknown>(
  path: string,
  data?: unknown,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 15000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch('/api/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      timeout.aborted
        ? 'The request took too long. Your work may already be saved; retry to check safely.'
        : 'Connection interrupted. Check your connection, then retry.',
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== 'auth' &&
      path !== 'session' &&
      typeof window !== 'undefined'
    )
      window.dispatchEvent(new Event('chorus:session-expired'));
    throw new ApiError(
      result?.error ||
        (response.status === 401
          ? 'Your session ended. Sign in again to continue.'
          : 'CHORUS could not complete this request. Try again shortly.'),
      response.status,
      result?.code,
    );
  }
  if (result === null)
    throw new ApiError('CHORUS returned an incomplete response. Retry to check safely.');
  return result as T;
}
