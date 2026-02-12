# DevSonar

AI-powered runtime error monitoring for local development. Automatically captures errors from your application and sends them to Claude for analysis and code fixes.

## Architecture

```
Your Application (Any Language)
  |
  ├── [Node.js] --import hook (auto)
  ├── [Python/Go] Language reporter (SDK)
  ├── [Any] stderr monitoring (auto)
  |
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

## Install

```bash
npm install devsonar
```

Or install the lightweight reporter only:

```bash
npm install @devsonar/error-reporter
```

### Prerequisites

- **Node.js** >= 18.0.0
- **Claude Code CLI** (`claude` command available) — required for the relay server

## Quick Start (Turborepo Monorepo)

DevSonar is designed to work with Turborepo monorepos where backend and frontend apps coexist. Below is a typical setup.

### Project Structure

```
my-app/
├── package.json          # root workspace
├── turbo.json
└── apps/
    ├── backend/
    │   ├── package.json  # devsonar as dependency
    │   └── src/
    │       └── index.ts
    └── frontend/
        ├── package.json  # devsonar as dependency
        └── src/
            └── main.ts   # or static HTML
```

### 1. Root `package.json`

```json
{
  "private": true,
  "workspaces": ["apps/*"],
  "devDependencies": {
    "turbo": "^2"
  },
  "scripts": {
    "dev": "turbo dev"
  }
}
```

### 2. Backend Setup

Install `devsonar` in the backend app and use the CLI to wrap your server process:

```bash
cd apps/backend
npm install devsonar
```

```json
{
  "scripts": {
    "dev": "devsonar run -- tsx watch src/index.ts"
  }
}
```

`devsonar run` starts the relay server (port 9100) and injects error monitoring into the child process via `node --import`. It also monitors stderr for error patterns from Python, Go, Ruby, Java, and Rust. No code changes needed — all `uncaughtException` and `unhandledRejection` errors are captured automatically.

### 3. Frontend Setup

Install `devsonar` in the frontend app and import it at your entry point:

```bash
cd apps/frontend
npm install devsonar
```

#### With a Bundler (Vite, webpack, etc.)

```typescript
// src/main.ts or src/index.ts
import 'devsonar';
```

#### Static HTML (no bundler)

Serve the DevSonar dist files from your backend and import via `<script type="module">`:

```typescript
// Backend: serve devsonar dist as static files
import { resolve } from 'path';
app.use('/devsonar', express.static(resolve('node_modules/devsonar/dist')));
```

```html
<!-- Frontend: index.html -->
<script type="module">
  import '/devsonar/index.js';
</script>
```

On import, DevSonar automatically sets up:
- `window.error` and `unhandledrejection` listeners
- `fetch` wrapper that reports HTTP 4xx/5xx errors to the relay server

### 4. Turborepo Config

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": {
      "persistent": true,
      "cache": false
    }
  }
}
```

### 5. Run

```bash
npm install
npm run dev
```

The backend starts with DevSonar monitoring. Errors from both the backend (Node.js) and frontend (browser) are sent to the relay server on port 9100, where Claude analyzes them and suggests fixes.

## Usage

### Option 1: CLI Auto-Instrumentation (Recommended)

The simplest way. DevSonar wraps your Node.js process and captures all uncaught exceptions and unhandled rejections automatically.

```bash
npx devsonar run -- node your-app.js
```

Use it in your `package.json`:

```json
{
  "scripts": {
    "dev": "devsonar run -- tsx watch src/index.ts"
  }
}
```

No code changes needed in your application. DevSonar starts a relay server and injects error monitoring into the child process via `node --import`. For non-Node.js processes, stderr is automatically monitored for error patterns.

```bash
# Works with any language
npx devsonar run -- python app.py
npx devsonar run -- go run main.go
npx devsonar run -- ruby app.rb
npx devsonar run -- java -jar app.jar
npx devsonar run -- cargo run
```

### Option 2: Import `devsonar`

Import the package to auto-initialize global error handlers.

```typescript
import 'devsonar';
```

On import, `devsonar` calls `initErrorReporter()` which sets up:
- **Browser**: `window.error`, `unhandledrejection` listeners, and `fetch` wrapper for HTTP error capture
- **Node.js**: `process.uncaughtException` and `process.unhandledRejection` handlers

### Option 3: Manual Integration with `@devsonar/error-reporter`

For fine-grained control, use the standalone reporter package.

#### Express.js

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

#### Browser

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

### Standalone Relay Server

Start the relay server without wrapping an application:

```bash
npx devsonar
```

## Configuration

### CLI Options

```
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
| `enabled` | `boolean` | `true` | Enable/disable reporting |
| `timeout` | `number` | `1000` | Request timeout in ms |
| `maxStackLength` | `number` | `2000` | Max stack trace characters |
| `debug` | `boolean` | `false` | Log send failures to console |

## API Endpoints

The relay server exposes the following endpoints:

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

## Multi-Language Support

DevSonar supports error capture from multiple languages through two mechanisms:

### Supported Languages

| Language | stderr Monitoring | Language Reporter |
|---|---|---|
| Node.js | — (uses `--import` hook) | Built-in |
| Python | Traceback detection | `devsonar` (pip) |
| Go | Panic detection | `devsonar-go` (Go module) |
| Ruby | Error pattern detection | — |
| Java | Exception/Error detection | — |
| Rust | Panic detection | — |

### stderr Monitoring (Automatic)

`devsonar run` automatically monitors stderr output from any child process and detects error patterns for Python, Go, Ruby, Java, and Rust. No configuration needed.

```bash
devsonar run -- python app.py     # Detects Python tracebacks
devsonar run -- go run main.go    # Detects Go panics
devsonar run -- ruby app.rb       # Detects Ruby errors
devsonar run -- java -jar app.jar # Detects Java exceptions
devsonar run -- cargo run         # Detects Rust panics
```

### Python Reporter

For richer error capture in Python applications (e.g., caught exceptions, framework integration), install the Python reporter:

```bash
pip install devsonar
```

#### Basic Usage

```python
import devsonar
devsonar.init()  # Hooks sys.excepthook for automatic capture
```

#### Manual Reporting

```python
import devsonar

devsonar.init()

try:
    risky_operation()
except Exception as e:
    devsonar.report_error(str(e), source="my-module")
```

#### Django

```python
# settings.py
MIDDLEWARE = [
    "devsonar.middleware.django.DevSonarMiddleware",
    # ... other middleware
]
```

#### Flask

```python
from flask import Flask
from devsonar.middleware.flask import init_devsonar

app = Flask(__name__)
init_devsonar(app)
```

### Go Reporter

For richer error capture in Go applications (e.g., recovered panics, HTTP middleware), install the Go reporter:

```bash
go get github.com/taro-hirose/devsonar-go
```

#### Basic Usage

```go
package main

import devsonar "github.com/taro-hirose/devsonar-go"

func main() {
    reporter := devsonar.New()
    defer devsonar.RecoverAndReport(reporter, "main")

    // your application code
}
```

#### Error Reporting

```go
reporter := devsonar.New()

if err := riskyOperation(); err != nil {
    reporter.ReportError(err, "my-module")
}
```

#### HTTP Middleware

```go
mux := http.NewServeMux()
reporter := devsonar.New()
handler := devsonar.Middleware(reporter)(mux)
http.ListenAndServe(":8080", handler)
```

## Packages

### `devsonar`

The main package. Includes the relay server, AI client, CLI, error buffer, and reporter.

### `@devsonar/error-reporter`

Lightweight standalone client library for sending errors to the relay server. Same reporter API as `devsonar`, but with zero runtime dependencies.

### `devsonar` (Python)

Python error reporter. Zero dependencies (stdlib only). Supports Django and Flask middleware. Install via `pip install devsonar`.

### `devsonar-go` (Go)

Go error reporter. Zero external dependencies. Supports `net/http` middleware and panic recovery. Install via `go get github.com/taro-hirose/devsonar-go`.

## License

MIT
