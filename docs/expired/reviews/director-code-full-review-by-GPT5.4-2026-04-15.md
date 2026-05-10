# Director-Code 全量代码 Review 报告 by GPT5.4 (2026-04-15)

## 说明

本报告从代码本身重新开始审查，目标是覆盖 Director-Code 从 Phase 1 启动到当前状态的全部自研改造面。

本轮审查遵循以下约束：

- 仅以当前仓库代码、配置、脚本、测试为证据。
- 不参考旧 review 文档。
- 不参考其他 agent 的报告或转录。
- 每完成一个模块，就立即把该模块的发现写入本报告。
- 问题按严重度整理，并补充对应测试覆盖与错位情况。

## 审查范围

本次按“`all_touched_repo`”范围执行，审查对象包括：

- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/`
- `vscode/src/vs/workbench/contrib/chat/browser/tools/`
- `vscode/src/vs/workbench/contrib/chat/browser/widget/`
- `vscode/src/vs/workbench/contrib/chat/browser/widgetHosts/`
- `vscode/src/vs/workbench/contrib/chat/browser/chatManagement/`
- `vscode/src/vs/workbench/contrib/chat/browser/chatSetup/`
- `vscode/src/vs/workbench/contrib/mcp/`
- 根目录构建脚本、品牌脚本、产品元数据
- 与 Director-Code 品牌或行为改造直接相关的 `vscode/src/vs/` 其它路径
- 以上代码对应测试

本次明确排除：

- `sub-projects/`
- 缓存与构建产物
- `node_modules/`
- 其他 agent 的报告、转录与中间产物

## 审查方法

审查顺序按模块推进：

1. `common/agentEngine` 契约与 Provider 层
2. 核心算法与状态机基础
3. 凭据、模型与认证链
4. Browser 侧 Director-Code 集成层
5. 工具运行时与 Chat UI 交界面
6. Chat 其余接线面与 MCP 整树耦合
7. 仓库级 fork 面与构建 / 品牌 / 更新链
8. 测试层总复盘与最终结论

每个模块统一按以下结构记录：

- 审查文件
- 发现的问题
- 影响判断
- 测试覆盖与错位

## 审查进度

- [x] 模块 1: `common/agentEngine` 契约与 Provider 层
- [x] 模块 2: 核心算法与状态机基础
- [x] 模块 3: 凭据、模型与认证链
- [x] 模块 4: Browser 侧 Director-Code 集成层
- [x] 模块 5: 工具运行时与 Chat UI 交界面
- [x] 模块 6: Chat 其余接线面与 MCP 整树耦合
- [x] 模块 7: 构建 / 品牌 / 更新 / 产品元数据横切面
- [x] 模块 8: 测试层总复盘与最终结论

## 模块 1: `common/agentEngine` 契约与 Provider 层

### 审查文件

- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/providerTypes.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/abstractProvider.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/providerFactory.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/anthropicProvider.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/openaiProvider.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/geminiProvider.ts`
- 对应测试：
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/abstractProvider.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/anthropicProvider.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/openaiProvider.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/geminiProvider.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/providerFactory.test.ts`

### 发现的问题

#### [高] `AbstractDirectorCodeProvider.readSSELines()` 在流结束时不会 flush 尾部 buffer，可能丢掉最后一个 SSE 事件

- 问题本质：实现只在读到 `\n` 后才产出 `data:` 行；如果最后一条事件没有以换行结尾，`done === true` 时剩余 buffer 会直接丢弃。
- 可能影响：OpenAI / Anthropic / Gemini 三个 Provider 共用这段底层逻辑，一旦某个兼容服务或代理返回的最后一个 SSE chunk 没有换行，末尾文本、工具参数或完成事件都可能被静默吞掉。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/abstractProvider.ts`

#### [高] `OpenAIProvider` 声称支持 `vision`，但消息转换实际会直接忽略 `image` block

- 问题本质：默认 capabilities 把 `openai-completions` 标成 `vision: true`，但 `convertUserMessage()` / `convertAssistantMessage()` 只处理 `text`、`tool_result`、`tool_use`，没有把图片内容转成 OpenAI 可接受的多模态 message part。
- 可能影响：UI 或上层能力探测会相信该 Provider 支持视觉输入，但真正发请求时图片已在本地被静默丢弃，形成“功能宣称支持、运行时悄悄降级”的假象。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/abstractProvider.ts`、`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/openaiProvider.ts`

#### [高] `OpenAIProvider.convertUserMessage()` 会重排用户消息里的 `tool_result` 和文本顺序

- 问题本质：实现先收集全部 `tool_result`，再统一 push `tool` 角色消息，最后再 push 合并后的 `user` 文本；原始 block 顺序被打散。
- 可能影响：如果一条用户消息本来是“先补充文字，再附上工具结果”或 text/tool_result 交错表达，转换后语义会变成“所有工具结果先发生，所有文本后发生”，可能改变模型对对话时序的理解。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/openaiProvider.ts`

#### [中] `OpenAIProvider` 对 OpenAI-compatible 端点无条件发送 `stream_options.include_usage`

- 问题本质：流式请求里硬编码附带 `stream_options: { include_usage: true }`，没有做 provider 能力探测或兼容性降级。
- 可能影响：部分 OpenAI-compatible 服务并不接受这个字段，可能直接返回 400 或以非标准方式响应，导致“兼容 API”名义支持但实际兼容性打折。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/openaiProvider.ts`

#### [高] `GeminiProvider` 流式路径不会处理 chunk 内的 `error`，可能把远端失败伪装成成功结束

- 问题本质：`createMessage()` 的非流式路径会在 `response.json()` 后检查 `data.error` 并抛错，但 `parseGeminiSSEStream()` 只处理 `candidates` 和 `usageMetadata`，完全忽略流式 chunk 里的 `error`。
- 可能影响：服务端已经明确返回错误时，前端仍可能给出一个空响应加 `message_complete`，把真实故障洗成“成功但没内容”。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/geminiProvider.ts`

#### [高] `GeminiProvider` 为每个 `functionCall` part 重新生成工具 ID，无法稳定重组分片或并发工具调用

- 问题本质：`processStreamPart()` 每次看到 `functionCall` 都调用 `generateGeminiToolId()`；它既不按服务端 chunk 身份去复用 ID，也不维护当前未完成工具调用的状态。
- 可能影响：如果 Gemini 的流式函数调用不是一次完整返回，而是分片、重复补全或同次响应并发多个 `functionCall`，当前实现会生成多个不同 ID，导致工具开始事件和参数分片对不上。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/geminiProvider.ts`

#### [中] `GeminiProvider` 在 `tool_result -> functionResponse` 转换时使用 `'unknown'` 兜底函数名，存在语义漂移

- 问题本质：`convertMessages()` 依赖本次转换过程里的 `toolNameMap` 把 `tool_use_id` 还原成函数名；一旦当前消息数组里拿不到对应 `tool_use`，就直接回退成 `'unknown'`。
- 可能影响：在历史被裁剪、压缩、重放或只保留 `tool_result` 的场景中，Gemini 会收到一个函数名失真的 `functionResponse`，削弱它对工具调用链的理解。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/geminiProvider.ts`

### 测试覆盖与错位

- `abstractProvider.test.ts` 覆盖了基础构造、HTTP 错误、SSE 行读取，但没有覆盖“最后一个 `data:` 行无换行结尾”的尾包场景，因此 `readSSELines()` 的尾部丢包风险完全未被命中。
- `openaiProvider.test.ts` 验证了普通文本流、单个 indexed `tool_call_delta`、以及 `stream_options.include_usage` 被发送，但没有测试多图片消息、多工具并发索引、也没有测试 text 与 `tool_result` 混排时的时序保真。
- `geminiProvider.test.ts` 覆盖了非流式 `data.error`、单个 `functionCall`、基础 thinking/text 流，但没有覆盖流式 `error` chunk，也没有覆盖分片/重复/并发 `functionCall` 的 ID 稳定性问题。
- `providerFactory.test.ts` 只验证工厂分发成功与失败路径，没有覆盖“能力声明与实际实现不一致”这类契约级问题。

## 模块 2: 核心算法与状态机基础

### 审查文件

- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/retry.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/tokens.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/compact.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngineTypes.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`
- 对应测试：
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/retry.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/tokens.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/compact.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/agentEngine.test.ts`

### 发现的问题

#### [严重] `AgentEngine` 根本没有把 `abortSignal` 传给 Provider，请求无法在网络层真正取消

- 问题本质：`submitMessage()` 构造 `requestParams` 时没有带上 `abortSignal`，而三家 Provider 的 `fetch(..., { signal: params.abortSignal })` 全都依赖这个字段。
- 可能影响：用户取消请求时，Engine 最多只能在自己的循环里“停止等待结果”，但真正的网络请求和 SSE 读取不会被中断，后台仍可能继续跑。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

#### [严重] 取消请求会被误报为成功，而且中途产出的半截响应仍可能写入会话

- 问题本质：主循环顶部如果发现 `abortSignal.aborted` 只是 `break`；循环结束后的 `endSubtype` 仍会落到 `success`。同时流式循环里如果中途 `break`，后续仍会 finalize 当前 text/tool block、track usage、push assistant message。
- 可能影响：UI、遥测、调用方会把“用户取消”误读成“成功完成”，而内部状态却已经写入了不完整的 assistant 内容或工具调用。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

#### [严重] 自动压缩失败会被伪装成压缩成功

- 问题本质：`compactConversation()` 自己吞掉异常并返回原始消息；`AgentEngine` 外层又不检查 compaction 是否真的成功，照样写回 `this.messages`、更新 state、发送 `compact_boundary`。
- 可能影响：用户和日志会看到 “Conversation compacted”，但真实上下文可能完全没压缩，属于典型的“假成功”。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/compact.ts`、`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

#### [高] `tool_call_delta` 只用一个 `currentTool` 累积，无法正确重组多工具并发流

- 问题本质：流式处理对 `tool_call_delta` 只维护单个 `{ id, name, input }` 状态，没有按 `index` 或工具 ID 建桶。
- 可能影响：OpenAI 一次响应里并发多个 indexed tool call 时，参数流会互相串台，最终拼出错误的工具输入。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

#### [高] `executeTools()` 会重排模型给出的工具顺序

- 问题本质：实现先批量并发所有只读工具，再串行跑所有 mutation 工具，而不是按模型原始 `tool_use` 顺序执行。
- 可能影响：模型期望的“先写后读验证”或“读写交错”会被引擎重写成另一套顺序，导致行为语义变化。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

#### [高] `CanUseToolResult.updatedInput` 完全没有被实际使用

- 问题本质：`executeSingleTool()` 会调用 `canUseTool()`，但无论返回什么 `updatedInput`，真正执行工具时仍把原始 `block.input` 传给 `invokeTool()`。
- 可能影响：权限层或预处理层即便想规范化、收缩、修正工具输入，也会被主执行路径直接绕过。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`、`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngineTypes.ts`

#### [高] `max_tokens` 恢复策略过于粗暴，可能把结构化工具输出彻底打坏

- 问题本质：只要遇到 `stopReason === 'max_tokens'`，引擎就简单追加一条用户消息：`Please continue from where you left off.`。
- 可能影响：如果模型当时正在输出未闭合的工具 JSON 或半截结构化内容，这种续写提示很容易把后续输出变成普通文本，导致整个工具调用链报废。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

#### [高] 工具参数 JSON 解析失败后被静默包装成 `{ raw: ... }`

- 问题本质：`finalizeToolBlock()` 对 JSON.parse 失败不报错、不回传模型，而是构造一个自定义的 `{ raw: tool.input }` 输入对象。
- 可能影响：多数工具 schema 根本不认识这个字段，最终只会在更后面以晦涩的 schema/validation 错误爆炸，模型也得不到正确纠错信号。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

#### [中] `withRetry()` 的等待阶段不可取消，abort 只能在下一次尝试前生效

- 问题本质：`withRetry()` 虽然会在每轮开头检查 `abortSignal.aborted`，但两次尝试之间的 `setTimeout` 没有绑定 abort。
- 可能影响：用户取消后，已经进入 backoff 的请求仍要把整段等待时间睡完，导致取消响应迟钝。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/retry.ts`

#### [中] `maxInputTokensOverride` 小于缓冲区时会让 auto-compact 永远触发

- 问题本质：`shouldAutoCompact()` 直接用 `maxInputTokensOverride - 13000` 当阈值，没有下界保护。
- 可能影响：当用户把 `maxInputTokens` 配成小于 13000 的合法值时，阈值会变成负数，几乎任何会话都会立刻进入压缩路径。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/compact.ts`

#### [中] 成本统计累加了 cache token，但 `estimateCost()` 完全不计入它们

- 问题本质：`trackUsage()` 会累计 `cache_creation_input_tokens` 和 `cache_read_input_tokens`，但 `estimateCost()` 只按 `input_tokens` / `output_tokens` 计费。
- 可能影响：账面成本会被系统性低估，预算上限和监控结论不可信。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/tokens.ts`、`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

### 测试覆盖与错位

- `agentEngine.test.ts` 名字看起来像主循环测试，但文件开头已经直接说明：它并不实例化真实 `AgentEngine`，只测依赖与 contract。也就是说，取消、工具顺序、多工具流、半状态写回、`canUseTool.updatedInput` 等最危险路径完全没有被真实命中。
- 全部 `chat/test` 范围内没有 `new AgentEngine(...)` 的测试实例，也没有对 `toolExecutor.invokeTool()` / `isReadOnlyTool()` 的真实执行顺序测试。
- `retry.test.ts` 只覆盖“开始前已经 abort”的情况，没有覆盖“重试等待期间被 abort”的场景。
- `tokens.test.ts` 甚至显式把“忽略 cache tokens 的成本计算”写成了当前预期，说明测试在为可能的低估成本背书，而不是帮忙发现问题。
- `compact.test.ts` 覆盖了 compaction 失败时返回原消息，但没有覆盖 `AgentEngine` 外层会不会错误发送 `compact_boundary` 或把失败伪装成成功。

## 模块 3: 凭据、模型与认证链

### 审查文件

- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/oauthService.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/modelCatalog.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/modelResolver.ts`
- 对应测试：
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/apiKeyService.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/oauthService.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/modelResolver.test.ts`

### 发现的问题

#### [严重] OAuth 授权阶段可传入自定义 `clientId`，但 token 交换和刷新阶段又退回使用默认 `config.clientId`

- 问题本质：`startOAuthFlow()` 里使用的是 `effectiveClientId`，但 `handleCallback()` 并没有把这个值持久化到 state；后续 `_exchangeCodeForTokens()` 和 `_refreshAccessToken()` 都直接使用 `config.clientId`。
- 可能影响：只要授权时和换 token / 刷新时不是同一个 `client_id`，登录流程就可能在中途或续期阶段失败，且故障点和起因分离。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/oauthService.ts`

#### [高] OAuth state 在 token 交换前就被删除，失败后既无法安全重试，也丢失排障现场

- 问题本质：`handleCallback()` 在校验 state JSON 后，先 `delete` 掉 secret，再去发 token exchange 请求。
- 可能影响：一旦 exchange 失败，用户必须重新走完整授权流程，且原始 state 与 code_verifier 已被提前清掉，恢复和定位都更难。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/oauthService.ts`

#### [中] 启动后未完成的 OAuth flow state 会无限残留

- 问题本质：`startOAuthFlow()` 会把每次生成的 state 写进 `ISecretStorageService`，但只有 `handleCallback()` 才会清理；中断、关闭浏览器、用户放弃登录等路径都不会回收旧 state。
- 可能影响：Secret Storage 会不断积累废弃 state，属于缓慢增长型存储泄漏。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/oauthService.ts`

#### [中] OAuth 刷新定时器对超长过期时间没有上限保护

- 问题本质：`_scheduleRefresh()` 直接把 `expiresAt - now - buffer` 作为 `setTimeout` delay，没有对 JavaScript 定时器上限做截断。
- 可能影响：如果某些 provider 返回极长有效期，delay 超过定时器上限后会提前触发或行为异常，刷新节奏失真。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/oauthService.ts`

#### [中] OAuth 依赖全局 `crypto` 与 `btoa`，兼容性边界过于乐观

- 问题本质：PKCE 生成直接使用 `crypto.getRandomValues`、`crypto.subtle.digest`、`btoa`，没有任何环境探测或降级。
- 可能影响：在特定 Electron / Node / worker 环境中，若全局对象不可用或行为不一致，OAuth 会在最基础的 PKCE 阶段直接崩掉。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/oauthService.ts`

#### [高] `ApiKeyService.onDidChangeApiKey` 的事件契约已经破裂

- 问题本质：接口注释写的是“event payload is the provider name”，但 model 级 key 变化时实际发出的值是 `openai.gpt-4o` 这类 `provider.modelId` 后缀。
- 可能影响：任何把这个 payload 当成 `ProviderName` 使用的订阅者，都会在 per-model key 场景下收到静默错误输入。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts`

#### [中] model config 变更不会走同一套通知链路，观察者容易错过 per-model 配置更新

- 问题本质：`onDidChangeSecret` 只转发 `SECRET_KEY_PREFIX` 和 `MODEL_KEY_PREFIX`，完全忽略 `MODEL_CONFIG_PREFIX`。
- 可能影响：如果上层 UI 或缓存仅依赖 `onDidChangeApiKey` 做刷新，baseURL / capabilities 的 per-model 变化将不会被通知。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts`

#### [高] `testConnection()` 完全没有超时保护，错误 baseURL 会导致测试按钮长时间挂死

- 问题本质：三种 `_test*` 方法全部直接裸 `fetch`，没有任何 `AbortController` 或超时封装。
- 可能影响：遇到黑洞地址、劣质代理、半开连接或永不返回的服务时，连接测试会无限等待或极长卡住。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts`

#### [中] `getProviderAuthMethod()` 仍然硬编码返回 `api-key`，OAuth 抽象形同虚设

- 问题本质：代码里已经有 `AuthMethod`、`OAUTH_CAPABLE_PROVIDERS`、`OAuthService`，但最终 auth method 解析函数始终返回 `'api-key'`。
- 可能影响：认证体系表面上支持 OAuth 与 API key 双通路，实际上公共服务层并不真正表达这种差异。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts`

#### [中] `resolveProviderOptions()` 的文档承诺与实现不一致

- 问题本质：JSDoc 写的是 “Base URL: per-model → global → provider default；Capabilities: per-model → model catalog → provider defaults”，但实现只返回 per-model/baseURL/globalBaseURL 和 per-model capabilities。
- 可能影响：调用方如果按注释理解，就会误以为这里已经做完完整解析，导致后续集成层重复假设或漏补默认值。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts`

#### [严重] `ModelResolverService` 缓存键没有包含 `apiKey`，不同账号或不同授权状态会共用同一份模型缓存

- 问题本质：`_cacheKey()` 只拼了 `provider` 和 `baseURL`，完全不包含 `apiKey`，也不区分“无 key”与“有 key 但同 provider/baseURL”的场景。
- 可能影响：先在无 key 状态下缓存了 static 列表，后面补上 key 仍可能继续读旧缓存；不同账号切换后也可能继续看到上一个账号可见的模型列表。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/modelResolver.ts`

#### [高] OpenAI 模型解析把“是否 compatible”错误地绑定到 `baseURL` 是否存在，而不是调用方真实 provider

- 问题本质：`_openAIModelToResolved()` 用 `!!baseURL` 决定返回 `openai` 还是 `openai-compatible`。
- 可能影响：当用户给 `openai` provider 配了自定义 proxy baseURL 时，解析结果会被错误标记成 `openai-compatible`；反过来，`openai-compatible` 在某些路径没有 baseURL 时又可能被错标成 `openai`。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/modelResolver.ts`

### 测试覆盖与错位

- `oauthService.test.ts` 覆盖了 `startOAuthFlow()` 里 URL 的 `client_id`，但没有检查 token exchange / refresh 请求体里是否沿用了同一个 `client_id`，因此最关键的一致性问题完全漏测。
- 同一组 OAuth 测试还把“callback 后立即删除 state”写成了成功路径的一部分，却没有覆盖“token exchange 失败时是否应该保留 state 以便重试”。
- `apiKeyService.test.ts` 对 per-model key 变更只检查“事件有没有触发”，不验证 payload 是否仍然符合 `ProviderName` 契约，因此事件载荷破裂没有被发现。
- 这组测试也没有覆盖 `MODEL_CONFIG_PREFIX` 变更是否会通知观察者，更没有覆盖 `getProviderAuthMethod()` 的真实 auth 解析能力。
- `modelResolver.test.ts` 覆盖了“不同 provider 有不同缓存”“不同 baseURL 有不同缓存”，但没有覆盖“不同 API key / 登录状态必须隔离缓存”，这是这条服务最危险的缓存污染路径。

## 模块 4: Browser 侧 Director-Code 集成层

### 审查文件

- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/agentEngine.contribution.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeAgent.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeModelProvider.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/toolBridge.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/progressBridge.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/messageNormalization.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeSettingsEditor.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/providerSettingsWidget.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/apiKeysWidget.ts`
- 对应测试：
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/progressBridge.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/messageNormalization.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/directorCodeModelProvider.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/apiKeysWidget.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/providerSettingsWidget.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/agentRegistration.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/configFlow.test.ts`
- `vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/errorHandling.test.ts`

### 发现的问题

#### [严重] `OAuthService` 与 `ModelResolverService` 在 common 层存在，但 workbench 集成层根本没有注册它们

- 问题本质：browser 侧注册入口只 `registerSingleton(IApiKeyService, ApiKeyService)`；全仓搜索下，`IOAuthService` 和 `IModelResolverService` 只在各自测试里被直接实例化，没有看到对应的 workbench 注册或注入使用。
- 可能影响：OAuth 和动态模型解析虽然在 common 层写好了实现，但产品运行时根本拿不到这些服务，形成“代码存在、功能未接线”的孤岛模块。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/agentEngine.contribution.ts`，以及 `oauthService.ts` / `modelResolver.ts` 在源码树中的无注册事实

#### [高] `agentEngine.contribution.ts` 主动把全局工具自动批准改成默认开启

- 问题本质：只要用户没有显式配置，就会在 workbench 启动阶段写入 `chat.tools.global.autoApprove = true`。
- 可能影响：这不是当前会话内的临时策略，而是直接修改产品的全局安全默认值，让所有工具确认门槛整体下降。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/agentEngine.contribution.ts`

#### [高] `DirectorCodeModelProvider` 仍然绕过 `resolveProviderOptions()`，per-model 配置在标准 Chat 通路里失效

- 问题本质：`DirectorCodeAgent` 调 AgentEngine 时会用 `resolveProviderOptions()`，但 `DirectorCodeModelProvider.sendChatRequest()` 仍然直接调用 `getApiKey(effectiveProvider)` 和全局 `baseURL`。
- 可能影响：per-model API key、per-model baseURL、per-model capabilities 在 Chat 模型选择器这条正式通路里根本不生效，和 Agent 通路语义分裂。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeAgent.ts`、`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeModelProvider.ts`

#### [高] `DirectorCodeModelProvider` 的模型列表完全绕过 `ModelResolverService`，动态模型/API/CDN fallback 全部白做

- 问题本质：`provideLanguageModelChatInfo()` 只从静态 `MODEL_CATALOG` 过滤当前 provider 的模型，再可选拼一个当前配置里的 custom model。
- 可能影响：远端账号真实可见模型、CDN 更新模型、权限差异模型，都不会进入 Chat UI 模型选择器。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeModelProvider.ts`

#### [中] `DirectorCodeModelProvider` 的配置监听没有被释放，存在长生命周期监听泄漏

- 问题本质：构造函数里直接调用 `this.configService.onDidChangeConfiguration(...)`，但类本身既不继承 `Disposable`，也没有保存/dispose 返回值。
- 可能影响：每创建一个新的 provider 实例，就会多挂一个永久配置监听器，在长时间运行的 workbench 中会逐步累积。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeModelProvider.ts`

#### [高] `DirectorCodeModelProvider` 把消息全部降成纯文本，标准模型通路会丢失 richer chat 内容

- 问题本质：`convertMessages()` + `chatMessageToText()` 只保留 `part.type === 'text'` 的内容，其余 part 全部被过滤。
- 可能影响：只要 VS Code Chat 消息里包含更丰富的部分类型，传到 LLM provider 时就会在本地被静默抹平，导致标准模型通路和 Agent 通路上下文能力完全不一致。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeModelProvider.ts`

#### [高] `progressBridge` 默认假设正文一定走 `text_delta`，非流式或降级路径下最终回答可能完全不显示

- 问题本质：`assistant` 事件里的文本被无条件跳过，只渲染 thinking；注释把“正文已经通过 text_delta 渲染”当成既定前提。
- 可能影响：只要 provider 回落到非流式、流式中断、或某些情况下没有增量 `text_delta`，用户最终可能只看到工具进度和 thinking，看不到真正回答。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/progressBridge.ts`

#### [高] `messageNormalization` 会抹掉历史中的工具链和过程信息，续轮对话只剩文字表面

- 问题本质：`historyToNormalizedMessages()` 只提取 `entry.request.message` 和响应里的 markdown/text，明确跳过 thinking、progress、tool invocations 等。
- 可能影响：多轮会话里，模型失去“之前调用过哪些工具、拿到过什么结果”的真实上下文，只能看到最终展示给用户的文本。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/messageNormalization.ts`

#### [中] `requestToUserMessage()` 只返回 `request.message`，忽略 request 上的其它结构化上下文

- 问题本质：函数实现就是 `return request.message || ''`。
- 可能影响：如果请求里还有变量、附件或其它结构化输入信息，这条通路不会显式纳入 AgentEngine 的用户消息构造。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/messageNormalization.ts`

#### [中] `DirectorCodeAgent.invoke()` 只把 subtype === `error` 当失败，其它错误终态仍按“成功完成”返回

- 问题本质：browser 层只对 `resultEvent.subtype === 'error'` 返回 `errorDetails`；`error_max_turns`、`error_max_budget_usd` 等都走普通成功返回。
- 可能影响：即便引擎已经明确给出预算耗尽或轮数耗尽这类失败终态，workbench 层仍可能把结果当正常完成处理。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeAgent.ts`

#### [高] Settings 状态栏和 API Keys 区都只认 provider 级 key，不认 per-model key

- 问题本质：`DirectorCodeStatusBar.refresh()` 和 `ApiKeysWidget.render()` 都只调用 `hasApiKey(provider)`，没有使用 `getModelApiKey()` 或 `resolveProviderOptions()`。
- 可能影响：用户明明给当前模型配了 model-specific key，UI 仍显示 `Not set / Not configured`，造成“实际可用但界面误报未配置”。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeSettingsEditor.ts`、`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/apiKeysWidget.ts`

#### [高] `ApiKeysWidget` 的 “Test Connection” 用的是全局 model/baseURL，而不是当前 provider 的真实解析结果

- 问题本质：测试按钮直接取 `directorCode.ai.baseURL` 和 `directorCode.ai.model`，再配合当前行 provider 去测。
- 可能影响：全局当前 model 是 Claude 时去点 OpenAI 行，或全局 baseURL 指向 DeepSeek 时去点 Anthropic 行，都可能得到假阴性或假阳性。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/apiKeysWidget.ts`

#### [中] `ProviderSettingsWidget` 仍以静态 catalog 驱动选择，并且会把 `anthropic-compatible` 默认模型写成空字符串

- 问题本质：模型下拉来源固定是 `getModelsForProvider(provider)`；当 provider 切到 `anthropic-compatible` 时，`getDefaultModel()` 返回 `''`，`onProviderChanged()` 会把空模型直接写回配置。
- 可能影响：动态模型能力无法反映到设置页；同时某些 provider 切换后会得到一个天然不可用的空 model 配置。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/providerSettingsWidget.ts`、`vscode/src/vs/workbench/contrib/chat/common/agentEngine/modelCatalog.ts`

### 测试覆盖与错位

- `directorCodeModelProvider.test.ts` 文件头已经直说它不测真实 browser 类，只测 common 层依赖逻辑；因此真正的 `sendChatRequest()`、配置监听、消息降级、per-model 配置绕过都没有被命中。
- `apiKeysWidget.test.ts` 和 `providerSettingsWidget.test.ts` 也都只是 “Logic” 级测试，完全没有真实 DOM、真实 widget、真实配置写回与状态同步验证。
- `progressBridge.test.ts` 甚至把“assistant 文本一律不渲染”写成了当前预期，却没有覆盖“没有 `text_delta` 时是否还能看到最终正文”。
- `messageNormalization.test.ts` 只覆盖最简单的 user/assistant 纯文本历史，没有覆盖工具结果、progress message、thinking、变量/附件等真实复杂历史。
- `agentRegistration.test.ts`、`configFlow.test.ts`、`errorHandling.test.ts` 名字看上去像 browser 集成测试，但内容主要仍停留在 common 层服务组合与静态 catalog 一致性检查，没有触达真实 `DirectorCodeAgent`、`DirectorCodeModelProvider` 或 widget 类。

## 模块 5: 工具运行时与 Chat UI 交界面

### 审查文件

- `vscode/src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/widgetHosts/chatQuick.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationPart.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatToolConfirmationSubPart.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatToolOutputPart.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatSimpleToolProgressPart.ts`
- 相关测试：
- `vscode/src/vs/workbench/contrib/chat/test/browser/tools/languageModelToolsService.test.ts`

### 发现的问题

#### [严重] `LanguageModelToolsService.invokeTool()` 仍然把工具执行绑定到“最后一个 request”，而不是当前 `chatRequestId`

- 问题本质：在拿到 session 后，代码直接 `request = model?.getRequests().at(-1)`；后续确认、appendProgress、取消、tracked calls 都基于这个 request 对象继续走。
- 可能影响：只要同一 session 里存在排队请求、重新路由、或工具确认期间又发出新请求，工具就可能被绑到错误的 request 上。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts`

#### [高] streaming 阶段和实际执行阶段对 request 的定位逻辑不一致，工具 UI 可能前后挂在不同消息上

- 问题本质：`beginToolCall()` 在有 `chatRequestId` 时会先按 ID 精确找 request；但真正执行 `invokeTool()` 时又回退为 `getRequests().at(-1)`。
- 可能影响：同一个工具调用的“流式占位 / 确认弹层 / 真正执行结果”可能分别挂到不同 request，造成 UI 状态撕裂。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts`

#### [高] 自动批准与权限等级判断同样偷看“最后一个 request”，会把别的请求的权限级别串进来

- 问题本质：`shouldAutoConfirm()`、`shouldAutoConfirmPostExecution()` 都通过 `model?.getRequests().at(-1)` 读取 `modeInfo.permissionLevel`，函数签名里虽然有 `chatRequestId`，但根本没用。
- 可能影响：A 请求是手动确认，B 请求是 autopilot；如果 B 恰好在队尾，A 的工具也可能被错误地按 autopilot 规则放行。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts`

#### [中] `QuickChat` 默认仍以 `Ask` 模式打开，和 Director-Code 的 agent/tooling 主路径存在产品行为落差

- 问题本质：`chatQuick.ts` 创建 `ChatWidget` 时写死 `defaultMode: ChatMode.Ask`。
- 可能影响：用户从 Quick Chat 入口进入时，默认不会处在 agent/tool-heavy 工作流里，和 Director-Code 主打的 agent 模式形成行为分叉。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/browser/widgetHosts/chatQuick.ts`

### 测试覆盖与错位

- `languageModelToolsService.test.ts` 虽然非常大，但现有 `autopilot finds correct request by chatRequestId` 用例把目标 request 放在数组最后一个位置，刚好与 `getRequests().at(-1)` 的错误实现同向，因此形成了“测试通过但 bug 仍在”的假安全感。
- 我没有看到针对“同一 session 下多个 request 且目标 request 不是最后一个”的测试，也没有看到“streaming 占位 request 与实际执行 request 必须一致”的断言。
- 这层测试对 global auto-approve、streaming correlation、cancelToolCallsForRequest 有不少覆盖，但没有真正压测 queued / reroute / multiple active requests 这类最容易出绑定错误的场景。

## 模块 6: Chat 其余接线面与 MCP 整树耦合

### 审查文件

- `vscode/src/vs/workbench/contrib/chat/common/participants/chatAgents.ts`
- `vscode/src/vs/workbench/contrib/mcp/common/mcpLanguageModelToolContribution.ts`
- `vscode/src/vs/workbench/contrib/mcp/common/mcpSamplingService.ts`
- `vscode/src/vs/workbench/contrib/mcp/browser/mcpAddContextContribution.ts`
- `vscode/src/vs/workbench/contrib/mcp/browser/openPanelChatAndGetWidget.ts`
- 相关测试：
- `vscode/src/vs/workbench/contrib/chat/test/common/participants/chatAgents.test.ts`
- `vscode/src/vs/workbench/contrib/mcp/test/common/mcpSamplingLog.test.ts`

### 发现的问题

#### [严重] MCP sampling 的 “Not Now” 实际会把服务器放行到本次进程结束

- 问题本质：`allowButtons()` 里 “Not Now” 会执行 `this._sessionSets[key].set(server.definition.id, false)`；但 `_getMatchingModelInner()` 判断是否已做会话级授权时只看 `has(server.definition.id)`，完全不看布尔值本身。
- 可能影响：用户点一次“不允许现在发起采样”，下一次同服务器再发起 sampling 请求时就不会再弹确认，等价于被“本次 IDE 会话内永久放行”。
- 证据文件：`vscode/src/vs/workbench/contrib/mcp/common/mcpSamplingService.ts`

#### [严重] Director-Code 默认全局 auto-approve 与 MCP 工具 `allowAutoConfirm` 叠加后，会让非沙箱外部工具直接绕过确认

- 问题本质：`McpToolImplementation.prepareToolInvocation()` 对“非 sandbox 且非只读”的 MCP 工具设置 `confirmationMessages.allowAutoConfirm = true`；而 Director-Code 在启动时又会把 `chat.tools.global.autoApprove` 默认写成 `true`（该点已在前文模块 4 单列）。
- 可能影响：最需要人工确认的外部 MCP 变更型工具，恰恰会在 Director-Code 默认配置下被静默自动批准，安全边界等于被组合逻辑打穿。
- 证据文件：`vscode/src/vs/workbench/contrib/mcp/common/mcpLanguageModelToolContribution.ts`
- 关联证据：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/agentEngine.contribution.ts`

#### [高] `McpAddContextContribution` 没有真正订阅 server capabilities 变化，`MCP Resources...` 菜单状态会卡死

- 问题本质：`hasServersWithResources` 里对 `server.capabilities` 用的是 `read(undefined)` 而不是 `read(reader)`，因此 observable 只依赖 server 列表，不依赖 capability 解析/更新本身。
- 可能影响：server 启动后 capabilities 从未知变为“无 resources”时，菜单可能继续显示；反过来如果后续才暴露 resources，也可能一直不显示。
- 证据文件：`vscode/src/vs/workbench/contrib/mcp/browser/mcpAddContextContribution.ts`

#### [高] `registerDynamicAgent()` 没有重复 ID 防护，动态 agent 可以静默覆盖已有 agent

- 问题本质：静态 `registerAgent()` 会对重复 ID 直接抛错；但 `registerDynamicAgent()` 只是 `this._agents.set(data.id, agent)`，完全不检查旧值。
- 可能影响：一旦未来 ACP/MCP/其他动态来源注册出同名 agent，旧 agent 会被无提示顶掉；更糟的是先前 disposer 触发时会直接 `delete(data.id)`，把后注册的 agent 一起删掉。
- 证据文件：`vscode/src/vs/workbench/contrib/chat/common/participants/chatAgents.ts`

#### [中] MCP 图片型 `resource_link` 读取失败时被静默降级成空字节，模型和 UI 都拿不到明确错误

- 问题本质：处理 `resource_link` 且 MIME 为图片时，代码执行 `readFile(uri).catch(() => VSBuffer.alloc(0))`，失败后仍把 0 字节数据塞给模型。
- 可能影响：调用方看到的是“工具返回了图片资源”，但模型拿到的是空内容；排查时既没有显式错误，也没有 fallback 为可解释的文本/链接结果。
- 证据文件：`vscode/src/vs/workbench/contrib/mcp/common/mcpLanguageModelToolContribution.ts`

### 测试覆盖与错位

- 我没有找到 `McpSamplingService` 的对应测试，更没有覆盖 “Allow in this Session / Not Now / Never” 三个分支的状态语义；目前只有 `mcpSamplingLog` 层的日志测试，完全碰不到授权状态机。
- `chatAgents.test.ts` 只覆盖静态 `registerAgent()` 和 `registerAgentImplementation()`，没有任何 `registerDynamicAgent()` 的重复 ID、dispose 次序、默认 agent 竞争测试。
- 我没有看到 `McpAddContextContribution`、`openPanelChatAndGetWidget` 或 `McpLanguageModelToolContribution` 的针对性测试；MCP 资源菜单可见性、自动批准边界、`resource_link` 读取失败这些分支都处于未测状态。

## 模块 7: 构建 / 品牌 / 更新 / 产品元数据横切面

### 审查文件

- `build.sh`
- `prepare_vscode.sh`
- `product.json`
- `vscode/product.json`
- `vscode/src/main.ts`
- `vscode/src/vs/platform/environment/common/environmentService.ts`
- `vscode/resources/win32/VisualElementsManifest.xml`
- `vscode/resources/linux/code.desktop`
- `vscode/resources/linux/code-url-handler.desktop`
- `vscode/resources/linux/code.appdata.xml`
- 影响面佐证：
- `vscode/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts`
- `vscode/src/vs/workbench/contrib/welcomeGettingStarted/common/gettingStartedContent.ts`
- `vscode/src/vs/workbench/services/extensionManagement/browser/extensionEnablementService.ts`

### 发现的问题

#### [严重] `product.defaultChatAgent` 仍然整块指向 GitHub Copilot，且这不是纯展示字段，而是被大量运行时代码真实使用

- 问题本质：`vscode/product.json` 的 `defaultChatAgent` 仍保留 `GitHub.copilot` / `GitHub.copilot-chat`、Copilot 条款/隐私/设置/套餐 URL，以及 `GitHub` provider 元数据；`prepare_vscode.sh` 也没有对这一块做任何重写。
- 可能影响：欢迎页、设置跳转、法律文案、扩展启用判定、内置工具/扩展归类等路径仍会把 Director-Code 当成 Copilot 产品处理；这会直接把用户导向 GitHub Copilot 页面，且让一部分运行时逻辑继续围绕 Copilot 扩展 ID 转。
- 证据文件：`vscode/product.json`
- 影响面佐证：`vscode/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts`、`vscode/src/vs/workbench/contrib/welcomeGettingStarted/common/gettingStartedContent.ts`、`vscode/src/vs/workbench/services/extensionManagement/browser/extensionEnablementService.ts`

#### [高] 稳定版 `dataFolderName` 仍然是 `.vscode-oss`，会让 Director-Code 与其他 OSS 构建共享 `argv.json` / 扩展 / policy 路径

- 问题本质：`vscode/product.json` 中 `dataFolderName` 仍为 `.vscode-oss`；`prepare_vscode.sh` 只给 insiders 分支设置了 `.director-code-insiders`，稳定版没有对应改写；而 `main.ts` 与 `environmentService.ts` 都直接用 `productService.dataFolderName` 计算 `argv.json`、`extensions`、`policy.json` 路径。
- 可能影响：稳定版 Director-Code 会与 VSCodium / Code-OSS 在用户主目录级别发生配置和扩展目录串用，导致 profile 污染、迁移边界不清、排障文档与实际路径不一致。
- 证据文件：`vscode/product.json`
- 关联证据：`prepare_vscode.sh`、`vscode/src/main.ts`、`vscode/src/vs/platform/environment/common/environmentService.ts`

#### [高] 主构建脚本仍然无条件执行 `compile-extensions-build`，与仓库自己记录的网络约束和跳过策略相冲突

- 问题本质：`build.sh` 里固定执行 `npm run gulp compile-extensions-build`；但项目自己记录过该步骤在当前网络环境下会因 built-in extensions 下载失败而报错，并明确写了“可直接跳过，不影响 minify 和打包”。
- 可能影响：仓库对外暴露的主构建入口并不满足当前维护环境下的可复现性，用户照着标准脚本跑会在一个已知、可预期的点上失败。
- 证据文件：`build.sh`
- 关联证据：`.claude/memory.md`

#### [中] `prepare_vscode.sh` 通过 `.bak` 方式在工作树内原地备份文件，持续制造脏仓与遗留构建产物

- 问题本质：脚本会直接生成 `product.json.bak`、`package.json.bak`、`resources/server/manifest.json.bak` 等备份文件；这些文件既不自动清理，也没有统一隔离到临时目录。
- 可能影响：构建脚本本身就会让工作树变脏，增加误提交、误删除、review 噪音和“当前文件到底是不是权威源”的混淆。当前仓里仍能看到 `vscode/package.json.bak`、`vscode/resources/server/manifest.json.bak` 的残留，而 `vscode/product.json.bak` 甚至已经以删除态出现在 git 变更里。
- 证据文件：`prepare_vscode.sh`

#### [中] 通用产品级支持/文档/许可链接仍大量指向 Microsoft 或 Copilot 上游页面，品牌和支持链路没有真正收口

- 问题本质：除 `reportIssueUrl`、`licenseUrl`、`downloadUrl` 之外，`serverLicenseUrl`、通用 `documentationUrl`、`releaseNotesUrl`、`requestFeatureUrl`、`tipsAndTricksUrl`、`twitterUrl` 等仍保留 Microsoft/`go.microsoft.com`/`aka.ms` 链接。
- 可能影响：用户从帮助、欢迎页、状态页或法律说明入口跳出去时，仍会落到上游 VS Code / Copilot 页面，出现品牌、文档、条款和实际产品能力不一致的问题。
- 证据文件：`vscode/product.json`
- 关联证据：`prepare_vscode.sh`

### 测试覆盖与错位

- 这类横切面我没有看到任何自动化约束：没有校验 `product.json` 中 Director-Code 关键字段的测试，没有 smoke test 确认 `defaultChatAgent` 已去 Copilot 化，也没有覆盖稳定版 `dataFolderName` 路径的构建后检查。
- 构建脚本层同样缺少最基本的“网络受限环境是否还能跑通主路径”校验；当前更像是靠人工知识库和临时说明兜底，而不是靠脚本自身表达约束。

## 模块 8: 测试层总复盘与最终结论

### 严重度汇总

- 本轮累计记录问题 `57` 个：`10` 个严重、`28` 个高、`19` 个中。
- 从优先级看，最需要立刻处理的不是 UI 细节，而是“权限/确认边界”、“请求绑定一致性”、“产品元数据仍指向 Copilot” 这三条主线。

### 贯穿全局的共性风险

- **显式上下文被隐式“最新状态”替代**：`chatRequestId`、request 队列、permissionLevel、OAuth state 等多处代码都存在“明明有显式 ID，却仍回退读最后一个/当前一个对象”的倾向。这会让系统一旦进入并发、排队、重试或确认弹层路径，就出现错绑。
- **能力声明、产品元数据与真实执行脱节**：Provider capabilities、`DirectorCodeModelProvider`、`defaultChatAgent`、`dataFolderName`、帮助/条款链接都存在“表面声明已完成品牌或能力切换，但底层实际仍走旧路径”的现象。
- **失败被静默洗成成功或无害降级**：流式错误、取消、自动 compact 失败、MCP 资源读取失败、assistant 文本丢失等问题里，很多分支没有显式报错，而是被包装成“空响应”“正常完成”或“无内容”。
- **安全边界被组合逻辑击穿**：单看某一处代码也许只是“默认方便一点”，但 `global autoApprove`、MCP `allowAutoConfirm`、sampling `Not Now` 语义错误、OAuth 清理时机等问题叠加后，实际已经形成可绕过确认与误授权的系统性风险。

### 测试层总缺口

- **大量测试停留在 logic 层，不触达真实 workbench/browser/widget**：这使得浏览器侧注册、产品元数据驱动行为、DOM 状态同步、真实进度渲染等问题很容易漏掉。
- **缺少对“乱序 / 并发 / 多 request”场景的敌对测试**：当前最危险的问题几乎都出在排队请求、streaming 占位与执行分离、多个 request 共存、确认期间状态切换等路径上。
- **缺少安全/权限状态机测试**：MCP sampling、auto-approve、OAuth state 生命周期、tool confirmation 都没有被成体系地验证。
- **缺少产品构建元数据回归测试**：没有任何自动化保证 `defaultChatAgent`、`dataFolderName`、帮助链接、品牌字符串在 fork 后仍保持一致。
- **少数现有测试反而固化了错误行为**：例如把目标 request 恰好放在最后一个位置的测试，或把“assistant 文本不渲染”写成当前预期，都会提供错误的安全感。

### 建议修复顺序

1. **先收口安全与授权边界**：优先修复 `McpSamplingService` 的 `Not Now` 语义错误，移除或重构默认 `global autoApprove` 与外部 MCP 工具 `allowAutoConfirm` 的直接叠加，并修正 OAuth `clientId` 不一致、state 过早删除等认证链问题。
2. **再修请求绑定与失败语义**：统一 `chatRequestId` / request 对象的定位逻辑，让取消、budget/maxTurns、compact 失败、streaming 错误都显式进入失败路径，而不是“完成但空结果”。
3. **随后处理产品元数据与 fork 横切面**：清理 `defaultChatAgent` 的 Copilot 绑定，决定并统一稳定版 `dataFolderName` 策略，并收口帮助、条款、支持、许可链接。
4. **最后补最有价值的回归测试**：重点补多 request / queued / reroute / confirmation 中切换的工具绑定测试、MCP sampling 与 tool confirmation 的权限状态机测试、OAuth 授权与刷新链测试，以及 `product.json` / build 脚本 / 首次启动路径的元数据 smoke tests。

### 最终判断

- Director-Code 目前已经具备“可运行、可演示、可继续演进”的基础，但还没有达到“边界清晰、状态一致、可放心长期托管”的程度。
- 真正需要警惕的不是某一个孤立 bug，而是多个默认值、兼容分支和桥接层在压力场景下彼此叠加，形成的系统性错位。如果要进入下一阶段（尤其是 Phase 2 ACP 扩展），建议先完成上面的高优先级收口，再继续往外扩展接入面。
