export { ErrorReporter, initErrorReporter, getErrorReporter, reportError } from './reporter/reporter.js';
export { errorReporterMiddleware } from './reporter/middleware.js';
export type { ErrorReport, ErrorReporterConfig } from './reporter/types.js';

import { initErrorReporter } from './reporter/reporter.js';
initErrorReporter();
