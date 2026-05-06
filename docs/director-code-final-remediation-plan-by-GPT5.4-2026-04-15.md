# Director-Code 最终完整版修复总计划 by GPT5.4 (2026-04-15)

## 计划定位

本计划基于以下三份修复方案与前序代码核验结果整合而成：

- `docs/director-code-review-comparison-by-GPT5.4-2026-04-15.md`
- `docs/director-code-review-comparison-by-claude-2026-04-15.md`
- `docs/director-code-review-comparison-Gemin.md`

本计划的目标不是简单合并三份文档，而是做三件事：

1. 去重并统一优先级，避免同一问题在不同文档里排序冲突。
2. 把“已确认存在的问题”和“仅建议防御性加固的问题”分开处理。
3. 形成一份可直接执行的最终总计划，作为后续修复工作的唯一主计划。

## 计划原则

- 先修“错误执行、错误绑定、错误状态”，再修“品牌、构建、体验”。
- 先修主路径，再修旁路。
  - 主路径指：Agent 主循环、标准 Chat 通路、工具执行链、认证链、MCP 安全边界。
- 先收口契约与状态一致性，再补兼容与优化。
- 所有修复必须带测试，不接受“只改实现、不补回归”的提交。
- 对前序报告中的“部分成立”或“证据不足”条目，不作为独立硬性 bug 立项，而是放入防御性加固批次。

## 最终优先级定义

- `P0`：阻塞后续 Phase 2 ACP 开发，必须先修。
- `P1`：不阻塞编码，但会持续制造错误行为、配置错位或真实用户影响，需在下一轮主修复中完成。
- `P2`：中优先级收口，解决架构债务、兼容性和边缘路径。
- `P3`：防御性加固与争议项，只在不影响主线的前提下推进。

## 最终批次总览

| 批次 | 优先级 | 核心目标 | 完成标准 |
| --- | --- | --- | --- |
| 批次 A | P0 | 收口安全边界与状态一致性 | 不再出现 request 错绑、取消假成功、危险工具默认放行、MCP 确认语义失真 |
| 批次 B | P1 | 收口认证链、模型解析链、历史上下文链 | OAuth、ModelResolver、history/progress、标准 Chat 模型链路全部闭环 |
| 批次 C | P2 | 收口 Provider 兼容、UI 配置、资源生命周期、产品元数据 | Provider 协议/设置/UI/元数据行为一致，边缘路径不再静默失败 |
| 批次 D | P3 | 防御性加固与低置信条目处理 | 对争议项做低成本加固，不引入大规模设计重写 |

## 全覆盖映射

下表用于确认“前序三份计划中的全部已确认问题”都已纳入最终总计划。

| 问题家族 | 覆盖批次 | 说明 |
| --- | --- | --- |
| `languageModelToolsService` 的 `chatRequestId/request` 绑定错位 | A | 作为最高优先级处理 |
| `AgentEngine` 取消、终态、超时取消、非流式 abort 漏传 | A | 与工具链状态一致性一起修 |
| 多 `tool_call_delta`、JSON 解析失败、`max_tokens` 恢复、compact 假成功 | A | 统一收口 Agent 主循环 |
| `global autoApprove`、MCP `allowAutoConfirm`、Sampling `Not Now` | A | 统一收口 MCP/工具确认边界 |
| 标准 Chat 通路绕过 `resolveProviderOptions()` / `ModelResolver` | B（原 A5，已降级） | 与 B1/B2 合并为"配置主路径统一"集中实施 |
| OAuth `client_id`、state 生命周期、refresh 上限、服务接线 | B | 作为认证链完整修复 |
| `ModelResolver` 缓存键、并发去重、provider 判断错位 | B | 作为模型解析链修复 |
| `messageNormalization`、`progressBridge`、rich content 降级 | B | 作为历史上下文链和 UI 回退修复 |
| SSE 尾包、Gemini error chunk、OpenAI vision、`stream_options`、`/v1`、`max_completion_tokens` | C | 作为 Provider 协议兼容修复 |
| `ApiKeyService` 事件契约、`testConnection`、per-model 配置通知 | C | 作为配置/通知链修复 |
| Settings UI、per-model key、provider-specific test connection、空模型状态 | C | 作为设置页与可观测性修复 |
| `registerDynamicAgent`、`McpAddContextContribution`、`resource_link`、Disposable 泄漏 | C | 作为基础设施边缘路径修复 |
| `defaultChatAgent`、`dataFolderName`、文档链接、构建脚本、`.bak` 污染 | C | 作为产品元数据与构建收口 |
| Gemini key、密码输入、fetch cleanup 等争议项 | D | 仅做防御性加固，不当作主线硬阻塞 |

## 批次 A：P0 安全边界与状态一致性

### A1. 修复 request 绑定与工具确认链

**目标**

- 任何工具调用、自动确认、执行结果、后置确认都必须绑定到显式 `chatRequestId`。
- 不再允许通过“最后一个 request”推断当前请求。

**涉及文件**

- `vscode/src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts`

**⚠️ 上游代码说明**

此问题是 **VS Code 上游本身的 bug**，Director-Code 未修改过该文件，纯继承自上游。具体表现：`invokeTool()` (L458) 和 `shouldAutoConfirm()` (L1126) 使用 `getRequests().at(-1)` 取最后一条 request，而同文件中 `beginToolCall()` (L903) 已正确使用 `.find(r => r.id === chatRequestId)` 按 ID 查找——同一文件内两套逻辑不一致。

**决策：在 fork 里直接修复，同时给 VS Code 上游提 issue。** 如果上游后续自行修复，rebase 时删除我们的改动即可。

**Rebase 风险**：中等。改动属于局部替换（在 3-4 个调用点将 `.at(-1)` 替换为按 ID 查找），不涉及上游函数结构重构，与上游常规迭代冲突概率低。

**实现方式**

- 提炼统一的 `resolveRequest(session, chatRequestId)` 辅助逻辑，采用**最小侵入**原则——不重构上游原有结构，仅在需要的调用点替换。
- `invokeTool()`、`shouldAutoConfirm()`、`shouldAutoConfirmPostExecution()`、streaming 占位与最终执行全部使用同一解析函数。
- 仅在确实没有 `chatRequestId` 的兼容路径上保留显式降级到 `.at(-1)`，并记录日志警告。
- 为 queued request、多个 active request、reroute 场景补充敌对测试。

**验收标准**

- 同一 session 下存在多个 request 时，工具调用不会再挂错消息。
- 自动确认与最终执行使用的是同一个 request 对象。

### A2. 修复取消语义与超时取消

**目标**

- 用户取消必须真正取消底层请求或工具执行。
- 取消不能再被记为 `success`。
- 半截结果不能污染回放给模型的 history；UI 可按 `incomplete` / `cancelled` 呈现已完成部分。

**涉及文件**

- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeModelProvider.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/toolBridge.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/retry.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeAgent.ts`

**实现方式**

- `CreateMessageParams` 主路径全部补齐 `abortSignal`。
- `DirectorCodeModelProvider` 非流式 fallback 调 `createMessage()` 时同样传 `abortSignal`。
- `AgentEngine` 新增显式 `cancelled` 终态。
- 取消后不 finalize 未完成的 text/tool block 到 `this.messages` / replay history。
- UI transcript 可保留取消前已经完成的 assistant 片段，但必须显式标记为 `incomplete` / `cancelled`，且不作为下一轮 LLM 输入。
- `toolBridge` 使用派生 `CancellationTokenSource`，超时触发 `.cancel()`，而不是只 reject promise。
- `withRetry()` 的 backoff 改为可取消 sleep。

**验收标准**

- 用户取消后网络请求真正中断。
- UI 不再把取消显示为成功。
- 若 UI 展示取消前的 assistant 片段，必须带 `incomplete` / `cancelled` 标记，且下一轮请求看不到这段 incomplete assistant history。
- 工具卡死超时后，后台不再继续运行僵尸调用。

**已知限制（D45）**：取消操作只能阻止尚未开始的后续工具调用和尚在进行中的网络请求。对于已执行完毕的工具操作（如文件已写入、终端命令已运行），取消不会回滚其 side effect。这与 VS Code 上游及所有主流 Agent（Copilot、Cursor、Claude Code）的行为一致，不视为 bug。

### A3. 修复 Agent 主循环的结构化输出正确性

**目标**

- 多工具并发不串台。
- JSON 错误不再静默包装为 `{ raw }`。
- `max_tokens` 截断时不再继续破坏结构化输出。
- compact 失败不能伪装成功。

**涉及文件**

- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/agentEngine.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/compact.ts`

**实现方式**

- `tool_call_delta` 改为按 `index` 或稳定 ID 分桶。
- `finalizeToolBlock()` 中的 JSON 解析失败改为生成明确的结构化错误，并回传给模型重新修正。
- `stopReason === 'max_tokens'` 时区分“普通文本续写”和“结构化工具调用被截断”两条路径。
- compact 只有在结果确实变化且成功时才发送 `compact_boundary`。
- 流式 `thinking` 内容纳入完整 response 聚合，避免信息丢失。
- `executeTools()` 恢复模型原始工具顺序；`updatedInput` 真正接入执行路径。

**验收标准**

- 多工具并发时参数不会混入其他工具。
- JSON 无效时模型能收到明确纠错反馈。
- compact 失败时 UI 不再显示“已压缩”假象。

### A4. 收口 MCP/工具确认安全边界

**目标**

- 不再通过修改 VS Code 全局设置来规避工具确认问题。
- MCP 非只读变更工具不得默认静默放行。
- Sampling 的 `Not Now` 必须保持"本次不允许"语义。

本问题包含三个子项，来源和修复策略各不相同：

#### A4a. MCP Sampling "Not Now" 语义修正（上游 bug，fork 内修复）

**涉及文件**: `vscode/src/vs/workbench/contrib/mcp/common/mcpSamplingService.ts`

**⚠️ 上游代码说明**: 此问题是 **VS Code 上游本身的 bug**，Director-Code 未修改过该文件。`allowButtons()` 中 "Not Now" 将 `(serverId, false)` 写入 session map，但 `_getMatchingModelInner()` (L238) 判断时只用 `.has()` 检查 key 是否存在，不检查 value 是 true 还是 false，导致"拒绝"在运行时等同于"允许"。

**决策**: 在 fork 里直接修复，同时给 VS Code 上游提 issue。改动极小（`.has()` 改为 `.get() === true`），Rebase 冲突概率极低。

**实现方式**: `_getMatchingModelInner()` 中将 `!this._sessionSets[key].has(server.definition.id)` 改为 `this._sessionSets[key].get(server.definition.id) !== true`，对 `allowedDuringChat` 和 `allowedOutsideChat` 两处同步修改。

#### A4b. 工具自动批准策略——采用方案 B：走 permissionLevel 机制（仅改自研代码）

**涉及文件**: `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/agentEngine.contribution.ts`（Director-Code 自研代码）

**问题本质**: Director-Code 在启动时静默将 `chat.tools.global.autoApprove`（上游称之为 "YOLO mode"，上游默认值为 `false`，描述为"极其危险，永远不推荐"）设为 `true`。这与上游 MCP 工具的 `allowAutoConfirm = true` 声明叠加后，所有非沙箱变更工具在用户无感知的情况下被自动批准执行。**此问题完全出在我们自己的代码中，不涉及上游代码改动。**

**决策**: 采用方案 B——删除全局配置篡改，通过 VS Code 内置的 `permissionLevel` 权限级别机制控制工具批准。

**实现方式**:

1. **删除** `agentEngine.contribution.ts` 中 `_enableToolAutoApprove()` 方法及其调用，让 `chat.tools.global.autoApprove` 保持上游默认值 `false`。
2. 工具批准通过 VS Code 内置的**权限级别选择器**（聊天输入框旁的 Agent/Ask/Autopilot 模式切换）实现：用户选择 "Autopilot" 模式时工具自动批准（与 VS Code 原生 Copilot 行为一致），其他模式下保持手动确认。
3. 用户仍可通过 Settings 搜索 `chat.tools.global.autoApprove` 自行开启全局自动批准（自担风险）。

#### A4c. 不需要修改的上游代码（记录备忘）

`mcpLanguageModelToolContribution.ts` 中 `allowAutoConfirm = true` 是上游对非沙箱非只读 MCP 工具的标准声明，仅表示"有资格被自动批准"，真正批准还需全局配置或权限级别配合。删除了我们的 `_enableToolAutoApprove` 后，该声明不再导致自动批准。**无需改动上游。**

**验收标准**

- 未经用户主动选择 Autopilot 模式或手动开启全局 autoApprove，危险工具不会被默认自动批准。
- `Not Now` 之后同一会话内不会被当作已允许。
- Director-Code 不再修改 VS Code 全局配置 `chat.tools.global.autoApprove`。

### ~~A5.~~ 修复标准 Chat 主路径配置失真（已降至批次 B，见决策 D1）

**目标**

- 标准 Chat 通路与 Agent 通路使用同一套模型/密钥/能力解析逻辑。
- per-model 配置和动态模型解析在正式通路中真正生效。

**涉及文件**

- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeModelProvider.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/agentEngine.contribution.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/modelResolver.ts`

**实现方式**

- 将 `IModelResolverService` 与 `IOAuthService` 正式注册到 workbench。
- `provideLanguageModelChatInfo()` 不再只读静态 `MODEL_CATALOG`，改为读取解析后的模型列表。
- `sendChatRequest()` 不再直接读 provider 级 key 和全局 baseURL，而统一走 `resolveProviderOptions()`。
- 自定义模型、compatible provider、per-model baseURL/capabilities 在标准 Chat 通路中全部接通。

**验收标准**

- 同一个模型在 Agent 通路与标准 Chat 通路行为一致。
- per-model key/baseURL 变更后，模型选择器与实际请求都能正确反映。

## 批次 B：P1 认证链、模型链与历史上下文链

### B1. 修复 OAuth 正确性与生命周期

**目标**

- 授权、换 token、刷新三段使用同一个 `client_id`。
- state 生命周期完整、可重试、可清理。

**涉及文件**

- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/oauthService.ts`

**实现方式**

- 在 `IOAuthState` 中保存 `effectiveClientId`。
- `handleCallback()` 成功换 token 后再删除 state；失败时保留到过期或显式 cleanup。
- 增加 `cleanupExpiredStates()`，在服务启动和启动新 flow 时执行。
- refresh 定时器 delay 做 `MAX_SAFE_TIMEOUT` 截断。
- 本轮 OAuth 正式支持矩阵固定为 `anthropic` / `openai`；`gemini` / `openai-compatible` / `anthropic-compatible` 继续只支持 `api-key`。

**验收标准**

- 自定义 `clientId` 的授权流完整可用。
- exchange 失败后可重试，不丢现场。
- 过期 state 不会无限累积。
- Settings / 运行时只对 `anthropic` 与 `openai` 暴露 OAuth 入口，其余 provider 保持 `api-key`-only。

### B2. 修复 ModelResolver 缓存隔离与并发去重

**目标**

- 不同账号、不同授权状态、不同 baseURL 的模型缓存完全隔离。
- 并发 cache miss 时只触发一次真实拉取。

**涉及文件**

- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/modelResolver.ts`

**实现方式**

- 缓存键加入身份维度，至少区分：
  - `no-key`
  - `provider-key-hash`
  - `oauth-account`
- 引入 in-flight promise map，命中进行中的请求时直接复用。
- `_openAIModelToResolved()` 不再用 `!!baseURL` 推断 provider 类型。

**验收标准**

- 不同 key 不串模型列表。
- 并发 resolve 不会造成 stampede。

### B3. 修复历史回放、进度渲染与 rich content 语义

**目标**

- 历史回放不再丢工具链。
- 非流式/降级路径依然能显示最终正文。
- 标准 Chat 不再把所有 rich content 一律压成纯文本。

**涉及文件**

- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/messageNormalization.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/progressBridge.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeModelProvider.ts`

**实现方式**

- 本批次只修**当前会话历史回放**，不实现持久记忆、不实现跨会话检索召回；三者职责保持分离。
- `messageNormalization.ts` 不再仅做纯文本提取，而是改为“当前会话 replay 构建器”：
  - 保留 user 文本
  - 保留 assistant 最终文本
  - 保留 `tool_use`
  - 保留**有界** `tool_result`
- `tool_use` 采用最佳努力重建：
  - `toolCallId` → `tool_use.id`
  - `toolId` → `tool_use.name`
  - 输入参数优先从 `toolSpecificData.kind === 'input'` 的 `rawInput` 恢复
  - terminal / simpleToolInvocation / todoList 等特殊数据结构按各自字段恢复最小可用 input
  - 无法稳定恢复原始参数时回退为最小对象（如 `{}`），不阻塞 replay
- `tool_result` 采用 `U1-A`：保留截断或摘要后的结果，而不是完整原始输出：
  - 小结果直接保留
  - 中等结果采用 head-tail 截断
  - 超大结果只保留元信息 + preview，不回灌完整内容
  - 二进制或 base64 类结果不直接回灌，只保留类型占位说明
- 建议默认阈值：
  - `MAX_INLINE_TOOL_RESULT_CHARS = 4000`
  - `TOOL_RESULT_HEAD_CHARS = 2500`
  - `TOOL_RESULT_TAIL_CHARS = 1000`
- 上述阈值作为首版实现常量与测试边界使用，不作为产品承诺的固定 UX 数值。
- `resultDetails` 的提取按优先级处理：
  - `IToolResultInputOutputDetails`：优先提取文本输出，`ref`/`uri` 转为短描述
  - `IToolResultOutputDetailsSerialized`：转为 `[binary output: <mimeType>]`
  - 无 `resultDetails` 时，退回 `pastTenseMessage` / `invocationMessage`
- `thinking` 不进入历史回放，见决策 D4。
- 取消产生的 `incomplete assistant` 不进入 replay history；若 UI 保留展示，仅作为 transcript 态存在，不参与下一轮 API 请求。
- `progressBridge` 在无 `text_delta` 的情况下允许回退渲染 assistant 文本。
- `DirectorCodeModelProvider` 保留图片、工具结果和结构化 part 的最小语义，而不是只保留 text。
- 为未来扩展预留边界，但本轮不落实现：
  - 持久记忆：未来可挂在独立 memory provider / system prompt injection 链路
  - 跨会话记忆：未来可挂在独立 session recall / search service 链路
  - 两者都不应复用当前会话 replay 的实现函数

**验收标准**

- 多轮对话中模型能看到之前的工具调用与结果。
- 非流式 fallback 时用户仍能看到回答正文。

### B4. 修复产品元数据与数据隔离

**目标**

- Director-Code 不再在产品元数据层继续表现为 Copilot/Code-OSS 的变体。
- 稳定版与其他 OSS 构建彻底隔离数据目录。

**涉及文件**

- `vscode/product.json`
- `product.json`
- `prepare_vscode.sh`
- `vscode/src/main.ts`
- `vscode/src/vs/platform/environment/common/environmentService.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupProviders.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/actions/chatGettingStarted.ts`
- `vscode/src/vs/platform/extensionManagement/common/extensionGalleryService.ts`

**实现方式**

- `defaultChatAgent` 一次性改为 Director-Code 自有配置：`extensionId = director-code.core`、~~`chatExtensionId = director-code.chat`~~ **`chatExtensionId` 留空字符串**（见决策 D25/D39）、~~`chatExtensionOutputId = director-code.chat.Director Code Chat.log`~~ **`chatExtensionOutputId` 同步清空**（见决策 D25/D39）；相关 command id 同步去 Copilot 化。`chatExtensionOutputExtensionStateCommand` 仅在存在真实可执行命令时保留，否则显式置空，不引入占位命令。
- stable `dataFolderName` 改为 `.director-code`。
- 帮助/文档统一指向 `https://github.com/daxijiu/Director-Code#readme`，`issue` / `feature request` 统一指向 `https://github.com/daxijiu/Director-Code/issues/new`，`release notes` 统一指向 `https://github.com/daxijiu/Director-Code/releases`，`terms` / `privacy` / `plans` / `publicCodeMatches` 当前阶段正式统一落到 `https://github.com/daxijiu/Director-Code`。
- 所有依赖 `defaultChatAgent` 为“可安装 marketplace 扩展”的 setup / welcome / gallery / 排序路径，统一改为 Director-Code 内置语义或显式禁用；不再提示用户安装不存在的 `director-code.core` / `director-code.chat` 扩展。
- 对 `argv.json`、extensions、policy 路径加 smoke test。

**验收标准**

- 产品不再把用户引导到 Copilot 页面。
- 稳定版不再与 `.vscode-oss` 共享数据目录。
- `defaultChatAgent` 元数据、输出通道文案和默认链接全部完成去 Copilot 化。
- `chatSetup` / `getting started` / gallery 相关路径不再假定存在可安装的默认聊天扩展；对应流程要么走内置路径，要么被显式禁用。

## 批次 C：P2 Provider 兼容、UI 配置、基础设施与构建收口

### C1. 收口 Provider 协议兼容性

**涉及文件**

- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/abstractProvider.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/openaiProvider.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/geminiProvider.ts`

**需要修复的问题**

- SSE 尾部 buffer flush
- `event:` 行解析
- buffer 长度上限
- OpenAI Provider 补齐 vision 图片转换（Anthropic/Gemini 已实现，仅 OpenAI 缺失）
- `stream_options.include_usage` 兼容开关
- compatible provider `/v1` 路径归一化
- `max_tokens` / `max_completion_tokens` 按模型系列切换
- Gemini 流式 `error` 处理
- Gemini function call ID 稳定化
- Gemini `tool_result -> functionResponse` 保留原工具名

**验收标准**

- 不再出现流式错误被伪装成空成功。
- OpenAI-compatible、Anthropic-compatible 与 Gemini 原生 provider 的行为边界清晰。

### C2. 收口 API Key、事件契约与设置页行为

**涉及文件**

- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/apiKeysWidget.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/providerSettingsWidget.ts`
- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeSettingsEditor.ts`

**需要修复的问题**

- `onDidChangeApiKey` payload 结构化
- `MODEL_CONFIG_PREFIX` 变更进入通知链
- `getProviderAuthMethod()` 不再恒返回 `api-key`，而是按正式矩阵返回：`anthropic/openai => oauth | api-key`，`gemini/openai-compatible/anthropic-compatible => api-key`
- `testConnection()` 全部加超时
- 测试连接使用 provider-specific model/baseURL
- Settings 状态识别 per-model key
- `anthropic-compatible` 空模型状态不能静默写空字符串
- 配置写入改为 async 并做防抖

**验收标准**

- UI 不再误报“未配置”。
- Test Connection 不再因错模型、错 baseURL、黑洞地址而产生假结果或卡死。
- Settings 只对 `anthropic` / `openai` 展示 OAuth 状态与入口，其他 provider 不展示伪 OAuth 能力。

### C3. 收口资源生命周期与基础设施边缘路径

**涉及文件**

- `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeModelProvider.ts`
- `vscode/src/vs/workbench/contrib/chat/common/participants/chatAgents.ts`
- `vscode/src/vs/workbench/contrib/mcp/browser/mcpAddContextContribution.ts`
- `vscode/src/vs/workbench/contrib/mcp/common/mcpLanguageModelToolContribution.ts`

**需要修复的问题**

- `DirectorCodeModelProvider` 继承 `Disposable`
- 取消监听和 emitter 全部纳入 dispose 链
- `registerDynamicAgent()` 重复 ID 防护与安全 dispose
- `McpAddContextContribution` 正确订阅 capability 变化
- `resource_link` 图片读取失败时返回显式错误或 fallback link

**验收标准**

- 长时间运行不再累积明显监听泄漏。
- 动态 agent 生命周期不会误删后注册实例。

### C4. 收口 token/cost/compact 与模型元数据双源

**涉及文件**

- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/tokens.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/compact.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/modelCatalog.ts`
- `vscode/src/vs/workbench/contrib/chat/common/agentEngine/modelResolver.ts`

**需要修复的问题**

- `estimateTokens()` 从粗糙字符估算升级为更可靠的 UTF-8/启发式估算
- `estimateCost()` 纳入 cache token 或拆出明确的成本模型
- `shouldAutoCompact()` 增加下界保护
- `tokens.ts` 与 `modelCatalog.ts` 合并为单一真值源；`modelCatalog` 只负责静态默认 metadata 与已知覆盖，`ModelResolver` 负责运行时发现
- 动态发现但 `modelCatalog` 未收录的模型，只有在 provider-specific 规则可判定为 `chat/generative` 时才允许进入 picker 和请求路径；embeddings / moderation / audio / image-only 等非聊天模型默认排除
- 对通过过滤但 `modelCatalog` 未收录的动态模型，price/context/capabilities 标记为 `unknown` 或保守默认，不伪造精确 metadata

**验收标准**

- 不再因负阈值导致几乎一直 compact。
- 模型上下文、价格、输出上限不再双源漂移。
- 通过聊天能力过滤的未知动态模型不会被静默过滤，也不会显示伪精确的成本或上下文上限。
- 无法安全判定为 `chat/generative` 的动态模型不会进入 picker。

### C5. 收口构建脚本与工作树污染

**涉及文件**

- `build.sh`
- `prepare_vscode.sh`

**需要修复的问题**

- `compile-extensions-build` 改为可选步骤，使用 `DIRECTOR_CODE_SKIP_EXTENSIONS_BUILD=1` 明确控制是否跳过
- `.bak` 文件转移到临时目录或自动清理

**验收标准**

- 主构建脚本在受限网络环境下可按明确开关运行。
- 构建脚本不再长期制造脏工作树。

## 批次 D：P3 防御性加固与争议项处理

### D1. 只做加固、不做重型改造的条目

这批问题不作为主线阻塞项，但建议低成本收口：

- Gemini key in URL
  - 仅在确认目标 API 全量兼容时，增加 header 方式开关。
  - 默认方案仍需保留标准兼容路径。
- 密钥输入安全加固
  - 禁用自动填充
  - 提交后重建 input
  - 尽量缩短明文值在 DOM 中的停留时间
- 通用 fetch helper
  - 抽 `fetchWithTimeout()` / `fetchJsonWithTimeout()`
  - 收口 `ModelResolver`、`testConnection`、CDN 拉取、OAuth 等路径
- Editor 生命周期深审
  - 对 `EditorPane.dispose()`、`setInput()` 重入做一次专门审计

## 依赖关系

| 先做 | 后做 | 原因 |
| --- | --- | --- |
| A1 request 绑定 | A4 MCP/确认边界 | 先保证 request 绑定正确，后续权限判断才有意义 |
| A2 取消语义 | B3 progress/history | 不先修取消终态，历史与 UI 修复容易继续固化假成功 |
| B（原 A5）标准 Chat 主路径 | B2 ModelResolver 强化 | 已降至同批次，与 B1/B2 协同实施 |
| B1 OAuth 正确性 | B2/B4 接线与产品配置 | 不先修认证链，接线后只会把 bug 暴露到运行时 |
| C1 Provider 兼容 | C2 Settings/Test Connection | 先修 Provider 协议行为，再校准 UI 与测试连接 |
| C4 模型元数据统一 | 后续成本/上下文策略优化 | 单一真值源建立后才适合继续调算法 |

## 测试与验收计划

### 必补测试

| 批次 | 测试方向 | 重点用例 |
| --- | --- | --- |
| A | request 绑定 | 同一 session 多 request 并存；目标 request 不是最后一个；自动确认与执行结果必须落到同一 request |
| A | 取消与超时 | 用户取消后 subtype 为 `cancelled`；工具超时会取消底层执行；非流式 fallback 可被 abort；incomplete assistant 不进入 replay history |
| A | tool stream | 多 `tool_call_delta` 按 index 聚合；JSON 错误回传模型；compact 失败不发 boundary |
| A | MCP 状态机 | `Allow in this Session` / `Not Now` / `Never` 三条路径 |
| B | OAuth | 自定义 `clientId` 全流程；exchange 失败重试；过期 state cleanup；refresh delay 截断；仅 `anthropic/openai` 暴露 OAuth |
| B | ModelResolver | 缓存键含身份维度；并发 miss 去重；不同账号不串缓存；仅 `chat/generative` 动态模型进入 picker；未知 metadata 标记为 `unknown` |
| B | History/UI fallback | 历史保留工具链；无 `text_delta` 时仍展示正文；rich content 不被完全抹平 |
| C | Provider | SSE 尾包 flush；Gemini error chunk；OpenAI `vision` / `/v1` / `max_completion_tokens` |
| C | Settings/API keys | per-model key 状态识别；Test Connection 超时；provider-specific model/baseURL；OAuth 入口只在 `anthropic/openai` 展示 |
| C | Product/Build | `defaultChatAgent` 不再指向 Copilot；GitHub 链接替换完成；`chatSetup/getting started/gallery` 不再假定可安装扩展；`dataFolderName` 正确；构建脚本开关有效 |

### 完成标准

- 批次 A（A1-A4）全部通过后，才允许继续功能开发。原 A5 已降至批次 B。
- 批次 B 全部通过后，标准 Chat 主路径与认证主路径视为稳定。
- 批次 C 全部通过后，当前 Phase 1/1.5/1.5+ 代码可视为完成收口。
- 批次 D 不阻塞主线，但必须在 Phase 2 对外扩展前完成至少一轮加固审计。

## 不纳入独立硬阻塞项的条目

以下问题不应单独作为主线 blocker，但可在批次 D 做低成本处理：

- “Gemini API key 出现在 URL query 就是项目级严重漏洞”
- “密码输入框已构成致命明文泄露”
- “`modelResolver` 未 abort 一定会导致套接字泄漏”
- “当前单线程 `compact.ts` 已构成严重并发污染”

这些条目要么属于 API 约束，要么属于低概率/低证据风险，不应抢占主线修复优先级。

## 已确认决策记录 (2026-04-15)

以下决策由项目负责人在 review 过程中确认，作为后续实施的约束条件。

### 决策 D1：A5 降至 B 批次

**结论**：A5（标准 Chat 主路径配置接线）从批次 A（P0）**降至批次 B（P1）**。理由：
- A5 改动面最大（涉及新建接口、改造 ModelProvider 核心路径），不应阻塞 A1-A4 的紧急修复
- A5 依赖 B1（OAuth 修复）先完成，否则会把有 bug 的 OAuthService 注册到运行时
- 降至 B 后，A5 与 B1/B2 合并为"配置主路径统一"集中实施

批次 A 完成标准相应调整：A1-A4 全部通过即可进入批次 B，无需等待 A5。

### 决策 D2：B4 dataFolderName 直接改，无需迁移

**结论**：`dataFolderName` 从 `.vscode-oss` 直接改为 `.director-code`，不做数据迁移。理由：当前处于内部开发阶段，没有外部用户，无迁移需求。

### 决策 D3：B4 defaultChatAgent 改为自有配置（已被 D25/D39 部分修正）

**结论**：`defaultChatAgent` 采用一次性彻底去 Copilot 化方案，而非禁用或分阶段混用。固定值如下：
- `extensionId = director-code.core`
- ~~`chatExtensionId = director-code.chat`~~ → **`chatExtensionId` 留空字符串**（D25 代码调查结论：非空值会导致内置工具被误标为 extension 源；空字符串让上游 `chatParticipantPrivate` proposal 回退生效，见决策 D25/D39）
- ~~`chatExtensionOutputId = director-code.chat.Director Code Chat.log`~~ → **`chatExtensionOutputId` 同步清空**
- `chatExtensionOutputExtensionStateCommand` 仅在存在真实可执行命令时保留，否则置空；不引入伪造的占位 command id
- `documentationUrl = https://github.com/daxijiu/Director-Code#readme`
- `reportIssueUrl = https://github.com/daxijiu/Director-Code/issues/new`
- `requestFeatureUrl = https://github.com/daxijiu/Director-Code/issues/new`
- `releaseNotesUrl = https://github.com/daxijiu/Director-Code/releases`
- `termsStatementUrl` / `privacyStatementUrl` / `skusDocumentationUrl` / `publicCodeMatchesUrl` 当前阶段正式统一到 `https://github.com/daxijiu/Director-Code`
- 改动后大部分 Copilot 特殊逻辑（权益/配额/统一策略/市场弃用）会因 ID 不匹配而自动跳过——这正好是期望行为
- 需要验证**内置工具判断**（`languageModelToolsContribution` 用 `chatExtensionId` 判断"内置"）是否受影响
- `vendor === 'copilot'` 硬编码不受此改动影响，它们是独立逻辑
- 所有 URL（条款、隐私、文档、帮助、反馈）同步替换为项目 GitHub 资源，不再保留微软 / Copilot 跳转
- 所有依赖 `defaultChatAgent` 为“可安装扩展”的 setup / welcome / gallery 逻辑统一改为内置路径或禁用，不再提示安装不存在的 Director-Code Chat 扩展

### 决策 D4：B3 历史消息中 thinking 完全丢弃

**结论**：历史消息中 thinking 内容**完全丢弃**，不保留摘要。理由：
- open-agent-sdk-typescript（Director-Code 的代码源头）采用的策略就是完全丢弃 thinking
- thinking 仅在流式展示时给用户看，不进入对话历史、不参与 compact
- 完全丢弃是当前的实际行为（流式路径没有累积 thinking 到 contentBlocks），保持一致
- 模型主要依赖工具调用和结果来理解上下文，不依赖 thinking 链

注意：A3 中"流式 thinking 内容纳入完整 response 聚合"的改动仍然有意义——它让 `assistant` 事件中的 response 对象包含 thinking 块（用于可能的 UI 展示），但这些 thinking 块不会被写入用于下一轮 API 请求的 `this.messages` 历史。

### 决策 D5：C1 三家 Provider 统一实现 vision 图片支持（更新）

**结论**：在 C1 阶段为 OpenAI Provider 补齐图片转换，使三家 Provider 统一支持 vision，能力声明保持 `vision: true`。

**现状评估**（经代码验证）：
- **Anthropic**：已可工作。内部格式就是 Anthropic 格式，`image` block 会被 pass-through 原样发送给 API
- **Gemini**：已实现。`convertMessages()` 中有 `case 'image'` 分支，正确转换为 `inlineData` 格式
- **OpenAI**：**唯一缺失**。`convertUserMessage()` 只处理 `text` 和 `tool_result`，image block 被静默丢弃

**改动量**：约 20-30 行代码，仅修改 `openaiProvider.ts` 的 `convertUserMessage()`：
1. 增加 `case 'image'` 分支，将内部 `{ type: 'image', source: { type: 'base64', media_type, data } }` 转为 OpenAI 的 `{ type: 'image_url', image_url: { url: 'data:...' } }`
2. 检测到有 image 时，user 消息 content 从字符串格式改为数组格式（OpenAI 多模态消息要求）
3. 同时支持 `source.type === 'url'` 的 URL 图片引用

### 决策 D6：A2 取消后的历史处理策略

**结论**：取消时保留 user 消息（用户确实发了）；UI transcript 可保留 assistant 的已完成部分，但必须标记为 `incomplete` / `cancelled`；回放给模型的 history 丢弃 incomplete assistant。不会回滚 user 消息。

### 决策 D7：A3 executeTools 工具顺序——采用 slot 数组方式

**结论**：执行策略保持"并发只读 + 串行 mutation"的性能优化不变，但**结果按原始位置写回**（slot 数组方式）。即：执行可以乱序，返回必须保序。

### 决策 D8：C3 上游代码标注补充

以下 C3 涉及的文件为 VS Code 上游代码，补充标注：
- `chatAgents.ts`（`registerDynamicAgent` 重复 ID 防护）——上游代码，改动极小
- `mcpAddContextContribution.ts`（capability 订阅修正）——上游代码，一行改动
- `mcpLanguageModelToolContribution.ts`（resource_link 降级处理）——上游代码，catch 回调修改

### 决策 D9：DirectorCodeModelProvider 跨批次改动协调

`DirectorCodeModelProvider` 在三个批次中都有改动需求：
- ~~A5~~（已降至 B）：接入 `resolveProviderOptions()`、模型列表走 ModelResolverService
- B3：消息不降为纯文本，保留富内容
- C3：继承 `Disposable`，释放监听器

实施时需注意三处改动不要互相冲突。建议在 B 批次中统一完成 ~~A5~~ + B3 对此文件的改动，C3 作为最终的 Disposable 治理收尾。

### 决策 D10：品牌/元数据测试断言

B4 的品牌清理需要验证：
- 运行时欢迎页不显示 Copilot 相关内容
- 帮助 / 文档链接指向 `https://github.com/daxijiu/Director-Code#readme`，不再跳转到 `go.microsoft.com` 或 `aka.ms/github-copilot-*`
- `product.json` 的 `defaultChatAgent` 块内不再包含 `GitHub.copilot` / `GitHub.copilot-chat`
- `chatExtensionOutputId` 不再包含 `GitHub Copilot Chat`
- `terms` / `privacy` / `release notes` / `feature request` 分别落到仓库、Releases、Issues 等自有 GitHub 资源
- Settings 中不出现指向 Copilot 设置页的跳转
- 内置工具判断（`chatExtensionId` 依赖）在新 ID 下仍正常工作
- `chatSetup` / `getting started` / gallery 排序等路径不再提示安装不存在的默认聊天扩展

### 决策 D11：A4 autoApprove 策略回归上游默认

**结论**：采用 `upstream_default` 方案。Director-Code 不再默认开启全局自动批准，而是回归 VS Code 上游默认行为：

- 删除 `_enableToolAutoApprove()` 及其调用，不再写入 `chat.tools.global.autoApprove = true`
- 默认保持手动确认
- 自动批准仅在用户主动选择高权限模式（如 Autopilot / permissionLevel 对应模式）或显式开启全局设置时生效

这项决策与 A4b 一致，作为产品级原则固化到计划中，后续不再考虑“保留当前默认自动批准”方案。

### 决策 D12：A5/B 批次统一范围采用 full_unify

**结论**：标准 Chat 通路与 Agent 通路的统一范围采用 `full_unify`，不是最小修复。即：

- 不只统一 key/baseURL/model/capabilities
- 同时统一动态模型解析、标准 Chat 请求链和主路径配置解析逻辑
- 最终目标是标准 Chat 与 Agent 通路在模型、能力、配置和请求发送语义上保持一致

注意：该工作仍按决策 D1 留在批次 B 实施，但实施范围按“完全统一”执行，不做降级为“最小统一”。

### 决策 D13：B1 OAuth 本轮完成后正式接入运行时

**结论**：采用 `open_now` 方案。OAuth 不再只停留在 common 层或 feature flag 后面，而是在 B1/B2 完成后正式注册到 workbench 并进入产品运行时。

实施约束：

- 必须先完成 `client_id` 一致性、state 生命周期、refresh 上限等 B1 修复
- 再执行服务注册与运行时接线
- 不采用“先修逻辑但继续隐藏入口”的方案

### 决策 D14：B2 ModelResolver 身份隔离采用 key_hash_and_account

**结论**：缓存身份维度采用 `key_hash_and_account` 方案：

- API key 路径：使用 `provider + baseURL + apiKeyHash`
- OAuth 路径：使用 `provider + baseURL + accountId`
- 无认证路径：单独使用 `no-key` 分桶

不采用“只区分是否有 key”的弱隔离方案，也不采用“所有认证路径完全不缓存”的极端方案。

### 决策 D15：D7 工具执行顺序采用 hybrid_slot_mode

**结论**：工具执行顺序采用 `hybrid_slot_mode`，即：

- 连续只读工具允许并行执行
- mutation 工具严格串行
- 结果按原始位置写回（slot 数组 / 保序回填），保证最终语义顺序稳定

这项决策替代“完全严格串行”和“保持现状”两种方案，兼顾语义正确性与性能。

### 决策 D16：B3 历史回放中的 tool_result 保留粒度采用 U1-A

**结论**：历史回放里的 `tool_result` 采用 `U1-A`，即：

- 保留 `tool_use`
- 保留**截断或摘要后的** `tool_result`
- 保留最终 assistant 文本
- thinking 不进入历史回放（延续决策 D4）

**范围边界**：

- 此决策仅适用于**当前会话 replay 给 LLM 的上下文**
- 不适用于未来的持久记忆实现
- 不适用于未来的跨会话检索/召回实现

**实现约束**：

- 不把超长工具输出完整回灌给模型
- 不把二进制或大段 base64 直接放回 replay
- 优先保留足以支撑后续推理的关键信息：工具名、调用关系、关键文本结果、必要元信息
- 若未来实现持久记忆或跨会话 recall，应走独立服务/接口，而不是复用本轮的 replay 压缩策略

### 决策 D17：B1/C2 OAuth 正式支持范围采用 two_native_providers_only

**结论**：本轮正式开放 OAuth 的 provider 仅 `anthropic` 与 `openai`。

- `gemini`、`openai-compatible`、`anthropic-compatible` 继续只支持 `api-key`
- `getProviderAuthMethod()`、Settings UI、标准 Chat 与 Agent 通路都必须遵守同一矩阵
- 不做“界面上先展示 OAuth、实际还不可用”的过渡方案

### 决策 D18：B2/C4 动态模型采用 allow_unknown_metadata

**结论**：允许运行时发现但 `modelCatalog` 未收录的动态模型在通过聊天能力过滤后进入正式可选列表并发起请求，但不伪造元数据。

- `ModelResolver` 是运行时可用模型集合来源
- `modelCatalog` 是静态默认 metadata 与已知覆盖源，不再代表“全部可用模型列表”
- 最终模型视图 = `ModelResolver` 结果 + `modelCatalog` 覆盖 + `resolveProviderOptions()` 解析结果
- 并非所有动态发现模型都进入 picker；只有可由 provider-specific 规则判定为 `chat/generative` 的模型才允许进入正式选择列表
- embeddings / moderation / audio / image-only 等非聊天模型默认排除；若无法安全判定是否适用于 chat，则默认不进入 picker
- 对通过过滤的未知动态模型，价格、上下文窗口、输出上限、能力等字段显示为 `unknown` 或保守默认
- 通过过滤的未知模型允许请求，但不做精确成本/上下文承诺

### 决策 D19：B4 defaultChatAgent 外部扩展语义采用 builtin_not_installable

**结论**：Director-Code 中的 `defaultChatAgent` 视为产品内置能力，不再假定背后存在可安装的 marketplace 扩展。

- `chatSetup` / `chatGettingStarted` / extension gallery / 默认排序等依赖“扩展安装与激活”语义的路径，要么改为 Director-Code 内置语义，要么显式禁用
- 不再提示用户安装不存在的 `director-code.core` / `director-code.chat` 扩展
- 任何基于 `extensionId` / `chatExtensionId` 的逻辑，若仅用于品牌、排序、内置判断可保留；若用于安装引导、marketplace 查询、激活联动，则必须收口

### 决策 D20：B4 品牌链接当前阶段采用 repo_homepage_as_official_landing

**结论**：当前阶段 `termsStatementUrl` / `privacyStatementUrl` / `skusDocumentationUrl` / `publicCodeMatchesUrl` 正式统一到仓库主页 `https://github.com/daxijiu/Director-Code`，不是临时占位。

- 本轮验收以“无微软 / Copilot 链接残留”为准，不要求必须已有独立专页
- 后续若外部发布需要独立条款、隐私或说明页，可在不改变当前产品语义的前提下替换这些 URL

## 最终执行建议

1. 以本文件作为唯一主计划，不再平行维护三套不同排序。
2. 批次 A 必须优先完成，尤其是：
   - request 绑定
   - 取消与超时取消
   - Agent 结构化输出正确性
   - MCP/autoApprove 安全边界
3. 批次 B 紧随其后，优先补 OAuth、ModelResolver 和 history/progress 主链。
4. 批次 C 用于把当前产品真正“收口”，包括 Provider 兼容、设置页、元数据和构建脚本。
5. 批次 D 只做防御性加固，避免因低置信问题打断主线。

## 最终判断

如果后续要开始真正实施，本计划应被视为：

- **优先级依据**：以本文件为准
- **落地细节参考**：优先参考 `docs/director-code-review-comparison-by-claude-2026-04-15.md` 中更细的测试和依赖拆分
- **风险补充来源**：选择性参考 `docs/director-code-review-comparison-Gemin.md` 中已被核实的健壮性点

在进入 Phase 2 ACP 扩展之前，最低要求是：

- 批次 A 全部关闭
- 批次 B 至少进入“已实现并有回归测试”的状态
- 批次 C 中的产品元数据与构建污染问题至少完成首轮收口

---

## 补充决策与细化（2026-04-16 Review 轮次）

以下内容为 2026-04-16 对本计划的系统性 review 后补充的决策、调查结论和实施细化。

### 决策 D21：A4b 验证通过——动态 Agent 工具确认 UI 可正常渲染

**结论**：经代码追踪验证确认：**删除 `_enableToolAutoApprove` 后，动态 Agent 的工具确认 UI 能正常渲染**，A4b 方案可行。

**验证要点**：
- 渲染链路（`appendProgress → ChatToolInvocation → ChatToolInvocationPart`）中 **无** `isDynamic` / `extensionId` 分支判断
- `IChatAgentRequest.sessionResource` 和 `requestId` 由 `chatServiceImpl` 填充，与 Agent 是否 dynamic 无关
- 大多数内置工具（editFile、taskComplete 等）`isEligibleForAutoApproval = true` 且不提供 `confirmationMessages` → Agent 模式下直接执行不需确认
- 需要确认的工具（terminal 命令等）通过 `confirmationTool` 自己提供带 `title` 的 `confirmationMessages` → UI 正常渲染
- Autopilot 模式（`permissionLevel = AutoApprove`）下所有工具跳过确认
- `toolBridge.ts` 的 120s 超时兜底机制仍有效作为最后防线

**前置条件**：A1（request 绑定修复）应在 A4b 之前完成，因为 `invokeTool` 用 `.at(-1)` 取 request 在并发场景下可能导致 toolInvocation 挂错请求。

### 决策 D22：上游 Bug 修复策略——仅 fork 内修复，暂不提交上游

**结论**：A1（`languageModelToolsService.ts` request 绑定）和 A4a（`mcpSamplingService.ts` Not Now 语义）的修复仅在 fork 内完成，暂不给 VS Code 上游提 issue 或 PR。理由：
- 当前优先级是把 Director-Code 做稳定
- 上游的修复节奏不可控，不应阻塞我们的计划
- Rebase 时如果上游自行修复，删除我们的改动即可

### 决策 D23：Compact 应使用更便宜的模型

**结论**：compact 操作默认使用同 Provider 的小模型（如 Anthropic → Haiku、OpenAI → gpt-4o-mini、Gemini → Flash），同时提供配置项让用户覆盖。

**实现方式**：
- 在 `AgentEngineConfig` 中新增 `compactModel?: string`
- 在 Settings UI 中新增 `directorCode.ai.compactModel`（默认为空 = 自动选择同 Provider 的小模型）
- `modelCatalog.ts` 中为每个 Provider 定义 `defaultCompactModel`
- `compact.ts` 在发起 compact 请求时使用 compact 专用模型

**归属批次**：C4（token/cost/compact 与模型元数据双源）

### 决策 D24：`vendor === 'copilot'` 硬编码确认排除

**结论**：经确认，`vendor === 'copilot'` 硬编码（`languageModels.ts:631` 等处）**不影响 Director-Code**。Director-Code 使用 `vendor = 'director-code'`，copilot 逻辑因 vendor 不匹配会被自动跳过——这正是期望行为。本计划不将 `vendor === 'copilot'` 硬编码列为待修复项。

### 决策 D25：chatExtensionId 对内置工具判断的影响（代码调查结论）

**结论**：**(b) 受影响，需要同步改动**。

**调查发现**：
- `languageModelToolsContribution.ts`（L259-307）和 `mainThreadLanguageModelTools.ts`（L123-129）用 `ExtensionIdentifier.equals(扩展id, chatExtensionId)` 判断工具是否 `ToolDataSource.Internal`（内置）
- 若 `chatExtensionId` 改为 `director-code.chat`，但 **不存在** 一个 id 为 `director-code.chat` 的真实扩展在贡献工具 → 所有原本标为 Internal 的工具将变为 extension 源 → `alwaysDisplayInputOutput` 等行为变化
- Director-Code 的工具是由 VS Code 上游代码贡献的（非扩展），走 `chatParticipantPrivate` proposal 回退路径

**处置方式**：`chatExtensionId` 字段留空字符串或不配置，让上游 `languageModelToolsContribution` 的 `chatParticipantPrivate` proposal 回退生效，内置工具仍标为 `ToolDataSource.Internal`。`chatExtensionOutputId` 同步清空。不创建虚假的 `director-code.chat` 扩展。

**归属批次**：B4（产品元数据与数据隔离），实施时需与 D3 的 `defaultChatAgent` 改动协调

### 决策 D26：B4 chatSetup / getting started / gallery 受影响路径处置清单

**调查结论**：以下是完整的受影响路径及处置方式。

| 文件 | 关键逻辑 | 处置 |
|------|---------|------|
| `chatSetupController.ts` L264-272 | `extensionsWorkbenchService.install(chatExtensionId)` 安装市场扩展 | **禁用**：Director-Code 内置，不走安装流程 |
| `chatSetupContributions.ts` L94, 564-603 | `checkExtensionInstallation` 检查 chatExtensionId 本地安装状态 | **改为内置**：内置时 `installed` context 恒为 true |
| `chatSetupContributions.ts` L615-617 | URL handler `authority === chatExtensionId` | **改为内置**：换成 Director-Code 的 URL scheme |
| `chatSetupContributions.ts` L697-718 | Teardown: enable/disable chatExtensionId | **禁用**：内置扩展不需 enable/disable 联动 |
| `chatSetupContributions.ts` L511-516 | `github.copilot.chat.*` 硬编码命令 | **重写**：改为 Director-Code 命令或移除 |
| `chatSetupProviders.ts` L59-65, 515-516 | 超时文案要求安装 chatExtensionId；`copilot_` 工具前缀 | **重写**：文案改为 Director-Code；移除 `copilot_` 前缀逻辑 |
| `chatSetupProviders.ts` L719-756 | `replaceAgentInRequestModel`：`setup.* → ${extensionId}.` | **重写**：改为 Director-Code agent id 映射 |
| `chatGettingStarted.ts` L33-77 | 监听 `extensionId` 的 `Install` 事件 → revealWidget | **改为内置**：改为在 agent 注册完成后触发 |
| `chatSetup.ts` L76-108 | 重新启用 `vscode.github-authentication` | **移除**：Director-Code 不依赖 GitHub 认证 |
| `chatParticipant.contribution.ts` L340-360 | 兼容性通知查找 chatExtensionId | **禁用**：内置无市场兼容性问题 |
| `extensionGalleryService.ts` L1162-1174 | 搜索结果重排 `extensionId` | **保留但无实际效果**：新 id 不在市场 |
| `extensionGalleryService.ts` L2010-2017 | 注入 deprecation：禁止安装旧 extensionId，迁移到 chatExtensionId | **移除**：Director-Code 无 Copilot 迁移语义 |
| `mainThreadLanguageModelTools.ts` L123-129 | `chatExtensionId` 为 falsy 时 `isBuiltinTool` 恒为 false，与 `languageModelToolsContribution` 的 proposal 回退不对称 | **补齐 proposal 回退**：增加与 contribution 一致的 `chatParticipantPrivate` proposal 检查（D52 新发现） |

**归属批次**：B4

### 决策 D27：SSE buffer 最大长度限制

**结论**：`readSSELines` 增加 `MAX_SSE_BUFFER_SIZE = 1MB` 常量上限。超限时截断当前行并 `console.warn`，继续读下一行（不终止流）。同时在 `done` 路径增加尾 buffer flush（解决现有的尾包丢失问题）。

**归属批次**：C1

### 决策 D28：C4 动态模型 chat/generative 过滤规则

**结论**：

| Provider | 过滤方式 | 规则 |
|----------|---------|------|
| OpenAI | 前缀白名单 + 排除列表 | 保留 `gpt-*`、`o1*`、`o3*`、`o4*`、`chatgpt-*`；排除含 `embed`、`moderation`、`tts`、`whisper`、`dall-e` 的 id |
| Gemini | 名称匹配 + 方法检测 | 保留含 `gemini` 的模型；若 API 返回 `supportedGenerationMethods`，需包含 `generateContent` |
| OpenAI-compatible | 排除非聊天模型 | 排除 id 含 `embed` 的模型，其余全部放入 picker |
| Anthropic-compatible | 不过滤 | Anthropic API 只返回 chat 模型 |

通过过滤但 `modelCatalog` 未收录的动态模型，`price` / `contextWindow` / `maxOutputTokens` 标为 `unknown`，UI 显示保守默认值。

**归属批次**：C4

### 决策 D29：A2 `cancelled` 终态映射到 VS Code ChatResult

**结论**：AgentEngine 内部新增 `cancelled` 终态。在 `directorCodeAgent.ts` 的 `invoke()` 中：
1. 取消时 **不设 `errorDetails`**（避免 UI 显示红色错误）
2. 在 `metadata.subtype` 中记录 `'cancelled'`
3. UI 层的"已取消"标记由 VS Code 的 `ChatResponseModel.isCanceled` 自动处理（response 被 cancel 时自动置位）

```typescript
return {
  metadata: { subtype: 'cancelled', usage: resultEvent.usage, numTurns: resultEvent.numTurns },
  timings: { totalElapsed: Date.now() - startTime },
};
```

### 决策 D30：A3 `tool_call_delta` 分桶策略

**结论**：Provider 负责标准化 index，AgentEngine 统一用 `Map<number, toolState>` 按 index 分桶。替换现有的单一 `currentTool` 变量。

- **OpenAI**：流式 `tool_calls[].index` 直接透传
- **Anthropic**：`content_block_start` / `content_block_delta` 的 `event.index` 透传
- **Gemini**：单次 response 中多个 `functionCall` 按顺序编号为 0, 1, 2...

### 决策 D31：A3 `max_tokens` 截断检测逻辑

**结论**：当 `stopReason === 'max_tokens'` 时，用 `pendingTools.size > 0`（有未 finalize 的工具累积器）判断截断位置：
- `pendingTools.size > 0` → 截断在工具 JSON 中间：丢弃不完整的工具调用，注入提示让模型重新输出完整工具调用
- `pendingTools.size === 0` → 普通文本续写：注入 "Please continue from where you left off."

### 决策 D32：B3 `tool_use` 重建——数据获取路径

**调查结论**：`IChatAgentHistoryEntry.response` **不包含** tool 块（`toChatHistoryContent` 过滤掉了）；`IChatToolInvocationSerialized` 无 `parameters`；完整 tool 数据只在 `IChatResponseModel.entireResponse.value` 中可得。

**结论**：采用双层策略，不改上游 `toChatHistoryContent`（避免 rebase 风险）：
1. **当前会话内**：AgentEngine 自己维护 `this.messages`，工具历史已完整，不依赖外部重建
2. **跨 turn 重建**（`messageNormalization.ts` 改造）：从 `IChatModel.entireResponse.value` 获取 tool 块（通过 `request.sessionResource` → `chatService.getSession()` → 筛选 `kind === 'toolInvocation'`），绕过不含 tool 的 `history` 参数

### 决策 D33：B3 `tool_result` 二进制/base64 内容检测

**结论**：三级检测，逐级判断：
1. `IToolResultOutputDetails` / `IToolResultOutputDetailsSerialized`（有 `output.type === 'data'`）→ 替换为 `[binary output: <mimeType>]`
2. `IToolResultInputOutputDetails` 中 `ToolInputOutputEmbedded` 的 `mimeType` 含 `image/`、`audio/`、`video/`、`application/octet-stream` → 替换为 `[<mimeType> content]`
3. 文本型 result 中检测 data URI 前缀 (`data:...;base64,`) 或纯 base64 模式（长度 > 500 且全为 base64 字符）→ 替换为 `[base64 data: ~<length> chars]`

### 决策 D34：C2 `getProviderAuthMethod()` 运行时判断逻辑

**结论**：系统自动检测，不依赖用户在 Settings 中选择认证方式。`anthropic` / `openai` 支持 OAuth，其余只支持 `api-key`。对支持 OAuth 的 provider，有有效 token 返回 `oauth`，否则返回 `api-key`。同时有 API key 和 OAuth token 时 OAuth 优先。

### 决策 D35：批次 B 内部执行顺序

**结论**：B4（独立，最先做）→ B1 + B2（并行）→ 原 A5（依赖 B1+B2 完成）→ B3（依赖 A2 + 原 A5 完成，最后做）

### 决策 D36：C1/C2 依赖——C1 拆分为 a/b

**结论**：C1 拆为两部分：
- **C1a**（不影响 C2，先做）：SSE 尾包 flush、Gemini error chunk 处理、Gemini function call ID 稳定化
- **C1b**（C2 依赖，与 C2 同步做）：`/v1` 路径归一化、`max_completion_tokens` 按模型切换、`stream_options.include_usage` 兼容开关

### 决策 D37：上游代码修改的测试策略

**结论**：
- **测试位置**：放在上游对应的测试目录（A1 → `chat/test/browser/tools/languageModelToolsService.test.ts`；A4a → 新建 `mcp/test/common/mcpSamplingService.test.ts`）
- **Mock 策略**：复用上游已有的 mock 基础设施（`TestChatService` 等）
- **标记方式**：所有我们添加的测试用 `// [Director-Code]` 注释标记，rebase 时如果上游自行修复，删除我们的测试

### 决策 D38：D9 DirectorCodeModelProvider 跨批次重构

**结论**：B 批次开始前先出一份 `DirectorCodeModelProvider` 目标形态设计文档，定义最终的构造函数签名和关键方法签名。B 批次（原 A5 + B3）和 C3 批次基于同一份签名分步实施，避免 C3 时大改 B 的代码。

### 工作量估算与里程碑（已更新，含 D46 buffer 调整）

| 批次 | 工期 | 关键复杂点 |
|------|------|-----------|
| **A** | **2 周** | A1 改上游代码需谨慎；A2 取消语义涉及多文件 |
| **B** | **3.5 周**（+0.5 周 buffer，见 D46） | B3 历史回放最复杂；原 A5 改动面最大；B3 接口设计前移到 B1+B2 并行期 |
| **C** | **2.5 周** | C1 逐个修复量大但独立；C1b 需与 C2 同步 |
| **D** | **1 周** | 低成本加固 |

**总计**：**9 周**（含 0.5 周 B3 buffer + 批次过渡集成验证）

**里程碑**：
- Week 2 末：批次 A 完成 → 安全边界收口 → A→B 集成 smoke test（0.5 天，见 D47）
- Week 5.5 末：批次 B 完成 → 配置主路径统一 → B→C 集成 smoke test（0.5 天，见 D47）
- Week 8：批次 C 完成 → Phase 1/1.5/1.5+ 收口
- Week 9：批次 D + 最终验证 → 可开始 Phase 2 ACP

### 决策 D39：统一 D3/D25 chatExtensionId 矛盾（2026-04-16）

**结论**：正式确认 D25（代码调查结论）覆盖 D3 原始提议。

- `chatExtensionId` = 空字符串（不是 `director-code.chat`）
- `chatExtensionOutputId` = 空字符串
- `extensionId` = `director-code.core`（保留，用于排序/标识，安装/激活路径由 D26 收口）
- B4 主体描述和 D3 正文已回溯修改，消除矛盾

**理由**：D25 经过代码追踪验证：`languageModelToolsContribution.ts` 用 `chatExtensionId` 判断工具是否 Internal。若填 `director-code.chat`（不存在的扩展），所有内置工具会被误标为 extension 源。空字符串让上游 `chatParticipantPrivate` proposal 回退路径生效，内置工具仍标为 `ToolDataSource.Internal`。

### 决策 D40：A3 JSON 解析失败重试机制

**结论**：

- **错误回传格式**：作为 `tool_result` 回传给模型，`is_error: true`，内容为 `"JSON parse error in tool call '<toolName>': <parseErrorMessage>. Please retry with valid JSON."`
- **重试上限**：同一个工具调用最多允许模型修正 **2 次**（即首次 + 2 次纠错 = 3 次尝试）
- **Turn 消耗**：每次纠错消耗 1 个 turn（受 `maxTurns` 约束）
- **超限行为**：第 3 次仍然 JSON 无效时，将该工具标记为失败，注入 `tool_result` 告知模型 `"Tool '<toolName>' failed after 3 attempts due to invalid JSON. Skip this tool and continue."`

**归属批次**：A3

### 决策 D41：A3 compact 成功判定标准

**结论**：

- **成功条件**：三项全部满足
  1. LLM 请求 HTTP 200（无异常/超时）
  2. 返回内容非空（至少 10 字符）
  3. 返回内容估算 token 数 < 原始内容估算 token 数的 90%
- **失败处理**：保留原始消息不替换，`console.warn` 记录 compact 失败原因，不发送 `compact_boundary`，不影响后续对话
- **无需结构化校验**：compact 输出为纯文本摘要，不需要 JSON schema 验证

**归属批次**：A3

### 决策 D42：B2 API Key 缓存哈希算法

**结论**：

- 算法：`SHA-256(apiKey)` 取前 16 个十六进制字符（64 bit）
- 使用 VS Code 已内置的 `crypto` 模块（`import * as crypto from 'crypto'`），无需额外依赖
- 仅用于缓存键区分不同 key，不用于安全存储或密码验证
- 碰撞概率 ~2^-32，对缓存场景完全足够

**归属批次**：B2

### 决策 D43：C4 Token 估算算法

**结论**：

- 算法：`Math.ceil(new TextEncoder().encode(text).length / 3.5)`
- 不引入 tiktoken 或 BPE 词表（~4MB，不适合 VS Code bundle 体积）
- 不按 Provider 分别计算（GPT-4/Claude/Gemini 的差异在 ±20% 以内，对 compact 触发和成本概算足够）
- 3.5 bytes/token 为保守估算，宁可略早触发 compact 也不溢出上下文窗口
- 精确 token 数在请求完成后从 Provider `usage` 返回值获取（已有）

**归属批次**：C4

### 决策 D44：C4/D23 Compact 模型的 fallback 策略

**结论**：三级回退：

1. **用户 Settings 配置**：`directorCode.ai.compactModel`（若非空则优先）
2. **Provider 默认小模型**：
   - `anthropic` → `claude-haiku-4-5`
   - `openai` → `gpt-4o-mini`
   - `gemini` → `gemini-2.5-flash`
   - `openai-compatible` / `anthropic-compatible` → **无默认**，直接跳到第 3 级
3. **当前主模型**：使用用户正在对话的主模型执行 compact

不可用处理：若第 1/2 级指定的模型不可用（key 缺失、模型不存在等），回退到下一级；最终兜底是主模型。`console.warn` 记录回退原因。

**归属批次**：C4（扩展 D23）

### 决策 D45：A2 不可取消 side-effect 记入已知限制

**结论**：在 A2 验收标准后新增「已知限制」段落：

> 取消操作只能阻止尚未开始的后续工具调用和尚在进行中的网络请求。对于已执行完毕的工具操作（如文件已写入、终端命令已运行），取消不会回滚其 side effect。这与 VS Code 上游及所有主流 Agent（Copilot、Cursor、Claude Code）的行为一致，不视为 bug。

**归属批次**：A2

### 决策 D46：B3 工期 buffer 与设计前移

**结论**：

- B3 的**接口设计**（messageNormalization 新函数签名、数据获取路径、截断策略常量定义）在 B1+B2 并行阶段同步产出设计文档（不写实现代码）
- B 批次总工期从 3 周调整为 **3.5 周**（+0.5 周 B3 buffer）
- 若 B4（品牌改动）提前完成，剩余时间可前移给 B3 编码
- 工作量估算与里程碑表已同步更新

### 决策 D47：批次过渡集成测试

**结论**：

- **A→B 过渡**（0.5 天）：A 批次全部通过后，跑一轮集成 smoke test：
  - A1 request 绑定 + A4 权限判断联动（多 request 并发 + 确认挂到正确 request）
  - A2 取消 + A3 结构化输出在多工具场景下的交互（取消中途的多工具并发、JSON 失败重试被取消）
- **B→C 过渡**（0.5 天）：B 批次全部通过后，跑一轮回归：
  - A2 取消 + B3 历史回放（cancelled assistant 不进入 replay history）
  - 原 A5 + B1 OAuth 在标准 Chat 通路中的完整流程（配置解析 → 认证 → 请求发送）
- 时间已含在更新后的里程碑中，不单独加周

### 决策 D48：B4 品牌改动手动 Smoke Test Checklist

**结论**：B4 编码完成后，用 0.5 天执行以下手动 UI 检查：

| # | 检查项 | 预期结果 |
|---|--------|---------|
| 1 | 启动后欢迎页 | 不含 Copilot / GitHub Copilot 文案 |
| 2 | Help → Documentation | 跳转到 `https://github.com/daxijiu/Director-Code#readme` |
| 3 | Help → Report Issue | 跳转到 `https://github.com/daxijiu/Director-Code/issues/new` |
| 4 | Chat 面板模型选择器 | 正常显示 Director-Code 模型列表 |
| 5 | Settings 搜索 "copilot" | 无 Copilot 相关设置跳转 |
| 6 | 内置工具确认弹窗 | editFile / terminal 等工具确认 UI 正常渲染（不因 chatExtensionId 空字符串而异常） |
| 7 | Getting Started | 不提示安装任何扩展 |
| 8 | About 对话框 | 品牌信息显示 Director-Code |
| 9 | 数据目录 | 位于 `%APPDATA%/.director-code`（不是 `.vscode-oss`） |
| 10 | Chat 齿轮菜单 | "Director Code AI Settings" 可正常打开 |

**归属批次**：B4 验收阶段

### 决策 D49：B1 OAuth 回调 URI、Handler 注册与并发策略（代码调研结论）

**调研发现**：

1. **redirect_uri 当前值**：`vscode://director-code/auth/callback`（`oauthService.ts` L81/89），但 `product.json` 中 `urlProtocol` 为 `director-code`，Electron 的 `NativeURLService.create` 会用 `director-code://` 作为协议 scheme。**两者不一致**——真实安装上系统会把回调交给 `director-code://` scheme，而不是 `vscode://`。
2. **handleCallback() 签名**：`handleCallback(code: string, state: string): Promise<IOAuthTokens>`，期望调用方从回调 URL 的 query 中拆出 `code` 和 `state`。
3. **并发 flow**：使用 SecretStorage 按 `state` 分键（`director-code.oauthState.<state>`），不同 flow 不同 key，可并存。无显式"单飞"锁。未完成 flow 的 state 会残留在 SecretStorage 直到回调或过期。
4. **Handler 注册完全缺失**：`agentEngine.contribution.ts` 中**没有** `IOAuthService` 的 `registerSingleton`，**没有** `IURLService.registerHandler`。全仓库除测试外**无生产代码调用** `handleCallback`。回调入口在集成层面**完全缺失**。
5. **VS Code 上游标准方式**：内部用 `IURLService.registerHandler(IURLHandler)` 注册 URI handler；handler 的 `handleURL(uri)` 在 `uri` 到达时被调用。扩展侧用 `vscode.window.registerUriHandler`，但 Director-Code 是内置能力，应走前者。

**决策**：

B1 实施时必须完成以下三项，否则 OAuth 流程无法闭环：

1. **修正 redirect_uri**：从 `vscode://director-code/auth/callback` 改为使用 `productService.urlProtocol` 动态构建（即 `${urlProtocol}://director-code/auth/callback`），确保与系统注册的协议 scheme 一致。
2. **注册 OAuthService 和 URI Handler**：
   - 在 `agentEngine.contribution.ts` 中 `registerSingleton(IOAuthService, OAuthService, InstantiationType.Delayed)`
   - 注册一个 `IURLHandler` 实现，匹配 path `/auth/callback`，从 URI query 解析 `code` 和 `state`，调用 `oauthService.handleCallback(code, state)`
3. **并发与过期清理**：
   - `startOAuthFlow` 对同一 provider 的并发调用加单飞锁（同 provider 同时只允许一个 flow）
   - 增加 `cleanupExpiredStates()` 在服务启动时和新 flow 启动时执行（清理超过 15 分钟的 state）

**归属批次**：B1

### 决策 D50：B3 messageNormalization 数据来源与改造策略（代码调研结论）

**调研发现**：

1. **当前导出函数**：
   - `requestToUserMessage(request: IChatAgentRequest): string` — 仅取 `request.message`
   - `historyToNormalizedMessages(history: IChatAgentHistoryEntry[]): NormalizedMessageParam[]` — 仅提取 markdown/text，**明确跳过** tool invocations
2. **history 数据来源**：`ChatServiceImpl.getHistoryEntriesFromModel` 使用 `toChatHistoryContent(response.value)` 构建 `history[].response`。`toChatHistoryContent` **过滤掉** `toolInvocation`、`toolInvocationSerialized`、`undoStop`。因此 agent 收到的 `history` **本来就不含** 工具调用块。
3. **AgentEngine.this.messages**：单次 `submitMessage` 运行过程中，`this.messages` 包含完整的 `tool_use` / `tool_result`。但**跨轮次（新一次 invoke / 新 AgentEngine）**，`initialMessages` 来自 `historyToNormalizedMessages`，**不含** 历史轮次的 tool 调用。
4. **获取完整 tool 历史的路径**：通过 `request.sessionResource` + `IChatService.getSession()` → `getRequests()` → 各 `response.entireResponse.value`（不经过 `toChatHistoryContent` 过滤），可以拿到含 `toolInvocation` 的完整 parts。`DirectorCodeAgent` **当前未注入** `IChatService`。

**决策**：

- **messageNormalization.ts 保持纯函数**，不引入 service 注入
- **改造路径**：在 `DirectorCodeAgent` 中注入 `IChatService`，在 `invoke()` 中通过 `chatService.getSession(request.sessionResource)` 获取 `IChatModel`，从各 response 的 `entireResponse.value` 中提取完整 tool 历史
- **函数签名扩展**：`historyToNormalizedMessages` 增加可选第二参数 `richResponses?: ReadonlyArray<ReadonlyArray<IChatProgressResponseContent>>`，传入从 `entireResponse.value` 获取的完整 parts 序列。当提供时，从中重建 `tool_use` 和 `tool_result`；不提供时保持向后兼容（纯文本提取）
- **不修改上游 `toChatHistoryContent`**（避免 rebase 风险）
- AgentEngine 内部（单次 submitMessage）的 `this.messages` 已经完整，不需要外部重建

**归属批次**：B3

### 决策 D51：B4 `extensionId = "director-code.core"` 安全性确认（代码调研结论）

**调研结论**：**安全，无未覆盖的崩溃路径。**

**详细发现**：

对 `vscode/src/` 内所有引用 `defaultChatAgent.extensionId` 的路径逐一检查：

| 文件 | 行号 | 扩展不存在时行为 |
|------|------|-----------------|
| `abstractExtensionManagementService.ts` | 942 | **安全**：仅 `areSameExtensions` 比较，不匹配则跳过 |
| `extensionsWorkbenchService.ts` | 2743 | **安全**：卸载时比较，虚构 id 不匹配则走普通路径 |
| `extensionGalleryService.ts` | 1166 | **安全**：搜索结果排序，查不到则不排序 |
| `extensionGalleryService.ts` | 2010-2013 | **语义风险**：无条件写入 deprecation，D26 已指向需删除 |
| `configurationRegistry.ts` | 1026 | **安全**：Set 中多一个不匹配的 id |
| `inlineCompletionsUnification.ts` | 72 | **安全**：id 列表中匹配不到则不触发 |
| `extensionEnablementService.ts` | 102 | **安全**：同上 |
| `defaultAccount.ts` | 92 | **安全**：preferredExtensions 多一个无效 id，无崩溃 |
| `chatGettingStarted.ts` | 46, 55 | **安全**：监听安装事件，虚构 id 永不触发 |
| `chatSetupProviders.ts` | 60, 719 | **安全**：719 找不到 agent 时静默原样返回 |

**D26 覆盖度**：D26 表格覆盖了所有关键的 chat/setup/gallery 路径。以下路径未在 D26 中列出但均为**安全**（仅做 id 比较、无 null 解引用风险）：`abstractExtensionManagementService.ts`、`extensionsWorkbenchService.ts`、`configurationRegistry.ts`、`inlineCompletionsUnification.ts`、`extensionEnablementService.ts`、`defaultAccount.ts`。

**注意事项**：`chatWidget.ts:990-991` 使用 `product.defaultChatAgent.provider` 和 `termsStatementUrl` **无 `?.`**，要求 `defaultChatAgent` 对象必须存在且 `provider` 字段完整——与 extensionId 无关，但 Director-Code 必须确保 `defaultChatAgent` 块配置完整。

**归属批次**：B4（确认性结论，无需额外改动）

### 决策 D52：D25/D39 chatExtensionId 空字符串安全性确认与附加处理（代码调研结论）

**调研结论**：**基本安全，但有 3 个需要额外处理的点。**

**核心安全性验证**：

1. **`ExtensionIdentifier.equals("", "Publisher.Name")` → `false`**（`equalsIgnoreCase` 先比较 `a.length === b.length`，长度不等直接返回 false）。**不存在** `startsWith("")` 匹配一切的风险。
2. 全仓库搜索确认：**未发现** 对 `chatExtensionId` 使用 `startsWith()` 或 `includes()` 的操作。
3. 大多数代码使用 truthy 检查 `if (chatExtensionId)`，`""` 为 falsy 会跳过相关逻辑——符合"无默认 chat 扩展"的语义。

**安全的引用点**（无需额外处理）：

| 位置 | 原因 |
|------|------|
| `languageModelToolsContribution.ts:260-304` | `""` falsy → 走 `chatParticipantPrivate` proposal 回退，内置工具仍标为 Internal |
| `extensionEnablementService.ts:103` | `filter(!!id)` 过滤掉 `""` |
| `inlineCompletionsUnification.ts:139` | `!_chatExtensionId` 为 true → unification 跳过 |
| `welcome.contribution.ts:146` | `""` falsy → welcome 不注册（符合预期） |
| `chatTipService.ts:808` | `""` falsy → 不走 Copilot 逻辑 |
| `modePickerActionItem.ts:306` | `""` falsy → 不视为内置 chat 扩展 |
| `promptsServiceUtils.ts:22` | `if (!chatExtensionId)` 提前返回 false |
| `chatParticipant.contribution.ts:340` | `equals(ext.id, "")` 永远 false |
| `configurationRegistry.ts:1026` | Set 中多一个 `""`，不影响真实 id 匹配 |

**需要额外处理的 3 个点**：

1. **`mainThreadLanguageModelTools.ts:124-126`（中等风险）**：
   - 问题：`""` falsy → `isBuiltinTool` 恒为 `false` 且无 proposal 回退，与 `languageModelToolsContribution.ts` 的行为**不对称**（contribution 侧走 proposal 标为 Internal，API 侧直接 false）
   - 处置：**B4 实施时在此处增加与 contribution 一致的 proposal 回退逻辑**——当 `chatExtensionId` 为 falsy 时，检查 `isProposedApiEnabled(extension, 'chatParticipantPrivate')`
   - **此为上游代码改动**，改动极小（3-5 行条件分支）

2. **`chatSetupContributions.ts:580/616/700`（已由 D26 覆盖）**：
   - `equals(ext, "")` 永远 false → 事件监听形同失效
   - `equalsIgnoreCase("", url.authority)` 可能匹配空 authority URI
   - D26 已标记这些路径需要"改为内置"或"禁用"，B4 实施时一并处理即可

3. **`extensionGalleryService.ts:2013`（已由 D26 覆盖）**：
   - 迁移目标 `chatExtensionId` 为 `""` 时元数据无效
   - D26 已标记"移除"该注入

**结论**：D25/D39 的 `chatExtensionId = ""` 策略**确认可行**，前提是 B4 实施时：
- 执行 D26 表格中的全部处置（setup/gallery 路径禁用/改写）
- 额外在 `mainThreadLanguageModelTools.ts:124-126` 补上 proposal 回退（D26 未覆盖的新发现）

**归属批次**：B4（D52 中的 `mainThreadLanguageModelTools` 修复补入 D26 处置清单）
