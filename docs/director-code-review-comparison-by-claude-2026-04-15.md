# Director-Code 三份 Review 报告交叉核实对比 (by Claude)

**核实者**: Claude (Opus 4.6)
**日期**: 2026-04-15
**核实方法**: 逐条对照源代码逐行验证，确认问题是否真实存在以及严重度评估是否合理

## 报告来源

| 代号 | 报告 | 报告问题数 | 审查范围 |
|------|------|-----------|---------|
| **G** | GPT 5.4 全量 Review | 57 个 (10 严重 + 28 高 + 19 中) | 全量：Agent 引擎 + Browser 集成 + MCP + 构建品牌 + 测试覆盖 |
| **C** | Claude (Opus 4.6) Review | 27 个 (3 严重 + 5 高 + 9 中 + 10 低) | 核心：Agent 引擎 + Provider + 认证 + Settings UI |
| **Ge** | Gemini 3.1 Pro Review | 20 个 (标注"致命") | 核心：Agent 引擎 + Provider + 认证 + Browser 桥接 + UI |

## 核实结论总览

在三份报告合计约 **80+ 条独立问题**中：

| 分类 | 数量 | 说明 |
|------|------|------|
| **确认存在且合理** | ~55 条 | 代码中确实存在该问题，严重度评估基本合理 |
| **确认存在但严重度被夸大** | ~12 条 | 问题真实存在，但影响面或触发条件被过度渲染 |
| **确认存在但属设计取舍** | ~8 条 | 代码行为如描述，但属有意为之或当前阶段合理的权衡 |
| **描述不准确或误判** | ~5 条 | 对代码逻辑理解有误，或问题实际不成立 |

---

## 一、核心引擎层 (agentEngine / retry / compact / tokens)

### 1.1 三方共同发现的问题

| # | 问题描述 | G | C | Ge | 代码验证 | 合理性评估 |
|---|---------|---|---|---|---------|-----------|
| 1 | `finalizeToolBlock()` JSON 解析失败后包装成 `{ raw: ... }`，工具 schema 不认识该字段 | ✅ [高] | — | ✅ [致命] | **确认存在**：`catch { parsedInput = { raw: tool.input }; }` (agentEngine.ts L472) | **合理**。静默包装确实会导致下游 schema 校验失败，且 LLM 收不到纠错信号。但 Gemini 称"致命"略显夸张——实际只在 JSON 格式错误时触发，频率不高。 |
| 2 | `max_tokens` 恢复只追加 "Please continue from where you left off."，会破坏结构化输出 | ✅ [高] | — | ✅ [致命] | **确认存在**：agentEngine.ts L392-396 | **合理**。在 tool JSON 被截断时确实会导致后续输出混乱。但实际触发需要模型输出恰好在 JSON 中间被截断，属较低频场景。 |
| 3 | `tool_call_delta` 只用单个 `currentTool` 累积，多工具并发时参数混乱 | ✅ [高] | ✅ [H-3] | — | **确认存在**：agentEngine.ts L240 只声明一个 `currentTool` 变量，无按 index 分桶 | **合理**。OpenAI 可在一次响应中返回多个 indexed tool calls，当前实现确实会串台。 |
| 4 | 历史消息转换丢弃工具调用、thinking 等上下文 | ✅ [高] | ✅ [M-7] | ✅ [致命] | **确认存在**：messageNormalization.ts 的 `extractAssistantText` 只收集 text/markdown | **合理**。多轮对话中 LLM 失去工具历史确实影响连贯性。但需注意：AgentEngine 走 `this.messages` 通路时保留了完整工具上下文，该丢失仅影响从 VS Code Chat 历史重建的路径。Gemini 称"毁灭性"过于绝对。 |

### 1.2 两方共同发现的问题

| # | 问题描述 | G | C | Ge | 代码验证 | 合理性评估 |
|---|---------|---|---|---|---------|-----------|
| 5 | `abortSignal` 未传给 Provider，请求无法在网络层真正取消 | ✅ [严重] | — | — | **确认存在**：requestParams 构造时无 `abortSignal` 字段 (agentEngine.ts L221-231) | **合理**。三家 Provider 的 fetch 均依赖 `params.abortSignal`，此处为 undefined。 |
| 6 | 取消请求后 `endSubtype` 仍可能为 `success` | ✅ [严重] | — | — | **确认存在**：abort 时 break 循环，但 endSubtype 判断无 aborted 分支 (L450-453) | **合理**。取消误报为成功会影响 UI 展示和遥测数据。 |
| 7 | 自动压缩失败仍发送 `compact_boundary` 事件 | ✅ [严重] | — | ✅（间接） | **确认存在**：compactConversation catch 返回原消息，agentEngine 无条件 yield compact_boundary | **合理**。"假成功"会误导用户以为上下文已被压缩。 |
| 8 | `estimateTokens()` 只用 `text.length / 4`，对中文严重不准 | — | ✅ [L-1关联] | ✅ [致命] | **确认存在**：tokens.ts L24-26 | **存在但夸大**。Gemini 称"致命"过度。该估算仅用于触发 auto-compact 阈值，不影响 API 实际请求。对中文确实低估（1 中文字符≈1-2 token），但后果仅是 compact 触发偏晚。 |
| 9 | `estimateCost()` 未计入 cache tokens | ✅ [中] | — | — | **确认存在**：tokens.ts L132-140 只用 input_tokens + output_tokens | **合理**。使用 Anthropic prompt caching 时成本会被低估。 |
| 10 | `estimateCost` 的 `includes` 匹配可能误匹配模型定价 | — | ✅ [L-1] | — | **确认存在**：`gpt-4o-mini` 会先匹配到 `gpt-4o` 的定价（取决于 Object.entries 顺序） | **合理但当前巧合正确**。实测 `gpt-4o` 排在 `gpt-4o-mini` 前面，会先匹配。但属脆弱设计。 |

### 1.3 单方独有发现

| # | 问题描述 | 报告方 | 代码验证 | 合理性评估 |
|---|---------|-------|---------|-----------|
| 11 | `executeTools()` 重排工具顺序（先并发只读再串行 mutation） | G [高] | **确认存在**：agentEngine.ts L500-528 | **合理但属设计取舍**。并发只读 + 串行 mutation 是常见的性能优化策略，但确实改变了模型期望的执行顺序。 |
| 12 | `CanUseToolResult.updatedInput` 未被实际使用 | G [高] | **确认存在**：`invokeTool` 仍用原始 `block.input` (L584) | **合理**。接口设计了 updatedInput 能力但实现未接入，属死代码。 |
| 13 | `withRetry()` 等待阶段的 setTimeout 不可取消 | G [中] | **确认存在**：retry.ts 的 setTimeout Promise 未绑定 abort | **合理但影响有限**。最长等待约数秒（指数退避），用户体验影响较小。 |
| 14 | `maxInputTokensOverride < 13000` 时 compact 阈值变负 | G [中] | **确认存在**：compact.ts 无 `Math.max` 下界保护 | **合理但触发条件极端**。正常配置不会低于 13000。 |
| 15 | 流式路径 thinking block 未累积到 contentBlocks | C [H-1] | **确认存在**：agentEngine.ts L256-258 只 yield 不保存 | **合理**。非流式后续代码若需检查完整 response 中的 thinking，会丢失。 |
| 16 | compact 使用与主请求相同的昂贵模型 | C [M-4] | **确认存在**：compact 调用 `this.provider` 即当前配置的模型 | **合理**。Opus 做 compact 比 Haiku 贵约 19 倍。 |
| 17 | `compact.ts` 直接修改传入的 messages / state（非纯函数） | Ge [致命] | **确认存在但夸大**：当前单线程执行，实际不会触发竞态 | **存在但严重度夸大**。Gemini 称"致命"和"并发冲突"，但当前架构是单 Engine 实例顺序执行，不存在并发修改。 |

---

## 二、Provider 层 (abstract / openai / gemini / anthropic)

### 2.1 三方共同发现

| # | 问题描述 | G | C | Ge | 代码验证 | 合理性评估 |
|---|---------|---|---|---|---------|-----------|
| 18 | SSE `readSSELines()` 流结束时未 flush 尾部 buffer | ✅ [高] | ✅ [M-3关联] | ✅ [致命] | **确认存在**：`done === true` 时直接 break，buffer 残余被丢弃 | **合理但实际影响低**。主流 API (Anthropic/OpenAI/Gemini) 均以 `\n` 结尾。仅对非标准代理服务有影响。 |

### 2.2 两方共同发现

| # | 问题描述 | G | C | Ge | 代码验证 | 合理性评估 |
|---|---------|---|---|---|---------|-----------|
| 19 | OpenAI Provider vision 声明为 true 但消息转换忽略 image block | ✅ [高] | — | — | **确认存在**：`convertUserMessage` 只处理 text 和 tool_result | **合理**。能力声明与实际实现不一致。 |
| 20 | OpenAI `convertUserMessage()` 重排 tool_result 和文本顺序 | ✅ [高] | ✅ [L-5] | — | **确认存在**：先输出全部 tool 消息再输出 user 文本 | **存在但影响有限**。OpenAI API 要求 tool 消息紧跟 assistant tool_calls 后，当前顺序实际上是正确的。Claude 自己也承认"正确，但缺少注释"。 |
| 21 | Gemini API Key 在 URL 明文传输 (`?key=`) | — | ✅ [C-1] | — | **确认存在**：geminiProvider.ts L108, L136 | **存在但属 Google API 标准做法**。Claude 自己也注明"无法避免"。严重度视场景而定。 |
| 22 | Gemini 流式路径未处理 chunk 内的 `error` | ✅ [高] | — | — | **确认存在**：`parseGeminiSSEStream` 只处理 candidates/usageMetadata | **合理**。服务端错误会被伪装成空响应。 |
| 23 | Gemini 每个 `functionCall` 重新生成工具 ID | ✅ [高] | ✅ [M-2关联] | — | **确认存在**：processStreamPart 每次调用 generateGeminiToolId | **合理但实际影响看 Gemini 行为**。如果 Gemini 一次完整返回 functionCall（非分片），则无影响。 |

### 2.3 单方独有发现

| # | 问题描述 | 报告方 | 代码验证 | 合理性评估 |
|---|---------|-------|---------|-----------|
| 24 | OpenAI 无条件发送 `stream_options.include_usage` | G [中] | **确认存在** | **合理**。部分 compatible API 不接受该字段。 |
| 25 | Gemini `tool_result → functionResponse` 用 `'unknown'` 兜底函数名 | G [中] | **确认存在** | **合理但触发条件有限**。仅在历史裁剪后 tool_use_id 找不到对应名称时触发。 |
| 26 | SSE buffer 无最大长度限制 | Ge [致命] | **确认存在但严重度夸大**。需恶意服务器发送超长无换行数据 | **存在但"致命"过度**。正常 API 不会产生这种数据流。防御性编程角度合理，但非"致命"。 |
| 27 | OpenAI `max_tokens` vs `max_completion_tokens` 不兼容 o3 | C [M-8] | **确认存在** | **合理**。o3 系列需要 `max_completion_tokens`。 |
| 28 | OpenAI baseURL 拼接缺少 /v1 智能处理 | C [M-9] | **确认存在** | **合理**。DeepSeek 等服务需要 /v1 前缀。 |
| 29 | `geminiCallCounter` 模块级全局变量 | C [M-2] | **确认存在** | **合理但实际风险低**。单进程内自增 ID 唯一性有保证。 |
| 30 | OpenAI/Gemini JSON 解析失败静默回退为字符串 | Ge [致命] | **确认存在** | 与 #1 同类问题，合理但 Gemini 重复计算且称"致命"过度。 |

---

## 三、认证与密钥管理 (oauthService / apiKeyService)

### 3.1 三方共同发现

| # | 问题描述 | G | C | Ge | 代码验证 | 合理性评估 |
|---|---------|---|---|---|---------|-----------|
| 31 | OAuth `startOAuthFlow` 用 `effectiveClientId`，但 `_exchangeCodeForTokens` / `_refreshAccessToken` 退回 `config.clientId` | ✅ [严重] | ✅ [C-2] | — | **确认存在**：L373 `client_id: config.clientId` 而非 effectiveClientId | **合理**。但注意：当前 OAuth 功能尚未在产品运行时注册（见 #40），实际不会触发。 |
| 32 | 未完成的 OAuth flow state 永久残留 | ✅ [中] | ✅ [C-3] | ✅ [致命] | **确认存在**：无定时清理、无启动清扫 | **合理但影响有限**。OAuth 未实际接线，且单条 state 数据量极小。Gemini 称"致命"过度。 |
| 33 | `testConnection()` 无超时保护 | ✅ [高] | ✅ [H-5关联] | ✅ [致命] | **确认存在**：三个 `_test*` 方法直接裸 `fetch` 无 AbortController | **合理**。遇到黑洞地址会无限挂起。 |

### 3.2 两方共同发现

| # | 问题描述 | G | C | Ge | 代码验证 | 合理性评估 |
|---|---------|---|---|---|---------|-----------|
| 34 | OAuth state 在 token 交换前就被删除 | ✅ [高] | — | — | **确认存在**：handleCallback 先 delete 后 exchange | **合理**。exchange 失败后无法重试。 |
| 35 | OAuth 刷新 delay 无 setTimeout 32 位整数上限保护 | ✅ [中] | — | ✅ [致命] | **确认存在**：无 `Math.min(delay, 0x7fffffff)` | **存在但 Gemini 描述夸大**。Gemini 称"疯狂死循环"——Node.js 中超过 2^31 的 setTimeout 会立即触发一次，不会"死循环"。超长 token 有效期本身极少见。 |
| 36 | 依赖全局 `crypto` / `btoa` | ✅ [中] | — | ✅ [致命] | **确认存在**：直接用 `crypto.getRandomValues`、`crypto.subtle.digest`、`btoa` | **存在但影响极低**。VS Code 使用的 Electron 版本 (Chromium 130+) 全面支持 Web Crypto API。Gemini 称"致命崩溃"不符合实际运行环境。 |

### 3.3 单方独有发现

| # | 问题描述 | 报告方 | 代码验证 | 合理性评估 |
|---|---------|-------|---------|-----------|
| 37 | `onDidChangeApiKey` 事件 payload 在 per-model key 场景下是 `provider.modelId` 而非纯 ProviderName | G [高] | **确认存在** | **合理**。事件契约与注释不一致。 |
| 38 | `onDidChangeSecret` 不转发 `MODEL_CONFIG_PREFIX` 变更 | G [中] | **确认存在** | **合理**。per-model baseURL/capabilities 变更不会通知观察者。 |
| 39 | `getProviderAuthMethod()` 硬编码返回 `'api-key'` | G [中] | **确认存在** | **合理但属 Phase 1.5+ 阶段性设计**。OAuth 路径尚未接入运行时。 |
| 40 | `resolveProviderOptions()` 实现与文档注释不一致 | G [中] / C [M-6] | **确认存在** | **合理**。注释承诺三级 fallback，实现缺少 provider default URL 和 catalog 查询。 |
| 41 | testConnection 用硬编码默认模型，compatible provider 可能不存在该模型 | C [H-5] | **确认存在** | **合理**。用 Claude 模型测 OpenAI-compatible 端点会误报。 |

---

## 四、模型解析 (modelResolver / modelCatalog)

| # | 问题描述 | G | C | Ge | 代码验证 | 合理性评估 |
|---|---------|---|---|---|---------|-----------|
| 42 | 缓存键不含 `apiKey`，不同账号/授权状态共用缓存 | ✅ [严重] | — | — | **确认存在**：`_cacheKey` 只拼 provider + baseURL | **合理但注意**：ModelResolver 未注册到运行时（见 #48），当前实际不触发。 |
| 43 | `_openAIModelToResolved()` 用 `!!baseURL` 判断 compatible | ✅ [高] | — | — | **确认存在** | **合理**。proxy baseURL 会被误标为 compatible。 |
| 44 | 缓存并发穿透 (Cache Stampede) | — | — | ✅ [致命] | **确认存在**：无 Promise 去重或互斥锁 | **存在但"致命"过度**。ModelResolver 未注册到运行时，且模型列表请求频率很低。 |
| 45 | Model Catalog 定价数据与 tokens.ts 重复 | — | ✅ [H-4] | — | **确认存在** | **合理**。两处维护容易不一致。 |
| 46 | `getContextWindowSize` 基于 `includes` 的匹配链脆弱 | — | ✅ [L-2] | — | **确认存在** | **合理**。当前顺序恰好正确但新模型可能打破。 |

---

## 五、浏览器集成层

### 5.1 三方共同发现

| # | 问题描述 | G | C | Ge | 代码验证 | 合理性评估 |
|---|---------|---|---|---|---------|-----------|
| 47 | 全局 `chat.tools.global.autoApprove` 被默认开启 | ✅ [高] | — | ✅ [致命] | **确认存在**：contribution.ts L239-249 在用户未配置时写入 true | **合理但评估分歧大**。G 称"高"，Ge 称"致命/流氓"。实际设计意图是让 Agent 模式下工具不卡确认，且仅在用户未显式配置时生效。属产品取舍但确实需要审慎评估。 |

### 5.2 两方共同发现

| # | 问题描述 | G | C | Ge | 代码验证 | 合理性评估 |
|---|---------|---|---|---|---------|-----------|
| 48 | OAuthService / ModelResolverService 未在 workbench 注册，形成孤岛模块 | ✅ [严重] | — | — | **确认存在**：contribution.ts 仅注册 ApiKeyService | **合理但属阶段性状态**。这些服务在 Phase 1.5+ 中实现但计划在后续阶段接入运行时。 |
| 49 | DirectorCodeModelProvider 绕过 `resolveProviderOptions()`，per-model 配置在标准通路失效 | ✅ [高] | — | ✅（间接） | **确认存在**：直接调用 `getApiKey(effectiveProvider)` | **合理**。Agent 通路与 Chat 模型通路配置语义分裂。 |
| 50 | DirectorCodeModelProvider 把消息全部降为纯文本 | ✅ [高] | — | — | **确认存在**：`chatMessageToText` 只保留 `type === 'text'` | **合理**。标准模型通路丢失富文本内容。 |
| 51 | `createAbortSignal` 的 `onCancellationRequested` 监听器未 dispose | — | ✅ [H-2] | ✅（间接） | **确认存在**：无保存/释放 IDisposable | **合理**。频繁调用会累积监听器。 |

### 5.3 单方独有发现

| # | 问题描述 | 报告方 | 代码验证 | 合理性评估 |
|---|---------|-------|---------|-----------|
| 52 | DirectorCodeModelProvider 模型列表绕过 ModelResolverService | G [高] | **确认存在** | **合理**。动态模型/CDN/API fallback 全部白做。但同 #48，ModelResolverService 本身未注册。 |
| 53 | 配置监听未释放（类未继承 Disposable） | G [中] / C [M-5] | **确认存在** | **合理**。长运行 workbench 中监听器会累积。 |
| 54 | `progressBridge` assistant 文本被无条件跳过 | G [高] | **确认存在但属设计意图** | **存在但合理性存疑**。注释明确说"正文已通过 text_delta 渲染"，是有意设计。G 说的"非流式降级路径"风险确实存在。 |
| 55 | `DirectorCodeAgent.invoke()` 只对 `error` subtype 返回失败 | G [中] | **确认存在** | **合理但实际有补偿**：`error_max_turns` 通过 `provideFollowups` 给出续轮提示。 |
| 56 | 错误处理丢失堆栈信息 | Ge [致命] | **确认存在** | **存在但"致命"过度**。IDE 应用中常见做法，不需要向用户展示堆栈。应额外 log 到 ILogService。 |
| 57 | Settings 状态栏和 API Keys 区只认 provider 级 key | G [高] | **确认存在** | **合理**。per-model key 用户看到"未配置"但实际可用。 |
| 58 | ApiKeysWidget Test Connection 用全局 model/baseURL | G [高] / C [H-5] | **确认存在** | **合理**。跨 provider 测试会给出错误结果。 |
| 59 | ProviderSettingsWidget 配置写入无防抖 | Ge [致命] | **确认存在但"致命"过度** | **存在但实际影响小**。VS Code 内部 ConfigurationService 有批量写入优化。Gemini 称"主进程卡顿"是理论风险。 |
| 60 | toolBridge 超时未真正取消底层工具执行 | Ge [致命] | **确认存在** | **合理**。120s 超时后底层工具仍在运行。但 Gemini 称"Zombie Processes"夸大——工具在 VS Code 进程内执行，不是独立进程。 |
| 61 | `anthropic-compatible` 默认模型写成空字符串 | G [中] | **确认存在** | **合理**。切换到无预设模型的 provider 会写入空 model。 |
| 62 | ProviderSettingsWidget `saveToConfig` 同步调用异步 `updateValue` | C [L-6] | **确认存在** | **合理但影响低**。`_updating` flag 回环抑制可能失效。 |

---

## 六、MCP 与 Chat 基础设施

| # | 问题描述 | G | C | Ge | 代码验证 | 合理性评估 |
|---|---------|---|---|---|---------|-----------|
| 63 | MCP sampling "Not Now" 用 `has()` 判断导致实际放行 | ✅ [严重] | — | — | **确认存在**：`_sessionSets[key].set(id, false)` 但后续用 `has(id)` 判断 | **合理且影响严重**。"拒绝"操作实际等于"本次会话内允许"。 |
| 64 | 全局 autoApprove + MCP `allowAutoConfirm` 叠加绕过确认 | ✅ [严重] | — | — | **确认存在**：两个配置在多层逻辑中叠加 | **合理但需注意**：实际 `shouldAutoConfirm()` 还有额外的 `_checkGlobalAutoApprove` 检查层。G 的"组合打穿"描述准确但需考虑完整调用链。 |
| 65 | `registerDynamicAgent()` 无重复 ID 防护 | ✅ [高] | — | — | **确认存在**：直接 `Map.set`，无检查旧值 | **合理**。当前仅 Director-Code Agent 一个动态注册，但 Phase 2 ACP 会有更多。 |
| 66 | MCP 图片 resource_link 读取失败降级为空字节 | ✅ [中] | — | — | **确认存在**：`.catch(() => VSBuffer.alloc(0))` | **合理**。模型收到空图片内容无法区分是错误还是空图。 |
| 67 | `invokeTool()` 绑定到最后一个 request 而非当前 chatRequestId | ✅ [严重] | — | — | **确认存在**：`model?.getRequests().at(-1)` 而非按 ID 查找 | **合理但注意**：此代码为 VS Code 上游原有逻辑（非 Director-Code 新增），不属于 fork 引入的问题。 |
| 68 | `shouldAutoConfirm` 也偷看最后一个 request 的权限 | ✅ [高] | — | — | **确认存在** | **同 #67，属上游逻辑**。 |
| 69 | McpAddContextContribution 未真正订阅 capability 变化 | ✅ [高] | — | — | **确认存在** | **合理但属上游逻辑**。 |

---

## 七、构建 / 品牌 / 产品元数据

| # | 问题描述 | G | C | Ge | 代码验证 | 合理性评估 |
|---|---------|---|---|---|---------|-----------|
| 70 | `defaultChatAgent` 仍指向 GitHub Copilot | ✅ [严重] | — | — | **确认存在**：product.json L86-89 | **合理且重要**。影响欢迎页、设置跳转、法律文案等。 |
| 71 | 稳定版 `dataFolderName` 仍为 `.vscode-oss` | ✅ [高] | — | — | **确认存在**：product.json L5 | **合理**。会与 VSCodium 等 OSS 构建共享目录。 |
| 72 | 帮助/文档/许可链接仍大量指向 Microsoft | ✅ [中] | — | — | **确认存在（部分）**：licenseUrl 已改，其余多数未改 | **合理**。品牌收口不完整。 |
| 73 | build.sh 无条件执行 compile-extensions-build | ✅ [高] | — | — | **确认存在**：在 SHOULD_BUILD=yes 下无跳过逻辑 | **合理**。已知该步骤在受限网络下会失败。 |
| 74 | prepare_vscode.sh 用 .bak 在工作树内备份 | ✅ [中] | — | — | **确认存在** | **合理**。构建脚本产生脏文件。 |

---

## 八、Gemini 报告专有问题额外评估

Gemini 3.1 Pro 的报告用语最为激烈（"致命缺陷"、"业余妥协"、"灾难性"），以下几条需要特别标注其偏差：

| # | Gemini 描述 | 实际评估 |
|---|-----------|---------|
| Ge-1 | `compact.ts` "致命的全局状态污染与并发冲突" | **夸大**。当前单线程执行，不存在真实竞态。"未来可能"不等于"致命"。 |
| Ge-2 | `estimateTokens` "致命缺陷…上下文窗口超载" | **夸大**。仅影响 auto-compact 触发时机，不影响 API 层。 |
| Ge-3 | `modelResolver` "Cache Stampede…极易触发" | **夸大**。ModelResolver 未注册到运行时，且模型列表请求频率极低。 |
| Ge-4 | SSE buffer "OOM 崩溃" | **夸大**。需恶意服务器配合，正常使用场景不触发。 |
| Ge-5 | `apiKeysWidget` "密码框明文泄露" | **夸大**。Electron 环境下 `<input type="password">` 是标准安全实践，"开发者工具审查元素"不构成实际安全威胁。 |
| Ge-6 | 配置写入无防抖 "主进程卡顿/File Lock" | **夸大**。VS Code ConfigurationService 内部有批量处理。 |
| Ge-7 | `directorCodeAgent` 错误处理 "致命缺陷…极其困难" | **夸大**。应当 log 到 ILogService，但不向 UI 暴露堆栈是正常做法。 |
| Ge-8 | setTimeout 32 位溢出 "疯狂死循环刷新" | **不准确**。Node.js/Chromium 超过 2^31-1 的 delay 会立即触发**一次**回调，不会形成死循环。 |

---

## 九、三份报告对比总评

### 覆盖广度对比

| 维度 | GPT 5.4 (G) | Claude (C) | Gemini (Ge) |
|------|------------|-----------|------------|
| Agent 引擎核心 | ✅ 深入 | ✅ 深入 | ✅ 中等 |
| Provider 层 | ✅ 深入 | ✅ 深入 | ✅ 中等 |
| 认证链 (OAuth/API Key) | ✅ 深入 | ✅ 深入 | ✅ 中等 |
| Browser 集成层 | ✅ 全面 | ✅ 部分 | ✅ 部分 |
| MCP / Chat 基础设施 | ✅ 深入 | ❌ 未覆盖 | ❌ 未覆盖 |
| 构建/品牌/元数据 | ✅ 深入 | ❌ 未覆盖 | ❌ 未覆盖 |
| 测试覆盖分析 | ✅ 每模块详细 | ❌ 未专项分析 | ❌ 未覆盖 |
| 上游代码区分 | ❌ 未区分 | ❌ 未区分 | ❌ 未区分 |

### 严重度校准对比

| 评估风格 | GPT 5.4 (G) | Claude (C) | Gemini (Ge) |
|---------|------------|-----------|------------|
| 整体基调 | 客观严谨，分级清晰 | 理性平衡，有优点/缺点 | 激进攻击，用语夸张 |
| 严重度准确性 | 大部分准确 | 大部分准确 | 普遍偏高 |
| 误报率 | 低（~5%） | 低（~5%） | 中（~25% 严重度夸大） |
| 是否区分自研/上游 | 否 | 否 | 否 |
| 建设性建议 | 有完整修复建议 | 有架构级建议 | 有替代方案但措辞偏激 |

### 核心发现一致性

三份报告**高度一致**认同的核心风险领域：

1. **OAuth clientId 不一致** — 三方均发现（但 OAuth 尚未实际接线，紧迫性需降级）
2. **工具调用并发处理** — G 和 C 均发现多 tool_call_delta 单桶问题
3. **历史消息丢失工具上下文** — 三方均发现 messageNormalization 的简化问题
4. **testConnection 无超时** — 三方均发现
5. **OAuth state 无清理** — 三方均发现

三份报告**分歧最大**的领域：

1. **全局 autoApprove** — G 称"高"，Ge 称"流氓越权致命"，C 未单列。实际属产品设计取舍。
2. **estimateTokens** — Ge 称"致命"，C 认为"低风险"。实际影响有限。
3. **构建/品牌横切面** — 仅 G 覆盖，C 和 Ge 完全忽略。这实际是最影响终端用户的问题之一。

### 各报告独特价值

| 报告 | 独特贡献 |
|------|---------|
| **GPT 5.4** | 覆盖最全，是唯一深入审查 MCP/Chat 基础设施和构建品牌面的报告；测试覆盖分析最详细；发现了 MCP sampling "Not Now" 语义错误等其他两方未触及的严重问题 |
| **Claude** | 最平衡的优缺点评价；提出了 5 条架构级改进建议（类型安全、错误分类体系、可观测性等）；对 Anthropic/OpenAI 消息转换细节最熟悉 |
| **Gemini** | 从攻击者/敌对视角审查（buffer 溢出、cache stampede、zombie 进程等安全性思考有价值）；但严重度评估普遍偏高，约 25% 存在夸大 |

---

## 十、建议优先修复清单

综合三份报告核实结果，按**真实影响**排序的修复优先级：

### P0 — 必须立即修复

| # | 问题 | 来源 | 理由 |
|---|------|------|------|
| 70 | `defaultChatAgent` 仍指向 Copilot | G | 影响所有用户的首次体验和品牌认知 |
| 71 | `dataFolderName` 仍为 `.vscode-oss` | G | 稳定版会与其他 OSS 构建冲突 |
| 5 | `abortSignal` 未传给 Provider | G | 取消请求无法真正中止网络调用 |
| 6 | 取消误报为 success | G | 影响 UI 状态和遥测准确性 |
| 3 | 多 tool_call_delta 单桶 | G/C | OpenAI 多工具并行时参数串台 |

### P1 — 建议尽快修复

| # | 问题 | 来源 | 理由 |
|---|------|------|------|
| 63 | MCP sampling "Not Now" 语义错误 | G | 安全边界问题 |
| 33 | testConnection 无超时 | G/C/Ge | 用户体验——黑洞地址会卡死 |
| 1 | JSON 解析失败包装 `{ raw }` | G/Ge | 工具调用链静默失败 |
| 4 | 历史消息丢失工具上下文 | G/C/Ge | 多轮对话连贯性 |
| 22 | Gemini 流式 error 未处理 | G | 服务端错误被伪装成空响应 |

### P2 — 后续迭代修复

| # | 问题 | 来源 | 理由 |
|---|------|------|------|
| 31 | OAuth clientId 不一致 | G/C | OAuth 尚未接线，可与接线同时修复 |
| 47 | 全局 autoApprove 默认开启 | G/Ge | 需产品决策后调整 |
| 19 | vision 声明与实现不一致 | G | 图片功能优先级较低 |
| 53 | Disposable 资源管理改进 | G/C | 长时间运行累积，非紧急 |

---

## 十一、全量修复方案

以下修复方案覆盖核实报告中全部 74 条已确认问题，按优先级分为四个批次（P0/P1/P2/P3），每批次内按模块组织。每条修复给出具体实现方式和涉及文件。

### 修复批次总览

| 批次 | 时间窗口 | 问题数 | 核心目标 |
|------|---------|--------|---------|
| **P0** | 立即（1-2 天） | 12 条 | 取消/中止语义修正、多工具并发、产品品牌收口 |
| **P1** | 本周（3-5 天） | 18 条 | 安全边界、错误处理、Provider 健壮性 |
| **P2** | 下周（Phase 2 前） | 22 条 | OAuth 接线、配置一致性、资源管理 |
| **P3** | 后续迭代 | 22 条 | 代码质量、防御性编程、测试补充 |

---

### P0 — 立即修复（阻塞 Phase 2 的核心问题）

#### P0-01. `abortSignal` 传递给 Provider（#5）

**文件**: `agentEngine.ts`
**修复**:

```typescript
// agentEngine.ts L221-231: requestParams 构造中增加 abortSignal
const requestParams: CreateMessageParams = {
    model: this.config.model,
    maxTokens: this.config.maxTokens,
    system: systemPrompt,
    messages: apiMessages,
    tools: tools.length > 0 ? tools : undefined,
    thinking: ...,
    abortSignal: this.config.abortSignal,  // ← 新增
};
```

`CreateMessageParams` 已定义 `abortSignal?: AbortSignal`（providerTypes.ts L35），三家 Provider 的 fetch 也已支持 `params.abortSignal`，仅需在构造处接线。

#### P0-02. 取消请求正确标记为 `cancelled`（#6）

**文件**: `agentEngine.ts`, `agentEngineTypes.ts`
**修复**:

```typescript
// agentEngineTypes.ts: AgentResultEvent.subtype 增加 'cancelled'
readonly subtype: 'success' | 'error' | 'error_max_turns' | 'error_max_budget_usd' | 'cancelled';

// agentEngine.ts L449-455: 增加 aborted 判断分支
let aborted = false;
while (turnsRemaining > 0) {
    if (this.config.abortSignal?.aborted) { aborted = true; break; }
    // ...流式循环内同理设置 aborted = true
}

const endSubtype = aborted
    ? 'cancelled'
    : budgetExceeded
        ? 'error_max_budget_usd'
        : turnsRemaining <= 0
            ? 'error_max_turns'
            : 'success';
```

同步修改 `directorCodeAgent.ts` 中对 `cancelled` subtype 的处理——返回带 `errorDetails` 的取消结果而非成功。

#### P0-03. 多 `tool_call_delta` 按 index 分桶（#3）

**文件**: `agentEngine.ts`
**修复**: 将单 `currentTool` 替换为 `Map<number, ToolAccumulator>`。

```typescript
// 替换 L240
const toolAccumulators = new Map<number, { id: string; name: string; input: string }>();

// L276-283: tool_call_delta 处理
case 'tool_call_delta': {
    const idx = event.index ?? 0;
    let acc = toolAccumulators.get(idx);
    if (!acc) {
        acc = { id: event.id || '', name: event.name || '', input: '' };
        toolAccumulators.set(idx, acc);
    }
    if (event.id && !acc.id) { acc.id = event.id; }
    if (event.name && !acc.name) { acc.name = event.name; }
    if (event.arguments) { acc.input += event.arguments; }
    break;
}

// message_complete 时遍历 toolAccumulators 生成 contentBlocks
case 'message_complete':
    for (const [, acc] of toolAccumulators) {
        contentBlocks.push(this.finalizeToolBlock(acc));
    }
    toolAccumulators.clear();
    // ...
```

#### P0-04. `finalizeToolBlock` JSON 解析失败回传 LLM（#1）

**文件**: `agentEngine.ts`
**修复**: JSON 解析失败时不包装为 `{ raw }` ，而是构造一个 `is_error: true` 的 tool_result 反馈给 LLM。

```typescript
private finalizeToolBlock(tool: { id: string; name: string; input: string }): NormalizedResponseBlock {
    let parsedInput: any = {};
    let parseError = false;
    try {
        if (tool.input) { parsedInput = JSON.parse(tool.input); }
    } catch {
        parseError = true;
        parsedInput = {};
    }

    const block: NormalizedResponseBlock = {
        type: 'tool_use',
        id: tool.id,
        name: tool.name,
        input: parsedInput,
    };

    // 标记解析失败，由调用方在 tool_result 中告知 LLM
    if (parseError) {
        (block as any)._jsonParseError = tool.input;
    }
    return block;
}
```

在 `executeTools` 之前检查 `_jsonParseError`，对该 tool_use 直接返回错误 tool_result：
```typescript
`JSON parse error for tool "${block.name}": invalid JSON input. Please re-send with valid JSON.`
```

#### P0-05. compact 失败时不发送 `compact_boundary`（#7）

**文件**: `agentEngine.ts`
**修复**:

```typescript
// L192-209: compactConversation 返回值增加成功标志判断
const result = await compactConversation(...);
const compactSucceeded = result.state.consecutiveFailures === 0
    || result.state.consecutiveFailures < this.compactState.consecutiveFailures;

this.messages = result.compactedMessages as MutableMessageParam[];
this.compactState = result.state;

if (compactSucceeded) {
    yield { type: 'system', subtype: 'compact_boundary', message: 'Conversation compacted' };
}
// 失败时静默跳过 compact_boundary
```

#### P0-06. `defaultChatAgent` 清除 Copilot 引用（#70）

**文件**: `vscode/product.json`, `prepare_vscode.sh`
**修复**: 在 `prepare_vscode.sh` 中增加 `defaultChatAgent` 替换逻辑，或直接在 `product.json` 中修改：

```json
"defaultChatAgent": {
    "extensionId": "director-code.agent",
    "chatExtensionId": "director-code.agent-chat",
    "providerExtensionId": "director-code.agent",
    "providerName": "Director-Code",
    "termsStatementUrl": "https://github.com/anthropaul/Director-Code/blob/main/LICENSE",
    "privacyStatementUrl": "https://github.com/anthropaul/Director-Code/blob/main/PRIVACY.md",
    "skusDocumentationUrl": "",
    "documentationUrl": "https://github.com/anthropaul/Director-Code",
    "feedbackUrl": "https://github.com/anthropaul/Director-Code/issues",
    "manageUrl": ""
}
```

需要创建对应的 `PRIVACY.md`（或链接到现有文档），清除所有 `GitHub.copilot*` 引用。

#### P0-07. 稳定版 `dataFolderName` 改为专属值（#71）

**文件**: `vscode/product.json`, `prepare_vscode.sh`
**修复**:

```json
// product.json
"dataFolderName": ".director-code",
```

同步在 `prepare_vscode.sh` 中确保 insiders 分支为 `.director-code-insiders`。

#### P0-08. 帮助/文档/许可链接收口（#72）

**文件**: `vscode/product.json`
**修复**: 批量替换所有 `go.microsoft.com`、`aka.ms` 链接。需要逐条决策：

| 字段 | 当前值 | 修改为 |
|------|--------|--------|
| `serverLicenseUrl` | Microsoft 链接 | 自有仓库 LICENSE 链接 |
| `documentationUrl` | go.microsoft.com | 项目 GitHub wiki 或空 |
| `releaseNotesUrl` | go.microsoft.com | 项目 GitHub releases |
| `requestFeatureUrl` | go.microsoft.com | 项目 GitHub issues |
| `tipsAndTricksUrl` | go.microsoft.com | 空或自有文档 |
| `checksumFailMoreInfoUrl` | go.microsoft.com | 空或自有文档 |

#### P0-09. `max_tokens` 恢复策略改进（#2）

**文件**: `agentEngine.ts`
**修复**: 检查截断发生时是否在工具调用 JSON 中间。

```typescript
if (response.stopReason === 'max_tokens' && maxOutputRecoveryAttempts < MAX_OUTPUT_RECOVERY) {
    maxOutputRecoveryAttempts++;

    const hasIncompleteToolUse = response.content.some(
        b => b.type === 'tool_use' && typeof b.input === 'string'
    );

    if (hasIncompleteToolUse) {
        // 工具 JSON 被截断——要求重新生成完整调用
        this.messages.push({
            role: 'user',
            content: 'Your previous response was truncated mid-tool-call. '
                + 'Please re-send the complete tool call with valid JSON arguments.',
        });
    } else {
        this.messages.push({
            role: 'user',
            content: 'Please continue from where you left off.',
        });
    }
    continue;
}
```

#### P0-10. `executeTools` 保持原始工具顺序（#11, #12）

**文件**: `agentEngine.ts`
**修复**: 保持原始顺序，用 slot 数组收集结果。同时接入 `updatedInput`。

```typescript
private async executeTools(toolUseBlocks: ToolUseBlock[]): Promise<...> {
    if (!this.toolExecutor) { ... }

    const MAX_CONCURRENCY = 10;
    const results: (ToolResult & { tool_name?: string })[] = new Array(toolUseBlocks.length);

    // 按原始索引执行，读写分类并行，但结果按原始位置存放
    const readOnlyIndices: number[] = [];
    const mutationIndices: number[] = [];

    for (let i = 0; i < toolUseBlocks.length; i++) {
        if (this.toolExecutor.isReadOnlyTool(toolUseBlocks[i].name)) {
            readOnlyIndices.push(i);
        } else {
            mutationIndices.push(i);
        }
    }

    // 并发执行只读（结果写回原始位置）
    for (let i = 0; i < readOnlyIndices.length; i += MAX_CONCURRENCY) {
        const batch = readOnlyIndices.slice(i, i + MAX_CONCURRENCY);
        const batchResults = await Promise.all(
            batch.map(idx => this.executeSingleTool(toolUseBlocks[idx])),
        );
        batch.forEach((origIdx, j) => { results[origIdx] = batchResults[j]; });
    }

    // 串行执行 mutation（结果写回原始位置）
    for (const idx of mutationIndices) {
        results[idx] = await this.executeSingleTool(toolUseBlocks[idx]);
    }

    return results;
}
```

`updatedInput` 接入（同文件 `executeSingleTool`）：
```typescript
if (this.config.canUseTool) {
    const permission = await this.config.canUseTool(block.name, block.input);
    if (permission.behavior === 'deny') { ... }
    // 使用 updatedInput（如有）
    if (permission.updatedInput !== undefined) {
        block = { ...block, input: permission.updatedInput };
    }
}
```

#### P0-11. 流式 thinking 累积到 contentBlocks（#15）

**文件**: `agentEngine.ts`
**修复**:

```typescript
// L238 增加
let currentThinkingBlock: { type: 'thinking'; thinking: string } | undefined;

// L256-258 修改
case 'thinking':
    if (!currentThinkingBlock) {
        currentThinkingBlock = { type: 'thinking', thinking: '' };
    }
    currentThinkingBlock.thinking += event.thinking;
    yield { type: 'thinking_delta', thinking: event.thinking } as AgentEvent;
    break;

// message_complete 时（L285 之后）将 thinking 推入 contentBlocks
if (currentThinkingBlock && currentThinkingBlock.thinking) {
    contentBlocks.unshift(currentThinkingBlock);
    currentThinkingBlock = undefined;
}
```

#### P0-12. build.sh 增加 compile-extensions-build 跳过选项（#73）

**文件**: `build.sh`
**修复**:

```bash
# build.sh: 增加环境变量控制
if [[ "${SKIP_EXTENSIONS_BUILD}" != "yes" ]]; then
    npm run gulp compile-extensions-build
else
    echo "Skipping compile-extensions-build (SKIP_EXTENSIONS_BUILD=yes)"
fi
```

---

### P1 — 本周修复（安全边界与 Provider 健壮性）

#### P1-01. MCP sampling "Not Now" 语义修正（#63）

**文件**: `vscode/src/vs/workbench/contrib/mcp/common/mcpSamplingService.ts`
**说明**: 此为 VS Code 上游代码，修改需谨慎。
**修复**: `_getMatchingModelInner` 中改为检查 `Map.get()` 的布尔值而非仅 `has()`。

```typescript
// 现有: !this._sessionSets.allowedDuringChat.has(server.definition.id)
// 改为:
const allowed = this._sessionSets.allowedDuringChat.get(server.definition.id);
if (isDuringToolCall && !config.allowedDuringChat && allowed !== true) {
    return config.allowedDuringChat === undefined
        ? ModelMatch.UnsureAllowedDuringChat
        : ModelMatch.NotAllowed;
}
```

对 `allowedOutsideChat` 做同样修改。

#### P1-02. testConnection 增加超时保护（#33）

**文件**: `apiKeyService.ts`
**修复**: 在三个 `_test*` 方法中统一使用 `AbortSignal.timeout()`。

```typescript
private async _testAnthropic(apiKey: string, baseURL?: string, model?: string): Promise<IConnectionTestResult> {
    const base = baseURL || 'https://api.anthropic.com';
    const testModel = model || 'claude-haiku-4-5';

    const response = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),  // ← 15s 超时
        headers: { ... },
        body: JSON.stringify({ model: testModel, max_tokens: 1, messages: [...] }),
    });
    // ...
}
```

对 `_testOpenAI`、`_testGemini` 做同样修改。

#### P1-03. SSE readSSELines 流结束时 flush 尾部 buffer（#18）

**文件**: `abstractProvider.ts`
**修复**:

```typescript
protected async *readSSELines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) { break; }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop()!;
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data: ')) { continue; }
                const data = trimmed.slice(6).trim();
                if (!data) { continue; }
                yield data;
            }
        }
        // ← 新增: flush 最后的 decoder 缓冲 + 处理尾部 buffer
        buffer += decoder.decode();
        if (buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith('data: ')) {
                const data = trimmed.slice(6).trim();
                if (data) { yield data; }
            }
        }
    } finally {
        reader.releaseLock();
    }
}
```

#### P1-04. Gemini 流式路径处理 chunk 内 error（#22）

**文件**: `geminiProvider.ts`
**修复**: 在 `parseGeminiSSEStream` 的 chunk 处理循环中增加 error 检查。

```typescript
for await (const data of this.readSSELines(body)) {
    const chunk = this.parseSSEData<GeminiResponse>(data);
    if (!chunk) { continue; }

    // ← 新增: 检查流式 error
    if (chunk.error) {
        const err: any = new Error(
            `Gemini streaming error: ${chunk.error.code} ${chunk.error.status}: ${chunk.error.message}`,
        );
        err.status = chunk.error.code;
        throw err;
    }

    if (chunk.candidates) { ... }
}
```

#### P1-05. historyToNormalizedMessages 保留工具上下文（#4）

**文件**: `messageNormalization.ts`
**修复**: `extractAssistantText` 改为 `extractAssistantContent`，返回结构化内容而非纯文本。

```typescript
function extractAssistantContent(
    response: ReadonlyArray<any>,
): string | NormalizedContentBlock[] {
    const blocks: NormalizedContentBlock[] = [];

    for (const part of response) {
        if (part.kind === 'markdownContent' && part.content) {
            blocks.push({ type: 'text', text: part.content.value || '' });
        } else if (part.kind === 'text' && part.value) {
            blocks.push({ type: 'text', text: part.value });
        } else if (part.kind === 'toolInvocation' && part.invocation) {
            blocks.push({
                type: 'tool_use',
                id: part.invocation.callId || '',
                name: part.invocation.toolId || '',
                input: part.invocation.input || {},
            });
        }
    }

    if (blocks.length === 0) { return ''; }
    if (blocks.length === 1 && blocks[0].type === 'text') {
        return (blocks[0] as any).text;
    }
    return blocks;
}
```

#### P1-06. OpenAI vision 能力声明与实现对齐（#19）

**文件**: `openaiProvider.ts`, `abstractProvider.ts`
**修复方案 A**（推荐）: 在 `convertUserMessage` 中增加 image 处理。

```typescript
// openaiProvider.ts convertUserMessage
if (block.type === 'image' && block.source) {
    contentParts.push({
        type: 'image_url',
        image_url: {
            url: block.source.type === 'base64'
                ? `data:${block.source.media_type};base64,${block.source.data}`
                : block.source.url,
        },
    });
}
```

**修复方案 B**（最小改动）: 将 OpenAI 默认 `vision` 改为 `false`，直到实现图片转换。

#### P1-07. Gemini functionCall 工具 ID 稳定性（#23）

**文件**: `geminiProvider.ts`
**修复**: 用 `generateUuid()` 替代自增计数器。

```typescript
// 删除模块级 geminiCallCounter
import { generateUuid } from 'vs/base/common/uuid.js';

function generateGeminiToolId(name: string): string {
    return `gemini_${generateUuid().slice(0, 8)}_${name}`;
}
```

#### P1-08. `withRetry` 等待阶段可取消（#13）

**文件**: `retry.ts`
**修复**:

```typescript
// L110-112 替换 setTimeout
const delay = getRetryDelay(attempt, config);
await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delay);
    if (abortSignal) {
        const onAbort = () => {
            clearTimeout(timer);
            reject(new Error('Aborted'));
        };
        if (abortSignal.aborted) { onAbort(); return; }
        abortSignal.addEventListener('abort', onAbort, { once: true });
    }
});
```

#### P1-09. `shouldAutoCompact` 阈值下界保护（#14）

**文件**: `compact.ts`
**修复**:

```typescript
const threshold = maxInputTokensOverride
    ? Math.max(maxInputTokensOverride - AUTOCOMPACT_BUFFER_TOKENS, AUTOCOMPACT_BUFFER_TOKENS)
    : getAutoCompactThreshold(model);
```

#### P1-10. `estimateCost` 计入 cache tokens + 精确匹配（#9, #10）

**文件**: `tokens.ts`
**修复**:

```typescript
// 按 key 长度降序排列，确保先匹配更精确的 key
const SORTED_PRICING = Object.entries(MODEL_PRICING)
    .sort(([a], [b]) => b.length - a.length);

export function estimateCost(model: string, usage: TokenUsage): number {
    const pricing = SORTED_PRICING.find(([key]) =>
        model.includes(key),
    )?.[1] ?? { input: 3 / 1_000_000, output: 15 / 1_000_000 };

    let inputCost = usage.input_tokens * pricing.input;
    // cache_read 通常 90% 折扣，cache_creation 通常 125% 溢价
    if (usage.cache_read_input_tokens) {
        inputCost += usage.cache_read_input_tokens * pricing.input * 0.1;
    }
    if (usage.cache_creation_input_tokens) {
        inputCost += usage.cache_creation_input_tokens * pricing.input * 1.25;
    }

    return inputCost + usage.output_tokens * pricing.output;
}
```

#### P1-11. autoApprove 策略改为 per-agent 而非全局（#47, #64）

**文件**: `agentEngine.contribution.ts`
**修复**: 移除全局 autoApprove 写入，改在 Agent invoke 中通过 `modeInfo.permissionLevel` 控制。

```typescript
// 删除 _enableToolAutoApprove 方法调用
// 若需要 Agent 模式自动批准，在 DirectorCodeAgent.invoke() 中
// 设置 request 的 permissionLevel 为 AutoApprove（VS Code 已有该机制）
```

这需要进一步评估产品需求：如果 Agent 模式确实需要自动批准，应使用 VS Code 内置的 `ChatAgentMode.Agent` + 权限级别机制，而非修改全局配置。

#### P1-12. `registerDynamicAgent` 增加重复 ID 防护（#65）

**文件**: `chatAgents.ts`
**说明**: 此为上游代码，为 Phase 2 ACP 预防。
**修复**:

```typescript
registerDynamicAgent(data: IChatAgentData, agentImpl: IChatAgentImplementation): IDisposable {
    data.isDynamic = true;
    const existing = this._agents.get(data.id);
    if (existing) {
        existing.impl?.dispose?.();
        this._agents.delete(data.id);
    }
    const agent = { data, impl: agentImpl };
    this._agents.set(data.id, agent);
    // ...
}
```

#### P1-13. `onDidChangeApiKey` 事件 payload 结构化（#37, #38）

**文件**: `apiKeyService.ts`
**修复**:

```typescript
// 定义结构化事件
export interface ApiKeyChangeEvent {
    readonly provider: string;
    readonly modelId?: string;
    readonly prefix: 'apiKey' | 'modelKey' | 'modelConfig';
}

// _onDidChangeApiKey 改为 Emitter<ApiKeyChangeEvent>
this._register(this.secretService.onDidChangeSecret((key) => {
    if (key.startsWith(SECRET_KEY_PREFIX + '.')) {
        this._onDidChangeApiKey.fire({
            provider: key.slice(SECRET_KEY_PREFIX.length + 1),
            prefix: 'apiKey',
        });
    } else if (key.startsWith(MODEL_KEY_PREFIX + '.')) {
        const suffix = key.slice(MODEL_KEY_PREFIX.length + 1);
        const dotIdx = suffix.indexOf('.');
        this._onDidChangeApiKey.fire({
            provider: dotIdx > 0 ? suffix.slice(0, dotIdx) : suffix,
            modelId: dotIdx > 0 ? suffix.slice(dotIdx + 1) : undefined,
            prefix: 'modelKey',
        });
    } else if (key.startsWith(MODEL_CONFIG_PREFIX + '.')) {
        const suffix = key.slice(MODEL_CONFIG_PREFIX.length + 1);
        const dotIdx = suffix.indexOf('.');
        this._onDidChangeApiKey.fire({
            provider: dotIdx > 0 ? suffix.slice(0, dotIdx) : suffix,
            modelId: dotIdx > 0 ? suffix.slice(dotIdx + 1) : undefined,
            prefix: 'modelConfig',
        });
    }
}));
```

#### P1-14. OpenAI `stream_options` 兼容性处理（#24）

**文件**: `openaiProvider.ts`
**修复**: 仅对官方 OpenAI 端点附加 `stream_options`。

```typescript
const body: Record<string, any> = {
    model: params.model,
    max_tokens: params.maxTokens,
    messages,
    stream: true,
};
// 仅官方 OpenAI API 保证支持 stream_options
if (this.baseURL.includes('api.openai.com')) {
    body.stream_options = { include_usage: true };
}
```

#### P1-15. OpenAI baseURL 智能补全 /v1（#28）

**文件**: `openaiProvider.ts`
**修复**: 在 `getDefaultBaseURL` 之外，对 compatible 端点做路径补全。

```typescript
// 在请求 URL 构造时
private getApiUrl(): string {
    const base = this.baseURL;
    // 如果 baseURL 不以 /v1 结尾且不是默认 OpenAI
    if (!base.endsWith('/v1') && !base.includes('api.openai.com')) {
        return `${base}/v1/chat/completions`;
    }
    return `${base}/chat/completions`;
}
```

#### P1-16. Gemini `tool_result → functionResponse` 兜底改进（#25）

**文件**: `geminiProvider.ts`
**修复**: `toolNameMap` 在历史消息中也收集映射，而非仅当前消息。

```typescript
// convertMessages 中，先遍历全部消息建立 toolNameMap
const toolNameMap = new Map<string, string>();
for (const msg of messages) {
    if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
            if (block.type === 'tool_use') {
                toolNameMap.set(block.id, block.name);
            }
        }
    }
}
// 然后在转换 tool_result 时使用该 map
```

#### P1-17. MCP 图片 resource_link 失败时返回错误描述（#66）

**文件**: `mcpLanguageModelToolContribution.ts`
**说明**: 此为上游代码。
**修复**:

```typescript
// 替换 .catch(() => VSBuffer.alloc(0))
data: await this._fileService.readFile(uri)
    .then(f => f.value)
    .catch(err => {
        // 返回错误描述而非空数据
        return VSBuffer.fromString(`[Error reading resource: ${err.message}]`);
    }),
```

#### P1-18. `directorCodeAgent.invoke()` 区分错误终态（#55）

**文件**: `directorCodeAgent.ts`
**修复**:

```typescript
if (event.type === 'result') {
    const resultEvent = event as any;
    if (resultEvent.subtype === 'error'
        || resultEvent.subtype === 'cancelled'
        || resultEvent.subtype === 'error_max_budget_usd') {
        return {
            errorDetails: {
                message: resultEvent.subtype === 'cancelled'
                    ? 'Request was cancelled.'
                    : resultEvent.subtype === 'error_max_budget_usd'
                        ? 'Budget limit exceeded.'
                        : resultEvent.error || 'Agent encountered an error',
            },
            ...
        };
    }
    // error_max_turns 仍走成功返回 + followup 提示（现有逻辑）
    // ...
}
```

---

### P2 — 下周修复（Phase 2 前清理）

#### P2-01. OAuth clientId 一致性（#31）

**文件**: `oauthService.ts`
**修复**: 将 `effectiveClientId` 存入 `IOAuthState`。

```typescript
// startOAuthFlow 中
const stateData: IOAuthState = {
    provider,
    codeVerifier,
    timestamp: Date.now(),
    clientId: effectiveClientId,  // ← 新增
};

// handleCallback 中
const tokens = await this._exchangeCodeForTokens(
    config, code, flowState.codeVerifier,
    flowState.clientId || config.clientId,  // ← 使用存储的 clientId
);

// _exchangeCodeForTokens 签名增加 clientId 参数
private async _exchangeCodeForTokens(
    config: IOAuthConfig, code: string, codeVerifier: string,
    clientId: string,
): Promise<IOAuthTokens> {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: clientId,  // ← 使用传入的 clientId
        code_verifier: codeVerifier,
    });
    // ...
}
```

`_refreshAccessToken` 同理需要接受并使用正确的 `clientId`。

#### P2-02. OAuth state 交换成功后再删除（#34）

**文件**: `oauthService.ts`
**修复**:

```typescript
async handleCallback(code: string, state: string): Promise<IOAuthTokens> {
    const raw = await this.secretService.get(`${OAUTH_STATE_PREFIX}.${state}`);
    // ...解析 flowState...

    // ← 先 exchange，成功后再删除 state
    const config = getOAuthConfig(flowState.provider);
    const tokens = await this._exchangeCodeForTokens(config, code, flowState.codeVerifier, ...);

    // exchange 成功后清理 state
    await this.secretService.delete(`${OAUTH_STATE_PREFIX}.${state}`);

    // 存储 tokens...
    return tokens;
}
```

#### P2-03. OAuth state 启动时清理过期条目（#32）

**文件**: `oauthService.ts`
**修复**: 添加定期清理方法。

```typescript
async cleanupExpiredStates(): Promise<void> {
    // 遍历 SecretStorage 中所有 oauthState.* 条目
    // 删除超过 15 分钟的
    // 在 OAuthService 注册到 workbench 时调用一次
}
```

注意：由于 `ISecretStorageService` 没有 list/enumerate API，可以维护一个已知 state key 列表（在 startOAuthFlow 时记录到一个普通 storage key），清理时遍历该列表。

#### P2-04. OAuth refresh delay 上限保护（#35）

**文件**: `oauthService.ts`
**修复**:

```typescript
private _scheduleRefresh(provider: OAuthProviderName, tokens: IOAuthTokens): void {
    const MAX_DELAY = 24 * 60 * 60 * 1000; // 24 小时
    const rawDelay = Math.max(0, tokens.expiresAt - Date.now() - REFRESH_BUFFER_MS);
    const delay = Math.min(rawDelay, MAX_DELAY);
    const timer = setTimeout(async () => { ... }, delay);
}
```

#### P2-05. OAuthService / ModelResolverService 注册到 workbench（#48）

**文件**: `agentEngine.contribution.ts`
**修复**: 在 Phase 2 接线时添加注册。

```typescript
import { IOAuthService, OAuthService } from '../common/agentEngine/oauthService.js';
import { IModelResolverService, ModelResolverService } from '../common/agentEngine/modelResolver.js';

registerSingleton(IOAuthService, OAuthService, InstantiationType.Delayed);
registerSingleton(IModelResolverService, ModelResolverService, InstantiationType.Delayed);
```

需要先为 `OAuthService` 和 `ModelResolverService` 定义 `createDecorator` 接口。

#### P2-06. DirectorCodeModelProvider 使用 resolveProviderOptions（#49）

**文件**: `directorCodeModelProvider.ts`
**修复**:

```typescript
async sendChatRequest(modelId: string, messages: IChatMessage[], ...): Promise<...> {
    // 用 resolveProviderOptions 替代直接 getApiKey
    const resolved = await this.apiKeyService.resolveProviderOptions(
        effectiveProvider as ProviderName,
        shortId,
        this.configService.getValue<string>(CONFIG_BASE_URL) || undefined,
    );
    if (!resolved) {
        throw new Error(`No API key configured for ${effectiveProvider}`);
    }

    const provider = createProvider(
        resolveApiType(effectiveProvider as ProviderName),
        { apiKey: resolved.apiKey, baseURL: resolved.baseURL, capabilities: resolved.capabilities },
    );
    // ...
}
```

#### P2-07. DirectorCodeModelProvider 继承 Disposable（#51, #53）

**文件**: `directorCodeModelProvider.ts`
**修复**:

```typescript
import { Disposable } from 'vs/base/common/lifecycle.js';

export class DirectorCodeModelProvider extends Disposable implements ILanguageModelChatProvider {
    private readonly _onDidChange = this._register(new Emitter<void>());
    readonly onDidChange = this._onDidChange.event;

    constructor(...) {
        super();
        this._register(this.configService.onDidChangeConfiguration(e => { ... }));
    }

    // createAbortSignal 改为返回 disposable
    private createAbortSignal(token: CancellationToken): { signal: AbortSignal; disposable: IDisposable } {
        const controller = new AbortController();
        const disposable = token.onCancellationRequested(() => controller.abort());
        return { signal: controller.signal, disposable };
    }
}
```

#### P2-08. resolveProviderOptions 实现与注释对齐（#40）

**文件**: `apiKeyService.ts`
**修复**: 补全三级 fallback。

```typescript
async resolveProviderOptions(
    provider: ProviderName, modelId: string, globalBaseURL?: string,
): Promise<IResolvedProviderOptions | undefined> {
    const apiKey = await this.getModelApiKey(provider, modelId);
    if (!apiKey) { return undefined; }

    const modelConfig = await this.getModelConfig(provider, modelId);
    const catalogModel = findModelById(modelId);

    // Base URL: per-model → global → provider default
    const baseURL = modelConfig?.baseURL
        || globalBaseURL
        || PROVIDER_DEFAULT_URLS[provider]
        || undefined;

    // Capabilities: per-model → catalog → provider defaults
    const capabilities = modelConfig?.capabilities
        || (catalogModel ? { vision: catalogModel.vision, toolCalling: true } : undefined)
        || undefined;

    return { apiKey, baseURL, capabilities };
}
```

#### P2-09. ModelResolverService 缓存键含 apiKey 哈希（#42）

**文件**: `modelResolver.ts`
**修复**:

```typescript
private _cacheKey(provider: ProviderName, apiKey?: string, baseURL?: string): string {
    const keyHash = apiKey ? apiKey.slice(-6) : 'nokey';
    return `${provider}:${baseURL || 'default'}:${keyHash}`;
}
```

使用 API key 末尾 6 位作为区分因子（避免存储完整 key）。

#### P2-10. ModelResolverService 缓存并发去重（#44）

**文件**: `modelResolver.ts`
**修复**: 缓存进行中的 Promise。

```typescript
private readonly _pendingRequests = new Map<string, Promise<IResolvedModel[]>>();

async resolveModels(provider: ProviderName, apiKey?: string, baseURL?: string): Promise<IResolvedModel[]> {
    const cacheKey = this._cacheKey(provider, apiKey, baseURL);
    const cached = this._cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.models;
    }

    // 去重：复用进行中的请求
    const pending = this._pendingRequests.get(cacheKey);
    if (pending) { return pending; }

    const promise = this._resolveAndCache(provider, apiKey, baseURL, cacheKey)
        .finally(() => this._pendingRequests.delete(cacheKey));
    this._pendingRequests.set(cacheKey, promise);
    return promise;
}
```

#### P2-11. `_openAIModelToResolved` 不用 `!!baseURL` 判断（#43）

**文件**: `modelResolver.ts`
**修复**: 接受 `actualProvider` 参数。

```typescript
private _openAIModelToResolved(
    id: string, actualProvider: ProviderName, baseURL?: string,
): IResolvedModel {
    const existing = MODEL_CATALOG.find(m => m.id === id);
    if (existing) { return { ...existing, source: 'api' as const }; }

    return {
        id,
        name: id,
        provider: actualProvider,  // ← 直接使用调用方传入的 provider
        // ...
    };
}
```

#### P2-12. `estimateTokens` 改进字节级估算（#8）

**文件**: `tokens.ts`
**修复**:

```typescript
export function estimateTokens(text: string): number {
    // 基于 UTF-8 字节长度的启发式估算
    // 英文 ~4 bytes/token, 中文 ~3 bytes/token (UTF-8 3字节/字), CJK ~1-2 tokens/char
    const byteLength = new TextEncoder().encode(text).length;
    return Math.ceil(byteLength / 3.5);
}
```

#### P2-13. OpenAI max_tokens vs max_completion_tokens（#27）

**文件**: `openaiProvider.ts`
**修复**:

```typescript
// 构造请求体时根据模型选择参数名
const isReasoningModel = params.model.match(/^o[1-4]/);
const tokenKey = isReasoningModel ? 'max_completion_tokens' : 'max_tokens';
const body: Record<string, any> = {
    model: params.model,
    [tokenKey]: params.maxTokens,
    messages,
    stream: true,
};
```

#### P2-14. DirectorCodeModelProvider 不降为纯文本（#50）

**文件**: `directorCodeModelProvider.ts`
**修复**: `convertMessages` 保留富内容。

```typescript
private convertMessages(messages: IChatMessage[]): NormalizedMessageParam[] {
    return messages.map(msg => ({
        role: msg.role === 1 ? 'assistant' : 'user',
        content: this.chatMessageToContent(msg),
    }));
}

private chatMessageToContent(message: IChatMessage): string | NormalizedContentBlock[] {
    const blocks: NormalizedContentBlock[] = [];
    for (const part of message.content) {
        if (part.type === 'text') {
            blocks.push({ type: 'text', text: part.value });
        }
        // 可扩展: image, tool_use 等
    }
    if (blocks.length === 1 && blocks[0].type === 'text') {
        return (blocks[0] as any).text;
    }
    return blocks.length > 0 ? blocks : '';
}
```

#### P2-15. Settings UI 识别 per-model key（#57）

**文件**: `apiKeysWidget.ts`
**修复**: 状态检测时同时检查 provider 级和 model 级 key。

```typescript
// render() 中
const currentModel = this.configService.getValue<string>(CONFIG_MODEL) || '';
const hasProviderKey = await this.apiKeyService.hasApiKey(provider);
const hasModelKey = currentModel
    ? await this.apiKeyService.getModelApiKey(provider, currentModel) !== undefined
    : false;
const hasAnyKey = hasProviderKey || hasModelKey;
```

#### P2-16. Test Connection 使用 per-provider 模型（#58）

**文件**: `apiKeysWidget.ts`
**修复**:

```typescript
// Test Connection 时根据 provider 选择测试模型
import { getDefaultModel } from '../common/agentEngine/modelCatalog.js';

const testModel = getDefaultModel(provider) || undefined;
const baseURL = ...; // per-provider 而非全局
const result = await this.apiKeyService.testConnection(provider, apiKey, baseURL, testModel);
```

#### P2-17. `anthropic-compatible` 默认模型处理（#61）

**文件**: `providerSettingsWidget.ts`
**修复**: 切换到无预设模型的 provider 时，不写入空模型，而是保留原值或提示用户。

```typescript
private onProviderChanged(): void {
    const provider = this.providerSelect.value as ProviderName;
    this.populateModelSelect(provider);

    const defaultModel = getDefaultModel(provider);
    if (defaultModel) {
        this.modelSelect.value = defaultModel;
        this.saveToConfig(CONFIG_MODEL, defaultModel);
    } else {
        // 无预设模型的 provider：显示自定义输入框，不写入空值
        this.showCustomModelInput(true);
    }
    // ...
}
```

#### P2-18. `saveToConfig` 改为 async + 防抖（#59, #62）

**文件**: `providerSettingsWidget.ts`
**修复**:

```typescript
import { RunOnceScheduler } from 'vs/base/common/async.js';

private readonly _pendingConfigWrites = new Map<string, string | number>();
private readonly _configWriteScheduler = new RunOnceScheduler(() => this._flushConfigWrites(), 300);

private saveToConfig(key: string, value: string | number): void {
    this._pendingConfigWrites.set(key, value);
    this._configWriteScheduler.schedule();
}

private async _flushConfigWrites(): Promise<void> {
    this._updating = true;
    try {
        for (const [key, value] of this._pendingConfigWrites) {
            await this.configService.updateValue(key, value, ConfigurationTarget.USER);
        }
        this._pendingConfigWrites.clear();
    } finally {
        this._updating = false;
    }
}
```

#### P2-19. progressBridge 非流式降级路径处理（#54）

**文件**: `progressBridge.ts`
**修复**: 在 `convertAssistantEvent` 中，如果没有先前的 `text_delta`，则渲染正文。

```typescript
function convertAssistantEvent(
    event: AgentEvent & { type: 'assistant' },
    hasReceivedTextDelta: boolean,  // ← 新增参数，由调用方追踪
): IChatProgress[] {
    const parts: IChatProgress[] = [];
    const content = event.message.content;

    if (typeof content === 'string') {
        // 仅当无 text_delta 渲染过时才输出正文
        if (!hasReceivedTextDelta && content) {
            parts.push({ kind: 'markdownContent', content: new MarkdownString(content) });
        }
        return parts;
    }

    for (const block of content) {
        if (block.type === 'thinking' && block.thinking) { ... }
        if (block.type === 'text' && block.text && !hasReceivedTextDelta) {
            parts.push({ kind: 'markdownContent', content: new MarkdownString(block.text) });
        }
    }
    return parts;
}
```

#### P2-20. toolBridge 超时与 CancellationToken 绑定（#60）

**文件**: `toolBridge.ts`
**修复**:

```typescript
private invokeWithTimeout(...): Promise<...> {
    return new Promise((resolve, reject) => {
        const cts = new CancellationTokenSource(this.token);

        const timer = setTimeout(() => {
            cts.cancel();  // ← 超时时取消底层工具
            reject(new Error(`Tool '${toolName}' timed out...`));
        }, TOOL_TIMEOUT_MS);

        this.toolsService.invokeTool(invocation, countTokens, cts.token)
            .then(result => {
                clearTimeout(timer);
                cts.dispose();
                resolve(result);
            })
            .catch(err => {
                clearTimeout(timer);
                cts.dispose();
                reject(err);
            });
    });
}
```

#### P2-21. prepare_vscode.sh 备份到临时目录（#74）

**文件**: `prepare_vscode.sh`
**修复**:

```bash
BACKUP_DIR=$(mktemp -d)
# 替换所有 cp product.json{,.bak} 为:
cp product.json "$BACKUP_DIR/product.json.bak"
# 脚本结束时清理
trap "rm -rf $BACKUP_DIR" EXIT
```

#### P2-22. tokens.ts 与 modelCatalog.ts 统一数据源（#45, #46）

**文件**: `tokens.ts`, `modelCatalog.ts`
**修复**: 在 `IModelDefinition` 中增加 `pricing` 和 `contextWindow` 字段，`tokens.ts` 从 catalog 读取。

```typescript
// modelCatalog.ts
export interface IModelDefinition {
    // 现有字段...
    readonly pricing?: { input: number; output: number };
    readonly contextWindow?: number;
}

// tokens.ts
import { MODEL_CATALOG } from './modelCatalog.js';

export function getContextWindowSize(model: string): number {
    const catalogModel = MODEL_CATALOG.find(m => model.includes(m.id));
    if (catalogModel?.contextWindow) { return catalogModel.contextWindow; }
    // ... fallback 逻辑
}
```

---

### P3 — 后续迭代（代码质量与防御性编程）

| # | 问题 | 修复方式 | 涉及文件 |
|---|------|---------|---------|
| P3-01 | OAuth 全局 `crypto`/`btoa` 依赖 (#36) | 从 `node:crypto` 或 VS Code 平台层导入；当前 Electron 环境实际可用，低优先级 | `oauthService.ts` |
| P3-02 | `getProviderAuthMethod` 硬编码 (#39) | 接入 OAuth 时同步修改，根据 provider 和 token 状态返回实际 auth method | `apiKeyService.ts` |
| P3-03 | SSE 解析 `event:` 行 (#18 扩展) | `readSSELines` 可选解析 `event:` 行并与 `data:` 配对 yield | `abstractProvider.ts` |
| P3-04 | SSE buffer 最大长度限制 (#26) | `buffer` 超过 1MB 时断连抛错 | `abstractProvider.ts` |
| P3-05 | compact 使用更廉价模型 (#16) | `compactConversation` 接受 `compactModel` 参数，默认用 haiku | `compact.ts` |
| P3-06 | OpenAI vision image 完整支持 (#19 完整版) | `convertUserMessage` 处理 base64/URL 图片 | `openaiProvider.ts` |
| P3-07 | `as any` 类型断言清理 | `MutableMessageParam` 与 `NormalizedMessageParam` 类型兼容改造 | `agentEngine.ts`, `agentEngineTypes.ts` |
| P3-08 | `DirectorCodeAgent` 错误记录完整堆栈 (#56) | `catch` 中用 `ILogService.error(err)` 记录完整堆栈 | `directorCodeAgent.ts` |
| P3-09 | `requestToUserMessage` 纳入结构化上下文 | 处理 `request.variableData`、附件等 | `messageNormalization.ts` |
| P3-10 | `QuickChat` 默认模式改为 Agent | 产品决策后修改 `defaultMode` | `chatQuick.ts` |
| P3-11 | OpenAI `convertUserMessage` 顺序语义注释 | 添加注释说明 tool_result 先于 text 的原因 | `openaiProvider.ts` |
| P3-12 | `lastError` undefined 兜底 | `throw lastError ?? new Error('Retry exhausted')` | `retry.ts` |
| P3-13 | Settings gear icon 移除 spin | 删除 `ThemeIcon.modify(..., 'spin')` | `directorCodeSettingsEditor.ts` |
| P3-14 | `buildCompactionPrompt` 智能截断 | 在代码块边界截断，使用 token 估算 | `compact.ts` |
| P3-15 | `progressBridge` 工具结果 Markdown 转义 | 用 code fence 包裹工具输出 | `progressBridge.ts` |
| P3-16 | `EditorInput.resolve()` 返回 null 问题 | 返回轻量 model 对象而非 null | `directorCodeSettingsEditor.ts` |
| P3-17 | `McpAddContextContribution` capability 订阅 (#69) | 上游代码：改用 `read(reader)` 订阅 capability 变化 | `mcpAddContextContribution.ts` |
| P3-18 | `invokeTool` 按 chatRequestId 查找 request (#67, #68) | 上游代码：`getRequests().find(r => r.id === chatRequestId)` | `languageModelToolsService.ts` |
| P3-19 | `apiKeysWidget` 密码框安全强化 | 输入完成后 blur 时立即清空 DOM value | `apiKeysWidget.ts` |
| P3-20 | 构建后 product.json 品牌校验测试 | 添加 smoke test 校验关键字段 | 新建 `test/product-brand.test.ts` |
| P3-21 | ModelResolver `_isRelevantOpenAIModel` 扩展 | 增加 `chatgpt-4o-latest` 等变体匹配 | `modelResolver.ts` |
| P3-22 | ModelProvider 模型列表接入 ModelResolverService (#52) | ModelProvider 使用动态列表 + 静态 fallback | `directorCodeModelProvider.ts` |

---

### 修复依赖关系

```
P0-01 (abortSignal) ──→ P0-02 (cancelled subtype) ──→ P1-18 (Agent 错误终态)
P0-03 (多工具分桶) ──→ 独立
P0-04 (JSON 解析) ──→ P0-09 (max_tokens 恢复)
P0-05 (compact 假成功) ──→ 独立
P0-06/07/08 (品牌) ──→ P3-20 (品牌测试)
P0-10 (工具顺序) ──→ 独立
P0-11 (thinking 累积) ──→ 独立
P1-01 (MCP sampling) ──→ P1-11 (autoApprove 策略)
P1-13 (事件结构化) ──→ P2-15 (UI per-model key)
P2-01/02/03/04 (OAuth 修复组) ──→ P2-05 (注册到 workbench)
P2-06 (resolveOptions) ──→ P2-08 (注释对齐)
P2-09/10/11 (ModelResolver 修复组) ──→ P2-05 + P3-22
```

### 测试补充清单

每条修复均需对应测试。按优先级标注需要新增的测试用例：

| 批次 | 测试文件 | 新增用例 |
|------|---------|---------|
| P0 | `agentEngine.test.ts` | abort 后 subtype 为 cancelled；多 tool_call_delta index 分桶；JSON 解析失败回传 LLM；compact 失败不发 boundary |
| P0 | `agentEngine.test.ts` | thinking 累积到 contentBlocks；工具执行结果保持原始顺序；updatedInput 被使用 |
| P1 | `abstractProvider.test.ts` | SSE 尾部 buffer flush；超长 buffer 保护 |
| P1 | `geminiProvider.test.ts` | 流式 error chunk 处理；UUID 工具 ID |
| P1 | `apiKeyService.test.ts` | testConnection 超时；结构化事件 payload |
| P1 | `messageNormalization.test.ts` | 工具调用历史保留 |
| P2 | `oauthService.test.ts` | clientId 一致性全流程；state 在 exchange 后删除；过期 state 清理 |
| P2 | `modelResolver.test.ts` | 缓存键含 apiKey；并发去重；provider 类型准确 |
| P2 | `directorCodeModelProvider.test.ts` | Disposable 生命周期；富内容消息保留 |
| P3 | `product-brand.test.ts` | defaultChatAgent 无 Copilot；dataFolderName 正确；无 Microsoft 链接 |

---

*修复方案由 Claude (Opus 4.6) 于 2026-04-15 生成。建议按 P0 → P1 → P2 → P3 顺序逐批实施，每批完成后运行全量测试确认无回归。*
