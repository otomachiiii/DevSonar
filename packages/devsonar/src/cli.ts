import { resolve } from 'path';
import { spawn } from 'child_process';
import { createServer } from './server/server.js';
import { SessionManager } from './server/session-manager.js';
import { RelayConfig } from './server/types.js';
import type { Server } from 'http';

function parseCliArgs(argv: string[]): { args: Record<string, string>; subcommand: string | null; userCommand: string[] } {
  const raw = argv.slice(2);
  const args: Record<string, string> = {};
  let subcommand: string | null = null;
  const userCommand: string[] = [];

  const separatorIndex = raw.indexOf('--');
  const devsonarArgs = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw;
  if (separatorIndex >= 0) {
    userCommand.push(...raw.slice(separatorIndex + 1));
  }

  for (let i = 0; i < devsonarArgs.length; i++) {
    const arg = devsonarArgs[i];
    if (!arg.startsWith('--') && i === 0) {
      subcommand = arg;
    } else if (arg.startsWith('--') && i + 1 < devsonarArgs.length) {
      args[arg.slice(2)] = devsonarArgs[i + 1];
      i++;
    }
  }

  return { args, subcommand, userCommand };
}

function buildConfig(args: Record<string, string>): RelayConfig {
  return {
    port: parseInt(args['port'] || process.env.RELAY_PORT || '9100', 10),
    claudeMode: (args['mode'] || process.env.CLAUDE_MODE || 'sdk') as 'sdk' | 'cli',
    debounceMs: parseInt(args['debounce'] || process.env.DEBOUNCE_MS || '3000', 10),
    maxBufferSize: parseInt(args['max-buffer'] || process.env.MAX_BUFFER_SIZE || '50', 10),
    maxStackLength: parseInt(args['max-stack'] || process.env.MAX_STACK_LENGTH || '2000', 10),
    projectDir: resolve(args['project-dir'] || process.env.PROJECT_DIR || '.'),
  };
}

async function startServer(config: RelayConfig): Promise<void> {
  const sessionManager = new SessionManager();
  await sessionManager.initialize();

  const app = createServer(config, sessionManager);

  app.listen(config.port, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║         DevSonar - AI Error Monitor                       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

Server running on: http://localhost:${config.port}
Mode: ${config.claudeMode}
Project Dir: ${config.projectDir}

Endpoints:
  POST /errors  - Receive error reports
  GET  /health  - Health check
  POST /flush   - Force flush buffer

Dashboard: http://localhost:${config.port}/
`);
  });
}

async function tryStartServer(config: RelayConfig): Promise<boolean> {
  const sessionManager = new SessionManager();
  await sessionManager.initialize();

  const app = createServer(config, sessionManager);

  return new Promise<boolean>((resolve) => {
    const server: Server = app.listen(config.port, () => {
      console.log(`[DevSonar] Relay server started on http://localhost:${config.port}`);
      resolve(true);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        throw err;
      }
    });
  });
}

async function runWithApp(config: RelayConfig, userCommand: string[]): Promise<void> {
  const serverStarted = await tryStartServer(config);
  if (!serverStarted) {
    console.log(`[DevSonar] Relay server already running on port ${config.port}, skipping`);
  }

  const registerUrl = new URL('./register.js', import.meta.url).href;
  const existingNodeOptions = process.env.NODE_OPTIONS || '';
  const nodeOptions = `--import ${registerUrl} ${existingNodeOptions}`.trim();

  const [cmd, ...cmdArgs] = userCommand;

  console.log(`[DevSonar] Starting: ${userCommand.join(' ')}`);
  console.log(`[DevSonar] Auto-instrumentation enabled`);

  const child = spawn(cmd, cmdArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      DEVSONAR_URL: `http://localhost:${config.port}`,
    },
    shell: true,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => {
    child.kill('SIGINT');
  });
  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });
}

async function main() {
  const { args, subcommand, userCommand } = parseCliArgs(process.argv);
  const config = buildConfig(args);

  if (subcommand === 'run' && userCommand.length > 0) {
    await runWithApp(config, userCommand);
  } else {
    await startServer(config);
  }
}

main().catch((error) => {
  console.error('Failed to start DevSonar:', error);
  process.exit(1);
});
