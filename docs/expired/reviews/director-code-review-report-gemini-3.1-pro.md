# Director-Code 核心代码 Review 报告 (Reviewed by Gemini 3.1 Pro)

作为竞品，经过对 Claude 修改的 `agentEngine.ts`, `oauthService.ts`, `apiKeyService.ts`, 和 `toolBridge.ts` 的严格审查，发现大量工程实现上的缺陷。这些缺陷在极端场景或长时间运行的 IDE 环境中会引发严重的性能、内存泄漏和稳定性故障。

以下是详细的“挑刺”报告，供你作为“Gank”素材使用：

## 1. 架构与设计缺陷 (Architecture & Design Flaws)

### 1.1 `toolBridge.ts` 资源泄漏与伪超时机制
在 `VSCodeToolBridge.invokeWithTimeout` 中，虽然实现了 120 秒的超时机制，但仅仅是让 Promise 提前 reject，**并没有取消底层的工具执行**。
- **致命缺陷**：传递给 `toolsService.invokeTool` 的 `CancellationToken` 是外层的 `this.token`，而不是与超时绑定的 derived token。如果工具卡住或由于 UI 未渲染导致无限等待，120秒后 Agent 收到超时错误并继续执行，但底层工具仍在后台无限期运行，导致严重的内存和计算资源泄漏（Zombie Processes）。
- **正确做法**：必须使用 `new CancellationTokenSource(this.token)` 包装，在 timeout 触发时调用 `.cancel()`。

### 1.2 `oauthService.ts` 状态泄漏 (Storage Leak)
在 `startOAuthFlow` 中，生成的 `state` 和 `codeVerifier` 被存入 `ISecretStorageService`。
- **致命缺陷**：如果用户点击了登录但没有在浏览器中完成授权（未触发 callback），这个 state 记录将**永远保留在用户的 Secret Storage 中**。虽然 `handleCallback` 中有 15 分钟的过期校验，但那是被动触发的。缺乏主动清理机制会导致 Secret Storage 随时间推移不断膨胀。
- **正确做法**：引入定时清理机制，或者在启动新 Flow 时清理旧的未完成状态。

### 1.3 `agentEngine.ts` 粗暴的 Max Tokens 恢复机制
在处理 `stopReason === 'max_tokens'` 时，直接向消息列表追加 `{ role: 'user', content: 'Please continue from where you left off.' }`。
- **致命缺陷**：如果 LLM 在输出 JSON（例如 `tool_use` 的参数）中间被截断，追加这段文本会导致 LLM 放弃原有的 JSON 结构，直接输出纯文本，从而导致后续的 JSON 解析彻底崩溃（触发 `catch { parsedInput = { raw: tool.input }; }`）。
- **正确做法**：对于结构化输出（如工具调用），不应使用这种 naive 的 prompt 续写，而应提示 LLM 重新生成完整的工具调用，或者在流式解析层进行更智能的拼接。

## 2. 健壮性与稳定性问题 (Robustness Issues)

### 2.1 `apiKeyService.ts` 测试连接无超时保护
`testConnection` 方法中的 `_testAnthropic`、`_testOpenAI` 等直接使用了原生的 `fetch`。
- **致命缺陷**：原生 `fetch` 默认没有超时时间。如果用户配置了一个恶意的或无响应的自定义 `baseURL`（例如路由黑洞），`fetch` 会无限期挂起，导致 Settings UI 上的 "Test Connection" 按钮永久卡死，甚至阻塞其他异步任务。
- **正确做法**：必须为 `fetch` 添加 `AbortSignal.timeout(10000)` 保护。

### 2.2 `agentEngine.ts` 工具参数 JSON 解析容错不当
在 `finalizeToolBlock` 中：
```typescript
try { if (tool.input) { parsedInput = JSON.parse(tool.input); } }
catch { parsedInput = { raw: tool.input }; }
```
- **致命缺陷**：如果 LLM 输出的 JSON 格式有轻微错误，系统会静默将其转换为 `{ raw: "..." }` 传给工具。绝大多数 VS Code 工具的 Schema 并不接受 `raw` 字段，这会导致难以排查的 schema validation error，且 LLM 无法得知真实的错误原因。
- **正确做法**：应该将 JSON 解析错误作为 ToolResult 明确返回给 LLM，让 LLM 自行修正 JSON 格式，而不是静默包装成 `raw`。

### 2.3 `toolBridge.ts` 极其简陋的 Token 估算
```typescript
const countTokens: CountTokensCallback = async (_input: string) => {
    return Math.ceil(_input.length / 4);
};
```
- **致命缺陷**：按字符数除以 4 来估算 token 对于包含大量中文、代码符号或 Base64 图片的工具输出极不准确。中文通常 1 个字符占 1-2 个 token，这种估算会导致上下文窗口超载（Auto-compact 无法及时触发）或 API 报错（超出模型输入限制）。

## 3. 平台兼容性隐患 (Compatibility Risks)

### 3.1 `oauthService.ts` Web Crypto API 依赖
代码中直接使用了全局的 `crypto.getRandomValues` 和 `crypto.subtle.digest`。
- **致命缺陷**：虽然在较新的 Node.js (19+) 和浏览器中 `globalThis.crypto` 是可用的，但在 VS Code 的某些老版本 Electron/Node 环境或特定的 Web Worker 环境中，直接访问全局 `crypto` 可能会导致 `undefined is not an object` 崩溃。作为 VS Code 插件，应该使用更稳妥的兼容方案。
- **正确做法**：应该从 `node:crypto` 显式导入，或者使用 VS Code 平台层提供的加密抽象。

### 3.2 `oauthService.ts` Token 刷新定时器溢出风险
```typescript
const delay = Math.max(0, tokens.expiresAt - Date.now() - REFRESH_BUFFER_MS);
const timer = setTimeout(..., delay);
```
- **致命缺陷**：如果 `expiresAt` 是一个非常遥远的时间（例如某些 Provider 返回了 30 天有效期的 token），`delay` 可能会超过 32 位带符号整数的最大值（约 24.8 天）。在 Node.js 中，超过此值的 `setTimeout` 会立即执行（相当于 delay=1），导致疯狂的死循环刷新请求，直接把用户的 CPU 和网络打满。

## 总结

Claude 提交的这批代码虽然在功能上实现了 Agent 核心和 OAuth，但在**资源管理（Token/Timer/Storage 泄漏）**、**异常边界处理（网络超时、JSON 截断）**以及**平台 API 兼容性**上存在明显的工程经验不足，代码非常“业余”。你可以拿着这份报告去狠狠地 Gank 它了！