# 116 Phase 2 Waves Plan

日期：2026-05-15

状态：草案，基于 2026-05-15 Phase 2 调研与后续讨论。

相关调研报告：

- `docs/upgrade/reports/116-stable-win32-x64-client/phase2-acp-agent-integration-report.html`
- `docs/upgrade/reports/116-stable-win32-x64-client/phase2-provider-model-ui-report.html`
- `docs/upgrade/reports/116-stable-win32-x64-client/phase2-plan-mode-report.html`
- `docs/upgrade/reports/116-stable-win32-x64-client/phase2-overall-roadmap-report.html`

## 总体决策

Phase 2 不再定义为单纯的 ACP 接入，而拆成五个 wave：

1. Wave 1: Director Plan Mode Foundation
2. Wave 2: Provider / Model Registry + UI
3. Wave 3: Claude SDK Adapter
4. Wave 4: Generic ACP Adapter
5. Wave 5: Codex Dedicated Decision

核心判断：

- Plan Mode 是下一步最小、最清晰的工程切口。
- Provider / Model Registry + UI 应在正式开放多外部 Agent 入口前完成；该 wave 以 Director Provider Manager 加 VS Code Models Management 对齐为目标，而不是从零重做完整模型管理页。
- Claude Code 不强行 ACP 化，优先走 TypeScript `@anthropic-ai/claude-agent-sdk` 专用 adapter。
- ACP 用作通用外部 Agent 协议层，覆盖 OpenCode、Hermes、Gemini、Codex ACP wrapper 等。
- Codex 单独作为最后的决策 wave，通过实测决定长期接入路径。

架构边界原则：

- Phase 2 长期形态固定为 `Director-owned core + thin VS Code bridge + replayed brand/product layer`。
- 新功能默认进入 `src/vs/workbench/contrib/directorCode/**` 或后续 Director-owned built-in extension；VS Code 上游目录只保留注册 hook、chat/model/tool surface adapter、命令/菜单接线和少量兼容 shim。
- 不用 touched file count 单独判断上游升级风险：品牌化和产品包装会触碰很多文件但改动浅；更重要的指标是 runtime 逻辑是否集中在 Director-owned 模块，以及 upstream chat/API/model 文件是否保持薄桥接。
- Copilot 是参考形态：用户体验可以和 VS Code 深度融合，但产品逻辑尽量集中在 extension-like island，加少量 privileged workbench/API entry points。Director 后续也按这个方向继续收敛。
- Wave 2 Provider/Model、Wave 3 Claude SDK、Wave 4 ACP、Wave 5 Codex 都必须遵循该边界：registry、adapter、secret/OAuth、session policy 和业务逻辑归 Director；VS Code 侧只做必要入口和桥接。
- 必须修改 VS Code 上游 surface 时，优先添加调用 Director-owned service 的小 hook，不在上游文件内堆 Director 业务逻辑。

## Wave 1: Director Plan Mode Foundation

目标：实现 Director 原生 Plan Mode v1，包含 `.director/plans/*.md` 计划文件持久化。

推荐产品形态：

- 默认模式仍是完整 Agent 模式。
- Plan 是用户显式进入的 Agent session 状态，不自动替代默认 Agent。
- Plan 不急着成为 VS Code core 的第四个顶层 `ChatModeKind`。
- 优先作为 Agent/Session 的状态或配置出现，接近 VS Code Agent Host / Claude Code 的 Plan 形态。
- 用户可以明确进入 Plan，看到计划输出，并选择执行、拒绝或补充内容。

术语说明：

- 顶层 `ChatModeKind`：指 VS Code/Director Chat 框里与 Ask、Edit、Agent 同级的核心模式。如果把 Plan 做成顶层模式，就意味着 UI、agent registration、mode routing、tool policy、model picker 和相关测试都要把 Plan 当成第四个 core chat mode。
- Agent/Session 状态：指用户仍在 Agent 入口或一个 Agent session 里，但该 session 进入 `plan` 状态。Wave 1 UI 固定表现为 Agent/Plan chip 或 toggle；底层切换到 Plan tool policy 和 Plan prompt。这个方式更接近 VS Code Agent Host 与 Claude Code 的设计，侵入更小。

范围：

- 新增 Director Plan policy。
- Plan 状态允许本地 read-only tool layer 与网络只读检索能力，用于读取工作区、diagnostics、changed files、GitHub/远程文档等规划所需上下文。
- Plan 状态只允许通过 Plan-only `director_present_plan` 触发 `.director/plans/*.md` 写入；该路径是 Wave 1 唯一计划文件写入白名单。
- Plan 文件写入必须与普通 edit tools 分离，不能借用通用 `createFile` / `apply_patch` 之类 edit tool 绕过 Plan 限制。
- Plan prompt / reminder 明确要求先理解、必要时把待确认事项写入计划的 Open Questions、输出可执行计划、等待用户决策。
- Plan response 支持执行 / 拒绝 / 补充内容三个用户动作。
- 用户选择执行后进入 `executing` 临时态；只有新的 Agent request `sent` 或 queued 后最终 `sent`，才退出 Plan、进入完整 Agent 模式，并用 approved plan context 开始执行。
- 补充 mode routing 和 tool policy 测试。
- 形成 replay-backed patch，并跑 profile-scoped replay validation。

非范围：

- 不接入 Claude SDK。
- 不接入 ACP。
- 不做外部 Agent Plan。
- 不重构 Provider UI。
- 不允许写入 `.director/plans/` 之外的项目文件。
- 不把 Plan 文件持久化扩展成完整任务管理系统。
- 不把命令面板入口纳入 Wave 1 验收；`Director Code: Enter Plan Mode` 之类命令入口属于后续可选增强。

Wave 1 验收：

- Plan 下不暴露 `apply_patch`、`createFile`、`createDirectory`、`replace_string_in_file`、`multi_replace_string_in_file` 等 edit tools。
- Plan 下不会修改 `.director/plans/` 之外的真实项目文件。
- Plan 能读取工作区上下文并生成计划。
- Plan 能通过 `fetch` / `githubRepo` 只读查阅 GitHub、远程文档、issue 或 repo 内容。
- Plan 能创建或更新 `.director/plans/*.md` 计划文件。
- 用户可以通过补充内容修订计划。
- 用户选择执行后，只有新的 Agent request `sent` 或 queued 后最终 `sent`，才切入 Agent 并开始执行 approved plan。
- Inline mode 不受影响。
- replay validation 通过。

已决策：

- Wave 1 允许写 `.director/plans/*.md`。
- `.director/plans/*.md` 是 Plan Mode v1 的唯一写入白名单。
- 计划文件写入需要单独的 Plan writer / Plan file transaction，不能复用普通 edit tools。
- Wave 1 Plan UI 先做 Agent/Session 状态，不做顶层 `ChatModeKind`。
- 用户可见上仍然叫 Plan Mode，但底层作为 Agent session 的 `plan` 状态实现。
- Wave 1 v1 的计划完成 UI 使用三个动作：执行、拒绝、补充内容。
- Wave 1 v1 的执行目标是完整 Agent 模式；Approve and Edit 不进入 v1。
- Wave 1 v1 的 minimal plan review UI 使用结构化 command buttons 承载执行 / 拒绝 / 补充内容动作，优先复用现有 `IChatCommandButton` response part；不使用普通 reply-style followup 作为执行授权。
- Wave 1 v1 的 Plan 入口使用 Agent 模式下的 Director-owned `Agent Mode` chip/toggle，显示 `Agent` / `Plan` 两项；默认 `Agent`，只在顶层 `ChatModeKind.Agent` 的 Director Agent session 中显示。命令面板入口不纳入 Wave 1。
- 当前缓存的 VS Code/VSCodium 116 upstream 和 116 generated tree 都没有 `vscode_reviewPlan` / `ReviewPlanTool` / `ChatPlanReviewData`。这是 VS Code 120+ 主线新增能力，不作为 Wave 1 的完整 backport 目标。
- Wave 1 不 backport VS Code 120+ 的完整 plan review widget。先做 Director-owned minimal plan review flow，并让数据契约贴近新版 `ReviewPlanTool`：plan content、plan file URI、actions、feedback、result。
- Plan 完成必须由 Plan-only `director_present_plan` 工具触发。模型如果没有调用该工具而直接结束，host 返回纠偏提示，要求它更新计划并调用工具；不做 silent final-markdown fallback。
- 用户可以通过 UI chip 从 Plan 手动切回 Agent。这个动作只表示退出/取消 Plan，不等价于“执行”；执行必须来自 plan review 的“执行”动作。
- “执行”必须结束当前 Plan 回合，在同一个 chat session 内创建一个新的 Agent request/turn，清除 Plan tool allowlist，并注入 approved plan context；不是在同一模型回合继续执行。
- Plan review 的 awaitingDecision UI 状态 v1 不做跨 reload 恢复；持久化边界是 `.director/plans/*.md` 计划文件本身。
- 模型可见工具名沿用当前 Director registry 的 camelCase 名称，只新增 `director_present_plan`；不为了 Plan Mode 另建 snake_case 工具别名。
- Plan v1 中 `githubRepo` 不增加额外确认；`fetch` 继承现有 VS Code fetch schema 与 URL fetch 确认策略，Wave 1 不额外收窄 URL scheme。
- 用户手动从 Plan chip/toggle 切回 Agent 时，若已有计划文件，统一写 frontmatter `status: Cancelled` 并记录取消原因为 `Cancelled by user mode switch`。
- `awaitingDecision` 下用户直接输入普通文本时，统一视为补充反馈并进入新的 Plan request；只有结构化“执行”按钮能触发 approved plan execution。
- 计划文件根目录 v1 固定使用第一个 workspace folder 下的 `.director/plans/`；当前不实现独立 session cwd。
- 用户点击“执行”后，host 在同一 chat session 内发起 system-initiated compact Agent request，label 为 `Execute approved plan`，并注入 approved plan context。
- 模型未调用 `director_present_plan` 时最多自动纠偏 1 次；第二次仍未调用则结束当前 Plan turn 并显示错误，不进入审批。
- 计划文件固定命名为 `YYYY-MM-DD-HHMMSS-<slug>-<shortPlanId>.md`，保持可读性并避免同秒同标题碰撞。
- `director_present_plan` 成功后必须终止当前 Plan LLM loop，进入 `awaitingDecision` 等待用户动作；不能把普通 tool result 返回给模型后继续本轮循环。
- plan review nonce 必须 single-use。每次展示或更新计划生成新 nonce；执行、拒绝、补充内容、取消、reload 后旧 nonce 全部失效。
- Plan v1 不暴露 `askQuestions` 或新增澄清问题工具。模型如果需要用户补充信息，仍必须调用 `director_present_plan`，把不确定点写入 `Assumptions` / `Open Questions`，再由 review UI 的“补充内容”承接用户反馈。
- empty workspace 下 `Agent Mode` chip 可以显示，但 `Plan` 选项必须 disabled，并通过 tooltip/notification 提示用户先打开文件夹；不能进入半初始化 Plan 状态。
- 用户在 `planning` 中通过 UI chip 切回 Agent，语义固定为取消当前 Plan 生成：host 立即 cancel 当前 Plan request / agent loop，清空 Plan state；若已有 active plan file 则写 frontmatter `status: Cancelled`；迟到的 streaming、tool result 或 `director_present_plan` 全部丢弃。
- `Open Questions` 不会禁用“执行”。用户点击“执行”表示接受当前 assumptions / open questions 的风险；如需修订，应选择“补充内容”。
- 同一个 chat session 同时只允许一个 active `PlanContext`。新 Plan request 或补充内容会替换/更新当前 active plan context，并使旧 nonce、旧按钮、旧迟到工具结果失效。
- 点击“执行”后，只有新的 Agent request `sent`，或 queued 后最终 `sent`，计划文件才更新为 frontmatter `status: Approved`；如果 `sendRequest` rejected，则计划保持 frontmatter `status: Draft`，显示错误，并重新展示 review UI 生成新 nonce。
- `director_present_plan` 的 `planMarkdown` 是模型提交的正文草案；host 负责生成固定计划文件模板和 metadata。`summary`、`assumptions`、`validation`、`risks`、`openQuestions`、`feedbackSummary` 是结构化字段，用于 review UI 和固定章节填充；若与 `planMarkdown` 冲突，以结构化字段优先。
- 计划文件 metadata 使用 YAML frontmatter，而不是普通 `Status:` 行；host 更新 status / reason / timestamps 时只改 frontmatter。
- plan review UI 必须直接展示 `summary`、可读的 `planMarkdown` 主体和计划文件链接；不要求用户打开文件才能审批，Wave 1 不做 diff/history UI。
- 点击“执行”后先进入 `executing` 临时态并 disable review 按钮与 `Agent Mode` chip/toggle；只有 Agent request sent 或 queued 后最终 sent，才把 chip/session 切到 Agent 并清除 Plan state。如果 rejected，则保持/恢复 Plan + `awaitingDecision` 并生成新 nonce。
- `shortPlanId` 如果极小概率撞名，host 必须重新生成并再次检测，直到目标文件不存在。
- `director_present_plan` schema 类型固定：`title`、`summary`、`planMarkdown`、`feedbackSummary` 为 string；`assumptions`、`validation`、`risks`、`openQuestions` 为 string array，缺省为空数组。
- 计划文件模板新增 `## Summary`。Host 负责生成固定模板：结构化字段填充 `Summary`、`Assumptions`、`Open Questions`、`Validation`、`Risks` 与 review UI；`planMarkdown` 作为正文草案原样写入 `Proposed Steps`，host 不负责把一个 string 拆分到 `Current Understanding` 与 `Proposed Steps`。模型不能通过 `planMarkdown` 提供 frontmatter、status、path 或任意写入目标。
- `executing` 临时态期间，除 disable review 按钮外，也 disable `Agent Mode` chip/toggle；只有新 Agent request sent/queued-sent 后自动切 Agent，若 rejected 则恢复 Plan + `awaitingDecision`。
- Plan v1 的 turn budget 继承现有 Agent max-turn 配置，但始终使用 Plan allowlist，并必须以 `director_present_plan` 或一次纠偏失败收口。

v1 与后续：

- Wave 1 v1 指 Director 原生 Plan Mode 的第一版闭环：默认 Agent、用户显式进入 Plan、只读分析、写 `.director/plans/*.md`、等待执行/拒绝/补充内容、执行后通过新的 Agent request 切回 Agent 并开始执行。
- v1 不包含 Claude SDK Plan 映射；这属于 Wave 3。
- v1 不包含 ACP Agent Plan 映射；这属于 Wave 4。
- v1 不包含命令面板入口、Approve and Edit、Plan history、Plan diff、Plan resume、Plan task board、Plan 文件列表 UI 等增强能力。
- 如果 v1 的 Agent/Session 状态 UI 证明不够清楚，后续再评估是否升级为顶层 Ask/Edit/Agent/Plan。

### Wave 1 详细设计草案

#### 用户体验

VS Code 参考交互：

- VS Code Agent Host 在 chat input secondary toolbar 中注册 `Agent Mode` chip，而不是把 Plan 做成 Ask / Edit / Agent 同级顶层 mode。
- 该 chip 绑定 session config 的 `mode` 属性，枚举为 `interactive` / `plan`，默认值是 `interactive`，并且 `sessionMutable: true`，所以用户可以在会话中切换。
- 用户点击 chip 后打开 dropdown，选择 `Plan`。UI 上 Plan 使用 checklist 图标，Interactive 使用 comment 图标。
- 对 Claude session，VS Code 不是用通用 `mode`，而是用 `Approvals` / permission mode chip；用户在 dropdown 中选择 `Plan mode`。
- VS Code 的 Claude Plan 流程是：用户选择 Plan mode -> 发送请求 -> Claude 调用 `EnterPlanMode` / `ExitPlanMode` -> UI 弹出 `Ready to code?` plan review -> 用户 approve 或 deny with feedback -> approve 后切换到可执行权限并继续。
- VS Code 120+ 有 `vscode_reviewPlan` / `ReviewPlanTool` 和 plan review widget；当前 Director 116 generated tree 里没有这个工具，也没有 `ChatPlanReviewData`。这应视为上游后续更新，Wave 1 不完整 backport。
- 新版 `ReviewPlanTool` 的核心契约是：输入 `content`、可选 `plan` URI、`actions`、`canProvideFeedback`，然后把 `ChatPlanReviewData` append 到当前 chat request，等待用户返回 `{ action, rejected, feedback }`。Director Wave 1 的 minimal flow 应贴近这个契约，方便未来升级到 VS Code 120+ 后替换为上游实现。

本轮调研补充：

- 116 cached upstream 与 Director generated tree 搜索 `vscode_reviewPlan`、`ReviewPlanTool`、`ChatPlanReviewData` 均无结果；只有本计划文档引用。
- VS Code main 当前实现位于 `src/vs/workbench/contrib/chat/common/tools/builtinTools/reviewPlanTool.ts`、`chatPlanReviewData.ts`、`chatPlanReviewPart.ts`，并在 Copilot CLI / Claude session 的 exit-plan flow 中复用。
- VS Code Agent Host 的 Plan 入口是 session config `mode: interactive | plan`，通过 chat input secondary toolbar 的 `Agent Mode` chip 修改，不是 Ask/Edit/Agent 同级顶层模式。
- VS Code main 的 `ChatModeKind` 仍然只有 `Ask`、`Edit`、`Agent`，没有 `Plan`；Agent Host 的 mode chip 通过 `MenuId.ChatInputSecondary` action 和 custom action view item 渲染，并把选择写入 session config。
- VS Code main 的通用 Agent Host schema 定义 `mode` 为 `interactive | plan`，默认 `interactive`，`sessionMutable: true`。Copilot Agent Host 再把该 session config 映射到 SDK 的 `interactive` / `plan` / `autopilot` 模式。
- Claude Agent Host 不使用通用 `mode` chip，而是在 `Approvals` / `permissionMode` 里提供 `plan`，label 为 `Plan Only (Read-Only)`。这说明 Plan 的 UI 入口可以是 agent/session 配置轴，而不是 core chat mode。
- Copilot CLI 的 plan 文件来自 SDK session-state workspace；注释明确 plan mode 依赖 workspace directory，否则不会得到可用 plan path。
- Claude/free-code 默认把计划放到 `~/.claude/plans/`，但支持 `plansDirectory` 设置为项目根目录内的相对路径。
- OpenCode 在有 VCS/project worktree 时使用 workspace-local `.opencode/plans/`，无 VCS 时退到全局 data `plans/`；Plan agent 允许 `.opencode/plans/*.md` 和全局 data plans 的特定路径。
- Hermes 当前只找到 `.hermes/plans/` 的补全/路径使用痕迹，没有看到等价的 Plan Mode 闭环。它更像 workspace-local 计划/交接文件习惯，而不是全局默认。

Director Wave 1 采用的交互：

- 默认 chip 显示完整 Agent 状态。
- Director v1 chip 文案采用 `Agent Mode`，下拉项为 `Agent` / `Plan`。这贴近 VS Code 的 `Interactive` / `Plan` 结构，但用 Director 用户更熟悉的“完整 Agent 模式”表述。
- 用户显式选择 Plan 后，当前 Agent session 进入 Plan 状态。
- 用户发送请求后，Director 用 Plan policy 生成计划。
- 计划完成时，模型必须调用 `director_present_plan`。Director 写入计划文件并展示 minimal plan review flow，提供三个结构化动作：执行、拒绝、补充内容。
- 用户选择执行后，Director 发起新的 system-initiated Agent request；只有该 request sent 或 queued 后最终 sent，才切回完整 Agent 状态并开始执行 approved plan。

入口：

- 默认仍进入完整 Agent 模式。
- 在现有 Agent 体验中提供进入 Plan 的入口，首选 chat input secondary toolbar 的 Director-owned `Agent Mode` chip/toggle，接近 VS Code `Agent Mode` chip。
- 该 chip/toggle 只在 Director Agent session 且顶层 `ChatModeKind.Agent` 时显示；Ask / Edit / Inline 不显示或保持不可用。
- Wave 1 唯一必做入口是该 chip/toggle；命令面板入口不纳入 Wave 1。
- 不新增 Ask / Edit / Agent 同级的顶层 Plan mode。
- 进入 Plan 后，当前 session 显示明确的 Plan 状态。

基本流程：

1. 用户在 Agent session 中进入 Plan。
2. Director 切换到 Plan policy。
3. 模型只使用本地 read-only 与网络只读工具分析工作区、GitHub/远程文档等上下文。
4. 模型调用 Plan-only `director_present_plan`，由 Director host 生成或更新 `.director/plans/*.md`。
5. Chat 中展示计划摘要、可读的计划正文和计划文件链接。
6. Chat UI 展示三个结构化动作：执行、拒绝、补充内容。
7. 用户选择补充内容时，继续保持 Plan 状态，聚焦 chat 输入框并把下一条用户消息作为 revise feedback；如果用户在 `awaitingDecision` 下直接输入普通文本，也按 revise feedback 处理；随后更新同一个计划文件。
8. 用户选择执行时，Director 进入 `executing` 临时态，在同一个 chat session 内创建新的 Agent request/turn，并把 approved plan context 注入执行请求；只有 request sent 或 queued 后最终 sent，才退出 Plan 并开始执行。
9. 用户选择拒绝时，Director 结束 Plan 状态，不执行修改。
10. 用户通过 UI chip 手动从 Plan 切回 Agent 时，Director 取消 Plan 状态但不自动执行计划；若已有计划文件，更新为 frontmatter `status: Cancelled`。

计划文件归属与命名：

- 默认目录：`.director/plans/`
- v1 固定写入第一个 workspace folder 下的 `.director/plans/`；当前不实现独立 chat session cwd。
- 如果存在多个 workspace folder，Wave 1 v1 仍使用第一个 workspace folder，不做 root picker；计划文件 metadata 记录实际 root，后续再评估多 root 选择 UI。
- 如果没有 workspace folder，Plan Mode v1 不启用；`Agent Mode` chip 可以显示，但 `Plan` 选项 disabled，并通过 tooltip/notification 提示用户先打开文件夹。
- v1 不默认写 `%USERPROFILE%\.director\plans\`。全局 plans 可作为后续 empty-window/非项目场景增强，但不作为首版默认，避免跨项目计划混淆和权限边界不清。
- 固定命名：`YYYY-MM-DD-HHMMSS-<slug>-<shortPlanId>.md`
- `<slug>` 从用户请求或计划标题生成，必须做路径安全处理；`<shortPlanId>` 由 host 生成，长度以 6-10 个 URL/path-safe 字符为宜，用于避免同秒同标题碰撞和绑定 review nonce。
- host 创建计划文件前必须检测目标路径是否已存在；如果存在，重新生成 `<shortPlanId>` 并再次检测，直到目标文件不存在。
- revise 固定更新同一个计划文件，不创建新文件；另存/复制计划属于后续增强。

计划文件 v1 固定结构：

```markdown
---
status: Draft | Approved | Rejected | Cancelled
planId: <plan id>
created: <ISO timestamp>
updated: <ISO timestamp>
sourceSession: <chat session id>
sourceRequest: <chat request id>
workspaceRoot: <workspace folder URI>
planFile: <plan file URI>
statusReason: <optional reason, e.g. Cancelled by user mode switch>
---

# <Plan Title>

## Request

<original user request>

## Summary

<structured summary>

## Current Understanding

<facts gathered from read-only inspection>

## Assumptions

<open assumptions>

## Open Questions

<questions or decisions that need user feedback before execution>

## Proposed Steps

1. <step>
2. <step>

## Validation

<tests / replay validation / smoke checks>

## Risks

<risks and mitigations>

## Feedback History

- <ISO timestamp> <feedback source>: <feedback summary>
```

#### 状态机

v1 固定状态：

- `inactive`：未进入 Plan。
- `planning`：正在读取上下文和生成计划。
- `awaitingDecision`：计划已生成或更新，等待用户执行 / 拒绝 / 补充内容。
- `executing`：用户已确认执行，准备切到完整 Agent 模式；此期间 review 按钮与 `Agent Mode` chip/toggle 均 disabled。
- `rejected`：用户拒绝执行。
- `cancelled`：用户通过 UI 手动退出 Plan，未批准执行。

状态转移：

- `inactive -> planning`：用户进入 Plan。
- `planning -> awaitingDecision`：计划生成并写入 `.director/plans/*.md`。
- `awaitingDecision -> planning`：用户选择补充内容并提交反馈，或在 awaitingDecision 状态下直接输入普通文本作为反馈。
- `awaitingDecision -> executing`：用户选择执行；即使计划含有 `Open Questions`，也允许进入执行，视为用户接受当前 assumptions / open questions。
- `awaitingDecision -> rejected`：用户选择拒绝。
- `planning -> cancelled`：用户通过 UI chip 从 Plan 切回 Agent；host 立即 cancel 当前 Plan request / agent loop，并丢弃迟到的 streaming、tool result 或 `director_present_plan`。
- `awaitingDecision -> cancelled`：用户通过 UI chip 从 Plan 切回 Agent，放弃本次审批。
- `executing -> inactive`：新的 Agent request 已 sent，或 queued 后最终 sent；此时切入完整 Agent 模式并开始执行。
- `executing -> awaitingDecision`：新的 Agent request 被 rejected；计划保持 `Draft`，review UI 重新展示并生成新 nonce。
- `rejected -> inactive`：结束 Plan。
- `cancelled -> inactive`：结束 Plan，不执行。

#### 权限边界

允许：

- 本地 read-only tool layer 沿用当前 Director registry 的模型可见 camelCase 名称：`readFile`、`listDirectory`、`fileSearch`、`textSearch`、`problems`、`changes`、`viewImage`、`usages`。
- 网络只读检索工具：`fetch`、`githubRepo`，用于查阅 GitHub、远程文档、issue 或 repo 内容；只能返回文本/结构化上下文，不能执行命令或写入 workspace。
- `githubRepo` 在 Plan v1 中不增加额外确认；`fetch` 继承现有 VS Code fetch schema 与 URL fetch 确认策略，Wave 1 不额外收窄 URL scheme。
- Plan-only `director_present_plan`：模型可见的唯一计划写入入口；内部 Plan writer 只写 `.director/plans/*.md`。
- 读取当前 workspace 的 changed files、diagnostics、文本文件和目录结构。

禁止：

- 普通 edit tools：`apply_patch`、`createFile`、`createDirectory`、`replace_string_in_file`、`multi_replace_string_in_file`。
- 写入 `.director/plans/` 之外的任何路径。
- terminal/task execution。Plan v1 不暴露终端或任务执行能力，哪怕命令看似只读。
- browser automation / UI 操作工具。
- 外部 Agent 或子 Agent 继承出更高权限。
- `askQuestions` 或其他模型可见澄清问题工具；Plan v1 的待确认事项写入计划的 `Open Questions`，由 review UI 的“补充内容”流程解决。

实现原则：

- Plan writer 是 host-side 内部能力，不作为普通模型可见 edit tool 暴露；模型只能通过 schema-validated 的 `director_present_plan` 提交计划内容。
- 模型产出计划内容，Director host 负责校验路径并写入计划文件。
- Plan v1 的 turn budget 继承现有 Agent max-turn 配置，但工具集合始终使用 Plan allowlist；Plan 回合只能以 `director_present_plan`、一次自动纠偏后的失败、用户取消或请求取消收口。
- 如果后续需要模型可见的 `update_plan` 工具，也必须是 Plan-only、path-locked、schema-validated 的专用工具。

#### 审批语义

计划完成后不允许模型自行继续执行，必须等待用户动作。

Plan 完成触发方式：

- Wave 1 固定新增一个 Plan-only 的 Director 内部工具：`director_present_plan`。
- 该工具只在 `DirectorToolMode.Plan` 暴露，语义接近 VS Code Claude 的 `ExitPlanMode`。
- 工具输入使用固定 schema：必填 `title`、`summary`、`planMarkdown`；可选 `assumptions`、`validation`、`risks`、`openQuestions`、`feedbackSummary`。`title`、`summary`、`planMarkdown`、`feedbackSummary` 为 string；`assumptions`、`validation`、`risks`、`openQuestions` 为 string array，缺省为空数组。schema 固定 `additionalProperties: false`，host-side validator 必须拒绝 path、cwd、root、status 或任意写入目标。
- 数据真相固定为：`planMarkdown` 是模型提交的正文草案；host 生成最终 `.director/plans/*.md` 模板、frontmatter 和固定章节。结构化字段优先填充固定章节与 review UI：`summary` 写入 `Summary`，数组字段写入对应章节，`planMarkdown` 原样写入 `Proposed Steps`。Host 不做 `planMarkdown` 章节拆分；当结构化字段与 `planMarkdown` 对同一内容表达冲突时，以结构化字段为准。
- `planMarkdown` 不能携带 frontmatter、status、path、cwd、root 或任意写入目标；如出现这些内容，host-side validator 必须直接拒绝本次 `director_present_plan` tool call，并使用一次 Plan-only 纠偏提示要求模型重新提交合法计划，不能剥离、修补或照单写入计划文件。
- Host 在工具执行时写入或更新 `.director/plans/*.md`，然后展示 minimal plan review flow。
- `director_present_plan` 成功后不是普通可继续的 tool result。Tool bridge / Agent engine 必须支持 stop/sentinel 语义：记录计划已呈现、进入 `awaitingDecision`、停止当前 Plan LLM loop，等待用户结构化动作。
- 如果模型在 Plan 回合没有调用 `director_present_plan`，host 不解析 final markdown 为 plan，也不静默进入审批；而是返回一条 Plan-only 纠偏提示，要求模型把计划写入/更新并调用 `director_present_plan`。该自动纠偏最多执行 1 次；第二次仍未调用则结束当前 Plan turn 并显示错误，不进入审批。
- 模型不能用普通 assistant 文本直接向用户提澄清问题来结束 Plan 回合；需要澄清时，也必须调用 `director_present_plan`，在计划里填充 `Open Questions` 并等待用户通过“补充内容”反馈。
- 用户通过 UI chip 手动返回 Agent 是允许的，但该动作只清除 Plan state；不会触发 approved plan execution。

Wave 1 v1 的动作：

- 执行：进入 `executing` 临时态，并把 approved plan context 注入新的 Agent request；只有该 request sent 或 queued 后最终 sent，才退出 Plan、切到完整 Agent 模式并真正开始执行。
- 点击执行后先进入 `executing` 临时态，并 disable 当前 review 按钮和 `Agent Mode` chip/toggle；只有新的 Agent request sent 或 queued 后最终 sent，才把 chip/session 切到 Agent 并清除 Plan state。若 rejected，则保持/恢复 Plan + `awaitingDecision`，重新生成 nonce 并重新启用 chip/toggle。
- 拒绝：结束 Plan，不执行。
- 补充内容：保持 Plan，聚焦 chat 输入框，要求用户输入补充意见；提交后作为 revise feedback 进入新的 Plan request，并更新同一个计划文件。用户在 `awaitingDecision` 状态下直接输入普通文本时，也按补充反馈处理，而不是触发执行。
- 如果计划含有 `Open Questions`，“执行”按钮仍可用；点击执行表示用户接受当前 assumptions / open questions 并希望继续。

实现约束：

- 首选用结构化 command buttons 呈现三个动作，优先复用现有 `IChatCommandButton` response part。Wave 1 不实现完整 VS Code 120+ `chatPlanReviewPart`，也不 backport inline comment/textarea 体系。
- review UI 必须在 Chat 中直接显示 `summary`、可读的 `planMarkdown` 主体和计划文件链接；不要求用户打开文件才能做执行/拒绝/补充内容决策。Wave 1 不实现 diff/history UI。
- 不使用普通 reply-style followup 作为“执行”授权来源；普通自然语言“执行”不能直接触发 plan approval。
- 执行 / 拒绝 / 补充内容动作必须携带 session id、plan id、plan file URI、nonce/action，并由 Director plan review service 校验当前 session 正处于 `awaitingDecision`。
- nonce 是 single-use。Director plan review service 每次展示或更新计划时生成新 nonce；任一动作成功、手动取消、reload 或进入新 Plan request 后，旧 nonce 必须失效，防止 stale button、双击或跨 session 重放。
- 同一个 chat session 只能有一个 active `PlanContext`；新 Plan request、补充内容或取消都会使旧 active context 的 nonce、按钮和迟到 tool result 失效。
- 执行请求必须注入 approved plan context：原始请求、计划文件 URI、最终计划 markdown、用户补充记录和当前 workspace。
- 执行动作由 host 在同一个 chat session 内发起 system-initiated compact Agent request，`systemInitiatedLabel` 使用 `Execute approved plan`；该请求可审计，但不表现为用户手动输入的新消息。
- 如果 system-initiated Agent request 被 queued，Plan state 保持 `executing` 直到 queued deferred 最终 `sent` 或 `rejected`。
- 如果 system-initiated Agent request 被 rejected，host 不写 `Approved`，保持计划 `Draft`，显示错误，保持/恢复 Plan + `awaitingDecision`，重新展示 review UI 并生成新 nonce。
- 执行不能简单地把 `approved` 文本返回给仍处在 Plan tool allowlist 的同一个模型回合；host 必须结束 Plan 回合，在同一个 chat session 中发起新的 Agent request，切换到 Agent tool allowlist 后再开始执行。
- 新 Agent request 需要延续当前 chat session 的历史上下文；approved plan context 作为 synthetic/context message 注入，而不是新开空白会话。
- `awaitingDecision` 的按钮/UI 状态 v1 只在当前窗口生命周期内有效；reload 后不恢复待审批按钮，但 `.director/plans/*.md` 保留为审计和后续手动参考。

计划文件状态更新：

- 初次生成写 frontmatter `status: Draft`。
- 执行后必须更新为 frontmatter `status: Approved`，但仅限新的 Agent request 已 sent，或 queued 后最终 sent。
- 如果执行时新的 Agent request 被 rejected，计划保持 frontmatter `status: Draft`，并在 `statusReason` 记录 rejected reason 或展示等价错误；旧 nonce 失效，review UI 使用新 nonce 重新展示。
- 拒绝后必须更新为 frontmatter `status: Rejected`。
- 补充内容后保持 frontmatter `status: Draft`，更新 `updated` 与 `Feedback History`。
- 手动从 Plan chip/toggle 切回 Agent 时，如果已有计划文件，统一更新为 frontmatter `status: Cancelled`，并在 `statusReason` 记录 `Cancelled by user mode switch`；该动作必须测试不触发执行。

#### 实现任务拆分

1. 增加 Plan session state / context object。
2. 增加 Director-owned `Agent Mode` chip/toggle：仅在 Director Agent session + 顶层 `ChatModeKind.Agent` 下显示 `Agent` / `Plan`。
3. 扩展 mode routing，新增 Plan policy。
4. 增加 Plan prompt / reminder。
5. 增加内部 Plan writer，限制写入 `.director/plans/*.md`，并写入 YAML frontmatter、plan id、workspace root、source request、feedback history 等固定 metadata。
6. 增加 Plan-only `director_present_plan` tool，并补齐 Tool bridge / Agent engine 的 stop/sentinel 处理。
7. 增加 Director plan review service 与 minimal plan review flow：用结构化 command buttons 承载执行 / 拒绝 / 补充内容，并校验 single-use nonce。
8. 把执行动作接到 Agent 模式切换和 approved plan context 注入，并处理 sent / queued / rejected 三种 `sendRequest` 结果。
9. 增加 active `PlanContext` 生命周期管理：同一 chat session 单 active plan，取消/替换/迟到结果失效。
10. 补充 tests。
11. 回写 replay patch。
12. 跑 replay validators 和 targeted mode/tool tests。

Replay patch ownership：

- Agent engine、Plan session state、`director_present_plan` bridge、stop/sentinel 和 approved plan context 注入优先归入 `004-director-agent-engine.116.patch`。
- `Agent Mode` chip/toggle、minimal plan review UI、command buttons 和 Chat session UI wiring 优先归入 `005-director-chat-built-in-mode.116.patch`。
- `DirectorToolMode.Plan`、Plan allowlist、tool policy tests 和 read-only/edit tool 暴露边界优先归入 `007-director-tool-layer.116.patch`。
- 如实现过程中发现某项能力已有明确既有 stage owner，按现有 ownership 落 patch，不新增空 stage。

#### Wave 1 测试清单

- Plan 模式不注册或不暴露 edit tools。
- Plan 模式暴露本地 read-only 与网络只读工具，但不暴露 terminal/browser/subagent。
- Plan turn budget 继承 Agent max-turn 配置，但实际暴露工具始终是 Plan allowlist，并能通过 `director_present_plan` 或一次纠偏失败收口。
- Plan 模式不暴露 `askQuestions` 或其他模型可见澄清问题工具；待确认事项进入 `Open Questions`，用户反馈走“补充内容”。
- Plan 模式下 `fetch` / `githubRepo` 只能读取内容，不能触发执行或 workspace 写入；`fetch` 继承现有 VS Code fetch schema 与确认策略且不额外收窄 URL scheme，`githubRepo` 不增加额外确认。
- Plan writer 不能写 `.director/plans/` 之外路径。
- `director_present_plan` schema 使用 `additionalProperties: false`，并拒绝 `path`、`cwd`、`root`、`status` 或任意写入目标字段。
- Plan writer v1 固定写入第一个 workspace folder 下的 `.director/plans/`，不依赖独立 session cwd。
- Plan writer 会创建 `.director/plans/` 目录。
- Plan writer 会生成合法文件名，格式为 `YYYY-MM-DD-HHMMSS-<slug>-<shortPlanId>.md`。
- shortPlanId 撞名时会重新生成并重试，直到目标计划文件不存在。
- 计划文件包含固定 `## Summary` 章节，且由 `summary` 结构化字段填充。
- 计划文件 metadata 使用 YAML frontmatter；状态更新只改 frontmatter 的 `status`、`statusReason`、`updated` 等字段，不写普通 `Status:` 行。
- `director_present_plan` 的结构化字段类型固定；数组字段缺省为空数组。
- `director_present_plan` 的结构化字段优先填充 review UI 和固定章节；当结构化字段与 `planMarkdown` 冲突时，以结构化字段为准。
- `planMarkdown` 中出现 frontmatter、status、path、cwd、root 或任意写入目标时，会拒绝本次 `director_present_plan` tool call，触发一次 Plan-only 纠偏提示，且不会写入或更新计划文件。
- review UI 在 Chat 中直接显示 `summary`、可读的 `planMarkdown` 主体和计划文件链接，不要求用户打开文件才能审批。
- `Agent Mode` chip/toggle 只在 Director Agent session + 顶层 `ChatModeKind.Agent` 下显示；Ask/Edit/Inline 不显示或不可用。
- empty workspace 下 `Plan` 选项 disabled，并提示用户打开文件夹。
- `ChatModeKind.Agent + session plan state` routes to `DirectorToolMode.Plan`，普通 Agent 仍 routes to `DirectorToolMode.Agent`，Ask/Edit/Inline 现有 routing 不回归。
- 补充内容或 `awaitingDecision` 下的直接普通文本会更新同一计划文件。
- 模型未调用 `director_present_plan` 时不会进入审批；最多收到 1 次纠偏提示，第二次仍失败则结束 Plan turn 并显示错误。
- `director_present_plan` 成功后停止当前 Plan LLM loop，进入 `awaitingDecision`；不会继续把 tool result 交给模型生成下一步。
- plan review 的执行 / 拒绝 / 补充内容按钮必须携带并校验 session id、plan id、plan file URI、nonce/action。
- plan review nonce 必须 single-use；双击、旧按钮、reload 后按钮、跨 session 重放都会被拒绝。
- 同一个 chat session 同时只有一个 active `PlanContext`；新 Plan request 或补充内容会替换/更新当前 active context，并使旧 nonce、旧按钮和迟到 tool result 失效。
- 拒绝不进入 Agent。
- `planning` 中用户切回 Agent 会 cancel 当前 Plan request / agent loop，清空 Plan state；迟到的 streaming、tool result 或 `director_present_plan` 不会展示 review UI 或写入 active plan。
- UI chip 手动从 Plan 切回 Agent 不会执行计划，且已有计划文件会更新为 frontmatter `status: Cancelled`。
- 点击执行后先进入 `executing` 临时态并 disable review 按钮与 `Agent Mode` chip/toggle；只有 Agent request sent 或 queued 后最终 sent 才把 chip/session 切到 Agent 并清除 Plan state。
- 执行 request sent 或 queued 后最终 sent 时，计划文件更新为 frontmatter `status: Approved`；拒绝会更新为 frontmatter `status: Rejected`。
- 计划含有 `Open Questions` 时仍可执行；点击执行表示接受当前 assumptions / open questions。
- 执行 request sent 或 queued 后最终 sent 时切到 Agent，并开始执行 approved plan。
- 执行是同一 chat session 的新 system-initiated compact Agent request，`systemInitiatedLabel` 为 `Execute approved plan`，且保留历史上下文。
- 新 Agent request 只有 `sent` 或 queued 后最终 `sent` 才会把计划标记为 `Approved`；如果 rejected，则计划保持 `Draft`，显示错误并重新生成 review nonce。
- 普通自然语言不能绕过 `awaitingDecision` 状态触发执行；在该状态下普通文本只作为补充反馈。
- reload 后不会恢复待审批按钮状态，但计划文件仍保留。
- Inline mode 不受 Plan 影响。
- Ask/Edit/Agent 现有 routing 不回归。
- replay validators 通过。

## Wave 2: Provider / Model Registry + UI

目标：替换当前单全局 provider/model 状态，建立多 provider、多模型可见性的正式用户界面。Director 负责 provider 连接、认证和实例管理；模型浏览、分组、pin/隐藏和 Chat picker 尽量复用或贴近新版 VS Code Models Management / Model Picker 结构。

本地参考来源：

- OpenCode 本地源码：`E:\Projects\sub-projects\opencode`
  - `packages/app/src/components/settings-providers.tsx`
  - `packages/app/src/components/settings-models.tsx`
  - `packages/app/src/components/dialog-custom-provider-form.ts`
  - `packages/app/src/context/models.tsx`
  - `packages/opencode/src/provider/provider.ts`
- VS Code main 本地源码：`E:\Projects\sub-projects\vscode`
  - `src/vs/workbench/contrib/chat/browser/chatManagement/chatManagement.contribution.ts`
  - `src/vs/workbench/contrib/chat/browser/chatManagement/chatManagementEditor.ts`
  - `src/vs/workbench/contrib/chat/browser/chatManagement/chatModelsWidget.ts`
  - `src/vs/workbench/contrib/chat/browser/chatManagement/chatModelsViewModel.ts`
  - `src/vs/workbench/contrib/chat/browser/widget/input/chatModelPicker.ts`
  - `src/vs/workbench/contrib/chat/common/languageModelsConfiguration.ts`

116 / 121 使用原则：

- VS Code 参考来自本地 `E:\Projects\sub-projects\vscode`，当前为 VS Code `1.121.0` main；但 Wave 2 不以 backport 121 大块代码为目标。
- 当前 116 generated tree 已经有 `ILanguageModelsProviderGroup`、`LanguageModelsConfigurationService`、`getLanguageModelGroups`、`ModelsManagementEditor`、`ChatModelsWidget`、`ChatModelsViewModel`、`MANAGE_CHAT_COMMAND_ID` 和 Chat model picker 的 Manage Models 入口。
- Wave 2 第一目标是接入和轻改 116 已存在的 model-management surface；121 main 只作为未来升级兼容和行为差异参考。
- 只有当 116 缺失某个必要且很小的行为时，才允许择要移植 121 逻辑；不得把 121 模型管理页整块 backport 到 116。

具体实现分层：

| 层级 | 对象 | 处理方式 |
| --- | --- | --- |
| 几乎直接用 | 116 已存在的 `ILanguageModelsProviderGroup`、`LanguageModelsConfigurationService`、`getLanguageModelGroups`、`ModelsManagementEditor`、`ChatModelsWidget`、`ChatModelsViewModel`、`MANAGE_CHAT_COMMAND_ID`、Chat model picker Manage Models 入口 | 保持上游模型管理文件尽量原样；Director 通过 provider group / language model metadata 供数，不复制 121 大块代码 |
| 少量修改后使用 | 116 的模型管理入口、Add/Configure Models flow、模型 picker 分组/展示、AI Customizations 中的 Models section、上游 BYOK/entitlement/商业文案触点 | 用薄 hook 接到 Director Provider Manager；清理或替换 Copilot/BYOK/entitlement、微软/GitHub 登录升级入口和相关链接 |
| Director 原创实现 | Provider Registry、Provider Manager UI、provider instance 存储与迁移、Secret/OAuth 绑定、custom OpenAI-compatible 表单、连接测试、模型发现、模型可见性/默认/最近使用状态、Director provider instance 到 VS Code provider group 的 adapter | 放在 `directorCode` ownership 下；上游 chat/model 文件只保留必要 hook |
| 只作参考 | OpenCode providers/settings/models/custom provider 交互和数据形态、OpenCode runtime provider loader、VS Code 121 main 的后续行为 | OpenCode 只参考产品形态和 compatible provider 表单；不照搬 runtime loader。VS Code 121 只用于确认未来合并方向和避免自创不兼容范式 |

已定实现决策：

- Director Provider Registry 是唯一长期真相；VS Code `ILanguageModelsProviderGroup` / `chatLanguageModels.json` 只作为模型管理和 picker 的投影/桥接，不保存 secret，不作为主配置。
- Provider Registry 使用 Director-owned profile JSON 持久化，不使用 VS Code settings 或 `chatLanguageModels.json` 作为主存储。
- v1 使用单一 `director-code` language model vendor，多 provider instance 映射成多个 provider group；不在 v1 为 OpenAI、Anthropic、OpenRouter 等注册多个 VS Code vendor。
- OAuth v1 每个 OAuth provider 只支持一个账号实例：OpenAI OAuth 一个、Anthropic OAuth 一个；API key provider 和 OpenAI-compatible endpoint 可以有多个实例。
- Director 只管理 provider instance 下的模型 enabled/hidden/default；VS Code 已有 recent/pin/model picker 状态能复用则复用，Director adapter 只负责过滤隐藏模型并提供 group metadata。
- 默认模型 v1 使用一个全局默认 provider instance + model；不先做 Ask/Edit/Agent/Plan 分模式默认。
- Provider Manager 复用或重做当前 Director Code Settings 的 provider 区域；不新增完全独立入口。Models Management 继续使用 VS Code 已有 Manage Models 页面。
- API key 来源 v1 支持 SecretStorage 保存 key 和 env var 引用；用户可以填实际 key，也可以填环境变量名。
- Provider instance 创建时允许用户填写稳定 slug/id，创建后不可改；`displayName` 可以修改。
- VS Code model-management hook 使用薄改：`managementCommand` / Configure 动作必须能把当前 group 或 providerInstanceId 传给 Director Provider Manager，打开对应实例页；不能只打开无上下文总列表。
- Director 模式下 Manage/Add Models 不受 Copilot entitlement、BYOK、Free/Pro/Business/Enterprise gating 限制；相关入口统一转 Director provider flow，Copilot 优先排序和升级/登录 CTA 不参与 Director 模型选择。
- 旧配置采用懒迁移：当新 Provider Registry 为空且存在 `directorCode.ai.provider/model/baseURL/authVariant` 时，生成一个默认 provider instance。迁移后 UI 只写新 registry；旧 key 保留一版只读 fallback，不再作为正常写入目标。
- OpenAI-compatible v1 手动模型列表是必需能力；API discovery 只做 best-effort，不阻塞保存、启用或调用手动模型。

执行前硬门槛：

- 刷新或新增 Provider / Model UI 调研报告，补入本地 OpenCode 和本地 VS Code main 的源码证据。
- 报告必须明确 116 目标树中直接复用、薄 hook 修改、Director 原创实现、仅作参考的清单，尤其是 provider group、model picker grouping、Manage Models 入口、Copilot/BYOK/entitlement 行为和文案替换点、旧配置懒迁移路径。
- 报告通过后再进入代码实现。

范围：

- 设计并实现 Director Provider Registry。Provider 是实例，不是单 enum；同一个 kind 可以有多个实例。
- 明确支持 OpenAI API key、OpenAI OAuth 作为两个不同 provider instance；OpenAI-compatible endpoint 可以添加多个实例。
- 每个 provider instance 可启用/停用，并可独立配置 URL、API key、OAuth 登录、注销、重置、headers、连接测试和模型刷新。
- 新增或重做 Director Provider Manager UI。该 UI 参考 OpenCode 的 providers/settings/custom-provider flow，负责连接、认证、实例、diagnostics，不承担外部 Agent session 管理。
- OpenAI-compatible 自定义 provider 的第一版能力至少包含不可变 `providerId`、可改 `displayName`、`baseURL`、SecretStorage API key 或 env var 引用、headers、手动模型列表，并支持后续 API discovery。
- 模型状态以 `(providerInstanceId, modelId)` 为稳定 key，支持可见/隐藏、display name、capabilities、context window、pricing/source metadata、recent/pinned/default。
- 模型管理 UI 优先复用 116 已存在的 `ModelsManagementEditor` / `ChatModelsWidget` / `ChatModelsViewModel`；121 main 仅用于核对未来行为，不作为默认移植来源。
- 对外暴露到 VS Code language model service 时，Director provider instance 映射为单一 `director-code` vendor 下的 VS Code `ILanguageModelsProviderGroup` 风格 group；Chat picker 按 group / provider instance 分组。
- Chat 模型选择列表只显示启用 provider 下可见模型，并保留 VS Code main 已有的 manage/pin/recent/grouping 语义。
- 迁移旧配置：`directorCode.ai.provider`、`directorCode.ai.model`、`directorCode.ai.baseURL`、`directorCode.ai.authVariant`。
- 修复当前 provider UI 已知问题：
  - 模型刷新结果不回填 UI。
  - OAuth UI 只展示 active provider。
  - API key 状态受全局 provider/model/baseURL 污染。

非范围：

- 不实现外部 Agent 管理。
- 不把 Claude Code、ACP agent 放进 LLM provider registry。
- 不强行一次性迁移为普通 VS Code extension。
- 不在 v1 支持同一 OAuth provider 多账号切换。
- 不在 v1 支持 Ask/Edit/Agent/Plan 分模式默认模型。
- 不直接照搬 OpenCode runtime/provider loader；OpenCode 只作为 UI 和 provider/model 数据形态参考。
- 不把 Copilot/BYOK/entitlement、微软/GitHub 登录升级流程或相关链接带入 Director UI。

建议验收：

- 多个 provider 可以同时启用。
- 每个 provider 可以独立设置 URL/API key/OAuth。
- OpenAI API key 与 OpenAI OAuth 可作为两个实例同时存在。
- 至少两个 OpenAI-compatible endpoint 可以同时存在并各自拥有模型列表。
- 模型可按 provider 独立启用或隐藏。
- Chat 模型选择器只显示启用模型，并按 provider group / provider instance 聚合。
- Manage Models 入口可打开模型管理 UI，且用户能搜索、查看 provider 分组、pin/recent 或等价选择状态。
- 从模型管理页或 picker 对某个 provider group 点击 Configure，会打开 Director Provider Manager 的对应 provider instance。
- Manage/Add Models 在 Director 模式下不受 Copilot entitlement / BYOK / subscription gating 限制。
- Provider instance 的 `providerId` 创建后不可修改；修改 `displayName` 不会破坏模型可见性、recent/pin 或默认模型状态。
- API key 可保存到 SecretStorage，也可保存为 env var 引用；Provider Registry JSON 不包含明文 key、OAuth token 或 secret payload。
- OAuth v1 每个 provider kind 只绑定一个账号实例；API key 和 compatible provider 仍可多实例并存。
- 全局默认 provider instance + model 可被保存、读取并驱动 Director Agent 默认模型选择。
- 旧用户配置可懒迁移为默认 provider instance，迁移后新 UI 不再写旧单全局配置 key。
- OAuth 登录/注销/重置不依赖单全局 active provider。
- 用户可添加 custom OpenAI-compatible provider，并配置 baseURL、API key/env secret、headers 和至少一个手动模型；API discovery 失败不阻塞保存和使用。
- VS Code main 模型管理页中 Copilot/BYOK/entitlement 相关入口、文案和链接已被移除或替换为 Director-owned provider flow。
- replay validation 和相关 UI smoke 通过。

实现策略：

- 第一阶段仍以 workbench 内部 Director Provider Registry 为长期真相，避免把 secret、OAuth、mode/tool policy、Chat Editing 等能力拆散到不成熟的普通扩展路径。
- 模型管理层尽量复用 116 当前已有的 provider group / Models Management / Model Picker 设计；121 只用于确认未来兼容，不作为默认 backport 内容。
- Adapter 层先支持 Director-owned OpenAI key、OpenAI OAuth、OpenAI-compatible custom provider，再逐步扩展 Anthropic、OpenRouter、Ollama、company proxy 等。
- 后续可把稳定的 OpenAI-compatible 等 provider adapter 抽到 built-in extension，但 Provider Registry、secret/OAuth policy 和 user-facing management flow 仍由 Director 控制。

## Wave 3: Claude SDK Adapter

目标：通过 TypeScript Claude Agent SDK 将 Claude Code 接入 Director native Chat。

范围：

- 固定并封装 `@anthropic-ai/claude-agent-sdk` 版本。
- 新增 `ClaudeAgentSdkAdapter`。
- 支持 prompt stream。
- 支持 cancel / interrupt。
- 支持 permission callback。
- 支持 Claude `permissionMode: "plan"`。
- 支持基础 session resume。
- 将 Claude tool / edit 输出映射到 Director Chat progress 和 reviewable edit contract。
- 将 Claude Plan / ExitPlanMode 映射到 Director Plan 审批体验。

非范围：

- 不通过 ACP 接 Claude Code。
- 不追求 Claude 完全调用 Director 内部 tool registry。
- 不要求第一版覆盖所有 Claude SDK hooks/plugins/subagents。

建议验收：

- Claude session 可以在 Director native Chat 中对话。
- Claude streaming、thinking、tool call 展示正常。
- 权限确认可控。
- Plan Mode 可进入、审批、拒绝或修订。
- 文件编辑不绕过 reviewable edit contract。
- Windows loose build 和 packaged runtime 至少完成 smoke。

关键选择：

- Python Claude SDK 只作为行为参考。
- Director 主链路使用 TypeScript SDK，避免引入 Python helper runtime。
- SDK 包版本推进快，必须通过窄 adapter 层隔离。

## Wave 4: Generic ACP Adapter

目标：建立通用 ACP 外部 Agent 接入层。

优先验证对象：

- Hermes
- OpenCode
- Gemini CLI
- Codex ACP wrapper

范围：

- 新增 `AcpAgentAdapter`。
- 支持 agent 子进程启动。
- Windows PATH / shell 行为处理。
- 支持 NDJSON connection。
- 支持 ACP `initialize`、`newSession`、`prompt`、`cancel`、`closeSession`。
- 支持 ACP auth_required / authenticate retry。
- 支持 `setSessionMode`。
- 支持 `unstable_setSessionModel`，但不把它作为稳定核心依赖。
- 支持 permission request。
- 支持 sessionUpdate 到 native Chat progress 的映射。
- 文件写入走 Director reviewable edit contract 或 host-side 审批，不直接无审阅落盘。

非范围：

- 不要求 ACP agent 完全使用 Director 内部 tools。
- 不把 ACP provider config 当成 Director Provider Registry 的基础。
- 不复制 `vscode-acp` 的 webview UI。

建议验收：

- 至少一个 ACP agent 达到 VS Code parity。
- 能启动、连接、创建 session、发送 prompt、取消。
- ACP permission request 能映射到 Director UI。
- ACP plan update 或 session mode 能映射到 Director Plan 表达。
- 文件编辑、终端危险操作不会绕过 Director 权限边界。
- replay validation 和至少一个真实 ACP agent smoke 通过。

## Wave 5: Codex Dedicated Decision

目标：通过实测决定 Codex 的长期接入方式。

候选路径：

- 使用 Codex ACP wrapper。
- 使用 Codex CLI / session adapter 专用接入。
- 依赖独立 Codex extension 或类似 VS Code session provider 的集成方式。
- 双路径：ACP 作为基础路径，专用 adapter 作为增强路径。

范围：

- 调研当前可安装 Codex 实现。
- 对比 VS Code 主线中 Codex session type 和实际 extension 行为。
- 实测 Codex ACP wrapper。
- 形成能力差距表。
- 形成长期维护建议。

非范围：

- 不在 Wave 5 前承诺 Codex 专用 adapter。
- 不为了 Codex 反向改变 Wave 1-4 的基础架构，除非实测发现无法兼容。

建议验收：

- 有明确实测记录。
- 有 Codex ACP 与专用 adapter 的能力差距表。
- 有最终推荐路径。
- 若选择专用 adapter，需要列出后续 patch 和验证范围。

## 跨 Wave 设计边界

必须保持清晰的概念边界：

- LLM Provider：提供模型调用能力，例如 OpenAI、Anthropic、OpenRouter、Ollama、company proxy。
- Model：某个 LLM Provider 下可被 Chat 选择的模型。
- External Agent：Claude Code、ACP Agent、Codex session 等能自主规划和执行的 Agent。
- Plan Policy：限制工具和执行能力的 session/mode policy。

不要把 External Agent 塞进 LLM Provider Registry，也不要让 Provider UI 承担 Agent session 管理。

## Replay 与验证要求

所有最终代码必须满足 116 replay landing rule：

1. 可以先在 `vscode.generated/layers/director/vscode` 调试。
2. 调试通过后必须回写 replay patch。
3. 若新增 patch stage，必须同步更新 `patches/series.116.json`、active profile 和 patch generation classification。
4. 若影响 product/package/server manifest/expected contracts，必须同步更新对应 expected、override、manifest 或 report。
5. 完成前至少运行 profile-scoped replay validation。

推荐最低验证命令：

```bash
node scripts/upgrade/validate-series.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
node scripts/upgrade/validate-product-overrides.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
node scripts/upgrade/expected-contracts.mjs --profile docs/upgrade/profiles/116-stable-win32-x64-client.json
```

阶段收口或 release candidate 还需要 clean materialize：

```bash
bash scripts/upgrade/materialize-vscode.sh \
  --profile docs/upgrade/profiles/116-stable-win32-x64-client.json \
  --target vscode.generated \
  --up-to-layer director \
  --force
```

## 当前开放问题

1. Wave 3 Claude SDK 是否以用户本机 Claude Code auth 为主，还是同时支持 Anthropic API key。
2. Wave 4 第一个 ACP smoke 对象选择 Hermes 还是 OpenCode。
3. Wave 5 Codex 是否接受先走 ACP wrapper 做 baseline。
