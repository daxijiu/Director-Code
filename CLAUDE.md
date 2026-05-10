# CLAUDE.md - Director-Code P1 replay baseline guide

> 每次开始工作先确认当前分支和 `git status --short`。P1 期间不要修改
> `master`，不要把 `vscode/` 当作 active source。

## 当前源码模型

Director-Code 的 canonical source 是 replay control plane：

- `patches/series.112.json` 与 `patches/`
- `src/` overlay
- `product.json`、`upstream/`
- `docs/upgrade/` profiles、schemas、manifest、reports
- `scripts/upgrade/` materialize、guard、validation scripts

本地 `vscode/` 只允许作为 frozen read-only reference snapshot。任何脚本如果解析
到该目录，必须 hard fail 或 dry-run 退出。实际开发和验证目录是：

```bash
vscode.generated/layers/director/vscode
```

## Materialize

```bash
bash scripts/upgrade/materialize-vscode.sh \
  --profile docs/upgrade/profiles/112-stable-win32-x64-client.json \
  --target vscode.generated \
  --up-to-layer director \
  --force
```

生成后进入 active workspace：

```bash
cd vscode.generated/layers/director/vscode
npm install
npm run gulp -- transpile-client-esbuild
```

## P1 验收

```bash
node scripts/upgrade/validate-all.mjs
node scripts/upgrade/check-reference-drift.mjs
node scripts/upgrade/check-workflows.mjs
git diff --check
```

`check-reference-drift.mjs` 依赖本地 frozen reference 或 reference archive；fresh
clone 中没有 reference 时，CI/workflow 只运行 schema、matrix、workflow 和
materialize guard。

## 产物路径

Canonical release/package 输出目录固定为：

```bash
artifacts/out/{quality}/{platform}-{arch}/{target}/
```

`assets/`、`VSCode-*`、`vscode-reh-*` 是 legacy root outputs，只允许作为 ignored
local artifacts，不能作为 P1 workflow 的 canonical 输出。

## 阶段边界

- P1 只收口 VS Code `1.112.0` replay baseline。
- P2 才做 `112 -> 116`。
- P3 才做 `116 -> 1.119`。
- 本阶段不得引入 `1.120`。
