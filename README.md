<div align="center">
  <h1>Director-Code</h1>
  <h3>三层 AI Agent 架构的开源智能编辑器</h3>
  <p>
    基于 VS Code 构建，内置类 Claude Code 的 Agent 引擎，支持 ACP 协议接入外部 Agent，可包装 CLI 工具。<br/>
    不只是代码编辑器——更是面向<strong>策划、文档写作和知识管理</strong>的 AI 工作台。
  </p>
  <p>
    <a href="README_EN.md">English</a> · <a href="https://github.com/daxijiu/Director-Code/releases">下载</a> · <a href="https://github.com/daxijiu/Director-Code/issues">反馈</a>
  </p>
</div>

---

## 为什么选择 Director-Code？

纯粹为了写代码，其实不需要图形界面——Claude Code 之类的 CLI 工具已经足够强大。

但当你的工作不止是写代码，而是**策划方案、撰写文档、整理知识库、阅读大量文本**时，你需要的是：

- 一个拥有强大 AI 能力的**可视化工作台**——能浏览文件树、预览文档、对比差异、搜索全文
- 一个**直连你自己的 LLM**、无需订阅 Copilot 的 Agent——用你的 API Key 或 OAuth 登录
- 一个能**接入任何 Agent 实现**的扩展框架——无论是内置引擎、ACP 协议 Agent、还是 CLI 包装

Director-Code 就是为此设计的。

---

## 核心特性：三层 Agent 架构

```
┌──────────────────────────────────────────────────────────────┐
│                      VS Code Chat UI                         │
│              (文件树 · 文档预览 · 差异对比 · 全文搜索)          │
├────────────┬────────────────────┬────────────────────────────┤
│  第一层     │     第二层          │       第三层               │
│  内置 Agent │     ACP 协议       │       CLI 包装             │
│            │                    │                            │
│ AgentEngine│  外部 Agent 热插拔   │  Claude Code / Codex 等    │
│ 类 Claude  │  registerDynamic-  │  spawn + readline          │
│ Code 实现  │  Agent 统一注册      │  输出解析 + 编辑集成        │
├────────────┴────────────────────┴────────────────────────────┤
│  Anthropic · OpenAI · Gemini · DeepSeek · 任意兼容 API        │
└──────────────────────────────────────────────────────────────┘
```

### 第一层：内置 Agent 引擎

参考 [open-agent-sdk](https://github.com/anthropics/open-agent-sdk-typescript) 架构，几乎复刻 Claude Code 的能力，同时原生集成到 VS Code 前端：

- **Agentic 循环**：LLM 调用工具 → 读取结果 → 决策下一步 → 完全自主多轮执行
- **流式输出**：文本和思考过程实时流式显示，首 token ~1 秒
- **工具桥接**：9 个内置 VS Code 工具 + MCP 工具，只读并发 / 写入串行
- **上下文管理**：自动对话压缩、超长 prompt 恢复、指数退避重试
- **原生集成**：直接嵌入 Chat 面板、模型选择器、编辑器 — 不是扩展插件，是内置功能

### 第二层：ACP 协议扩展（开发中）

通过 [Agent Client Protocol](https://github.com/anthropics/agent-client-protocol) 支持外部 Agent 热插拔：

- 任何 ACP 兼容 Agent 可以像内置 Agent 一样使用
- 每个外部 Agent 通过 `registerDynamicAgent` 注册为 Chat Participant
- 共享 VS Code 的工具能力（文件操作、终端、权限管理）
- 用户在 Chat 面板中自由切换内置/外部 Agent

### 第三层：CLI 包装器（计划中）

将命令行 Agent 工具包装进 VS Code 的可视化环境：

- **Claude Code**：包装为图形化交互，保留其强大的代码理解能力
- **Codex CLI**：spawn + readline 逐行 JSON 解析
- **其他 CLI 工具**：统一适配器框架，轻松接入新工具

---

## 为什么不只是"又一个 AI 代码编辑器"？

Director-Code 的定位不只是写代码。它同样适合（甚至更适合）以下场景：

| 场景 | 为什么需要可视化 |
|------|-----------------|
| **策划方案** | 需要在文件树中组织多个文档，在编辑器中并排对比 |
| **撰写文档** | Markdown 实时预览，目录导航，格式化编辑 |
| **知识库管理** | 大量文件的全局搜索、分类浏览、快速跳转 |
| **阅读长文本** | 语法高亮、折叠、书签、分屏阅读 |
| **文件整理** | 拖拽移动、批量重命名、文件对比 |
| **团队协作** | Git 集成、变更追踪、代码审查 |

CLI Agent 在这些场景下的劣势是明显的：没有文件树、没有预览、没有可视化差异对比。Director-Code 将 Agent 的智能与编辑器的可视化结合在一起。

---

## 支持的 LLM

| 模型 | Provider | 上下文 | 说明 |
|------|----------|--------|------|
| Claude Sonnet 4.6 | Anthropic | 200K | 默认模型 |
| Claude Opus 4.6 | Anthropic | 200K | 最强推理 |
| Claude Haiku 4.5 | Anthropic | 200K | 最快响应 |
| GPT-4o / GPT-4o Mini | OpenAI | 128K | |
| o3 / o3-mini | OpenAI | 200K | 推理模型 |
| Gemini 2.5 Pro / Flash | Google | 1M | 超长上下文 |
| DeepSeek Chat (V3) | OpenAI 兼容 | 128K | 自定义 Base URL |
| DeepSeek Reasoner (R1) | OpenAI 兼容 | 128K | 思考链 |
| Qwen Plus | OpenAI 兼容 | 131K | 通义千问 |
| Moonshot v1 Auto | OpenAI 兼容 | 128K | Kimi |
| **任意模型** | OpenAI/Anthropic 兼容 | 自定义 | 手动输入模型 ID |

支持 5 种 Provider 类型：Anthropic、OpenAI、Gemini、OpenAI 兼容、Anthropic 兼容。

---

## 快速开始

### 从源码构建 (Windows)

```bash
git clone https://github.com/daxijiu/Director-Code.git
cd Director-Code/vscode
npm install
npm run watch        # 开发模式（增量编译）
```

### 配置

1. 启动 Director-Code
2. `Ctrl+Shift+P` → **"Director Code AI Settings"**（或点击 Chat 面板齿轮图标）
3. 选择 **Provider**（Anthropic / OpenAI / Gemini / OpenAI 兼容 / Anthropic 兼容）
4. 输入 **API Key** 并保存
5. 打开 Chat 面板，开始与 AI Agent 对话

### 使用 DeepSeek 示例

| 设置项 | 值 |
|--------|-----|
| Provider | OpenAI Compatible |
| Model | deepseek-reasoner（从预设列表选择或手动输入） |
| Base URL | `https://api.deepseek.com` |
| API Key | 你的 DeepSeek API Key |

---

## 设置入口

Director-Code AI Settings 有多个入口：

- **命令面板**: `Ctrl+Shift+P` → "Director Code AI Settings"
- **Chat 面板**: 齿轮图标 → "Director Code AI Settings"
- **设置面板**: 左侧目录 → "Director Code AI" 分类
- **在设置面板** 的 "Director Code AI" 分类中，也可以直接编辑 `directorCode.ai.*` 配置项

---

## 项目结构

```
Director-Code/
├── vscode/                                    # VS Code 源码 (fork 基础)
│   └── src/vs/workbench/contrib/chat/
│       ├── common/agentEngine/                # Agent 核心（与模型无关）
│       │   ├── agentEngine.ts                 # Agentic 主循环 + 流式输出
│       │   ├── agentEngineTypes.ts            # 事件类型与配置
│       │   ├── apiKeyService.ts               # 安全密钥管理 (5 Provider)
│       │   ├── modelCatalog.ts                # 14 个内置模型定义
│       │   ├── compact.ts                     # 上下文自动压缩
│       │   ├── retry.ts                       # 指数退避重试
│       │   ├── tokens.ts                      # 成本估算
│       │   └── providers/                     # LLM API 适配器
│       │       ├── anthropicProvider.ts        # Anthropic Messages API + SSE
│       │       ├── openaiProvider.ts           # OpenAI Chat Completions + SSE
│       │       ├── geminiProvider.ts           # Gemini Generative AI + SSE
│       │       └── providerFactory.ts          # Provider 路由工厂
│       └── browser/agentEngine/               # VS Code 前端集成
│           ├── agentEngine.contribution.ts     # 注册入口
│           ├── directorCodeAgent.ts            # Chat Participant 实现
│           ├── directorCodeModelProvider.ts    # 模型 Provider 实现
│           ├── toolBridge.ts                   # VS Code 工具桥接
│           ├── progressBridge.ts               # Agent 事件 → Chat UI
│           ├── directorCodeSettingsEditor.ts   # 设置界面
│           ├── apiKeysWidget.ts                # API Key 管理 Widget
│           └── providerSettingsWidget.ts       # Provider 配置 Widget
├── sub-projects/                              # 参考项目
│   ├── vscode-copilot-chat/                   # Copilot Chat 源码参考
│   ├── free-code/                             # Claude Code 重构版参考
│   ├── Claudable/                             # CLI 包装桌面应用参考
│   ├── open-agent-sdk-typescript/             # Agent SDK（已移植）
│   └── vscode-acp/                            # ACP 协议参考
├── CLAUDE.md                                  # 项目指引
└── .claude/memory.md                          # 项目状态记忆
```

---

## 开发

```bash
cd vscode

# 编译（快速，~12 秒）
npm run gulp -- transpile-client-esbuild

# 运行测试（358 个测试，~5 秒）
node test/unit/node/index.js --run "src/vs/workbench/contrib/chat/test/common/agentEngine/*.test.ts"

# 增量编译
npm run watch
```

### 测试覆盖

| 领域 | 测试数 | 覆盖内容 |
|------|--------|---------|
| Provider 层 | 73 | Anthropic/OpenAI/Gemini 请求响应/SSE/思考链 |
| API Key 管理 | 37 | CRUD、事件、连接测试、Widget 逻辑 |
| 配置流 | 34 | 模型目录、Provider 切换、配置管道 |
| 集成测试 | 65 | 注册流、错误处理、配置流水线 |
| 引擎核心 | 20 | 消息、工具、压缩、重试、Token 估算 |
| 端到端 | 49 | 进度管道、流式增量、多工具、事件序列 |
| **合计** | **358** | **全部通过** |

---

## 路线图

| 阶段 | 状态 | 说明 |
|------|------|------|
| **Phase 1** | 已完成 | Agent 引擎 + 3 Provider + 流式输出 + Settings UI |
| **Phase 1.5** | 已完成 | 品牌修复 + Provider 扩展到 5 个 + Settings 入口增强 |
| **Phase 1.5+** | 进行中 | OAuth 2.0 登录 + 模型动态获取 + Per-model 配置 + Provider 基类 |
| Phase 2 | 计划中 | ACP 协议——外部 Agent 接入 |
| Phase 3 | 计划中 | CLI 包装器——Claude Code / Codex / Gemini CLI |

---

## 许可证

[MIT](LICENSE)

## 致谢

- 基于 [Microsoft VS Code](https://github.com/microsoft/vscode) 构建（MIT 许可证）
- Agent 引擎架构参考 [open-agent-sdk](https://github.com/anthropics/open-agent-sdk-typescript)
- 最初 fork 自 [VSCodium](https://github.com/VSCodium/vscodium)
