# Memory - 项目状态与上下文

## 项目基本信息
- **项目名**: Director-Code（开源 VS Code fork）
- **状态**: Phase 1 + 1.5 + 1.5+ 的代码与测试基线已基本完成；当前主线任务仍是 **Phase 1 收口修复**（以 `docs/director-code-remediation-plan-v2.md` 为执行基线），重点包括 OAuth 接入闭环、产品元数据去 Copilot 化、标准 Chat 与 Agent 通路统一。**未达到 Phase 1 对外发布门槛前，不视为可直接进入 Phase 2 默认开启 / 对外发布阶段**
- **目标**: 替换内置 Copilot AI Agent，支持用户自配 LLM + OAuth 登录
- **工作目录**: `/e/Projects/Director-Code/`
- **源码目录**: `/e/Projects/Director-Code/vscode/`
- **测试**: 479+ 个全部通过（A 批次新增测试后 486+，B1-2 后 432 个 agentEngine 测试全通过）
- **Git**: master 分支，已推送到 `github.com/daxijiu/Director-Code`

## Phase 1 收口修复进度（Batch A 完成 2026-04-30）

### Batch A: P0 安全边界与状态一致性 ✅ 全部完成
- **A1** ✅ `languageModelToolsService.ts` — `_resolveRequest()` helper 统一 request 绑定，替换 3 处 `.at(-1)`
- **A4a** ✅ `mcpSamplingService.ts` — `.has()` 改 `.get()===true`，Not Now 不再误判为已允许
- **A4b** ✅ `agentEngine.contribution.ts` — 删除 `_enableToolAutoApprove()`，回归 VS Code permissionLevel 机制
- **A3** ✅ `agentEngine.ts` — pendingTools Map 多工具聚合、JSON 重试、max_tokens 续写改进、compact 成功判定、slot 保序、thinking 过滤
- **A2** ✅ `agentEngine.ts` + `retry.ts` + `toolBridge.ts` + `directorCodeAgent.ts` — abortSignal 传递、try-finally + lastCompleteTurnEnd、cancellable sleep、CancellationToken 监听、cancelled 终态

### Batch B 进度（P1 认证链、模型链、历史上下文链与产品元数据）
- **B4-1** ✅ 根 `product.json` 整块新增 `defaultChatAgent`（30+ 字段）+ 4 个顶层字段 + `prepare_vscode.sh` stable 补 `dataFolderName` + L47/L49 三源对称兜底
- **B4-2** ✅ `builtInModeUtil.ts` 新建 + `chatSetupContributions.ts` setup 命令族 guard + growth session skip + checkExtensionInstallation guard
- **B4-3** ✅ `mainThreadLanguageModelTools.ts` isBuiltinTool 与 contribution 侧 proposal fallback 对齐
- **B4-4** ✅ `chatStatusEntry.ts` / `chatStatusDashboard.ts` / `chatStatusWidget.ts` / `chatUsageWidget.ts` / `chatQuotaExceededPart.ts` / `chatManagementEditor.ts` / `chatManagementEditorInput.ts` — status/quota/management UI guards (neutral icon+label, skip upgrade/quota/sign-in sections)
- **B4-5** ✅ chatGettingStarted + chatWidget + chatQuick + agentSessionsWelcome + chatSetupRunner 欢迎页/disclaimer guard
- **B4-6** ✅ agentSessions provider 描述替换 + agentTitleBarStatusWidget 状态 guard
- **B4-7** ✅ 全仓 grep 扫尾验证通过（残留均为 guard 保护的上游 rebase 友好型代码）
- **B4-core 完成** ✅ B4-0 ~ B4-7 全部就绪；下一步进入 B1+B2 并行
- **B1-0** ✅ 命名冻结：`AuthVariantName`/`FlowKind`/`ProviderAuth` 类型定义集中在 `providerTypes.ts`
- **B1-1** ✅ auth 契约升级：`ProviderOptions.apiKey` → `ProviderAuth` 显式结构；abstractProvider + 三家 Provider + apiKeyService + directorCodeAgent + directorCodeModelProvider + 12 个测试文件（116 处替换）全部对齐
- **B1-2** ✅ `oauthService.ts` 完全重写：统一 callback 模型 → provider-specific flow contracts（`pkce_manual` + `device_code`）；新接口 `startLogin/submitManualCode/pollLogin/getStatus/logout`；`handleCallback` 标记 `@deprecated` 并 throw；session 单飞锁 + TTL 清理 + `IOAuthStoredTokens`（含 `clientId`/`flowKind`）；63 个测试全通过
- **B1-3** ✅ IOAuthService + IModelResolverService 注册到 `agentEngine.contribution.ts` DI 容器
- **B1-4** ✅ Anthropic PKCE 真实端点 smoke 通过：`dev/smoke-anthropic-oauth.mjs` 完成浏览器授权 + token exchange，拿到 access/refresh token；Messages API 使用 OAuth bearer token 返回结构化 `429 rate_limit_error`（非 401），证明认证链与 Anthropic API 入口可用；自动化验证：transpile 0 errors，`oauthService.test.ts` + `anthropicProvider.test.ts` 共 84 tests passing
- **B1-5** ⏳ OpenAI transport spike 需手动验证 device code token 可用性
- **B1-6 ~ B1-9 / B2 / 原A5 / B3** ⏳ 待实施

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
Phase 1: Agent 核心 + Provider 替换 ✅ 完成 (Week 1-10, 358 测试)
Phase 1.5: 细节优化 ✅ 完成 (品牌修复 + Test Connection + 5 Provider + Settings UI 入口)

Phase 1.5+: OAuth + Provider 增强 ✅ 完成
  ✅ 阶段 1: Provider 基类抽象重构 (AbstractDirectorCodeProvider + ProviderCapabilities)
  ✅ 阶段 2: Per-Model 独立配置 (IModelConfig + resolveProviderOptions 三级 fallback)
  ✅ 阶段 3: 模型列表三层 Fallback (ModelResolverService: API → CDN → 静态)
  ✅ 阶段 4: OAuth 2.0 (OAuthService: PKCE + Token 存储/刷新 + Anthropic/OpenAI 配置)

Phase 2: ACP 协议扩展 (6-8 周，需在 Phase 1 收口门槛满足后默认开启 / 对外发布)
Phase 3: CLI 包装器 (4-5 周)
```

## 核心设计决策（必须记住）

1. **Agent 循环基于 open-agent-sdk QueryEngine（~400行）**，不用 copilot-chat ToolCallingLoop（1882行），因为后者强依赖 GitHub 基础设施
2. **消息格式内部用 Anthropic 格式**（NormalizedMessageParam），各 Provider 负责格式转换
3. **工具不重新实现**，通过 ToolBridge 桥接 VS Code 现有的 ILanguageModelToolsService（9 内置 + MCP）
4. **Agent 通过 registerDynamicAgent 注册**为 Chat Participant，不修改现有 Agent 注册体系
5. **Provider 全部使用 native fetch**，不引入 @anthropic-ai/sdk 等外部 npm 依赖（避免影响 VS Code 构建系统）
6. **密钥通过 IApiKeyService → ISecretStorageService 存储**，键名: `director-code.apiKey.<provider>`
7. **`vendor === 'copilot'` 在 languageModels.ts:631 硬编码为默认**，新 vendor 需处理此逻辑
8. **Phase 1 为 Phase 2 ACP 预留扩展点**：统一的 registerDynamicAgent + IChatProgress 输出
9. **Model Catalog 统一定义**在 `common/agentEngine/modelCatalog.ts`，消除重复
10. **IApiKeyService 作为 singleton 注册**，Agent 和 ModelProvider 都通过它读取密钥
11. **OAuth 路线已拍板为 Hermes-style provider-specific OAuth**：不做 BYO `clientId`；`anthropic` 用内置 public `clientId` + PKCE 手动粘 code，`openai` 用内置 public `clientId` + device code / 官方 public flow；Settings 按 provider 渲染登录 UI，不暴露通用 `clientId` 输入；OpenAI 的用户侧 OAuth 入口文案固定为 `OpenAI (ChatGPT/Codex OAuth)`

## 当前进度汇总

### 代码统计

| 阶段 | 生产代码 | 测试代码 | 测试数 |
|------|---------|---------|--------|
| Week 1: Engine 核心 | ~1,330 行 | ~670 行 | (在 chat/test 目录) |
| Week 2: Provider 层 | ~1,100 行 | ~1,200 行 | 73 |
| Week 3: 浏览器集成 | ~870 行 | ~270 行 | 17 |
| Week 4: Settings UI | ~1,030 行 | ~470 行 | 49 |
| Week 5: 集成测试 + Bug fix | ~15 行 | ~850 行 | 65 |
| Week 6: 端到端补全 | ~50 行 | ~250 行 | 20 |
| Week 7: E2E 实测 + UI | ~120 行 | ~470 行 | 45 |
| Week 8: 流式输出 | ~140 行 | ~100 行 | 9 |
| Week 9: 发布准备 | ~30 行 | ~60 行 | 2 |
| Week 10+: 细节优化 | ~120 行 | ~100 行 | 80 (新增) |
| Phase 1.5+ 阶段1: Provider 基类重构 | ~160 行 | ~230 行 | 27 (新增) |
| Phase 1.5+ 阶段2: Per-Model 配置 | ~120 行 | ~220 行 | 28 (新增) |
| Phase 1.5+ 阶段3: ModelResolver 三层 Fallback | ~280 行 | ~290 行 | 31 (新增) |
| Phase 1.5+ 阶段4: OAuth 2.0 服务 | ~310 行 | ~340 行 | 39 (新增) |
| **合计** | **~5,675 行** | **~5,520 行** | **479 (全通过)** |

### 已实现的文件清单

```
vscode/src/vs/workbench/contrib/chat/

common/agentEngine/                          # Engine 核心 (Week 1)
├── agentEngine.ts                           # 508 行 — Agentic 主循环
├── agentEngineTypes.ts                      # 189 行 — 类型定义
├── retry.ts                                 # 137 行 — 指数退避重试
├── tokens.ts                                # 141 行 — Token/成本计算
├── compact.ts                               # 198 行 — 上下文压缩
├── apiKeyService.ts                         # ~320 行 — API Key 管理服务 + Per-Model 配置 (Week 4 + Phase 1.5+)
├── modelCatalog.ts                          # ~80 行 — 统一模型目录 (Week 4 新增)
├── modelResolver.ts                         # ~280 行 — 三层 Fallback 模型解析器 [Phase 1.5+ 新增]
├── oauthService.ts                          # ~310 行 — OAuth 2.0 PKCE + Token 刷新 [Phase 1.5+ 新增]
└── providers/                               # Provider 层 (Week 2 + Phase 1.5+ 重构)
    ├── providerTypes.ts                     # ~140 行 — 接口 + 类型 + ProviderCapabilities
    ├── abstractProvider.ts                  # ~160 行 — 基类 (HTTP/SSE/capabilities) [Phase 1.5+ 新增]
    ├── anthropicProvider.ts                 # ~250 行 — Anthropic (extends AbstractDirectorCodeProvider)
    ├── openaiProvider.ts                    # ~330 行 — OpenAI (extends AbstractDirectorCodeProvider)
    ├── geminiProvider.ts                    # ~340 行 — Gemini (extends AbstractDirectorCodeProvider)
    └── providerFactory.ts                   # ~65 行 — 工厂 + re-export

browser/agentEngine/                         # 浏览器集成 (Week 3 + Week 4)
├── agentEngine.contribution.ts              # ~175 行 — 注册入口 (Week 4 大幅扩展)
├── directorCodeAgent.ts                     # ~180 行 — IChatAgentImplementation (Week 4 重构用 IApiKeyService)
├── directorCodeModelProvider.ts             # ~200 行 — ILanguageModelChatProvider (Week 4 重构用 modelCatalog)
├── toolBridge.ts                            # ~150 行 — IToolExecutor 桥接
├── progressBridge.ts                        # ~130 行 — AgentEvent → IChatProgress
├── messageNormalization.ts                  # ~85 行 — 消息格式转换
├── apiKeysWidget.ts                         # ~250 行 — API Key 管理 Widget (Week 4 新增)
├── providerSettingsWidget.ts                # ~200 行 — Provider 设置 Widget (Week 4 新增)
├── directorCodeSettingsEditor.ts            # ~180 行 — 设置 Editor + Input + Serializer (Week 4 新增)
└── media/
    └── directorCodeSettings.css             # ~230 行 — 设置页面样式 (Week 4 新增)

test/common/agentEngine/                     # 测试文件 (204 个测试)
├── retry.test.ts                            # Week 1 旧测试
├── tokens.test.ts                           # Week 1 旧测试
├── compact.test.ts                          # Week 1 旧测试
├── anthropicProvider.test.ts                # 19 测试 — 请求/响应/SSE/thinking/cache
├── openaiProvider.test.ts                   # 21 测试 — 格式转换/SSE/tool_calls
├── geminiProvider.test.ts                   # 26 测试 — functionCall/Response/thinking
├── providerFactory.test.ts                  # 6 测试 — 工厂路由/穷尽检查
├── progressBridge.test.ts                   # 11 测试 — 事件→进度转换
├── messageNormalization.test.ts             # 6 测试 — 消息双向转换
├── apiKeyService.test.ts                    # 24 测试 — CRUD/事件/连接测试 (Week 4)
├── apiKeysWidget.test.ts                    # 11 测试 — Service 集成逻辑 (Week 4)
├── providerSettingsWidget.test.ts           # 17 测试 — Model Catalog 逻辑 (Week 4)
├── agentRegistration.test.ts                # 12 测试 — 注册流集成测试 (Week 5 新增)
├── errorHandling.test.ts                    # 17 测试 — 错误处理集成测试 (Week 5 新增)
├── configFlow.test.ts                       # 17 测试 — 配置流集成测试 (Week 5 新增)
├── directorCodeModelProvider.test.ts        # 19 测试 — ModelProvider 逻辑测试 (Week 5 新增)
├── endToEnd.test.ts                         # 45 测试 — E2E 集成测试 (Week 7 新增)
├── abstractProvider.test.ts                 # 27 测试 — 基类/继承/SSE/capabilities [Phase 1.5+ 新增]
├── modelResolver.test.ts                    # 31 测试 — 三层 Fallback/缓存/事件 [Phase 1.5+ 新增]
└── oauthService.test.ts                     # 39 测试 — PKCE/授权流/Token/刷新/登出 [Phase 1.5+ 新增]
```

### Week 4 新增功能

1. **IApiKeyService** — 统一 API Key 管理服务
   - `getApiKey/setApiKey/deleteApiKey/hasApiKey`
   - `testConnection` — 最小请求验证 key 有效性
   - `onDidChangeApiKey` — 变更事件
   - 已注册为 singleton: `registerSingleton(IApiKeyService, ApiKeyService)`

2. **Settings Editor** — `DirectorCodeSettingsEditor`
   - Command: `director-code.openSettings` (F1 → "Director Code: Open Settings")
   - 上半部: Provider/Model/BaseURL/MaxTurns/MaxTokens 配置
   - 下半部: 三个 Provider 的 API Key 输入/测试/删除
   - 注册为 EditorPane + EditorSerializer

3. **Language Model Provider** — `DirectorCodeModelProvider` 已注册
   - `registerLanguageModelProvider('director-code', modelProvider)`
   - 模型出现在 VS Code 的 Chat 面板模型选择器中

4. **Model Catalog** — 统一到 `common/agentEngine/modelCatalog.ts`
   - 消除了 directorCodeModelProvider 和 providerSettingsWidget 的重复定义
   - 提供 `getModelsForProvider/getDefaultModel/findModelById` 工具函数

### Week 5 新增功能

1. **Vendor 注册修复** — `deltaLanguageModelChatProviderDescriptors` 在 `registerLanguageModelProvider` 之前调用
   - 修复了 `UNKNOWN vendor` 异常
   - 添加了 dispose 时反注册 vendor 的清理逻辑
   - 模型现在正确出现在 Chat 面板的 "Other Models" 区域

2. **集成测试** — 4 个新测试文件，65 个新测试
   - `agentRegistration.test.ts` — API Key → Provider → Model 完整流
   - `errorHandling.test.ts` — 错误分类、连接失败、HTTP 错误传播
   - `configFlow.test.ts` — Provider 切换、Base URL、多 Provider 独立性
   - `directorCodeModelProvider.test.ts` — 模型元数据、Token 估算、模型族

### 配置项（已注册）

| 配置键 | 默认值 | 说明 |
|--------|--------|------|
| `directorCode.ai.provider` | `anthropic` | LLM 提供商 (5 种: anthropic/openai/gemini/openai-compatible/anthropic-compatible) |
| `directorCode.ai.model` | `claude-sonnet-4-6` | 模型 ID（支持自定义输入） |
| `directorCode.ai.baseURL` | `""` | 自定义 API 地址（compatible provider 必填） |
| `directorCode.ai.maxTurns` | `25` | 每次请求最大 agentic 轮数 |
| `directorCode.ai.maxTokens` | `8192` | 每次 LLM 调用最大输出 token |
| `directorCode.ai.maxInputTokens` | `0` | 上下文窗口大小（0=使用模型默认） |

### 模型目录（内置 14 个，5 Provider）

| 模型 | Provider | ApiType |
|------|----------|---------|
| claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5 | Anthropic | anthropic-messages |
| gpt-4o, gpt-4o-mini, o3, o3-mini | OpenAI | openai-completions |
| gemini-2.5-pro, gemini-2.5-flash | Gemini | gemini-generative |
| deepseek-chat, deepseek-reasoner, qwen-plus, moonshot-v1-auto | OpenAI Compatible | openai-completions |
| (用户自定义模型 ID) | Anthropic Compatible | anthropic-messages |

## 构建与测试命令

```bash
# 编译（快速 transpile，~14s，推荐）
cd vscode && npm run gulp -- transpile-client-esbuild

# 运行指定测试文件
node test/unit/node/index.js --run "src/vs/workbench/contrib/chat/test/common/agentEngine/apiKeyService.test.ts"

# 运行全部 AgentEngine 测试（276 个，~5s）
node test/unit/node/index.js \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/apiKeyService.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/apiKeysWidget.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/providerSettingsWidget.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/anthropicProvider.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/openaiProvider.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/geminiProvider.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/providerFactory.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/progressBridge.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/messageNormalization.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/agentRegistration.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/errorHandling.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/configFlow.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/directorCodeModelProvider.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/agentEngine.test.ts" \
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/endToEnd.test.ts"
```

### Week 6 新增功能

1. **对话历史注入** — AgentEngine 构造函数新增 `initialMessages` 参数
   - `previousMessages` 现在正确传递给 engine
   - 多轮对话可以保持上下文

2. **工作目录修复** — `cwd` 从 `IWorkspaceContextService` 获取真实路径
   - 不再硬编码 `'.'`
   - 文件操作工具现在使用正确的工作区根路径

3. **ProgressBridge 防御性改进** — 处理 `content` 为 string 类型的情况

4. **AgentEngine 核心逻辑测试** — 20 个新测试
   - 初始消息格式、工具定义、Token 估算、Auto-Compact、重试逻辑

## 下一步计划：Phase 1d Week 9-10

### Week 8 完成总结

1. **流式输出改造** — AgentEngine 核心突破
   - 新增 `AgentTextDeltaEvent` / `AgentThinkingDeltaEvent` 事件类型
   - AgentEngine.submitMessage() 现在优先使用 `createMessageStream()`
   - 文本/思考 token 实时 yield 到 UI（用户不再等待完整响应）
   - 错误时自动回退到阻塞式 `createMessage()` + withRetry
   - 流式消费中累积完整 content blocks 用于工具检测

2. **ProgressBridge 扩展** — 处理 text_delta → markdownContent, thinking_delta → thinking
3. **9 个新测试** — 覆盖流式 delta 事件转换、混合流式序列模拟
4. **临时分析文件清理** — 删除 23 个根目录临时分析文档

5. **DeepSeek 实测验证通过** — 真实 API 端到端
   - Model Catalog 新增 deepseek-chat, deepseek-reasoner
   - OpenAI Provider 支持 `reasoning_content`（R1 思考链）
   - 非流式: 6.5s / 流式: 首 token 1.1s → **UX 大幅提升**
   - thinking + text 内容块正确分离

### Week 9: Phase 1 发布准备

1. **🔴 关键 Bug 修复**: 多工具流式响应丢失
   - 当 LLM 在一次回复中调用多个工具时，只有最后一个工具被保留
   - 重构为 finalize-before-start 模式：每个新 tool_use_start 先保存前一个工具
   - 新增 `finalizeToolBlock()` helper 方法

2. **发布审计通过**:
   - ✅ 构建系统: agentEngine 文件自动包含在 VS Code 构建中
   - ✅ 注册链路: chat.contribution.ts → agentEngine.contribution.ts → AfterRestored 阶段加载
   - ✅ 多工具流式 Bug 已修复并测试覆盖

### Week 10: Phase 1 收尾

1. **README.md 完全重写** — 从 VSCodium 旧内容替换为 Director-Code 完整介绍
   - 项目定位、功能特性、快速开始指南
   - 10 个支持模型列表（含 DeepSeek 使用示例）
   - 项目结构、开发指南、测试覆盖率
   - Roadmap (Phase 1 Done → Phase 2/3 Planned)

### 发布后修复 (2026-04-14)

1. **Chat Panel 不显示** — 三处联动修复
   - `chat.contribution.ts`: `chat.disableAIFeatures` 默认值恢复为 `false`
   - `agentEngine.contribution.ts`: Director-Code Agent 设为 `isDefault: true`
   - `chatAgents.ts`: `registerDynamicAgent()` 添加 `_updateContextKeys()` 调用
   - 根因: disable-copilot.patch 的 AND 条件 + 缺少 context key 更新

2. **默认中文语言** — `src/main.ts` argv.json 模板添加 `"locale": "zh-cn"`
   - 首次启动自动生成含 locale 设置的 argv.json
   - 语言包通过 VS Code 内置机制从 Open VSX 自动下载

3. **安装包生成** — 构建命令: `npm run gulp -- "vscode-win32-x64-user-setup"`
   - 使用 Inno Setup 生成 setup.exe
   - 输出: `.build/win32-x64/user-setup/DirectorCodeSetup-1.112.0.exe`
   - 注意: 需要 GitHub 网络通畅（Electron 下载）

## Phase 1 完成总结

### 关键指标
- **生产代码**: ~4,685 行
- **测试代码**: ~4,340 行
- **测试数量**: 278 个（全部通过）
- **支持模型**: 10 个（3 Provider + DeepSeek 兼容）
- **真实 API 验证**: DeepSeek Reasoner (R1) 流式 + 思考链

### Phase 1 交付物
1. Agent Engine — 基于 open-agent-sdk 的 Agentic 循环 + 流式输出
2. 3 个 LLM Provider — Anthropic/OpenAI/Gemini + DeepSeek 兼容
3. 工具桥接 — VS Code 9 内置工具 + MCP 工具
4. Settings UI — Provider/Model/API Key 配置界面
5. 模型选择器 — Chat 面板模型列表 + picker 联动
6. 流式输出 — text_delta/thinking_delta 实时传输
7. 错误恢复 — retry/compact/prompt-too-long 自动恢复
8. 成本追踪 — 17 模型定价 + 实时 Token 计费

### 全量编译验证

**最新品牌构建 (2026-04-14)**:
1. `prepare_vscode.sh` — 品牌 + patches 全部应用（Director-Code 品牌 + telemetry 去除 + disable-copilot + open-vsx gallery）
2. `compile-build-without-mangling` — 0 errors (严格 TS 编译)
3. `compile-extension-media` — 0 errors
4. `compile-extensions-build` — 0 errors
5. `minify-vscode` — 完成
6. `vscode-win32-x64-min-ci` — 完成

**构建产物**: `VSCode-win32-x64/Director-Code.exe` — 800MB
**品牌**: 完整 Director-Code 品牌（nameShort/nameLong/applicationName/win32DirName 全部正确）
**AgentEngine**: 已包含在 workbench.desktop.main.js minified bundle 中

**构建流程（可复现）**:
```bash
# 0. 环境准备（只需做一次）
# GITHUB_TOKEN 已通过 setx 永久保存到 Windows 用户环境变量
# 新终端自动生效，5000 次/小时 GitHub API 限额
# （token 值不记录在代码仓库中，通过 setx GITHUB_TOKEN "ghp_xxx" 设置）

# 1. 品牌 + patches（需设置环境变量）
export APP_NAME="Director-Code" ASSETS_REPOSITORY="daxijiu/Director-Code" BINARY_NAME="director-code" GH_REPO_PATH="daxijiu/Director-Code" ORG_NAME="Director-Code" VSCODE_QUALITY="stable" RELEASE_VERSION="1.112.0" OS_NAME="windows" CI_BUILD="no" DISABLE_UPDATE="no"
bash prepare_vscode.sh

# 2. 在 vscode/ 子目录中恢复 AgentEngine 文件（如果是 stash/branch）
cd vscode

# 3. 编译
npm run gulp -- compile-build-without-mangling
npm run gulp -- compile-extension-media
npm run gulp -- compile-extensions-build
npm run gulp -- minify-vscode

# 4. 打包（需设置 ELECTRON_CACHE_OVERRIDE，见下方说明）
export ELECTRON_CACHE_OVERRIDE="/e/Projects/Director-Code/.electron-cache"
npm run gulp -- "vscode-win32-x64-min-ci"

# 5. 生成安装包
npm run gulp -- "vscode-win32-x64-inno-updater"
npm run gulp -- "vscode-win32-x64-user-setup"    # 用户级安装包
npm run gulp -- "vscode-win32-x64-system-setup"  # 系统级安装包
```

**注意**: 
- `prepare_vscode.sh` 会执行 `npm ci`（重装依赖），耗时较长
- GitHub API 有 rate limit (60/hour)，builtInExtensions 下载可能失败，需设置 GITHUB_TOKEN
- VisualElementsManifest.xml 源模板已修复为 Director-Code

### ⚠️ Node.js 网络问题（公司内网必读）

**根因**: 公司网络（腾讯内网）安全软件拦截 Node.js 的 OpenSSL TLS 握手，但允许 Windows 原生 TLS（curl/PowerShell/浏览器/git schannel）。表现为 Node.js 访问 GitHub 时报 `Client network socket disconnected before secure TLS connection was established`。

**影响**: 
- `npm install` / `npm ci` 可能失败
- `vscode-win32-x64-min-ci` 打包步骤下载 Electron 失败
- `compile-extensions-build` 下载 builtInExtensions 失败

**解决方案 — Electron 本地缓存**:
1. 用 PowerShell 预下载 Electron（走 Windows 原生 TLS）:
   ```powershell
   Invoke-WebRequest -Uri "https://github.com/electron/electron/releases/download/v39.8.0/electron-v39.8.0-win32-x64.zip" -OutFile "E:\Projects\Director-Code\.electron-cache\electron-v39.8.0-win32-x64.zip" -UseBasicParsing
   ```
2. 已 patch `node_modules/@vscode/gulp-electron/src/download.js`，添加 `ELECTRON_CACHE_OVERRIDE` 环境变量支持
3. 构建时设置: `export ELECTRON_CACHE_OVERRIDE="/e/Projects/Director-Code/.electron-cache"`
4. Patch 逻辑: download() 函数开头检查 `ELECTRON_CACHE_OVERRIDE` 目录下是否有匹配的 zip 文件，有则直接返回本地路径

**解决方案 — builtInExtensions 下载失败**:
- 直接跳过 `compile-extensions-build` 步骤（不运行即可，不影响 minify 和打包）
- ⚠️ **绝对不要用 Python json.dump 重写 product.json**！会改变 JSON 格式导致 NLS 消息映射错乱
- 这 3 个 debug 扩展（js-debug 等）非核心功能，缺失不影响 Agent

### ⚠️ 构建后必做清理（避免 NLS 缓存污染）

每次构建新版本后，**必须清理 NLS 缓存**，否则旧缓存的消息数量与新代码不匹配会导致白屏（`NLS MISSING` 错误）：

```powershell
# 构建完成后执行
Remove-Item -Recurse -Force "$env:APPDATA\Director-Code\clp" -ErrorAction SilentlyContinue
```

**根因**: VS Code 会将中文 NLS 消息缓存到 `%APPDATA%\Director-Code\clp\` 目录。新构建如果新增了 NLS 字符串（如我们的 Phase 1.5+ 代码），缓存的旧版本消息条数不够，运行时索引越界导致白屏崩溃。清理后首次启动会重新生成缓存。

### Phase 1 细节优化 (2026-04-14)

1. **Test Connection 修复** — 修复了使用自定义 baseURL 时 Test Connection 失败的 Bug
   - `apiKeysWidget` 现在从配置读取 `baseURL` 和 `model` 传给 `testConnection`
   - `_testOpenAI` URL 拼接对齐 `OpenAIProvider`（避免 `/v1` 重复）
   - `testConnection` 接口扩展支持 `model` 参数

2. **品牌残留清理** — 修复更新报错和 VSCodium 残留
   - 移除 `product.json` 中指向 VSCodium 的 `updateUrl`（禁用自动更新）
   - `VisualElementsManifest.xml` ShortDisplayName → Director-Code
   - `prepare_vscode.sh` 不再注入 VSCodium updateUrl
   - Linux `.desktop` / `.appdata.xml` 文案更新为 Director-Code

3. **Settings UI 入口增强**
   - Chat 面板齿轮菜单新增 "Director Code AI Settings" 入口
   - 设置面板新增 "Director Code AI" 顶级分类（与"聊天"同级）
   - 包含 Provider/Advanced 两个子分类

4. **Provider 体系重构** — 从 3 Provider 扩展到 5 Provider
   - 新增 `openai-compatible`（DeepSeek, Groq, Together AI, Moonshot, Qwen...）
   - 新增 `anthropic-compatible`（兼容 Anthropic API 的第三方服务）
   - 模型目录更新：14 个内置模型（含 o3-mini, qwen-plus, moonshot）
   - 支持用户自定义模型 ID 输入（compatible provider 显示文本输入框）
   - `directorCodeModelProvider` 支持自定义模型的 Chat 面板展示

5. **上下文长度配置** — 新增 `directorCode.ai.maxInputTokens`
   - 0 = 使用模型默认上下文窗口
   - 非零值覆盖 auto-compact 触发阈值

6. **OAuth/订阅预留** — 接口设计 + UI 占位
   - `AuthMethod` 类型：`'api-key' | 'oauth' | 'none'`
   - Settings Editor 底部 "Subscription & Login" 占位区域
   - 完整 OAuth 流程留到后续实现

**测试**: 358 个全部通过（从 278 增加到 358，+80 个）

### 当前阶段: OAuth + Provider 增强

**参考项目分析已完成**，关键参考来源：
- **vscode-copilot-chat**: BYOK 体系 (8 vendor、Provider 基类 `AbstractLanguageModelChatProvider`、per-model SecretStorage `copilot-byok-${provider}-${modelId}-api-key`、CDN 模型列表 `fetchKnownModelList`)
- **free-code**: OAuth 2.0 完整流程 (`oauth.ts` 含 Anthropic + OpenAI 配置、`jwtUtils.ts` Token 刷新调度器、`auth.ts` 7 种认证源)

**四阶段实施计划与进度：**
1. **Provider 基类抽象** ✅ 完成 — `AbstractDirectorCodeProvider` 基类，3 个 Provider 改为继承，`ProviderCapabilities` + `ProviderConfig` 类型，公共 HTTP 错误处理 + SSE 基础设施，27 个新测试
2. **Per-Model 配置** ✅ 完成 — `IModelConfig` 类型 + `IResolvedProviderOptions`，per-model API Key/baseURL/capabilities，三级 fallback (`resolveProviderOptions`)，Agent 已切换到 per-model 解析，28 个新测试
3. **模型列表三层 Fallback** ✅ 完成 — `ModelResolverService`: Provider API (OpenAI/Gemini GET models) → CDN JSON → 静态 `MODEL_CATALOG`，内存缓存 + TTL，31 个新测试
4. **OAuth 2.0** ✅ 完成 — `OAuthService`: PKCE 授权流 (S256)，Anthropic + OpenAI 配置，Token 存储/刷新/登出，state 验证 + 15min 过期，39 个新测试

**收口决策更新（2026-04-17）**：
- 不再继续推进 “BYO `clientId` + 统一 callback OAuth” 路线
- 收口计划已改为 **Hermes-style provider-specific OAuth**：
  - `anthropic`：PKCE + 手动粘 code
  - `openai`：device code / 官方 public flow
  - `gemini` / compatible providers：继续 API key only
- `directorCodeSettingsEditor.ts` 后续要从 `Coming Soon` 占位改为 provider-specific 登录 UI，不新增面向终端用户的通用 `clientId` 输入
- OpenAI 的用户侧 OAuth 入口文案固定为 `OpenAI (ChatGPT/Codex OAuth)`，避免与 `api.openai.com` 的 API-key 路径混淆
- `docs/director-code-remediation-plan-v2.md` 的 B1/C2 已补齐 Hermes 参考实现路径（`web_server.py` / `OAuthLoginModal.tsx` / `anthropic_adapter.py` / `auth.py` / `auth_commands.py`）和 Director-Code 对照映射，后续执行无需依赖当前聊天上下文
- 新增两条执行提醒：① OpenAI OAuth 参考实际上是 `openai-codex`/ChatGPT transport，不能把 device-code token 直接塞进现有 `api.openai.com` provider；② Settings 里的 API key `testConnection()` 与 OAuth 状态检查必须分开，UI 要同时订阅 `onDidChangeApiKey` 和 `onDidChangeAuth`
- `docs/director-code-remediation-plan-v2.md` 的 `B1` 现已进一步拆成文件级执行 checklist（B1-0 ~ B1-9），后续实现可按 checklist 顺序推进，不必再从聊天记录反推实施顺序
- `docs/director-code-remediation-plan-v2.md` 的 `B2` 现也已拆成文件级执行 checklist（B2-0 ~ B2-8），重点冻结 cache 维度（`provider + normalizedBaseURL + authIdentityKey + authVariant`）、resolver 签名扩展、OpenAI OAuth/codex 独立 bucket，以及标准 Chat / Agent 共用同一模型解析口径
- `docs/director-code-remediation-plan-v2.md` 的 `原 A5` 现也已拆成文件级执行 checklist（A5-0 ~ A5-9），重点是把 `directorCodeModelProvider.ts` 从“直接读 `MODEL_CATALOG` + `getApiKey()`”迁到与 Agent 通路一致的 `resolveProviderOptions()` + `ModelResolver` + `authVariant` 口径
- `docs/director-code-remediation-plan-v2.md` 的 `C2` 现也已拆成文件级执行 checklist（C2-0 ~ C2-9），重点是把 Settings/UI 从“API key-only 页面 + OAuth 占位”升级成同时消费 `IConfigurationService` / `IApiKeyService` / `IOAuthService` 的真实状态页，并把 API key 测试与 OAuth 状态检查彻底分开
- `docs/director-code-remediation-plan-v2.md` 的 `C1` 现也已拆成 `C1a/C1b` 文件级执行 checklist，重点是：`abstractProvider.ts` 统一承接 SSE 尾包 flush / buffer 保护 / URL helper，`openaiProvider.ts` 收口 vision / `max_completion_tokens` / `stream_options.include_usage`，`geminiProvider.ts` 收口稳定 tool id 与 error chunk 处理，`apiKeyService.testConnection()` 与真实 provider URL 规则保持一致
- `docs/director-code-remediation-plan-v2.md` 的 `B3` 现也已拆成文件级执行 checklist（B3-0 ~ B3-8），重点是：`directorCodeAgent.ts` 注入 `IChatService` 获取 `richResponses`，`messageNormalization.ts` 从纯文本回放升级成 `history + richResponses` 的结构化回放，`progressBridge.ts` 处理非流式正文补偿，`directorCodeModelProvider.ts` 保留 image / tool 相关的最小 rich 语义
- `docs/director-code-remediation-plan-v2.md` 的 `C4` 现也已拆成文件级执行 checklist（C4-0 ~ C4-10），重点是：统一 `tokens.ts` / `compact.ts` / `modelCatalog.ts` / `modelResolver.ts` 的数据边界，给 compact 增加成功判定和专用模型选择链，处理 unknown metadata / binary tool_result / auxiliary model fallback，并移除用户可见辅助功能对 `copilot-fast` 的假设
- `docs/director-code-remediation-plan-v2.md` 的 `C3` 现也已拆成文件级执行 checklist（C3-0 ~ C3-6），重点是：`directorCodeModelProvider.ts` 纳入 `Disposable`，`registerDynamicAgent()` 支持重复 ID 热重载安全重注册，`mcpAddContextContribution.ts` 的 capability 显隐链收口，以及 `mcpLanguageModelToolContribution.ts` 的 `resource_link` 图片读取失败语义从“空成功”改为显式错误/回退
- `docs/director-code-remediation-plan-v2.md` 的 `C5` 现也已拆成文件级执行 checklist（C5-0 ~ C5-6），重点是：`prepare_vscode.sh` 建立统一 `cleanup + trap` 框架，失败路径恢复 `.npmrc` / 清理 `.bak`，并给 `build.sh` / 构建入口增加 `DIRECTOR_CODE_SKIP_EXTENSIONS_BUILD=1` 分支
- `docs/director-code-remediation-plan-v2.md` 的 `B4` 现也已拆成文件级执行 checklist（B4-0 ~ B4-8），重点是：先统一根 `product.json` 与 `prepare_vscode.sh` 的产品元数据真相，再收口 setup 命令族、builtin tool/source 判定、状态类 UI、disclaimer/getting started、Agent Sessions/model picker 边缘触点，最后用全仓 grep + 手动 smoke 做品牌/去 Copilot 化闭环验证
- `docs/director-code-remediation-plan-v2.md` 的 `A1~A4` 现也已补成文件级执行 checklist：`A1` 统一 request 绑定解析；`A2` 统一取消契约、toolBridge 取消、retry 可取消 sleep；`A3` 收口多工具流式聚合、JSON 重试、`max_tokens` 截断和保序；`A4` 收口 MCP Sampling 的 `Not Now` 语义并删除 `_enableToolAutoApprove`
- `docs/director-code-remediation-plan-v2.md` 的 `D1~D4` 现也已拆成文件级执行 checklist：`D1` 统一 Gemini key 的 header/query 开关与兼容性验证；`D2` 收口密钥输入的 autofill 与 DOM 停留时间；`D3` 抽服务层通用 fetch helper；`D4` 审计 `DirectorCodeSettingsEditor.ts` 的生命周期与重入边界
- 已做一轮最终交叉一致性审查：补平了 `B1` vs `C2` 的 OAuth widget/controller 归属、`B4` vs `C4` 的 model picker/CTA 归属、`OpenAI (GPT-4, o3)`（API key 区域） vs `OpenAI (ChatGPT/Codex OAuth)`（OAuth 区域）的文案边界，并把 `C3/C4/D3/D4` 回归项补进文末总测试清单
- 交叉审查后的最终收口结论：① OpenAI OAuth 内部 transport/authVariant 命名固定为 `openai-codex`，不再保留 `openai-chatgpt` / `openai-oauth` 备选名；② `getProviderAuthMethod()` 纯 helper 直接删除，不再保留“二选一”口径；③ `directorCode.ai.compactModel` 必须同时落到配置注册和 Settings UI，不能只存在于 `compact.ts` 内部逻辑
- 用户已追加拍板：fixed public `clientId` 来源选择 **C**，当前轮次直接复刻 Hermes 的 public `clientId` / flow 实现，不再把“项目自注册 app”作为前置
- 用户已追加拍板：OpenAI OAuth fallback 选择 **B**，允许先完成其他明确项后再回收 `B1-5/B1-6`，但若最终 transport / smoke 不稳定，则继续阻塞 Phase 1 对外发布
- `.cursor/plan-04-phase2-acp.md` 的 Gemini CLI 示例包名已修正为 `@google/gemini-cli@latest`
- 最新复审又补齐了 `B1-core` vs `B1-ship` 的口径：Phase 1 对外发布门槛要求 **B1-ship**，即必须包含 OpenAI `B1-5~B1-9` 与 codex backend smoke，不能只完成 Anthropic + 注入链
- 最新复审补齐了三条容易返工的边界：① `B2-1` 起依赖 `authIdentityKey` / `authVariant` 的实现必须晚于 `B1-2/B1-3` 最小输出；② `B1-7` 只产出 OAuth widget/controller 内核，`C2-4` 负责最终 editor 编排；③ `C4-8` 在 `chatModelPicker` 等文件上只能补逻辑/降级，不得回改 `B4` 已定的产品级 CTA/文案
- `.cursor/plan-04-phase2-acp.md` 的 Phase 1 示例 agent id 已从 `director-code-agent` 对齐为代码真实值 `director-code`
- 最新复审又补了 4 个收口点：① `B1` 的“实现顺序”与 `B1-0~B1-9` checklist 已对齐，并明确 checklist 为唯一执行顺序；② `authVariant` 残留旧词 `chatgpt-codex` 已统一到 `openai-codex`；③ 测试清单已显式标明 `D3/D4` 为非发布门禁；④ `plan-04-phase2-acp.md` 顶部已补充“默认开启 / 对外发布级实现仍需满足 remediation 的 `B4 + B1-ship`”

### 工具调用卡住修复 (2026-04-15)

**根因**: `createAndRunTask` 等需要确认的工具，VS Code 的 `invokeTool` 会等待 `awaitConfirmation`，但确认 UI 对动态注册的 Agent 不渲染，导致无限卡住。

**修复**:
1. **Auto-approve**: `agentEngine.contribution.ts` 初始化时自动设置 `chat.tools.global.autoApprove = true`（用户未显式配置时）
2. **Timeout 兜底**: `toolBridge.ts` 添加 120 秒超时，防止工具永久挂起
3. **CancellationError 处理**: 捕获 CancellationError 返回友好错误信息而非让 Agent 崩溃

### 竞品 Review 报告更新 (2026-04-15)

- 当前总报告: `docs/director-code-review by GPT5.4-2026-04-15.md`
- 说明: 旧报告 `docs/director-code-review-report-2026-04-15.md` 已被其他 agent 改动，不再作为本轮整理后的权威版本
- 新总报告已合并前序广审、第一轮分模块深审、第二轮分模块深审全部内容
- 当前结论聚焦于三层脱节：`状态机层`、`协议层`、`配置层`

### 全量 Review 完成 (2026-04-15)

- 本轮从 Phase 1 启动开始，对 Director-Code 改造面与直接耦合代码完成了独立全量复审
- 当前权威总报告: `docs/director-code-full-review-by-GPT5.4-2026-04-15.md`
- 报告累计记录 `57` 个问题：`10` 个严重、`28` 个高、`19` 个中
- 最高优先级风险集中在四条链路：MCP sampling / tool auto-approve 安全边界、`chatRequestId` / request 绑定错位、OAuth `clientId` / state 生命周期不一致、`product.defaultChatAgent` 与 `dataFolderName` 仍残留 Copilot / `.vscode-oss` 元数据
- 下一阶段如果进入 Phase 2 ACP，建议先按报告中的高优先级顺序做收口修复，再继续扩展接入面

### 后续: Phase 2 ACP 协议扩展
- 参考 MCP 模式 + vscode-acp 实现
- 每个外部 ACP Agent 通过 registerDynamicAgent 注册
- 详细计划见 `.cursor/plan-04-phase2-acp.md`

## 编码规范提醒

- 所有 import 以 `.js` 结尾
- 接口属性用 `readonly`
- 文件头用 `Director-Code Contributors` 版权
- **Bash 命令只用双引号，禁止单引号**（Git Bash 兼容性）
- 优先用 Glob/Grep/Read 工具代替 find/grep/cat
- **每个模块写完必须写测试并运行通过**
- 测试框架: Mocha TDD (`suite`/`test`)，assert 模块，`ensureNoDisposablesAreLeakedInTestSuite()`
- 路径深度: browser/agentEngine/ 到 base/ = `../../../../../base/common/`
- 路径深度: common/agentEngine/ 到 base/ = `../../../../../../base/common/`（6 级）
