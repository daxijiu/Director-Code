# Director-Code 全量 Review 报告 review by GPT5.4 (2026-04-15)

## 审查范围

本报告合并了此前几轮审查的全部结论，覆盖以下范围：

- 当前工作区改动与仓库卫生
- `AgentEngine` 主循环、工具执行与进度桥接
- `languageModelToolsService` 工具调用/确认链路
- `OAuthService`、`ApiKeyService`、`ModelResolverService`
- `DirectorCodeModelProvider`、Settings UI、API Key UI
- OpenAI / Gemini / Anthropic Provider 协议转换与 SSE 流式处理
- 单元测试与集成测试的覆盖缺口

## 一句话总判断

这批代码的最大问题已经不是“某几个点写错了”，而是出现了明显的三层脱节：

1. `状态机层`：取消、压缩、工具执行顺序等核心回路存在假成功和语义错乱。
2. `协议层`：Provider 输出的流式工具协议，与 `AgentEngine` 的消费方式并不匹配。
3. `配置层`：Agent、ModelProvider、Settings UI、API Key Service 对同一份配置的解释不一致。

结果就是：**看起来能跑，但一到取消、并发工具、兼容 Provider、per-model 配置这些真实场景，就会系统性出错。**

## 严重问题

### 1. `languageModelToolsService` 把工具调用绑定到“最后一个请求”，而不是当前请求

- 问题：`invokeTool()`、`shouldAutoConfirm()`、`shouldAutoConfirmPostExecution()` 都会从 session 里拿 `getRequests().at(-1)`，而不是精确绑定 `dto.chatRequestId`。
- 影响：并发请求、重试、历史请求残留时，工具确认和自动批准逻辑可能会绑定到错误的 request。
- 后果：A 请求发起的工具，有机会吃到 B 请求的 permission level，出现误批、误拒、错误上下文执行。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts`

### 2. `AgentEngine` 取消请求会被误报成成功，而且还可能写入半截状态

- 问题：`submitMessage()` 里检测到 `abortSignal.aborted` 后只是 `break`，末尾 `endSubtype` 仍可能落到 `success`。
- 影响：UI、遥测、调用方都会把“用户取消”误认为“成功结束”。
- 额外风险：流式中途取消后，当前 assistant 内容、usage、工具状态仍可能被 finalize 并写回会话。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

### 3. 自动压缩失败会被伪装成压缩成功

- 问题：`compactConversation()` 失败时会返回原始消息并累计失败次数，但 `submitMessage()` 外层没有校验，仍然发出 `compact_boundary`。
- 影响：日志、UI、用户看到的是“Conversation compacted”，实际上可能根本没有压缩。
- 后果：上下文膨胀问题被掩盖，排障方向会被误导。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/compact.ts`、`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

### 4. OpenAI / Gemini 的多工具流式协议，与 `AgentEngine` 的拼装逻辑错位

- 问题：OpenAI 会连续给出带 `index` 的 `tool_call_delta`；Gemini 会发 `tool_use_start` + `tool_input_delta`。但 `AgentEngine` 只维护单个 `currentTool`，不按 `index` 或工具 ID 分桶。
- 影响：一旦单次响应里并发两个工具，参数流就会串台，工具 ID、工具名、JSON 参数都有机会被拼坏。
- 后果：这不是“显示顺序不对”，而是会直接把工具调用语义搞坏。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/openaiProvider.ts`、`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/geminiProvider.ts`、`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

### 5. `DirectorCodeModelProvider` 仍然绕过 per-model 配置解析

- 问题：`DirectorCodeAgent` 已经使用 `resolveProviderOptions()` 做三级解析，但 `DirectorCodeModelProvider.sendChatRequest()` 仍直接走 `getApiKey(provider)` 和全局 `baseURL`。
- 影响：per-model API Key、per-model `baseURL`、per-model `capabilities` 在标准 Chat 模型通路里根本不生效。
- 后果：同一个产品内，Agent 通路和 ModelProvider 通路对“配置”的理解不是一套逻辑。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeModelProvider.ts`、`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeAgent.ts`、`vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts`

### 6. OAuth 的 `client_id` 在授权、换 token、刷新 token 三处不一致

- 问题：`startOAuthFlow()` 允许传入自定义 `clientId`，但 `_exchangeCodeForTokens()` 和 `_refreshAccessToken()` 又退回用了 `config.clientId`。
- 影响：只要起始授权和后续 exchange/refresh 用的不是同一个 `client_id`，OAuth 流程就会在中段或刷新阶段炸掉。
- 后果：这种 bug 不一定在 happy path 立刻暴露，但会让“能登录、但不能稳定续期”的问题非常难查。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/oauthService.ts`

### 7. OAuth flow state 在 token 交换前就被删除

- 问题：`handleCallback()` 在真正 `_exchangeCodeForTokens()` 之前就删掉了 state。
- 影响：如果 token 交换失败，用户无法安全重试，现场也已经被清掉。
- 后果：既不利于恢复，也不利于排查，典型的“把证据先删了”。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/oauthService.ts`

### 8. `ModelResolverService` 的缓存键没包含 `apiKey`

- 问题：缓存键只看 `provider + baseURL`，不看 `apiKey`。
- 影响：不同账号、不同权限的模型列表会共享缓存。
- 后果：切换账号后仍看到旧账号的模型，甚至跨租户泄漏模型可见性。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/modelResolver.ts`

## 高风险问题

### 9. `toolBridge.ts` 的超时只是“假超时”，底层工具并没有被取消

- 问题：`invokeWithTimeout()` 只是在超时后让 Promise reject，但传给 `toolsService.invokeTool()` 的仍是外层 token，没有派生出可在超时时主动 cancel 的 token。
- 影响：Agent 以为工具超时了，实际上底层工具可能还在后台继续跑。
- 后果：会形成僵尸执行、资源泄漏和状态漂移。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/toolBridge.ts`

### 10. `toolBridge.ts` 把取消/拒绝确认转换成自然语言字符串，而不是结构化失败

- 问题：捕获 `CancellationError` 后直接返回一段文本。
- 影响：模型拿到的是一段“像普通工具输出一样的字符串”，而不是明确的失败类型。
- 后果：错误语义被抹平，模型会基于错误前提继续推理。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/toolBridge.ts`

### 11. 全局自动批准工具被默认打开，安全边界被主动放松

- 问题：`agentEngine.contribution.ts` 会在用户没明确配置时主动写入 `chat.tools.global.autoApprove = true`。
- 影响：默认安全策略从“显式确认”被改成“默认放行”。
- 后果：这不是普通体验优化，而是主动修改产品的安全默认值。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/agentEngine.contribution.ts`

### 12. `AgentEngine` 会重排模型给出的工具执行顺序

- 问题：`executeTools()` 先并发执行所有只读工具，再顺序执行 mutation 工具，而不是按模型原始顺序执行。
- 影响：只要模型计划是读写交错，执行结果就可能失真。
- 后果：模型认为自己在“先写后读验证”，实际却变成“所有读完再统一写”。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

### 13. `CanUseToolResult.updatedInput` 被完全忽略

- 问题：`executeSingleTool()` 在真正调用工具时仍使用原始 `block.input`。
- 影响：安全钩子或预处理钩子即使想修正输入，也不会生效。
- 后果：扩展点看似存在，实际被架空。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

### 14. `max_tokens` 续写策略过于粗暴，可能把结构化输出彻底搞坏

- 问题：遇到 `stopReason === 'max_tokens'` 时，直接追加 `Please continue from where you left off.`。
- 影响：如果模型恰好在输出工具 JSON 中途被截断，续写很容易转成普通文本，导致后续 JSON 解析报废。
- 后果：结构化工具调用链在最脆弱的时候被进一步放大损坏。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

### 15. 工具参数 JSON 解析失败后被静默包装成 `{ raw: ... }`

- 问题：`finalizeToolBlock()` 里 JSON 解析失败后，不是把错误回给模型，而是悄悄包成 `{ raw: tool.input }`。
- 影响：大多数工具 schema 根本不接受这个字段。
- 后果：最终暴露成难排查的 schema validation error，而模型还不知道自己 JSON 格式错了。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

### 16. `ApiKeyService.testConnection()` 没有任何超时保护

- 问题：对自定义 `baseURL` 直接裸 `fetch`。
- 影响：只要 URL 黑洞、握手卡住或服务端不返回，Settings 里的 “Test Connection” 就可能永久挂死。
- 后果：UI 卡死、异步任务悬挂、体验和稳定性一起坏。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts`

### 17. `progressBridge.ts` 强依赖流式正文，非流式回退时最终回答可能不显示

- 问题：桥接层默认正文都由 `text_delta` 渐进渲染，`assistant` 事件里的完整文本可能被忽略。
- 影响：Provider 不支持稳定流式、或流式失败后回退到阻塞式时，UI 可能只剩工具进度和 thinking，没有最终正文。
- 后果：模型其实回答了，但用户界面看起来像“什么也没说”。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/progressBridge.ts`、`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`

### 18. 历史消息归一化会抹掉真正的工具调用链

- 问题：`messageNormalization.ts` 更多保留 markdown/text，不保留真实的 `tool_use` / `tool_result` 结构。
- 影响：多轮对话后，模型失去“之前到底调用过什么工具、拿到过什么结果”的真实记忆。
- 后果：重复读文件、重复推理、状态理解变浅。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/messageNormalization.ts`

### 19. `ApiKeysWidget` 的 “Test Connection” 跟真实运行时解析路径不一致

- 问题：测试按钮用的是全局 `directorCode.ai.model` 和 `directorCode.ai.baseURL`，不是该 provider 自己真实运行时应该拿到的完整配置。
- 影响：当前全局模型是 Claude，却点 OpenAI 行测试；或者全局 `baseURL` 是 DeepSeek，却拿去测 Anthropic，都可能得到误导结果。
- 后果：这是典型的假阴性/假阳性制造器。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/apiKeysWidget.ts`

### 20. 只配置 per-model key 时，Settings UI 仍可能显示“未配置”

- 问题：UI 只看 `hasApiKey(provider)`，不看 `getModelApiKey()` 或 `resolveProviderOptions()`。
- 影响：模型其实已经能跑，界面却仍显示 `Not configured / Not set`。
- 后果：用户看到的是 UI 状态和真实运行状态脱节。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/apiKeysWidget.ts`、`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeSettingsEditor.ts`

### 21. `.claude/settings.local.json` 里存在过宽的脚本执行白名单

- 问题：类似 `Bash(node -e ...)`、`Bash(python -c ...)` 这样的宽匹配规则，给 agent 留下了非常大的任意脚本执行空间。
- 影响：这是被纳入版本控制的本地配置风险，不只是个人工作站偏好。
- 后果：安全边界过宽，而且还容易随着仓库传播。
- 相关文件：`.claude/settings.local.json`

## 中风险问题

### 22. `AbstractDirectorCodeProvider.readSSELines()` 在流结束时不 flush buffer

- 问题：遇到 `done === true` 直接退出，没有处理剩余 buffer。
- 影响：如果最后一个 `data:` 事件没有换行结尾，尾包可能直接丢失。
- 后果：所有继承这个基类的 Provider 都会吃这个底层坑。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/abstractProvider.ts`

### 23. Gemini 流式路径会静默忽略 SSE 中的 `error`

- 问题：非流式路径会抛 `data.error`，流式解析却只看 `candidates` 和 `usageMetadata`。
- 影响：服务端已经返回错误，前端却可能当成“空内容成功结束”。
- 后果：排障会非常痛苦，因为表面上没有失败信号。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/geminiProvider.ts`

### 24. OpenAI 的能力声明与真实消息转换不一致

- 问题：`openai-completions` 默认能力里有 `vision: true`，但消息转换没有真正处理 `image` 内容块；`thinking` 处理也不一致。
- 影响：UI 和配置层宣称支持，Provider 却在本地把相关数据静默丢掉或降级。
- 后果：用户以为在用“支持视觉/推理”的模型，实际上请求早就被本地阉割了。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/abstractProvider.ts`、`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/openaiProvider.ts`

### 25. OpenAI 用户消息转换会重排文本和 `tool_result` 块

- 问题：`convertUserMessage()` 对 block 的处理顺序不严格保持原始语义。
- 影响：同一条用户消息里的 text 和 tool result 先后关系可能被打乱。
- 后果：这类 bug 平时不显山露水，一旦依赖顺序解释，就容易出奇怪行为。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/openaiProvider.ts`

### 26. OpenAI 流式请求里无条件开启 `stream_options.include_usage`

- 问题：请求参数是硬编码塞进去的，而不是按 Provider 兼容性探测。
- 影响：兼容 OpenAI 协议但不支持该字段的供应商，可能直接报错或表现异常。
- 后果：名义上支持“compatible”，实际兼容性打折。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/openaiProvider.ts`

### 27. Gemini 的工具 ID 生成和工具名映射存在脆弱假设

- 问题：`generateGeminiToolId()` 使用模块级计数器；`functionResponse.name` 还依赖 `toolNameMap` 的回填。
- 影响：碎片化 `functionCall`、并发调用、长生命周期 IDE 会话下，工具 ID 和工具名映射可能出现错配。
- 后果：调试时很难看出错在哪里，因为问题发生在流式拼装和名字回填的缝里。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/geminiProvider.ts`

### 28. `ApiKeyService.onDidChangeApiKey` 的事件契约已经破裂

- 问题：接口注释和常识都暗示 payload 是 `ProviderName`，但 per-model key 变化时，实际抛出的是 `provider.modelId`。
- 影响：当前只是因为多数订阅方没认真用这个 payload，才没全面炸开。
- 后果：任何把它当 `ProviderName` 消费的后续代码都会静默出错。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts`

### 29. `setModelConfig()` 变更不会完整触发密钥变更链路

- 问题：`MODEL_CONFIG_PREFIX` 没被纳入 `onDidChangeSecret` 的过滤语义；`setModelConfig()` 对外暴露的“配置已变更”信号也不完整。
- 影响：依赖事件刷新的 UI 或缓存可能看不到真实变化。
- 后果：这是配置系统里最危险的那类 bug：改了，但没通知。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts`

### 30. `getProviderAuthMethod()` 仍是硬编码返回

- 问题：鉴权方式已经开始支持 OAuth 与 API Key 共存，但方法仍然是静态/硬编码判断。
- 影响：Provider 能力和真实鉴权状态可能不一致。
- 后果：后续扩展新 auth 形态时会继续裂。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts`

### 31. `ProviderSettingsWidget` 仍以静态 catalog 驱动模型选择，不是真实解析结果

- 问题：模型下拉来源仍然是内置 catalog，而不是 `ModelResolverService` 的真实输出。
- 影响：远端真实可用模型、账号权限相关模型、动态新增模型都进不来。
- 后果：前面做了三层 fallback，UI 却不用，形成“实现很高级，接线很原始”的典型割裂。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/providerSettingsWidget.ts`

### 32. `ProviderSettingsWidget` 的 `baseURL` 提示与校验能力不足

- 问题：UI 只做文案提示，缺少更严格的输入校验；默认模型逻辑也存在轻微不一致。
- 影响：compatible provider 的错误配置更容易一路流到运行时才爆。
- 后果：把应在 UI 层截住的错误，推迟到了更贵的链路里。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/providerSettingsWidget.ts`

### 33. `DirectorCodeModelProvider` 的配置监听没有妥善释放

- 问题：`onDidChangeConfiguration` 监听存在未正确 dispose 的风险。
- 影响：长时间运行的 IDE 场景下会积累监听器。
- 后果：这类问题平时不显著，但会慢慢拖垮稳定性。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeModelProvider.ts`

### 34. 成本计算忽略 cache token

- 问题：`trackUsage()` 会累计 `cache_creation_input_tokens` / `cache_read_input_tokens`，但 `estimateCost()` 不把它们算进成本。
- 影响：账面成本会被系统性低估。
- 后果：预算控制和监控都不可信。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`、`vscode/src/vs/workbench/contrib/chat/common/agentEngine/tokens.ts`

### 35. OAuth state 会长期残留在 SecretStorage

- 问题：如果用户启动授权后不完成回调，state 记录缺少主动清理。
- 影响：SecretStorage 会随着失败/中断授权慢慢堆积脏状态。
- 后果：是典型的 storage leak。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/oauthService.ts`

### 36. OAuth 依赖全局 `crypto`，存在平台兼容性隐患

- 问题：代码直接使用 `crypto.getRandomValues` 和 `crypto.subtle.digest`。
- 影响：在特定 Electron / Node / worker 环境下，`globalThis.crypto` 不一定稳妥可用。
- 后果：兼容层面缺乏更稳的降级或显式依赖。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/oauthService.ts`

### 37. OAuth 刷新定时器存在超长 delay 溢出风险

- 问题：`setTimeout(delay)` 直接使用超长过期时间推导出的 delay。
- 影响：当 delay 超过 JS 定时器上限时，可能提前触发甚至形成异常刷新循环。
- 后果：CPU、网络和 token 接口一起被打爆。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/oauthService.ts`

### 38. `toolBridge` 的 token 估算方式极其粗糙

- 问题：直接按字符串长度除以 4 估 token。
- 影响：对中文、代码、JSON、Base64 等内容误差很大。
- 后果：上下文预算、压缩阈值和限流判断都会失真。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/browser/agentEngine/toolBridge.ts`

### 39. `chatWidget.ts` 与 `chat.css` 的底部留白重构存在回归风险

- 问题：列表尾部间距从 CSS 末行 padding 改成 JS 里的固定 `chatListBottomPadding`，但 quick chat / 动态布局路径也依赖同一套高度计算。
- 影响：在欢迎态、短消息、动态高度或 quick chat 场景下，容易出现裁切、末项过紧或滚动边界异常。
- 后果：这类 UI 回归非常容易被“本地看着还行”掩盖。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts`、`vscode/src/vs/workbench/contrib/chat/browser/widget/media/chat.css`、`vscode/src/vs/workbench/contrib/chat/browser/widgetHosts/chatQuick.ts`

### 40. 构建链与仓库卫生暴露出明显的不可复现风险

- 问题：
- `CLAUDE.md` 明确要求构建后手工清理 NLS 缓存，否则白屏。
- `.claude/memory.md` 记录了对 `node_modules/@vscode/gulp-electron/src/download.js` 的本地 patch。
- 工作区快照里出现 `.electron-cache` 压缩包、构建分析临时文档等产物。
- 影响：构建成功依赖人工步骤和本地热补丁，不是干净、可重复的工程流程。
- 后果：这类项目最怕“作者机器上能出包，别人机器上随机失败”。
- 相关文件：`CLAUDE.md`、`.claude/memory.md`、根目录构建产物快照

## 测试错位与假安全感

### 41. `agentEngine.test.ts` 名字很猛，但没测真实主循环

- 问题：这组测试自己就承认没直接实例化真实 `AgentEngine`，更多是 contract / 依赖层测试。
- 影响：最危险的取消逻辑、工具顺序、流式拼装、状态写回，都没有被真正覆盖。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/agentEngine.test.ts`

### 42. 所谓“多工具流式修复”测试，实质只测展示层

- 问题：`endToEnd.test.ts` 里相关测试只是手工构造两个 `tool_use` 事件，看 progress bridge 会不会显示两条进度。
- 影响：它没有验证“OpenAI/Gemini 真正的 SSE delta 如何被重组成两个工具调用”。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/endToEnd.test.ts`

### 43. `directorCodeModelProvider.test.ts` 基本没打到真实高风险行为

- 问题：更多在测 catalog、factory、token 估算等周边逻辑，而不是 `sendChatRequest()` 的真实配置解析与请求路径。
- 影响：文件名看起来像测到了关键类，实际风险点还悬空。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/directorCodeModelProvider.test.ts`

### 44. Widget 测试看着不少，但很多只是 logic stub

- 问题：`apiKeysWidget.test.ts`、`providerSettingsWidget.test.ts` 主要靠 mock service 或 catalog 逻辑，不覆盖 DOM 行为、per-model key、配置联动、高风险按钮语义。
- 影响：UI 和集成层的真正坑，测试基本没摸到。
- 相关文件：`vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/apiKeysWidget.test.ts`、`vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/providerSettingsWidget.test.ts`

### 45. 测试数量很多，但高风险路径大面积“测周边，不测本体”

- 问题：这套测试给人的安全感，更多来自文件数和用例数，而不是对核心风险的命中率。
- 影响：开发者会误以为“479 全过 = 系统很稳”，但事实上很多致命缺陷都躲在未覆盖的边界路径里。

## 已排除项

### 46. `vscode/product.json.bak` 删除本身不是问题

- 结论：未发现明确引用链或运行时依赖，单独删除这个备份文件不构成核心风险。
- 备注：这属于可以从审查重点里剔除的项，避免噪音盖过真正严重的问题。

## 建议修复优先级

### P0：先救核心语义

- 修复 `languageModelToolsService` 的 request 绑定错误。
- 修复 `AgentEngine` 的取消语义、半状态写回、压缩假成功、多工具拼装。
- 取消 `DirectorCodeModelProvider` 对 per-model 配置的绕过。
- 修复 OAuth `client_id` 一致性和 state 删除时机。
- 修复 `ModelResolverService` 缓存键遗漏 `apiKey` 的问题。

### P1：再修协议和安全边界

- 给 `toolBridge` 超时绑定真实 cancel。
- 撤销“默认打开全局 auto-approve”。
- 修复 SSE 尾包、Gemini 流式错误处理、OpenAI 能力声明不一致。
- 修复 `ApiKeysWidget` / Settings UI 的解析路径与状态展示。

### P2：最后补工程卫生和测试债

- 把静态 catalog 驱动的 UI 改成真实模型解析结果。
- 清理构建链里依赖本地 patch 和手工步骤的部分。
- 用真实 `AgentEngine`、真实流式 delta、真实配置解析路径补测试，而不是继续堆 mock。

## 最终结论

Claude 这批改动的问题，不是“个别函数写糙了”，而是已经出现了系统性的语义分裂：

- 工具调用链拿错 request，上层权限判断就会漂。
- Provider 流式协议和引擎消费协议不一致，工具参数就会串。
- per-model 配置在一条通路里生效、另一条通路里失效，产品行为就会自相矛盾。
- 测试又没有真正打到这些风险路径，于是整套系统会给出一种非常危险的错觉：**表面稳定，边界脆弱。**

如果要一句话概括这份报告的攻击点，就是：

**它不是功能没做完，而是核心语义已经开始分裂。**
