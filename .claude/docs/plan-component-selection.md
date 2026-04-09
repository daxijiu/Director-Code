# Agent 核心组件选型矩阵

> 本文档是 `.cursor/plan-02-agent-core.md` 的补充，聚焦选型决策的详细对比。
> 权威计划文档在 `.cursor/` 目录下。

---

## 选型总表

| 组件 | 主选来源 | 补充来源 | 保留现有 |
|------|---------|---------|---------|
| **Agentic 主循环** | open-agent-sdk engine.ts (~400行) | free-code 流式模式 + copilot-chat 钩子 | — |
| **系统 Prompt** | open-agent-sdk buildSystemPrompt | free-code memory context | — |
| **工具执行** | open-agent-sdk executeTools (只读并发/写入串行) | copilot-chat 内部 ID + PreToolUse/PostToolUse | — |
| **上下文管理** | open-agent-sdk compact + microCompact | free-code snip-boundary (Phase 2) | — |
| **流式响应** | free-code AsyncGenerator + for-await | — | — |
| **错误/重试** | open-agent-sdk withRetry + isPromptTooLongError | — | — |
| **对话历史** | open-agent-sdk (成本追踪) + free-code memory | — | — |
| **Provider 层** | open-agent-sdk Provider 抽象 + 流式改造 | — | — |
| **Chat UI** | — | — | ✓ VS Code 核心全部保留 |
| **工具系统** | — | — | ✓ 9 内置 + MCP + 终端工具 |
| **多文件编辑** | — | — | ✓ chatEditing/ |
| **MCP 集成** | — | — | ✓ mcp/ |
| **Agent 注册** | — | — | ✓ chatAgents.ts registerDynamicAgent |
| **权限** | open-agent-sdk canUseTool | copilot-chat hooks | ✓ VS Code 审批 UI |
| **设置/密钥** | — | — | ✓ 扩展现有 chatManagement + ISecretStorageService |

---

## 不采用 copilot-chat ToolCallingLoop 的理由

1. **强依赖 Copilot 基础设施** — IEndpointProvider, IChatMLFetcher, CopilotToken, CAPI 全部绑定 GitHub
2. **过度复杂** — 1882 行中 ~40% 是 OTel/遥测/内联摘要/Hook 等当前不需要的
3. **Intent 系统耦合** — buildPrompt/fetch 由子类实现，涉及 Copilot 特有意图路由
4. **Prompt 构造绑定** — 依赖 @vscode/prompt-tsx 模板系统
5. **认证/配额绑定** — IChatQuotaService, IAuthenticationChatUpgradeService 等

## open-agent-sdk 的优势

- 零外部服务依赖，~400 行自包含
- 清晰的 LLMProvider 接口
- 已有 Anthropic/OpenAI Provider
- compact/retry/hook 模块化可选引入
- 消息格式已标准化（NormalizedMessageParam）
