# 文档 5: Phase 3 CLI 包装器实施计划

> Phase 3 — CLI Agent 包装器
> 前提: Phase 1 完成（Phase 2 可并行或后续）
> 预估工期: 4-5 周

---

## 一、设计目标

直接调用用户本机已安装的 CLI 工具（Claude Code, Gemini CLI, Codex CLI），捕获输出渲染到 Chat UI。核心价值：绕过订阅限制（用户使用自己的 CLI 订阅，我们只做 UI 层）。

---

## 二、架构设计

```
Chat UI → IChatAgentService
  ├── DirectorCodeAgent (Phase 1)
  ├── ACP Agent Proxy (Phase 2)
  │
  └── CLI Agent (Phase 3，registerDynamicAgent)
        └── CliAgentService (implements IChatAgentImplementation)
              │
              ├── invoke()
              │     ├── CliAgentRouter → 选择适配器
              │     │
              │     ├── ClaudeCodeAdapter
              │     │     spawn('claude', ['--output-format','stream-json', '-p', message])
              │     │     for await (line of readline(stdout))
              │     │       JSON.parse → CliEvent → IChatProgress
              │     │
              │     ├── GeminiCliAdapter
              │     │     spawn('gemini', [message])
              │     │     readline → CliEvent → IChatProgress
              │     │
              │     └── CodexCliAdapter
              │           spawn('codex', ['exec','--json', message])
              │           readline → JSON 行 → CliEvent → IChatProgress
              │
              └── CliEventBridge
                    CliEvent → IChatProgress[] 转换
                    CLI 文件修改 → IChatEditingSession.startExternalEdits()
```

### 参考 Claudable 实现

| Claudable 组件 | 我们的实现 | 改动 |
|---------------|-----------|------|
| `cli/claude.ts` (SDK query) | `ClaudeCodeAdapter` | 改用 `spawn` + `stream-json` 格式 |
| `cli/codex.ts` (spawn+readline) | `CodexCliAdapter` | 基本移植，适配 VS Code 进程管理 |
| `TOOL_NAME_ACTION_MAP` | `CliEventBridge` | 参考工具事件映射逻辑 |
| `streamManager.publish` | 直接用 `progress(IChatProgress[])` | 无需 SSE |

---

## 三、文件规划

```
vscode/src/vs/workbench/contrib/chat/browser/cliAgents/
├── cliAgentTypes.ts              — CLI Agent 类型定义
├── cliAgentService.ts            — IChatAgentImplementation 实现
├── cliAgentRouter.ts             — 路由到具体适配器
├── cliEventBridge.ts             — CliEvent → IChatProgress 转换
├── cliDetector.ts                — CLI 安装检测 + 版本检查
└── adapters/
    ├── claudeCodeAdapter.ts      — Claude Code CLI
    ├── codexCliAdapter.ts        — Codex CLI
    └── geminiCliAdapter.ts       — Gemini CLI
```

---

## 四、CLI 输出格式与解析

### Claude Code (`--output-format stream-json`)

```
{"type":"system","subtype":"init","session_id":"...","tools":["Read","Write","Edit",...]}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Let me..."}]}}
{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"src/main.ts"}}
{"type":"tool_result","tool_use_id":"t1","content":"file contents..."}
{"type":"result","subtype":"success","cost_usd":0.05,"num_turns":3}
```

映射:
- `assistant` → `IChatProgress.markdownContent`
- `tool_use` → `IChatProgress.toolInvocation`
- `tool_result` → `IChatProgress.toolInvocationComplete`
- `result` → 完成

### Codex CLI (`--json`)

```
{"type":"message","role":"assistant","content":"I'll help you..."}
{"type":"function_call","name":"shell","arguments":{"command":"ls -la"}}
{"type":"function_call_output","output":"total 42\n..."}
```

### 外部编辑集成

CLI 工具会直接修改磁盘文件。策略：
1. CLI 启动前: `editingSession.startExternalEdits()`
2. CLI 运行中: 监听文件变化（`IFileService.watch()`）
3. CLI 完成后: `editingSession.stopExternalEdits()`
4. VS Code 自动展示 diff

---

## 五、配置

```typescript
// settings.json
{
  "directorCode.cli.defaultAgent": "claude-code",
  "directorCode.cli.claudeCode.path": "claude",
  "directorCode.cli.codex.path": "codex",
  "directorCode.cli.gemini.path": "gemini",
}
```

启动时自动检测 CLI 是否可用（`which claude` / `where codex`）。

---

## 六、实施步骤

### Week 15-16: 框架 + Claude Code 适配器
1. 创建 `cliAgents/` 目录结构
2. 实现 `cliAgentTypes.ts` + `cliAgentService.ts`
3. 实现 `cliEventBridge.ts`
4. 实现 `claudeCodeAdapter.ts`（`stream-json` 解析）
5. 实现 `cliDetector.ts`
6. 注册为 Dynamic Agent

### Week 17-18: 更多适配器 + 外部编辑
1. 实现 `codexCliAdapter.ts`
2. 实现 `geminiCliAdapter.ts`
3. 实现外部编辑集成（`startExternalEdits` / `stopExternalEdits`）
4. 实现配置 UI

### Week 19: 测试 + 优化
1. 各 CLI 端到端测试
2. 进程管理（超时、僵尸进程清理）
3. 错误处理与用户友好提示

---

## 七、与 Phase 2 ACP 的关系

CLI 包装器（Phase 3）和 ACP（Phase 2）解决不同问题：
- **ACP**: 标准化协议，双向通信，Agent 可请求 Host 能力
- **CLI**: 单向包装，捕获输出，用户绕过订阅限制

两者可共存：
- 如果 CLI 工具支持 ACP 模式（如 `claude --acp`），优先走 ACP（Phase 2）
- 如果 CLI 工具不支持 ACP，用 CLI 包装器（Phase 3）
- 用户可以同时配置多个 Agent（内置 + ACP + CLI）
