# Memory - 项目状态与上下文

## 项目基本信息
- **项目名**: Director-Code（开源 VS Code fork）
- **状态**: Phase 1b Week 5 完成，进入 Week 6-7（配置 UI 精化 + 端到端实测）
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
  1a. Week 1: Agent 引擎核心 ✅ 完成 (2,004 行)
  1a. Week 2: Provider 层 ✅ 完成 (1,100 行, 73 测试)
  1a. Week 3: 浏览器集成层 ✅ 完成 (870 行, 17 测试)
  1b. Week 4: Settings UI + API Key 管理 ✅ 完成 (1,030 行, 49 测试)
  1b. Week 5: 模型选择器集成 + 集成测试 ✅ 完成 (Bug fix + 65 新测试)
  1c. Week 6-7: 配置 UI 精化 + 端到端实测 ← 下一步
  1d. Week 8-10: 集成测试 + Phase 1 发布

Phase 2: ACP 协议扩展 (6-8 周)
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

## 当前进度汇总

### 代码统计

| 阶段 | 生产代码 | 测试代码 | 测试数 |
|------|---------|---------|--------|
| Week 1: Engine 核心 | ~1,330 行 | ~670 行 | (在 chat/test 目录) |
| Week 2: Provider 层 | ~1,100 行 | ~1,200 行 | 73 |
| Week 3: 浏览器集成 | ~870 行 | ~270 行 | 17 |
| Week 4: Settings UI | ~1,030 行 | ~470 行 | 49 |
| Week 5: 集成测试 + Bug fix | ~15 行 | ~850 行 | 65 |
| **合计** | **~4,345 行** | **~3,460 行** | **204 (全通过)** |

### 已实现的文件清单

```
vscode/src/vs/workbench/contrib/chat/

common/agentEngine/                          # Engine 核心 (Week 1)
├── agentEngine.ts                           # 508 行 — Agentic 主循环
├── agentEngineTypes.ts                      # 189 行 — 类型定义
├── retry.ts                                 # 137 行 — 指数退避重试
├── tokens.ts                                # 141 行 — Token/成本计算
├── compact.ts                               # 198 行 — 上下文压缩
├── apiKeyService.ts                         # ~200 行 — API Key 管理服务 (Week 4 新增)
├── modelCatalog.ts                          # ~80 行 — 统一模型目录 (Week 4 新增)
└── providers/                               # Provider 层 (Week 2)
    ├── providerTypes.ts                     # 123 行 — 接口 + 类型
    ├── anthropicProvider.ts                 # ~260 行 — Anthropic (native fetch + SSE)
    ├── openaiProvider.ts                    # ~340 行 — OpenAI (native fetch + SSE)
    ├── geminiProvider.ts                    # ~350 行 — Gemini (native fetch + SSE)
    └── providerFactory.ts                   # ~55 行 — 工厂 + re-export

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
└── directorCodeModelProvider.test.ts        # 19 测试 — ModelProvider 逻辑测试 (Week 5 新增)
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
| `directorCode.ai.provider` | `anthropic` | LLM 提供商 (anthropic/openai/gemini) |
| `directorCode.ai.model` | `claude-sonnet-4-6` | 模型 ID |
| `directorCode.ai.baseURL` | `""` | 自定义 API 地址（兼容 DeepSeek 等） |
| `directorCode.ai.maxTurns` | `25` | 每次请求最大 agentic 轮数 |
| `directorCode.ai.maxTokens` | `8192` | 每次 LLM 调用最大输出 token |

### 模型目录（内置 8 个）

| 模型 | Provider | ApiType |
|------|----------|---------|
| claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5 | Anthropic | anthropic-messages |
| gpt-4o, gpt-4o-mini, o3 | OpenAI | openai-completions |
| gemini-2.5-pro, gemini-2.5-flash | Gemini | gemini-generative |

## 构建与测试命令

```bash
# 编译（快速 transpile，~14s，推荐）
cd vscode && npm run gulp -- transpile-client-esbuild

# 运行指定测试文件
node test/unit/node/index.js --run "src/vs/workbench/contrib/chat/test/common/agentEngine/apiKeyService.test.ts"

# 运行全部 AgentEngine 测试（204 个，~4s）
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
  --run "src/vs/workbench/contrib/chat/test/common/agentEngine/directorCodeModelProvider.test.ts"
```

## 下一步计划：Phase 1c Week 6-7

### Week 6-7: 配置 UI 精化 + 端到端实测

1. **端到端实测** — 使用真实 API Key 验证完整流程
   - 构建并运行 Director-Code，打开 Chat 面板
   - 设置 API Key（F1 → Director Code: Open Settings）
   - 发送消息验证 Agent 响应
   - 验证模型选择器中 Director Code 模型可见
2. **UI 交互优化** — 根据实测发现的 UX 问题改进
   - Settings Editor 布局调整
   - 错误提示文案优化
   - 加载状态/动画
3. **模型选择器增强** — 确认模型在 Chat 面板正确显示和切换
4. **错误恢复** — API 调用中断后的自动恢复机制

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
