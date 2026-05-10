# vscode-copilot-chat 深度分析报告

> 路径: `sub-projects/vscode-copilot-chat/`
> 包名: `copilot-chat` (GitHub Copilot Chat)
> 版本: 0.44.0
> 生成日期: 2026-04-09

---

## 目录

- [一、项目概述与架构](#一项目概述与架构)
- [二、扩展入口与激活](#二扩展入口与激活)
- [三、Chat Participant 注册机制](#三chat-participant-注册机制)
- [四、语言模型 Provider 层](#四语言模型-provider-层)
- [五、ToolCallingLoop — 核心 Agent 循环](#五toolcallingloop--核心-agent-循环)
- [六、BYOK 多供应商支持](#六byok-多供应商支持)
- [七、工具系统](#七工具系统)
- [八、对三种改造方案的影响](#八对三种改造方案的影响)
- [九、关键文件索引](#九关键文件索引)

---

## 一、项目概述与架构

这是 GitHub Copilot Chat 的 VS Code 扩展完整源码，是 VS Code 内置 Copilot 的核心实现。它作为 VS Code 的扩展运行，通过 `vscode.chat.createChatParticipant` 和 `vscode.lm.registerLanguageModelChatProvider` 等 API 与宿主交互。

### 源码三层架构

```
src/
├── extension/     — 产品功能层（Chat participant, 意图处理, 工具, MCP, 会话等）
│   ├── extension/         — 激活入口（vscode / vscode-node / vscode-worker）
│   ├── conversation/      — Chat participant 注册与语言模型接入
│   ├── intents/           — 意图路由与 ToolCallingLoop（核心 Agent 循环）
│   ├── prompt/            — 提示词构造与请求处理
│   ├── prompts/           — prompt-tsx 模板组件
│   ├── tools/             — 语言模型工具注册与实现
│   ├── chatSessions/      — 多种 Agent 会话（Claude, CopilotCLI, cloud）
│   ├── byok/              — Bring-your-own-key 供应商集成
│   ├── agents/            — Agent 侧能力（组织资源等）
│   ├── externalAgents/    — 外部/LM 代理
│   ├── mcp/               — MCP 设置与命令
│   ├── completions/       — 代码补全集成
│   └── ...               — 40+ 其他功能模块
│
├── platform/      — 可注入服务层（认证, 端点, 网络, 遥测, 分词等）
│   ├── authentication/    — Copilot token, GitHub 认证, 升级流程
│   ├── endpoint/          — CAPI 端点, automode, 模型能力
│   ├── networking/        — HTTP/WebSocket fetcher, OpenAI 格式处理
│   ├── chat/              — 会话, 配额, 拦截, 公共类型
│   ├── tokenizer/         — tiktoken 分词
│   ├── otel/              — OpenTelemetry 追踪
│   └── ...               — 40+ 其他服务模块
│
└── util/          — 通用工具层
    ├── common/            — 异步, 缓存, diff, chatResponseStreamImpl 等
    ├── node/              — Node 特定工具
    └── vs/                — VS Code 源码镜像（base, editor, platform, workbench 裁剪片段）
```

### 核心数据流

```
用户输入
  │
  ▼
ChatParticipant Handler (vscode.chat.createChatParticipant)
  │
  ▼
ChatParticipantRequestHandler.getResult()
  │
  ▼
Intent 选择 (DefaultIntentRequestHandler / 其他 Intent)
  │
  ▼
ToolCallingLoop.run()
  │
  ├── buildPrompt() → 构造提示词（prompt-tsx 模板）
  │
  ├── fetch() → ChatMLFetcher / LanguageModelAccess → LLM API
  │      │
  │      ├── Copilot 后端 (CAPI, WebSocket/HTTP)
  │      ├── BYOK 端点 (Anthropic/OpenAI/Gemini/xAI/Azure/自定义)
  │      └── Claude Code / CopilotCLI 会话
  │
  ├── 解析 tool_use → ToolsService.invokeTool()
  │
  ├── tool_result → 下一轮 buildPrompt + fetch
  │
  └── while(true) 循环直到：
        - 无 tool_use (任务完成)
        - task_complete 工具被调用
        - toolCallLimit 达到
        - yieldRequested / 取消
```

---

## 二、扩展入口与激活

### 入口文件

`src/extension/extension/vscode-node/extension.ts`:

```typescript
export function activate(context: ExtensionContext, forceActivation?: boolean) {
  return baseActivate({
    context,
    registerServices,
    contributions: vscodeNodeContributions,
    configureDevPackages,
    forceActivation
  });
}
```

`baseActivate` 在 `src/extension/extension/vscode/extension.ts` 中：
- 装配 `InstantiationService`（IoC 容器）
- 等待实验服务初始化
- 执行 `ContributionCollection`（各功能模块 contribution）

### 激活事件

```json
"activationEvents": [
  "onStartupFinished",
  "onLanguageModelChat:copilot",
  "onUri",
  "onFileSystem:ccreq",
  "onFileSystem:ccsettings"
]
```

---

## 三、Chat Participant 注册机制

### 声明式注册 (package.json)

`contributes.chatParticipants` 声明了多个参与者：

| ID | Name | Modes | 说明 |
|----|------|-------|------|
| `github.copilot.default` | GitHubCopilot | `ask` | 默认问答 |
| `github.copilot.editingSession` | — | `edit` | 编辑会话 |
| `github.copilot.editsAgent` | agent | `agent` | **Agent 模式** (`isAgent:true`, `isEngine:true`) |
| `github.copilot.terminal` | — | — | 终端 |
| `github.copilot.vscode` | — | — | VS Code 问答 |
| `github.copilot.notebook` | — | — | Notebook |

### 运行时注册

`src/extension/conversation/vscode-node/chatParticipants.ts`:

```typescript
class ChatAgents {
  register(): void {
    this._disposables.add(this.registerDefaultAgent());
    this._disposables.add(this.registerEditingAgent());
    this._disposables.add(this.registerEditsAgent());     // Agent 模式
    this._disposables.add(this.registerVSCodeAgent());
    this._disposables.add(this.registerTerminalAgent());
    this._disposables.add(this.registerNotebookDefaultAgent());
    // ...
  }

  private createAgent(name, defaultIntentIdOrGetter, options?) {
    const id = getChatParticipantIdFromName(name);
    const agent = vscode.chat.createChatParticipant(
      id,
      this.getChatParticipantHandler(id, name, defaultIntentIdOrGetter)
    );
    return agent;
  }

  private getChatParticipantHandler(id, name, intent): ChatExtendedRequestHandler {
    return async (request, context, stream, token) => {
      // 配额检查、限流切模型
      const handler = new ChatParticipantRequestHandler(
        context.history, request, stream, token,
        { agentName: name, agentId: id, intentId }, ...
      );
      let result = await handler.getResult();
      return result;
    };
  }
}
```

**关键洞察**：所有 Chat Participant 共用同一个 handler 框架，通过 `intentId` 区分不同行为（Ask/Edit/Agent/Terminal 等）。

---

## 四、语言模型 Provider 层

### 双通道架构

Copilot Chat 扩展存在**两条并行的 LLM 调用路径**：

#### 通道 1: VS Code Language Model API

`src/extension/conversation/vscode-node/languageModelAccess.ts`:

```typescript
private async _registerChatProvider(): Promise<void> {
  const provider: vscode.LanguageModelChatProvider = {
    onDidChangeLanguageModelChatInformation: this._onDidChange.event,
    provideLanguageModelChatInformation: this._provideLanguageModelChatInfo.bind(this),
    provideLanguageModelChatResponse: this._provideLanguageModelChatResponse.bind(this),
    provideTokenCount: this._provideTokenCount.bind(this)
  };
  this._register(vscode.lm.registerLanguageModelChatProvider('copilot', provider));
}
```

这注册了 `vendor: 'copilot'` 的 Language Model Provider，负责：
- 提供模型列表（从 Copilot CAPI + BYOK 配置合并）
- 模型选择器 UI 展示
- 处理外部扩展通过 `vscode.lm.sendChatRequest` 发起的请求

模型列表来源：
```typescript
private async _provideLanguageModelChatInfo(options, token) {
  const allEndpoints = await this._endpointProvider.getAllChatEndpoints();
  const chatEndpoints = allEndpoints.filter(e => e.showInModelPicker || ...);
  const autoEndpoint = await this._automodeService.resolveAutoModeEndpoint(...);
  // 构造模型元数据: name, family, capabilities, multiplier, category 等
}
```

#### 通道 2: 内部 ChatML Fetcher

`src/extension/prompt/node/chatMLFetcher.ts`:

```typescript
class ChatMLFetcherImpl {
  async fetchMany(opts: IFetchMLOptions, token): Promise<ChatResponses> {
    // 直接向 Copilot 后端发请求
    // 支持 WebSocket / HTTP 回退
    // 集成配额/遥测/流式处理
  }
}
```

**关键洞察**：模型选择器走 VS Code LM API（通道 1），但实际 Agent 循环中的 LLM 调用更多走内部的 ChatML Fetcher（通道 2），直连 Copilot 后端。

### 多 Vendor 注册

package.json `contributes.languageModelChatProviders` 声明了多个 vendor:

```json
[
  { "vendor": "copilot",       "displayName": "Copilot" },
  { "vendor": "copilotcli",    "displayName": "Copilot CLI",    "when": "false" },
  { "vendor": "claude-code",   "displayName": "Claude Code",    "when": "false" },
  { "vendor": "anthropic",     "displayName": "Anthropic",      "configuration": {...} },
  { "vendor": "openai",        "displayName": "OpenAI",         "configuration": {...} },
  { "vendor": "google",        "displayName": "Google Gemini",  "configuration": {...} },
  { "vendor": "xai",           "displayName": "xAI",            "configuration": {...} },
  { "vendor": "openrouter",    "displayName": "OpenRouter",     "configuration": {...} },
  { "vendor": "customoai",     "displayName": "OpenAI Compatible", "configuration": {...} },
  { "vendor": "azure",         "displayName": "Azure OpenAI",   "configuration": {...} },
  { "vendor": "ollama",        "displayName": "Ollama",         "configuration": {...} }
]
```

`copilotcli` 和 `claude-code` 使用 `"when": "false"` 条件隐藏，说明这些是内部预留但默认不展示的实验性 vendor。

---

## 五、ToolCallingLoop — 核心 Agent 循环

文件: `src/extension/intents/node/toolCallingLoop.ts` (~1882 行)

### 类设计

```typescript
abstract class ToolCallingLoop<TOptions extends IToolCallingLoopOptions> extends Disposable {
  // 子类必须实现：
  protected abstract buildPrompt(context, progress, token): Promise<IBuildPromptResult>;
  protected abstract getAvailableTools(stream, token): Promise<LanguageModelToolInformation[]>;
  protected abstract fetch(options: ToolCallingLoopFetchOptions, token): Promise<ChatResponse>;

  // 核心状态
  private toolCallResults: Record<string, LanguageModelToolResult2> = {};
  private toolCallRounds: IToolCallRound[] = [];

  // 入口
  public async run(outputStream, token): Promise<IToolCallLoopResult>;
}
```

### 主循环 `_runLoop()`

```typescript
private async _runLoop(outputStream, token, agentSpan?, chatSessionId?): Promise<IToolCallLoopResult> {
  let i = 0;
  let lastResult;

  while (true) {
    // 1. 检查 toolCallLimit
    if (lastResult && i++ >= this.options.toolCallLimit) {
      // Autopilot 模式下自动扩展到 200
      if (permLevel === 'autopilot' && this.options.toolCallLimit < 200) {
        this.options.toolCallLimit = Math.min(Math.round(this.options.toolCallLimit * 3/2), 200);
      } else {
        break; // 触达限制
      }
    }

    // 2. 检查 yieldRequested（VS Code 请求让出）
    if (lastResult && this.options.yieldRequested?.()) {
      if (permLevel !== 'autopilot' || this.taskCompleted) break;
    }

    // 3. 执行单轮
    const result = await this.runOne(outputStream, i, token);
    lastResult = result;
    this.toolCallRounds.push(result.round);

    // 4. 如果响应中无 tool_use，则循环结束
    if (!result.round.toolCalls.length) {
      // 检查 autopilot 自动继续逻辑
      const autopilotContinue = this.getAutopilotContinuation();
      if (autopilotContinue) continue; // 继续循环

      // 执行 Stop Hook（钩子可以阻止停止）
      const stopResult = await this.executeStopHook(...);
      if (stopResult.shouldContinue) continue;

      break; // 真正完成
    }

    // 5. 有 tool_use → 下一轮继续
  }
}
```

### 单轮执行 `runOne()`

每轮包含：
1. `getAvailableTools()` — 获取可用工具列表
2. `createPromptContext()` — 构造提示上下文（含 toolCallResults, toolCallRounds, history）
3. `buildPrompt()` — 子类实现的提示词构造
4. `fetch()` — 子类实现的 LLM 请求
5. 解析响应中的 `tool_use` → `ToolsService.invokeTool()`
6. 将 `tool_result` 存入 `toolCallResults`
7. 返回本轮结果

### Autopilot 模式特性

```typescript
// 1. 确保 task_complete 工具始终可用
protected ensureAutopilotTools(availableTools) {
  if (request.permissionLevel !== 'autopilot') return availableTools;
  // 如果 task_complete 不在列表中，手动添加
}

// 2. 自动继续（模型没调 task_complete 就不算完成）
private getAutopilotContinuation(): string | undefined {
  if (request.permissionLevel !== 'autopilot') return undefined;
  if (this.taskCompleted) return undefined;
  // 返回继续提示语，要求模型调用 task_complete
}

// 3. 自动重试（非限流/配额错误自动重试）
private shouldAutoRetry(response): boolean {
  if (permLevel !== 'autoApprove' && permLevel !== 'autopilot') return false;
  // ...
}

// 4. 工具调用限制自动扩展（最高 200）
```

### Hook 系统

支持 4 种钩子：
- `SessionStart` — 会话开始时，钩子可提供额外上下文
- `SubagentStart` — 子 Agent 启动时
- `Stop` — 循环即将停止时，钩子可阻止停止（返回原因，模型继续处理）
- `SubagentStop` — 子 Agent 即将停止时

---

## 六、BYOK 多供应商支持

### 配置 Schema

package.json 为每个 BYOK vendor 定义了配置 schema：

#### Anthropic / OpenAI / Gemini / xAI

```json
{
  "apiKey": { "type": "string", "secret": true },
  "models": [{
    "id": "string",
    "name": "string",
    "maxInputTokens": "number",
    "maxOutputTokens": "number"
  }]
}
```

#### Custom OpenAI Compatible (customoai)

```json
{
  "models": [{
    "id": "string",
    "name": "string",
    "url": "string — Chat Completions 或 Responses API",
    "apiKey": { "type": "string", "secret": true },
    "toolCalling": "boolean",
    "vision": "boolean",
    "streaming": { "type": "boolean", "default": true },
    "maxInputTokens": "number",
    "maxOutputTokens": "number",
    "requestHeaders": { "type": "object — 额外 HTTP 头（不可覆盖 Authorization 等保留头）" },
    "zeroDataRetentionEnabled": "boolean"
  }]
}
```

#### Azure OpenAI

```json
{
  "apiKey": { "type": "string", "secret": true, "description": "留空则使用 Entra ID" },
  "models": [{
    "id": "string",
    "name": "string",
    "url": "string — Azure 端点",
    "apiVersion": "string",
    "toolCalling": "boolean",
    "vision": "boolean"
  }]
}
```

#### Ollama (本地)

```json
{
  "url": { "type": "string", "default": "http://localhost:11434" },
  "models": [{
    "id": "string",
    "name": "string",
    "toolCalling": "boolean",
    "vision": "boolean"
  }]
}
```

### URL 路由规则

> Base URLs default to Chat Completions API. Explicit API paths including `/responses` or `/chat/completions` are respected.

即扩展内部根据 URL 自动判断使用 Responses API 还是 Chat Completions API。

### 认证机制

| Vendor | 认证方式 |
|--------|----------|
| copilot | GitHub 登录 → Copilot Token → CAPI 端点 |
| anthropic/openai/gemini/xai/openrouter | API Key (SecretStorage) |
| customoai | per-model API Key (SecretStorage) |
| azure | API Key 或 Entra ID (Azure AD + 微软账号) |
| ollama | 无认证（本地） |
| claude-code/copilotcli | CLI 子进程（用户自己的认证） |

### 禁止覆盖的 HTTP 头

扩展内部自动设置鉴权和产品头，用户配置的 `requestHeaders` 不能覆盖：
`authorization`, `api-key`, `content-type`, `openai-intent`, `x-github-api-version`, `x-initiator`, `x-interaction-id`, `x-interaction-type`, `x-onbehalf-extension-id`, `x-request-id`, `x-vscode-user-agent-library-version` 以及 `proxy-*`, `sec-*` 等模式头。

---

## 七、工具系统

### 声明式工具 (package.json)

`contributes.languageModelTools` 注册了大量内置工具，`languageModelToolSets` 定义工具分组（edit/read/search/agent 等）。

### 运行时工具服务

`src/extension/tools/vscode-node/toolsService.ts`:

```typescript
class ToolsService implements IToolsService {
  get tools(): LanguageModelToolInformation[] {
    const tools = vscode.lm.tools;
    // 合并 VS Code 全局工具 + 内部 ToolRegistry
    // 缓存 + 排序 + schema 映射
  }

  async invokeTool(name, params, token): Promise<LanguageModelToolResult2> {
    // 通过 VS Code API 执行工具
    // OTel 追踪 (execute_tool span)
  }
}
```

工具接口定义在 `src/extension/tools/common/toolsService.ts`:
- `invokeTool` / `invokeToolWithEndpoint` — 按名称执行工具
- `getTool` — 获取单个工具信息
- 返回 `LanguageModelToolResult2`

### 与 VS Code 内置工具的关系

Copilot Chat 扩展通过 `vscode.lm.tools` 访问 VS Code 宿主注册的所有工具（包括 EditTool、RunSubagentTool 等内置工具），再与自己的 `ToolRegistry` 合并。这意味着：
- VS Code 内置工具（9 个 + 终端工具）通过宿主提供
- Copilot 扩展自己的工具通过 `ToolRegistry` 额外注册
- 最终合并后的工具集传给 `ToolCallingLoop`

---

## 八、对三种改造方案的影响

### 对方案一（SDK Provider 替换）的重大影响

**发现：Copilot 扩展已经实现了 BYOK 多供应商支持。**

这意味着：
1. **无需从零实现 Provider** — 可以直接参考/复用 Copilot 的 `byok/` 模块，了解它如何将 BYOK 配置转为 `ILanguageModelChatProvider` 响应
2. **配置 schema 可直接参考** — `customoai` 的 schema 已经定义了 URL、apiKey、streaming、toolCalling 等所有必要字段
3. **真正的挑战在 Agent 循环** — `ToolCallingLoop` 是核心，约 1882 行代码，包含 autopilot 逻辑、hook 系统、OTel 追踪、内联摘要等。我们需要实现类似的循环，或者找到方法复用这个类

**具体策略调整**：
- 不需要完全重写 Provider 层 — 可以在 `chatLanguageModels.json` 配置中添加自定义 vendor
- 核心工作转向：确保自定义 vendor 的 Provider 能正确返回模型元数据（特别是 `capabilities.toolCalling` 和 `agentMode`）
- `ToolCallingLoop` 的 `fetch()` 方法是子类实现的，可以在这里接入自定义 Provider

### 对方案二（ACP 协议）的影响

**发现：`chatSessions/` 模块已有多种 Agent 会话类型。**

`src/extension/chatSessions/` 包含：
- Claude Code 会话
- CopilotCLI 会话
- Cloud 会话

这表明 Copilot 扩展内部已经为不同 Agent 类型预留了架构。ACP 协议可以作为另一种会话类型接入。

### 对方案三（CLI 包装器）的影响

**发现：Copilot 扩展已有 `claude-code` vendor 和 `copilotcli` vendor 的声明（虽然 `when: "false"`）。**

这意味着 Copilot 团队自己也在实现 CLI Agent 的集成。我们可以：
1. 参考他们的 `chatSessions/` 实现中 Claude/CopilotCLI 会话的代码模式
2. 将 `when: "false"` 改为 `when: "true"` 看看现有实现能否直接启用
3. 在此基础上扩展更多 CLI Agent

### 核心结论

**Copilot Chat 扩展本身就是我们要替换的"黑盒"的源码。它展示了：**

1. **如何正确实现 `vscode.lm.registerLanguageModelChatProvider`** — `languageModelAccess.ts`
2. **如何构建完整的 Agent 循环** — `ToolCallingLoop` 及其子类
3. **如何处理 BYOK 多供应商** — `byok/` 模块 + package.json 配置
4. **如何集成工具调用** — `ToolsService` + `vscode.lm.tools`
5. **如何处理会话管理** — `chatSessions/` 多会话类型
6. **如何实现 autopilot/自动批准** — `ToolCallingLoop` 中的 autopilot 逻辑

**这个项目是三种方案实施的最重要参考资源。**

---

## 九、关键文件索引

### 核心架构

| 文件 | 说明 |
|------|------|
| `src/extension/extension/vscode-node/extension.ts` | Node 扩展入口 → `baseActivate` |
| `src/extension/extension/vscode/extension.ts` | 共享激活逻辑，IoC 装配 |
| `src/extension/conversation/vscode-node/chatParticipants.ts` | Chat Participant 注册（`vscode.chat.createChatParticipant`） |
| `src/extension/conversation/vscode-node/languageModelAccess.ts` | LM Provider 注册（`vscode.lm.registerLanguageModelChatProvider('copilot')`） |
| `src/extension/prompt/node/chatParticipantRequestHandler.ts` | 请求 handler → intent 路由 |

### Agent 循环

| 文件 | 说明 |
|------|------|
| `src/extension/intents/node/toolCallingLoop.ts` | **核心 Agent 循环**（~1882 行），含 `run()`, `_runLoop()`, `runOne()`, autopilot, hooks |
| `src/extension/prompt/node/defaultIntentRequestHandler.ts` | 默认意图处理器，导入 `ToolCallingLoop` |
| `src/extension/prompt/node/chatMLFetcher.ts` | 内部 LLM 请求器（直连 CAPI, WebSocket/HTTP） |

### 工具系统

| 文件 | 说明 |
|------|------|
| `src/extension/tools/common/toolsService.ts` | `IToolsService` 接口，`invokeTool` |
| `src/extension/tools/vscode-node/toolsService.ts` | 运行时实现，合并 `vscode.lm.tools` + 内部 `ToolRegistry` |
| `src/extension/tools/common/toolNames.ts` | 工具名称常量 |

### 供应商与端点

| 文件 | 说明 |
|------|------|
| `src/extension/byok/` | BYOK 供应商实现（`byokProvider.ts` 等） |
| `src/platform/endpoint/common/endpointProvider.ts` | 端点提供者（CAPI + BYOK） |
| `src/platform/endpoint/common/chatModelCapabilities.ts` | 模型能力判断（`isAnthropicFamily`, `isGeminiFamily`） |
| `src/platform/endpoint/node/automodeService.ts` | Auto 模式端点选择 |
| `src/platform/networking/common/fetch.ts` | OpenAI 函数/工具格式定义 |
| `src/platform/networking/common/openai.ts` | OpenAI 上下文管理 |

### 会话管理

| 文件 | 说明 |
|------|------|
| `src/extension/chatSessions/` | 多种 Agent 会话类型 |
| `src/platform/chat/common/sessionTranscriptService.ts` | 会话转写服务 |
| `src/platform/chat/common/chatSessionService.ts` | 会话生命周期服务 |

### 认证

| 文件 | 说明 |
|------|------|
| `src/platform/authentication/common/authentication.ts` | 认证服务接口 |
| `src/platform/authentication/common/copilotToken.ts` | Copilot Token 管理 |

### 依赖关键包

| 包 | 用途 |
|----|------|
| `@anthropic-ai/sdk` | Anthropic API 调用 |
| `@anthropic-ai/claude-agent-sdk` | Claude Agent SDK（CLI 集成） |
| `@google/genai` | Google Gemini API |
| `@github/copilot` | Copilot 核心 SDK |
| `@vscode/copilot-api` | VS Code Copilot API |
| `@vscode/prompt-tsx` | 提示词模板系统 |
| `@modelcontextprotocol/sdk` | MCP 协议 |
| `@microsoft/tiktokenizer` | Token 计数 |
| `undici` | HTTP 客户端 |
| `openai` | OpenAI SDK（dev dependency） |
