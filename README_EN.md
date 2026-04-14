<div align="center">
  <h1>Director-Code</h1>
  <h3>Open Source Intelligent Editor with Three-Layer AI Agent Architecture</h3>
  <p>
    Built on VS Code with a Claude Code-like built-in Agent engine, ACP protocol support for external agents, and CLI tool wrapping.<br/>
    Not just a code editor — an AI workbench for <strong>planning, writing, and knowledge management</strong>.
  </p>
  <p>
    <a href="README.md">中文</a> · <a href="https://github.com/daxijiu/Director-Code/releases">Download</a> · <a href="https://github.com/daxijiu/Director-Code/issues">Feedback</a>
  </p>
</div>

---

## Why Director-Code?

For pure coding, you don't really need a GUI — CLI tools like Claude Code are powerful enough.

But when your work goes beyond coding — **planning, writing documents, organizing knowledge bases, reading large amounts of text** — you need:

- A **visual workbench** with strong AI capabilities — browse file trees, preview docs, compare diffs, search everything
- An Agent that **connects directly to your own LLM** — no Copilot subscription, just your API keys or OAuth login
- An **extensible framework** that can plug in any Agent implementation — built-in engine, ACP protocol agents, or CLI wrappers

Director-Code is built for this.

---

## Core Feature: Three-Layer Agent Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      VS Code Chat UI                         │
│         (File Tree · Doc Preview · Diff View · Search)       │
├────────────┬────────────────────┬────────────────────────────┤
│  Layer 1   │     Layer 2        │       Layer 3              │
│  Built-in  │     ACP Protocol   │       CLI Wrapper          │
│  Agent     │                    │                            │
│ AgentEngine│  External Agent    │  Claude Code / Codex etc.  │
│ Claude Code│  Hot-pluggable     │  spawn + readline          │
│ -like impl │  registerDynamic-  │  Output parsing + editing  │
│            │  Agent unified     │  integration               │
├────────────┴────────────────────┴────────────────────────────┤
│  Anthropic · OpenAI · Gemini · DeepSeek · Any Compatible API │
└──────────────────────────────────────────────────────────────┘
```

### Layer 1: Built-in Agent Engine

Based on [open-agent-sdk](https://github.com/anthropics/open-agent-sdk-typescript) architecture, nearly replicating Claude Code capabilities with native VS Code frontend integration:

- **Agentic loop**: LLM calls tools → reads results → decides next step → fully autonomous multi-turn execution
- **Streaming output**: Real-time text and thinking token display, first token in ~1 second
- **Tool bridge**: 9 built-in VS Code tools + MCP tools, read-only concurrent / mutation serial
- **Context management**: Auto conversation compaction, prompt-too-long recovery, exponential backoff retry
- **Native integration**: Embedded in Chat panel, model picker, editor — not a plugin, a built-in feature

### Layer 2: ACP Protocol Extension (In Development)

Hot-pluggable external agents via [Agent Client Protocol](https://github.com/anthropics/agent-client-protocol):

- Any ACP-compatible agent works like a built-in agent
- Each external agent registered as a Chat Participant via `registerDynamicAgent`
- Shared VS Code tool capabilities (file ops, terminal, permissions)
- Users freely switch between built-in and external agents in the Chat panel

### Layer 3: CLI Wrapper (Planned)

Wrap command-line agent tools into VS Code's visual environment:

- **Claude Code**: Wrapped into a graphical interface, retaining its powerful code understanding
- **Codex CLI**: spawn + readline line-by-line JSON parsing
- **Other CLI tools**: Unified adapter framework for easy integration

---

## Why Not "Just Another AI Code Editor"?

Director-Code is designed not just for coding. It's equally (or more) suited for:

| Scenario | Why You Need Visual UI |
|----------|----------------------|
| **Planning** | Organize multiple docs in a file tree, compare side-by-side |
| **Writing** | Markdown live preview, TOC navigation, formatted editing |
| **Knowledge Management** | Global search across many files, categorized browsing |
| **Reading Long Texts** | Syntax highlighting, folding, bookmarks, split view |
| **File Organization** | Drag-and-drop, batch rename, file comparison |
| **Team Collaboration** | Git integration, change tracking, code review |

---

## Supported LLMs

| Model | Provider | Context | Notes |
|-------|----------|---------|-------|
| Claude Sonnet 4.6 | Anthropic | 200K | Default |
| Claude Opus 4.6 | Anthropic | 200K | Most capable |
| Claude Haiku 4.5 | Anthropic | 200K | Fastest |
| GPT-4o / GPT-4o Mini | OpenAI | 128K | |
| o3 / o3-mini | OpenAI | 200K | Reasoning |
| Gemini 2.5 Pro / Flash | Google | 1M | Largest context |
| DeepSeek Chat / Reasoner | OpenAI Compatible | 128K | Custom Base URL |
| Qwen Plus | OpenAI Compatible | 131K | Alibaba |
| Moonshot v1 Auto | OpenAI Compatible | 128K | Kimi |
| **Any model** | OpenAI/Anthropic Compatible | Custom | Manual model ID input |

5 provider types: Anthropic, OpenAI, Gemini, OpenAI Compatible, Anthropic Compatible.

---

## Quick Start

### Build from Source (Windows)

```bash
git clone https://github.com/daxijiu/Director-Code.git
cd Director-Code/vscode
npm install
npm run watch        # Dev mode (incremental)
```

### Configure

1. Launch Director-Code
2. `Ctrl+Shift+P` → **"Director Code AI Settings"** (or click the gear icon in the Chat panel)
3. Select your **Provider**
4. Enter your **API Key** and click **Save**
5. Open the **Chat panel** and start chatting

---

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1** | Done | Agent Engine + 3 Providers + Streaming + Settings UI |
| **Phase 1.5** | Done | Branding + 5 Providers + Settings UI entry points |
| **Phase 1.5+** | In Progress | OAuth 2.0 + Dynamic model lists + Per-model config |
| Phase 2 | Planned | ACP protocol — external agent integration |
| Phase 3 | Planned | CLI wrappers — Claude Code / Codex / Gemini CLI |

---

## License

[MIT](LICENSE)

## Acknowledgments

- Built on [Microsoft VS Code](https://github.com/microsoft/vscode) (MIT License)
- Agent engine architecture inspired by [open-agent-sdk](https://github.com/anthropics/open-agent-sdk-typescript)
- Originally forked from [VSCodium](https://github.com/VSCodium/vscodium)
