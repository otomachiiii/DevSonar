import { Request, Response, NextFunction } from 'express';
import { ErrorReporter } from './reporter';

export function errorReporterMiddleware(reporter: ErrorReporter) {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    const source = `${req.method} ${req.path}`;

    reporter.report({
      message: err.message,
      stack: err.stack,
      source,
      timestamp: new Date().toISOString(),
      context: {
        method: req.method,
        path: req.path,
        query: req.query,
        body: req.body,
        headers: req.headers,
      },
    });

    next(err);
  };
}
