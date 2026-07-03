# Agentic OS V4: The Universal AI Agent Operating System
## PART 4 — Phases 16–20: User Interfaces, Dashboards & Observability

> **Part of the 30-Phase Master Integration Plan**
> Merging 8 projects: Goose, gemini-cli, 9Router, litellm, Portkey, new-api, OmniRoute2, Agentic OS V3

---

## Phase 16: CLI & Terminal Experience (Weeks 21–24)

### Overview
Phase 16 delivers the primary and secondary command-line interfaces for Agentic OS V4. The Goose Rust CLI serves as the primary high-performance CLI, while gemini-cli's Ink/React-based interactive CLI provides an alternative rich terminal experience for developers who prefer Node.js tooling. Both CLIs share a unified command routing layer, shell completion system, and theming engine. This phase ensures that every aspect of Agentic OS V4 — from agent orchestration to gateway configuration — is accessible from the terminal with minimal friction. The CLI is the most frequent interaction point for power users and CI/CD pipelines, making its reliability, speed, and discoverability paramount.

---

### 16.1 Import Goose CLI (Rust) as Primary CLI Interface

**Description:**
The Goose Rust CLI is imported as the flagship command-line interface for Agentic OS V4. This involves taking the complete Goose CLI codebase — including its session management, recipe execution, extension management, provider configuration, and diagnostics subsystems — and adapting it to work within the unified monorepo structure. The Rust CLI is chosen as primary because of its superior startup time (~30ms cold vs ~300ms for Node), smaller binary footprint, and native performance across all platforms. All existing Goose CLI commands (`chat`, `run`, `session`, `recipe`, `skill`, `provider`, `config`, `doctor`, `update`, etc.) are preserved and enhanced to work with the merged gateway, agent runtime, and MCP ecosystems. The CLI integrates directly with the ACP server for session management, eliminating the need for separate HTTP calls to the gateway for basic operations. Key architectural changes include updating module paths to the new monorepo layout, replacing internal Goose provider implementations with the unified gateway provider registry, and adding new commands for gateway management (start/stop/status), MITM proxy control, local inference management, and dictation. The CLI binary is built as part of the Rust workspace and distributed via all standard package managers (Homebrew, Scoop, Winget, APT, AUR) as well as direct download.

**Copy Source:** Goose — `crates/goose-cli/src/` (Rust)

**Key Files to Create/Modify:**
```
apps/cli/
├── Cargo.toml                     # Package manifest with all dependencies
├── src/
│   ├── main.rs                    # Entry point, argument parsing (clap)
│   ├── commands/
│   │   ├── mod.rs                 # Command module index
│   │   ├── chat.rs                # Interactive chat session (updated for unified gateway)
│   │   ├── run.rs                 # Run recipe/skill/agent
│   │   ├── session.rs             # Session management (list, attach, resume, delete)
│   │   ├── recipe.rs              # Recipe CRUD: create, list, run, delete
│   │   ├── skill.rs               # Skill install, update, list, remove, search
│   │   ├── provider.rs            # Provider configuration (unified registry)
│   │   ├── gateway.rs             # Gateway server: start, stop, status, logs
│   │   ├── mitm.rs                # MITM proxy: enable, disable, cert-install
│   │   ├── local.rs               # Local model: pull, list, remove, serve
│   │   ├── dictation.rs           # Voice input: start, stop, toggle
│   │   ├── config.rs              # Unified configuration viewer/editor
│   │   ├── doctor.rs              # Diagnostics, health checks, repair
│   │   ├── update.rs              # Self-update mechanism
│   │   ├── schedule.rs            # Cron-style scheduled tasks
│   │   ├── project.rs             # Project context management
│   │   └── completion.rs          # Shell completion generator
│   ├── session/
│   │   ├── mod.rs                 # Session management core
│   │   ├── manager.rs             # Session lifecycle (create, pause, resume, archive)
│   │   ├── history.rs             # Session history with search/filter
│   │   └── exporter.rs            # Export session to markdown/JSON/HTML
│   ├── config/
│   │   ├── mod.rs                 # Config loading (toml, json, yaml, env)
│   │   ├── migration.rs           # Config schema migration
│   │   └── types.rs               # Unified config types
│   ├── output/
│   │   ├── mod.rs                 # Output formatting
│   │   ├── json.rs                # JSON output mode
│   │   ├── markdown.rs            # Terminal markdown rendering
│   │   └── progress.rs            # Progress bars and spinners
│   └── utils/
│       ├── mod.rs
│       ├── paths.rs               # Config/data path resolution
│       ├── network.rs             # Connectivity checks
│       └── platform.rs            # Platform-specific utilities
├── build.rs                       # Build-time configuration (version, git hash)
└── tests/
    ├── integration/
    │   ├── chat_test.rs           # Chat command integration tests
    │   ├── session_test.rs        # Session management tests
    │   └── config_test.rs         # Config loading and migration tests
    └── cli_tests.rs               # CLI argument parsing tests
```

**Acceptance Criteria:**
- All Goose CLI commands compile and run correctly within the new monorepo
- CLI can start an interactive chat session using the unified gateway (any provider)
- CLI can run recipes that involve multiple agent steps across different providers
- CLI can list, create, resume, and delete sessions via the ACP server
- CLI binary starts and displays help text within 50ms on modern hardware
- CLI binary size is under 40MB (stripped) for the full feature set
- `agentic-os doctor --fix` correctly diagnoses and repairs common configuration issues
- All existing Goose CLI integration tests pass in the new structure

**Risk Level:** Medium — Rust codebase is self-contained but needs careful refactoring of provider internals to use unified gateway types

---

### 16.2 Import gemini-cli Interactive CLI as Secondary/Alternative Interface

**Description:**
Gemini-cli's Ink/React-based interactive CLI is imported as a secondary, alternative command-line interface. Unlike the Rust CLI which is optimized for raw speed and minimal dependencies, the gemini-cli CLI leverages the rich React-ink rendering ecosystem to provide sophisticated interactive experiences: animated streaming output, inline file diffs, rich tool confirmation dialogs, scrollable session history, and real-time status indicators. This CLI is particularly valuable for developers who prefer Node.js tooling, want to extend the CLI with React components, or need the interactive affordances that are cumbersome to implement in a pure terminal UI. The gemini-cli CLI shares its core agent session management, configuration, and tool execution logic with the Rust CLI but renders through Ink rather than raw ANSI escape codes. Key components to import include the interactive CLI session wrapper (`interactiveCli.tsx`), the non-interactive mode (`nonInteractiveCli.ts`), the input prompt system, the tool confirmation queue with visual diff display, the output redirection system, and the theme engine with all 20+ built-in themes. The gemini-cli CLI is exposed via `agentic-os chat --interactive` or as the default when running in a rich terminal, while `agentic-os chat --simple` uses the Rust CLI. Both CLIs can be swapped at runtime. The gemini-cli CLI also brings the OTEL telemetry integration, React DevTools support for debugging, and the comprehensive CLI documentation system.

**Copy Source:** gemini-cli — `packages/cli/src/` (TypeScript/React/Ink)

**Key Files to Create/Modify:**
```
apps/cli-interactive/
├── package.json                   # Package manifest with ink, react, oTel deps
├── tsconfig.json                  # TypeScript config for React/JSX
├── src/
│   ├── index.tsx                  # Entry point, CLI binary launcher
│   ├── gemini.tsx                 # Main App component (Ink rendering root)
│   ├── interactiveCli.tsx         # Interactive session wrapper component
│   ├── nonInteractiveCli.ts       # Non-interactive (pipe/CI) mode
│   ├── nonInteractiveCliCommands.ts # Non-interactive command routing
│   ├── nonInteractiveCliAgentSession.ts # Agent session binding for non-interactive
│   ├── validateNonInterActiveAuth.ts # Auth validation for CI mode
│   ├── output-redirection.ts      # Output to file/pipe handling
│   ├── deferred.ts                # Deferred rendering utilities
│   ├── deferred.test.ts           # Tests for deferred rendering
│   ├── commands/
│   │   ├── index.ts               # Command registry
│   │   ├── chat.ts                # Chat command handler
│   │   ├── session.ts             # Session management
│   │   ├── config.ts              # Configuration management
│   │   └── tool.ts                # Tool execution commands
│   ├── config/
│   │   ├── index.ts               # Config loading (shared schema)
│   │   ├── provider.ts            # Provider selection UI
│   │   └── theme.ts               # Theme configuration
│   ├── services/
│   │   ├── agent-service.ts       # Agent session service (ACP client)
│   │   ├── gateway-service.ts     # Gateway health/status service
│   │   └── telemetry-service.ts   # OTEL telemetry integration
│   ├── ui/
│   │   ├── components/
│   │   │   ├── InputPrompt.tsx    # Rich input prompt with autocomplete
│   │   │   ├── ToolConfirmationQueue.tsx # Tool call confirmation with diffs
│   │   │   ├── StreamingOutput.tsx # Animated streaming text display
│   │   │   ├── SessionList.tsx    # Scrollable session list
│   │   │   ├── DiffViewer.tsx     # Inline file diff display
│   │   │   ├── StatusBar.tsx      # Status indicators (model, provider, cost)
│   │   │   ├── ProgressIndicator.tsx # Spinner/progress for long operations
│   │   │   └── ErrorDisplay.tsx   # Structured error presentation
│   │   ├── hooks/
│   │   │   ├── useSession.ts      # Session state management
│   │   │   ├── useStreaming.ts    # Streaming text hook with cursor management
│   │   │   ├── useTheme.ts        # Theme hook
│   │   │   └── useKeybindings.ts  # Custom keybinding handling
│   │   ├── themes/
│   │   │   ├── index.ts           # Theme registry (20+ themes)
│   │   │   ├── default-dark.ts    # Default dark theme
│   │   │   ├── default-light.ts   # Default light theme
│   │   │   ├── dracula.ts         # Dracula theme
│   │   │   ├── tokyonight.ts      # Tokyo Night theme
│   │   │   ├── solarized-dark.ts  # Solarized dark
│   │   │   ├── solarized-light.ts # Solarized light
│   │   │   ├── github-dark.ts     # GitHub Dark
│   │   │   ├── github-light.ts    # GitHub Light
│   │   │   ├── atom-one-dark.ts   # Atom One Dark
│   │   │   ├── ayu-dark.ts        # Ayu Dark
│   │   │   ├── ayu-light.ts       # Ayu Light
│   │   │   └── custom.ts          # Custom theme loader
│   │   └── utils/
│   │       ├── ansi.ts            # ANSI escape code utilities
│   │       ├── truncate.ts        # Text truncation
│   │       └── format.ts          # Output formatters
│   └── utils/
│       ├── paths.ts               # Config/data path resolution
│       └── platform.ts            # Platform detection
├── test-setup.ts                  # Test environment setup (ink test utils)
└── tests/
    ├── gemini.test.tsx            # App component tests
    ├── gemini_cleanup.test.tsx    # Cleanup/exit tests
    ├── deferred.test.ts           # Deferred rendering tests
    ├── nonInteractiveCli.test.ts  # Non-interactive mode tests
    └── nonInteractiveCliAgentSession.test.ts # Session binding tests
```

**Acceptance Criteria:**
- Interactive CLI starts with Ink rendering and displays chat interface within 1 second
- All 20+ built-in themes render correctly in the terminal
- Tool confirmation queue displays with file diffs for edit operations
- Streaming output renders smoothly with proper cursor management
- Non-interactive mode passes all existing gemini-cli integration tests
- CLI can fall back gracefully to non-interactive mode when terminal doesn't support Ink
- Input prompt supports history navigation, autocomplete, and multi-line editing
- Session history is accessible with scroll, search, and filter capabilities
- All existing gemini-cli unit and integration tests pass in new structure

**Risk Level:** Medium — React Ink rendering is mature but dependency management between Node.js and Rust CLIs needs careful coordination

---

### 16.3 Implement Unified Command Routing (Dispatch to Correct Backend)

**Description:**
The unified command routing layer ensures that both the Rust CLI and the gemini-cli interactive CLI dispatch commands to the correct backend service — whether that's the ACP server for agent sessions, the gateway for provider queries, the MCP registry for tool execution, or the local inference engine for offline operation. This subphase implements a command router that abstracts away the backend communication details behind a consistent interface. The router supports multiple transport mechanisms (stdio for subprocess ACP, HTTP for remote gateway, Unix sockets for local daemon) and automatically selects the optimal transport based on the target service's availability and the user's configuration. For example, if the user runs `agentic-os chat`, the router checks whether the ACP server is running locally (Unix socket), remotely (TCP), or should be spawned as a subprocess. Similarly, `agentic-os gateway status` routes to the gateway health endpoint, while `agentic-os local pull` routes to the local inference manager. The routing layer also handles authentication token injection, request/response serialization, error normalization, and timeout management. A priority system ensures that local daemon connections are preferred over subprocess spawning, which is preferred over remote connections, minimizing latency for the most common use cases. The router is implemented as a shared Rust library (`packages/cli-router/`) that both CLI frontends can use, with TypeScript bindings generated via `wasm-pack` for the gemini-cli CLI.

**Copy Source:** Goose (ACP client patterns) + gemini-cli (agent session client)

**Key Files to Create/Modify:**
```
packages/cli-router/
├── Cargo.toml                     # Rust crate with wasm-pack target
├── src/
│   ├── lib.rs                     # Library entry point
│   ├── router.rs                  # Main command router
│   ├── transports/
│   │   ├── mod.rs
│   │   ├── stdio.rs               # Subprocess stdio transport
│   │   ├── unix_socket.rs         # Unix domain socket transport (local daemon)
│   │   ├── tcp.rs                 # TCP transport (remote services)
│   │   └── http.rs                # HTTP/HTTPS transport (web API)
│   ├── services/
│   │   ├── mod.rs
│   │   ├── acp.rs                 # ACP server client (agent sessions)
│   │   ├── gateway.rs             # Gateway service client
│   │   ├── mcp.rs                 # MCP registry client
│   │   ├── local_inference.rs     # Local inference manager client
│   │   └── dictation.rs           # Dictation service client
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── token_provider.rs      # Token injection for authenticated requests
│   │   └── credential_store.rs    # Encrypted credential retrieval
│   ├── discovery/
│   │   ├── mod.rs
│   │   ├── service_discovery.rs   # Find running services (daemon, socket files)
│   │   └── health_check.rs        # Service health/availability checks
│   ├── error.rs                   # Unified error types for CLI routing
│   └── types.rs                   # Shared types for CLI routing
├── wasm/
│   └── cli_router_bg.wasm         # WASM build for TypeScript CLI
├── bindings/
│   └── cli-router.ts              # TypeScript bindings (auto-generated)
└── tests/
    ├── transport_tests.rs         # Transport layer tests
    ├── service_tests.rs           # Service client tests
    └── integration_tests.rs       # End-to-end routing tests
```

**Acceptance Criteria:**
- Router correctly dispatches `chat`, `run`, `session`, `provider`, `gateway`, `local`, `dictation`, `mitm`, `mcp` commands to appropriate backends
- Transport auto-selection prefers daemon socket > subprocess > remote HTTP
- Router transparently handles service not running by starting it or returning clear error
- Authentication tokens are automatically injected for gateway-protected services
- WASM build compiles and provides TypeScript bindings consumed by gemini-cli
- All routing decisions complete in under 5ms (excluding transport setup)
- Fallback works correctly: if ACP server is unreachable, router attempts subprocess spawn
- Router correctly reports service health for `agentic-os doctor` diagnostics

**Risk Level:** Medium — Cross-language WASM bridge adds complexity but enables code sharing between Rust and TypeScript CLIs

---

### 16.4 Implement Shell Completions (bash, zsh, fish, powershell)

**Description:**
Shell completions are essential for CLI usability, enabling rapid command discovery and parameter completion. This subphase implements comprehensive shell completion generation for bash, zsh, fish, and PowerShell, covering all Agentic OS V4 CLI commands, nested subcommands, option flags, and dynamic argument completion (e.g., provider names, session IDs, recipe names, model identifiers, local file paths). The completion system is built on top of clap's native completion generation (Rust CLI) but extended with custom dynamic completions that query the running system for context-sensitive suggestions. For example, when the user types `agentic-os session resume `, the completions query the ACP server for available sessions and present them as completion candidates. Similarly, `agentic-os provider set ` completes with provider IDs from the unified registry, and `agentic-os local pull ` completes with model names from HuggingFace's model catalog. The completion system supports both static completions (installed via shell-specific mechanisms) and dynamic completions (triggered via a lightweight daemon or shell function). Shell-specific installers are provided: `source <(agentic-os completion bash)` for bash, `source <(agentic-os completion zsh)` for zsh, `agentic-os completion fish | source` for fish, and `agentic-os completion powershell | Out-String | Invoke-Expression` for PowerShell. The completion scripts are also available as installable system packages (e.g., brew completions directory). All completions are tested against each shell's completion specification to ensure correctness.

**Copy Source:** Goose CLI completion patterns + gemini-cli CLI documentation

**Key Files to Create/Modify:**
```
apps/cli/src/commands/completion.rs  # Completion generation command
packages/completions/
├── scripts/
│   ├── generate-all.sh            # Generate all shell completion files
│   ├── install.sh                 # One-shot install for all shells
│   └── uninstall.sh               # Remove installed completions
├── bash/
│   └── agentic-os.bash            # Bash completion script (generated)
├── zsh/
│   ├── _agentic-os                # Zsh completion function (generated)
│   └── _agentic-os.dynamic        # Zsh dynamic completion handler
├── fish/
│   └── agentic-os.fish            # Fish completion script (generated)
└── powershell/
    ├── agentic-os.ps1             # PowerShell completion script (generated)
    └── agentic-os.completion.psm1 # PowerShell module with tab expansion

packages/cli-router/src/completions/
├── mod.rs
├── generator.rs                   # Static completion file generator
├── dynamic.rs                     # Dynamic completion provider
├── bash.rs                        # Bash-specific format
├── zsh.rs                         # Zsh-specific format
├── fish.rs                        # Fish-specific format
└── powershell.rs                  # PowerShell-specific format
```

**Acceptance Criteria:**
- All four shells (bash 4.4+, zsh 5.8+, fish 3.0+, PowerShell 5.1+) have working completions
- Static completions cover all commands, subcommands, and flags
- Dynamic completions work for: provider names, session IDs, recipe names, skill names, model IDs, local file paths
- `agentic-os completion <shell>` generates and outputs correct completion script
- Completion scripts install cleanly via each shell's standard mechanism
- Completions update automatically when new commands/extensions are installed
- Dynamic completions gracefully handle service unavailability (fall back to static only)
- Completions are tested with a matrix of shell versions on Linux, macOS, and Windows

**Risk Level:** Low — Shell completion generation is well-understood; main complexity is dynamic completion queries that must be fast (< 100ms) to avoid shell lag

---

### 16.5 Implement CLI Theming and Configuration

**Description:**
CLI theming and configuration provides a unified look-and-feel across both the Rust CLI and the gemini-cli interactive CLI. This subphase implements a shared theme system that controls color schemes, typography, spacing, icons, progress indicators, and output formatting for all CLI output. The theme system supports the 20+ themes imported from gemini-cli (Dracula, Tokyo Night, Solarized, GitHub, Atom One, Ayu, etc.) plus custom user-defined themes specified in the configuration file or as a CSS/JSON file. Themes are defined declaratively using a common schema that maps semantic tokens (e.g., "info", "warning", "error", "success", "code", "link", "dim", "highlight") to terminal colors, styles, and icons. The theme system works for both the Rust CLI (via ANSI escape sequences with crossterm) and the interactive CLI (via Ink CSS-in-JS), ensuring visual consistency regardless of which CLI interface the user chooses. Additionally, this subphase implements the unified CLI configuration system that loads settings from `~/.config/agentic-os/config.toml` (or `agentic-os.toml` in the project directory), environment variables, and command-line flags — merged with precedence rules. Configuration includes default provider, default model, theme selection, output mode (plain, json, rich), keybindings (for interactive CLI), auto-completion preferences, telemetry opt-in/out, and proxy settings. A `config init` wizard guides users through first-time setup with interactive prompts for essential settings.

**Copy Source:** gemini-cli themes (20+ themes) + Goose CLI config system + OmniRoute2 i18n

**Key Files to Create/Modify:**
```
packages/core/src/config/
├── mod.rs                          # Config module root
├── types.rs                        # Shared config types
├── loader.rs                       # Config loader (merge: file → env → flags)
├── migration.rs                    # Schema migration for config versions
├── schema.rs                       # Config validation schema
├── defaults.rs                     # Default configuration values
└── format/
    ├── mod.rs
    ├── toml.rs                     # TOML config parser
    ├── json.rs                     # JSON config parser
    ├── yaml.rs                     # YAML config parser
    └── env.rs                      # Environment variable loader

packages/core/src/theme/
├── mod.rs                          # Theme module root
├── types.rs                        # Theme token types
├── registry.rs                     # Theme registry (20+ built-in themes)
├── loader.rs                       # Load theme by name or from custom file
├── renderer.rs                     # Apply theme to ANSI/POSIX terminal output
├── ink-adapter.rs                  # Adapt theme for Ink/CSS-in-JS
├── ansi.rs                         # ANSI escape sequence generator
├── icons.rs                        # Icon set (Nerd Font, fallback ASCII)
└── themes/
    ├── mod.rs                      # Theme definitions index
    ├── default_dark.rs
    ├── default_light.rs
    ├── dracula.rs
    ├── tokyonight.rs
    ├── solarized_dark.rs
    ├── solarized_light.rs
    ├── github_dark.rs
    ├── github_light.rs
    ├── atom_one_dark.rs
    ├── ayu_dark.rs
    ├── ayu_light.rs
    ├── shades_of_purple.rs
    ├── holiday_dark.rs
    ├── xcode_light.rs
    ├── google_light.rs
    └── custom.rs                    # Load custom theme from path

packages/core/src/config/cli/
├── mod.rs
├── wizard.rs                       # First-time setup wizard (interactive prompts)
├── provider_wizard.rs              # Provider credential setup guide
└── migration_tool.rs               # Tool to migrate old config formats
```

**Acceptance Criteria:**
- All 20+ themes render identically (modulo terminal capabilities) in both Rust CLI and Ink CLI
- Custom themes can be loaded from `~/.config/agentic-os/themes/custom.toml`
- Configuration loading follows correct precedence: CLI flags > env vars > project config > user config > defaults
- Config wizard guides user through first-time setup with interactive prompts
- Theme tokens cover: text, info, warning, error, success, code, link, dim, highlight, accent, muted, border, progress
- Icons mode supports: Nerd Fonts, Font Awesome, emoji, plain ASCII fallback
- Configuration migration tool handles upgrades between schema versions
- All config fields are validated at load time with clear error messages for invalid values

**Risk Level:** Low — Theming is primarily aesthetic but needs careful testing across terminal emulators (Windows Terminal, iTerm2, Alacritty, Kitty, GNOME Terminal, Konsole, tmux, VS Code integrated terminal)

---

## Phase 17: TUI & Interactive Experience (Weeks 24–27)

### Overview
Phase 17 delivers the full-screen Terminal User Interface (TUI) experience for Agentic OS V4. The primary TUI is built with Rust and ratatui, providing a fast, keyboard-driven dashboard for managing agents, sessions, providers, and gateway operations. The secondary TUI leverages gemini-cli's Ink-based React rendering for rich interactive components. Both TUIs share a common data layer and session management system. This phase also implements the session viewer and history browser, real-time streaming display with syntax highlighting, and multi-session management — enabling users to run multiple concurrent agent sessions with instant switching. The TUI is designed for power users who need real-time visibility into agent operations without leaving the terminal.

---

### 17.1 Import Goose TUI (Rust, ratatui) as Primary TUI

**Description:**
The Goose Rust TUI, built with ratatui (the leading Rust terminal UI framework), is imported as the primary full-screen terminal interface for Agentic OS V4. The TUI provides a comprehensive dashboard with tabbed views for chat sessions, session management, running agents (with DAG visualization), gateway status, provider health, skill browsing, recipe execution, live logs, analytics charts, and settings configuration. Each tab is an independently scrollable, keyboard-navigable view that connects to the appropriate backend service through the unified CLI router. The chat tab provides a rich interactive experience with streaming text output, markdown rendering with syntax highlighting, inline file diffs, tool confirmation dialogs, and progress indicators. The TUI is designed for a 80x24 minimum terminal size but scales gracefully to any terminal dimensions with responsive layout. All interactions are keyboard-driven with vim-like keybindings (configurable), though mouse support is included for scrolling and tab selection. The TUI uses tokio for async I/O and communicates with the ACP server, gateway, MCP registry, and local daemon through the shared CLI router library. Performance targets include sub-10ms render times and 60fps refresh during streaming output. The TUI binary shares the Rust workspace with the CLI, sharing all core types, configuration, and service clients.

**Copy Source:** Goose — `ui/text/src/` (Rust ratatui)

**Key Files to Create/Modify:**
```
apps/tui/
├── Cargo.toml                     # Package manifest with ratatui, crossterm, tokio
├── src/
│   ├── main.rs                    # Entry point, terminal initialization
│   ├── app.rs                     # Application state, event loop, render loop
│   ├── event.rs                   # Event handling (keyboard, mouse, resize, async)
│   ├── tabs/
│   │   ├── mod.rs                 # Tab registry and navigation
│   │   ├── chat.rs                # Chat tab: streaming conversation display
│   │   ├── sessions.rs            # Session tab: list, search, filter, manage
│   │   ├── agents.rs              # Agents tab: running agents, DAG view
│   │   ├── gateway.rs             # Gateway tab: status, routing table, health
│   │   ├── providers.rs           # Providers tab: health, models, rate limits
│   │   ├── skills.rs              # Skills tab: browse, install, update
│   │   ├── recipes.rs             # Recipes tab: list, run, monitor execution
│   │   ├── logs.rs                # Logs tab: live streaming logs with filter
│   │   ├── analytics.rs           # Analytics tab: charts (unicode, braille)
│   │   ├── local.rs               # Local models tab: models, inference stats
│   │   ├── mitm.rs                # MITM tab: proxy status, intercepted requests
│   │   ├── mcp.rs                 # MCP tab: registered servers, tools, resources
│   │   └── settings.rs            # Settings tab: config editor
│   ├── components/
│   │   ├── mod.rs
│   │   ├── streaming.rs           # Streaming text display with cursor
│   │   ├── markdown.rs            # Markdown renderer (syntax highlighting)
│   │   ├── diff.rs                # Inline file diff viewer
│   │   ├── input.rs               # Input bar with prompt
│   │   ├── status_bar.rs          # Status bar (provider, model, session info)
│   │   ├── tabs.rs                # Tab bar
│   │   ├── table.rs               # Generic data table component
│   │   ├── list.rs                # Scrollable list component
│   │   ├── tree.rs                # Tree view component (DAG, MCP hierarchy)
│   │   ├── chart.rs               # ASCII/braille chart component
│   │   ├── progress.rs            # Progress bar/spinner component
│   │   ├── confirm.rs             # Tool confirmation dialog
│   │   ├── modal.rs               # Modal dialog component
│   │   ├── search.rs              # Search/filter bar component
│   │   └── help.rs                # Keybinding help overlay
│   ├── state/
│   │   ├── mod.rs
│   │   ├── chat.rs                # Chat session state
│   │   ├── sessions.rs            # Session list state
│   │   ├── agents.rs              # Agent monitoring state
│   │   └── settings.rs            # Settings editor state
│   ├── keybindings/
│   │   ├── mod.rs
│   │   ├── default.rs             # Default vim-like keybindings
│   │   └── custom.rs              # Custom keybinding loader
│   └── utils/
│       ├── mod.rs
│       ├── layout.rs              # Responsive layout calculations
│       ├── color.rs               # Theme-aware color handling
│       └── async_util.rs          # Async utility helpers
├── build.rs
└── tests/
    ├── render_tests.rs            # Snapshot render tests for each tab
    ├── navigation_tests.rs        # Tab navigation and keybinding tests
    └── streaming_tests.rs         # Streaming display performance tests
```

**Acceptance Criteria:**
- TUI starts, renders the dashboard, and is fully keyboard-navigable within 200ms
- Chat tab renders streaming text with proper cursor management and no flickering
- Markdown rendering supports: headings, lists, code blocks with syntax highlighting, tables, links, images (as text)
- File diff viewer shows clear before/after with line numbers and color coding
- Tab switching is instantaneous (< 10ms)
- All tabs connect to and display data from their respective backend services
- TUI handles terminal resize events gracefully with responsive layout
- Keybindings include: vim navigation (hjkl), tab switching (Tab/Shift+Tab), search (/), quit (q), help (?)
- TUI runs at minimum 30fps during streaming, 60fps idle on modern hardware
- All existing Goose TUI integration tests pass in the new monorepo structure

**Risk Level:** Medium — Ratatui is actively maintained but complex asynchronous state management requires careful architecture to avoid render artifacts

---

### 17.2 Import gemini-cli Ink-based React Rendering as Alternative TUI

**Description:**
Gemini-cli's Ink-based React rendering engine provides an alternative TUI experience that leverages the full React ecosystem for rich component development. Unlike the ratatui TUI which is pixel-perfect and performant, the Ink TUI excels at rendering complex React components — such as the interactive tool confirmation queue with expandable diffs, the input prompt with syntax-highlighted autocomplete, the animated streaming display with word-by-word fade-in, and the session sidebar with real-time status indicators. This subphase imports the core Ink rendering infrastructure, React component library, and component state management from gemini-cli. The Ink TUI is launched via `agentic-os tui --renderer ink` (default is ratatui) and shares the same service clients, configuration, and theme system as the ratatui TUI. The component architecture follows React patterns: each tab is a React component with its own state management (useReducer or Zustand), effects for data fetching (via the CLI router service clients), and re-rendering optimized with React.memo and useMemo. The Ink TUI also provides the React DevTools integration for debugging component state and performance — a significant advantage for TUI development. Key components to import include the streaming output component (with typewriter animation), the tool confirmation queue (with expandable JSON and diff views), the session history browser (with infinite scroll), and the settings editor (with real-time validation feedback).

**Copy Source:** gemini-cli — `packages/cli/src/ui/` (Ink/React components)

**Key Files to Create/Modify:**
```
apps/tui-ink/
├── package.json                   # Package manifest with ink, react, zustand
├── tsconfig.json
├── src/
│   ├── index.tsx                  # Entry point, Ink renderer initialization
│   ├── App.tsx                    # Root App component (tab container, theme provider)
│   ├── tabs/
│   │   ├── ChatTab.tsx            # Chat tab (streaming conversation)
│   │   ├── SessionsTab.tsx        # Session management tab
│   │   ├── GatewayTab.tsx         # Gateway status tab
│   │   ├── ProvidersTab.tsx       # Provider management tab
│   │   ├── SettingsTab.tsx        # Settings editor tab
│   │   └── AnalyticsTab.tsx       # Analytics tab (Ink-chart)
│   ├── components/
│   │   ├── InputPrompt.tsx        # Rich input prompt with autocomplete
│   │   ├── ToolConfirmationQueue.tsx # Tool confirmation with diffs
│   │   ├── StreamingOutput.tsx    # Animated streaming text
│   │   ├── SessionList.tsx        # Session history browser
│   │   ├── StatusBar.tsx          # Status bar component
│   │   ├── DiffViewer.tsx         # Inline diff viewer
│   │   ├── ProgressBar.tsx        # Progress bar
│   │   ├── Spinner.tsx            # Loading spinner
│   │   ├── ErrorBoundary.tsx      # Error boundary for component crashes
│   │   └── KeybindingsHelp.tsx    # Help overlay
│   ├── hooks/
│   │   ├── useStreaming.ts        # Streaming text hook
│   │   ├── useSession.ts          # Session state hook
│   │   ├── useTheme.ts            # Theme hook (shared with CLI)
│   │   ├── useServices.ts         # Backend service clients
│   │   └── useKeybindings.ts      # Keyboard input handling
│   ├── stores/
│   │   ├── sessionStore.ts        # Zustand session store
│   │   ├── gatewayStore.ts        # Gateway status store
│   │   └── settingsStore.ts       # Settings store
│   ├── services/
│   │   ├── cliRouter.ts           # CLI router client (wasm bindings)
│   │   ├── telemetry.ts           # OTEL telemetry integration
│   │   └── devtools.ts            # React DevTools bridge
│   ├── themes/
│   │   ├── ThemeProvider.tsx       # Theme context provider
│   │   └── styles.ts              # CSS-in-JS styles per theme
│   └── utils/
│       ├── ansi.ts                # ANSI rendering utilities
│       ├── format.ts              # Output formatters
│       └── platform.ts            # Platform detection
├── test-setup.ts
└── tests/
    ├── App.test.tsx               # App render tests
    ├── StreamingOutput.test.tsx    # Streaming component tests
    ├── ToolConfirmationQueue.test.tsx # Confirmation queue tests
    └── hooks.test.tsx             # Hook tests
```

**Acceptance Criteria:**
- Ink TUI renders all tab views without runtime errors
- Streaming component achieves smooth character-by-character animation at 60fps
- Tool confirmation queue displays with expandable diff views for file edits
- Input prompt supports: text entry, history navigation, autocomplete suggestions, multi-line editing
- Theme system produces identical colors to the Rust CLI and ratatui TUI
- React DevTools connection works for debugging component state and performance
- Error boundaries catch and display component crashes without crashing the TUI
- All gemini-cli Ink components pass rendering tests in the new TUI structure

**Risk Level:** Medium — Ink rendering in Node.js is well-tested but the dual-TUI architecture (Rust + Node) adds maintenance overhead; some components may need adaptation for the unified service layer

---

### 17.3 Implement Session Viewer and History Browser

**Description:**
The session viewer and history browser provides comprehensive visibility into all past and current agent sessions across both TUIs. This subphase implements a shared session storage layer (backed by SQLite via the Goose session manager) that records every interaction: user messages, assistant responses, tool calls and results, metadata (provider, model, cost, tokens, latency), and session-level information (start time, end time, tags, project context). The session viewer in both TUIs provides a searchable, filterable list with preview capabilities. Users can search by content (full-text search across all messages), filter by provider, model, date range, tags, and project, and sort by any column. The session detail view shows the full conversation transcript with the same rendering as the live chat (markdown, syntax highlighting, diff display) plus metadata panels showing cost breakdown, token usage over time, provider/model used per message, and latency breakdown. Sessions can be exported to JSON, Markdown, HTML, or PDF formats. The session viewer supports batch operations: delete, archive, export, and retag. A session comparison view allows side-by-side comparison of two sessions (useful for A/B testing different models or provider configurations). The session browser also integrates with the recipe system, showing which recipe produced each session and allowing replay of a session through the same recipe. Sessions are stored with encryption at rest (AES-256-GCM) for sensitive conversations, with configurable retention policies and automatic archiving.

**Copy Source:** Goose (session management) + gemini-cli (session history)

**Key Files to Create/Modify:**
```
packages/session-store/
├── Cargo.toml                     # Rust crate with rusqlite
├── src/
│   ├── lib.rs                     # Library entry point
│   ├── store.rs                   # Main session store (SQLite)
│   ├── migration.rs               # Schema migration
│   ├── models/
│   │   ├── mod.rs
│   │   ├── session.rs             # Session model
│   │   ├── message.rs             # Message model (user, assistant, tool)
│   │   ├── tool_call.rs           # Tool call model
│   │   └── metadata.rs            # Session metadata (cost, tokens, provider)
│   ├── queries/
│   │   ├── mod.rs
│   │   ├── search.rs              # Full-text search queries
│   │   ├── filter.rs              # Filter query builder
│   │   └── aggregation.rs         # Aggregation queries (cost over time, etc.)
│   ├── encryption.rs              # AES-256-GCM encryption for sensitive sessions
│   ├── export.rs                  # Export to JSON, Markdown, HTML, PDF
│   ├── retention.rs               # Retention policy engine (TTL, size limits)
│   └── sync.rs                    # Optional cloud sync (future: multi-device)
├── schemas/
│   ├── 001_initial.sql            # Initial schema
│   └── 002_fulltext.sql           # FTS5 full-text search indexes
└── tests/
    ├── store_tests.rs             # CRUD operations tests
    ├── search_tests.rs            # Full-text search tests
    ├── export_tests.rs            # Export format tests
    └── encryption_tests.rs        # Encryption/decryption tests

apps/tui/src/tabs/sessions.rs      # Ratatui session viewer tab
apps/tui-ink/src/tabs/SessionsTab.tsx # Ink session viewer tab
apps/cli/src/commands/session.rs   # CLI session commands (enhanced)
```

**Acceptance Criteria:**
- All session interactions are recorded to SQLite with full message history
- Full-text search across all sessions returns results in under 100ms for 10k+ sessions
- Filtering by provider, model, date range, tags, and project works correctly
- Session detail view shows full conversation with proper rendering (markdown, syntax highlighting, diffs)
- Session comparison view allows side-by-side comparison of any two sessions
- Export to JSON, Markdown, HTML, and PDF produces complete, well-formatted output
- Encrypted sessions cannot be read without the correct decryption key
- Retention policies correctly archive and purge old sessions based on configurable rules
- Batch operations (delete, archive, export, retag) work on selected sessions

**Risk Level:** Low — SQLite-based session storage is well-understood; main complexity is full-text search performance at scale and encryption key management

---

### 17.4 Implement Real-Time Streaming Display with Syntax Highlighting

**Description:**
Real-time streaming display with syntax highlighting is a critical UX feature for both TUIs, enabling users to see agent responses as they are generated rather than waiting for complete output. This subphase implements a unified streaming display engine that works in both the ratatui TUI (Rust) and the Ink TUI (TypeScript). The streaming engine handles multiple simultaneous streams (for parallel tool calls or multi-agent scenarios), each rendered in its own panel or as interleaved messages with clear source attribution. Streaming text is rendered character-by-character or word-by-word (configurable) with smooth cursor management. Code blocks within streaming responses are detected in real-time and syntax-highlighted using tree-sitter (Rust) or highlight.js (TypeScript) — the user sees code forming with proper coloring from the first line. The streaming engine supports multiple content types: text (with markdown formatting applied incrementally), code (with syntax highlighting), tool calls (with parameter display), tool results (with content truncation and expand), images (with ASCII art preview or metadata display), and error messages (with distinct styling). The engine also handles mid-stream corrections (when the model edits previously generated text, common with speculative decoding or chain-of-thought models) by applying smooth text replacement rather than jarring jumps. Performance is critical: the streaming engine must handle 200+ tokens/second throughput without frame drops, using a double-buffered rendering approach in ratatui and batched state updates in React.

**Copy Source:** Goose (streaming display) + gemini-cli (streaming components)

**Key Files to Create/Modify:**
```
packages/streaming-engine/
├── Cargo.toml                     # Rust crate
├── src/
│   ├── lib.rs                     # Library entry point
│   ├── stream.rs                  # Stream processing pipeline
│   ├── buffer.rs                  # Stream buffer with backpressure
│   ├── parser.rs                  # Incremental content type detection
│   ├── tokenizer.rs               # Token-aware text splitting
│   ├── renderer.rs                # Abstract renderer trait
│   ├── types.rs                   # Shared types (StreamChunk, ContentType)
│   ├── syntax/
│   │   ├── mod.rs
│   │   ├── highlighter.rs         # Syntax highlighting interface
│   │   ├── tree_sitter.rs         # Tree-sitter-based highlighting (Rust)
│   │   └── languages.rs           # Language detection and grammar loading
│   └── ansi.rs                    # ANSI escape code generation for styled text
├── wasm/
│   ├── streaming-engine.wasm       # WASM build for TypeScript TUI
│   └── streaming-engine.ts         # TypeScript bindings
└── tests/
    ├── stream_tests.rs            # Stream processing tests
    ├── parser_tests.rs            # Content type detection tests
    ├── syntax_tests.rs            # Syntax highlighting correctness tests
    └── performance_tests.rs       # Throughput benchmarks

apps/tui/src/components/streaming.rs    # Ratatui streaming component
apps/tui-ink/src/components/StreamingOutput.tsx # Ink streaming component
```

**Acceptance Criteria:**
- Streaming display renders text at 200+ tokens/second without visible stutter or frame drops
- Code blocks are detected incrementally and syntax-highlighted in real-time
- Syntax highlighting supports: Rust, TypeScript, Python, JavaScript, Go, Java, C++, SQL, HTML, CSS, JSON, YAML, TOML, Markdown, Bash, Dockerfile (at minimum)
- Multiple simultaneous streams render correctly in separate panels
- Mid-stream text corrections render smoothly without visual jumps
- Tool calls are displayed inline with parameters as they stream in
- Word-by-word and character-by-character animation modes both work correctly
- WASM build provides identical output formatting for the Ink TUI
- Markdown rendering (bold, italic, links, lists, tables, headings) applies incrementally during streaming

**Risk Level:** Medium — Incremental syntax highlighting with tree-sitter is complex; mid-stream text corrections require careful diff-based rendering to avoid visual artifacts

---

### 17.5 Implement Multi-Session Management in TUI

**Description:**
Multi-session management enables users to run multiple concurrent agent sessions within the TUI, switching between them instantly and monitoring their progress simultaneously. This subphase implements a session manager that maintains a pool of active agent sessions, each with its own conversation context, tool execution queue, streaming state, and metadata. The TUI displays a session sidebar or tab bar showing all active sessions with status indicators (active/paused/waiting_on_tool/error), the current provider and model, elapsed time, and running cost. Users can create new sessions (with optional recipe/skill preloading), switch between sessions with keyboard shortcuts or mouse clicks, pause/resume sessions, fork a session (creating a copy at a specific point for experimentation), merge sessions (combining multiple sessions into a conversation), and attach/detach sessions to projects. The session manager communicates with the ACP server's session endpoints for lifecycle management, and each active session maintains its own WebSocket or SSE connection for real-time updates. Resource management is critical: the TUI must handle dozens of concurrent sessions without excessive memory usage. Sessions that are not in the foreground are paused at the application level (buffering updates but not rendering them) and resumed when brought to the foreground. The multi-session view also supports a grid layout showing multiple sessions simultaneously in a tiled or stacked arrangement, enabling users to monitor several agent conversations at once.

**Copy Source:** Goose (session manager) + gemini-cli (session management)

**Key Files to Create/Modify:**
```
apps/tui/src/state/session_manager.rs   # Multi-session state manager
apps/tui/src/components/session_sidebar.rs # Session sidebar component
apps/tui/src/tabs/sessions.rs           # Sessions tab (enhanced with multi-session)

apps/tui-ink/src/stores/sessionStore.ts   # Zustand multi-session store
apps/tui-ink/src/components/SessionSidebar.tsx # Session sidebar component
apps/tui-ink/src/tabs/SessionsTab.tsx     # Sessions tab (enhanced)

packages/session-store/src/manager.rs     # Multi-session lifecycle manager
packages/session-store/src/pool.rs        # Session connection pool
packages/session-store/src/resource.rs    # Resource tracking (memory, connections)
```

**Acceptance Criteria:**
- User can create, pause, resume, and switch between multiple concurrent agent sessions
- Session sidebar shows all active sessions with status, model, elapsed time, and cost
- Foreground/background session management correctly buffers background session updates
- Grid/tiled layout displays 2-4 sessions simultaneously with proportional terminal space
- Forking a session creates an independent copy at the specified point in history
- Merging sessions combines their conversation histories into a single view
- Resource manager prevents memory exhaustion with >20 concurrent sessions
- Session switching is instant (< 50ms) with no visible state swap delay
- Sessions persist across TUI restarts (resumed from the SQLite session store)

**Risk Level:** Medium — Concurrent session management with real-time state synchronization is complex; resource limits and backpressure mechanisms need careful design

---

## Phase 18: Desktop Application (Weeks 27–30)

### Overview
Phase 18 delivers the native desktop application for Agentic OS V4, built with Tauri 2.0 (Rust backend) and React (frontend). The desktop app combines the best of Goose's desktop implementation with gemini-cli's React rendering to provide a polished, native-feeling experience on Windows, macOS, and Linux. Key features include system tray integration with quick actions, native notifications for events and alerts, a local-first offline mode that works without internet connectivity, comprehensive settings and preferences UI with real-time validation, and an auto-update mechanism that keeps the app current across all platforms. The desktop app is the primary interface for non-technical users and provides the most polished experience, with smooth animations, native dialogs, drag-and-drop, clipboard integration, and global hotkeys.

---

### 18.1 Set Up Tauri + React Desktop Shell

**Description:**
The Tauri + React desktop shell provides the native application container for Agentic OS V4. Tauri 2.0 is chosen over Electron for its significantly smaller bundle size (~5MB vs ~150MB), lower memory usage (~30MB idle vs ~150MB), native performance (Rust backend), and stronger security model (capability-based permissions, no Node.js in renderer). This subphase sets up the Tauri project structure with the Rust backend (responsible for system integration: window management, tray icon, global hotkeys, native dialogs, file system access, auto-update) and the React frontend (responsible for rendering the UI: chat interface, settings pages, provider configuration, analytics dashboards, etc.). The Tauri backend reuses the shared Rust libraries from the CLI and TUI: the CLI router for service communication, the session store for local persistence, the configuration loader, and the theme engine. The React frontend shares components with the Ink TUI where possible (the streaming display, markdown renderer, diff viewer, etc.) but uses native DOM rendering for richer interactivity, animations, and layout flexibility. The desktop shell supports multiple windows (separate chat window, settings window, monitor window) and can be launched in background mode (tray only, no main window) for always-on operation. Communication between the React frontend and the Rust backend uses Tauri's IPC bridge with TypeScript-safe command definitions. The frontend is built with Vite + React 18 + TypeScript and styled with Tailwind CSS + shadcn/ui components.

**Copy Source:** Goose (Tauri desktop) + gemini-cli (React components) + V3 (OS pages)

**Key Files to Create/Modify:**
```
apps/desktop/
├── package.json                     # Frontend dependencies (React, Tailwind, shadcn)
├── tsconfig.json                    # TypeScript configuration
├── vite.config.ts                   # Vite build configuration
├── tailwind.config.ts               # Tailwind CSS configuration
├── index.html                       # HTML entry point
├── src-tauri/
│   ├── Cargo.toml                   # Rust backend dependencies
│   ├── tauri.conf.json              # Tauri configuration (window, tray, permissions)
│   ├── capabilities/
│   │   └── default.json             # Tauri 2.0 capability permissions
│   ├── icons/                       # App icons (all required sizes)
│   ├── src/
│   │   ├── main.rs                  # Tauri main entry point
│   │   ├── lib.rs                   # Library entry with command registration
│   │   ├── commands.rs              # Tauri IPC commands (frontend → backend)
│   │   ├── tray.rs                  # System tray setup and event handling
│   │   ├── window.rs                # Window management (create, hide, focus)
│   │   ├── hotkeys.rs               # Global hotkey registration
│   │   ├── notifications.rs         # Native notification dispatching
│   │   ├── autoupdate.rs            # Auto-update integration
│   │   ├── file_dialogs.rs          # Native file open/save dialogs
│   │   ├── clipboard.rs             # Clipboard read/write
│   │   ├── services.rs              # Background service manager
│   │   ├── config.rs                # Desktop-specific configuration
│   │   └── platform.rs              # Platform-specific implementations
│   └── build.rs                     # Build-time configuration
├── src/
│   ├── main.tsx                     # React entry point
│   ├── App.tsx                      # Root App component with routing
│   ├── routes.tsx                   # Route definitions
│   ├── components/
│   │   ├── ui/                      # shadcn/ui base components
│   │   │   ├── button.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── table.tsx
│   │   │   ├── card.tsx
│   │   │   ├── sheet.tsx
│   │   │   └── toast.tsx
│   │   ├── chat/
│   │   │   ├── ChatView.tsx         # Main chat interface
│   │   │   ├── MessageList.tsx      # Conversation message list
│   │   │   ├── MessageBubble.tsx    # Individual message bubble
│   │   │   ├── StreamingText.tsx    # Streaming text component
│   │   │   ├── InputArea.tsx        # Message input with attachments
│   │   │   ├── ToolConfirmation.tsx # Tool confirmation dialog
│   │   │   └── TokenCounter.tsx     # Token usage display
│   │   ├── sessions/
│   │   │   ├── SessionList.tsx      # Session history panel
│   │   │   └── SessionDetail.tsx    # Session detail view
│   │   ├── settings/
│   │   │   ├── SettingsLayout.tsx   # Settings page layout
│   │   │   ├── GeneralSettings.tsx  # General preferences
│   │   │   ├── ProviderSettings.tsx # Provider configuration
│   │   │   ├── ModelSettings.tsx    # Model preferences
│   │   │   ├── ThemeSettings.tsx    # Theme selection and preview
│   │   │   ├── Keybindings.tsx      # Keyboard shortcuts configuration
│   │   │   ├── ProxySettings.tsx    # Network proxy configuration
│   │   │   ├── StorageSettings.tsx  # Storage and session retention
│   │   │   ├── TelemetrySettings.tsx # Privacy and telemetry
│   │   │   └── AdvancedSettings.tsx # Advanced configuration
│   │   ├── gateway/
│   │   │   ├── GatewayDashboard.tsx # Gateway status and metrics
│   │   │   ├── RoutingConfig.tsx    # Visual routing configuration
│   │   │   └── ProviderHealth.tsx   # Provider health monitoring
│   │   ├── agents/
│   │   │   ├── AgentList.tsx        # Running agents list
│   │   │   ├── AgentDetail.tsx      # Agent detail with DAG view
│   │   │   └── AgentMonitor.tsx     # Real-time agent monitoring
│   │   ├── analytics/
│   │   │   ├── UsageDashboard.tsx   # Usage charts and graphs
│   │   │   ├── CostTracker.tsx      # Cost tracking and budgets
│   │   │   └── Performance.tsx      # Performance metrics
│   │   └── layout/
│   │       ├── Sidebar.tsx          # App sidebar navigation
│   │       ├── TopBar.tsx           # Top bar with search and status
│   │       ├── StatusBar.tsx        # Bottom status bar
│   │       └── TrayMenu.tsx         # System tray menu definition
│   ├── hooks/
│   │   ├── useTauriEvents.ts       # Tauri event listener hook
│   │   ├── useGateway.ts           # Gateway connection hook
│   │   ├── useSession.ts           # Session management hook
│   │   ├── useSettings.ts          # Settings state hook
│   │   ├── useTheme.ts             # Theme hook
│   │   └── useAutoUpdate.ts        # Auto-update state hook
│   ├── lib/
│   │   ├── api.ts                  # Tauri IPC command wrappers
│   │   ├── router.ts               # CLI router integrations
│   │   ├── theme.ts                # Theme application to DOM
│   │   └── utils.ts                # Shared utilities
│   ├── stores/
│   │   ├── appStore.ts             # Global app state (Zustand)
│   │   ├── sessionStore.ts         # Session state
│   │   └── gatewayStore.ts         # Gateway state
│   └── styles/
│       ├── globals.css              # Global styles (Tailwind base)
│       └── themes.css              # CSS custom properties for themes
├── public/
│   └── fonts/                      # Bundled fonts (Inter, JetBrains Mono)
└── tests/
    ├── frontend/
    │   ├── ChatView.test.tsx        # Chat interface tests
    │   └── Settings.test.tsx        # Settings page tests
    └── backend/
        ├── commands_test.rs         # Tauri command tests
        └── tray_test.rs             # Tray integration tests
```

**Acceptance Criteria:**
- Desktop app launches, displays React UI, and communicates with Rust backend via Tauri IPC
- App bundle size is under 15MB (Windows .msi, macOS .dmg, Linux .AppImage)
- Memory usage is under 50MB idle, under 150MB during active agent sessions
- Window management works: create new window, close to tray, restore from tray
- Multiple windows (chat, settings, monitor) can be opened simultaneously
- Frontend-backend communication works for all defined IPC commands
- App starts in background mode (tray only) when launched with `--background`
- All shadcn/ui components render correctly and are keyboard-accessible

**Risk Level:** Medium — Tauri 2.0 is relatively new and some platform-specific behaviors (especially on Linux with Wayland) may require workarounds

---

### 18.2 Implement Desktop Tray Integration and Notifications

**Description:**
System tray integration provides quick access to Agentic OS V4 functionality without needing the main window open. The tray icon shows connection status (connected/disconnected/error), active session count, and unread notification count. The tray menu provides: quick agent query (opens a small popup input), session controls (list active sessions, switch between them, pause/resume), provider health summary, recent notifications, quick settings access, and quit. Native notifications alert users to important events: tool calls requiring confirmation (when in background mode), session completion, errors that need attention, budget threshold warnings, auto-update availability, and provider health changes. Notifications use the platform-native notification system (Windows Toast, macOS Notifications, Linux D-Bus/Notify) with action buttons where supported (Approve, Dismiss, Open Session, etc.). A "Do Not Disturb" mode suppresses all notifications during focus time. The tray also provides a global hotkey (configurable, default Ctrl+Shift+Space) that opens a quick-input popup for instant agent queries from any application — mimicking the UX of Spotlight/Alfred with an AI agent backend. The quick-input popup is a lightweight window (no toolbar, no decorations) that accepts text input, sends it to the active/default agent session, and shows the response inline or as a notification.

**Copy Source:** Goose (tray integration) + gemini-cli (notifications)

**Key Files to Create/Modify:**
```
apps/desktop/src-tauri/src/
├── tray.rs                         # Tray icon, menu, event handling
├── notifications.rs                # Native notification dispatching
├── hotkeys.rs                      # Global hotkey registration
├── quick_input.rs                  # Quick-input popup window
└── events.rs                       # Event system for tray+notification triggers

apps/desktop/src/
├── components/layout/
│   ├── TrayMenu.tsx                 # Tray menu configuration
│   └── QuickInput.tsx               # Quick-input popup component
├── hooks/
│   ├── useNotifications.ts          # Notification state hook
│   └── useGlobalHotkey.ts          # Global hotkey registration hook
└── lib/
    └── notifications.ts            # Notification channel management
```

**Acceptance Criteria:**
- Tray icon displays connection status and updates in real-time
- Tray menu provides: quick query, session list, provider health, settings, quit
- Native notifications display for: tool confirmations, session completion, errors, budget warnings, updates
- Notifications include action buttons where the platform supports them
- "Do Not Disturb" mode suppresses all notifications when enabled
- Global hotkey (default Ctrl+Shift+Space) opens quick-input popup from any application
- Quick-input popup accepts text, sends to current session, and displays response
- Tray icon shows unread notification badge count

**Risk Level:** Low — Tray integration and notifications are well-supported by Tauri; main complexity is platform-specific notification behavior (especially Windows Toast and Linux D-Bus)

---

### 18.3 Implement Local-First Offline Mode

**Description:**
Local-first offline mode ensures that Agentic OS V4 remains functional even without internet connectivity. This subphase implements a comprehensive offline capability layer that gracefully degrades features based on available resources (local models, cached data, etc.). When online, the system pre-caches essential data: provider configurations, model metadata, MCP server definitions, recipe catalogs, skill manifests, and frequently used sessions. When the network is unavailable, the system automatically switches to offline mode, using local inference (llama.cpp/Ollama) for agent reasoning, local MCP servers for tool execution, and cached provider metadata for configuration. The offline mode provides a clear UI indicator of connection status and available features. Users can view and search cached sessions, run recipes that depend only on local tools, execute skills that don't require remote APIs, and configure local-only providers. When the network returns, the system seamlessly reconnects, syncs any locally generated data (session records, usage metrics), and resumes background services. The offline mode also supports a "queue and sync" pattern: operations that require network connectivity (e.g., API calls to remote providers) are queued and executed when connectivity is restored. The queue is visible to the user with status indicators for each pending operation. Conflict resolution handles cases where local and remote state diverged during offline operation.

**Copy Source:** Goose (offline/cached mode) + gemini-cli (local model routing)

**Key Files to Create/Modify:**
```
packages/core/src/offline/
├── mod.rs                          # Offline module root
├── manager.rs                      # Offline mode state machine and lifecycle
├── detector.rs                     # Network connectivity detection
├── cache.rs                        # Offline cache manager
│   ├── provider_cache.rs           # Cached provider configurations
│   ├── model_cache.rs              # Cached model metadata and pricing
│   ├── session_cache.rs            # Cached session data for offline viewing
│   └── recipe_cache.rs             # Cached recipe definitions
├── queue.rs                        # Operation queue (for deferred network operations)
├── sync.rs                         # Synchronization engine on reconnect
├── conflict.rs                     # Conflict resolution strategies
└── capabilities.rs                 # Feature capability matrix (online vs offline)

apps/desktop/src/
├── components/
│   └── status/
│       └── ConnectionStatus.tsx    # Connection status indicator
├── hooks/
│   ├── useConnectivity.ts          # Connectivity state hook
│   └── useOfflineQueue.ts          # Operation queue hook
└── lib/
    └── offline.ts                  # Desktop-specific offline utilities

apps/cli/src/commands/
└── offline.rs                      # CLI offline mode commands (status, sync, queue)
```

**Acceptance Criteria:**
- System detects network connectivity changes within 2 seconds
- Offline mode activates automatically when network is lost
- Local inference (llama.cpp/Ollama) works for agent reasoning in offline mode
- Cached sessions are viewable and searchable while offline
- Operation queue captures all network-dependent requests with metadata
- Queue displays pending, in-progress, and failed operations with retry controls
- Automatic synchronization occurs within 10 seconds of network restoration
- Conflict resolution handles divergent state between local and remote
- UI clearly indicates online/offline status and which features are available

**Risk Level:** High — Offline synchronization with conflict resolution is inherently complex; local inference must be reliable as the primary reasoning engine during offline periods

---

### 18.4 Implement Desktop Settings and Preferences UI

**Description:**
The desktop settings and preferences UI provides a comprehensive, user-friendly interface for configuring every aspect of Agentic OS V4. The settings are organized into logical categories: General (appearance, language, startup behavior, auto-update preferences), Providers (add, configure, test, remove AI providers), Models (default models per capability, model ordering, model aliases, local model management), Sessions (retention policies, storage limits, encryption settings), Gateway (routing strategies, provider priorities, fallback chains, caching), Security (guardrails, PII detection, content moderation, egress controls), Notifications (which events trigger notifications, DND schedule, sound preferences), Keybindings (customize every keyboard shortcut in the app), Proxy (HTTP/HTTPS/SOCKS proxy configuration, MITM settings), Extensions (installed extensions marketplace, extension configuration), and Advanced (log levels, developer mode, experimental features, performance tuning). Each settings page includes real-time validation: invalid values are flagged immediately with clear error messages, and unsaved changes are indicated. Settings with side effects (e.g., changing the default provider) show previews or confirmation dialogs. The settings UI supports search across all settings, a "reset to defaults" option per category, import/export of settings as a JSON file, and multi-profile support (work profile, personal profile). The settings are persisted to the unified configuration file and synced across CLI, TUI, and desktop interfaces.

**Copy Source:** Goose (desktop settings) + gemini-cli (settings/themes) + V3 (OS settings)

**Key Files to Create/Modify:**
```
apps/desktop/src/components/settings/
├── SettingsLayout.tsx              # Settings page layout with sidebar navigation
├── GeneralSettings.tsx             # General preferences (language, startup, theme)
├── ProviderSettings.tsx            # Provider management (add, configure, test)
├── ProviderForm.tsx                # Provider credential form with validation
├── ModelSettings.tsx               # Model preferences and local model management
├── SessionSettings.tsx             # Session retention, storage, encryption
├── GatewaySettings.tsx             # Gateway routing, strategies, fallbacks
├── SecuritySettings.tsx            # Guardrails, PII, moderation, egress
├── NotificationSettings.tsx        # Notification preferences and DND schedule
├── KeybindingSettings.tsx          # Keyboard shortcut customization
├── ProxySettings.tsx               # Network proxy and MITM configuration
├── ExtensionSettings.tsx           # Extension management
├── AdvancedSettings.tsx            # Log levels, developer mode, experimental
├── SettingsSearch.tsx              # Cross-settings search
├── SettingsExportImport.tsx        # Settings export/import
└── ProfileManager.tsx              # Multi-profile management

packages/core/src/config/
├── desktop_schema.rs               # Desktop-specific config schema
└── validation.rs                   # Cross-field validation rules
```

**Acceptance Criteria:**
- All setting categories are accessible from the settings sidebar
- Real-time validation flags invalid values immediately with clear error messages
- Search across all settings returns relevant results as user types
- "Reset to defaults" restores per-category defaults with confirmation
- Settings import/export produces/consumes valid JSON files
- Multi-profile support enables switching between work and personal configurations
- Changes made in desktop settings are reflected in CLI and TUI interfaces
- Provider configuration wizard guides through adding new providers with credential validation
- Keybinding customization captures keyboard input correctly for all bindable actions

**Risk Level:** Low — Settings UI is primarily a frontend task; main complexity is ensuring real-time validation UX is smooth and that settings sync correctly across all interfaces

---

### 18.5 Implement Auto-Update Mechanism (from Goose + gemini-cli)

**Description:**
The auto-update mechanism ensures that Agentic OS V4 desktop users always have the latest version with minimal friction. This subphase combines the auto-update patterns from Goose (Tauri updater + GitHub Releases) and gemini-cli (npm update mechanism) into a unified update system. The Tauri updater handles native binary updates for the desktop app: checking for updates against GitHub Releases (or a self-hosted update server), downloading updates in the background, verifying signatures (Ed25519), and applying updates on restart with a seamless upgrade experience. The update check runs automatically on startup and periodically (configurable, default every 6 hours). Users can also trigger a manual check from the tray menu or settings page. Updates are delivered as delta updates where possible (only downloading changed files) to minimize bandwidth. The update UI shows release notes (rendered from GitHub release body or a CHANGELOG.md), version comparison, download progress, and estimated time remaining. For the embedded CLI and gateway binaries, the auto-update mechanism also manages versioning, downloading new binary versions and swapping them atomically. The update system supports release channels: stable, beta, and nightly, configurable in settings. Rollback support is built in: the previous version's binary is preserved and can be restored if the new version has issues. Security is paramount: all updates are verified against a public key, the update server uses HTTPS with certificate pinning, and update checks can be disabled entirely for air-gapped environments.

**Copy Source:** Goose (Tauri updater + GitHub Releases) + gemini-cli (npm update)

**Key Files to Create/Modify:**
```
apps/desktop/src-tauri/src/
├── autoupdate.rs                   # Auto-update orchestrator
├── updater.rs                      # Core update logic (check, download, verify, install)
├── delta.rs                        # Delta update support (binary diff patching)
├── rollback.rs                     # Version rollback mechanism
├── channels.rs                     # Release channel management (stable, beta, nightly)
└── signing.rs                      # Signature verification (Ed25519)

apps/desktop/src/
├── components/
│   └── settings/
│       └── UpdateSettings.tsx      # Auto-update settings and manual check UI
├── hooks/
│   ├── useAutoUpdate.ts            # Auto-update state and event hooks
│   └── useUpdateProgress.ts        # Download progress tracking
└── pages/
    └── UpdateAvailable.tsx         # Update available notification page

packages/updater/
├── Cargo.toml                      # Core update library (shared between CLI and desktop)
├── src/
│   ├── lib.rs                      # Update library entry
│   ├── check.rs                    # Update availability check
│   ├── download.rs                 # Download with resume support
│   ├── verify.rs                   # Signature and hash verification
│   ├── install.rs                  # Atomic installation
│   ├── rollback.rs                 # Version rollback
│   ├── channels.rs                 # Release channel configuration
│   └── types.rs                    # Shared types
├── tests/
│   ├── verify_tests.rs             # Signature verification tests
│   └── update_tests.rs             # Update lifecycle tests
└── schema/
    └── update-feed.json            # Update feed schema (Sparkle-compatible)

scripts/
├── release-sign.sh                 # Sign release artifacts with signing key
├── generate-update-feed.js         # Generate update feed JSON
└── create-delta-patch.js           # Create delta patches between versions
```

**Acceptance Criteria:**
- Auto-update checks for updates on startup and periodically (configurable interval)
- Updates download in background without blocking the UI
- Download progress is displayed with speed, ETA, and percentage
- Update signatures are verified against the public key before installation
- Updates apply atomically with rollback capability on failure
- Release channels (stable, beta, nightly) work correctly with appropriate update feeds
- Manual update check is available from tray menu and settings
- Delta updates reduce download size by 60%+ compared to full updates
- Rollback restores previous version within 30 seconds
- Update can be disabled entirely for air-gapped/enterprise environments

**Risk Level:** Medium — Auto-update is well-trodden territory but signing infrastructure, delta patching, and cross-platform quirks (especially code signing on macOS and Windows) require careful implementation

---

## Phase 19: Web Dashboard (Weeks 30–33)

### Overview
Phase 19 delivers the web-based management dashboard for Agentic OS V4, built with Next.js (from 9Router's dashboard foundation). The dashboard provides a comprehensive web UI for provider management, usage analytics and billing, system monitoring and alerts, and multi-tenant user management. Unlike the desktop app which is optimized for individual agent interaction, the web dashboard is designed for administrative tasks: configuring providers, monitoring system health, analyzing usage patterns, managing budgets, and administering multi-tenant deployments. The dashboard is fully responsive and works on desktop and mobile browsers. It connects to the gateway server via REST API and WebSocket for real-time updates. The dashboard features a dark/light theme, customizable layouts, and export capabilities for all data views.

---

### 19.1 Set Up Next.js Dashboard (from 9Router Dashboard)

**Description:**
The Next.js dashboard provides the web-based administration interface for Agentic OS V4, built upon the foundation of 9Router's existing dashboard implementation. This subphase sets up the Next.js 14+ project with the App Router, server-side rendering for performance, and API routes for dashboard-specific backend operations. The dashboard architecture follows a modular layout: a persistent sidebar with navigation sections (Overview, Providers, Routing, Analytics, Monitoring, Users, Settings, Agents, Skills, Recipes), a top bar with global search, user menu, and notification bell, and a main content area that renders page components based on the current route. Authentication is handled via NextAuth.js with support for OAuth providers (Google, GitHub, Microsoft) and SSO (SAML/OIDC for enterprise). The dashboard communicates with the gateway's management API (separate from the inference API) for all data operations. Real-time updates use WebSocket connections for live metrics, notifications, and status changes. The frontend is built with shadcn/ui components (matching the desktop app) for visual consistency, Recharts for charting, React Query for server state management, and Zustand for client state. Server components are used for data-fetching pages to maximize performance, while client components handle interactive features. The dashboard supports PWA features (offline access to cached data, installable on mobile) based on OmniRoute2's PWA implementation.

**Copy Source:** 9Router (Next.js dashboard) + OmniRoute2 (PWA, i18n) + Goose (monitoring pages)

**Key Files to Create/Modify:**
```
apps/dashboard/
├── package.json                     # Dependencies (next, react, shadcn, recharts, etc.)
├── next.config.mjs                  # Next.js configuration
├── tailwind.config.ts               # Tailwind configuration
├── tsconfig.json                    # TypeScript configuration
├── src/
│   ├── app/
│   │   ├── layout.tsx               # Root layout with providers (Theme, Auth, Query)
│   │   ├── page.tsx                 # Redirect to dashboard or login
│   │   ├── globals.css              # Global styles
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   ├── page.tsx         # Login page with OAuth buttons
│   │   │   │   └── login-form.tsx   # Login form component
│   │   │   └── callback/
│   │   │       └── route.ts         # OAuth callback handler
│   │   └── (dashboard)/
│   │       ├── layout.tsx           # Dashboard layout (sidebar, topbar, content)
│   │       ├── page.tsx             # Dashboard overview (summary cards, charts)
│   │       ├── providers/
│   │       │   ├── page.tsx         # Provider grid with status indicators
│   │       │   ├── [id]/page.tsx    # Provider detail and configuration
│   │       │   └── add/
│   │       │       └── page.tsx     # Add provider wizard
│   │       ├── routing/
│   │       │   ├── page.tsx         # Visual routing configuration
│   │       │   ├── strategies/
│   │       │   │   └── page.tsx     # Routing strategy management
│   │       │   └── combos/
│   │       │       └── page.tsx     # Auto-combo configuration
│   │       ├── analytics/
│   │       │   ├── usage/
│   │       │   │   └── page.tsx     # Usage analytics (requests, tokens, users)
│   │       │   ├── costs/
│   │       │   │   └── page.tsx     # Cost breakdown and trends
│   │       │   ├── performance/
│   │       │   │   └── page.tsx     # Performance metrics (latency, throughput)
│   │       │   └── routing/
│   │       │       └── page.tsx     # Routing decision analytics
│   │       ├── monitoring/
│   │       │   ├── page.tsx         # System health overview
│   │       │   ├── alerts/
│   │       │   │   └── page.tsx     # Alert history and configuration
│   │       │   ├── logs/
│   │       │   │   └── page.tsx     # Live and historical logs viewer
│   │       │   └── tracing/
│   │       │       └── page.tsx     # Distributed tracing viewer
│   │       ├── users/
│   │       │   ├── page.tsx         # User list with search and filters
│   │       │   ├── [id]/page.tsx    # User detail and permissions
│   │       │   ├── teams/
│   │       │   │   └── page.tsx     # Team management
│   │       │   └── roles/
│   │       │       └── page.tsx     # Role and permission management
│   │       ├── agents/
│   │       │   ├── page.tsx         # Agent instances list
│   │       │   ├── [id]/page.tsx    # Agent detail with DAG visualization
│   │       │   └── sessions/
│   │       │       └── page.tsx     # Session browser
│   │       ├── skills/
│   │       │   ├── page.tsx         # Skill marketplace
│   │       │   ├── builder/
│   │       │   │   └── page.tsx     # Visual skill builder
│   │       │   └── registry/
│   │       │       └── page.tsx     # Private skill registry
│   │       ├── recipes/
│   │       │   ├── page.tsx         # Recipe list
│   │       │   ├── builder/
│   │       │   │   └── page.tsx     # Visual recipe builder
│   │       │   └── runs/
│   │       │       └── page.tsx     # Recipe execution history
│   │       ├── guardrails/
│   │       │   ├── page.tsx         # Guardrail configuration
│   │       │   └── rules/
│   │       │       └── page.tsx     # Custom guardrail rules
│   │       ├── billing/
│   │       │   ├── page.tsx         # Billing overview and invoices
│   │       │   ├── plans/
│   │       │   │   └── page.tsx     # Pricing plan management
│   │       │   └── payments/
│   │       │       └── page.tsx     # Payment method management
│   │       ├── mitm/
│   │       │   └── page.tsx         # MITM proxy status and configuration
│   │       ├── settings/
│   │       │   ├── page.tsx         # General settings
│   │       │   ├── appearance/
│   │       │   │   └── page.tsx     # Theme and layout customization
│   │       │   ├── i18n/
│   │       │   │   └── page.tsx     # Internationalization settings (30+ languages)
│   │       │   └── advanced/
│   │       │       └── page.tsx     # Advanced configuration
│   │       └── admin/
│   │           ├── page.tsx         # System administration panel
│   │           ├── audit/
│   │           │   └── page.tsx     # Audit log viewer
│   │           └── maintenance/
│   │               └── page.tsx     # System maintenance tools
│   ├── components/
│   │   ├── ui/                      # shadcn/ui base components (shared)
│   │   ├── dashboard/
│   │   │   ├── Sidebar.tsx          # Dashboard sidebar navigation
│   │   │   ├── TopBar.tsx           # Top bar with search and user menu
│   │   │   ├── StatCard.tsx         # Summary statistic card
│   │   │   ├── DataTable.tsx        # Sortable, filterable data table
│   │   │   ├── StatusBadge.tsx      # Status indicator badge
│   │   │   └── NotificationBell.tsx # Notification dropdown
│   │   ├── charts/
│   │   │   ├── TimeSeriesChart.tsx  # Time series line/area chart
│   │   │   ├── BarChart.tsx         # Bar chart component
│   │   │   ├── PieChart.tsx         # Pie/donut chart
│   │   │   ├── Heatmap.tsx          # Calendar heatmap
│   │   │   └── Gauge.tsx            # Gauge/speedometer chart
│   │   ├── providers/
│   │   │   ├── ProviderCard.tsx     # Provider status card
│   │   │   ├── ProviderForm.tsx     # Provider configuration form
│   │   │   └── ProviderTest.tsx     # Provider connection test UI
│   │   ├── routing/
│   │   │   ├── RoutingFlow.tsx      # Visual routing graph (React Flow)
│   │   │   ├── StrategyCard.tsx     # Routing strategy configuration
│   │   │   └── FallbackChain.tsx    # Fallback chain visualization
│   │   ├── agents/
│   │   │   ├── AgentDAG.tsx         # Agent DAG visualization (React Flow)
│   │   │   └── AgentStatus.tsx      # Agent execution status
│   │   └── users/
│   │       ├── UserTable.tsx        # Sortable user table
│   │       ├── UserForm.tsx         # User creation/edit form
│   │       └── RoleSelector.tsx     # Role/permission selector
│   ├── hooks/
│   │   ├── useAuth.ts              # Authentication state hook
│   │   ├── useWebSocket.ts         # WebSocket connection hook
│   │   ├── useNotifications.ts     # Real-time notifications hook
│   │   └── useDashboard.ts         # Dashboard data fetching hooks
│   ├── lib/
│   │   ├── api.ts                  # API client (fetch wrapper with auth)
│   │   ├── auth.ts                 # NextAuth configuration
│   │   ├── websocket.ts            # WebSocket client
│   │   ├── i18n.ts                 # Internationalization utilities
│   │   └── utils.ts                # Shared utilities
│   ├── stores/
│   │   ├── appStore.ts             # Global app state
│   │   ├── providerStore.ts        # Provider state (real-time updates)
│   │   └── notificationStore.ts    # Notification state
│   └── types/
│       ├── provider.ts             # Provider type definitions
│       ├── analytics.ts            # Analytics data types
│       ├── user.ts                 # User and team types
│       └── dashboard.ts            # Dashboard configuration types
├── public/
│   ├── locales/                     # i18n translation files (30+ languages)
│   ├── manifest.json               # PWA manifest
│   └── sw.js                        # Service worker for PWA offline support
├── tests/
│   ├── providers.test.tsx           # Provider page tests
│   ├── analytics.test.tsx           # Analytics page tests
│   ├── users.test.tsx               # User management tests
│   └── routing.test.tsx             # Routing config page tests
└── playwright.config.ts             # E2E test configuration
```

**Acceptance Criteria:**
- Dashboard builds and runs with Next.js 14+ App Router
- Authentication works with OAuth (Google, GitHub, Microsoft) and SSO (SAML/OIDC)
- All dashboard pages render with data from the management API
- Sidebar navigation highlights current page and supports collapse
- Real-time updates via WebSocket for metrics, notifications, and status changes
- PWA installable on desktop and mobile with offline access to cached data
- Responsive layout works on desktop (1920px+) and mobile (375px+)
- All charts render correctly with Recharts and support export as PNG/SVG
- i18n supports 30+ languages with proper RTL support where needed
- Dark/light theme matches desktop app colors

**Risk Level:** Medium — Next.js dashboard is a significant frontend project but benefits from 9Router's existing implementation as a foundation; real-time WebSocket integration and PWA support add complexity

---

### 19.2 Implement Provider Management UI

**Description:**
The provider management UI provides a comprehensive interface for configuring, testing, and monitoring AI providers within the gateway. The provider grid displays all configured providers with status indicators (healthy, degraded, down, unconfigured), model counts, recent latency (p50/p95/p99), error rates, and daily request volumes. Providers can be sorted, filtered by status or capability, and searched by name. The provider detail page shows full configuration (endpoint URL, API key management, rate limits, model availability), real-time health metrics (latency trend, error rate trend, token throughput), model inventory (supported models with context windows, pricing, and capabilities), and connection test results. Adding a new provider follows a step-by-step wizard: select provider type from the unified registry (150+ options), enter authentication credentials (with secure storage and masking), configure endpoint settings (with auto-detection for well-known providers), test the connection with a sample request, and select default models for each capability. The provider list also supports bulk operations: enable/disable multiple providers, test connections in parallel, update rate limits, and remove unused providers. Provider configurations are persisted to the unified config store and synchronized across all interfaces (CLI, TUI, desktop). The UI also shows provider usage analytics (requests, tokens, cost) integrated with the billing system.

**Copy Source:** 9Router (provider management) + Goose (provider config) + litellm (provider testing)

**Key Files to Create/Modify:**
```
apps/dashboard/src/app/(dashboard)/providers/
├── page.tsx                         # Provider grid page
├── [id]/page.tsx                    # Provider detail page
└── add/
    └── page.tsx                     # Add provider wizard

apps/dashboard/src/components/providers/
├── ProviderCard.tsx                 # Provider status card for grid
├── ProviderGrid.tsx                 # Grid layout with filtering and sorting
├── ProviderForm.tsx                 # Provider configuration form
├── ProviderTest.tsx                 # Connection test component
├── ProviderHealth.tsx               # Health metrics display
├── ProviderModels.tsx               # Model inventory table
├── ProviderWizard.tsx               # Multi-step add provider wizard
├── ProviderWizardStep1.tsx          # Step 1: Select provider type
├── ProviderWizardStep2.tsx          # Step 2: Authentication
├── ProviderWizardStep3.tsx          # Step 3: Endpoint configuration
├── ProviderWizardStep4.tsx          # Step 4: Connection test
├── ProviderWizardStep5.tsx          # Step 5: Model selection
├── ProviderBulkActions.tsx          # Bulk enable/disable/test actions
└── ProviderDeleteDialog.tsx         # Delete confirmation dialog
```

**Acceptance Criteria:**
- Provider grid displays all configured providers with real-time status indicators
- Provider detail shows full configuration, health metrics, and model inventory
- Adding a new provider follows a step-by-step wizard with validation at each step
- Connection test sends a sample request and displays success/failure with details
- Provider configurations are securely stored (API keys masked and encrypted)
- Providers can be enabled/disabled individually or in bulk
- Provider usage analytics show request volume, token counts, and costs
- All 150+ provider types from the unified registry are selectable in the wizard

**Risk Level:** Low — Provider management CRUD is well-understood; main complexity is ensuring the wizard works correctly for all 150+ provider types with varying configuration requirements

---

### 19.3 Implement Usage Analytics and Billing Dashboard

**Description:**
The usage analytics and billing dashboard provides comprehensive visibility into consumption patterns and costs across the entire system. The usage analytics section shows request volumes (total requests, requests per provider, per model, per user), token consumption (input/output tokens with trends, peak usage periods, token waste analysis), latency distributions (p50/p95/p99 with breakdown by provider, model, and time of day), error rates (by type: timeout, rate limit, auth failure, server error, with drill-down to individual requests), and cost tracking (per-request cost, daily/weekly/monthly spend, cost by provider, by model, by user, by team, with budget comparisons). All analytics views support flexible date ranges (last hour, today, yesterday, last 7/30/90 days, custom range), granularity (minute, hour, day, week, month), and export (CSV, JSON, PDF). The billing section displays current charges, outstanding invoices, payment history, credit usage, and budget status. Budget management allows setting hard and soft limits per provider, per model, per user, per team, with configurable alerting when thresholds are approached or exceeded. The billing dashboard integrates with external payment processors (Stripe, Creem, Epay, Waffo from new-api) for usage-based billing. Charts use Recharts for interactive exploration: hover to see values, click to drill down, brush to select time ranges, and download as images.

**Copy Source:** 9Router (analytics) + litellm (cost tracking) + new-api (billing) + Portkey (usage analytics)

**Key Files to Create/Modify:**
```
apps/dashboard/src/app/(dashboard)/analytics/
├── usage/page.tsx                   # Usage analytics dashboard
├── costs/page.tsx                   # Cost analysis dashboard
├── performance/page.tsx             # Performance analytics
└── routing/page.tsx                 # Routing decision analytics

apps/dashboard/src/app/(dashboard)/billing/
├── page.tsx                         # Billing overview
├── invoices/page.tsx                # Invoice history
├── plans/page.tsx                   # Pricing plans
└── payments/page.tsx                # Payment methods

apps/dashboard/src/components/charts/
├── UsageChart.tsx                    # Interactive time series chart
├── CostBreakdownChart.tsx           # Cost breakdown pie/bar chart
├── LatencyHeatmap.tsx               # Latency by hour/day heatmap
├── TopProvidersChart.tsx            # Top providers by usage
├── TopModelsChart.tsx               # Top models by usage
├── TokenUsageChart.tsx              # Token consumption chart
├── BudgetGauge.tsx                  # Budget usage gauge
└── ErrorRateChart.tsx               # Error rate over time

packages/gateway/src/billing/
├── dashboard-api.ts                 # Billing/analytics API endpoints
├── aggregation.ts                   # Usage data aggregation queries
├── budget-engine.ts                 # Budget enforcement logic
└── invoice-generator.ts             # Invoice generation
```

**Acceptance Criteria:**
- Usage analytics show request volumes, tokens, latency, and error rates with flexible date ranges
- Cost tracking shows spend by provider, model, user, and team with budget comparisons
- All charts are interactive: hover for values, click to drill down, brush for time range
- Data can be exported as CSV, JSON, and PDF
- Budget management supports hard and soft limits with configurable alerts
- Billing section shows current charges, invoices, and payment methods
- Budget alerts trigger via in-app notification, email, and webhook
- Analytics API responds to aggregation queries in under 2 seconds for 30-day ranges
- Usage data is cached and updated in near-real-time (under 1 minute lag)

**Risk Level:** Medium — Analytics aggregation queries can be expensive on large datasets; proper indexing and caching strategy is essential for query performance

---

### 19.4 Implement System Monitoring and Alerts

**Description:**
The system monitoring and alerts dashboard provides real-time visibility into the health and performance of all Agentic OS V4 components: the gateway server, ACP server, MCP registry, local inference engine, MITM proxy, and individual provider connections. The monitoring overview page shows a summary view with key health indicators: service status (up/down/degraded for each component), request throughput (current RPS with trend), error rate (current errors/min with trend), average latency (current p50/p95/p99), active sessions count, queue depth, and resource utilization (CPU, memory, disk, network). Each metric is displayed as a stat card with sparkline trend and comparison to the previous period. The monitoring detail pages provide deep-dive views: service logs with search and filter, distributed tracing with span waterfall visualization, provider-specific health with connection pool status, and resource utilization trends. The alerting system allows configuring alerts on any metric with threshold-based (above/below value, percentage change, anomaly detection) and event-based (service down, cert expiring, budget exceeded) triggers. Alerts can route to multiple channels: in-app notifications, email, Slack/Discord webhooks, PagerDuty, or custom webhook. Alert rules support severity levels (info, warning, critical), silence periods, escalation policies, and notification schedules. The alert history shows all triggered alerts with acknowledgment, resolution tracking, and post-mortem notes.

**Copy Source:** litellm (monitoring + alerts) + Portkey (observability) + Goose (health checks)

**Key Files to Create/Modify:**
```
apps/dashboard/src/app/(dashboard)/monitoring/
├── page.tsx                         # Monitoring overview
├── alerts/page.tsx                  # Alert management
├── alerts/[id]/page.tsx             # Alert detail and history
├── logs/page.tsx                    # Log viewer
├── tracing/page.tsx                 # Distributed tracing view
└── health/page.tsx                  # Detailed health status

apps/dashboard/src/components/monitoring/
├── HealthOverview.tsx               # Health summary cards
├── ServiceStatus.tsx                # Per-service status indicator
├── MetricCard.tsx                   # Metric with sparkline and delta
├── LogViewer.tsx                    # Searchable, filterable log viewer
├── TraceView.tsx                    # Span waterfall visualization
├── AlertRuleForm.tsx                # Alert rule creation/edit form
├── AlertRuleList.tsx                # Configured alert rules
├── AlertHistory.tsx                 # Triggered alerts with status
├── AlertChannelConfig.tsx           # Notification channel configuration
├── EscalationPolicy.tsx             # Escalation policy editor
└── MaintenanceWindow.tsx            # Maintenance schedule configuration

packages/gateway/src/monitoring/
├── health-check.ts                  # Service health check endpoints
├── metrics-aggregator.ts            # Metrics collection and aggregation
├── alert-engine.ts                  # Alert evaluation engine
├── alert-routes.ts                  # Alert routing to notification channels
└── maintenance.ts                   # Maintenance window management
```

**Acceptance Criteria:**
- Monitoring overview shows health status of all components with real-time metrics
- Service logs support search, filter by level/service/time, and live tailing
- Distributed tracing shows span waterfall with service and operation names
- Alert rules can be created on any metric with threshold and severity configuration
- Alerts route to multiple channels (in-app, email, Slack, Discord, PagerDuty, webhook)
- Alert history shows all triggered, acknowledged, and resolved alerts with timestamps
- Escalation policies support multiple levels with configurable delays
- Maintenance windows suppress alerts during planned downtime
- Monitoring data is retained per configurable policy (default 30 days metrics, 7 days traces)

**Risk Level:** Medium — Alert engine must be reliable and low-latency; distributed tracing visualization requires careful span correlation and waterfall layout calculation

---

### 19.5 Implement User Management (Multi-Tenant Admin Panel)

**Description:**
The user management panel provides comprehensive administration of users, teams, roles, and permissions for multi-tenant deployments. Built on the multi-tenant architecture from new-api, this panel enables administrators to manage the entire user lifecycle: invite users via email, create user accounts, assign roles and permissions, organize users into teams, configure team-level settings (models, providers, budgets, guardrails), and monitor user activity. The user table supports search, filtering (by role, status, team, date range), sorting, and bulk operations (activate, deactivate, change role, add to team, delete). Each user detail page shows personal information, assigned roles and permissions, team memberships, API keys (with rotation and revocation), usage statistics (requests, tokens, cost over time), active sessions, and audit log. The role-based access control (RBAC) system supports predefined roles (admin, team_lead, developer, viewer, billing_admin, support_agent) and custom roles with granular permissions defined per resource (providers, models, teams, users, settings, billing, monitoring, guardrails, agents, skills, recipes). Permissions can be further refined with attribute-based access control (ABAC) for fine-grained policies. Teams represent organizational units with isolated resources: team-specific provider configurations, model allowlists/blocklists, budget allocations, custom guardrail policies, and private skill/recipe registries. Audit logging records all administrative actions with before/after state, timestamp, and actor information for compliance.

**Copy Source:** new-api (multi-tenant, RBAC) + 9Router (team management) + OmniRoute2 (permissions)

**Key Files to Create/Modify:**
```
apps/dashboard/src/app/(dashboard)/users/
├── page.tsx                         # User list with search and filters
├── [id]/page.tsx                    # User detail page
├── invite/page.tsx                  # User invitation form
├── teams/page.tsx                   # Team management
├── teams/[id]/page.tsx              # Team detail and configuration
└── roles/page.tsx                   # Role and permission management

apps/dashboard/src/components/users/
├── UserTable.tsx                    # Sortable, filterable user table
├── UserForm.tsx                     # User creation/edit form
├── UserInvite.tsx                   # Bulk invitation form
├── UserPermissions.tsx              # Permission editor
├── UserActivity.tsx                 # Usage and activity display
├── UserApiKeys.tsx                  # API key management
├── TeamCard.tsx                     # Team summary card
├── TeamForm.tsx                     # Team creation/edit form
├── TeamMembers.tsx                  # Team member management
├── TeamSettings.tsx                 # Team-level configuration
├── RoleList.tsx                     # Role definitions
├── RoleEditor.tsx                   # Custom role permission editor
└── AuditLog.tsx                     # Audit log viewer

packages/gateway/src/auth/
├── rbac.ts                          # Role-based access control
├── abac.ts                          # Attribute-based access control
├── permission-registry.ts           # All available permissions
└── audit-logger.ts                  # Audit trail logging
```

**Acceptance Criteria:**
- User list displays all users with search, filter, sort, and bulk operations
- User creation supports manual entry and email invitation workflows
- Role-based access control with predefined and custom roles
- Granular permissions cover all resource types (providers, models, teams, etc.)
- Teams have isolated resources (providers, models, budgets, guardrails)
- API key management supports creation, rotation, revocation, and scoping
- Audit log records all administrative actions with before/after state
- Team-level configuration allows setting model allowlists/blocklists and budget limits
- User activity shows request volume, token usage, and cost over time

**Risk Level:** Low — Multi-tenant user management is well-understood; main complexity is ensuring RBAC is comprehensive enough to cover all permission scenarios without performance overhead on authorization checks

---

## Phase 20: Observability — Tracing & Monitoring (Weeks 33–36)

### Overview
Phase 20 implements the comprehensive observability infrastructure for Agentic OS V4, combining the distributed tracing from litellm and gemini-cli, the metrics collection from Portkey and litellm, the structured logging from all projects, and the health check and alerting systems. This phase ensures that every aspect of the system — from gateway request routing to agent execution to desktop app behavior — is observable, measurable, and diagnosable. The observability stack is based on OpenTelemetry (OTEL) as the unified instrumentation standard, with configurable exporters for Prometheus, Jaeger/Tempo, Datadog, Langfuse, and custom backends. The infrastructure supports three pillars of observability: tracing (distributed request tracing across services), metrics (aggregated numerical measurements), and logging (structured, searchable event records). Alerting ties these together with configurable rules that can trigger notifications and automated responses.

---

### 20.1 Implement OTEL-Based Distributed Tracing (from litellm + gemini-cli)

**Description:**
Distributed tracing provides end-to-end visibility into request flow across all Agentic OS V4 services: from CLI/TUI/desktop client → ACP server → gateway routing → provider API calls → response streaming → client display. This subphase implements OpenTelemetry (OTEL) instrumentation across all Rust and TypeScript components, using the semantic conventions for GenAI operations (trace attributes for LLM requests, token counts, model IDs, provider names, etc.). Each service creates spans for its operations with appropriate parent-child relationships, enabling trace waterfall visualization in Jaeger/Tempo, Datadog, or the built-in dashboard. The tracing infrastructure includes: automatic instrumentation for HTTP/gRPC/WebSocket requests via OTEL interceptors, manual instrumentation for critical code paths (provider calls, routing decisions, guardrail evaluations, cache lookups), context propagation across service boundaries (W3C trace context, baggage), sampling strategies (head-based, tail-based, dynamic) to control trace volume, and trace-to-metrics correlation for latency distributions. The gemini-cli telemetry system is ported to provide Langfuse-compatible traces for agent-specific observability (prompt templates, tool calls, agent steps, user feedback). Tracing data is exported via OTLP (OpenTelemetry Protocol) to configurable backends: self-hosted (Jaeger/Tempo, SigNoz), cloud (Datadog, New Relic, Grafana Cloud), or the built-in lightweight trace store for small deployments. Trace retention is configurable (default 7 days for detailed traces, 30 days for trace summaries).

**Copy Source:** litellm (OTEL tracing) + gemini-cli (Langfuse telemetry) + V3 (OTEL instrumentation)

**Key Files to Create/Modify:**
```
packages/telemetry/
├── Cargo.toml                      # Rust OTEL SDK dependencies
├── src/
│   ├── lib.rs                      # Library entry point
│   ├── tracing.rs                  # Tracing initialization and configuration
│   ├── instrumentation.rs          # Auto-instrumentation setup
│   ├── sampler.rs                  # Sampling strategies (head, tail, dynamic)
│   ├── propagator.rs               # Context propagation (W3C tracecontext, baggage)
│   ├── exporter.rs                 # OTLP exporter configuration
│   ├── processor.rs                # Span processor (batch, with queue)
│   ├── resource.rs                 # Resource attributes (service name, version, env)
│   ├── semantic_conventions.rs     # GenAI-specific semantic conventions
│   ├── langfuse/
│   │   ├── exporter.rs             # Langfuse-compatible trace exporter
│   │   ├── types.rs                # Langfuse-specific trace types
│   │   └── client.rs               # Langfuse API client
│   └── builtin/
│       ├── store.rs                # Lightweight built-in trace store (SQLite)
│       └── api.rs                  # Built-in trace query API
├── js/
│   ├── package.json                # TypeScript OTEL SDK dependencies
│   ├── src/
│   │   ├── index.ts                # TypeScript tracing initialization
│   │   ├── instrumentation.ts      # Auto-instrumentation (Express, fetch, gRPC)
│   │   ├── genai.ts                # GenAI-specific span attributes
│   │   ├── exporter.ts             # OTLP exporter
│   │   └── langfuse.ts             # Langfuse integration
│   └── tsconfig.json
└── tests/
    ├── tracing_tests.rs            # Trace lifecycle tests
    ├── sampler_tests.rs            # Sampling strategy tests
    ├── propagation_tests.rs        # Context propagation tests
    └── langfuse_tests.rs           # Langfuse export tests
```

**Acceptance Criteria:**
- OTEL instrumentation spans all critical code paths across Rust and TypeScript services
- Traces correctly propagate context across service boundaries (W3C tracecontext)
- GenAI semantic conventions are applied to all LLM-related spans
- Sampling strategies (head-based with configurable rate, tail-based for errors) work correctly
- Traces are exportable to: Jaeger/Tempo (OTLP), Datadog, Langfuse, and built-in store
- Trace waterfall visualization shows full request lifecycle with accurate timing
- Trace-to-metrics correlation enables latency distribution calculation from trace data
- Langfuse traces include: prompts, tool calls, agent steps, user feedback, scores
- Trace volume is controllable via sampling without losing error/critical traces
- Built-in trace store handles 10k+ traces/day without significant performance impact

**Risk Level:** Medium — OTEL instrumentation is well-documented but ensuring correct context propagation across the polyglot (Rust + TypeScript) architecture requires careful attention to semantic conventions and propagator configuration

---

### 20.2 Implement Metrics Collection (Request Counts, Latency, Errors, Costs)

**Description:**
Metrics collection provides aggregated numerical measurements for monitoring system health and performance over time. This subphase implements a comprehensive metrics system based on OpenTelemetry metrics SDK and Prometheus exposition format. Key metrics collected include: request counts (total, per provider, per model, per endpoint, per user, per team, with success/error/rate-limit dimensions), latency histograms (request duration, streaming time-to-first-token, time-to-last-token, guardrail evaluation time, cache lookup time, routing decision time), token throughput (input tokens/sec, output tokens/sec, total tokens per request), error rates (by error type, provider, model, HTTP status code, with 4xx/5xx breakdown), cost metrics (cost per request, accumulated cost per provider/model/user/team, cost per token), cache metrics (hit rate, miss rate, size, eviction count), routing metrics (decisions per strategy, fallback depth, combo chains used), and system metrics (CPU, memory, goroutine count, active connections, queue depth). Metrics are collected with configurable aggregation intervals and cardinality limits to prevent metric explosion. Histograms use configurable bucket boundaries appropriate for each measurement (e.g., latency buckets: 1ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s). The Prometheus exposition endpoint is served by the gateway on a dedicated port (default 9090) for scraping by Prometheus or Grafana Alloy. Metrics can also be exported via OTLP to compatible backends. Built-in dashboard views expose key metrics without requiring external monitoring infrastructure.

**Copy Source:** litellm (Prometheus metrics) + Portkey (metrics collection) + new-api (billing metrics)

**Key Files to Create/Modify:**
```
packages/telemetry/src/
├── metrics/
│   ├── mod.rs                      # Metrics module root
│   ├── registry.rs                 # Metric registry (singleton per service)
│   ├── counters.rs                 # Counter metric definitions
│   ├── histograms.rs               # Histogram metric definitions
│   ├── gauges.rs                   # Gauge metric definitions (system resources)
│   ├── exporter.rs                 # Prometheus exposition format exporter
│   ├── otlp_exporter.rs            # OTLP metrics export
│   └── aggregator.rs              # Configurable aggregation and downsampling
├── middleware/
│   ├── mod.rs
│   ├── request_metrics.rs          # HTTP request metrics middleware
│   ├── streaming_metrics.rs        # Streaming-specific metrics
│   └── cost_metrics.rs             # Cost tracking metrics
└── dashboards/
    ├── prometheus.yml              # Prometheus scrape config
    ├── grafana-gateway.json         # Grafana dashboard (gateway metrics)
    ├── grafana-agents.json          # Grafana dashboard (agent metrics)
    └── grafana-system.json          # Grafana dashboard (system metrics)
```

**Acceptance Criteria:**
- All defined metrics are collected with correct dimensions and cardinality limits
- Prometheus exposition endpoint responds on port 9090 with valid metrics format
- Latency histograms use appropriate bucket boundaries for sub-millisecond to multi-second ranges
- Metrics are aggregated per configurable interval (default 15s scrapes, 1m aggregation)
- Cardinality limits prevent metric explosion from high-cardinality labels (user_id, etc.)
- Metrics are exportable via OTLP as an alternative to Prometheus scraping
- Grafana dashboards are provided for gateway, agent, and system metrics
- Cost metrics track accumulated cost per provider, model, user, and team
- Error rate metrics are broken down by error type for root cause analysis
- All metrics are decorated with appropriate resource attributes (service, version, environment)

**Risk Level:** Low — Metrics collection follows standard OTEL/Prometheus patterns; main complexity is ensuring cardinality limits are enforced without dropping legitimate metrics and that cost tracking is accurate across all provider types

---

### 20.3 Implement Logging Infrastructure (Structured JSON Logs, Log Aggregation)

**Description:**
The logging infrastructure provides structured, searchable event logging across all Agentic OS V4 services. All logs are emitted in structured JSON format with consistent fields: timestamp (ISO 8601 with microsecond precision), level (trace, debug, info, warn, error, fatal), service name, version, environment, trace_id, span_id, message, and structured payload (key-value pairs specific to the log event). Each service uses its platform's best logging library: `tracing` crate for Rust (with structured fields, spans, and events) and `pino` or `bunyan` for TypeScript (with the same field conventions). Log levels are configurable per service and per module/subcomponent to enable targeted debugging. The logging pipeline includes: log generation with structured fields, log aggregation via a local log shipper (fluent-bit, vector, or otel-collector) that forwards to centralized storage, log storage in a searchable backend (Elasticsearch, Loki, or built-in SQLite for small deployments), and log querying via the dashboard or CLI. The dashboard log viewer supports: full-text search across all log fields, structured field filtering (by level, service, trace_id, user_id, provider, model, etc.), time-range selection, live tailing with WebSocket, log pattern analysis (frequent error patterns, slow request patterns), and log export. Log retention is configurable per level (e.g., debug logs retained 7 days, error logs retained 90 days). Rate-limited logging prevents log flooding from high-frequency events while ensuring critical errors are never dropped. Sensitive data redaction is applied automatically (API keys, credentials, PII) based on configurable patterns.

**Copy Source:** litellm (structured logging) + gemini-cli (telemetry logging) + V3 (structured logs)

**Key Files to Create/Modify:**
```
packages/telemetry/src/
├── logging/
│   ├── mod.rs                      # Logging module root
│   ├── setup.rs                    # Logging initialization (tracing subscriber)
│   ├── format.rs                   # JSON log formatter
│   ├── fields.rs                   # Standard field definitions
│   ├── redaction.rs                # Sensitive data redaction
│   ├── rate_limiter.rs             # Log rate limiting
│   ├── rotation.rs                 # Local log file rotation
│   ├── shipper.rs                  # Log shipping to aggregation backend
│   └── builtin_store.rs           # Built-in SQLite log store
├── js/
│   └── src/
│       ├── logger.ts               # TypeScript logger setup (pino)
│       ├── format.ts               # JSON formatter with standard fields
│       └── redaction.ts            # Sensitive data redaction patterns
└── config/
    └── vector.toml                 # Vector log shipper configuration
    └── otel-collector.yml          # OTEL collector configuration
```

**Acceptance Criteria:**
- All services emit structured JSON logs with consistent field names
- Log levels are configurable per service and per module (e.g., `--log-level gateway=debug,acp=info`)
- Logs include trace_id and span_id for correlation with distributed traces
- Sensitive data redaction masks API keys, credentials, and PII in log output
- Rate limiting prevents log flooding: max N messages per second per module
- Log shipper (Vector/OTEL collector) forwards logs to centralized storage
- Dashboard log viewer supports full-text search, field filtering, time range, and live tailing
- Log retention is configurable per level (e.g., debug=7d, info=30d, error=90d)
- Local log files are rotated with configurable size and count limits
- Built-in log store handles 1M+ log entries/day without external dependencies

**Risk Level:** Low — Structured logging is well-understood; main complexity is ensuring consistent field naming across Rust and TypeScript services and implementing efficient built-in log storage for small deployments

---

### 20.4 Implement Health Check Endpoints and Status Pages

**Description:**
Health check endpoints and status pages provide real-time visibility into the operational status of every Agentic OS V4 component. Each service exposes health check endpoints following standard conventions: basic health (`GET /health` — overall service status), detailed health (`GET /health/detailed` — component-level status with diagnostics), readiness (`GET /health/ready` — ready to accept traffic), and liveness (`GET /health/live` — process is alive). Health check responses follow the RFC health check format with standardized fields: status (pass, warn, fail), version, releaseId, serviceId, description, checks (array of individual component checks with status, componentId, observedValue, observedUnit, time, and optional output, links, and action). Individual component checks cover: database connectivity (SQLite/Postgres reachable and responding), Redis connectivity (if configured), provider connections (configurable set of providers to health-check), MCP servers (registered servers responding), local inference engine (model loaded and ready), disk space (available space above threshold), memory usage (below threshold), and upstream dependencies (external APIs reachable). The status page in the dashboard provides a visual overview of all component statuses with color-coded indicators, latency sparklines, uptime percentages, and last-check timestamps. The status page also shows incident history, scheduled maintenance windows, and current active issues. A public status page (optional, `GET /status`) can be exposed for external monitoring tools.

**Copy Source:** litellm (health endpoints) + Goose (health checks) + 9Router (status page)

**Key Files to Create/Modify:**
```
packages/gateway/src/
├── health/
│   ├── mod.rs                      # Health check module
│   ├── endpoints.rs                # Health check HTTP endpoints
│   ├── checker.rs                  # Individual health check runner
│   ├── registry.rs                 # Health check registry (register checks)
│   ├── aggregator.rs               # Aggregate check results into response
│   └── types.rs                    # Health check types (RFC health check format)

apps/dashboard/src/app/(dashboard)/monitoring/
├── health/page.tsx                 # Status overview page
└── status/public/page.tsx          # Public status page (optional)

apps/dashboard/src/components/monitoring/
├── HealthCheckCard.tsx             # Individual health check display
├── ServiceStatusIndicator.tsx      # Color-coded status dot
├── UptimeChart.tsx                 # Uptime percentage over time
├── IncidentTimeline.tsx            # Incident history timeline
├── MaintenanceBanner.tsx           # Scheduled maintenance notification
└── PublicStatusWidget.tsx          # Embeddable public status widget
```

**Acceptance Criteria:**
- Every service exposes `/health`, `/health/detailed`, `/health/ready`, `/health/live` endpoints
- Health check responses follow RFC health check format with full check details
- Individual component checks cover: database, Redis, providers, MCP, local inference, disk, memory
- Health check timeouts prevent hung checks from blocking the response indefinitely
- Dashboard status page shows all components with color-coded status indicators
- Status page shows uptime percentages, last check time, and latency sparklines
- Optional public status page is available at `/status`
- Health checks are cached with configurable TTL (default 30s) to reduce load
- Incidents can be created manually or automatically from health check failures
- Health checks support authentication for detailed endpoints (basic auth or API key)

**Risk Level:** Low — Health check endpoints are straightforward; main complexity is ensuring all component checks are reliable and don't have false positives from transient failures

---

### 20.5 Implement Alerting and Anomaly Detection

**Description:**
The alerting and anomaly detection system provides proactive notification of issues and unusual patterns across all observable metrics and logs. This subphase extends the basic alert rules from Phase 19.4 with more sophisticated detection capabilities. The alerting system supports multiple types of rules: threshold-based (metric above/below value for N consecutive evaluations, with configurable evaluation window), rate-of-change (metric increasing/decreasing faster than threshold), anomaly detection (metric deviates from historical baseline by N standard deviations, using statistical models or lightweight ML), log-pattern (specific log message pattern appears N times in M minutes), composite (combination of multiple conditions with AND/OR logic), and heartbeat (expected event did not occur within expected interval). Each alert rule has: name, description, severity (info, warning, critical, emergency), condition definition (metric or log query, comparison operator, threshold, duration), notification channels (in-app, email, Slack, Discord, PagerDuty, webhook, SMS via Twilio), cooldown period (minimum time between re-notifications), auto-resolve (automatically resolve when condition clears for N evaluations), and escalation policy (if not acknowledged within N minutes, escalate to higher severity). The anomaly detection component implements lightweight statistical models: moving average with standard deviation bands, exponential smoothing with residual analysis, seasonal decomposition for daily/weekly patterns, and baseline learning with configurable window. Anomaly thresholds are calibrated during a learning period and can be manually tuned per metric. The alert history and post-mortem tracking from Phase 19.4 is shared and extended with runbook links, automated diagnostic information, and suggested remediation steps.

**Copy Source:** litellm (alerting + anomaly detection) + Portkey (monitoring alerts) + Goose (notification system)

**Key Files to Create/Modify:**
```
packages/gateway/src/monitoring/
├── alert-engine.rs                 # Alert evaluation engine (scheduled evaluation)
├── alert-rules.rs                  # Alert rule storage and retrieval
├── alert-notifier.rs              # Alert notification dispatch
├── alert-bookkeeper.rs            # Alert lifecycle tracking
├── anomaly/
│   ├── mod.rs                      # Anomaly detection module
│   ├── detector.rs                 # Main anomaly detector
│   ├── statistical.rs              # Statistical methods (moving average, stddev bands)
│   ├── seasonal.rs                 # Seasonal decomposition (daily, weekly patterns)
│   ├── baseline.rs                 # Baseline learning with configurable window
│   └── calibration.rs             # Auto-calibration during learning period
├── escalation.rs                   # Escalation policy engine
├── notification-channels.rs       # Notification channel implementations
│   ├── email.rs                    # SMTP email notifications
│   ├── slack.rs                    # Slack webhook notifications
│   ├── discord.rs                  # Discord webhook notifications
│   ├── pagerduty.rs                # PagerDuty integration
│   ├── webhook.rs                  # Custom webhook notifications
│   └── sms.rs                      # Twilio SMS notifications (optional)
└── runbook.rs                      # Runbook storage and suggestion

apps/dashboard/src/app/(dashboard)/monitoring/alerts/
├── page.tsx                         # Alert rules list and management
├── [id]/page.tsx                    # Alert detail with history and runbook
├── create/page.tsx                 # Alert rule creation wizard
└── history/page.tsx                # Alert history with timeline

apps/dashboard/src/components/monitoring/
├── AlertRuleWizard.tsx             # Multi-step alert rule creation
├── AlertRuleCard.tsx               # Alert rule summary card
├── AlertDetail.tsx                  # Alert detail with diagnostic info
├── AnomalyConfig.tsx               # Anomaly detection configuration
├── NotificationChannelForm.tsx     # Channel configuration form
├── EscalationPolicyEditor.tsx      # Escalation policy visual editor
└── RunbookViewer.tsx               # Runbook viewer with suggested steps
```

**Acceptance Criteria:**
- Alert rules support threshold, rate-of-change, anomaly, log-pattern, composite, and heartbeat types
- Alert evaluation runs on a configurable schedule (default every 60s) with minimal performance impact
- Anomaly detection correctly identifies metric deviations from learned baselines
- Anomaly detection has a calibration/learning period before active alerting
- Notifications route to all configured channels with correct formatting
- Escalation policies work: if alert not acknowledged in N minutes, escalate to higher severity
- Alert cooldown prevents notification flooding (configurable per rule)
- Auto-resolve works: alert is automatically resolved when condition clears
- Alert history shows full lifecycle: fired → acknowledged → investigating → resolved
- Runbooks provide suggested remediation steps based on alert type and context
- Alert rules can be tested with historical data to validate condition and threshold settings

**Risk Level:** High — Anomaly detection is inherently complex; statistical models must be carefully tuned to avoid false positives (alert fatigue) and false negatives (missed issues); the learning period calibration requires careful UX guidance to set appropriate baselines

---

## Cross-Cutting Concerns (Phases 16–20)

### Security

| Concern | Implementation | Phase |
|---------|---------------|-------|
| CLI credential storage | OS keychain integration (Keytar, Secret Service, Credential Manager) | 16.1, 16.2 |
| Session encryption | AES-256-GCM for sensitive session data at rest | 17.3 |
| Desktop IPC security | Tauri 2.0 capability-based permissions, no Node.js in renderer | 18.1 |
| Dashboard authentication | NextAuth.js with OAuth, SSO, API key auth | 19.1 |
| API key management | Encrypted storage, key rotation, scoped permissions | 19.5 |
| Audit logging | All admin actions logged with before/after state | 19.5 |
| Trace data privacy | Sensitive data redaction in trace attributes | 20.1 |
| Log redaction | Automatic PII/credential masking in all log output | 20.3 |
| Health check auth | Authentication required for detailed health endpoints | 20.4 |

### Performance

| Concern | Target | Phase |
|---------|--------|-------|
| CLI startup time | < 50ms cold start (Rust), < 300ms (Node.js) | 16.1, 16.2 |
| TUI render time | < 10ms per frame, 60fps during streaming | 17.1, 17.4 |
| Desktop idle memory | < 50MB | 18.1 |
| Dashboard page load | < 2s initial, < 200ms subsequent via Next.js RSC | 19.1 |
| Analytics queries | < 2s for 30-day aggregation | 19.3 |
| Health check latency | < 100ms per check, < 1s total | 20.4 |
| Alert evaluation | < 100ms per rule, < 5s for full evaluation cycle | 20.5 |
| Trace export | < 1s to buffer, < 10s to flush | 20.1 |
| Metrics scrape | < 50ms response time for Prometheus scrape | 20.2 |

### Developer Experience

| Concern | Implementation | Phase |
|---------|---------------|-------|
| Shell completions | Dynamic context-aware completions for all shells | 16.4 |
| CLI theming | 20+ built-in themes, custom theme support | 16.5 |
| React DevTools | Debug TUI components with standard React DevTools | 17.2 |
| TUI help overlay | `?` key shows all keybindings | 17.1 |
| Desktop developer mode | React Developer Tools, Tauri inspector, hot reload | 18.1 |
| Dashboard component library | shadcn/ui with Storybook for component development | 19.1 |
| API documentation | OpenAPI/Swagger for all management API endpoints | 19.1 |
| OTEL troubleshooting | Built-in trace viewer for debugging instrumentation | 20.1 |

### Testing Strategy

| Test Type | Scope | Phase |
|-----------|-------|-------|
| CLI integration | All CLI commands against real backends | 16.1, 16.2 |
| TUI snapshot tests | Rendered output comparison for each tab | 17.1 |
| Streaming performance | 200+ tokens/sec throughput verification | 17.4 |
| Desktop E2E | Tauri test harness (WebDriver) for full app flows | 18.1 |
| Offline mode tests | Simulated network disconnection and recovery | 18.3 |
| Auto-update tests | Update download, verification, installation, rollback | 18.5 |
| Dashboard E2E | Playwright tests for all dashboard pages | 19.1 |
| Multi-tenant tests | Role-based access enforcement verification | 19.5 |
| Tracing correctness | Context propagation verification across polyglot services | 20.1 |
| Alert reliability | Alert firing, notification, acknowledgement, resolution | 20.5 |

---

## Phase Dependency Graph

```
Phase 16 (CLI) ─────────────────────────────────────────────────────────
    │                                                                    
    ├── 16.1 (Rust CLI) ── depends on: Phase 0-5 (monorepo, providers, 
    │                         routing), Phase 15 (config unification)
    │
    ├── 16.2 (Ink CLI) ─── depends on: 16.1 (shared config types), 
    │                         Phase 10 (plugin system)
    │
    ├── 16.3 (Command Router) ── depends on: 16.1, 16.2, Phase 11 (ACP)
    │
    ├── 16.4 (Completions) ── depends on: 16.1 (command definitions)
    │
    └── 16.5 (Theming) ─── depends on: Phase 15 (config unification)

Phase 17 (TUI) ─────────────────────────────────────────────────────────
    │
    ├── 17.1 (Ratatui TUI) ── depends on: 16.1 (Rust CLI libs), 16.3
    │
    ├── 17.2 (Ink TUI) ───── depends on: 16.2 (Ink CLI), 16.3
    │
    ├── 17.3 (Session Viewer) ── depends on: 16.1 (session commands), 
    │                                Phase 11 (session management)
    │
    ├── 17.4 (Streaming) ─── depends on: 17.1, 17.2, Phase 3 (streaming)
    │
    └── 17.5 (Multi-Session) ── depends on: 17.1, 17.3, Phase 11 (ACP)

Phase 18 (Desktop) ─────────────────────────────────────────────────────
    │
    ├── 18.1 (Tauri Shell) ── depends on: 17.1 (shared Rust libs), 
    │                             Phase 13 (desktop foundation)
    │
    ├── 18.2 (Tray/Notifications) ── depends on: 18.1 (Tauri), Phase 11
    │
    ├── 18.3 (Offline Mode) ── depends on: 18.1, Phase 12 (local inference)
    │
    ├── 18.4 (Settings UI) ── depends on: 18.1, 16.5 (theming)
    │
    └── 18.5 (Auto-Update) ── depends on: 18.1, Phase 20 (release eng)

Phase 19 (Web Dashboard) ──────────────────────────────────────────────
    │
    ├── 19.1 (Next.js) ──── depends on: Phase 15 (web dashboard base)
    │
    ├── 19.2 (Providers UI) ── depends on: 19.1, Phase 1 (providers)
    │
    ├── 19.3 (Analytics/Billing) ── depends on: 19.1, Phase 7 (billing)
    │
    ├── 19.4 (Monitoring) ── depends on: 19.1, 20.1-20.3 (observability)
    │
    └── 19.5 (User Mgmt) ── depends on: 19.1, Phase 7 (multi-tenant)

Phase 20 (Observability) ─────────────────────────────────────────────
    │
    ├── 20.1 (Tracing) ──── depends on: Phase 9 (telemetry), Phase 3
    │
    ├── 20.2 (Metrics) ──── depends on: 20.1 (OTEL SDK), Phase 9
    │
    ├── 20.3 (Logging) ──── depends on: 20.1 (OTEL SDK)
    │
    ├── 20.4 (Health Checks) ── depends on: 20.1-20.3
    │
    └── 20.5 (Alerting) ──── depends on: 20.2 (metrics), 20.3 (logs), 
                                 20.4 (health), Phase 9
```

---

## Risk Assessment Summary

| Risk | Probability | Impact | Phases Affected | Mitigation |
|------|-------------|--------|-----------------|------------|
| Rust/TypeScript shared types drift | High | Medium | 16.1, 16.2, 17.1, 17.2 | Auto-generate TypeScript types from Rust via wasm-bindgen; CI type check both codebases |
| TUI rendering performance at scale | Medium | High | 17.1, 17.4, 17.5 | Virtual scrolling for session lists, render caching, diff-based re-rendering |
| Desktop cross-platform quirks | High | Medium | 18.1, 18.2, 18.5 | Platform-specific CI runners (macOS, Windows, Linux); Tauri community patterns |
| Offline sync conflicts | Medium | High | 18.3 | CRDT-based conflict resolution for session data; user-in-the-loop for unresolvable conflicts |
| Auto-update signing on all platforms | High | High | 18.5 | CI with hardware security module (HSM) for macOS notarization + Windows Authenticode |
| Next.js build performance | Medium | Low | 19.1 | Modularized build with incremental compilation; lazy loading for infrequent pages |
| Analytics query performance | Medium | Medium | 19.3 | Pre-aggregated rollups for common time ranges; materialized views; query timeout limits |
| Anomaly detection false positives | High | High | 20.5 | Learning period with manual calibration; alert feedback loop for tuning |
| OTEL context propagation across polyglot | Medium | Medium | 20.1 | Shared semantic conventions document; integration tests that verify trace context end-to-end |
| Log volume / storage costs | Medium | Medium | 20.3 | Configurable retention per level; sampling for debug/trace logs; compression |
| Dashboard real-time WebSocket reconnection | Low | Medium | 19.1 | Exponential backoff with jitter; state reconciliation on reconnect |
| Tauri v1 → v2 migration complexity | Medium | Medium | 18.1 | Follow Tauri 2.0 stable migration guide; use compatibility shims where needed |
| Shell completion dynamic query latency | Medium | Low | 16.4 | Cache dynamic completions with background refresh; timeout fallback to static |
| Multi-session TUI memory exhaustion | Medium | High | 17.5 | Hard limit on concurrent sessions; pause background sessions; stream to disk |

---

## Team Allocation (Phases 16–20)

| Subphase | Engineers | Skills Required | Duration |
|----------|-----------|----------------|----------|
| 16.1 (Rust CLI) | 2 | Rust, clap, async, ACP protocol | 3 weeks |
| 16.2 (Ink CLI) | 1 | TypeScript, React, Ink, Node.js | 3 weeks |
| 16.3 (Command Router) | 1 | Rust, WASM, TypeScript bindings | 2 weeks |
| 16.4 (Completions) | 0.5 | Rust, shell scripting (bash/zsh/fish/PowerShell) | 1 week |
| 16.5 (Theming) | 0.5 | Rust, TypeScript, design systems | 1 week |
| 17.1 (Ratatui TUI) | 2 | Rust, ratatui, crossterm, async rendering | 4 weeks |
| 17.2 (Ink TUI) | 1 | TypeScript, React, Ink, streaming rendering | 3 weeks |
| 17.3 (Session Viewer) | 1 | Rust (SQLite), TypeScript (React), full-text search | 2 weeks |
| 17.4 (Streaming Engine) | 1.5 | Rust (tree-sitter), TypeScript, incremental rendering | 3 weeks |
| 17.5 (Multi-Session) | 1 | Rust, async state management, WebSocket | 2 weeks |
| 18.1 (Tauri Shell) | 2 | Rust, Tauri 2.0, React, Vite, Tailwind | 4 weeks |
| 18.2 (Tray/Notifications) | 0.5 | Rust (Tauri), platform-specific APIs | 1 week |
| 18.3 (Offline Mode) | 1.5 | Rust, TypeScript, sync/conflict resolution | 3 weeks |
| 18.4 (Settings UI) | 1 | React, forms, validation, shadcn/ui | 2 weeks |
| 18.5 (Auto-Update) | 1 | Rust, signing, CI/CD, platform installers | 2 weeks |
| 19.1 (Next.js Dashboard) | 2 | Next.js 14+, React, TypeScript, shadcn/ui, Recharts | 4 weeks |
| 19.2 (Providers UI) | 1 | React, forms, wizards, provider configuration | 2 weeks |
| 19.3 (Analytics/Billing) | 1.5 | React (Recharts), SQL aggregation, payment integration | 3 weeks |
| 19.4 (Monitoring) | 1 | React, WebSocket, distributed tracing visualization | 2 weeks |
| 19.5 (User Mgmt) | 1.5 | React, RBAC/ABAC, audit logging, multi-tenancy | 3 weeks |
| 20.1 (OTEL Tracing) | 2 | Rust (tracing), TypeScript (OTEL SDK), polyglot context propagation | 4 weeks |
| 20.2 (Metrics) | 1 | Rust/TypeScript, Prometheus, OTEL metrics, cardinality management | 2 weeks |
| 20.3 (Logging) | 1 | Rust (tracing), TypeScript (pino), log aggregation, redaction | 2 weeks |
| 20.4 (Health Checks) | 0.5 | Rust, TypeScript, health check patterns, dashboard | 1 week |
| 20.5 (Alerting) | 2 | Rust, statistical anomaly detection, notification channels | 3 weeks |

**Total: ~12–15 engineers over 16 weeks (Phases 16–20)**

Note: Many subphases can run in parallel. Critical path is: 16.1 → 17.1 → 18.1 → 19.1 → 19.3/19.4. Observability (Phase 20) starts in parallel with early phases and instruments services as they become available.

---

## Definition of Done (Phases 16–20)

| Deliverable | Acceptance Criteria |
|-------------|-------------------|
| Rust CLI | All commands functional, < 50ms startup, < 40MB binary, all integrations pass |
| Ink CLI | All commands functional, < 300ms startup, all integrations pass |
| Shell completions | bash, zsh, fish, PowerShell — dynamic where applicable, tested |
| CLI theming | 20+ themes, custom themes, consistent across Rust + Ink CLIs |
| Ratatui TUI | All tabs functional, 60fps idle / 30fps streaming, keyboard navigable |
| Ink TUI | All tabs functional, 60fps streaming, React DevTools debuggable |
| Session viewer | Full-text search, filter, export, encryption, comparison |
| Streaming engine | 200+ tokens/sec, incremental syntax highlighting (15+ languages) |
| Multi-session | 20+ concurrent sessions, instant switching, resource limits |
| Tauri desktop | < 15MB bundle, < 50MB idle, all tray/notification features |
| Offline mode | Automatic detection, local inference fallback, queue + sync, conflict resolution |
| Desktop settings | All categories, real-time validation, multi-profile, export/import |
| Auto-update | Background check, delta updates, signature verification, rollback |
| Next.js dashboard | All pages, auth (OAuth + SSO), real-time WebSocket, PWA, 30+ i18n |
| Provider management | 150+ types, wizard, test, health monitoring, bulk operations |
| Analytics/billing | Usage, costs, budgets, invoices, interactive charts, export |
| System monitoring | Health overview, service logs, distributed tracing, alert management |
| User management | RBAC, teams, audit log, API keys, multi-tenant isolation |
| OTEL tracing | Polyglot instrumentation, context propagation, semantic conventions, Langfuse |
| Metrics | Counters, histograms, gauges, Prometheus endpoint, Grafana dashboards |
| Logging | Structured JSON, consistent fields, redaction, aggregation, retention |
| Health checks | RFC health check format, all component checks, public status page |
| Alerting | 6 rule types, anomaly detection, multi-channel notifications, escalation |

---

## Phase 16–20 Conclusion

Phases 16–20 complete the user-facing and observability layers of Agentic OS V4. By the end of these phases, the platform provides:

- **Three interaction paradigms**: CLI (fast/scriptable), TUI (full-screen terminal), Desktop (native GUI) — each with a primary (Rust, performant) and secondary (Ink/React, rich) implementation
- **Comprehensive shell integration**: Completions for all major shells, theming for personalization
- **Multi-session agent management**: Run, monitor, and switch between concurrent agent sessions
- **Local-first offline capability**: Full functionality without network connectivity
- **Desktop polish**: Native notifications, tray integration, global hotkeys, auto-update
- **Web-based administration**: Provider management, usage analytics, billing, system monitoring, multi-tenant administration
- **Full observability stack**: Distributed tracing, metrics, structured logging, health checks, intelligent alerting with anomaly detection

These phases transform Agentic OS V4 from a powerful backend platform into a complete, polished user experience suitable for individual developers, teams, and enterprise deployments alike.

---

*End of PART 4 — Phases 16–20*
*Next: PART 5 — Phases 21–25 (Advanced Features, Security Hardening, Enterprise Readiness)*
