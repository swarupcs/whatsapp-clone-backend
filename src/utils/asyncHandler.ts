/**
 * asyncHandler — eliminate try/catch boilerplate in every route handler.
 *
 * PROBLEM: Without this, every async controller must wrap its body in
 * try/catch and call next(err) manually.  Miss ONE and an unhandled
 * promise rejection crashes the request (and in older Node versions, the
 * entire process).
 *
 * SOLUTION: Wrap the handler.  Any thrown error — AppError, Zod error,
 * Mongoose error, programming bug — is forwarded to next(), which routes
 * it to the global error handler.
 *
 * Usage:
 *   router.get('/users', asyncHandler(userController.list));
 *
 * Works with:
 *   - Express RequestHandler   (req, res, next)
 *   - Express ErrorRequestHandler  (err, req, res, next)
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Wraps an async Express route handler so that any thrown error or rejected
 * promise is automatically forwarded to Express's next(err) instead of
 * causing an unhandled rejection.
 */
export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return function asyncHandlerWrapper(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
