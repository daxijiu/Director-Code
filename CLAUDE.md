# CLAUDE.md - Director-Code replay source guide

> 每次开始工作先确认当前分支和 `git status --short`。不要把生成后的 VS Code
> 源码树当作长期源码真相；它只是不稳定的调试和验证工作区。

## 当前阶段

- 当前主线是 P2: 将 replay 基线从 VS Code/VSCodium 112 升级到 116，并在此基础上继续修复 Director Code 运行时问题。
- 112 的物理参考验证已经完成。116 及后续升级不再依赖物理参考目录，正确性来自 replay、expected contracts、targeted tests、compile/build smoke 和人工 packaged-build 验证。
- 当前 116 profile 是 `docs/upgrade/profiles/116-stable-win32-x64-client.json`。

## Canonical Source

Director-Code 的长期源码真相是 replay control plane，而不是 materialized tree。

当前 116 相关 canonical 输入包括：

- `docs/upgrade/profiles/116-stable-win32-x64-client.json`
- `patches/series.116.json`
- `patches/replay/*.116.patch`
- `docs/upgrade/product-overrides/116-stable-win32-x64-client.json`
- `docs/upgrade/expected/116-stable-win32-x64-client/*.json`
- `docs/upgrade/reports/116-stable-win32-x64-client/*.json`
- `docs/upgrade/manifests/116-stable-win32-x64-client.canonical.json`
- `scripts/upgrade/` 下的 materialize、patch generation、validation scripts

生成后的工作区是：

```bash
vscode.generated/layers/director/vscode
```

这个目录允许用于快速调试、局部验证、编译和手动试验。任何最终要保留的修改都必须回写到 Director replay patch 或对应的 replay control file 中。一个 phase、bugfix 或 release candidate 不能只依赖手改过的 `vscode.generated` 内容完成。

## Replay Landing Rule

后续所有 Director 相关源码修改必须满足以下规则：

1. 可以先直接改 `vscode.generated/layers/director/vscode` 来调试和验证。
2. 调试验证通过后，必须把差异转成 Director replay patch。
3. 如果新增 patch stage，必须同步更新 `patches/series.116.json`、active profile 和 `scripts/upgrade/generate-director-patches.mjs` 的 stage/path classification。
4. 若修改影响 product/package/server manifest/expected contracts，必须同步更新 `docs/upgrade/expected/...`、product override、canonical manifest 或对应 report。
5. 完成前必须至少运行 profile-scoped replay validation，不能只说生成目录里能跑。

推荐核对命令：

```bash
node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
```

发布候选或阶段收口时还要从 clean upstream inputs 重新 materialize：

```bash
bash scripts/upgrade/materialize-vscode.sh \
  --profile docs/upgrade/profiles/116-stable-win32-x64-client.json \
  --target vscode.generated \
  --up-to-layer director \
  --force
```

## 116 Patch Stage Ownership

当前 116 replay stage 语义：

1. `001-vscodium-layer.116.patch`: VSCodium aggregate layer，不属于 Director 自有改动。
2. `002-director-branding.116.patch`: 品牌、资源、文本、产品体验漂移。
3. `003-director-product-build-release.116.patch`: product/package/server manifest、gulp、Windows installer、release/build wiring。
4. `004-director-agent-engine.116.patch`: Director agent harness、model/tool bridge、agent engine、language-model/tool service integration、MCP 相关 agent paths。
5. `005-director-chat-built-in-mode.116.patch`: built-in chat mode、Copilot commercial-flow bypass、chat setup/status/model picker/agent session UI entry points。
6. `006-director-text-polish.116.patch`: 小范围文本和 prompt polish。
7. `007-director-tool-layer.116.patch`: Director-owned tool registry、mode policy、migration report/test layer、read-only workspace/GitHub v1 context tools。Phase 1-2 gates 已完成。

计划中的后续新增 stage：

- `008-director-chat-editing.116.patch`: Chat Editing UI contract、reviewable edit progress、shared edit adapter、`create_directory` review transaction。
- `009-director-edit-tools.116.patch`: 仅在 edit tool 实现足够大时拆出，否则并入 `008`。

## 当前 116 重要事实

- 116 空白 Workbench 的根因是 `defaultChatAgent.provider` 覆盖不完整。VS Code 116 启动时读取 `defaultChatAgent.provider.enterprise.id`，所以 Director 必须保留完整 provider object shape，禁用 provider 也要保留空字符串字段。
- 这个修复已经落在 `003-director-product-build-release.116.patch`、expected product JSON 和 `validate-product-overrides.mjs` 中。后续不得只在 materialized `product.json` 中修。
- 重复构建入口是 `scripts/build-director-116.ps1` 或 `scripts/build-director-116.cmd`。默认会 materialize 116 Director tree、安装依赖、编译、构建 installer 并复制到 `artifacts/out/stable/win32-x64`。
- Director settings 入口仍需要并入 VS Code 116 的 Agent Customizations 界面，计划文件是 `docs/upgrade/116-agent-customizations-director-settings-plan.md`。
- 当前大优化计划是 `docs/upgrade/116-inline-mermaid-runtime-regression-fix-plan.md`，覆盖 Mermaid runtime、inline chat、Ask/Edit/Agent mode routing、Chat Editing UI、工具层复刻和 GitHub v1 read-only repo context。
- Phase 2 read-only tool layer 已完成并 replay-backed：`read_file`、`list_dir`、`file_search`、`grep_search`、`get_errors`、`get_changed_files`、`view_image`、`github_repo` 均由 Director-owned 工具提供，落在 `007-director-tool-layer.116.patch`，注册 hook 的小改动落在 `004-director-agent-engine.116.patch`。
- 下一波按计划进入 Phase 3 Chat Editing contract；不要在 reviewable edit contract 之前暴露 write/edit/create/delete 工具。

## Build And Package

优先使用封装脚本：

```powershell
.\scripts\build-director-116.ps1
```

或：

```cmd
.\scripts\build-director-116.cmd
```

`-SkipReplay` 只允许用于快速本地调试，不能用于 release candidate/package acceptance。

## Legacy 112 Notes

112 replay baseline 已验证通过，相关历史命令仍可参考 `docs/upgrade/112-replay-baseline-handoff.md`。当前不要把旧 `vscode/` 物理参考目录作为 116 及后续正确性来源。
