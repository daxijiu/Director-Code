# Director Code Settings Editor Lifecycle Audit (D4)

日期：2026-05-07

## 范围

本次只审计自研 `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeSettingsEditor.ts`，不扩展到上游 `EditorPane` 基类。

审计对象：

- `DirectorCodeSettingsEditor.createEditor()`
- `DirectorCodeSettingsEditor.setInput()`
- `DirectorCodeSettingsEditor.layout()`
- `DirectorCodeSettingsEditor.dispose()`
- 子部件：`DirectorCodeStatusBar`、`ProviderSettingsWidget`、`ApiKeysWidget`、`OAuthWidget`

## 结论

未发现必现 listener 泄漏或 `setInput()` / `layout()` 重入竞态。

已补一处低成本生命周期兜底：`createEditor()` 和 `dispose()` 现在都会通过 `clearEditorWidgets()` 统一清理 `editorDisposables`、移除旧 `bodyContainer`、清空子 widget 引用。这样即使未来出现 editor DOM 异常重建，也不会保留旧 DOM 引用或旧 widget listener。

## 审计记录

- `createEditor()`：子 widget 均通过 `editorDisposables.add(...)` 挂载，包括 status bar、provider settings、API keys、OAuth widget，以及 provider 配置变化监听。重复创建前先调用 `flushPendingWrites()`，再统一 `clearEditorWidgets()`。
- `editorDisposables.clear()`：会释放 status bar / provider settings / API keys / OAuth widget 内部注册的配置、认证、API key 等事件监听。
- `setInput()`：只调用 `super.setInput(...)`，然后在已有 `dimension` 时重新 `layout()`；不访问子 widget，不依赖异步 DOM 初始化结果。
- `layout()`：保存最新 `Dimension`，仅在 `bodyContainer` 存在时写入高度；`bodyContainer` 未创建或已清理时是 no-op。
- `dispose()`：先触发 pending settings flush，再统一清理 editor 子部件，最后调用 `super.dispose()`。

## 验证

- `npm run gulp -- transpile-client-esbuild`
- `npm run test-node -- --runGlob "vs/workbench/contrib/chat/test/common/agentEngine/**/*.test.js"`

上述验证用于确认生命周期兜底没有引入类型或 agentEngine 回归。D4 以审计记录收口，不新增高成本 EditorPane 集成测试。
