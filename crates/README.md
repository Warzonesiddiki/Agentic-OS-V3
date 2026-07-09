# preserved crates (core, config, provider-types, providers, tools)

This directory hosts the Rust components of the Agentic OS workspace:

- **core**: Shared types, traits, and core data structures.
- **config**: Workspace configuration parsing and initialization.
- **provider-types**: Types representing LLM provider capabilities.
- **providers**: Core LLM providers (Anthropic, OpenAI, etc.).
- **tools**: Extension capabilities and helper CLI tools.

## Workspace Status

Following P1-02 decommissioning, the 4 stub crates (`installer`, `safety`, `cli`, and `observability`) have been removed from the workspace.

## Future Integration Path

These crates are preserved for future use. The TypeScript Hono server currently relies on the Portkey SDK and does not yet bind directly to these Rust crates. Future integration will target napi-rs bindings or a subprocess IPC bridge to connect Hono directly to this Rust provider layer.
