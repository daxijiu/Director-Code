---
name: Phase 1 细节优化
overview: 针对 Phase 1 产品的 9 个问题进行系统性优化，涵盖品牌残留清理、更新机制修复、Settings UI 入口增强、Provider/模型体系重构、Test Connection 修复、以及面向未来的 OAuth 预留设计。
todos:
  - id: fix-test-connection
    content: "P0: 修复 Test Connection -- apiKeysWidget 传入 baseURL + 动态测试模型 + URL 拼接修正"
    status: completed
  - id: brand-cleanup
    content: "P0: 品牌残留清理 -- updateUrl 禁用/替换, VisualElementsManifest.xml, prepare_vscode.sh, dataFolderName 评估"
    status: completed
  - id: settings-ui-entry
    content: "P1: Settings UI 入口 -- Chat 齿轮菜单 + 设置面板顶级 TOC 分类 'Director Code AI'"
    status: completed
  - id: provider-refactor
    content: "P1: Provider 体系重构 -- 新增 openai-compatible/anthropic-compatible, 动态模型列表, 用户自定义模型输入"
    status: completed
  - id: context-length
    content: "P2: 上下文长度配置 -- 新增 maxInputTokens 配置项, 影响 compact 触发"
    status: completed
  - id: oauth-placeholder
    content: "P2: OAuth/订阅预留 -- AuthMethod 类型扩展, UI 预留登录按钮位置"
    status: completed
isProject: false
---

# Phase 1 细节优化计划

## 问题分析与根因

### 问题 1: 安装路径仍为 VSCodium

`product.json` 中 `win32DirName` 已为 `"Director-Code"`，`code.iss` 中 `DefaultDirName={userpf}\{#DirName}` 也正确。但用户报告安装到 `VSCodium` 文件夹，可能的根因：

- `prepare_vscode.sh` 中 `updateUrl` 指向 VSCodium 的 versions 仓库，自动更新时拉取的是 VSCodium 安装包
- `VisualElementsManifest.xml` 中 `ShortDisplayName="VSCodium"` 残留
- `dataFolderName` 为 `".vscode-oss"` 而非 Director-Code 相关名称
- 安装包可能是之前残留的 VSCodium 安装在同目录，新安装覆盖到了旧路径

需排查并清理所有 VSCodium 残留。

### 问题 3: 更新报错（与问题 1 关联）

根因明确: `product.json` 中 `updateUrl` 指向 `https://raw.githubusercontent.com/VSCodium/versions/refs/heads/master`，更新检查器拉取 VSCodium 的更新包并尝试覆盖安装，路径/文件冲突导致报错。

### 问题 7: Test Connection 失败但 Agent 能用

根因明确: [apiKeysWidget.ts](vscode/src/vs/workbench/contrib/chat/browser/agentEngine/apiKeysWidget.ts) 第 203 行调用 `testConnection(provider, apiKey)` **未传入 `baseURL`**，而 `apiKeyService.ts` 中 `_testOpenAI` 在无 baseURL 时使用 `https://api.openai.com`。但 Agent 实际调用时（[directorCodeAgent.ts](vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeAgent.ts) 第 70 行）会从配置读取 `directorCode.ai.baseURL` 传给 Provider。DeepSeek 用户配了自定义 baseURL，测试走错了地址。

---

## 优化方案

### 工作项 A: 品牌残留清理 + 更新机制修复（问题 1, 3）

**涉及文件:**
- [vscode/product.json](vscode/product.json) -- `updateUrl`, `dataFolderName`
- [vscode/resources/win32/VisualElementsManifest.xml](vscode/resources/win32/VisualElementsManifest.xml) -- `ShortDisplayName`
- [prepare_vscode.sh](prepare_vscode.sh) -- `updateUrl` 设置逻辑

**改动:**
1. `product.json`: 将 `updateUrl` 改为空字符串或 Director-Code 自有 release URL（暂无自建 update server，应**禁用自动更新**）
2. `product.json`: 考虑将 `dataFolderName` 从 `".vscode-oss"` 改为 `".director-code"`（注意: 这会导致用户迁移现有配置的问题，需慎重决定）
3. `VisualElementsManifest.xml`: `ShortDisplayName` 从 `"VSCodium"` 改为 `"Director-Code"`
4. `prepare_vscode.sh`: 修改 `updateUrl` 设置逻辑，当 `DISABLE_UPDATE != "yes"` 时也不应指向 VSCodium
5. 全面排查并清理 `vscode/resources/` 下残留的 VSCodium 文案

### 工作项 B: Settings UI 入口增强（问题 2）

**目标:** 两个新入口 -- (a) Chat 面板齿轮菜单, (b) 设置面板顶级分类

**涉及文件:**
- [vscode/src/vs/workbench/contrib/chat/browser/agentEngine/agentEngine.contribution.ts](vscode/src/vs/workbench/contrib/chat/browser/agentEngine/agentEngine.contribution.ts) -- 添加菜单项注册
- [vscode/src/vs/workbench/contrib/preferences/browser/settingsLayout.ts](vscode/src/vs/workbench/contrib/preferences/browser/settingsLayout.ts) -- 添加 TOC 条目

**改动 (a) Chat 齿轮菜单:**
在 `agentEngine.contribution.ts` 中，为 `director-code.openSettings` 命令追加 menu 配置：

```typescript
menu: [{
  id: CHAT_CONFIG_MENU_ID,  // 'workbench.chat.menu.config'
  when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals('view', ChatViewId)),
  order: 10,
  group: '3_configure'
}]
```

**改动 (b) 设置面板顶级分类:**
在 `settingsLayout.ts` 的 `tocData.children` 中，在 `chat` 之后添加新的顶级节点：

```typescript
{
  id: 'directorCode',
  label: localize('directorCodeAI', "Director Code AI"),
  settings: ['directorCode.*'],
  children: [
    {
      id: 'directorCode/provider',
      label: localize('dcProvider', "Provider"),
      settings: ['directorCode.ai.provider', 'directorCode.ai.model', 'directorCode.ai.baseURL']
    },
    {
      id: 'directorCode/advanced',
      label: localize('dcAdvanced', "Advanced"),
      settings: ['directorCode.ai.maxTurns', 'directorCode.ai.maxTokens', 'directorCode.ai.maxInputTokens']
    }
  ]
}
```

### 工作项 C: Provider 体系重构（问题 4, 5, 9）

**目标:** 从「3 个硬编码 Provider + 10 个硬编码模型」变为「可扩展的 Provider + 动态模型列表 + 自定义输入」

**设计:**

- **Provider 分层:** 保留 3 个原生 Provider（Anthropic/OpenAI/Gemini），新增 2 个兼容 Provider 类型:
  - `openai-compatible` -- 兼容 OpenAI API 的第三方服务（DeepSeek, Moonshot, 通义千问, Groq, Together AI, 等）
  - `anthropic-compatible` -- 兼容 Anthropic API 的第三方服务

- **Provider 配置模型:**

```typescript
interface IProviderConfig {
  id: string;               // 'anthropic' | 'openai' | 'gemini' | 'openai-compatible' | 'anthropic-compatible'
  displayName: string;
  apiType: ApiType;
  baseURL: string;          // 可自定义
  apiKey: string;           // 从 SecretStorage 获取
  models: IModelEntry[];    // 内置 + 用户自定义
  supportsCustomModels: boolean;  // 是否允许用户手动输入模型 ID
}
```

- **模型列表增强:**
  - 内置模型保留（用户无需手动填写常见模型）
  - 支持用户自定义模型 ID 输入（输入框 + 下拉列表组合）
  - 每个模型可选配上下文长度限制

**涉及文件重构:**
- [apiKeyService.ts](vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts) -- `SUPPORTED_PROVIDERS` 扩展为可配置列表
- [modelCatalog.ts](vscode/src/vs/workbench/contrib/chat/common/agentEngine/modelCatalog.ts) -- 增加内置预设 + 用户自定义支持
- [providerSettingsWidget.ts](vscode/src/vs/workbench/contrib/chat/browser/agentEngine/providerSettingsWidget.ts) -- UI 大幅改版
- [apiKeysWidget.ts](vscode/src/vs/workbench/contrib/chat/browser/agentEngine/apiKeysWidget.ts) -- 适配新 Provider 体系
- [agentEngine.contribution.ts](vscode/src/vs/workbench/contrib/chat/browser/agentEngine/agentEngine.contribution.ts) -- 配置 schema 扩展

### 工作项 D: Test Connection 修复（问题 7）

**改动点:**
1. `apiKeysWidget.ts` 的 `handleTest()` 方法：从 `IConfigurationService` 读取 `directorCode.ai.baseURL` 并传给 `testConnection`
2. `apiKeyService.ts` 的 `_testOpenAI()`：当提供了 `baseURL` 时，需要正确拼接 URL（避免 `/v1` 重复拼接问题）
3. 测试用的模型也应读取用户当前选择的模型，而非硬编码 `gpt-4o-mini`

### 工作项 E: 上下文长度配置（问题 6）

**改动:**
- 新增配置项 `directorCode.ai.maxInputTokens`（上下文窗口大小），影响 compact 触发阈值
- 在 `providerSettingsWidget.ts` 中展示上下文长度设置
- `agentEngine.ts` 中的 `shouldAutoCompact()` 使用此值而非仅依赖 `MODEL_CATALOG` 中的 `maxInputTokens`

### 工作项 F: OAuth/订阅预留（问题 8）

**当前阶段:** 设计预留接口，不实现完整 OAuth 流程

**设计:**
- 在 `apiKeyService.ts` 中为认证方式增加类型区分：

```typescript
type AuthMethod = 'api-key' | 'oauth' | 'none';
interface IProviderAuth {
  method: AuthMethod;
  apiKey?: string;
  accessToken?: string;  // OAuth token
}
```

- 在 Settings UI 中为每个 Provider 增加认证方式选择
- 在 `directorCodeSettingsEditor.ts` 中预留「连接到服务/登录」按钮位置
- 完整 OAuth 流程（Anthropic Console OAuth, OpenAI OAuth 等）留到后续实现

---

## 实施优先级与排期

| 优先级 | 工作项 | 预估工时 | 说明 |
|--------|--------|----------|------|
| P0 | D: Test Connection 修复 | 0.5 天 | 修改 2 个文件，最简单且用户痛点明显 |
| P0 | A: 品牌残留 + 更新修复 | 1 天 | 解决安装路径和更新崩溃问题 |
| P1 | B: Settings UI 入口 | 1 天 | 2 个新入口，改动集中 |
| P1 | C: Provider 体系重构 | 3-4 天 | 核心重构，涉及 6+ 文件 |
| P2 | E: 上下文长度配置 | 0.5 天 | 新增 1 个配置项 + 使用处改动 |
| P2 | F: OAuth 预留 | 1 天 | 接口设计 + UI 预留 |

**总计: 约 7-8 天**
