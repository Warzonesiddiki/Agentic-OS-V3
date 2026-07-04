# Agentic OS V4 Architecture

## Directory Structure

```text
agentic-os-v4/
├── crates/                    # Rust backend workspace (Providers, Config, Core)
│   ├── cli/                   # CLI entrypoint
│   ├── config/                # Configuration management
│   ├── core/                  # Core types and errors
│   ├── installer/             # Self-updater
│   ├── observability/         # Logging and metrics
│   ├── provider-types/        # LLM provider abstractions
│   ├── providers/             # LLM provider implementations (OpenAI, Anthropic, etc.)
│   ├── safety/                # Guardrails and PII filters
│   └── tools/                 # Tool registry and lifecycle
├── docs/                      # Documentation
├── nexus-tauri/               # Tauri desktop application wrapper
├── packages/                  # TypeScript packages
│   ├── devtools/              # Devtools client
│   └── sdk/                   # TypeScript SDK client
├── server/                    # Core TypeScript backend (Hono + DB)
│   ├── drizzle/               # Database migrations
│   ├── src/                   # Server source code
│   │   ├── db/                # Drizzle schema and client
│   │   ├── lib/               # Shared utilities
│   │   ├── routes/            # HTTP endpoints
│   │   └── services/          # Core domain logic
│   └── tests/                 # Server test suite
├── src/                       # React frontend source
│   ├── components/            # UI components
│   ├── lib/                   # Frontend utilities and OS store
│   └── pages/                 # React pages
```

## Layer Architecture

1. **Frontend (React)**: Handles the UI, OS state, visual pipeline builder, and terminal emulator. Connects to the backend via REST and SSE.
2. **Backend (TypeScript)**: Built on Hono. Manages the database, Agent logic, scheduling, LLM routing, and MCP connections.
3. **Providers (Rust)**: High-performance provider implementations adapted from Goose, handling LLM connectivity, token tracking, and safety.
4. **Desktop (Tauri)**: Wraps the backend and frontend into a local desktop application.
