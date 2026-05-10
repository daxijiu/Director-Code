# Director-Code 112 可重放基线与上游升级准备计划 v26

## Summary
本阶段只收口当前可跑通的 VS Code `1.112.0` 基线，不升级 `116/119`。目标是在 `refactor/112-replay-baseline` 分支建立可重放体系：冻结当前 `vscode/` 为只读 reference，从 clean VS Code 112 + clean VSCodium 112 transform + Director-Code delta 重新生成 `vscode.generated/`，并证明生成结果与 reference 在 P1 范围内严格等价。

P1 通过后，当前 `vscode/` 不再作为 active source 维护；最终仓库保留 replay 脚本、patch、overlay、product override、schema/validator、manifest、inventory、CI/workflow 迁移与提交版报告。P2 固定做 VS Code/VSCodium `112 -> 116`，P3 固定做 VS Code `116 -> 1.119`；VS Code `1.120` 不并入本轮 P3，后续另开阶段。

## Key Decisions
- 当前计划落地为 `docs/upgrade/112-replay-baseline-plan.md`，作为本阶段唯一权威文档。
- P1 验收范围：`stable / win32 / x64 / client`，但**所有 legacy 脚本入口、CI/workflows、开发文档入口都必须迁移或阻断**。
- 当前 `vscode/` 施工期只读；freeze 完成前不得运行任何会改动 `vscode/` 的 prepare/build/dev patch 脚本。
- 任何脚本若目标解析到 reference `vscode/`，默认 hard fail。
- `ALLOW_LEGACY_REFERENCE_WRITE=1` 仅允许本地紧急调试；CI/gate 永久禁止。使用后必须写 report marker，且 reference drift check 必须失败并要求重新 freeze。
- 生成目录固定为 `vscode.generated/`；P1 只允许 `--target vscode.generated`。非默认 target 禁止 `--force`，除非显式 `--allow-nondefault-target-force`。
- 默认 `VSCODE_DIR=$WORKSPACE_ROOT/vscode.generated/layers/director/vscode`；目录不存在时提示先运行 canonical materialize，禁止回退到 `vscode/`。
- release/package 产物 canonical 输出目录为 `artifacts/out/{quality}/{platform}-{arch}/{target}/`；示例：`artifacts/out/stable/win32-x64/source/`。`assets/` 仅作为 legacy ignored path。
- `--fresh-cache` 不得删除 `.cache/reference/`，只能清 `.cache/upstreams/`、下载缓存、Electron cache。
- `sub-projects/` 只允许出现在文档/注释参考中；脚本、构建、测试、runtime import 必须为 0；新 README 不再把 `sub-projects/` 描述为仓库组成部分。
- `.claude/settings.local.json` 默认不作为 active replay asset；默认归档为 legacy 或标记 `discard/reference-only`，不得作为新仓库权威配置。
- P1 green 后分两次提交：先提交 replay 体系与证明报告，再提交 remove-active-source，并把 `vscode/`、旧根目录产物加入 `.gitignore`。
- 第二提交使用 `git rm -r --cached vscode`，避免物理删除本地 readonly reference。
- 提交版报告放在 `docs/upgrade/reports/`；原始生成物放在 ignored `artifacts/generated/`。

## Implementation Batches
1. **Freeze Batch**：创建分支，生成 reference archive/manifest，捕获 expected，完成 `.gitignore` 第一批规则与 drift guard。
2. **Schema/Inventory Batch**：新增 schema、Node 自包含 validators、profile、manifest/inventory/report JSON，完成 replay asset inventory。
3. **Layer Batch**：实现 clean VS Code 112、clean VSCodium 112 Layer 1、Director Layer 2 materialize 和 checkpoint。
4. **Replay Equivalence Batch**：生成 patch/overlay/product replay，series validation，postprocess expected，source equivalence report。
5. **Script/Artifact Batch**：迁移脚本、safe-delete、dry-run/offline、`artifacts/out/`。
6. **Workflow/Docs Batch**：迁移 workflows、actionlint/static checks、active docs，归档 legacy docs。
7. **Remove-Source Batch**：`git rm --cached vscode`，fresh clone materialize/build/workflow static verification。

## Implementation Changes
1. **Profiles, Schemas, And Validators**
   - 新增 profile：`docs/upgrade/profiles/112-stable-win32-x64-client.json`，固定 `quality=stable`、`osName=windows`、`platform=win32`、`arch=x64`、`buildTarget=client`、`releaseVersion`、`BUILD_SOURCEVERSION`、`APP_NAME`、`BINARY_NAME`、`VSCODE_QUALITY`、`OS_NAME`、`VSCODE_ARCH`、VS Code tag/commit、VSCodium tag/commit、关键工具版本范围、expected 路径、artifact 路径。
   - materialize 不允许宿主环境悄悄覆盖 profile 中的固定字段；覆盖必须显式传参并写入 report。
   - canonical materialize 命令必须显式使用该 profile；等价于传入固定 profile 中的所有字段。
   - 新增平台映射表：`OS_NAME=windows -> platform=win32`、`OS_NAME=osx -> platform=darwin`、`OS_NAME=linux -> platform=linux`；artifact path 使用 `platform-arch`，legacy env 仍可保留 `OS_NAME`。
   - 新增 JSON Schema：manifest、inventory、series、report、profile、deps mutation allowlist、upstream cache manifest。
   - validators 使用 Node 自包含实现：`scripts/upgrade/validate-*.mjs`，不新增 npm 依赖，只支持受控 schema 子集；schema 禁止使用 validator 不支持的关键字。
   - 所有 validators fail-closed，exit nonzero；所有 gate 读取 JSON，不解析 Markdown。
   - 新增 `.gitattributes`，至少固定 `*.sh text eol=lf`、`*.patch text eol=lf`、`*.json text eol=lf`、schema/profile/report/series 相关文件换行策略；并标记资源/压缩/字体等二进制：`*.png`、`*.bmp`、`*.ico`、`*.icns`、`*.zip`、`*.tgz`、`*.tar`、`*.gz`、`*.zst`、`*.woff`、`*.woff2`、`*.ttf`、`*.otf` 为 binary。
   - checkpoint 验收以 deterministic file manifest hash + git tree hash 为主；checkpoint commit id 仅作调试引用。若生成 commit，必须固定 `GIT_AUTHOR_DATE` / `GIT_COMMITTER_DATE` 与 local identity。

2. **Reference Freeze**
   - 先用当前 ignore 规则生成 reference filelist，再修改 `.gitignore`。
   - reference archive 使用当前工作树存在文件的 union：`outerTracked ∪ innerTracked ∪ innerUntracked(nonignored)`。
   - source list 至少来自：`git ls-files vscode`、`git -C vscode ls-files`、`git -C vscode ls-files --others --exclude-standard`、ignored-untracked audit。
   - 每个文件记录 `outerTracked`、`innerTracked`、`innerUntracked`、`innerIgnored`、`outerOnly`；final working-tree bytes 是内容真相，staged/index 状态只记录不作为内容真相。
   - deleted paths 进入 manifest/status，但不进入 archive；equivalence 比较时要求 generated 同样不存在，除非 inventory 标记 `defer-non-p1` 或 `discard`。
   - ignored 文件默认不归档；若发现源码/配置依赖必须移出 ignore 或显式纳入 inventory。
   - 从 frozen filelist 创建本地忽略归档：`.cache/reference/112/vscode-reference.tar.zst`；不支持 zstd 时 fallback `.tar.gz`。
   - manifest 记录实际 archive 格式、工具版本、压缩命令、archive hash。
   - 新增 `docs/upgrade/112-reference-manifest.json`，记录 outer commit、inner HEAD/branch/status、env allowlist、archive hash、tracked/untracked/deleted、file raw sha、normalized sha、mode、symlink、source class、outer/inner provenance。
   - freeze 时捕获 source-level expected：`docs/upgrade/expected/112-stable-win32-x64-client/product.expected.json`；动态 package artifact 不作为 expected 来源。
   - 对高风险 postprocess JSON 额外捕获 expected 或 report JSON diff：`package.json`、`resources/server/manifest.json`、announcements。
   - freeze 后立刻校验 reference hash 未变；此后 reference hash drift 直接失败。
   - `.gitignore` 第一提交增加 `.cache/`、`vscode.generated/`、`artifacts/generated/`、`artifacts/out/`；第二提交增加 `vscode/`、`VSCode-*`、`vscode-reh-*`、`assets/` 等旧根目录产物防污染规则。
   - freeze 后运行 secret/path hygiene scan、case-insensitive path collision scan；提交物中出现疑似 token/key、本机绝对路径、路径大小写冲突或未 allowlist env 时阻断.

3. **Inventory And Equivalence Scope**
   - 新增机器可读 `docs/upgrade/112-change-inventory.json`，作为 gate 真相；`.md` 只做人类摘要。
   - replay asset inventory 覆盖规则：`git ls-files` 中除 `vscode/**` 外的所有 tracked 文件必须进入 replay asset inventory；目录列表只作说明。
   - replay asset inventory 必须标记 `vscodium-derived`、`director-owned`、`reference-only`、`legacy-doc`、`discard` 等来源/处置。
   - `.claude/settings.local.json` 必须在 replay asset inventory 中标记为 `discard` 或 `reference-only/legacy`；不得保留为 active executable/config authority。
   - 每个 executable replay asset 增加 `scriptScope`：`vscode-mutating`、`artifact-producing`、`release-side-effect`、`standalone-tool`、`docs-only`。`vscode-mutating`/`artifact-producing` 强制 `VSCODE_DIR`/reference guard；`release-side-effect` 强制 dry-run/offline；`standalone-tool` 做 parse/static/hygiene。
   - 每个 reference 路径、generated 路径、replay asset 必须进入 inventory/report；任何 `unknown` / `unclassified` 路径直接失败。
   - gate 分目标集：`replay-assets`、`reference-vscode`、`generated-vscode`；脚本/workflow/doc grep 只扫 `replay-assets`，不扫 tracked reference `vscode/`。
   - 第一提交 gate 保留 tracked reference 但不把它纳入 replay-assets grep；第二提交 gate 以 removed-reference 形态重新跑。
   - 等价 key 使用 VS Code source-relative path，例如 `src/vs/...`，不使用物理根路径。
   - 每个路径必须有 `sourceClass` 与 `equivalenceScope`。
   - `sourceClass`：`upstream-vscode`、`vscodium-derived`、`director-owned`、`local-build-fix`、`generated-artifact`、`reference-only`。
   - `equivalenceScope`：`p1-strict`、`defer-non-p1`、`discard`。
   - `defer-non-p1` 仅允许 CLI、server、installer、packaging、release-only 或 provenance 暂缺文件；必须出现在 replay report，不得隐式跳过。
   - 功能输出可 `defer-non-p1`；脚本入口不可 defer，必须路径安全、不能写 reference。

4. **Baseline Layers**
   - Layer 0：clean VS Code `1.112.0`。
   - Layer 1：pure VSCodium `1.112.01907` transform。
   - Layer 2：Director-Code delta。
   - 新增 `upstream/vscodium-stable.json` 与 `docs/upgrade/vscodium-layer.112.json`。
   - `upstream/stable.json` 与 `upstream/insider.json` 保持 `{ tag, commit }` backward-compatible；新增字段只能 additive。
   - `.cache/upstreams` 每个 checkout/archive 必须有 manifest：remote URL、tag、commit、archive sha、fetch time、clean status。
   - VSCodium layer 只能来自 `.cache/upstreams/vscodium/1.112.01907` 的 clean checkout/tarball；不得用当前仓 `patches/` 或 `src/` 反推 pure VSCodium。
   - 若 clean VSCodium tag 没有标准 metadata 指向 VS Code commit，依次从 VSCodium upstream files/scripts 读取；仍读不到则阻断并要求人工写入 `docs/upgrade/vscodium-layer.112.json`。
   - Layer 1 只允许三类 transform：应用到 VS Code tree 的 patch、复制到 VS Code tree 的 overlay、生成 VS Code tree 内文件的 product/postprocess。根脚本自身不算 Layer 1 transform，归 replay asset inventory。
   - VSCodium layer 机械生成规则：读取 clean VSCodium tag 中影响 materialized VS Code workspace 的 transform，生成 transform 清单、应用顺序、patch hash、overlay hash、product diff。
   - 纯 CI/release/upload 逻辑不进入 Layer 1，只进入脚本矩阵或 upstream report。
   - Layer 1 必须可单独 materialize，并输出 “VS Code 112 -> VSCodium 112” 报告。
   - 若 VSCodium 对应 VS Code upstream 与当前 112 baseline 不一致，阻断并记录原因。

5. **Patch/Overlay/Product Replay**
   - 从 frozen archive 还原临时 reference tree，与 clean/layer1 baseline 做文件级 diff，生成 patch/overlay；不依赖原始 `vscode/.git` index 状态。
   - 新增 `patches/series.112.json` 与 `validate-series`。
   - series 显式记录每个 patch-like 文件的 `enabled`、`status`、`layer`、`stage`、`platforms`、`arches`、`qualities`、`targets`、`order`、`placeholders`；状态仅允许 `enabled`、`disabled`、`deferred`、`archived`。
   - `.patch`、`.patch.yet`、`.patch.no` 以及 helper/user/platform patch 均必须进入 series；不得靠扩展名逃过 validator。
   - validate-series 对缺字段、未知 patch、重复 order、disabled patch 被引用、series 未覆盖 patch-like 文件直接失败。
   - materialize 禁止直接 glob `patches/*.patch`；只能按 series 应用。
   - dev patch 工具 P1 第一阶段默认 hard fail 并提示新工具；P1 green 前再迁移或新增 `scripts/upgrade/patch-dev.sh`，不得保留旧入口可用。
   - 代码改动生成 `--binary --full-index` patch，命名为 `NNN-owner-topic.patch`。
   - 删除文件生成 delete patch；重命名默认按 delete+add，除非 git diff 能稳定表达；mode/symlink 进入 manifest 并参与严格比较。
   - 纯静态大文件优先 overlay；overlay 必须有 allowlist。
   - patch placeholder 替换只写临时 patch 文件，不修改原 patch。
   - 所有 clone/worktree/checkout 命令都用 `git -c core.autocrlf=false ...`，并在 checkout 前设置 local config。
   - final apply 使用 `git -c core.autocrlf=false apply --index --whitespace=nowarn`；禁止 `--ignore-whitespace`、`--3way`、`--reject`。
   - 固定 stage 顺序：checkout -> VSCodium transform -> Director overlay -> product merge/delete -> patch series -> deps if needed -> postprocess -> source equivalence -> build。
   - `undo_telemetry.sh`、package version、server manifest、announcements 等旧 postprocess 必须显式迁移到 postprocess stage。
   - 新增 `docs/upgrade/deps-source-mutation-allowlist.112.json`，默认空；deps 前后对 tracked source 做 diff，除 allowlist 外有变化直接失败。
   - 每个 stage 记录 deterministic file manifest hash + git tree hash；checkpoint commit id 仅作调试引用。
   - P1 strict equivalence 比较 postprocess 后、build 前的 tracked source checkpoint；允许 deps 已安装，但比较时排除 `node_modules`、`.build`、`out*`、artifact 目录。
   - product 流程固定：upstream product -> VSCodium/Director setpath/override -> root product merge -> `product.delete.112.json` 删除 -> expected compare。
   - JSON delete 使用 JSON Pointer；缺失路径为 no-op 并记录，数组删除按精确 index 处理，禁止模糊匹配。
   - 生成 product result，与 expected 文件严格比较。
   - 除 expected 文件外，P1 strict 由 full source checkpoint hash 覆盖；关键 JSON 可额外生成 expected 文件。

6. **Materialize Script**
   - 新增 `scripts/upgrade/materialize-vscode.sh`。
   - P1 唯一标准命令：
     `scripts/upgrade/materialize-vscode.sh --profile docs/upgrade/profiles/112-stable-win32-x64-client.json --target vscode.generated --up-to-layer director --install-deps --build-artifact --fresh-cache --force`
   - 单次运行同时生成 vscodium/director 两层；只在 director layer 安装依赖并构建。
   - `--up-to-layer director` 包含 lower layers；`--up-to-layer vscodium` 仅用于诊断，不安装依赖、不构建。
   - 构建中间产物预期落在 `vscode.generated/layers/director/VSCode-win32-x64`；package/release/checksum 产物必须 copy/stage 到 `artifacts/out/{quality}/{platform}-{arch}/{target}/`。
   - source artifact 语义固定：release 给用户的 source package 必须是 materialized VS Code source archive，输出到 `artifacts/out/{quality}/{platform}-{arch}/source/`；生成点固定为 postprocess 后、build/deps artifacts 排除后的 source checkpoint，不包含 `node_modules`、`.build`、`out*`、`VSCode-*`，并生成 source archive manifest。replay repo source archive 仅作内部审计，不替代 release source。
   - 所有 canonical 命令按 Git Bash/bash 执行，不按 PowerShell 语义设计。
   - 所有删除/清理命令必须走 safe-delete helper；workspace root 通配符删除直接失败。safe-delete 要求目标非空、已 resolve、位于 allowlist root 内。允许删除范围仅限 `vscode.generated/`、`artifacts/generated/`、`artifacts/out/` 或明确 cache 子目录。
   - materialize 支持两种 verification mode：有 `.cache/reference` 时可运行 `--verify-reference` 做旧 reference 全量等价；fresh clone 无 archive 时默认只做 replay/build/self-check，并在 report 标记 `reference-archive-unavailable`，exit 0；显式 `--verify-reference` 且 archive 缺失时 exit nonzero。
   - fresh clone 标准验收为有网 materialize；无网只要求已有 `.cache/upstreams/` 时可复现。

7. **Script/Workflow/Docs Migration Matrix**
   - 所有入口先解析 `WORKSPACE_ROOT`、`VSCODE_DIR`、`ARTIFACTS_OUT`、`SKIP_PREPARE`，并执行 reference guard。
   - reference guard 使用 resolved absolute path；Windows 下做大小写归一，避免路径别名绕过。
   - release/package 输出统一写 `artifacts/out/{quality}/{platform}-{arch}/{target}/`；`assets/` 仅 legacy ignored，不再作为 canonical 输出。
   - target 子目录至少包括 `client`、`reh`、`reh-web`、`cli`、`installer`、`checksums`、`source`。
   - executable replay assets 覆盖所有 `.sh`、`.ps1`、`.cmd`、`.bat`、`.mjs`、`.js`、`.ts`、`.py`、Dockerfile、Makefile、workflow YAML 中的可执行入口。
   - 必须覆盖根脚本、`dev/*`、`build/**`、`icons/build_icons.sh`、`stores/**/check_version.sh`、`font-size/generate-css.ts`、smoke/verify `.mjs`。
   - `utils.sh` 作为 sourced helper 验收 shell parse 与 sourced function path test，不要求单独执行。
   - `.ps1` / `.mjs` / `.ts` / workflow 中的网络、写文件、上传、外部触发也必须满足 dry-run/offline guard。
   - workflow 分类：
     - build/package/release workflows：统一模板为 checkout repo -> setup deps -> materialize -> set `VSCODE_DIR`/`ARTIFACTS_OUT` -> build/package/upload。
     - repo-maintenance/pages/stale/lock/dependabot/issue-template 类：不 materialize，只做 actionlint/hygiene/inventory 分类。
   - workflow 调用 `.sh` 的 step 必须显式 `shell: bash`；PowerShell 仅用于 Windows 专属签名/系统工具步骤。
   - workflow 迁移旧 `find vscode`、artifact path、cache path、assets path。
   - workflow 至少通过 `scripts/upgrade/check-workflows.sh`；P1 提交版报告要求 build/package/release workflow actionlint 真通过；maintenance workflow 可 degraded。actionlint 固定版本与 checksum，缺失时下载到 `.cache/tools/`，网络不可用则退化为 YAML parse + grep gate 并在 report 标记 degraded。
   - 含副作用 job 用 `DRY_RUN=offline` 静态验证。
   - active docs 清单至少包括 README、README_EN、CLAUDE、`docs/howto-build.md`、本计划。旧 P1/历史文档采用归档策略，移入 `docs/expired/` 或显式 legacy marker；active docs 清单之外的旧文档只移动或加 legacy marker，不逐字重写历史内容。
   - `.cursor`/`.claude` 作为 replay assets 分类；若保留旧路径必须标记 legacy/reference-only。
   - 文档明确 canonical source 是 replay/patch/overlay，`vscode.generated/` 是生成工作区，`vscode/` 仅可作为本地 reference。
   - 文档必须给出新命令：先运行 materialize，再进入 `vscode.generated/layers/director/vscode`。
   - P1 不修历史 product/brand 是指 generated VS Code 内容；README/CLAUDE/开发入口更新不属于 product/brand 修复。
   - 每个脚本/workflow 必须明确：输入目录、输出目录、是否允许 dry-run、是否需要 prepare、是否 client/cli/server/package/release 专用。
   - “全部脚本阻断”定义：所有脚本必须完成路径迁移、reference guard、语法或 dry-run 校验；平台专属真实打包只在环境具备时运行。
   - release/update/upload/外部触发类脚本必须支持 `DRY_RUN=1`；P1 验证只能 dry-run，禁止 GitHub release/upload、GitLab/GitHub trigger、git commit、git push、写 upstream 文件、上传 sourcemap、签名服务调用等副作用。
   - `DRY_RUN=1` 默认允许只读网络；`DRY_RUN=offline` 禁止任何网络。
   - `curl`、`wget`、`gh`、`git push`、`git commit`、upload、external trigger 类命令必须通过 wrapper 或显式 guard 满足 dry-run/offline 约束。
   - workflow/report 只能记录 secret name，不能记录 secret value。
   - grep/hygiene gate 使用目标集，不扫 tracked reference `vscode/` 或 ignored/generated 目录。
   - grep gate 必须检查并解释所有 `cd vscode`、`../patches`、`../product.json`、`../VSCode-*`、`../../VSCode-*`、可执行路径中的 `sub-projects/`。
   - docs/comment 中的 `sub-projects/` 参考允许保留；脚本、构建、测试、runtime import 命中必须为 0。
   - stable 严格等价；insider workflow/script 必须路径迁移和 dry-run 通过，但不要求 product strict equivalence。

8. **Equivalence And Reports**
   - 原始报告生成到 `artifacts/generated/112-stable-win32-x64-client/replay-report.json`。
   - 提交版报告写入 `docs/upgrade/reports/112-stable-win32-x64-client/replay-report.json`，由 sanitizer 从原始报告派生。
   - 新增 `docs/upgrade/report-sanitizer-allowlist.112.json`，明确允许进入提交版报告的 env/report 字段。
   - sanitizer 只保留相对路径、hash、状态、allowlisted env、secret name；禁止本机绝对路径、secret value、非 allowlist env。
   - 提交版报告必须记录原始报告 hash。
   - report 包含 upstream commits、layer deterministic hashes、patch hashes、placeholder env snapshot、product diff、equivalence exclusions、line-ending mismatches、build outputs、script/workflow matrix status。
   - P1 `p1-strict` 路径 raw hash 必须一致；raw 不等但 normalized 相等仍失败，标记为 line-ending mismatch。
   - brand/product/release-only 扫描 P1 report-only，不阻断。
   - secret scan 通过 wrapper 执行：优先 gitleaks 或等价工具；不可用时 fallback 到保守规则并标 degraded；测试 fixture allowlist 可显式登记。
   - checksums/release notes 若需提交留证，固定进入 `docs/upgrade/reports/112-stable-win32-x64-client/`，不得从 `artifacts/out/` 直接提交。
   - 新增真实 upgrade dry-run estimator，不只生成模板；至少输出 112 -> 116 VS Code/VSCodium 与 116 -> 119 VS Code-only 的 auto-apply patch 数、failed patch 数、冲突文件数、冲突 hunk 数、VSCodium layer churn、Director layer churn。
   - estimator 在本机/CI 网络可用时为 P1 required；网络不可用时不阻断 replay 等价，但提交版报告必须标记 `estimator-skipped-network`。
   - estimator 必须记录实际远端 tag/commit、查询时间、source URL。
   - estimator 只能在 `.cache/upgrade-estimator/` 或临时 worktree 中运行，不得复用 `vscode.generated/` 或 reference.

9. **Post-P1 Repository Shape**
   - 第一提交：replay 体系、patch、overlay、schema/validators、manifest、inventory JSON/MD、replay asset inventory、profile、plan、提交版报告、CI/workflow/docs 迁移。
   - 第二提交前运行 `git status --short vscode`，确认没有未归档/未入 manifest 的变化。
   - 第二提交：`git rm -r --cached vscode` remove active source，并在 `.gitignore` 忽略整个 `vscode/` 与旧根目录产物。
   - 第二提交不得物理删除本地 readonly reference；物理删除只作为操作者本地清理，不纳入提交动作。
   - 第二提交验收：fresh clone 后没有预置 `vscode/`，仍可运行 materialize、client build、script/workflow grep gate。
   - 第二提交还必须跑 stable Windows client workflow 的 dry-run/static path，Linux/macOS workflow actionlint 或 degraded workflow check。
   - reference archive 本地 ignored，不提交；未来新 clone 若无 archive，只能依赖已提交 manifest/report，不能重新做旧 reference 全量等价。
   - `artifacts/out/` 永不提交；checksums/release notes 若要提交，必须复制到 `docs/upgrade/reports/` 或等价提交版报告位置。

## Test Plan
- Batch gates：每个 Implementation Batch 独立通过对应 validator/gate 后再进入下一批。
- Profile/schema verification：profile、manifest、inventory、series、report、deps allowlist、upstream cache manifest 全部通过 Node 自包含 schema validator。
- Reference integrity：archive 解包后与 manifest raw sha、symlink target、executable bit、outer/inner provenance 一致。
- Reference drift：freeze 后 reference hash 不变。
- Hygiene verification：提交物无 secret、token、本机绝对路径、未 allowlist env；测试 fixture allowlist 可显式登记；case-insensitive path collision scan 通过。
- Inventory coverage：reference/generated/replay asset 全路径无 `unknown` / `unclassified`；`.claude/settings.local.json` 不作为 active authority。
- Layer verification：clean VS Code 112、clean VSCodium 112 layer、Director layer deterministic hashes 均可复现。
- Patch series verification：`validate-series` 通过；materialize 只消费 `patches/series.112.json`，无直接 glob patch。
- Product verification：生成 product 与 `docs/upgrade/expected/112-stable-win32-x64-client/product.expected.json` 严格一致。
- Postprocess verification：关键 JSON expected 或 JSON diff 覆盖 package/server manifest/announcements。
- Equivalence verification：Director source checkpoint 与 reference 的 `p1-strict` 路径 raw hash 严格一致；所有排除项来自 inventory；无 archive 时仅允许 replay/build/self-check 并标记 unavailable。
- Build verification：在 `vscode.generated/layers/director/vscode` 构建 client，验证 `VSCode-win32-x64` intermediate，并确认 package/release/checksum/source 输出 staged 到 `artifacts/out/`。
- Source archive verification：materialized source archive 来自 postprocess 后 source checkpoint，不含 deps/build/artifact 目录，并有 source archive manifest。
- Test verification：
  - `npm run gulp -- transpile-client-esbuild`
  - `npm run test-node -- --glob 'src/vs/workbench/contrib/chat/test/common/agentEngine/**/*.test.ts'`
  - browser-side agentEngine tests 必须执行；若 runner 不可用，逐项列入 test gap/defer report。
- Safe-delete verification：workspace root 通配符删除被阻断；允许删除目录必须先 resolved path 校验。
- Script/workflow verification：matrix 全部通过；release/update/upload/external trigger 只 dry-run；`DRY_RUN=offline` 禁网络；legacy path grep 无未解释命中。
- Docs verification：README/CLAUDE/active docs 不再把 tracked `vscode/` 或 `sub-projects/` 描述为仓库主体，并包含新 materialize 开发命令；旧文档已归档或标记 legacy。
- Upgrade estimator verification：生成 112 -> 116 与 116 -> 119 的真实 dry-run 改动量报告；网络不可用时报告明确 skip 状态。
- Remove-source verification：`git rm --cached` 后 fresh clone 无 `vscode/` 仍可 materialize/build，并通过 workflow static checks。

## Assumptions
- 当前 `vscode/` 是可信 reference，施工期只读。
- P1 不修历史 product/brand 问题，只报告。
- P1 只保证 stable/win32/x64/client 的 strict equivalence；非 P1 文件必须显式 `defer-non-p1`。
- 本地 reference archive 不提交，因此没有 archive 的新环境不能重跑旧 reference 全量等价。
- VSCodium 当前最新仍按已确认的 `1.116.x` 处理；P2 执行前必须重新确认 VSCodium 是否仍停留在 116。
- P2 固定为 VS Code/VSCodium `112 -> 116`。
- P3 固定为 VS Code `116 -> 1.119`；VS Code `1.120` 不并入本轮 P3，后续另开阶段。
