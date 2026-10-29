import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export interface ErrorDetail {
  path: string;
  message: string;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NotFoundError extends HttpError {
  constructor(resource: string, id: number | string) {
    super(404, 'NOT_FOUND', `${resource} ${id} not found`);
    this.name = 'NotFoundError';
  }
}

export function zodDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/** 404 for unknown API routes. */
export const apiNotFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
};

/**
 * Central error middleware. Every error leaves the API in the same shape:
 * { error: { code, message, details? } }
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: zodDetails(err) },
    });
    return;
  }

  if (err instanceof HttpError) {
    if (err.status >= 500) req.log?.error({ err }, err.message);
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  // Malformed JSON body from express.json()
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    return;
  }

  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
    return;
  }

  req.log?.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};
