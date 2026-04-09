# CLAUDE.md - 项目指引

## 项目概述

这是一个开源 VS Code 构建（fork），品牌名为 NiceCode/Director-Code。已可成功编译。当前核心目标是**优化迭代其内置的 Copilot AI Agent 部分**。

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
│   ├── sub-projects/                       # Claudable (CLI Agent 调用参考)
│   ├── free-code/                          # Claude Code 重构版 (Agent 循环参考)
│   ├── open-agent-sdk-typescript/          # Agent SDK (Provider+Engine 核心参考)
│   ├── vscode-acp/                         # ACP 协议 VS Code 扩展参考
│   └── vscode-copilot-chat/               # Copilot Chat 完整源码 (BYOK/ToolCallingLoop 参考)
└── .cursor/                                # 实施计划文档 (唯一权威来源)
```

## 实施计划 (唯一权威文档)

所有计划文档位于 `.cursor/` 目录，其他位置的旧文档已清理：

| 文档 | 内容 |
|------|------|
| `.cursor/plan-01-roadmap.md` | **总体路线图**: Phase 1→2→3、架构设计、选型总表、里程碑 |
| `.cursor/plan-02-agent-core.md` | **Agent 核心改造**: 三方选型矩阵、AgentEngine 设计、移植文件清单 |
| `.cursor/plan-03-provider-settings.md` | **Provider 与设置**: 双层架构、流式 Provider、密钥管理 |
| `.cursor/plan-04-phase2-acp.md` | **Phase 2 ACP**: 协议层设计、参考 MCP+vscode-acp |
| `.cursor/plan-05-phase3-cli.md` | **Phase 3 CLI**: 适配器框架、输出解析、外部编辑集成 |
| `.cursor/copilot-chat-extension-analysis.md` | **Copilot Chat 源码分析**: ToolCallingLoop、BYOK、Provider 层 |

### 实施路线 (已定稿)

```
Phase 1: Agent 核心 + Provider 替换 (8-10 周)
  Agent 引擎: 基于 open-agent-sdk QueryEngine (~400 行)
  Provider:   移植 open-agent-sdk AnthropicProvider/OpenAIProvider + 流式改造
  工具:       桥接 VS Code 现有 ILanguageModelToolsService
  注册:       通过 registerDynamicAgent 注册为 Chat Participant
  设置:       扩展现有 chatManagement + ISecretStorageService

Phase 2: ACP 协议扩展 (6-8 周)
  参考 MCP 模式 + vscode-acp 实现
  每个外部 ACP Agent 通过 registerDynamicAgent 注册

Phase 3: CLI 包装器 (4-5 周)
  参考 Claudable 的 spawn+readline 模式
  Claude Code / Codex / Gemini CLI 适配器
```

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

## 注意事项

- 修改 chat 基础设施时注意：534+ 文件有复杂依赖关系
- Agent 循环在 `IChatAgentImplementation.invoke()` 内部，不在 ChatService 中
- `vendor === 'copilot'` 有默认标记逻辑，新 vendor 需处理
- Phase 1 的 Agent 注册体系需为 Phase 2 ACP 预留扩展点
