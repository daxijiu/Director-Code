# CLAUDE.md - 项目指引

> **重要**: 每次对话开始时，必须先读取 `.claude/memory.md` 获取项目最新状态和进度。

## 项目概述

这是一个开源 VS Code 构建（fork），品牌名为 Director-Code。已可成功编译并发布安装包。

**当前状态**: Phase 1 已完成（Agent 核心 + Provider + Settings UI），Phase 1.5 细节优化已完成（品牌修复 + Test Connection + Provider 扩展到 5 个 + Settings UI 入口），正在进行 **OAuth 2.0 + Provider 体系全面增强**。

源码主体在 `vscode/` 子目录下。

## 构建命令

```bash
# 安装依赖
cd vscode && npm install

# 开发模式
npm run watch        # 增量编译
npm run watch-client # 仅客户端

# 完整构建 (Windows)
./build.sh           # 构建脚本
# 构建产物在 VSCode-win32-x64/
```

## 关键目录结构

```
/e/Projects/Director-Code/
├── vscode/                                 # VS Code 源码主体
│   ├── src/vs/workbench/contrib/chat/      # AI Chat 核心 (534+ 文件)
│   │   ├── common/
│   │   │   ├── participants/chatAgents.ts  # Agent 注册中心
│   │   │   ├── languageModels.ts           # 语言模型服务 (ILanguageModelChatProvider L263)
│   │   │   ├── chatService/chatService.ts  # Chat 编排器
│   │   │   └── tools/                      # 工具系统 (9 个内置工具)
│   │   └── browser/
│   │       ├── agentSessions/              # Agent 会话 UI
│   │       ├── chatEditing/                # 多文件编辑
│   │       └── chatManagement/             # 模型管理 UI (ModelsManagementEditor)
│   ├── src/vs/workbench/contrib/mcp/       # MCP 协议集成
│   └── src/vs/platform/secrets/            # SecretStorage (API Key 存储)
├── sub-projects/                           # 参考项目
│   ├── Claudable/                          # CLI Agent 桌面包装 (Phase 3 spawn+readline 参考)
│   ├── free-code/                          # Claude Code 重构版 (OAuth 2.0 + 认证体系参考)
│   ├── open-agent-sdk-typescript/          # Agent SDK (已移植: Provider+Engine 核心)
│   ├── vscode-acp/                         # ACP 协议 VS Code 扩展 (Phase 2 参考)
│   └── vscode-copilot-chat/               # Copilot Chat 源码 (BYOK Provider + Model 管理参考)
├── .cursor/                                # 实施计划文档 (唯一权威来源)
└── .claude/memory.md                       # 项目状态与进度记忆 (每次会话必读)
```

## 实施计划

### 计划文档位置

| 文档 | 内容 |
|------|------|
| `.cursor/plan-01-roadmap.md` | **总体路线图**: Phase 1→2→3、架构设计、选型总表、里程碑 |
| `.cursor/plan-02-agent-core.md` | **Agent 核心改造**: 三方选型矩阵、AgentEngine 设计、移植文件清单 |
| `.cursor/plan-03-provider-settings.md` | **Provider 与设置**: 双层架构、流式 Provider、密钥管理 |
| `.cursor/plan-04-phase2-acp.md` | **Phase 2 ACP**: 协议层设计、参考 MCP+vscode-acp |
| `.cursor/plan-05-phase3-cli.md` | **Phase 3 CLI**: 适配器框架、输出解析、外部编辑集成 |
| `.cursor/copilot-chat-extension-analysis.md` | **Copilot Chat 源码分析**: ToolCallingLoop、BYOK、Provider 层 |
| `.cursor/plans/phase_1_细节优化*.plan.md` | **Phase 1.5 细节优化计划**: 品牌修复、Test Connection、Provider 扩展 (已完成) |

### 实施路线

```
Phase 1: Agent 核心 + Provider 替换 ✅ 完成 (Week 1-10)
  Agent 引擎、3+2 Provider、Settings UI、流式输出、358 个测试

Phase 1.5: 细节优化 ✅ 完成
  品牌残留清理、Test Connection 修复、Provider 扩展到 5 个
  Settings UI 入口增强、上下文长度配置、OAuth 预留

Phase 1.5+: OAuth + Provider 增强 ← 当前阶段
  ✅ Provider 基类抽象重构 (AbstractDirectorCodeProvider + ProviderCapabilities)
  Per-model 独立配置 (API Key / Base URL / 能力标记)
  模型列表三层 Fallback (Provider API → CDN → 静态)
  OAuth 2.0 (Anthropic + OpenAI 浏览器授权流)

Phase 2: ACP 协议扩展 (6-8 周)
  参考 MCP 模式 + vscode-acp 实现
  每个外部 ACP Agent 通过 registerDynamicAgent 注册

Phase 3: CLI 包装器 (4-5 周)
  参考 Claudable 的 spawn+readline 模式
  Claude Code / Codex / Gemini CLI 适配器
```

### Sub-Projects 参考价值总结

| 项目 | 适用阶段 | 参考内容 |
|------|----------|----------|
| **vscode-copilot-chat** | 当前 | BYOK Provider 体系 (8 vendor)、SecretStorage per-model 键名、CDN 动态模型列表、CustomOAI per-model 配置 |
| **free-code** | 当前 | 完整 Anthropic OAuth 2.0 + OpenAI OAuth、Token 刷新 (JWT)、多认证源、订阅类型 |
| **open-agent-sdk** | 已完成 | Provider 接口 + Engine 核心已移植到 Director-Code |
| **vscode-acp** | Phase 2 | ACP 协议连接、auth 握手、session 管理 |
| **Claudable** | Phase 3 | spawn+readline CLI 适配 (Codex/Cursor)、多 CLI 统一调度、全局+项目设置分层 |

## 核心接口

```typescript
// Agent 注册 (chatAgents.ts)
registerDynamicAgent(data: IChatAgentData, impl: IChatAgentImplementation): IDisposable

// 语言模型注册 (languageModels.ts L353)
registerLanguageModelProvider(vendor: string, provider: ILanguageModelChatProvider): IDisposable

// Provider 接口 (languageModels.ts L263)
interface ILanguageModelChatProvider {
  onDidChange: Event<void>;
  provideLanguageModelChatInfo(options, token): Promise<ILanguageModelChatMetadataAndIdentifier[]>;
  sendChatRequest(modelId, messages, from, options, token): Promise<ILanguageModelChatResponse>;
  provideTokenCount(modelId, message, token): Promise<number>;
}

// 模型能力 (languageModels.ts L195)
capabilities?: { vision?: boolean; toolCalling?: boolean; agentMode?: boolean; editTools?: string[] }
```

## 关键设计决策

- **Agent 循环**: 采用 open-agent-sdk QueryEngine（非 copilot-chat ToolCallingLoop），因其更简洁、零 GitHub 依赖
- **消息格式**: 内部用 Anthropic 格式（NormalizedMessageParam），各 Provider 负责格式转换
- **工具**: 桥接 VS Code 现有工具（9 内置 + MCP），不重复实现
- **UI**: 完全保留 VS Code 现有 Chat UI，仅新增设置页
- **密钥**: 通过 ISecretStorageService 加密存储 API Key

## 运行环境（必须遵守）

- **操作系统**: Windows（Git Bash / MSYS2），非 Linux
- **Python 命令**: 使用 `python` 而非 `python3`
- **编码**: 终端、脚本读写文件时必须考虑 **UTF-8 编码**（`chcp 65001`，Python 中 `open(f, encoding='utf-8')`）
- **路径分隔符**: 代码中用 `/`，但 Windows 实际路径可能是 `\`，注意 path.join 兼容

### Bash 命令注意事项（Git Bash 兼容性）

Git Bash (MSYS2) 的引号解析与标准 Linux Bash 不同，容易出现 `unexpected EOF while looking for matching '` 错误。

**必须遵守的规则：**
- 优先使用 **Glob/Grep/Read 工具** 代替 `find`/`grep`/`cat` 命令
- 命令中优先用**双引号**，避免单引号（Git Bash 单引号解析有 bug）
- **禁止**在一条命令中混合单引号和双引号
- 保持命令**短而简单**，避免复杂的 shell 管道和多行命令
- 路径参数**不要以 `/` 开头**传给非 POSIX 工具（MSYS2 会自动转换为 Windows 路径）
- `2>/dev/null` 重定向放在命令末尾，不要与引号嵌套

**错误示例（会报错）：**
```bash
find /e/Projects -name '*.ts' -exec grep 'pattern' {} \;   # 引号冲突
ls -la .claude/ 2>/dev/null || echo 'No dir'               # 单引号在复杂命令中
```

**正确示例：**
```bash
ls -la .claude/ 2>/dev/null || echo "No dir"               # 双引号
find /e/Projects -name "*.ts" -type f                       # 双引号
```

---

## 标准开发流程（必须严格遵守）

每次完成用户任务时，必须按以下流程执行，不可跳过任何步骤：

### 流程总览

```
编写代码 → 编写测试 → 运行测试 → 修复问题 → 更新记忆文件 → 提交并推送到远端
```

### Step 1: 编写模块代码

- 逐模块开发，每个模块（文件）独立完成
- 编写完成后立即进入 Step 2，不允许"批量写完所有模块后再统一测试"

### Step 2: 编写单元测试

- **每个模块必须有对应的测试文件**
- 测试文件位置：`vscode/src/vs/workbench/contrib/chat/test/common/agentEngine/` 目录下
- 测试文件命名：与源文件对应，如 `anthropicProvider.test.ts` 对应 `anthropicProvider.ts`
- 测试框架：Mocha TDD（`suite`/`test`），Node.js `assert` 模块
- 每个测试文件开头调用 `ensureNoDisposablesAreLeakedInTestSuite()`

### Step 3: 运行测试

- 编译命令：`cd vscode && npm run gulp -- transpile-client-esbuild`
- 运行测试：`node test/unit/node/index.js --run "src/vs/.../xxx.test.ts"`
- 必须确认全部测试通过（0 failures）

### Step 4: 修复问题（如有）

- 如果测试失败，必须立即修复代码或测试
- 修复后重新编译并运行测试，直到全部通过
- 不允许跳过失败的测试继续下一步

### Step 5: 更新记忆与进度文件

- 将本次完成的工作进度更新到 `.claude/memory.md`
- 包括：新增/修改的文件清单、测试结果、当前阶段进度、下一步计划
- 确保记忆文件始终反映项目最新状态，供后续会话参考

### Step 6: 提交并推送到远端 Git 仓库

- 所有测试通过后，将变更提交到 git 并推送到远端仓库
- 提交信息应清晰描述本次变更内容
- 推送命令：`git push origin <branch>`
- 如果用户没有明确指定分支，推送到当前分支

---

### Bash 命令铁律（重复强调）

- **绝对禁止使用单引号** `'` ——Git Bash 会解析出错
- **只用双引号** `"` 包裹参数
- **绝对禁止混合引号**
- 优先用 Glob/Grep/Read 工具，减少 Bash 命令

---

## 注意事项

- 修改 chat 基础设施时注意：534+ 文件有复杂依赖关系
- Agent 循环在 `IChatAgentImplementation.invoke()` 内部，不在 ChatService 中
- `vendor === 'copilot'` 有默认标记逻辑，新 vendor 需处理
- Phase 1 的 Agent 注册体系需为 Phase 2 ACP 预留扩展点
