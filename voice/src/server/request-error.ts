import { z } from 'zod';
export function requestError(error: unknown) {
  const failure = error as { code?: unknown; message?: string };
  // Database/transport failures are temporary service failures, never user input errors.
  // Do not return connection details, SQL or server addresses to the browser.
  if (typeof failure?.code === 'string' && /^(?:[0-9A-Z]{5}|E[A-Z_]+)$/.test(failure.code))
    return {
      status: 503,
      error:
        'The workspace service is temporarily unavailable. Your saved work is safe; try again shortly.',
      code: 'SERVICE_UNAVAILABLE',
    };
  const message =
    error instanceof z.ZodError
      ? 'Invalid request: ' + error.issues.map((i) => i.message).join('; ')
      : error instanceof SyntaxError
        ? 'The request contains invalid JSON. Check the format and try again.'
        : failure?.message || 'CHORUS could not complete the request.';
  const auth =
      /^(?:Sign in required|Session expired|Invalid token|Origin rejected|Local auth requires loopback|Authentication is not configured|Tool authentication rejected|Invalid or expired scope|Phone scope required|Call capability is no longer active)$/i.test(
        message,
      ),
    stale = /mission changed|stale.*revision|approval is stale/i.test(message);
  return {
    status: auth ? 401 : message === 'Mission not found' ? 404 : stale ? 409 : 400,
    error: message,
    ...(stale ? { code: 'REVISION_CONFLICT' } : {}),
  };
}
