# Director-Code Thin Layer Refactor Plan (Deprecated)

> Deprecated on 2026-05-14. This draft became too broad after several review rounds and is superseded by `docs/upgrade/director-thin-layer-refactor-plan-v2.md`. Keep this file only as historical context; do not implement from it.

## Summary

保留 `profile + replay + canonical manifest` 作为发布真相，继续使用 VS Code -> VSCodium -> Director 的三层来源模型，但把 Director 业务逻辑从上游 chat/agent 路径中迁出，形成更薄的上游 patch 面。

工具层优先让 read/search/context 工具向 Copilot `toolReferenceName` 的 model-facing 名称靠拢。执行实现、权限策略、路径边界、reviewable edit 和 mode allowlist 仍由 Director 控制。

## Key Changes

- **源码形态**：不切纯 fork；发布和 CI 仍只认 replay/profile/canonical。`vscode.generated` 继续只是调试/验证产物。
- **Director 模块化**：将 agent harness、model provider、BYOK、tool registry/tools、mode routing、editing adapter、settings UI 逐组迁移到 `src/vs/workbench/contrib/directorCode/`。
- **上游文件薄化**：原 VS Code chat/agent 文件只保留 registration、import hook、bridge call、product/defaultChatAgent 兼容入口。
- **工具模块迁移与命名切换同波完成**：第一波直接做 read/search/context tool registry/tools 的 `directorCode/` extraction 和 Copilot `toolReferenceName` cutover，例如 `readFile`、`listDirectory`、`fileSearch`、`textSearch`、`problems`、`changes`、`viewImage`。
- **编辑工具策略**：reviewable edit 相关能力继续使用现有 Director-owned 工具面，不追 Copilot edit tool parity。`editFiles` 在 Copilot 116 中是 placeholder/toolset label，不作为 Director model-callable tool 暴露。
- **工具调研先行**：实施每个工具前必须先输出逐项调研报告，确认上游名称、schema、常用参数、Director 安全策略、返回格式差异和实现难度。权威来源是 clean VS Code upstream 的 `extensions/copilot/package.json`，不是 VSCodium/Director layer；本仓优先读取 `vscode.generated/layers/vscode/vscode/extensions/copilot/package.json`，未 materialize 时读取 `.cache/upstreams/vscode/<tag>/extensions/copilot/package.json`。该 package 只作为静态名称/schema 参考，不得恢复、依赖或打包 Copilot extension runtime。
- **产品去商业化声明式维护**：品牌、installer、gallery、update、defaultChatAgent、商业入口 gating 优先落到 product override、owned-key allowlist、expected contracts 和少量稳定 hook。
- **VSCodium 层保留**：继续把 VSCodium 作为 lower layer，不在本轮重写其生成机制；只增强审计和隔离，避免混入 Director 逻辑。

## Implementation Phases

### 1. Baseline And Inventory

- 固化当前 116 状态：现有 Phase 0-6 报告、package regression、installer hash、tool parity report。
- 生成 `director-surface-inventory.md`，按 `must-touch upstream hook`、`Director-owned logic`、`declarative product config`、`defer/remove` 分类当前 Director patch surface。
- 更新 replay path classification 规则，确保后续 `directorCode/` 新目录能稳定落入正确 patch stage。
- 最终 canonical replay 不新增 `010` 搬迁 stage；迁移后的文件按语义回写到现有 `004`、`005`、`007`、`008`、`009` stages。开发过程中允许临时本地 patch，但不得进入最终 series。
- `directorCode/` 新目录 stage 归属固定如下：
  - agent loop、message normalization、progress bridge、model provider、BYOK、settings：`004-director-agent-engine.116.patch`
  - chat built-in mode、Agent Customizations bridge、commercial-flow gating：`005-director-chat-built-in-mode.116.patch`
  - read/search/context tool registry 和 read-only tool facade：`007-director-tool-layer.116.patch`
  - Chat Editing adapter 和 shared reviewable edit protocol：`008-director-chat-editing.116.patch`
  - Director-owned reviewable edit tools：`009-director-edit-tools.116.patch`

### 2. Tool Parity Research Gate

- 逐项调研当前可迁移工具，优先 read/search/context 低风险组。
- 工具名称唯一准绳是 Copilot `toolReferenceName`；VS Code UI 文本只作为校验输入，internal `ToolName` 不作为 Director model-facing 名称来源。
- 每个工具报告必须写明：VS Code UI 名称、上游 `toolReferenceName`、实际 schema、Director 当前工具、参数映射、最终 accepted input schema、ignored/rejected fields、返回格式策略、安全限制、mode 暴露策略、最终状态。
- 第一批调研报告固定落点：`docs/upgrade/reports/116-stable-win32-x64-client/tool-facade-research.md`。第一批使用一个总表；只有后续工具复杂度明显增大时才按工具拆分。
- 每个工具的最终状态只能是：`cutover-now`、`temporary-exposed-legacy-exception`、`defer-hidden`、`drop`。第一批除 `fetch`/`githubRepo` 外不得使用 `temporary-exposed-legacy-exception`。
- 第一批调研目标：`readFile`、`listDirectory`、`fileSearch`、`textSearch`、`problems`、`changes`、`viewImage`、`fetch`、`githubRepo`。
- `fetch` 和 `githubRepo` 必须进入第一批调研；是否同批实现由调研报告决定，因为它们涉及网络/远端仓库语义。
- `fetch` 和 `githubRepo` 是当前用户可用上下文能力，不允许因为暂未完成上游名切换而从 model-facing allowlist 消失。若调研报告判定不能同批切换，必须记录为 explicit exposed legacy exception，并给出 `blocker`、`ownerStage`、`targetCutoverWave`、下一波重新评审要求和切换条件。
- Reviewable edit 工具不进入第一批 Copilot toolReferenceName cutover。本计划不实现 Copilot edit tool parity；只保留 `apply_patch`、`replace_string_in_file`、`multi_replace_string_in_file` 作为 Director-owned model-facing edit tool surface，由后续 edit-tools 内部重构保持 reviewable contract。
- `editFiles` 只记录为上游 placeholder/toolset label，不进入 Director 第一批 model-facing 工具，也不作为 Director edit tools 的聚合入口。
- browser、notebook、memory、runCommand、installExtension、newWorkspace 只做 inventory，默认 defer，不进入第一批实现。

### 3. Tool Module Extraction And Name Cutover

- 将第一批 read/search/context 工具 registry/tools 迁移到 `directorCode/`，并在同一波把 model-facing 名称切到 Copilot `toolReferenceName`。
- 删除本波 cutover 工具的旧 snake_case model-facing 暴露；prompt、文档、测试快照、tool migration report 和 mode-routing docs 中的相关模型可见工具名必须同步切换。内部函数名可以保留或逐步重命名，但模型不可见。
- 参数接收对齐上游常用参数；安全策略、路径限制、结果 cap、confirmation、reviewable edit 由 Director 实现决定。
- 每个工具组切名必须一次性完成 registry、schema adapter、prompt/docs/tests/reports 同步；该波结束时本波 cutover 工具的旧 snake_case model-facing 名称必须为零。
- `fetch`/`githubRepo` 的功能暴露优先级高于名称纯净度：若不能同波切到 `fetch`/`githubRepo`，允许作为调研报告记录的 temporary exposed legacy exception 留在 allowlist，直到下一波完成 cutover；不得静默隐藏或移除。

### 4. Director Module Extraction

- 逐组迁移，不一次性搬迁。
- 第一组已由 Phase 3 覆盖 read/search/context tool registry/tools；第二组迁移 Director-owned editing adapter/edit tools，不做 Copilot edit tool parity，并只保留 `apply_patch`、`replace_string_in_file`、`multi_replace_string_in_file` 作为 model-facing edit tools；第三组迁移 agent loop/message normalization/progress bridge；第四组迁移 provider/BYOK/settings。
- 每组迁移完成后回写现有语义 replay patch、更新 stage ownership、运行 targeted tests。
- 原 chat/agent 路径只允许薄 hook；新增业务逻辑必须进入 `directorCode/`。
- 薄 hook 的定义：上游 chat/agent 文件只允许 registration、import hook、bridge call、context/product compatibility glue；不得新增 provider、tool schema、prompt、retry、streaming、edit policy 等 Director 业务逻辑。

### 5. Declarative Product Cleanup

- 收拢 product/package/server manifest、installer 元数据、gallery/update/default links 到 override 和 expected contracts。
- 用户可见 Microsoft/GitHub/Copilot 商业入口不得残留，源码内部兼容名不作为 grep gate 失败依据。
- 保留 OSS attribution、license、必要内部 API 名称和 VS Code 兼容字段。
- 商业/品牌 grep gate 的 documented allowlist 固定为 `docs/upgrade/director-commercial-name-allowlist.116.md`。新增允许项必须说明原因、可见性、是否用户可达、计划清理条件。
- grep gate 只覆盖用户可见路径和打包输出：product/package/server manifest、installer metadata、menus/settings/UI 文案、welcome/getting-started/chat setup/status/model picker 等用户可达界面。默认不扫描 upstream cache、`docs/expired`、内部源码符号、测试 fixture 或历史迁移文档。
- Product Cleanup 阶段必须生成 `docs/upgrade/reports/116-stable-win32-x64-client/commercial-name-grep-report.md`。第一版允许手工报告，不要求先新增脚本；报告必须列出扫描路径、关键词、执行命令、命中摘要、allowlist 对应项和未解释命中数。默认关键词为 `Copilot`、`GitHub Copilot`、`Microsoft`、`Visual Studio Code`、`VS Code`；其中兼容性、license、OSS attribution 或内部 API 所需命中必须进入 allowlist。所有命中要么消除，要么在 allowlist 中解释；未解释命中视为失败。

### 6. Upgrade Dry Run

- 以 117 stable 或下一个可用上游版本做 dry-run。
- 对比重构前后的冲突文件、冲突 hunk、chat/tool/model/provider 相关冲突、人工 product 判断数量。
- 若冲突仍大量散落在上游 chat 文件，继续模块集中化；不因此切纯 fork。

## Test Plan

- 每阶段运行 `validate-series`、`validate-product-overrides`、`expected-contracts`。
- 涉及源码迁移后运行 clean materialize、`npm run compile-check-ts-native`、`npm run gulp -- transpile-client-esbuild`。
- 工具切名阶段新增测试：model-facing 名称快照、schema 参数映射、Ask/Edit/Agent/Inline allowlist、本波 cutover 工具旧 snake_case 不再暴露、`editFiles` 不作为 model-callable tool 暴露。
- 若 `fetch`/`githubRepo` 作为 temporary exposed legacy exception 保留，测试必须证明它们仍然 model-facing，并且报告中存在对应 exception 记录。
- 编辑阶段回归：Chat Editing adapter、Director-owned reviewable edit tools、inline edit smoke。
- 产品阶段回归：defaultChatAgent provider shape、商业入口 grep gate、packaged product.json smoke。
- 最终 package/regression smoke 继续使用 `scripts/build-director-116.ps1` 或 `.cmd`；manual installer acceptance 仍由用户侧确认。

Default command templates:

```powershell
node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
```

```bash
bash scripts/upgrade/materialize-vscode.sh \
  --profile docs/upgrade/profiles/116-stable-win32-x64-client.json \
  --target vscode.generated \
  --up-to-layer director \
  --force
```

```powershell
Push-Location vscode.generated\layers\director\vscode
npm run compile-check-ts-native
npm run gulp -- transpile-client-esbuild
npm run test-browser-no-install -- --grep "Director (Tool Registry|Read-Only Workspace Tools|Chat Editing Adapter|Edit Tools|Chat Mode Routing)"
Pop-Location
```

```powershell
node scripts/upgrade/canonical-manifest.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
```

## Assumptions

- 第一批 read/search/context 工具不保留旧 snake_case 工具名兼容期；切换和测试在同一阶段完成。
- `fetch`/`githubRepo` 是唯一允许通过调研报告记录 temporary exposed legacy exception 的工具组；功能暴露不能为了名称切换而回退，下一波开始前必须重新评审或完成 cutover。
- Reviewable edit tools 继续使用 Director-owned model-facing surface，只保留 `apply_patch`、`replace_string_in_file`、`multi_replace_string_in_file`，不进入 Copilot edit tool name cutover；本计划不实现 Copilot edit tool parity。
- 工具 schema 第一阶段只强制对齐名称和常用参数；返回格式和完整 schema parity 由逐项调研报告决定，且报告必须先于代码实现完成。
- patch surface 暂不设数字指标；硬要求是 Director 核心业务逻辑迁出原上游 chat/agent 文件，上游文件最终只保留薄 hook。
- 最终 patch series 不新增 `010` refactor stage；重构结果直接体现在现有语义 stage 中。
- VSCodium lower layer 继续保留，不在本轮替换为纯 VS Code fork。
