# 文档 1: 总体路线图与架构设计

> Director-Code AI Agent 改造实施计划
> 路线: Phase 1 (Agent+Provider) → Phase 2 (ACP) → Phase 3 (CLI)

---

## 一、实施顺序与策略

### 调整后的路线（区别于先前方案）

**先前方案**: 方案三(CLI MVP) → 方案一(SDK Provider) → 方案二(ACP)

**调整后方案**: Phase 1(Agent 核心 + Provider) → Phase 2(ACP 扩展) → Phase 3(CLI 包装器)

**调整理由**:
- Agent 核心循环是所有方案的基础，必须先建立
- open-agent-sdk / free-code 的 Agent 循环实现优于 copilot-chat 的 ToolCallingLoop（更简洁、可控、不依赖 GitHub 认证/CAPI）
- Phase 1 完成后即可用（用户配 API Key 就能用），不需要等 CLI
- Phase 2 的 ACP 协议层在 Phase 1 的 Agent 注册体系上自然扩展
- Phase 3 的 CLI 包装器可并行或后续添加，独立于 Phase 1

### 三阶段概览

```
Phase 1: Agent 核心 + Provider 替换 (8-10 周)
├── 1a. Agent 引擎移植 (3 周)
│     open-agent-sdk 的 QueryEngine + Provider 抽象
│     适配为 VS Code 的 IChatAgentImplementation
├── 1b. Provider 层接入 (2 周)
│     实现 ILanguageModelChatProvider
│     接入 Anthropic / OpenAI 兼容 / Gemini
├── 1c. 设置页与密钥存储 (2 周)
│     扩展现有 chatManagement
│     ISecretStorageService 存 API Key
└── 1d. 集成联调 (1-2 周)
      工具桥接、流式输出、Agent Mode 验证

Phase 2: ACP 协议扩展 (6-8 周)
├── 2a. ACP 协议层 (2 周)
│     参考 MCP 模式定义 AcpRegistry/AcpServerConnection
├── 2b. ACP Agent ↔ Chat UI 桥接 (2 周)
│     registerDynamicAgent 为每个 ACP Agent 注册
├── 2c. Phase 1 Agent 封装为 ACP (1 周)
│     内置 Agent 可选走 ACP
└── 2d. Agent 管理 UI + 测试 (1-2 周)

Phase 3: CLI 包装器 (4-5 周)
├── 3a. CLI 适配器框架 (1 周)
├── 3b. Claude Code / Gemini / Codex 适配 (2 周)
└── 3c. 外部编辑集成 + 配置 UI (1-2 周)
```

---

## 二、Phase 1 总体架构

### 目标架构

```
用户 → Chat UI (保留现有 VS Code 全部 UI)
  │
  ▼
IChatService.sendRequest()  [保留]
  │
  ▼
IChatAgentService.invokeAgent()  [保留]
  │
  ▼
DirectorCodeAgent (implements IChatAgentImplementation)  [新建]
  │
  ├── invoke() 内部:
  │     │
  │     ├── AgentEngine (移植自 open-agent-sdk QueryEngine)  [新建]
  │     │     │
  │     │     ├── while(turnsRemaining > 0)
  │     │     │     ├── autoCompact (if needed)
  │     │     │     ├── provider.sendRequest() → LLM API
  │     │     │     ├── 解析 tool_use
  │     │     │     ├── executeTools() (只读并发/写入串行)
  │     │     │     ├── tool_result → 下一轮
  │     │     │     └── yield SDKMessage → 转为 IChatProgress
  │     │     │
  │     │     └── 支持: compact, retry, budget, hooks
  │     │
  │     └── ProgressBridge  [新建]
  │           SDKMessage → IChatProgress[] 转换
  │
  ▼
ILanguageModelsService.sendChatRequest()  [保留]
  │
  ▼
DirectorCodeModelProvider (implements ILanguageModelChatProvider)  [新建]
  ├── AnthropicAdapter (移植自 open-agent-sdk)
  ├── OpenAIAdapter (移植自 open-agent-sdk)
  ├── GeminiAdapter [新建]
  └── 配置从 ILanguageModelsConfigurationService 读取
  │
  ▼
LLM API (Anthropic / OpenAI / Gemini / 自定义端点)

工具层:
  ILanguageModelToolsService  [保留]
  ├── EditTool, RunSubagentTool, ...  [保留 VS Code 内置工具]
  └── MCP 工具  [保留]
```

### 核心设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Agent 循环实现 | 基于 open-agent-sdk 的 QueryEngine | 简洁清晰，约 400 行；与 Copilot 的 1882 行 ToolCallingLoop 相比更可控 |
| Provider 抽象 | 基于 open-agent-sdk 的 LLMProvider | 干净的 `createMessage` 接口，已有 Anthropic/OpenAI 适配 |
| 工具系统 | 桥接 VS Code 的 ILanguageModelToolsService | 复用 9 个内置工具 + MCP 工具，不重复实现 |
| UI/Chat 框架 | 完全保留 VS Code 现有 | Chat Widget, ChatModel, ChatEditing 等全部保留 |
| 设置系统 | 扩展现有 chatManagement | 已有 ModelsManagementEditor + chatLanguageModels.json |
| 注册方式 | registerDynamicAgent | 运行时注册，无需 package.json 声明 |
| 消息格式 | 内部用 Anthropic 格式（规范化） | 与 open-agent-sdk 一致，各 Provider 负责格式转换 |
| 流式输出 | SDKMessage → IChatProgress 桥接 | Agent 引擎 yield SDKMessage，桥接层转为 VS Code 理解的进度 |

### 为 Phase 2 ACP 预留的扩展点

1. **Agent 注册接口** — Phase 1 的 DirectorCodeAgent 通过 `registerDynamicAgent` 注册，Phase 2 的每个 ACP Agent 也通过同一机制注册
2. **工具调用协议** — Phase 1 使用 VS Code 的 `ILanguageModelToolsService`；Phase 2 的 ACP Agent 可以选择使用 Host 端工具（通过 ACP 请求）或自带工具
3. **Provider 层独立** — Phase 1 的 Provider 可以被 ACP Agent 共享（内置 Agent 用 Provider 调 LLM，外部 Agent 自管 LLM）
4. **进度协议统一** — 所有 Agent（内置/ACP/CLI）最终都输出 `IChatProgress[]`，UI 层无需感知来源差异

---

## 三、各组件来源选型总表

| 组件 | 来源 | 说明 |
|------|------|------|
| Chat UI (Widget, Model, Rendering) | **保留** VS Code 现有 | 不修改 |
| IChatService / ChatService | **保留** VS Code 现有 | 不修改 |
| IChatAgentService / ChatAgentService | **保留** VS Code 现有 | 不修改 |
| IChatEditingService | **保留** VS Code 现有 | 不修改 |
| ILanguageModelToolsService + 内置工具 | **保留** VS Code 现有 | 不修改 |
| MCP 集成 | **保留** VS Code 现有 | 不修改 |
| Agent 注册 (IChatAgentImplementation) | **新建**，使用 VS Code 的 registerDynamicAgent | — |
| Agent 引擎 (核心循环) | **移植** open-agent-sdk QueryEngine | 详见文档 2 |
| LLM Provider 抽象 | **移植** open-agent-sdk LLMProvider | 详见文档 3 |
| Anthropic Provider | **移植** open-agent-sdk AnthropicProvider + 流式改造 | 详见文档 3 |
| OpenAI Provider | **移植** open-agent-sdk OpenAIProvider + 流式改造 | 详见文档 3 |
| 消息格式规范化 | **移植** open-agent-sdk NormalizedMessageParam | — |
| 工具 schema 转换 | **移植** open-agent-sdk toProviderTool | — |
| 重试与容错 | **移植** open-agent-sdk withRetry + isPromptTooLongError | — |
| 上下文压缩 | **移植** open-agent-sdk compact 模块 | — |
| 成本估算 | **移植** open-agent-sdk estimateCost | — |
| System Prompt 构造 | **参考** free-code QueryEngine 的更丰富构造 | 详见文档 2 |
| Hook 系统 | **参考** open-agent-sdk HookRegistry | 简化版，预留 ACP 扩展 |
| SDKMessage → IChatProgress 桥接 | **新建** | 详见文档 2 |
| VS Code 工具 → NormalizedTool 桥接 | **新建** | 详见文档 2 |
| 设置页 UI | **扩展** VS Code 现有 chatManagement | 详见文档 3 |
| API Key 存储 | **使用** VS Code ISecretStorageService | 详见文档 3 |
| ACP 协议层 | **参考** vscode-acp + MCP 模式 | 详见文档 4 |
| CLI 适配器 | **参考** Claudable codex.ts/claude.ts | 详见文档 5 |

---

## 四、文件组织规划

```
vscode/src/vs/workbench/contrib/
├── chat/
│   ├── common/
│   │   └── agentEngine/                    [Phase 1 新建]
│   │       ├── agentEngine.ts              — 核心循环 (移植自 open-agent-sdk engine.ts)
│   │       ├── agentEngineTypes.ts         — 类型定义
│   │       ├── providers/
│   │       │   ├── providerTypes.ts        — LLMProvider 接口 (移植)
│   │       │   ├── anthropicProvider.ts    — Anthropic 适配 (移植+流式改造)
│   │       │   ├── openaiProvider.ts       — OpenAI 兼容适配 (移植+流式改造)
│   │       │   ├── geminiProvider.ts       — Gemini 适配 (新建)
│   │       │   └── providerFactory.ts      — Provider 工厂 (移植)
│   │       ├── messageNormalization.ts     — IChatMessage ↔ NormalizedMessageParam
│   │       ├── toolBridge.ts              — VS Code IToolData ↔ NormalizedTool
│   │       ├── progressBridge.ts          — SDKMessage → IChatProgress[]
│   │       ├── compact.ts                 — 上下文压缩 (移植)
│   │       ├── retry.ts                   — 重试逻辑 (移植)
│   │       └── hooks.ts                   — Hook 注册表 (移植，简化)
│   │
│   ├── browser/
│   │   └── agentEngine/                    [Phase 1 新建]
│   │       ├── directorCodeAgent.ts        — IChatAgentImplementation 实现
│   │       ├── directorCodeModelProvider.ts — ILanguageModelChatProvider 实现
│   │       └── agentEngine.contribution.ts — 注册入口
│   │
│   └── browser/chatManagement/             [Phase 1 扩展]
│       └── (扩展现有文件)
│
├── acp/                                    [Phase 2 新建]
│   ├── common/
│   │   ├── acpTypes.ts
│   │   ├── acpRegistry.ts
│   │   └── acpServerConnection.ts
│   └── browser/
│       ├── acp.contribution.ts
│       └── acpClientImpl.ts
│
└── chat/browser/cliAgents/                 [Phase 3 新建]
    ├── cliAgentTypes.ts
    ├── cliAgentService.ts
    └── adapters/
        ├── claudeCodeAdapter.ts
        ├── codexCliAdapter.ts
        └── geminiCliAdapter.ts
```

---

## 五、里程碑与时间线

| 周次 | 里程碑 | 可交付 |
|------|--------|--------|
| W1-W2 | Agent 引擎移植 | QueryEngine 在 VS Code 内可运行 |
| W3 | Provider 适配 | Anthropic/OpenAI 请求可通，流式输出 |
| W4-W5 | 桥接层完成 | 工具调用通路打通，Agent Mode 可用 |
| W6-W7 | 设置页 + 密钥存储 | 用户可配置 LLM 供应商和 API Key |
| W8-W9 | Phase 1 集成联调 | 端到端可用：配置 → 对话 → 工具调用 → 流式输出 |
| W10 | Phase 1 发布 | 首个可用版本 |
| W11-W14 | Phase 2 ACP | 外部 Agent 通过 ACP 协议接入 |
| W15-W18 | Phase 3 CLI | Claude Code / Gemini CLI 包装器 |

---

## 六、风险总表

| 风险 | 级别 | 阶段 | 应对 |
|------|------|------|------|
| open-agent-sdk 的非流式 Provider 需要改造为真流式 | 高 | Phase 1b | 直接用各家 SDK 的 stream API 重写 |
| VS Code 工具 schema 与 LLM tool schema 不完全兼容 | 中 | Phase 1a | toolBridge 做格式转换 + 白名单测试 |
| 现有 Copilot Agent 的 invoke 调用链可能被其他组件依赖 | 中 | Phase 1a | 保持接口兼容，通过 registerDynamicAgent 新增而非替换 |
| ACP 协议未成熟，可能变化 | 中 | Phase 2 | 做好版本协商，最小化协议依赖 |
| CLI 输出格式不稳定 | 中 | Phase 3 | 版本锁定 + 容错解析 |

---

*详细实施计划见后续文档。*
