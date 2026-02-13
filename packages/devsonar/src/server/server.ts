import express, { Request, Response } from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { ErrorReport, RelayConfig, HealthResponse } from './types.js';
import { ErrorBuffer } from './buffer.js';
import { AIClient } from './ai-client.js';
import { SessionManager } from './session-manager.js';
import { logger } from '../logger.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function createServer(config: RelayConfig, sessionManager: SessionManager) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  const aiClient = new AIClient(config, sessionManager);
  const errorBuffer = new ErrorBuffer(
    async (errors) => {
      logger.debug('DevSonar', `Flushing ${errors.length} error(s) to AI agent...`);
      try {
        await aiClient.send(errors);
        logger.info('DevSonar', 'Successfully sent errors to AI agent');
      } catch (error) {
        logger.error('DevSonar', 'Failed to send errors to AI agent:', error);
      }
    },
    config.debounceMs,
    config.maxBufferSize
  );

  app.post('/errors', (req: Request, res: Response) => {
    try {
      const body = req.body;
      const errors: ErrorReport[] = Array.isArray(body) ? body : [body];

      errors.forEach((error) => {
        if (!error.message || typeof error.message !== 'string' ||
            !error.timestamp || typeof error.timestamp !== 'string') {
          logger.warn('DevSonar', `Invalid error report received: ${JSON.stringify(error)}`);
          return;
        }
        if (!error.stack) {
          logger.warn('DevSonar', `Warning: Error report missing stack trace - "${error.message}"`);
        }
        logger.debug('DevSonar', `Received error: ${error.message} (source: ${error.source || 'unknown'})`);
        errorBuffer.add(error);
      });

      res.status(202).json({ received: errors.length });
    } catch (error) {
      logger.error('DevSonar', 'Error processing request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/health', (req: Request, res: Response) => {
    const response: HealthResponse = {
      status: 'ok',
      buffered: errorBuffer.size(),
      session_id: sessionManager.getSessionId(),
      target: 'claude-code',
    };
    res.json(response);
  });

  app.post('/flush', (req: Request, res: Response) => {
    const buffered = errorBuffer.size();
    errorBuffer.flush();
    res.json({ flushed: buffered });
  });

  const dashboardDir = resolve(__dirname, '..', '..', 'dashboard');
  if (existsSync(dashboardDir)) {
    app.use('/', express.static(dashboardDir));
    logger.debug('DevSonar', `Dashboard enabled: serving from ${dashboardDir}`);
  }

  return app;
}
