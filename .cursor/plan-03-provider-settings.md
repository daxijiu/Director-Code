# 文档 3: Provider 层与设置页实施计划

> Phase 1b + 1c — LLM Provider 接入与用户配置
> 预估工期: 4 周 (与 Phase 1a 部分并行)

---

## 一、Provider 层架构

### 双层 Provider 设计

```
Layer 1: ILanguageModelChatProvider (VS Code 接口)
│  注册为 vendor: 'director-code'
│  负责: 模型列表、元数据、模型选择器展示
│
└── DirectorCodeModelProvider
      │
      ├── provideLanguageModelChatInfo() → 根据配置返回模型列表
      ├── sendChatRequest() → 路由到 Layer 2
      └── provideTokenCount() → 估算 token 数

Layer 2: LLMProvider (Agent 引擎内部接口，移植自 open-agent-sdk)
│  负责: 实际 API 调用、格式转换
│
├── AnthropicProvider → Anthropic Messages API
├── OpenAIProvider → OpenAI Chat Completions API (兼容 DeepSeek/硅基流动等)
├── GeminiProvider → Google Gemini API [新建]
└── (未来可扩展更多)
```

### Layer 1: DirectorCodeModelProvider

文件: `agentEngine/directorCodeModelProvider.ts`

```typescript
export class DirectorCodeModelProvider implements ILanguageModelChatProvider {
  private readonly _onDidChange = new Emitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private configService: ILanguageModelsConfigurationService,
    private secretStorage: ISecretStorageService,
    private providerFactory: ProviderFactory,
  ) {
    // 监听配置变化
    configService.onDidChangeLanguageModelGroups(() => this._onDidChange.fire());
  }

  async provideLanguageModelChatInfo(
    options: ILanguageModelChatInfoOptions,
    token: CancellationToken
  ): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
    const groups = this.configService.getLanguageModelsProviderGroups();
    const models: ILanguageModelChatMetadataAndIdentifier[] = [];

    for (const group of groups) {
      // 从 chatLanguageModels.json 读取的分组
      const providerModels = this.getModelsForGroup(group);
      models.push(...providerModels);
    }

    return models;
  }

  async sendChatRequest(
    modelId: string,
    messages: IChatMessage[],
    from: ExtensionIdentifier | undefined,
    options: { [name: string]: unknown },
    token: CancellationToken
  ): Promise<ILanguageModelChatResponse> {
    // 1. 解析 modelId → provider + model
    const { provider, apiModel } = this.resolveModel(modelId);

    // 2. 转换消息格式 IChatMessage → NormalizedMessageParam
    const normalized = messages.map(normalizeMessage);

    // 3. 调用 Provider
    const stream = provider.createMessageStream({
      model: apiModel,
      messages: normalized,
      ...options,
    });

    // 4. 返回 AsyncIterable 流
    return {
      stream: this.convertStream(stream),
      result: stream.finalResult,
    };
  }
}
```

### Layer 2: Provider 移植与增强

#### AnthropicProvider (移植自 open-agent-sdk + 流式增强)

```typescript
export class AnthropicProvider implements LLMProvider {
  readonly apiType = 'anthropic-messages' as const;
  private client: Anthropic;

  constructor(opts: { apiKey?: string; baseURL?: string }) {
    this.client = new Anthropic({ apiKey: opts.apiKey, baseURL: opts.baseURL });
  }

  // 非流式（保留，用于 compact 等场景）
  async createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
    // 移植自 open-agent-sdk，基本不改
  }

  // 流式（新增，用于主请求路径）
  async *createMessageStream(params: CreateMessageParams): AsyncGenerator<StreamEvent> {
    const stream = this.client.messages.stream({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages,
      tools: params.tools,
    });

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_delta':
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text };
          } else if (event.delta.type === 'input_json_delta') {
            yield { type: 'tool_input_delta', json: event.delta.partial_json };
          }
          break;
        case 'content_block_start':
          if (event.content_block.type === 'tool_use') {
            yield { type: 'tool_use_start', id: event.content_block.id, name: event.content_block.name };
          }
          break;
        case 'message_stop':
          yield { type: 'message_complete', usage: stream.usage };
          break;
      }
    }
  }
}
```

#### OpenAIProvider (移植自 open-agent-sdk + 流式增强)

```typescript
export class OpenAIProvider implements LLMProvider {
  readonly apiType = 'openai-completions' as const;

  async *createMessageStream(params: CreateMessageParams): AsyncGenerator<StreamEvent> {
    const body = {
      model: params.model,
      max_tokens: params.maxTokens,
      messages: this.convertMessages(params.system, params.messages),
      tools: params.tools ? this.convertTools(params.tools) : undefined,
      stream: true,
    };

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });

    // SSE 解析
    for await (const line of this.readSSELines(response.body)) {
      if (line === '[DONE]') break;
      const data = JSON.parse(line);
      const delta = data.choices?.[0]?.delta;
      if (delta?.content) {
        yield { type: 'text', text: delta.content };
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          yield { type: 'tool_call_delta', index: tc.index, ...tc };
        }
      }
    }
  }
}
```

#### GeminiProvider (新建)

```typescript
export class GeminiProvider implements LLMProvider {
  readonly apiType = 'gemini' as const;

  constructor(opts: { apiKey?: string }) {
    // 使用 Google Generative AI SDK 或原生 fetch
  }

  async createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
    // Gemini API 格式转换
    // NormalizedMessageParam → Gemini Content format
  }

  async *createMessageStream(params: CreateMessageParams): AsyncGenerator<StreamEvent> {
    // Gemini stream API
  }
}
```

---

## 二、设置页实施计划

### 配置数据模型

扩展现有 `ILanguageModelsProviderGroup`，利用 `chatLanguageModels.json`：

```json
[
  {
    "name": "My Anthropic",
    "vendor": "anthropic",
    "apiType": "anthropic-messages",
    "baseURL": "https://api.anthropic.com",
    "models": [
      { "id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6" },
      { "id": "claude-haiku-3-5", "name": "Claude Haiku 3.5" }
    ]
  },
  {
    "name": "DeepSeek",
    "vendor": "deepseek",
    "apiType": "openai-completions",
    "baseURL": "https://api.deepseek.com/v1",
    "models": [
      { "id": "deepseek-chat", "name": "DeepSeek V3" }
    ]
  }
]
```

API Key 不存在此文件中，通过 `ISecretStorageService` 单独存储，键名格式: `director-code.apiKey.<vendor>.<name>`。

### 设置入口

两种方式并存：

1. **标准 Settings** — 通过 `registerConfiguration` 注册配置项（适合简单场景）
2. **模型管理编辑器** — 扩展现有 `ModelsManagementEditor`（适合复杂配置）

#### 标准 Settings 配置项

```typescript
configurationRegistry.registerConfiguration({
  id: 'directorCodeAI',
  title: 'Director Code AI',
  properties: {
    'directorCode.ai.defaultProvider': {
      type: 'string',
      enum: ['anthropic', 'openai', 'gemini', 'custom'],
      default: 'anthropic',
      description: 'Default LLM provider'
    },
    'directorCode.ai.defaultModel': {
      type: 'string',
      default: 'claude-sonnet-4-6',
      description: 'Default model ID'
    },
  }
});
```

#### 模型管理 UI 扩展

在现有 `chatManagement/` 中增加 Director Code 供应商管理：
- 供应商列表（添加/删除/编辑）
- 每个供应商: API 类型、端点 URL、模型列表
- API Key 输入（存入 SecretStorage）
- 连接测试按钮

### API Key 管理

```typescript
class ApiKeyManager {
  constructor(private secretStorage: ISecretStorageService) {}

  async getApiKey(vendor: string, groupName: string): Promise<string | undefined> {
    return this.secretStorage.get(`director-code.apiKey.${vendor}.${groupName}`);
  }

  async setApiKey(vendor: string, groupName: string, key: string): Promise<void> {
    await this.secretStorage.set(`director-code.apiKey.${vendor}.${groupName}`, key);
  }

  async deleteApiKey(vendor: string, groupName: string): Promise<void> {
    await this.secretStorage.delete(`director-code.apiKey.${vendor}.${groupName}`);
  }
}
```

---

## 三、消息格式转换

### IChatMessage ↔ NormalizedMessageParam

文件: `agentEngine/messageNormalization.ts`

```typescript
// VS Code IChatMessage → open-agent-sdk NormalizedMessageParam
export function vsToNormalized(msg: IChatMessage): NormalizedMessageParam {
  const role = msg.role === ChatMessageRole.User ? 'user'
             : msg.role === ChatMessageRole.Assistant ? 'assistant'
             : 'user'; // System 消息单独处理

  const content: NormalizedContentBlock[] = [];
  for (const part of msg.content) {
    switch (part.type) {
      case 'text':
        content.push({ type: 'text', text: part.value });
        break;
      case 'tool_use':
        content.push({ type: 'tool_use', id: part.toolCallId, name: part.name, input: part.parameters });
        break;
      case 'tool_result':
        content.push({ type: 'tool_result', tool_use_id: part.toolCallId, content: part.value });
        break;
      case 'thinking':
        content.push({ type: 'thinking', thinking: Array.isArray(part.value) ? part.value.join('') : part.value });
        break;
      case 'image_url':
        content.push({ type: 'image', source: part.value });
        break;
    }
  }

  return { role, content: content.length === 1 && content[0].type === 'text' ? content[0].text : content };
}

// open-agent-sdk NormalizedMessageParam → VS Code IChatMessage
export function normalizedToVs(msg: NormalizedMessageParam): IChatMessage {
  // 反向转换
}
```

---

## 四、实施步骤

### Week 4-5: Provider 适配

1. 移植 `anthropicProvider.ts` (+ stream 支持)
2. 移植 `openaiProvider.ts` (+ stream 支持)
3. 新建 `geminiProvider.ts`
4. 移植 `providerFactory.ts`
5. 新建 `messageNormalization.ts`
6. 新建 `directorCodeModelProvider.ts`
7. 在 `chat.contribution.ts` 注册: `registerLanguageModelProvider('director-code', provider)`
8. 集成测试：发消息到 Anthropic/OpenAI API 并获得流式响应

### Week 6-7: 设置页

1. 注册标准 Settings 配置项
2. 新建 `ApiKeyManager`
3. 扩展 `chatManagement/chatModelsWidget.ts` 增加 Director Code 供应商区域
4. 实现供应商添加/编辑/删除 UI
5. 实现 API Key 输入 + SecretStorage
6. 实现连接测试功能
7. UI 测试
