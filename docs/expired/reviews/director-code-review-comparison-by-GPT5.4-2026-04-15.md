# Director-Code 三份 Review 报告交叉核验对比 by GPT5.4 (2026-04-15)

## 核验说明

- 核验对象：
  - `docs/director-code-full-review-by-GPT5.4-2026-04-15.md`
  - `docs/director-code-review-by-claude-2026-04-15.md`
  - `docs/director-code-review-report-gemini-3.1-pro-full.md`
- 核验依据：仅以当前仓库源码、构建脚本、产品元数据为证据，不以报告彼此引用为证据。
- 处理方式：三份报告有大量重复项，本文件按“问题主题”归并，优先核验高风险、重复度高、会直接影响真实产品行为的条目。
- 结论标签：
  - `存在`：代码里可以直接定位到与报告描述相符的实现问题。
  - `部分成立`：方向对，但触发条件、影响范围或严重度被写重了。
  - `证据不足/不建议直接采纳`：当前代码不足以支撑原报告的强结论。

## 总体判断

| 报告 | 覆盖面 | 可信度 | 主要价值 | 主要缺点 |
| --- | --- | --- | --- | --- |
| GPT-5.4 | 最广 | 高 | 命中 `MCP`、`chatRequestId/request` 绑定、`product.json`、`dataFolderName`、`ModelResolver` 等真实高风险问题 | 条目很多，需要去重；少数中风险项需要限定触发条件 |
| Claude | 中等 | 中高 | 在 `AgentEngine`、Provider、OAuth 链路上命中不少真实问题，如 `client_id` 不一致、SSE 尾包、`vision` 能力声明错位 | 明显漏掉 `MCP`、`languageModelToolsService`、构建脚本、产品元数据等横切面 |
| Gemini | 中等 | 中 | 命中少数真实健壮性问题，如 `toolBridge` 超时不取消底层工具、`messageNormalization` 历史回放丢工具链、`testConnection` 无超时 | 语气明显过度；若干“致命/灾难性”判断依赖推测或未来并发场景，不能直接照单全收 |

## 已确认存在的核心问题

| 主题 | GPT-5.4 | Claude | Gemini | 核验 | 代码依据与说明 |
| --- | --- | --- | --- | --- | --- |
| `AgentEngine` 构造请求时未传 `abortSignal` | 明确指出 | 未直接指出 | 未直接指出 | 存在 | `agentEngine.ts` 里的 `requestParams` 没有 `abortSignal`，而 Provider 层 `fetch(..., signal: params.abortSignal)` 依赖这个字段。 |
| 取消后仍可能被记为 `success`，且半截流式结果会落入历史 | 明确指出 | 未提 | 未提 | 存在 | `agentEngine.ts` 在取消时只是 `break`，但末尾 `endSubtype` 默认仍是 `success`，流式块也会在 `break` 后被 finalize。 |
| auto-compact 失败会被伪装成成功 | 明确指出 | 间接提到 | 间接提到 | 存在 | `compactConversation()` 内部吞异常并返回原消息；`agentEngine.ts` 仍无条件发送 `Conversation compacted`。 |
| 多个 `tool_call_delta` 只用一个 `currentTool` 累积 | 明确指出 | 明确指出 | 未提 | 存在 | `agentEngine.ts` 没按 `index` 或工具 ID 分桶，OpenAI 流里多个工具会串参数。 |
| `stopReason === 'max_tokens'` 时简单追加“Please continue...” | 明确指出 | 未提 | 明确指出 | 存在 | 这条续写策略在结构化输出中可能破坏未闭合 JSON 或未完成工具调用。 |
| 工具参数 JSON 解析失败后包装为 `{ raw: ... }` | 明确指出 | 未提 | 明确指出 | 存在 | `finalizeToolBlock()` 里 `JSON.parse` 失败直接降级成 `{ raw }`，多数工具 schema 不认识。 |
| `readSSELines()` 流结束时不 flush 尾部 buffer | 明确指出 | 明确指出 | 间接提到 | 存在 | `abstractProvider.ts` 在 `done` 时直接 `break`，最后一条无换行的 SSE 事件会丢。 |
| OpenAI 能力声明为 `vision: true`，但消息转换忽略 `image` block | 明确指出 | 未提 | 未提 | 存在 | `openaiProvider.ts` 的 `convertUserMessage()` 只处理 `text` 和 `tool_result`，没有把图片转成 OpenAI 多模态 part。 |
| Gemini 流式路径不处理 `error` chunk | 明确指出 | 未提 | 未提 | 存在 | `geminiProvider.ts` 的 `parseGeminiSSEStream()` 只看 `candidates` / `usageMetadata`，不会把流式错误显式抛出。 |
| OAuth 授权用 `effectiveClientId`，换 token / 刷新又退回 `config.clientId` | 明确指出 | 明确指出 | 未提 | 存在 | `oauthService.ts` 的授权阶段和 token exchange / refresh 阶段使用的 `client_id` 不一致。 |
| OAuth state 在 token exchange 前就被删除 | 明确指出 | 未提 | 未提 | 存在 | `handleCallback()` 先 `delete` state，再去换 token；失败后无法安全重试，也不利于排障。 |
| 未完成的 OAuth state 长期残留 | 明确指出 | 明确指出 | 明确指出 | 存在 | 只有回调成功进入 `handleCallback()` 才会删除；放弃登录或中断流程不会清理。 |
| `testConnection()` 全部是裸 `fetch`，无超时 | 明确指出 | 未提 | 明确指出 | 存在 | `apiKeyService.ts` 里的 `_testAnthropic/_testOpenAI/_testGemini` 都没 `AbortController`。 |
| `ModelResolver` 缓存键不含 `apiKey` | 明确指出 | 未提 | 未提 | 存在 | `modelResolver.ts` 的 `_cacheKey()` 只有 `provider + baseURL`，不同账号/授权状态可能串缓存。 |
| `ModelResolver` 缓存过期时无 in-flight 去重 | 未提 | 未提 | 明确指出 | 存在 | `resolveModels()` 命中 miss 后直接并发 `_resolveAndCache()`，存在 cache stampede 风险。 |
| 标准 Chat 通路绕过 `resolveProviderOptions()` 和 `ModelResolverService` | 明确指出 | 未直接指出 | 未提 | 存在 | `directorCodeModelProvider.ts` 仍使用全局 `baseURL` + provider 级 key + 静态 `MODEL_CATALOG`。 |
| `DirectorCodeModelProvider` 非流式 fallback 未传 `abortSignal` | 未提 | 间接提到取消/监听问题 | 明确指出 | 存在 | 流式路径带 `abortSignal`，非流式 `createMessage()` 调用没有。 |
| `toolBridge` 超时只 reject，不取消底层工具 | 未提 | 未提 | 明确指出 | 存在 | `toolBridge.ts` 的定时器只让 Promise 超时，`toolsService.invokeTool()` 仍继续跑。 |
| 工具执行/自动确认仍绑定到“最后一个 request”，不是 `chatRequestId` | 明确指出 | 未提 | 未提 | 存在 | `languageModelToolsService.ts` 的 `invokeTool()` 和 `shouldAutoConfirm*()` 多处 `getRequests().at(-1)`。 |
| 默认把 `chat.tools.global.autoApprove` 写成 `true` | 明确指出 | 未指出问题，评价偏正面 | 明确指出 | 存在 | `agentEngine.contribution.ts` 会在用户未显式配置时改全局设置。 |
| MCP 非沙箱变更工具 `allowAutoConfirm = true`，与全局 auto-approve 叠加 | 明确指出 | 未提 | 间接指出 | 存在 | `mcpLanguageModelToolContribution.ts` + `agentEngine.contribution.ts` 组合后会明显削弱确认边界。 |
| MCP Sampling 的 `Not Now` 语义错误 | 明确指出 | 未提 | 未提 | 存在 | `mcpSamplingService.ts` 把 `false` 写进 session map，但后续只检查 `has(...)`。 |
| `registerDynamicAgent()` 无重复 ID 防护 | 明确指出 | 未提 | 未提 | 存在 | `chatAgents.ts` 直接 `set(data.id, agent)`，dispose 又无条件 `delete(data.id)`。 |
| `defaultChatAgent` 仍指向 Copilot | 明确指出 | 未提 | 未提 | 存在 | `vscode/product.json` 仍保留 `GitHub.copilot` / `GitHub.copilot-chat` 及相关 Copilot URL。 |
| 稳定版 `dataFolderName` 仍是 `.vscode-oss` | 明确指出 | 未提 | 未提 | 存在 | `vscode/product.json` 未改 stable 的 `dataFolderName`；`main.ts` / `environmentService.ts` 会据此拼真实路径。 |
| `build.sh` 固定执行 `compile-extensions-build` | 明确指出 | 未提 | 未提 | 存在 | 脚本层面确实硬编码执行；只是“在当前网络下必失败”还取决于运行环境。 |

## 部分成立、但表述需要收敛的项

| 主题 | 来源 | 核验 | 说明 |
| --- | --- | --- | --- |
| Gemini API Key 出现在 URL query 中 | Claude | 部分成立 | 代码里确实是 `?key=...`，但这基本是 Google Gemini API 的常见调用形态；更适合写成“外部 API 约束带来的风险提示”，不宜直接写成项目独有严重漏洞。 |
| `messageNormalization` 会让 Agent “完全失忆” | GPT-5.4、Gemini | 部分成立 | `historyToNormalizedMessages()` 的确丢掉 tool / thinking / progress，因此历史回放路径信息变薄；但不是所有会话路径都只依赖它，所以“完全失忆”说重了。 |
| `tokens.ts` 与 `modelCatalog.ts` 双源一定会导致当前计算错误 | Claude | 部分成立 | 双源事实存在，属于维护债务；但在当前代码快照下更像“容易漂移”的设计风险，而不是已证实的即时功能错误。 |
| `compact.ts` 存在严重全局状态污染与并发冲突 | Gemini | 部分成立 | 当前路径基本还是单线程 Agent 执行，未来如果引入并发协作会更危险；现阶段不宜按“高危并发 bug”定级。 |
| OAuth state 长期残留已经构成“state 注入攻击面” | Claude | 部分成立 | 存储残留是真问题，但直接上升到攻击面需要更多前置条件。更稳妥的表述应是“存储膨胀 + 生命周期管理不完整”。 |
| OAuth 刷新 `setTimeout` 溢出会必然导致“疯狂死循环刷新” | GPT-5.4、Gemini | 部分成立 | 对超长有效期缺少上限保护是真问题，但结果更可能是触发时机异常或过早执行，不宜直接写成必然死循环。 |
| `OpenAIProvider` 中 `tool_result` / 文本重排一定会产生严重语义错误 | GPT-5.4 | 部分成立 | 代码确实发生重排，但是否造成真实错误取决于上游 block 组织方式和 OpenAI tool message 期望顺序，严重度不宜写满。 |

## 证据不足或不建议直接采纳的项

| 主题 | 来源 | 结论 | 说明 |
| --- | --- | --- | --- |
| `apiKeysWidget` 使用密码框会形成“致命明文泄露” | Gemini | 证据不足 | 当前实现是普通密码输入框并清空显示值，这不是理想的“高安全输入控件”，但也不足以直接定性为已存在的致命泄露漏洞。 |
| `directorCodeSettingsEditor` 已经确定存在严重内存泄漏 | Gemini | 证据不足 | 报告依赖“异常生命周期下 dispose 不会被调用”的假设；仅从当前代码，无法把它定性为已证实的必现泄漏。 |
| `modelResolver` 在 `fetch` 后若未 `abort()` 就一定会导致套接字泄漏 | Gemini | 不建议直接采纳 | 这里更像理论上的资源管理洁癖；当前代码已有 `clearTimeout()`，报告给出的因果链过强。 |

## 其他已核实但未拉入主表的次一级问题

- `OpenAIProvider` 流式请求硬编码 `stream_options.include_usage`，对部分 OpenAI-compatible 端点可能不够兼容。
- `GeminiProvider` 对每个流式 `functionCall` 都重新生成 tool ID，分片/并发工具调用时存在稳定性问题。
- `GeminiProvider` 在 `tool_result -> functionResponse` 时可能回退到 `'unknown'` 函数名。
- `ApiKeyService.onDidChangeApiKey` 的事件 payload 与接口注释不一致，model 级 key 会发出 `provider.modelId`。
- `MODEL_CONFIG_PREFIX` 的 secret 变更不会进入同一条通知链路。
- `getProviderAuthMethod()` 目前恒返回 `'api-key'`，与已实现的 OAuth 抽象不一致。
- `withRetry()` 的退避等待不可取消。
- `estimateCost()` 未计入 cache token，而 `trackUsage()` 已经在累计它们。
- `shouldAutoCompact()` 在用户把 `maxInputTokens` 设得很小时会得到负阈值，导致几乎一直触发 compact。

## 最终结论

1. 三份报告里，**GPT-5.4 这份最值得作为主修复清单**。它命中的很多问题都不是代码风格类意见，而是实打实的运行时错位，包括 `request` 绑定、`MCP` 确认边界、`product.json` 残留 Copilot、稳定版数据目录污染等。
2. **Claude 的价值主要在 core/provider/auth 补充**。它命中了 `OAuth client_id` 前后不一致、SSE 尾包丢失、OpenAI `vision` 能力声明与实现不一致等真实问题，但覆盖面明显窄于 GPT。
3. **Gemini 只能选择性采纳**。它确实抓到了一些真实问题，如 `toolBridge` 超时不取消底层工具、`testConnection` 无超时、历史回放丢工具链；但它把很多问题都写成“致命/灾难性”，其中一部分只是“方向对、严重度过满”，还有少数属于证据不足。
4. 如果要立刻形成修复优先级，建议顺序是：
   - 先修 `chatRequestId/request` 绑定、`AgentEngine` 取消语义、`global autoApprove + MCP allowAutoConfirm`、`MCP sampling Not Now`。
   - 再修 OAuth `client_id/state` 生命周期、`ModelResolver` 缓存隔离、标准 Chat 通路绕过 per-model/动态模型解析的问题。
   - 最后再收口 `product.json` / `dataFolderName` / 构建脚本 / 低层 provider 兼容性问题。

## 修复方案

### 优先级定义

- `P0`：继续推进 Phase 2 之前必须修复。影响安全边界、请求/状态一致性、认证正确性、产品主路径。
- `P1`：高优先级修复。影响稳定性、兼容性、历史上下文完整性和配置正确性。
- `P2`：中优先级收口。主要解决架构重复、事件契约、构建流程和边缘错误路径。
- `P3`：争议项与防御性加固。对应前文“部分成立”或“证据不足”条目，原则是低成本收口而不是重写。

### P0 修复项

| 优先级 | 问题组 | 需要修复的问题 | 涉及文件 | 修复实现方式 |
| --- | --- | --- | --- | --- |
| P0 | 请求绑定一致性 | `languageModelToolsService` 仍把工具执行、自动确认、结果确认绑定到“最后一个 request”，不是显式 `chatRequestId` | `vscode/src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts` | 抽出统一的 `resolveRequest(session, chatRequestId)` 辅助函数，`invokeTool()`、`shouldAutoConfirm()`、`shouldAutoConfirmPostExecution()`、streaming 占位与最终执行全部走同一套解析逻辑；彻底移除 `.getRequests().at(-1)` 作为默认主路径，只允许在没有 `chatRequestId` 的旧路径做显式降级。 |
| P0 | 取消语义与超时取消 | `AgentEngine` 未把 `abortSignal` 传给 Provider；取消后仍可能落成 `success`；`toolBridge` 超时只 reject 不 cancel；`DirectorCodeModelProvider` 非流式 fallback 不传 `abortSignal` | `agentEngine.ts`、`toolBridge.ts`、`directorCodeModelProvider.ts`、`providerTypes.ts` | `requestParams` 全量补齐 `abortSignal`；非流式 fallback 同样传 `abortSignal`；在 `AgentEngine` 中区分 `cancelled` / `error` / `success` 终态，取消后不得 finalize 半截 assistant/tool block，也不得写回历史；`toolBridge` 用派生 `CancellationTokenSource` 包装工具调用，超时触发 `cancel()` 而不是只 reject。 |
| P0 | MCP/工具确认安全边界 | 默认写入 `chat.tools.global.autoApprove = true`；MCP 非沙箱变更工具 `allowAutoConfirm = true`；`Not Now` 语义错误 | `agentEngine.contribution.ts`、`mcpLanguageModelToolContribution.ts`、`mcpSamplingService.ts` | 删除启动时篡改全局 `autoApprove` 的行为，改成 Director-Code 自己的会话级或 agent 级确认策略；MCP 非只读、非沙箱工具默认必须人工确认，禁止与全局自动批准叠加；`Not Now` 改为显式检查 map value，而不是只看 `has()`。 |
| P0 | OAuth 认证正确性 | `client_id` 前后不一致；state 在 token exchange 前删除；未完成 flow 残留；刷新 timer 无上限 | `oauthService.ts` | 在 `IOAuthState` 中持久化 `effectiveClientId`，token exchange 和 refresh 统一使用它；state 只在成功换 token 后删除，失败时保留到显式 cleanup；新增 `cleanupExpiredStates()`，在启动服务和发起新 flow 时清理 15 分钟前的 state；对 refresh delay 做 `MAX_SAFE_TIMEOUT` 截断。 |
| P0 | 标准 Chat 主路径配置失真 | 标准 Chat 通路绕过 `resolveProviderOptions()` 和 `ModelResolverService`，per-model API key / baseURL / capabilities 与动态模型都不生效 | `directorCodeModelProvider.ts`、`agentEngine.contribution.ts`、`modelResolver.ts`、`apiKeyService.ts` | 注册 `IModelResolverService` / `IOAuthService` 到 workbench；`DirectorCodeModelProvider.sendChatRequest()` 和 `provideLanguageModelChatInfo()` 改为统一通过 `resolveProviderOptions()` 和 `resolveModels()` 获取真实 provider 配置与模型列表；provider 级 fallback 只作为兜底，不再是主路径。 |
| P0 | 产品元数据与数据目录隔离 | `defaultChatAgent` 仍指向 Copilot；稳定版 `dataFolderName` 仍为 `.vscode-oss` | `vscode/product.json`、`prepare_vscode.sh`、`product.json`、`src/main.ts`、`environmentService.ts` | 彻底重写 `defaultChatAgent` 为 Director-Code 自有元数据，或在当前阶段显式关闭这块默认集成；稳定版 `dataFolderName` 改为 `.director-code`，同步校验 `argv.json`、扩展目录、policy 路径；增加首次启动迁移说明，避免用户配置无感串用。 |

### P1 修复项

| 优先级 | 问题组 | 需要修复的问题 | 涉及文件 | 修复实现方式 |
| --- | --- | --- | --- | --- |
| P1 | AgentEngine 流式与工具稳健性 | 多 `tool_call_delta` 串台；`max_tokens` 续写策略粗糙；JSON 解析失败包装成 `{ raw }`；compact 失败仍报成功 | `agentEngine.ts`、`compact.ts` | 用 `Map<index, toolState>` 或 `Map<toolId, toolState>` 重组并发工具流；当 `max_tokens` 截断发生在工具调用阶段时，不再简单追加“continue”，改为要求模型重新输出完整工具调用或显式回滚当前 tool block；`finalizeToolBlock()` 改为把 JSON 解析失败作为结构化 tool error 返回给模型；compact 只有在结果确实变化时才发送 `compact_boundary`。 |
| P1 | Provider 协议兼容性 | SSE 尾包丢失；不解析 `event:`；buffer 无上限；OpenAI `vision` 声明与实现不一致；`stream_options.include_usage` 兼容性；Gemini 流式 `error`、tool ID、`unknown` 函数名 | `abstractProvider.ts`、`openaiProvider.ts`、`geminiProvider.ts` | `readSSELines()` 在 `done` 时 flush 尾 buffer，支持读取 `event:`，并加入最大 buffer 限制；OpenAI 要么真正实现图片 part 转换，要么把 `vision` 能力降为 `false`；`include_usage` 做 provider 能力开关；Gemini 流式路径看到 `error` 立即抛错；tool ID 使用稳定映射而不是全局自增；`tool_result` 必须能携带原工具名，避免回退到 `'unknown'`。 |
| P1 | 模型缓存与配置解析 | `ModelResolver` 缓存键不含 `apiKey`；缓存 miss 无去重；`resolveProviderOptions` 文档和行为不一致 | `modelResolver.ts`、`apiKeyService.ts` | 缓存键加入“认证身份”维度，至少区分 `no-key` / `provider-key-hash` / `oauth-account`；加入 in-flight promise 去重，避免 cache stampede；统一 `resolveProviderOptions()` 的注释和实现，要么补齐 provider default 与 catalog fallback，要么把注释改成“只解析 secret + per-model 覆盖”。 |
| P1 | 历史回放与 UI 回退正确性 | `messageNormalization` 丢工具链；`progressBridge` 在无 `text_delta` 时可能不显示正文；标准 Chat 路径把 rich content 降成纯文本 | `messageNormalization.ts`、`progressBridge.ts`、`directorCodeModelProvider.ts` | 历史回放最少保留三类信息：工具调用、工具结果、最终 assistant 文本；对 `thinking` 保留摘要或标记；`progressBridge` 在非流式/降级路径允许渲染 assistant 文本；`DirectorCodeModelProvider` 不再一律压平成纯文本，至少保留图片、工具结果与结构化 part 的最小语义。 |
| P1 | 连接测试与取消响应 | `testConnection()` 无超时；`withRetry()` 退避等待不可取消；非流式 provider 请求取消响应慢 | `apiKeyService.ts`、`retry.ts`、各 Provider | 抽出统一 `fetchWithTimeout()`；`testConnection()` 全部绑定 10s 超时；`withRetry()` 的 backoff 改为可取消 sleep；所有 Provider 的非流式 `fetch` 都接 `abortSignal`。 |
| P1 | 成本与压缩阈值正确性 | `estimateCost()` 不计 cache token；`shouldAutoCompact()` 在小上下文下阈值为负 | `tokens.ts`、`compact.ts`、`agentEngine.ts` | 将 cache token 单独纳入成本模型，或者明确拆出“原始成本”和“计费成本”；auto-compact 阈值增加下界保护，确保 `maxInputTokensOverride - buffer` 至少大于最小可用阈值。 |
| P1 | 标准设置页状态误报 | Settings 状态条和 API Keys 区只看 provider 级 key；测试连接取全局 model/baseURL，不按当前 provider 解析 | `directorCodeSettingsEditor.ts`、`apiKeysWidget.ts`、`providerSettingsWidget.ts` | 状态展示统一改走 `resolveProviderOptions()`；`Test Connection` 应按当前 provider 自动选取测试模型，并优先使用当前 provider/model 的真实 baseURL 和 model-specific key；对 `anthropic-compatible` 等 provider 的空模型状态提供明确提示，不再把空字符串静默写回。 |

### P2 修复项

| 优先级 | 问题组 | 需要修复的问题 | 涉及文件 | 修复实现方式 |
| --- | --- | --- | --- | --- |
| P2 | 事件契约与通知链 | `onDidChangeApiKey` payload 与注释不一致；`MODEL_CONFIG_PREFIX` 变更不会通知；`getProviderAuthMethod()` 恒为 `api-key` | `apiKeyService.ts` | 事件 payload 改成结构化对象，例如 `{ provider, modelId?, kind }`；把 model config secret 变更纳入同一通知链；`getProviderAuthMethod()` 根据 provider 能力、用户配置和 OAuth token 实际状态返回 `api-key` / `oauth` / `none`。 |
| P2 | 模型与 token 元数据双源 | `tokens.ts` 和 `modelCatalog.ts` 存在重复定义，容易漂移 | `tokens.ts`、`modelCatalog.ts` | 把上下文窗口、输出上限、计费信息统一收敛到 `MODEL_CATALOG` 或其扩展结构，`tokens.ts` 只做读取与计算，不再手写第二份模型真值表。 |
| P2 | `registerDynamicAgent()` 生命周期风险 | 重复 ID 可被覆盖，早期 disposer 会误删后注册 agent | `chatAgents.ts` | 对动态 agent 增加重复 ID 检查；dispose 时校验当前 map entry 是否仍是自己再删除，避免后注册实例被误删。 |
| P2 | MCP 边缘路径一致性 | `McpAddContextContribution` 不随 capability 变化更新；`resource_link` 失败时静默空 buffer | `mcpAddContextContribution.ts`、`mcpLanguageModelToolContribution.ts` | `read(undefined)` 改为 `read(reader)` 建立真实依赖；图片资源读取失败时返回显式错误或 fallback 链接，而不是 0 字节假图片。 |
| P2 | 构建脚本可复现性 | `build.sh` 固定执行 `compile-extensions-build`；`prepare_vscode.sh` 生成 `.bak` 污染工作树 | `build.sh`、`prepare_vscode.sh` | 把 `compile-extensions-build` 做成可选步骤，由环境变量或网络探测控制；脚本备份改放临时目录或在脚本结束后自动清理，避免长期留下 `.bak` 文件。 |
| P2 | Provider 细节收口 | OpenAI `tool_result` / 文本重排；OpenAI-compatible `/v1` 路径策略；`stream_options.include_usage` 可配置 | `openaiProvider.ts` | 保留 block 原始顺序信息，必要时先展开成中间结构再映射到 OpenAI 消息；为 compatible provider 提供 `/v1` 归一化策略；把 `include_usage` 放入 provider capability / config 开关。 |
| P2 | 资源生命周期治理 | `DirectorCodeModelProvider` 监听器未释放；`createAbortSignal()` 注册的取消监听器未 dispose | `directorCodeModelProvider.ts` | 让 `DirectorCodeModelProvider` 继承 `Disposable`，所有 emitter/监听都走 `_register()`；`createAbortSignal()` 返回 `{ signal, disposable }` 或封装为 `CancellationTokenSource`，在请求完成后清理监听。 |

### P3 争议项与防御性加固

| 优先级 | 问题组 | 对应前文问题 | 涉及文件 | 收口方式 |
| --- | --- | --- | --- | --- |
| P3 | Gemini key in URL | “Gemini API key 出现在 URL query” | `geminiProvider.ts`、`modelResolver.ts`、文档 | 由于 Gemini API 常用 `?key=` 方案，这条不建议按“项目独有漏洞”处理；但应增加两项收口：强制校验 `https` baseURL，文档中明确提示 URL 级凭据暴露风险；若目标 API 支持 `Authorization` 头，则加可选开关。 |
| P3 | 密钥输入安全加固 | “密码框会形成致命明文泄露” | `apiKeysWidget.ts` | 不按“已存在致命漏洞”定级，但可以低成本加固：禁用自动填充/历史记录；提交后立即重建 input 节点；确保 DOM 中长期不保留明文值；若 workbench 已有可复用的安全输入控件，再替换为平台控件。 |
| P3 | Editor 生命周期兜底 | “SettingsEditor 已确定严重泄漏” | `directorCodeSettingsEditor.ts` 及内部 widget | 不按必现泄漏定性，但应补一轮生命周期治理：所有 widget/status bar/监听器统一走 `Disposable`；显式审计 `EditorPane.dispose()` 与 `setInput()` 重入；补 editor 打开/关闭/重开场景测试。 |
| P3 | fetch 资源回收一致化 | “`modelResolver` 未 abort 导致套接字泄漏” | `modelResolver.ts`、公共 fetch helper | 不单独为这条做大改，但可以统一引入 `fetchWithTimeout()` / `fetchJsonWithTimeout()`，在超时、异常和完成路径做一致清理，顺便收口 `testConnection`、`ModelResolver`、CDN 拉取等逻辑。 |

### 建议实施批次

1. **批次 A：安全与状态一致性**
   处理 `chatRequestId/request` 绑定、`AgentEngine` 取消语义、`toolBridge` 超时取消、MCP 确认边界、Sampling `Not Now`。
2. **批次 B：认证与配置主路径**
   处理 OAuth `client_id/state` 生命周期、`resolveProviderOptions()`、`ModelResolver` 缓存隔离与 in-flight 去重、标准 Chat 通路接线。
3. **批次 C：Provider 与历史上下文**
   处理 SSE 尾包、Gemini/ OpenAI 流式兼容、`messageNormalization`、`progressBridge`、连接测试超时、retry 可取消。
4. **批次 D：产品元数据与构建收口**
   处理 `defaultChatAgent`、`dataFolderName`、构建脚本、动态 agent 注册、MCP 边缘路径、资源生命周期治理。

### 测试与验收要求

- 每一批修复都必须补对应单元测试或集成测试，重点覆盖：
  - 同一 session 下多个 request 并存时，工具调用必须绑定到正确的 `chatRequestId`。
  - 用户取消、工具超时、Provider 非流式 fallback 时，底层请求必须被真正取消，且结果不能写入半截历史。
  - OAuth 自定义 `clientId`、exchange 失败重试、state 过期清理、refresh timer 上限。
  - `ModelResolver` 在不同 `apiKey` / `baseURL` / 并发 miss 下必须隔离缓存。
  - MCP `Allow in this Session` / `Not Now` / `Never` 三条路径都要有状态机测试。
  - `defaultChatAgent`、`dataFolderName`、构建脚本分支要有最小 smoke test 或脚本断言。
- 建议按 `P0 -> P1 -> P2/P3` 分阶段落地，不建议把所有问题混成一次大提交。
- 在进入 Phase 2 ACP 之前，至少应保证所有 `P0` 关闭、`P1` 进入可验证完成状态。

