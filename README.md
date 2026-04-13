<div align="center">
  <h1>Director-Code</h1>
  <h3>Open Source AI Code Editor — Bring Your Own LLM</h3>
  <p>
    A VS Code fork with a built-in AI Agent that works with <strong>your own API keys</strong>.<br/>
    No Copilot subscription required. Supports Anthropic, OpenAI, Gemini, DeepSeek, and any OpenAI-compatible API.
  </p>
</div>

---

## Why Director-Code?

VS Code's Copilot requires a GitHub Copilot subscription and routes all requests through Microsoft's servers. Director-Code replaces the built-in AI with a **fully open, user-controlled Agent** that:

- **Uses your own API keys** — Direct connection to Anthropic, OpenAI, Gemini, or any OpenAI-compatible endpoint (DeepSeek, etc.)
- **Streams responses in real-time** — First token in ~1 second, not a 5-10s blank wait
- **Supports thinking/reasoning models** — Claude Thinking, DeepSeek R1 reasoning chains displayed inline
- **Runs tools like a real Agent** — File read/write, code search, terminal, MCP tools — all with read-only concurrency and safe serial mutations
- **Keeps everything local** — API keys stored in your OS credential store, no telemetry

## Features

### AI Agent Engine
- **Agentic loop**: LLM calls tools, reads results, decides next step — fully autonomous multi-turn execution
- **10 built-in models**: Claude Sonnet/Opus/Haiku, GPT-4o/Mini/o3, Gemini Pro/Flash, DeepSeek Chat/Reasoner
- **Streaming output**: Real-time text and thinking token display via SSE
- **Tool bridge**: 9 built-in VS Code tools + MCP tools, with read-only concurrent / mutation serial execution
- **Auto-compact**: Automatic conversation summarization when context window fills up
- **Retry with backoff**: Exponential retry on rate limits and server errors, prompt-too-long auto-recovery
- **Cost tracking**: Per-model token pricing with real-time cost estimation

### Settings & Configuration
- **Settings Editor**: `Ctrl+Shift+P` → "Director Code: Open Settings"
  - Provider/Model selector with dynamic model dropdown
  - API Key management with save/test/delete per provider
  - Status bar showing current config at a glance
  - Custom Base URL for proxies or compatible APIs
- **Secure storage**: API keys encrypted via OS credential store (not in settings files)

### Architecture
- Fully integrated into VS Code's Chat panel — no extension needed
- Registers as a native Chat Participant via `registerDynamicAgent`
- Models appear in VS Code's model picker under "Director Code"
- Preserves all existing VS Code functionality (extensions, themes, keybindings, etc.)

## Quick Start

### Build from Source (Windows)

```bash
# Clone the repo
git clone https://github.com/daxijiu/Director-Code.git
cd Director-Code

# Install dependencies and build
cd vscode && npm install
npm run watch        # Dev mode (incremental)
# or
cd .. && ./build.sh  # Full build → VSCode-win32-x64/
```

### Configure

1. Launch Director-Code
2. `Ctrl+Shift+P` → **"Director Code: Open Settings"**
3. Select your **Provider** (Anthropic / OpenAI / Gemini)
4. Enter your **API Key** and click **Save**
5. (Optional) Set a custom **Base URL** for DeepSeek or other compatible APIs
6. Open the **Chat panel** and start chatting with `@Director Code`

### Using with DeepSeek (Example)

| Setting | Value |
|---------|-------|
| Provider | OpenAI |
| Model | deepseek-reasoner |
| Base URL | `https://api.deepseek.com/v1` |
| API Key | Your DeepSeek API key |

## Supported Models

| Model | Provider | Type | Context | Notes |
|-------|----------|------|---------|-------|
| claude-sonnet-4-6 | Anthropic | Chat + Tools | 200K | Default model |
| claude-opus-4-6 | Anthropic | Chat + Tools | 200K | Most capable |
| claude-haiku-4-5 | Anthropic | Chat + Tools | 200K | Fastest |
| gpt-4o | OpenAI | Chat + Tools | 128K | |
| gpt-4o-mini | OpenAI | Chat + Tools | 128K | Most affordable |
| o3 | OpenAI | Reasoning | 200K | |
| gemini-2.5-pro | Gemini | Chat + Tools | 1M | Largest context |
| gemini-2.5-flash | Gemini | Chat + Tools | 1M | Fastest |
| deepseek-chat | DeepSeek* | Chat + Tools | 128K | V3 |
| deepseek-reasoner | DeepSeek* | Reasoning | 128K | R1 with thinking |

*DeepSeek uses the OpenAI-compatible API format with a custom Base URL.

## Project Structure

```
Director-Code/
├── vscode/                                    # VS Code source (fork base)
│   └── src/vs/workbench/contrib/chat/
│       ├── common/agentEngine/                # Agent core (model-agnostic)
│       │   ├── agentEngine.ts                 # Agentic loop with streaming
│       │   ├── agentEngineTypes.ts            # Event types & config
│       │   ├── apiKeyService.ts               # Secure key management
│       │   ├── modelCatalog.ts                # 10 model definitions
│       │   ├── compact.ts                     # Context auto-compaction
│       │   ├── retry.ts                       # Exponential backoff
│       │   ├── tokens.ts                      # Cost estimation
│       │   └── providers/                     # LLM API adapters
│       │       ├── anthropicProvider.ts        # Anthropic Messages API + SSE
│       │       ├── openaiProvider.ts           # OpenAI Completions API + SSE
│       │       ├── geminiProvider.ts           # Gemini Generative API + SSE
│       │       └── providerFactory.ts          # Provider routing
│       └── browser/agentEngine/               # VS Code integration
│           ├── agentEngine.contribution.ts     # Registration entry point
│           ├── directorCodeAgent.ts            # Chat Participant impl
│           ├── directorCodeModelProvider.ts    # Model Provider impl
│           ├── toolBridge.ts                   # VS Code tool → Agent bridge
│           ├── progressBridge.ts               # Agent events → Chat UI
│           ├── messageNormalization.ts          # History conversion
│           ├── directorCodeSettingsEditor.ts   # Settings UI
│           ├── apiKeysWidget.ts                # API Key management UI
│           └── providerSettingsWidget.ts       # Provider config UI
├── build.sh                                   # Build script (Windows)
└── CLAUDE.md                                  # Project instructions
```

## Development

```bash
cd vscode

# Compile (fast, ~12s)
npm run gulp -- transpile-client-esbuild

# Run tests (~5s, 278 tests)
node test/unit/node/index.js \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/*.test.ts"

# Watch mode
npm run watch
```

### Test Coverage

| Area | Tests | What's Covered |
|------|-------|---------------|
| Providers | 73 | Anthropic/OpenAI/Gemini request/response/SSE/thinking |
| API Keys | 35 | CRUD, events, connection test, widget logic |
| Settings | 17 | Model catalog, provider switching, config flow |
| Integration | 65 | Registration flow, error handling, config pipeline |
| Engine Core | 20 | Messages, tools, compact, retry, token estimation |
| E2E | 49 | Progress pipeline, streaming deltas, multi-tool, event sequences |
| Model Provider | 19 | Metadata, token counting, model families |
| **Total** | **278** | **All passing** |

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1** | **Done** | Agent Engine + Provider + Settings + Streaming |
| Phase 2 | Planned | ACP protocol — external agent integration |
| Phase 3 | Planned | CLI wrappers — Claude Code / Codex / Gemini CLI |

## License

[MIT](LICENSE)

## Acknowledgments

- Built on [Microsoft VS Code](https://github.com/microsoft/vscode) (MIT License)
- Agent engine architecture inspired by [open-agent-sdk](https://github.com/anthropics/open-agent-sdk-typescript)
- Originally forked from [VSCodium](https://github.com/VSCodium/vscodium)
