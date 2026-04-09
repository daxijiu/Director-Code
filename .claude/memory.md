# Memory - 项目状态与上下文

## 项目基本信息
- **项目名**: Director-Code（开源 VS Code fork）
- **状态**: Phase 1a Week 1 完成，引擎骨架已创建
- **目标**: 替换内置 Copilot AI Agent，支持用户自配 LLM
- **工作目录**: `/e/Projects/Director-Code/`
- **源码目录**: `/e/Projects/Director-Code/vscode/`

## 权威文档位置

**实施计划（唯一权威）**: `.cursor/` 目录
| 文档 | 内容 |
|------|------|
| `.cursor/plan-01-roadmap.md` | 总体路线图、架构设计、选型总表、里程碑 |
| `.cursor/plan-02-agent-core.md` | Agent 核心改造：三方选型矩阵、AgentEngine 设计、移植文件清单 |
| `.cursor/plan-03-provider-settings.md` | Provider 与设置：双层架构、流式 Provider、密钥管理 |
| `.cursor/plan-04-phase2-acp.md` | Phase 2 ACP：协议层设计、参考 MCP+vscode-acp |
| `.cursor/plan-05-phase3-cli.md` | Phase 3 CLI：适配器框架、输出解析、外部编辑集成 |
| `.cursor/copilot-chat-extension-analysis.md` | Copilot Chat 源码分析 |

**补充文档**: `.claude/docs/plan-component-selection.md` — 组件选型矩阵

## 实施路线

```
Phase 1: Agent 核心 + Provider 替换 (8-10 周)
  1a. Agent 引擎移植 (3 周) ← 当前阶段，Week 1 完成
  1b. Provider 适配 (2 周)
  1c. 设置页+密钥存储 (2 周)
  1d. 集成联调 (1-2 周)

Phase 2: ACP 协议扩展 (6-8 周)
Phase 3: CLI 包装器 (4-5 周)
```

## 核心设计决策（必须记住）

1. **Agent 循环基于 open-agent-sdk QueryEngine（~400行）**，不用 copilot-chat ToolCallingLoop（1882行），因为后者强依赖 GitHub 基础设施
2. **消息格式内部用 Anthropic 格式**（NormalizedMessageParam），各 Provider 负责格式转换
3. **工具不重新实现**，通过 ToolBridge 桥接 VS Code 现有的 ILanguageModelToolsService（9 内置 + MCP）
4. **Agent 通过 registerDynamicAgent 注册**为 Chat Participant，不修改现有 Agent 注册体系
5. **Provider 通过 registerLanguageModelProvider('director-code', provider) 注册**
6. **密钥通过 ISecretStorageService 存储**，键名: `director-code.apiKey.<vendor>.<name>`
7. **`vendor === 'copilot'` 在 languageModels.ts:631 硬编码为默认**，新 vendor 需处理此逻辑
8. **Phase 1 为 Phase 2 ACP 预留扩展点**：统一的 registerDynamicAgent + IChatProgress 输出

## 当前进度：Phase 1a Week 1 完成

### 已创建的文件

```
vscode/src/vs/workbench/contrib/chat/common/agentEngine/
├── providers/
│   └── providerTypes.ts          — LLM Provider 接口 + 标准化消息/流事件类型
├── agentEngineTypes.ts           — AgentEvent, AgentToolDefinition, Hook, Config 类型
├── agentEngine.ts                — 核心 Agentic 循环（IToolExecutor 接口）
├── retry.ts                      — 指数退避重试 + 错误分类
├── tokens.ts                     — Token 估算 + 模型定价表 + 成本计算
└── compact.ts                    — 三层上下文压缩（自动/微/LLM摘要）
```

### AgentEngine 已实现的能力
- While 循环 Agentic 模式
- 工具执行：只读并发(MAX_CONCURRENCY=10) / 变更串行
- 权限检查：canUseTool + IAgentHookRegistry
- 自动上下文压缩（阈值触发 + LLM 摘要）
- 微压缩（截断大工具结果 >50KB）
- 指数退避重试（429/500/502/503/529）
- prompt-too-long 自动恢复
- USD 成本 + Token 用量追踪
- max_output_tokens 自动续写恢复
- VS Code UUID 生成（generateUuid）
- AsyncGenerator<AgentEvent> 流式输出

### AgentEngine 的关键接口设计

```typescript
// 工具执行抽象（Week 2 通过 ToolBridge 实现）
interface IToolExecutor {
  invokeTool(name: string, input: unknown): Promise<string>;
  isReadOnlyTool(name: string): boolean;
}

// 构造: new AgentEngine(config, toolExecutor?)
// 执行: for await (const event of engine.submitMessage(prompt)) { ... }
// 状态: engine.getMessages(), engine.getUsage(), engine.getCost()
```

## 下一步计划：Phase 1a Week 2

按 `.cursor/plan-02-agent-core.md` 第六节执行：

### Week 2 任务清单

1. **移植 AnthropicProvider** (`agentEngine/providers/anthropicProvider.ts`)
   - 源: `sub-projects/open-agent-sdk-typescript/src/providers/anthropic.ts` (60行)
   - 改造: 添加 `createMessageStream()` 方法（用 Anthropic SDK 的 `messages.stream()`）
   - 非流式 `createMessage()` 保留（用于 compact 场景）
   - 注意: 需要 `@anthropic-ai/sdk` 依赖

2. **移植 OpenAIProvider** (`agentEngine/providers/openaiProvider.ts`)
   - 源: `sub-projects/open-agent-sdk-typescript/src/providers/openai.ts` (316行)
   - 改造: 添加 `createMessageStream()` 方法（SSE 解析）
   - 消息格式转换: NormalizedMessageParam → OpenAI Chat Completions 格式
   - 工具格式转换: NormalizedTool → OpenAI function tool 格式

3. **移植 ProviderFactory** (`agentEngine/providers/providerFactory.ts`)
   - 根据 apiType 创建对应 Provider 实例
   - 'anthropic-messages' → AnthropicProvider
   - 'openai-completions' → OpenAIProvider

4. **新建 messageNormalization.ts**
   - VS Code IChatMessage ↔ NormalizedMessageParam 双向转换
   - 处理: text, tool_use, tool_result, thinking, image 类型
   - System 消息单独提取到 system prompt

5. **新建 toolBridge.ts**（实现 IToolExecutor 接口）
   - VS Code ILanguageModelToolsService → IToolExecutor 桥接
   - getAvailableTools(): IToolData[] → AgentToolDefinition[]
   - invokeTool(): 通过 ILanguageModelToolsService.invokeTool() 执行
   - isReadOnlyTool(): 基于工具名判断（codebase_search, read_file 等）

6. **单元测试**
   - Provider 调用 + 消息转换
   - 工具桥接

### Week 3 任务预览

1. 新建 progressBridge.ts（AgentEvent → IChatProgress[]）
2. 新建 directorCodeAgent.ts（implements IChatAgentImplementation）
3. 新建 agentEngine.contribution.ts（注册入口）
4. 在 chat.contribution.ts 中注册
5. 端到端集成测试

## 关键参考文件路径

### 需要移植的源文件
- `sub-projects/open-agent-sdk-typescript/src/providers/anthropic.ts` — 60 行，薄封装
- `sub-projects/open-agent-sdk-typescript/src/providers/openai.ts` — 316 行，含完整格式转换
- `sub-projects/open-agent-sdk-typescript/src/providers/index.ts` — createProvider 工厂

### VS Code 需要修改的文件
- `vscode/src/vs/workbench/contrib/chat/common/languageModels.ts` — line 631 默认 vendor 逻辑
- `vscode/src/vs/workbench/contrib/chat/browser/chat.contribution.ts` — 注册新 Agent 和 Provider

### VS Code 需要理解的接口
- `ILanguageModelChatProvider` — languageModels.ts L263
- `IChatAgentImplementation` — chatAgents.ts
- `ILanguageModelToolsService` — tools/languageModelToolsService.ts
- `IChatProgress` — chatService.ts 中的进度事件联合类型
- `ISecretStorageService` — platform/secrets/

## 编码规范提醒

- 所有 import 以 `.js` 结尾
- 接口属性用 `readonly`
- 文件头用 Director-Code Contributors 版权
- 服务用 `createDecorator<IServiceName>('serviceName')` 模式
- 路径深度: `../../../../../base/common/` = 5 级到 base
- 路径深度: `../../../../base/common/` = 4 级（agentEngine 在 common/ 下）
