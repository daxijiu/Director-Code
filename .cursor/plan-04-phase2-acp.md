# 文档 4: Phase 2 ACP 协议扩展计划

> Phase 2 — AgentClientProtocol 支持
> 前提: Phase 1 完成
> 预估工期: 6-8 周

---

## 一、设计目标

在 Phase 1 的内置 Agent 基础上，通过 ACP 协议支持外部 Agent 热插拔：
- 用户可以连接任何 ACP 兼容 Agent（如 claude-code-acp, gemini-cli-acp 等）
- 外部 Agent 在 Chat UI 中像内置 Agent 一样使用
- Phase 1 的内置 Agent 保持不变，ACP Agent 是额外选项

---

## 二、架构设计

```
Chat UI → IChatAgentService
  ├── DirectorCodeAgent (Phase 1 内置，registerDynamicAgent)
  │     └── AgentEngine → LLM API
  │
  └── ACP Agent Proxy (Phase 2，每个外部 Agent 一个 registerDynamicAgent)
        └── AcpAgentProxy (implements IChatAgentImplementation)
              │
              ├── invoke() → AcpServerConnection
              │     ├── session.create()
              │     ├── session.sendMessage(userMessage)
              │     ├── for await (sessionUpdate) → IChatProgress[]
              │     └── session.complete()
              │
              └── AcpServerConnection
                    ├── AgentManager.spawnAgent() → 子进程
                    ├── ndJsonStream(stdin/stdout) → Stream
                    └── ClientSideConnection (ACP SDK)
                          ├── initialize() 握手
                          └── AcpClientImpl (Host 端能力)
                                ├── readTextFile / writeTextFile
                                ├── createTerminal / terminalOutput
                                └── requestPermission
```

### 复用 MCP 的模式

| MCP 组件 | ACP 对应组件 | 复用方式 |
|----------|-------------|---------|
| `McpRegistry` | `AcpRegistry` | 参考模式，新建 |
| `McpServerConnection` | `AcpServerConnection` | 参考生命周期状态机，新建 |
| `McpServerRequestHandler` | `AcpRequestHandler` | 参考 JSON-RPC 处理，新建 |
| `JsonRpcProtocol` | 直接复用 | ACP 也基于 JSON-RPC 2.0 (或 NDJSON) |
| `IMcpMessageTransport` | `IAcpMessageTransport` | 参考接口，适配 NDJSON stdio |
| `McpCollectionDefinition` | `AcpAgentDefinition` | 参考配置结构，新建 |

### 参考 vscode-acp 实现

从 `sub-projects/vscode-acp/` 直接参考的组件：

| vscode-acp 组件 | 我们的实现 | 改动 |
|----------------|-----------|------|
| `AgentManager.spawnAgent()` | `AcpAgentManager` | 基本移植，适配 VS Code 的进程管理 |
| `ConnectionManager.connect()` | `AcpServerConnection` | 移植 ndJsonStream + initialize 握手 |
| `AcpClientImpl` | `AcpHostCapabilities` | 移植 FS/Terminal/Permission 处理，改用 VS Code 内部 API |
| `AgentConfig` | 配置 schema | 参考 `acp.agents` 配置结构 |
| `SessionUpdateHandler` | `AcpSessionBridge` | 将 sessionUpdate 转为 IChatProgress |

---

## 三、文件规划

```
vscode/src/vs/workbench/contrib/acp/
├── common/
│   ├── acpTypes.ts               — ACP 协议类型定义
│   ├── acpRegistry.ts            — Agent 注册表
│   ├── acpServerConnection.ts    — 连接生命周期管理
│   └── acpAgentDefinition.ts     — Agent 配置定义
├── browser/
│   ├── acp.contribution.ts       — 注册入口
│   ├── acpAgentManager.ts        — 子进程 spawn 管理
│   ├── acpHostCapabilities.ts    — Host 端能力实现（FS、终端、权限）
│   ├── acpAgentProxy.ts          — IChatAgentImplementation 代理
│   ├── acpSessionBridge.ts       — sessionUpdate → IChatProgress 转换
│   └── acpManagement/
│       ├── acpManagement.contribution.ts — Agent 管理 UI 注册
│       └── acpAgentListWidget.ts — Agent 列表管理 Widget
```

---

## 四、Phase 1 与 Phase 2 的协作点

Phase 1 中为 Phase 2 预留的扩展点：

1. **Agent 注册统一** — Phase 1 用 `registerDynamicAgent('director-code-agent', data, impl)`，Phase 2 用 `registerDynamicAgent('acp-agent-<name>', data, proxy)` — 对 ChatService 完全透明
2. **工具共享** — ACP Agent 可通过 Host 端能力调用 VS Code 工具（`ILanguageModelToolsService`），与 Phase 1 的 Agent 共享同一套工具
3. **设置页扩展** — Phase 2 在 `chatManagement` 中增加 ACP Agent 管理标签页
4. **IChatProgress 统一** — ACP 的 sessionUpdate 通过 `AcpSessionBridge` 转为 IChatProgress，与 Phase 1 的 `ProgressBridge` 输出同类型事件

---

## 五、ACP 配置

```json
// settings.json
{
  "directorCode.acp.agents": {
    "claude-code": {
      "command": "npx",
      "args": ["@anthropic-ai/claude-code@latest", "--acp"],
      "displayName": "Claude Code"
    },
    "gemini-cli": {
      "command": "npx",
      "args": ["@anthropic-ai/gemini-cli@latest", "--acp"],
      "displayName": "Gemini CLI"
    }
  },
  "directorCode.acp.autoApprovePermissions": "ask"
}
```

---

## 六、实施步骤

### Week 11-12: ACP 协议层
1. 定义 `acpTypes.ts`（协议消息类型）
2. 实现 `acpAgentManager.ts`（参考 vscode-acp AgentManager）
3. 实现 `acpServerConnection.ts`（ndJsonStream + initialize 握手）
4. 实现 `acpHostCapabilities.ts`（FS / 终端 / 权限）

### Week 13-14: Agent 代理 + 桥接
1. 实现 `acpAgentProxy.ts`（IChatAgentImplementation 代理）
2. 实现 `acpSessionBridge.ts`（sessionUpdate → IChatProgress）
3. 实现 `acpRegistry.ts`（Agent 注册表）
4. 在 `acp.contribution.ts` 中注册

### Week 15-16: 配置 + 管理 UI
1. 注册 ACP 配置 schema
2. 实现 Agent 列表管理 Widget
3. 连接测试（启动 Agent → 握手 → 发消息 → 收响应）

### Week 17-18: 测试 + 优化
1. 与 claude-code-acp 集成测试
2. 多 Agent 并存测试
3. 断线重连 / 超时处理
4. 权限 UI 优化
