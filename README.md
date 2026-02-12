# DevSonar

AI-powered runtime error monitoring for local development. Automatically captures errors from your application and sends them to Claude for analysis and code fixes.

## Architecture

```
Your Application (Node.js / Browser)
  |
  |  Errors captured automatically
  |  POST /errors
  v
DevSonar Relay Server (port 9100)
  - Buffering & deduplication
  - Debounce (default 3s)
  |
  |  Structured prompt
  v
Claude (Agent SDK or CLI)
  - Error analysis
  - Source code inspection
  - Auto-fix
```

## Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Claude Code CLI** (`claude` command available)

### Install & Run

```bash
npm install
npm run build --workspace=packages/devsonar

# Run your app with DevSonar auto-instrumentation
npx devsonar run -- node your-app.js

# Or run your app with tsx
npx devsonar run -- tsx watch src/index.ts
```

DevSonar automatically starts a relay server and injects error monitoring into the child process via `node --import`.

### Standalone Server

```bash
# Start the relay server only
npx devsonar
```

Then integrate the reporter into your application manually (see below).

## Packages

### `devsonar`

The main package. Includes the relay server, AI client, CLI, error buffer, and reporter.

```
packages/devsonar/
├── bin/devsonar.js          # CLI entry point
├── src/
│   ├── cli.ts               # CLI: `devsonar run -- <command>`
│   ├── register.ts          # Auto-registration via node --import
│   ├── index.ts             # Public API (auto-initializes on import)
│   ├── reporter/
│   │   ├── types.ts          # ErrorReport, ErrorReporterConfig
│   │   ├── reporter.ts       # ErrorReporter class + global helpers
│   │   └── middleware.ts      # Express error middleware
│   └── server/
│       ├── types.ts           # RelayConfig, HealthResponse, InFlightEntry
│       ├── server.ts          # Express relay server (POST /errors, GET /health, POST /flush)
│       ├── buffer.ts          # Error buffering, deduplication, debounce
│       ├── ai-client.ts       # Sends errors to Claude (SDK or CLI mode)
│       └── session-manager.ts # Persists Claude session ID (~/.devsonar/session-id.txt)
```

### `@devsonar/error-reporter`

Lightweight standalone client library for sending errors to the relay server. Same reporter API as `devsonar`, but with zero runtime dependencies.

```
packages/error-reporter/
└── src/
    ├── types.ts       # ErrorReport, ErrorReporterConfig
    ├── reporter.ts    # ErrorReporter class + global helpers
    ├── middleware.ts   # Express error middleware
    └── index.ts       # Barrel export
```

## Usage

### Option 1: CLI Auto-Instrumentation (Recommended)

The simplest way. DevSonar wraps your Node.js process and captures all uncaught exceptions and unhandled rejections automatically.

```bash
npx devsonar run -- tsx watch src/index.ts
```

This is how `apps/backend` uses DevSonar:

```json
{
  "scripts": {
    "dev": "devsonar run -- tsx watch src/index.ts"
  }
}
```

No code changes needed in your application.

### Option 2: Import `devsonar`

Import the package to auto-initialize global error handlers.

```typescript
// Just import — error monitoring starts automatically
import 'devsonar';
```

This is how `apps/frontend` uses DevSonar:

```typescript
// src/services/errorReporter.ts
import 'devsonar';
```

```typescript
// src/App.tsx
import './services/errorReporter';
```

On import, `devsonar` calls `initErrorReporter()` which sets up:
- **Browser**: `window.error`, `unhandledrejection` listeners, and `fetch` wrapper for HTTP error capture
- **Node.js**: `process.uncaughtException` and `process.unhandledRejection` handlers

### Option 3: Manual Integration with `@devsonar/error-reporter`

For fine-grained control, use the standalone reporter package.

#### Express.js Backend

```typescript
import express from 'express';
import { ErrorReporter, errorReporterMiddleware } from '@devsonar/error-reporter';

const app = express();

const reporter = new ErrorReporter({
  relayUrl: 'http://localhost:9100',
  enabled: true,
});

// Add as the last middleware
app.use(errorReporterMiddleware(reporter));
```

#### Browser / Frontend

```typescript
import { initErrorReporter } from '@devsonar/error-reporter';

initErrorReporter({
  relayUrl: 'http://localhost:9100',
  enabled: true,
});
```

`initErrorReporter` in the browser automatically sets up:
- `window.error` and `unhandledrejection` listeners
- `fetch` wrapper that reports HTTP 4xx/5xx errors (excluding requests to the relay server itself)

#### Manual Error Reporting

```typescript
import { ErrorReporter } from '@devsonar/error-reporter';

const reporter = new ErrorReporter({ relayUrl: 'http://localhost:9100' });

try {
  riskyOperation();
} catch (err) {
  reporter.report(err, 'riskyOperation');
}
```

## Configuration

### CLI Options

```bash
devsonar run [options] -- <command>

Options:
  --port <number>         Relay server port (default: 9100)
  --mode <sdk|cli>        Claude mode (default: sdk)
  --debounce <ms>         Debounce interval (default: 3000)
  --max-buffer <number>   Max buffer size (default: 50)
  --max-stack <number>    Max stack trace length (default: 2000)
  --project-dir <path>    Project directory (default: .)
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `RELAY_PORT` | `9100` | Relay server port |
| `CLAUDE_MODE` | `sdk` | `sdk` (Agent SDK) or `cli` (Claude Code CLI) |
| `DEBOUNCE_MS` | `3000` | Debounce interval in ms |
| `MAX_BUFFER_SIZE` | `50` | Max errors buffered before forced flush |
| `MAX_STACK_LENGTH` | `2000` | Max stack trace characters sent |
| `PROJECT_DIR` | `.` | Project root for Claude to inspect |
| `DEVSONAR_URL` | `http://localhost:9100` | Relay URL (set automatically in child process) |
| `DEVSONAR_DEBUG` | `false` | Enable debug logging in reporter |

### ErrorReporterConfig

| Property | Type | Default | Description |
|---|---|---|---|
| `relayUrl` | `string` | `http://localhost:9100` | Relay server URL |
| `enabled` | `boolean` | `true` (dev only in `error-reporter`) | Enable/disable reporting |
| `timeout` | `number` | `1000` | Request timeout in ms |
| `maxStackLength` | `number` | `2000` | Max stack trace characters |
| `debug` | `boolean` | `false` | Log send failures to console |

## API Endpoints

### `POST /errors`

Submit error reports.

**Request:**
```json
{
  "message": "Cannot read property 'id' of undefined",
  "stack": "TypeError: Cannot read property...",
  "source": "POST /api/users",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "context": {
    "method": "POST",
    "path": "/api/users"
  }
}
```

**Response:** `202 Accepted`
```json
{ "received": 1 }
```

### `GET /health`

```json
{
  "status": "ok",
  "buffered": 0,
  "session_id": "abc-123",
  "target": "claude-code"
}
```

### `POST /flush`

Force flush buffered errors immediately.

```json
{ "flushed": 3 }
```

## Example: apps/

The `apps/` directory contains a demo TODO application that shows DevSonar in action.

### apps/backend

Express.js API using CLI auto-instrumentation:

```json
{
  "scripts": {
    "dev": "devsonar run -- tsx watch src/index.ts"
  }
}
```

**`.env`:**
```
PORT=3001
ERROR_REPORTER_ENABLED=true
RELAY_URL=http://localhost:9100
```

### apps/frontend

React app using `import 'devsonar'`:

```typescript
// src/services/errorReporter.ts
import 'devsonar';

// src/App.tsx
import './services/errorReporter';
```

**`.env`:**
```
VITE_API_URL=http://localhost:3001/api
VITE_RELAY_URL=http://localhost:9100
VITE_ERROR_REPORTER_ENABLED=true
```

## Development

```bash
# Build all packages
npm run build

# Build specific package
npm run build --workspace=packages/devsonar
npm run build --workspace=packages/error-reporter

# Clean all
npm run clean

# Run demo app
npm run dev
```

## License

MIT
