# 文档 2: Agent 核心改造详细计划

> Phase 1a — Agent 引擎移植与桥接
> 预估工期: 3 周

---

## 一、Agent 循环三方对比与选型

### 三个实现的核心差异

| 维度 | open-agent-sdk QueryEngine | free-code QueryEngine | copilot-chat ToolCallingLoop |
|------|---|---|---|
| **代码量** | ~400 行 | ~1300 行 | ~1882 行 |
| **复杂度** | 低，清晰的 while 循环 | 中，含 slash/UI/Bridge 等 CLI 特有逻辑 | 高，含 OTel/Hook/Intent/Autopilot 等 |
| **Provider 抽象** | 有，`LLMProvider` 接口 | 无独立抽象，嵌在 `query()` 中 | 有，但绑定 Copilot CAPI |
| **工具执行** | 只读并发 / 写入串行 | 通过 `canUseTool` + `runTools` | 通过 VS Code `ToolsService` |
| **上下文压缩** | 有 `compact` + `microCompact` | 有，更成熟（基于 Claude Code） | 无独立 compact（依赖 CAPI 服务端） |
| **重试逻辑** | `withRetry` + 指数退避 + prompt-too-long 恢复 | 更完整（529 重试、前台/后台区分） | 依赖 CAPI 服务端重试 |
| **Hook 系统** | 20 个生命周期钩子 | `canUseTool` 包装 | SessionStart/Stop/SubagentStart/Stop |
| **预算控制** | `maxBudgetUsd` + `estimateCost` | `taskBudget` + `maxTurns` | `toolCallLimit` (最高 200) |
| **流式输出** | 按轮次 yield SDKMessage | 按轮次 yield SDKMessage | 通过 ChatResponseStream 逐 token |
| **GitHub 依赖** | 无 | 需 Anthropic OAuth（可绕过） | 强依赖 GitHub 认证 + CAPI |
| **适配 VS Code 难度** | 低（无 UI/CLI 耦合） | 高（大量 Bun/Ink/CLI 耦合） | 最低但不可用（绑定 Copilot） |

### 选型结论

**主体基于 open-agent-sdk 的 QueryEngine，补充借鉴 free-code 的高级特性：**

| 能力 | 采用来源 | 理由 |
|------|----------|------|
| 核心循环骨架 | **open-agent-sdk** | 最干净，400 行，零外部依赖 |
| LLMProvider 接口 | **open-agent-sdk** | 清晰的 `createMessage` 抽象 |
| NormalizedMessageParam | **open-agent-sdk** | 统一内部消息格式 |
| 工具格式转换 | **open-agent-sdk** `toProviderTool` | 简洁直接 |
| 只读并发/写入串行策略 | **open-agent-sdk** | 成熟模式，free-code 也用 |
| 上下文压缩 (compact) | **open-agent-sdk** + **free-code** 补充 | open-agent-sdk 基础 compact + free-code 的 micro-compact 思路 |
| 重试与容错 | **open-agent-sdk** `withRetry` | 够用；后续可参考 free-code 的 529 策略增强 |
| Prompt Too Long 恢复 | **open-agent-sdk** | compact + retry 组合 |
| 预算控制 | **open-agent-sdk** | `maxBudgetUsd` + `estimateCost` |
| System Prompt 构造 | **参考 free-code** 的丰富上下文 | VS Code 可提供更多项目上下文（git、workspace） |
| Hook 系统 | **open-agent-sdk** 简化版 | 预留接口，Phase 2 ACP 可扩展 |
| SDKMessage 事件协议 | **open-agent-sdk** | 与 free-code 兼容的事件类型 |
| IChatProgress 桥接 | **新建** | VS Code 特有，无可复用来源 |
| VS Code 工具桥接 | **新建** | IToolData ↔ NormalizedTool 转换 |
| Autopilot/task_complete | **参考 copilot-chat** | `task_complete` 工具 + 自动继续逻辑 |
| yieldRequested 支持 | **参考 copilot-chat** | VS Code Agent 框架的特有协议 |

---

## 二、Agent 引擎详细设计

### 2.1 AgentEngine 类 (移植自 open-agent-sdk QueryEngine)

文件: `vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

```typescript
// 核心结构（伪代码，实际将以 TypeScript 实现）

export interface AgentEngineConfig {
  provider: ILLMProviderAdapter;  // 桥接到 ILanguageModelsService
  model: string;
  maxTokens: number;
  maxTurns: number;
  maxBudgetUsd?: number;
  tools: AgentToolDefinition[];
  systemPrompt?: string;
  cwd: string;
  abortSignal?: AbortSignal;
  thinking?: { type: string; budgetTokens?: number };
  hookRegistry?: IAgentHookRegistry;
}

export class AgentEngine {
  private messages: NormalizedMessageParam[] = [];
  private totalUsage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
  private totalCost = 0;
  private turnCount = 0;
  private compactState: AutoCompactState;

  constructor(private config: AgentEngineConfig) {}

  async *submitMessage(userMessage: string): AsyncGenerator<AgentEvent> {
    // 添加用户消息
    this.messages.push({ role: 'user', content: userMessage });

    // 构造系统 prompt
    const systemPrompt = await this.buildSystemPrompt();

    yield { type: 'system', subtype: 'init', ... };

    let turnsRemaining = this.config.maxTurns;

    while (turnsRemaining > 0) {
      // 中止检查
      if (this.config.abortSignal?.aborted) break;

      // 预算检查
      if (this.config.maxBudgetUsd && this.totalCost >= this.config.maxBudgetUsd) break;

      // 自动压缩
      if (shouldAutoCompact(this.messages, this.config.model, this.compactState)) {
        await this.executeHooks('PreCompact');
        const result = await compactConversation(this.config.provider, ...);
        this.messages = result.compactedMessages;
        await this.executeHooks('PostCompact');
      }

      // API 调用 (通过 Provider 抽象)
      let response;
      try {
        response = await withRetry(() =>
          this.config.provider.createMessage({
            model: this.config.model,
            maxTokens: this.config.maxTokens,
            system: systemPrompt,
            messages: microCompactMessages(this.messages),
            tools: this.config.tools.map(toProviderTool),
            thinking: this.config.thinking,
          })
        );
      } catch (err) {
        // Prompt Too Long → compact 恢复
        if (isPromptTooLongError(err) && !this.compactState.compacted) {
          await compactConversation(...);
          turnsRemaining++;
          continue;
        }
        yield { type: 'result', subtype: 'error', ... };
        return;
      }

      // 追踪 usage
      this.trackUsage(response.usage);
      this.messages.push({ role: 'assistant', content: response.content });

      // yield 助手消息
      yield { type: 'assistant', message: { role: 'assistant', content: response.content } };

      // 提取 tool_use
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      if (toolUseBlocks.length === 0) break; // 无工具调用，完成

      // 执行工具（只读并发、写入串行）
      const toolResults = await this.executeTools(toolUseBlocks);

      // yield 工具结果
      for (const result of toolResults) {
        yield { type: 'tool_result', ...result };
      }

      // 将 tool_result 添加到消息
      this.messages.push({ role: 'user', content: toolResults.map(toToolResultBlock) });
      turnsRemaining--;
    }

    yield { type: 'result', subtype: 'success', usage: this.totalUsage, cost: this.totalCost };
  }
}
```

### 2.2 工具执行策略 (移植自 open-agent-sdk)

```typescript
private async executeTools(toolUseBlocks: ToolUseBlock[]): Promise<ToolResult[]> {
  // 分离只读和写入工具
  const readOnly = toolUseBlocks.filter(t => this.isReadOnlyTool(t.name));
  const mutations = toolUseBlocks.filter(t => !this.isReadOnlyTool(t.name));

  const results: ToolResult[] = [];

  // 只读工具并发执行
  if (readOnly.length > 0) {
    const readResults = await Promise.all(
      readOnly.map(t => this.executeSingleTool(t))
    );
    results.push(...readResults);
  }

  // 写入工具串行执行
  for (const tool of mutations) {
    const result = await this.executeSingleTool(tool);
    results.push(result);
  }

  return results;
}

private async executeSingleTool(block: ToolUseBlock): Promise<ToolResult> {
  // 执行 Hook: PreToolUse
  const hookResult = await this.executeHooks('PreToolUse', { toolName: block.name });
  if (hookResult.some(h => h.behavior === 'deny')) {
    return { tool_use_id: block.id, content: 'Tool use denied', is_error: true };
  }

  // 通过 VS Code 工具桥接执行
  try {
    const result = await this.toolBridge.invokeTool(block.name, block.input);
    await this.executeHooks('PostToolUse', { toolName: block.name });
    return { tool_use_id: block.id, content: result };
  } catch (err) {
    return { tool_use_id: block.id, content: String(err), is_error: true };
  }
}
```

### 2.3 工具桥接层 (新建)

文件: `agentEngine/toolBridge.ts`

将 VS Code 的 `ILanguageModelToolsService` 与 Agent 引擎的工具协议对接：

```typescript
export class ToolBridge {
  constructor(
    private toolsService: ILanguageModelToolsService,
    private editingService: IChatEditingService,
  ) {}

  // VS Code IToolData[] → Agent NormalizedTool[]
  getAvailableTools(): AgentToolDefinition[] {
    const vsTools = this.toolsService.getTools();
    return vsTools.map(tool => ({
      name: tool.toolReferenceName || tool.id,
      description: tool.userDescription || tool.displayName,
      inputSchema: tool.inputSchema ? JSON.parse(tool.inputSchema) : { type: 'object', properties: {} },
      isReadOnly: this.isToolReadOnly(tool),
    }));
  }

  // 执行工具
  async invokeTool(name: string, input: unknown): Promise<string> {
    const tool = this.toolsService.getToolByName(name);
    if (!tool) throw new Error(`Tool not found: ${name}`);

    const result = await this.toolsService.invokeTool({
      toolId: tool.id,
      parameters: input,
      // tokenBudget, context 等
    });

    return this.serializeToolResult(result);
  }

  private isToolReadOnly(tool: IToolData): boolean {
    // 基于工具名/类型判断
    const readOnlyTools = ['codebase_search', 'read_file', 'list_dir', 'grep_search'];
    return readOnlyTools.includes(tool.toolReferenceName || '');
  }
}
```

### 2.4 进度桥接层 (新建)

文件: `agentEngine/progressBridge.ts`

将 Agent 引擎的 `AgentEvent` 转换为 VS Code 的 `IChatProgress[]`：

```typescript
export class ProgressBridge {
  // AgentEvent → IChatProgress[]
  convert(event: AgentEvent): IChatProgress[] {
    switch (event.type) {
      case 'assistant': {
        const parts: IChatProgress[] = [];
        for (const block of event.message.content) {
          if (block.type === 'text') {
            parts.push({
              kind: 'markdownContent',
              content: { value: block.text }
            });
          } else if (block.type === 'thinking') {
            parts.push({
              kind: 'thinking',
              value: block.thinking
            });
          }
        }
        return parts;
      }

      case 'tool_use': {
        return [{
          kind: 'toolInvocation',
          toolCallId: event.id,
          toolName: event.name,
          parameters: event.input,
        }];
      }

      case 'tool_result': {
        return [{
          kind: 'toolInvocationComplete',
          toolCallId: event.tool_use_id,
          result: event.content,
        }];
      }

      case 'result': {
        if (event.subtype === 'error') {
          return [{
            kind: 'warning',
            content: { value: event.error || 'Agent encountered an error' }
          }];
        }
        return [];
      }

      default:
        return [];
    }
  }
}
```

### 2.5 DirectorCodeAgent (新建)

文件: `agentEngine/directorCodeAgent.ts`

将 AgentEngine 包装为 VS Code 的 `IChatAgentImplementation`：

```typescript
export class DirectorCodeAgent implements IChatAgentImplementation {
  constructor(
    private engineFactory: AgentEngineFactory,
    private toolBridge: ToolBridge,
    private progressBridge: ProgressBridge,
    private configService: ILanguageModelsConfigurationService,
  ) {}

  async invoke(
    request: IChatAgentRequest,
    progress: (parts: IChatProgress[]) => void,
    history: IChatAgentHistoryEntry[],
    token: CancellationToken
  ): Promise<IChatAgentResult> {
    // 1. 解析用户选择的模型
    const modelId = request.userSelectedModelId || this.getDefaultModel();
    const providerAdapter = this.engineFactory.createProviderAdapter(modelId);

    // 2. 获取可用工具
    const tools = this.toolBridge.getAvailableTools();

    // 3. 创建 Agent 引擎
    const engine = new AgentEngine({
      provider: providerAdapter,
      model: modelId,
      maxTokens: 8192,
      maxTurns: 100,
      tools,
      cwd: this.getWorkingDirectory(request),
      abortSignal: this.tokenToAbortSignal(token),
    });

    // 4. 恢复历史（如果有）
    this.restoreHistory(engine, history);

    // 5. 运行 Agent 循环
    const messageIterator = engine.submitMessage(request.message);

    for await (const event of messageIterator) {
      // 中止检查
      if (token.isCancellationRequested) break;

      // yieldRequested 检查
      if (request.yieldRequested?.()) break;

      // 事件 → 进度
      const progressParts = this.progressBridge.convert(event);
      if (progressParts.length > 0) {
        progress(progressParts);
      }
    }

    return { /* IChatAgentResult */ };
  }

  // CancellationToken → AbortSignal
  private tokenToAbortSignal(token: CancellationToken): AbortSignal {
    const ctrl = new AbortController();
    token.onCancellationRequested(() => ctrl.abort());
    return ctrl.signal;
  }
}
```

---

## 三、从 open-agent-sdk 移植的具体文件清单

| open-agent-sdk 源文件 | 目标文件 | 改动说明 |
|---|---|---|
| `src/engine.ts` | `agentEngine/agentEngine.ts` | 移植核心循环；移除 `crypto.randomUUID`（改用 VS Code `generateUuid`）；将 `executeTools` 改为通过 `ToolBridge` |
| `src/providers/types.ts` | `agentEngine/providers/providerTypes.ts` | 直接移植，几乎不改 |
| `src/providers/anthropic.ts` | `agentEngine/providers/anthropicProvider.ts` | 移植 + 添加流式支持（`messages.stream()` 替代 `messages.create()`） |
| `src/providers/openai.ts` | `agentEngine/providers/openaiProvider.ts` | 移植 + 添加流式支持（SSE 解析） |
| `src/providers/index.ts` | `agentEngine/providers/providerFactory.ts` | 移植 `createProvider` 工厂 |
| `src/utils/retry.ts` | `agentEngine/retry.ts` | 直接移植 |
| `src/utils/compact.ts` | `agentEngine/compact.ts` | 移植 `shouldAutoCompact`, `compactConversation`, `microCompactMessages` |
| `src/utils/tokens.ts` | `agentEngine/tokens.ts` | 移植 `estimateCost`, `estimateMessagesTokens` |
| `src/hooks.ts` | `agentEngine/hooks.ts` | 移植简化版 HookRegistry（保留 PreToolUse/PostToolUse/PreCompact/PostCompact） |
| `src/types.ts` 部分 | `agentEngine/agentEngineTypes.ts` | 提取 `SDKMessage`, `ToolDefinition`, `ToolResult`, `TokenUsage` 等类型 |

---

## 四、从 free-code 参考的特性

| 特性 | free-code 文件 | 如何借鉴 |
|------|----------------|----------|
| System Prompt 丰富上下文 | `QueryEngine.ts` → `processUserInput` | 参考其 git status、项目信息收集模式，但使用 VS Code API 获取 |
| `canUseTool` 权限控制 | `hooks/useCanUseTool.ts` | 参考其权限拒绝记录模式，与 VS Code 的 `ChatPermissionLevel` 对齐 |
| `maxTurns` + `taskBudget` 双重限制 | `QueryEngine.ts` | 在 AgentEngine 中同时支持轮次限制和预算限制 |
| Transcript 记录 | `QueryEngine.ts` → transcript 部分 | 可选功能，后续加入调试/日志 |
| Retry 的 529 特殊策略 | `services/api/withRetry.ts` | 记录为后续增强项 |

---

## 五、从 copilot-chat 参考的特性

| 特性 | copilot-chat 文件 | 如何借鉴 |
|------|-------------------|----------|
| Autopilot 自动继续 | `toolCallingLoop.ts` L380-401 | 参考 `task_complete` 工具 + 自动继续逻辑，在 `permissionLevel === 'autopilot'` 时启用 |
| yieldRequested 协议 | `toolCallingLoop.ts` L883-889 | 在 `invoke()` 循环中检查，非 autopilot 时响应 yield |
| toolCallLimit 自动扩展 | `toolCallingLoop.ts` L870-881 | autopilot 模式下自动扩展到 200 |
| Stop Hook 阻止停止 | `toolCallingLoop.ts` L289-328 | 参考其 hook 可以阻止 Agent 停止的模式 |
| OTel 追踪 | `toolCallingLoop.ts` L734-855 | 后续可加入，Phase 1 先不实现 |
| Inline Summarization | `toolCallingLoop.ts` L911-926 | 后续可加入，Phase 1 先不实现 |

---

## 六、实施步骤细分

### Week 1: 引擎骨架

1. 创建 `agentEngine/` 目录结构
2. 移植 `providerTypes.ts`（类型定义）
3. 移植 `agentEngineTypes.ts`（SDKMessage, ToolDefinition 等）
4. 移植 `agentEngine.ts` 核心循环（先不接工具和 Provider，用 mock）
5. 移植 `retry.ts` 和 `compact.ts`
6. 单元测试：纯循环逻辑

### Week 2: Provider + 桥接

1. 移植 `anthropicProvider.ts`（添加流式支持）
2. 移植 `openaiProvider.ts`（添加流式支持）
3. 移植 `providerFactory.ts`
4. 新建 `messageNormalization.ts`（IChatMessage ↔ NormalizedMessageParam）
5. 新建 `toolBridge.ts`（VS Code 工具 → Agent 工具）
6. 单元测试：Provider 调用 + 消息转换

### Week 3: Agent 注册 + 进度桥接

1. 新建 `progressBridge.ts`（AgentEvent → IChatProgress）
2. 新建 `directorCodeAgent.ts`（IChatAgentImplementation）
3. 新建 `agentEngine.contribution.ts`（注册入口）
4. 在 `chat.contribution.ts` 中注册 Agent 和 Provider
5. 集成测试：发消息 → Agent 引擎 → LLM API → 流式输出
6. 工具调用端到端测试

---

## 七、不采用 copilot-chat ToolCallingLoop 的详细理由

1. **强依赖 Copilot 基础设施** — `IEndpointProvider`, `IChatMLFetcher`, `CopilotToken`, CAPI 端点等全部绑定 GitHub Copilot 服务；移除这些依赖等于重写
2. **过度复杂** — 1882 行代码中约 40% 是 OTel 追踪、遥测、内联摘要、Hook 系统等我们当前不需要的功能
3. **Intent 系统耦合** — `ToolCallingLoop` 是抽象类，`buildPrompt` 和 `fetch` 由 `DefaultIntentRequestHandler` 等子类实现，涉及 Copilot 特有的意图路由体系
4. **Prompt 构造绑定** — 使用 `@vscode/prompt-tsx` 模板系统，与 Copilot 的 prompt 管线深度耦合
5. **认证/配额绑定** — 内含 `IChatQuotaService`、`IAuthenticationChatUpgradeService` 等 Copilot 特有服务

相比之下，open-agent-sdk 的 QueryEngine：
- 零外部服务依赖
- 400 行自包含逻辑
- 清晰的 `LLMProvider` 接口，可以轻松对接任意 LLM
- 已有 Anthropic/OpenAI 两个 Provider 实现
- compact、retry、hook 等功能模块化，可选引入
