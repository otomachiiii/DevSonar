import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from '../logger.js';

export class SessionManager {
  private sessionId: string | null = null;
  private sessionFile: string;
  private sessionDir: string;

  constructor() {
    this.sessionDir = join(homedir(), '.devsonar');
    this.sessionFile = join(this.sessionDir, 'session-id.txt');
  }

  async initialize(): Promise<void> {
    if (!existsSync(this.sessionDir)) {
      await mkdir(this.sessionDir, { recursive: true });
    }

    if (existsSync(this.sessionFile)) {
      try {
        const id = (await readFile(this.sessionFile, 'utf-8')).trim();
        if (id) {
          this.sessionId = id;
          logger.debug('SessionManager', `Loaded existing session: ${this.sessionId}`);
        }
      } catch (error) {
        logger.error('SessionManager', 'Failed to load session file:', error);
      }
    }
  }

  async saveSessionId(id: string): Promise<void> {
    this.sessionId = id;
    await writeFile(this.sessionFile, id, 'utf-8');
    logger.debug('SessionManager', `Saved session: ${id}`);
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async reset(): Promise<void> {
    this.sessionId = null;
    try {
      if (existsSync(this.sessionFile)) {
        await writeFile(this.sessionFile, '', 'utf-8');
      }
    } catch (error) {
      logger.error('SessionManager', 'Failed to reset session:', error);
    }
    logger.debug('SessionManager', 'Session reset');
  }
}
