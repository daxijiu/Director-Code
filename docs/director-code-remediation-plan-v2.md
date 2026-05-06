# Director-Code 修复总计划 v2（执行版）

> **定位**：本文档是 Director-Code Phase 1/1.5/1.5+ 的**收口修复执行计划**。它负责 A-D 批次的修复决策、实现细节与验收标准。**路线图、阶段划分与长期规划仍以 `.cursor/` 计划文档为准**；本文档只负责当前收口修复，不替代 `.cursor/plan-01-roadmap.md` ~ `.cursor/plan-05-*.md`。
>
> **来源**：`docs/director-code-final-remediation-plan-by-GPT5.4-2026-04-15.md`（原始版本，保留存档）
>
> **修订记录**：
> - v2.0（2026-04-15）：从原始版本整合定稿
> - v2.1（2026-04-16）：代码交叉验证后修订——修正 5 处事实性错误（A4a Set→Map、B4 路径 ×2、A3④/⑤），补充 8 处隐患处理（A3① Provider index 标准化表、A2 messages 清理序列、B1 urlProtocol 验证等），写入 6 项决策结论（A2 统一 abortSignal、A3⑥ thinking 推入前过滤、B4 数据目录启动提示、C1b /v1 智能跳过、B3 最佳努力策略、Phase 2 门槛放宽），补充 4 项遗漏（toolBridge/retry 取消集成、compact 模型过渡依赖、D 审计范围限定）
> - v2.2（2026-04-16）：二次深入验证——修正 B4 product.json 修改位置（必须放根目录 + 补 prepare_vscode.sh stable 分支）、A3① StreamEvent 类型需扩展 index 字段、A2 abortSignal 已有/需新增路径区分、A2 finally 块需新增、A2 messages 清理改用 baseline index 方式、C4② compact 模型跨 Provider 限制
> - v2.3（2026-04-16）：三轮校准——补齐 A2/B3 涉及文件（abstractProvider+providerTypes/directorCodeAgent）、C1b max_completion_tokens 具体切换规则、A3① 伪代码 TypeScript 修正、A 批次内部并行说明、CreateMessageParams 类型变更标注
> - v2.4（2026-04-17）：代码交叉验证后修订——**修正 A2 重大事实错误**（三家 Provider fetch 已传 signal，删除无效的"需新增①"）；补充 isCanceled 上游机制说明（`response.cancel()` 自动设状态）；B4 补充遗漏文件 `chatSetupRunner.ts`/`chatActions.ts`/`chatSetupController.ts`；B4 truthy 检查从字符串扩展到对象层级；补充 `agentEngine.contribution.ts` + `directorCodeAgent.ts` 跨批次协调；C1b `buildUrl` 明确仅 OpenAI/Anthropic 系使用；C5 补齐涉及文件/验收标准；D1 补齐兼容性验证标准；A1 补充上游追踪说明；B1 补充 protocol 注册检测；B3② 降级标记改为 `"_note"` 非空对象；A3 补充伪代码 fallback 语义注释 + compact 成本窗口期 + turn 消耗进度提示；smoke test 自动化程度说明。**三项决策写入**：A2 取消截断保留最近完整 tool 往返（非全截断到 baseline）；B4 统一 early return guard 策略；总工期调为 10 周（B/C 末各 +0.5 周缓冲）
> - v2.5（2026-04-17）：二轮深审——A2 涉及文件清理（`providerTypes.ts`/`abstractProvider.ts` 标记为已无需改动）；A2 toolBridge 改用现有 `CancellationToken`（不再新增 `AbortSignal` 参数）；A2 `lastCompleteTurnEnd` 明确在整批工具完成后更新；C1b `max_completion_tokens` 补充 `o4*` 系列；B2 `_openAIModelToResolved` 明确替代方案（传入 `providerType` 参数）；B3⑤ cancelled response 过滤实现（`isCanceled` 检查）；B4 `chatGettingStarted` 重写内容定义（中性 AI 配置引导，避免 API-key-only 口径）；C2 `testConnection` 超时值 15s；C3 `registerDynamicAgent` 重复 ID 处理为 dispose-old-then-register；测试清单补充 thinking 过滤/cancelled 排除/protocol 检测/provider 推断等遗漏项
> - v2.6（2026-04-17）：三轮终审——A2/A3 并行开发的 `agentEngine.ts` 合并顺序明确（A3 内部循环重构先合，A2 外层 try-finally 后合）；`directorCodeAgent.ts` 目标形态设计时点从"B 批次开始前"提前到"A2 实现前"；toolBridge `onCancellationRequested` handler 需在 finally 中 dispose 防泄漏；C1a Gemini function call ID 稳定化补充实现方式（合成 `gemini-fc-{index}` ID）；C2 Test Connection 与防抖写入的交互明确（先 flush 再测试）
> - v2.7（2026-04-17）：四轮收尾——B3① `history`/`richResponses` 索引对齐防护（长度不等时退回纯文本）；C4② compact 模型可用性检测机制明确（ModelResolver 列表 + 403 降级标记）；测试清单补充 D1/D2 遗漏项
> - v2.8（2026-04-17）：执行前收口修订——文档定位从“唯一主计划”调整为“Phase 1 收口修复执行计划”，并与 `.cursor/` 权威关系对齐；A2/B3 取消历史语义统一为“保留已完成 tool 往返，仅过滤 incomplete assistant/thinking”；A4a 明确 **Not Now = 本次拒绝、不写 session allow cache**；B1 protocol 检测改为“最佳努力 + callback 超时提示”；B4 改为字段分层策略（`manageSettingsUrl` 指向 Settings，quota/plan/entitlement 链先 guard 再置空），受影响路径清单降级为首轮清单并补齐 status/management/account/welcome 触点；Phase 2 门槛拆为“开发启动”与“默认开启/对外发布”两档
> - v2.9（2026-04-17）：执行前再收口——B4 三项决策正式落版：`terms/privacy/publicCode` 采用**发布前补真实独立页面**路线，开发期可为空并隐藏依赖 UI；`workbench.action.chat.triggerSetup*` 命令族在 built-in mode 下统一改为 `director-code.openSettings` 的兼容别名；B1 单飞锁释放时机明确为**callback 超时告警时释放，但旧 state 在 TTL 内仍有效**。同时补齐 `outputMonitor.ts` 的 `copilot-fast` 依赖、B4 状态映射语义、`ModelResolver` 最小改签名策略及测试/验收同步
> - v2.10（2026-04-17）：review 后再收口——B1 补齐 OAuth 最后一跳（按 `IURLService.registerHandler()` 方式注册 URI handler、`effectiveClientId` 持久化到 token/refresh 链、补记 `directorCodeSettingsEditor.ts` 当前仍为 `Coming Soon` 占位）；B4 将 `defaultChatAgent.extensionId` 与现有自研链路统一为 `director-code.agent`，并补齐首轮涉及文件；C2 明确 OAuth 状态解析不能继续停留在无注入的 `getProviderAuthMethod()` 纯函数，且 Settings 必须把 `Subscription & Login` 占位替换为真实控件；C5 `.bak` 清理扩展到 `product/package/manifest/.npmrc` 并要求 `trap ... EXIT` 覆盖失败路径；Phase 2 门槛表述与 `.cursor/plan-04-phase2-acp.md` 的阶段定义重新对齐；补记 1 项待决策（OAuth clientId 来源策略）。**注**：其中 URI handler / `effectiveClientId` 作为 OAuth 主路径的表述已被 v2.11 的 Hermes-style provider-specific flow 替代，执行以 B1 正文为准
> - v2.11（2026-04-17）：OAuth 路线拍板——采用 **Hermes-style provider-specific OAuth**：不再走 BYO `clientId`，改为内置 provider public `clientId` + 按 provider 决定登录形态（`anthropic` = PKCE + 手动粘 code，`openai` = device code / 官方 public flow，后续 provider 视情况走 delegated external）；B1 从“统一 callback OAuth”调整为“统一状态机 + provider-specific flow”，`IURLHandler` / `urlProtocol` 从主路径降级为可选增强；C2 改为 provider-specific OAuth UI，不向终端用户暴露通用 `clientId` 输入；测试清单同步改写
> - v2.12（2026-04-17）：OpenAI OAuth 文案拍板——用户侧 OAuth 入口文案固定为 **`OpenAI (ChatGPT/Codex OAuth)`**，不再简写为笼统的 `OpenAI` 登录，避免与 `api.openai.com` 的 API-key 路径混淆；B1/C2 对应文案与执行口径同步更新
> - v2.13（2026-04-17）：执行清单化收尾——`A1~A4`、`B1/B2/B3/B4/原A5`、`C1~C5` 及 `D1~D4` 全部补齐为文件级 checklist；其中 `D` 批次补充 Gemini header 开关、密钥输入安全、通用 fetch helper、Editor 生命周期审计的具体代码落点与测试/Smoke 路线
> - v2.14（2026-04-17）：最终交叉一致性审查——补齐三类跨清单口径：① 明确 `B1` 负责 OAuth widget/controller 的**状态机内核**，`C2` 只负责 editor 集成与 UI 壳，避免重复实现；② 明确 `B4` 负责去 Copilot 化的 CTA/品牌收口，`C4-8` 只负责辅助模型选择 fallback，不再二次接管 CTA；③ 明确 `openai` 顶层 provider slug 不变，但 API-key 区域仍可保留 `OpenAI (GPT-4, o3)`，OAuth 区域固定显示 `OpenAI (ChatGPT/Codex OAuth)`；并把 `C3/C4/D3/D4` 的测试遗漏补入文末总测试清单
> - v2.15（2026-04-17）：整体计划复审后再收口——补齐 `B1 → C2` 的硬依赖与 `C1b`/`C2` 对 `B1` auth 契约的前置说明；将 B4 的 `chatGettingStarted` 从“API Key 配置引导”收口为“中性 AI 配置引导”，避免与 OAuth 路径冲突；冻结 `openai-codex` 命名，不再保留执行期临时改名空间；补充 OpenAI OAuth/codex 在 compact 场景下的 `authVariant` 例外规则；修正 `dataFolderName` 的 Windows 实际校验路径为**用户主目录**下的 `.director-code`（不是 `%APPDATA%`）；并新增 2 项执行前待拍板（fixed public `clientId` 来源归属、OpenAI OAuth 失败时的发布策略）
> - v2.16（2026-04-17）：用户决策落版——fixed public `clientId` 来源正式选 **C（复刻 Hermes 实现）**，B1 按 Hermes 同源 public `clientId` 落地；OpenAI OAuth fallback 正式选 **B**，允许优先完成其他明确项后再回收 `B1-5/B1-6`，但若最终 transport/smoke 仍不稳定则继续阻塞 Phase 1 对外发布；同步修正 ACP 计划中的 Gemini CLI 示例包名为 `@google/gemini-cli@latest`
> - v2.17（2026-04-17）：复审后再收口——补齐 `B1-core` vs `B1-ship` 的发布门禁口径；写死 `B2-1` 及后续依赖 `authIdentityKey`/`authVariant` 的步骤必须晚于 `B1-2/B1-3` 的最小输出；把 `B1-7` 与 `C2-4` 的 OAuth widget/controller 物理归属与迁移边界写实；补充 OpenAI `authVariant=openai-codex` 验收必须命中 codex 后端、静态 allowlist 为空时阻断请求、B4/C4 同文件修改顺序，以及发布候选需在清理 NLS/clp 缓存后的干净环境验证启动
> - v2.18（2026-04-17）：整体计划再复核收口——修正 A2 `lastCompleteTurnEnd` 与 A3 并行工具语义的隐藏冲突（mutation 工具按已落盘结果推进 checkpoint，只读并行批次整批推进）；将 B4 拆成 `B4-core` / `B4-followup`，明确 Week 6 的 “B 完成” 是主线实现里程碑而非 `B1-ship` 发布门禁；补齐 `B1-5/B1-6` 对 `C2` 中 OpenAI OAuth UI 的前置闸门；写实 `B1-7` 与 `C2-4/C2-6` 的交付边界；补齐 `C1/B2` 共享 URL 归一化契约、`stream_options.include_usage` 回退边界、`C2` 的 `authVariant` 状态模型、`C4` compact 不可用标记维度、`C3` `resource_link` 失败语义、`D1` 双端点验证不一致时的收口规则，以及发布候选/NLS 与顶层 `privacyStatementUrl` 的测试门禁闭环
> - v2.19（2026-04-17）：用户追加拍板——B4 的 `terms/privacy/publicCode` 与顶层 `privacyStatementUrl` 对应页面统一采用 **GitHub Pages** 承载；不再保留“官网 / GitHub Pages / 其他站点”三选一口径。文中相关“承载位置待定”描述已同步收口为 GitHub Pages 路线
> - v2.20（2026-04-17）：整体计划复核后收口——修正 A4a 的当前状态描述（Map / `.has()` 现状对齐）；补齐 B2/C1 URL 归一化的唯一真相约束与 `authVariant` 最小改签名口径；把 B3 cancelled replay fallback 从隐含要求提升为执行 checklist；将 C2 状态优先级改为**写死统一顺序**；统一 A3/C4 的 compact 成功判定数值标准；扩写 C1 验收标准；明确 C4-5 与 C2 的 Settings 归属边界；显式标注 B4 发布说明页仍需用户拍板的 3 项落版信息；C5 的 `build.sh` 表述与仓内现状对齐
> - v2.21（2026-04-17）：用户确认采用 B4 发布页默认落版方案——GitHub Pages host base 固定为 `https://daxijiu.github.io/Director-Code/`；页面 path 固定为 `/terms/`、`/privacy/`、`/public-code/`；页面 owner 固定为仓库 owner；首版文案来源固定为“先用仓内文档起草，再单独做一轮文案/合规校对”。B4 中相关“仍需用户拍板/冻结 path-owner-source”口径已同步删除
> - v2.22（2026-04-17）：整体计划复核后补齐执行边界——补写 5 处容易返工的口径：① `authVariant` / `flowKind` 必须有单一共享类型真相，禁止多处手写字符串；② `B3` 的 replay-only fallback 明确必须落到 session 级 snapshot 宿主，不能引用 `AgentEngine` 的局部状态；③ `C2` 明确 OpenAI OAuth 激活时 `baseURL` / `Test Connection` 等 API-key-only 控件的失效边界；④ `C5` 的“工作树污染”范围扩到 Electron 缓存 / 下载 zip，并写死 `.electron-cache/` 为唯一缓存落点；⑤ `DIRECTOR_CODE_SKIP_EXTENSIONS_BUILD=1` 默认只用于受限环境构建，若用于 RC/release 需附加缺失 builtInExtensions 的影响验证；发布候选补充 GitHub Pages 四页可达性校验
> - v2.23（2026-04-17）：整体计划再 review 收口——补齐 4 处执行歧义：① B1/C2 中 Hermes / free-code 绝对路径统一降级为**可选参考**，执行以本文 checklist 为准，不再把外部 clone 当隐式前置；② 补齐 B1/B2/C5 的涉及文件清单（`directorCodeSettingsEditor.ts` / `directorCodeModelProvider.ts` / `apiKeyService.ts` / `.gitignore`）；③ 明确 GitHub Pages 四页属于 B4 的并行非代码交付，RC 前必须完成内容发布与 URL 探测；④ C5 明确 `.gitignore` **只忽略** `.electron-cache/`，根目录 `electron-v*.zip` 继续视为异常产物，不纳入 ignore
> - v2.24（2026-04-17）：代码交叉验证补齐——① B4 补漏 `chatSetupGrowthSession.ts`（含 `Try Copilot` / `Welcome to GitHub Copilot` 直面用户文案，属 blocker 级漏项）；② 修正 B4 清单中错误/不完整文件路径（`welcomeAgentSessions/browser/agentSessionsWelcome.ts`、`agentTitleBarStatusWidget.ts`、`defaultAccount.ts`、`chatEntitlementService.ts` 的绝对路径；`welcomeGettingStarted.ts` 不存在，实际为 `gettingStartedContent.ts`）；③ 补齐 `defaultChatAgent.extensionId` 非 chat 模块消费点审核表（`extensionEnablementService.ts` / `inlineCompletionsUnification.ts` / `extensionsWorkbenchService.ts` / `defaultAccount.ts`），改名到 `director-code.agent` 后均为 no-op 安全；④ B4-1 明确 `jq` 深度合并语义（省略 ≠ 置空，必须显式写空串）及 `prepare_vscode.sh` L47/L49 的冗余 setpath 处置建议；⑤ smoke 补注 Help > Privacy Statement 开发期菜单项不可见、dev/watch 模式数据目录带 `-dev` 后缀；⑥ A3① 补 Anthropic `blockIndex -> toolIndex` 映射伪代码（避免只给 `tool_use_start` 带 index 而 `tool_input_delta` 漏带）；⑦ A3⑤ 补 readonly 工具 tag **全仓无任何工具使用**的代码现状说明；⑧ B1 新增 `oauthService.ts` 旧 `vscode://director-code/...` redirectUri 与实际 `urlProtocol` 不一致警告；⑨ B1-1 补全"破坏性改动联动清单"（类型/基类/三家 Provider/工厂/消费者/测试必须同一 PR）；⑩ `chatGettingStarted.ts` 重写的触发时机（`onDidChangeAgents` / `LifecyclePhase.Restored`）、一次性 storage guard、B4 阶段性临时 guard、C2 完成后切统一 auth state model；⑪ A2 `metadata.subtype = 'cancelled'` 使用边界（不参与上游 UI 状态映射）；⑫ B3 tool_result base64 判定精度收紧（regex + 无空白 + 优先 `output.type` 判定）；⑬ C2-2 防抖写入在 editor dispose / Test Connection 取消场景下的 flush 语义。**同步落版 3 项用户拍板**：
>   - A3⑤ **`also-tag-readonly`**：本轮同时为 5 个无副作用的内置只读工具（`read_file` / `list_dir` / `file_search` / `semantic_search` / `grep`）打 `tags: ['readonly']`，让 MAX_CONCURRENCY 并行路径和 A2 `lastCompleteTurnEnd` "readonly 整批推进" 分支真正生效；具体 tool id 以上游最新注册为准
>   - B4 顶层 URL **`sync-cleanup`**：`reportIssueUrl` / `releaseNotesUrl` / `requestFeatureUrl` 真相统一在**根目录** `product.json`；同步删除 `prepare_vscode.sh` L48/L49 的 `releaseNotesUrl` / `requestFeatureUrl` 冗余 setpath；L47 `reportIssueUrl` 的 setpath 由执行人判断是否一并清理
>   - B4 `extensionId` **`keep-as-is`**：保留 `defaultChatAgent.extensionId = "director-code.agent"`；B4-6 扫尾时人工核对 4 处非 chat 模块消费点（`extensionEnablementService` / `inlineCompletionsUnification` / `extensionsWorkbenchService` / `defaultAccount`）实际为 no-op 安全；若发现实际副作用则升级为 B4 blocker
> - v2.25（2026-04-17）：Review 后再收口——① 修正 A2 `lastCompleteTurnEnd` 与 A3⑤ slot 回填的隐藏冲突（当前 `executeTools()` 执行完**整批**才 `this.messages.push` 一条 user message，"mutation 单个结果立即推进"在不改消息结构下物理不可行；已改为**整批 tool results 落盘后统一推进**，mutation/readonly 推进粒度在 `this.messages` 级别一致）；② 修正 B4-5 `chatGettingStarted.ts` 的 `Array.some(async ...)` 实现 bug（`.some` 不支持 async predicate，改为 `await Promise.all(...)` + `.some(Boolean)`）；③ 补 `toolBridge.ts` `invokeWithTimeout()` finally 块的 timeout/cancellation 竞态顺序（`Promise.race` 后 finally 统一 dispose；`setTimeout` 的 id 用 `clearTimeout` 幂等清理）；④ 补 B1-3 `IOAuthService` / `IModelResolverService` 的注册顺序无先后约束说明（两者均 `InstantiationType.Delayed`，注册点无强依赖，只需同一 contribution `_register` 中出现即可）；⑤ 补 B3 `DirectorCodeAgent` 注入 `IChatService` 的循环依赖规避（通过 `@IInstantiationService` + lazy `invokeFunction` 在 `invoke()` 内部按需取 `IChatService`；**不**在构造函数中注入）；⑥ 明确 Phase 1 "收口" vs "对外发布" 的两层语义（收口 = A/B/C 主线实现完成，对外发布 = 收口 + `B1-ship` + `D1/D2` + GitHub Pages URL 探测；两者不可混用）；⑦ 里程碑表述修正：Week 6 末的 "B" 改为 `B4-core + B1-core + B2 + 原 A5 + B3`，`B1-ship` 在 Week 7-10 内完成；⑧ C5 补 bash 兼容说明（Windows 需 Git Bash/WSL/MSYS2 运行 `prepare_vscode.sh`）；⑨ 补 cache bucket 过期/LRU 兜底说明（简单 Map + logout 时主动 `refreshModels()` 清旧 bucket，不引入 LRU）；⑩ 补测试清单中 D1 双端点不一致样本、B3 长度不等退回纯文本项。**同步落版 5 项用户拍板**：
>   - **决策 1（triggerSetup\* 失败处理）**：B4-2 的 setup 命令族别名失败时，helper **始终返回 truthy**（避免 Copilot sign-in fallback），同时显式 `INotificationService.error(...)` 弹窗提示用户手动走 `Ctrl+Shift+P`
>   - **决策 2（L47 reportIssueUrl setpath 处置）**：**保留不删**，作为"根 product.json 不存在或 merge 未触发"的边缘场景兜底；双源容错而非唯一真相
>   - **决策 3（OpenAI OAuth 激活时 baseURL/API-key 控件呈现）**：统一采用**只读 + 灰显 + 说明文字**（`"当前由 OpenAI OAuth 接管..."`）；**不** hide、**不**折叠 details；保持可见性帮助用户理解状态
>   - **决策 4（B1-ship 无限期阻塞发布）**：不设时间上限，不允许"降级发布"或"软发布"。OpenAI OAuth / Codex 是 Phase 1 对外发布的必要特性；若长期无法 ship 需重新评估 Phase 1 特性集，而非绕过 B1-ship
>   - **决策 5（readonly tag 每次 rebase 必检）**：A3⑤ 的 readonly tag 清单维护纳入 rebase checklist 6 步验证流程（id 校对、新增工具评估、改名追溯等），结果作为 rebase PR 描述一部分提交
>
> - v2.26（2026-04-17）：执行前深度审查后再收口——① **修正 A2 事实错误**：v2.4 修订过度删除的"需新增"项要补回——`AgentEngine.submitMessage()` 构造 `requestParams` 时**未**传入 `abortSignal`（`agentEngine.ts` L221-231），流式路径 Provider 拿到的 `params.abortSignal` 为 `undefined`，底层 `fetch()` 的 `signal` 形同虚设；A2 修复项新增这一条，A2-1 checklist 补上；② 修正 B4/C4⑥ 文件路径：`chatGettingStarted.ts` 实际在 `browser/actions/` 下（原文档未指明），`chatThinkingContentPart.ts` 实际在 `browser/widget/chatContentParts/` 下（原文档少了 `widget/` 层级）；③ 补充 `dataFolderName` 的 stable/insider/dev 三通道语义，避免与 `.director-code-insiders` 混淆；④ C1b 现状描述精确化：`stream_options.include_usage` 仅在 `createMessageStream()` 设置，非流式路径不设置；⑤ B2 补充 Settings 页"Refresh Models"按钮作为 24h 过期的手动绕过入口；⑥ A2/A3 并行补 Git 操作建议（开两个分支、A3 先合 A2 rebase、禁止单 PR 混合）；⑦ C1a OpenAI vision 对 `authVariant = openai-codex` 的 image block 处置写死为"drop + warn，不抛异常"；⑧ C4② compact 跨 `authVariant` 不匹配时回退主模型（不仅跨 provider name），补测试用例；⑨ B4-8 执行时机明确为 Week 9 末 C 主线完成后 0.5 天内；⑩ C5 补开发者文档更新要求（Windows 运行环境、`DIRECTOR_CODE_SKIP_EXTENSIONS_BUILD` 用途、`.electron-cache/` 约定、`trap cleanup EXIT` 行为）。**同步落版 5 项用户拍板**：
>   - **决策 1（B1 OAuth 旧 callback 代码）**：**保留作为可选增强备用**。旧 `handleCallback(code, state)` 及 `redirectUri = vscode://director-code/auth/callback` 相关代码**不要一次性删除**；B1-2 重写后标注为 `@deprecated // reserved for URI-callback-based provider expansion`，未来若有 provider 的官方 flow 需要 app callback 可重新启用。短期是死代码但保留低迁移成本的选项
>   - **决策 2（D1 两端点不一致）**：**严格阻塞发布**。若 `generateContent` / `models.list` 中任一端点 header 认证失败，`D1` 视为未完成并继续阻塞 Phase 1 对外发布；允许在实验分支尝试 endpoint-level fallback 留作记录，但**不计入本轮收口**，也**不作为放行 D1 的路径**。预期该场景极少发生（Google 对同一 API key 的不同端点使用相同认证），若真的出现则按 Phase 1 特性集重新评估处理
>   - **决策 3（B4 过渡期 Getting Started UX）**：**接受短期 UX 问题**。B4 完成到 C2 完成之间 2-3 周的窗口期，Getting Started 对"已 OAuth 登录但未设置 API key"用户显示"需配置"为已知问题；该窗口期仅影响内部/早期测试，**不影响对外发布**（Phase 1 发布门槛要求 C2 完成）；不主动在 B4 阶段提前集成 OAuth 检测以避免 B4/B1 耦合放大
>   - **决策 4（C2 Auth State Service 归属）**：**新建独立 `IAuthStateService`**。不扩展 `IApiKeyService`（名字会与 OAuth 语义打架），不把 OAuth service 做成 auth facade（职责混杂）。`IAuthStateService` 负责 resolve `(provider, model) → { source: 'oauth' | 'per-model-key' | 'provider-key' | 'missing', authVariant, ...metadata }`，内部聚合 `IApiKeyService` + `IOAuthService` 输出；C2 的 widget/status bar 只读这个 service。新建 service 路径建议 `vscode/src/vs/workbench/contrib/chat/common/agentEngine/authStateService.ts`
>   - **决策 4 延伸（v2.27 补）：`IApiKeyService.resolveProviderOptions()` 彻底废弃**：`resolveProviderOptions()` 不再被任何上层消费点调用，统一替换为 `IAuthStateService.resolveAuth(provider, model)` 返回的 `{ source, authVariant, apiKey?, accessToken?, ... }`。`DirectorCodeAgent` / `DirectorCodeModelProvider` / standard Chat 通路 / ModelResolver 的 `authIdentityKey` 提取均改走此方法。B1-8 的 checklist 同步变更为"统一切到 `authStateService.resolveAuth()`"，不再保留"OAuth 优先于 API key"的两套并行实现。工作量比"resolveProviderOptions 内部注入 AuthStateService"多出一些调用点替换，但换来**真正唯一真相**：认证路径只有 AuthStateService 一个入口，未来加 delegated/external flow 时扩展点明确
>   - **决策 5（GitHub Pages 四页合规校对）**：**开发者自行校对**。首版文案由开发者起草，自校对用词中立、信息准确、链接可达即可发布；**不**追求法务级合规完备、**不**阻塞 Phase 1 发布；Phase 2 若有外部合作/付费用户再考虑引入外部复核。这是独立开源项目 Phase 1 的合理取舍
>
> - v2.29（2026-04-17）：整体计划再 review——**消除正文与已定决策的矛盾**：① A3⑤ rebase 步骤 2 改为对照**本文附录 A**（与 v2.28 Q6 一致，删除仍指向 `.cursor/readonly-tools.md` 的旧口径）；② A4-0/A4-1 与 A4a v2.28「最小改法」对齐——`Not Now` 语义靠 `_getMatchingModelInner` 的 `.get(id)===true` 实现，**不**要求删除 `allowButtons()` 已有的 `set(id, false)`；③ B4-1 基线描述中「L47/L49 删除 Microsoft setpath」改为 **v2.28 Q5 三源对称增补**（与下文 B4-1 详细段落一致）；④ B1「旧代码保留策略」与 v2.27 lint 策略对齐——删除与「首行 throw」矛盾的 `if (false && ...)` 表述；⑤ Week 10 里程碑中「Phase 2 设计/原型」明确为**零代码**预研口径，避免与 v2.27 决策 5「禁止 Phase 2 仓内代码」误读冲突；⑥ GitHub Pages 与 v2.28 Q4 对齐——漏网时优先补 `exclude:`，**不**默认退到 `docs/site/` 改 path
> - v2.28（2026-04-17）：整体计划复审+代码层交叉验证后的澄清、补遗与 8 项用户拍板——
>
>   **一、代码层交叉验证后直接完善（无需决策，仅事实澄清/遗漏补齐）**：
>   - **A4a 修复策略澄清**：明确本轮**只**改 `_getMatchingModelInner` 的 `.has(id) → .get(id) === true` 两处判定；**不改** `allowButtons()` L193 的 `'Not Now': set(id, false)` 写入（`false !== true`，保留 set 写入与改 get 判定在行为上等价，删 set 是无意义的附带 rebase 冲突面）。历史修订里"Not Now 不写入 false 值"的表述仅指**判定等价**，不要求真的删 set
>   - **A1 补充不纳入范围**：`languageModelToolsService.ts` L962 `playAccessibilitySignal()` 同样存在 `.at(-1)` 读 permissionLevel，但影响面仅限 accessibility signal 跳过判定，不影响工具确认正确性；本轮**不纳入** A1，需要时复用 `resolveRequest()` helper 单独扩展即可
>   - **A1 实现提示**：`beginToolCall()` L901-905 已实现正确的 `(chatRequestId ? find(r => r.id === chatRequestId) : undefined) ?? at(-1)` 模式，`resolveRequest()` helper 可**直接照搬**，不需要重新设计
>   - **B4-1 工作性质澄清**：根目录 `product.json` 当前**完全不含** `defaultChatAgent` 块及 `reportIssueUrl/requestFeatureUrl/releaseNotesUrl/privacyStatementUrl` 这 4 个顶层字段；B4-1 是"整块新增 30+ 字段的 JSON 对象"，工作量评估需预留 0.5 天（含 JSON 核对 + merge 验证），不是"小改几个字段"
>   - **C5 `.electron-cache/` 现状修正**：`prepare_vscode.sh` 当前**没有** `mkdir -p .electron-cache` 语句；仓库已有的 `.electron-cache/electron-v39.8.0-win32-x64.zip` 和根目录平级 `electron-v39.8.0-win32-x64.zip` 是 `npm ci` / electron npm 包 postinstall 的默认行为；`C5-1` 需**显式**在 `cd vscode` 前 `export ELECTRON_CUSTOM_DIR="$(pwd)/.electron-cache" && mkdir -p` 把下载目标固定，并让 cleanup 扫描清理根目录遗留
>
>   **二、8 项用户拍板决策**：
>   - **决策 Q1（B1-1 → B1-8 过渡策略）**：**选项 A**——维持 v2.27 现状，B1-1 升级 `resolveProviderOptions()` 返回结构 → B1-4/B1-6 消费升级后旧 API → B1-8 彻底废弃。接受"中间步骤部分工作会被废弃"的代价，换取规避"一次性大改"的风险。**不**预留 thin wrapper 永久保留方案
>   - **决策 Q2（B3 `_replaySnapshots` 截断与 LRU）**：**选项 B**——LRU 淘汰触发时机 = 每次 `_replaySnapshots.set()` 前检查 `size >= 16` 则删最久未访问 entry；单 snapshot 超过 200 messages 时采用**"保留最早 1 条 user message（作为指令锚点）+ 最近 199 条"** 策略，避免初始指令被截掉破坏 replay 连贯性。**不**采用"简单保留最近 200"或"直接放弃整个 snapshot"方案
>   - **决策 Q3（`IAuthStateService.resolveAuth()` authVariant 调用契约）**：**选项 A**——`authVariant` 参数**必填（required）**，不允许 optional + 默认 fallback；漏传时 TypeScript 编译报错，避免运行期默默走错通道（API-key vs OAuth/codex）。非 OpenAI provider（anthropic / gemini / 等）调用方固定传 `'default'`。**所有**调用点升级为 3 参数，B1-8 grep 验收标准扩展为验证此规则
>   - **决策 Q4（GitHub Pages `_config.yml` exclude 验证方式）**：**选项 A**——按当前 `_config.yml` 规则直接启用 Pages，遇到 review 文档泄漏再打补丁修 exclude pattern。接受"首批可能有 review 文档意外公开"的小风险；**不**引入 staging 分支验证流程，也**不**改用 `docs/site/` 专用子目录方案
>   - **决策 Q5（`prepare_vscode.sh` L47/L49 删除后的兜底）**：**选项 B**——L47/L49 从"删除 Microsoft setpath"改为"增补 Director-Code 版 setpath"，三者 `releaseNotesUrl` / `reportIssueUrl` / `requestFeatureUrl` 完全对称兜底。具体：L47 = Director-Code releases 链接；L48 保持不变；L49 = Director-Code issues 链接（与 L48 同 URL，因 Director-Code 用同一 issue tracker 收集 bug 与 feature request）
>   - **决策 Q6（A3⑤ readonly tag 清单物理位置）**：**选项 C**——维护在本文件附录 A（v2 remediation plan 末尾新增），**不**单独开 `.cursor/readonly-tools.md`，**不**放 `.cursor/plan-04-phase2-acp.md` 末尾。rebase 时连同 A3⑤ 正文一起更新，PR 描述引用本附录 6 步 checklist 结果
>   - **决策 Q7（B1-ship 永久阻塞 + Phase 2 严格等待的应急预案）**：**选项 A**——维持 v2.27 决策 4 现状，任何风险都单独开决策处理；**不**预留"OpenAI 政策变更紧急通道"条款。作为独立开源项目，接受"OpenAI 若完全关闭 device code → Phase 1 永久阻塞 → Phase 2 永久阻塞"的边缘风险
>   - **决策 Q8（整体测试覆盖率硬性目标）**：**选项 A**——维持现状，按 checklist 用例覆盖 + 手动 smoke 验证，**不**设定整体行覆盖率硬性百分比（如 75% / 80%），**不**对关键模块设定独立覆盖率门禁。发布时以 checklist 完成度 + smoke 通过为准，不额外引入覆盖率工具链门禁
>
> - v2.27（2026-04-17）：整体计划再复核收口 + 6 项用户拍板——
>   - **事实性修正 / 执行细节补齐**：① **修正 B4-1 `prepare_vscode.sh` L47-49 行号-字段错配**（v2.24/v2.25 曾把 L47 错写成 `reportIssueUrl`，实际 L47=`releaseNotesUrl` / L48=`reportIssueUrl` / L49=`requestFeatureUrl`；按旧口径执行会颠倒删掉已改好的 `reportIssueUrl` 并保留 Microsoft 链接，本轮以 `prepare_vscode.sh` 实际内容核对后修正）；② 补充 `chatAgents.ts` 实际路径在 `common/participants/` 下；③ A3② JSON 解析失败语义补充说明（为何必须用 `tool_result is_error: true` 而非 user feedback）；④ B1-4 Anthropic OAuth 完成标志补充"最小真实端点 smoke"（B1-core 放行条）；⑤ D1 两端点验证证据形式写死（本地真实 API key + 脱敏响应贴 PR 描述）；⑥ C1a OpenAI vision 补充与 `modelCatalog` `capabilities.vision` 同步对齐；⑦ C5 补充 `.electron-cache/` 目录由 `prepare_vscode.sh` 自动 `mkdir -p` 创建 + Windows bash 推荐顺序写死（Git Bash 优先、WSL 不推荐）；⑧ B3 `DirectorCodeAgent._replaySnapshots` 生命周期写死（订阅 `onDidDisposeSession` + LRU 16 session + 单 snapshot ≤200 messages + `dispose()` 清理）；⑨ 测试清单补 CI gating 策略（`test:core` required / `test:d-improvement` 警告 / `smoke:manual` 非 CI）；⑩ `handleCallback()` 死代码保留的 lint 策略写死（`@deprecated` JSDoc + 运行时 throw guard，不用 `if (false && ...)` 或注释整块）；⑪ C4-5 `directorCode.ai.compactModel` schema 注册位置写死（`agentEngine.contribution.ts` 已有 configuration 块内）+ 与 C2-6 交付顺序说明
>   - **同步落版 6 项用户拍板**：
>     - **决策 1（built-in mode 判定条件，选项 C）**：采用**双判定** `chatExtensionId === '' OR extensionId === 'director-code.agent'`；抽出共享 helper `builtInModeUtil.ts`；兼容源码/watch 模式与 prepare 后发布模式，两种形态行为一致
>     - **决策 2（IAuthStateService vs resolveProviderOptions 职责，选项 C）**：**彻底废弃** `apiKeyService.resolveProviderOptions()`；`DirectorCodeAgent` / `DirectorCodeModelProvider` / ModelResolver 的 auth 提取全部改走 `authStateService.resolveAuth(provider, model)`；B1-8 checklist 同步变更为统一切到 AuthStateService 的方案（不再保留"OAuth 优先于 API key"的内部并存实现）；v2.26 决策 4 延伸口径在本轮写死
>     - **决策 3（OpenAI default vs openai-codex 在 picker UX 呈现，选项 B）**：picker 上显示**两组条目** `OpenAI` 与 `OpenAI (ChatGPT/Codex OAuth)`，用户显式选择；`directorCode.ai.authVariant` 新增配置项持久化选择；未登录/未配置时 picker 直接弹引导
>     - **决策 4（B1-ship 无限期阻塞的应对，选项 A 维持现状）**：不引入时间阈值自动降级、不创建分级发布线、不主动评估特性集重构；若 B1-ship 长期无法完成，其他 ready 部分也不单独对外发布（作为独立开源项目的合理取舍）
>     - **决策 5（Phase 2 与 Phase 1 对外发布的并发关系，选项 C）**：严格按 `.cursor/plan-04-phase2-acp.md` 执行，Phase 2 必须等 Phase 1 完成（含 B1-ship）后才能正式启动；收口期**允许**纯文档/协议调研/外部 ACP server 黑盒测试等零代码预研，**不允许**开启 Director-Code 仓内的 Phase 2 代码实现（含隔离分支、原型脚手架）
>     - **决策 6（GitHub Pages 4 页物理仓库位置，选项 A）**：放**同仓库 `docs/` 子目录**（`docs/terms/index.md` / `docs/privacy/index.md` / `docs/public-code/index.md`）；Pages 设置为 `Deploy from branch` + `master` + `/docs`；通过 `_config.yml` 的 `exclude:` 字段排除已有 review/remediation `.md` 文档；不采用 gh-pages 分支、独立仓库或 GitHub Actions 部署
>
> - v2.30（2026-04-30）：整体计划深度审查后收口——① **修正 `IAuthStateService` 创建归属矛盾**：B1-8 与 C2-0 都声称"新建"该 service，已明确 B1-8 负责创建+注册，C2 仅消费不重复创建；② **修正 `resolveAuth()` 签名不一致**：B1-8 原写 `resolveAuth(provider, model?)` 两参数，与 C2 v2.28 Q3 `authVariant` 必填决策矛盾，已统一为三参数必填 `resolveAuth(provider, model, authVariant)`；③ **补齐 `authStateService.test.ts`**：B1-9 测试文件清单与文末测试总表均新增该文件及覆盖范围（三源优先级解析、`authVariant` 路由、事件聚合）；④ **明确 `directorCode.ai.authVariant` 配置注册位置**：schema 注册归 B1-3，放 `agentEngine.contribution.ts` 已有 configuration 块内；⑤ **`chatSetupGrowthSession.ts` 处置策略拍板**：选 B（整段 guard skip），built-in mode 下不再注册 growth session contribution；`chatGettingStarted.ts` 已承担中性首次引导，growth session 4 处文案重写维护成本不值得
>
> **执行优先级说明**：修订记录仅用于追踪演进；其中已被后续版本推翻的旧口径、旧待决策、旧 blocker 判定，均以“执行前已拍板补充”和对应正文最新条目为准，不再单独生效。

## 原则

1. 先修"错误执行、错误绑定、错误状态"，再修"品牌、构建、体验"
2. 先修主路径（Agent 主循环 / 标准 Chat / 工具链 / 认证链 / MCP 边界），再修旁路
3. 所有修复必须带测试或等价验证证据，默认优先自动化测试；仅文中明确标注的审计项（如 D4）可用审计记录替代
4. "部分成立"或"证据不足"的条目放入防御性加固批次，不抢主线

## 全局约定

- **上游代码改动策略**：仅 fork 内修复，暂不给 VS Code 上游提 issue/PR。Rebase 时若上游自行修复则删除我们的改动。
- **上游代码测试标记**：所有我们添加的测试用 `// [Director-Code]` 注释标记。测试放在上游对应测试目录，复用上游 mock 基础设施。
- **`vendor === 'copilot'` 硬编码**：`languageModels.ts` 中的默认 vendor 特判本轮仍不单独修复；但**用户可见/可触发功能路径**里显式 `selectLanguageModels({ vendor: 'copilot', ... })` 或按 `vendor === 'copilot'` 分支的逻辑，纳入 `C4⑥` 收口范围。
- **文档权威关系**：`.cursor/` 持有总体路线、阶段边界与 Phase 2/3 规划；本文档持有 Phase 1/1.5/1.5+ 收口修复的执行细节。若两者冲突，先更新 `.cursor/` 的阶段结论，再同步本文档。
- **验证证据层级**：默认以自动化测试为主；脚本断言、手动 smoke 可作为补充；仅文中明确标注的审计项（如 D4）允许以审计记录替代自动化测试，且不得充当主发布门禁的唯一证据。

---

## 执行前已拍板补充（2026-04-17）

以下三项已由用户明确拍板，后续执行不再保留“待决策”口径：

1. **fixed public `clientId` 的来源归属**
   - 已拍板：选 **C**，直接**复刻 Hermes 的实现**
   - 执行口径：B1 中 `anthropic` / `openai` 的 fixed public `clientId` 直接按 Hermes 同源实现落地，不再额外要求“项目自注册 app”或“另找 vendor 官方新 client”作为当前轮次前置
   - 风险口径：若后续因为 vendor policy、合规或实际可用性问题必须替换，再单独开新决策；**当前轮次不再把这一项当 blocker**

2. **OpenAI OAuth 的失败收口策略**
   - 已拍板：选 **B**
   - 执行口径：`B1-5/B1-6` 若最终不能证明稳定 transport、真实 smoke 可用，则 **继续阻塞 Phase 1 对外发布**
   - 优先级说明：允许**先完成其他明确项**（A、B4、B2、原 A5、Anthropic OAuth、C/D 中不依赖 OpenAI OAuth 的部分），再回头集中处理 OpenAI OAuth；但在其结论明确前，**不得**把 OpenAI OAuth 记为完成或对外宣称可发布
   - 未收口前约束：不得在“transport / authVariant 未定”的状态下继续做 OpenAI OAuth UI 集成并宣称 B1 已完成
   - **无限期阻塞策略（v2.25 决策 4 确认，v2.27 决策 4 再次确认）**：`B1-ship` 不设时间上限。OpenAI OAuth / ChatGPT-Codex 是 Phase 1 对外发布的**必要特性**；不接受"降级发布仅 Anthropic OAuth + API key"、也不接受"先软发布等 B1-ship"。即使超过 Week 10 数周/数月仍未 ship，也继续阻塞对外发布。若长期无法 ship，需另开决策重新评估 Phase 1 的特性集定义，而**不是**绕过 B1-ship
   - **v2.27 决策 4 补强（用户明确选项 A：维持现状）**：
     - **不引入时间阈值自动降级**：Week 10+N 后不进入"降级发布"状态
     - **不创建分级发布线**（不拆分 basic/pro 两条线）
     - **不主动评估特性集重构**：继续按当前特性集推进 B1-ship
     - 仅当 OpenAI 公开 OAuth 政策发生重大变化（如完全关闭 device code）时，再另开决策；**不属于本轮计划范围**
     - **已知风险接受**：若 OpenAI OAuth 长期无法 ship，其他 ready 部分（A/B2/B4/C/D1/D2）可能永远不对外发布；作为独立开源项目的合理取舍

3. **B4 发布说明页的承载与落版方案**
   - 已拍板：统一放 **GitHub Pages**
   - 执行口径：`defaultChatAgent.{termsStatementUrl, privacyStatementUrl, publicCodeMatchesUrl}` 与顶层 `privacyStatementUrl` 的正式发布 URL 统一落到 GitHub Pages 域名下；不再为本轮收口保留“官网 / 其他独立站点”分支
   - host base 固定为：`https://daxijiu.github.io/Director-Code/`
   - 默认 path 固定为：`/terms/`、`/privacy/`、`/public-code/`
   - 对应正式 URL 固定为：
     - `defaultChatAgent.termsStatementUrl` → `https://daxijiu.github.io/Director-Code/terms/`
     - `defaultChatAgent.privacyStatementUrl` 与顶层 `privacyStatementUrl` → `https://daxijiu.github.io/Director-Code/privacy/`
     - `defaultChatAgent.publicCodeMatchesUrl` → `https://daxijiu.github.io/Director-Code/public-code/`
   - 页面 owner：仓库 owner
   - 首版文案来源：先用仓内文档起草首版，再单独做一次文案/合规校对
   - **合规校对归属已拍板（v2.26 决策 5）**：**开发者自行校对**，不涉及法务/外部专业人士：
     - 校对标准：用词中立、信息准确、链接可达、不误导用户
     - **不追求**法务级合规完备（独立开源项目 Phase 1 的合理取舍）
     - **不阻塞** Phase 1 对外发布
     - 交付形式：开发者自检后提交到仓库，PR 描述中简要写"已按 xx 标准自校对"即可
     - Phase 2 若引入外部合作/付费用户，再单开决策是否请法务或外部专业人士复核；**本轮不预留该前置**
   - **物理仓库位置已拍板（v2.27 决策 6）**：**同仓库 `docs/` 子目录**（选项 A）：
     - GitHub Pages 设置：启用 `Deploy from branch`，source 为 `master` 分支的 `docs/` 目录
     - 四个页面源文件路径：
       - `docs/terms/index.md`（或 `docs/terms/index.html`）
       - `docs/privacy/index.md`
       - `docs/public-code/index.md`
       - 顶层 `privacyStatementUrl` 与 `defaultChatAgent.privacyStatementUrl` 共用 `docs/privacy/index.md`
     - 需要在 `docs/` 根目录新建 `_config.yml`（Jekyll 最简配置）启用 Pages 渲染；示例：
       ```yaml
       theme: jekyll-theme-minimal
       title: Director-Code
       exclude:
         - "director-code-*.md"
         - "**/*-review-*.md"
         - "**/*-remediation-*.md"
         - "**/*-report-*.md"
         - "**/*-comparison*.md"
       ```
     - **与 `docs/` 内已有文档的区分**：当前 `docs/` 已有若干 review/plan/remediation 的 `.md` 文档；通过 `_config.yml` 的 `exclude:` 字段显式排除，避免它们被 Pages 渲染发布。若仍有漏网，**迭代补全 `exclude:` pattern**（v2.28 决策 Q4 选项 A 的路径）。**不**把默认退路改为 `docs/site/` 子目录（会改变已定 URL `/terms/` 等；v2.28 Q4 已拍板不采用该方案；若将来必须改 path，须**单开新决策**并同步改 `product.json` 四处 URL）
     - **验收**：`B4-1` 完成后首次 push `master`，需在 GitHub 仓库 `Settings → Pages` 里确认：
       1. Source 设置为 `Deploy from a branch` + `master` + `/docs`
       2. 站点地址显示为 `https://daxijiu.github.io/Director-Code/`
       3. 逐一探测四个 URL（期望 HTTP 200 且返回预期内容，不是 404 或空壳页面）
     - **不采用**：gh-pages 分支（多一个分支维护）、独立 `director-code-pages` 仓库（要改 host base 与所有 product.json URL）、GitHub Actions 部署（无必要的复杂度）
   - 约束说明：当前轮次已同时锁定承载平台、默认落版方案与物理仓库位置；发布前只剩页面内容实际产出与 Pages 配置的一次性启用，不再保留 path / owner / 文案来源 / 合规校对 / 仓库归属 的待决策口径

---

## 批次总览与工期

| 批次 | 优先级 | 工期 | 缓冲 | 核心目标 |
|------|--------|------|------|----------|
| **A** | P0 | **2 周** | — | 收口安全边界与状态一致性 |
| **B** | P1 | **3.5 周** | **+0.5 周** | 收口认证链、模型解析链、历史上下文链、产品元数据 |
| **C** | P2 | **2.5 周** | **+0.5 周** | 收口 Provider 兼容、UI 配置、资源生命周期、构建 |
| **D** | P3 | **1 周** | — | 防御性加固 |

**总计 10 周**（含 1 周缓冲：B 末尾 0.5 周 + C 末尾 0.5 周；**按主线集成 critical path 估算**。文中允许并行的设计/隔离分支工作默认不压缩该里程碑，除非后续单独重算排期）

**里程碑**：
- Week 2 末：A 完成 → A→B 集成 smoke test（0.5 天）
- Week 6 末：**B 主线实现完成** = `B4-core` + **`B1-core`**（**不含** `B1-ship` 的 OpenAI `B1-5 ~ B1-9`）+ `B2` + 原 A5 + B3，含 0.5 周缓冲；→ B→C 集成 smoke test（0.5 天）
- Week 7-10（并行于 C 批次）：`B1-ship` 收口（OpenAI OAuth 完整 transport + device-code + codex backend smoke）。若 `B1-ship` 在 Week 10 前完成则直接进入发布候选；若未完成，按已拍板策略 **B** 不阻塞 C 批次推进，但阻塞对外发布
- Week 9 末：**C 主线实现完成**（含 0.5 周缓冲）→ Phase 1 **内部收口** 达标（A + B1-core + B2 + 原 A5 + B3 + B4-core + C 全部完成）
- Week 10：D1+D2 + 最终验证 → 若此时 `B1-ship` 亦完成 + GitHub Pages 4 个 URL 已发布可探测，满足 **Phase 1 对外发布 / 默认开启门槛**（文中旧称“Phase 2 默认开启门槛”，与 `.cursor` 里“正式进入 Phase 2 ACP”不是一回事；D3/D4 为持续改进项）；若仅做 **Phase 2 零代码**预研（文档、协议 sketch、外部 ACP 黑盒测试等，**不含** Director-Code 仓内 Phase 2 代码），可在 A 完成且 B1-core/B2/B4-core 策略冻结后提前启动（与「Phase 2 ACP 预研与发布门槛」节、v2.27 决策 5 一致）
- **两层里程碑的区别（v2.25 明确）**：
  - **"Phase 1 内部收口"** = 主线实现闭环，可在内部构建 / 受控测试范围使用；**不要求** `B1-ship`、**不要求** GitHub Pages 4 页发布
  - **"Phase 1 对外发布 / 默认开启"** = 内部收口 + `B1-ship` + `D1/D2` + GitHub Pages 4 页可探测 + RC 清洁环境启动验证
  - 两者**不可混用**：若 `B1-ship` 未达标，可声明"Phase 1 内部收口完成"但**不得**声明"Phase 1 发布就绪"或"Phase 1 默认开启"

**缓冲用途**：吸收 VS Code 月度 rebase 冲突解决、B4 的 15+ 文件处置验证、A2/B3 复杂度溢出。若无需使用则提前进入下一批次

**集成 smoke test 重点**：
- A→B：A1 request 绑定 + A4 权限联动；A2 取消 + A3 多工具交互
- B→C：A2 取消 + B3 历史回放；原 A5 + B1 OAuth 标准 Chat 全流程

**Smoke test 自动化程度**：B4 中与**构建产物品牌字符串、命令/链接残留、数据目录路径**相关的静态项可写成 grep/assert 脚本自动化；Documentation/Report Issue 跳转、确认弹窗、Getting Started、齿轮菜单、Usage/Status 面板等 UI 行为保留手动验证。**建议**：可自动化项编入 CI（或本地 `smoke-test.sh`），手动项保留 checklist

---

## 依赖关系

```
A1 request 绑定 ──→ A4 MCP/确认边界
A2 取消语义 ──→ B3 history/progress

B 内部顺序：B4-core（产品元数据主收口，最先做）→ B1+B2（并行）→ 原 A5（依赖 B1+B2）→ B3（依赖 A2+原 A5，最后做）
注：B3 的接口设计在 B1+B2 并行期同步产出（不写实现代码）

B1 OAuth 正确性 ──→ 原 A5（需要 OAuth + ModelResolver 注册完成）
B1（auth 契约 + `IOAuthService` 注册 + 最小可用 flow/widget-controller）──→ C2 通用 editor 壳 / Anthropic OAuth UI
B1-5/B1-6（OpenAI transport + `authVariant` 结论冻结）──→ C2 OpenAI OAuth UI / 状态集成
C1a（SSE/Gemini）先做 ──→ C1b（/v1/max_tokens/usage）与 C2 同步做
C3 生命周期 ──→ 可与 B1+B2 并行开发（与 B 数据来源改动正交）
A3④ compact 判定修复（用主模型）──→ C4② compact 专用模型（替换主模型）
C4 模型元数据统一 ──→ 后续成本/上下文策略优化
```

**并行说明补充**：`C1b` 与 `C2` 可以在 B 批次后半段并行推进，但**不得早于** `B1` 的 auth 契约、`IOAuthService` 注入链和最小可用 flow/widget-controller 落地；否则只能做假 UI 或临时分叉。**补充闸门**：`C2` 中 `openai` 的用户可见 OAuth UI/状态集成，必须晚于 `B1-5/B1-6` 已冻结 transport / `authVariant`；在此之前最多只能做 editor 壳、Anthropic 路径和通用刷新链，不得做“看起来已可点”的 OpenAI 占位 UI。

**跨批次文件协调**：

- **`DirectorCodeModelProvider`**：在 B（原 A5 + B3）和 C3 都有改动。B 批次开始前先出目标形态设计文档（构造函数签名 + 关键方法签名），B 和 C3 基于同一份签名分步实施。**C3 的生命周期改动（`Disposable` 继承、dispose 链收口）与 B 的数据来源改动基本正交**，可在 B1+B2 并行期同步开发，不需要等 B3 完成。

- **`agentEngine.contribution.ts`**：A4b 删除 `_enableToolAutoApprove()`，B4 新增 `dataFolderName` 迁移提示。两者改同一文件但不同方法，冲突概率低。**约定**：A4b 删除方法时保留文件整体结构不变，B4 在 `_register()` 中新增迁移检测逻辑。

- **`directorCodeAgent.ts`**：A2（取消语义 — `abortSignal` 桥接 + `cancelled` 返回）和 B3（历史回放 — 注入 `IChatService`）都需改动此文件。**A2 实现前**（即 A 批次启动时）需同步出 `directorCodeAgent.ts` 目标形态设计（构造函数签名含 `IChatService`、`invoke()` 方法含 `try-finally` + cancel 返回路径），A2 和 B3 基于同一份签名分步实施。**注意时序**：设计必须在 A2 编码前完成，不能拖到"B 批次开始前"——否则 A2 可能实现出与 B3 不兼容的签名。

- **`apiKeyService.ts`**：`C1b-3` 先统一 URL / `testConnection()` 语义；`C2` 再补结构化事件、timeout 与 `flushPendingWrites()` 协同；`D1` 最后切 Gemini header/query 位置；`D3` 只抽 fetch helper、不再改行为语义。避免在 helper 抽取前后同时改 URL 规则与认证位置造成回归。

---

## 批次 A：P0 安全边界与状态一致性

### A1. 修复 request 绑定与工具确认链

**问题**：`languageModelToolsService.ts` 中 `invokeTool()` 和 `shouldAutoConfirm()` 用 `.at(-1)` 取最后一条 request 推断当前请求，而同文件 `beginToolCall()` 已正确按 ID 查找——逻辑不一致。**这是上游 bug**，Director-Code 未修改过该文件。

**涉及文件**：`vscode/src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts`

**实现方式**：
- 提炼统一的 `resolveRequest(session, chatRequestId)` 辅助逻辑，**最小侵入**原则
- `invokeTool()`、`shouldAutoConfirm()`、`shouldAutoConfirmPostExecution()`、streaming 占位与最终执行全部使用同一解析函数
- 仅在确实没有 `chatRequestId` 的兼容路径上保留降级到 `.at(-1)` + 日志警告
- Rebase 风险中等：局部替换 3-4 个调用点，不涉及结构重构。**上游追踪**：此为上游已知的不一致（`beginToolCall` 按 ID、其余按 `.at(-1)`），每次 rebase 前检查 `languageModelToolsService.ts` 的 `invokeTool`/`shouldAutoConfirm` 是否已被上游统一，若已修复则删除我们的改动

**测试**：放在 `chat/test/browser/tools/languageModelToolsService.test.ts`，用 `// [Director-Code]` 标记。覆盖：同一 session 多 request 并存、目标 request 不是最后一个、自动确认与执行结果落到同一 request。

**当前代码脱节点（执行前必须知道）**：

- `languageModelToolsService.ts` 当前同一文件里存在两套 request 解析口径：
  - `beginToolCall()` L901-905 **已实现**正确模式：`(chatRequestId ? model.getRequests().find(r => r.id === chatRequestId) : undefined) ?? model.getRequests().at(-1)` — **`resolveRequest()` helper 可直接照此模式提取**，不需要重新设计
  - `invokeTool()` L458、`shouldAutoConfirm()` L1126、`shouldAutoConfirmPostExecution()` L1173 仍直接 `model?.getRequests().at(-1)`
- 这会导致"streaming 占位、确认、实际执行、post-exec auto-confirm"四个阶段可能挂到不同 request 上
- **不纳入本轮 A1 的同文件 `.at(-1)` 使用点（v2.28 补充）**：
  - `playAccessibilitySignal()` L962 `model?.getRequests().at(-1)` — 读 `permissionLevel` 用于决定是否跳过 accessibility signal；影响面仅限"accessibility signal 跳过判定"，不影响工具确认 / 执行正确性，因此本轮**不纳入** A1
  - 若未来需要收口：单独开 issue，沿用 A1 抽出的 `resolveRequest()` helper 即可扩展，不构成阻塞
- 这是上游文件，改法必须尽量小，避免顺手把整段 tool service 结构重写

**A1 细化执行 checklist（文件级，按顺序执行）**：

1. **A1-0 先冻结“统一 request 解析函数”这个最小改法**
   - **先读文件**：`languageModelToolsService.ts`
   - **先冻结原则**：
     - 只抽一个 `resolveRequest(session, chatRequestId)` helper
     - 所有相关调用点统一走它
     - 只有在 `chatRequestId` 缺失时才允许 fallback 到 `.at(-1)`
   - **完成标志**：A1 仍是最小侵入修复，而不是 tools service 大重构

2. **A1-1 抽 `resolveRequest()` 并替换关键调用点**
   - **主要文件**：`languageModelToolsService.ts`
   - **要做的事**：
     - `invokeTool()`
     - `shouldAutoConfirm()`
     - `shouldAutoConfirmPostExecution()`
     - streaming 占位 / 最终执行相关 request 取值点
     全部统一改走 `resolveRequest()`
   - **完成标志**：工具确认链和执行链都不再依赖“最后一个 request 恰好就是目标 request”

3. **A1-2 保留兼容 fallback，但必须打日志**
   - **主要文件**：`languageModelToolsService.ts`
   - **要做的事**：
     - 仅当 `chatRequestId` 真缺失或 request 无法解析时，才回退到 `.at(-1)`
     - 加 trace/warn，方便 rebase 或未来排查
   - **完成标志**：兼容路径还在，但已不是默认主路径

4. **A1-3 先补上游测试，不新开散测试文件**
   - **主要文件**：`chat/test/browser/tools/languageModelToolsService.test.ts`
   - **必须覆盖的用例**：
     - 同一 session 多 request 并存
     - 目标 request 不是最后一个
     - auto-confirm 与真正执行落在同一 request
     - fallback 到 `.at(-1)` 的兼容路径
   - **完成标志**：A1 行为被上游 test 直接锁住

**验收标准**：
- 同一 session 下多个 request 时，工具调用不会挂错消息
- 自动确认与最终执行使用同一个 request 对象

---

### A2. 修复取消语义与超时取消

**问题**：用户取消不能真正中断底层请求；取消被记为 `success`；半截结果污染 history。

**涉及文件**：
- `common/agentEngine/agentEngine.ts`
- ~~`common/agentEngine/providers/providerTypes.ts`~~（`CreateMessageParams.abortSignal` **已存在**，无需改动）
- ~~`common/agentEngine/providers/abstractProvider.ts`~~（三家 Provider **已传** `signal: params.abortSignal`，无需改动）
- `browser/agentEngine/directorCodeModelProvider.ts`
- `browser/agentEngine/toolBridge.ts`
- `common/agentEngine/retry.ts`
- `browser/agentEngine/directorCodeAgent.ts`

**取消方式决策**：统一走 `abortSignal`（不使用 `generator.return()`）。理由：`abortSignal` 可在每个 `await` 点优雅检查，Provider 的 `fetch` 原生支持 `signal`，VS Code 的 `CancellationToken` 可通过 `toAbortSignal(token)` 桥接。`DirectorCodeAgent.invoke()` 中将 VS Code `CancellationToken` 转为 `AbortSignal` 传入 `AgentEngine`。

**已有 vs 需新增的 abort 路径**：
- ✅ 已有：`AgentEngineConfig.abortSignal`、`directorCodeAgent.ts` 构造 `abortController.signal`、`withRetry` 接受 signal、主循环和流式路径检查 `abortSignal`、**三家 Provider `createMessage()`/`createMessageStream()` 在类型上接受 `params.abortSignal` 并把它透传给 `fetch()`**（`CreateMessageParams.abortSignal?:` 字段类型已定义）
- ❌ 需新增：
  1. **`AgentEngine.submitMessage()` 构造 `requestParams` 时未传入 `this.config.abortSignal`**（见 `agentEngine.ts` L221-231），流式路径的 `params.abortSignal` 当前为 `undefined`，Provider 的 `fetch()` 即使有 `signal: params.abortSignal` 也只等于 `signal: undefined`，HTTP 请求无法中断。**必须补上** `abortSignal: this.config.abortSignal`
  2. `toolBridge` 取消集成
  3. `cancelled` 终态 + messages 清理
  4. 为 `submitMessage()` 新增 `try-finally`（当前没有 `finally` 块）
  5. `withRetry` 内部 sleep 改为可取消

> **说明（v2.4 修订过度）**：v2.4 修订记录写"三家 Provider fetch 已传 signal，删除无效的需新增①"的结论偏乐观——Provider 层确实已读 `params.abortSignal`，但上游 `AgentEngine` 未填该字段，等于"水管接好了但没通水"。本轮 A2 必须把这条链路补齐。

**实现方式**：
- ~~Provider 层 `fetch()` 补 signal~~（**已确认三家 Provider 的 `createMessage`/`createMessageStream` 已将 `params.abortSignal` 透传给 `fetch()`**，Provider 层无需改动）
- **AgentEngine 构造 `requestParams` 时必须补上 `abortSignal: this.config.abortSignal`**（`agentEngine.ts` L221-231），否则上面那条透传只在类型上成立、运行时仍是 `undefined`
- `DirectorCodeModelProvider` 非流式 fallback 同样传 `abortSignal`
- AgentEngine 新增显式 `cancelled` 终态，在每次 `yield` 前检查 `abortSignal.aborted`
- `cancelled` 映射到 `ChatResult`：不设 `errorDetails`（避免红色错误）；`metadata.subtype = 'cancelled'`
- **`isCanceled` 机制说明**：VS Code 上游在用户取消时调用 `ChatResponseModel.cancel()` → `_modelState` 设为 `ResponseModelState.Cancelled` → `isCanceled` 自动为 `true`。我们的 `IChatAgentResult` 返回值中 **不需要**设置 `errorDetails.code = 'canceled'`（那会映射到 `Complete` 而非 `Cancelled`），只需在 `metadata` 中标记 `subtype: 'cancelled'` 供自身逻辑使用
- **`metadata.subtype` 使用边界（避免混淆）**：`metadata.subtype = 'cancelled'` **不影响** VS Code 原生 UI 状态（UI 判取消完全走 `ResponseModelState.Cancelled` / `isCanceled`）。该字段主要用于 Director-Code 自身的遥测、日志、自动化测试断言和未来跨会话 replay 判定；**禁止**在上游 VS Code UI 渲染路径中假设该字段存在（一旦 rebase，上游可能不读取该字段）。若需要区分"完成"/"取消"/"失败"在 UI 上的呈现，以 VS Code 原生状态为唯一真相

```typescript
// directorCodeAgent.ts invoke() 取消返回
return {
  metadata: { subtype: 'cancelled', usage: resultEvent.usage, numTurns: resultEvent.numTurns },
  timings: { totalElapsed: Date.now() - startTime },
};
```

- **取消后 `this.messages` 清理**（在 `submitMessage()` **新增的** `try-finally` 块中执行——当前代码没有 `finally`，需要新增）：
  - **策略：保留最近一次已落盘的完整 tool 往返**——截断不完整的 assistant 块，但保留已完成的 `tool_use + tool_result` 对
  - **初始值**：`lastCompleteTurnEnd` 初始化为 push user 消息之后的 `this.messages.length`（即至少保留 user 消息）
  - **checkpoint 推进规则（v2.25 修正后口径）**：
    - **推进时机单一化**：当前 `executeTools()` 在**整批**（mutation 串行 + readonly 并行）执行完后才做**一次** `this.messages.push({ role: 'user', content: [...所有 tool_results] })`。这决定了 `lastCompleteTurnEnd` 的推进粒度只能是 `this.messages` 级别，**不可能**做到"mutation 单个结果立即推进"（除非把每个 mutation 单独 push 成一条 user message，会改变消息结构并影响现有 Provider 请求格式）
    - **实际推进规则**：每当 `executeTools()` 返回且随后的 `this.messages.push(tool_result 批次)` 完成后，检查 `abortSignal.aborted`：
      - 若**未取消**：推进 `lastCompleteTurnEnd = this.messages.length`（整批落盘视为一个完整 checkpoint）
      - 若**已取消**：**不**推进 checkpoint；进入 finally 后截断到上一个 checkpoint
    - **mutation 中途取消的副作用处理**：即使 mutation 已执行完但结果尚未 push 到 `this.messages`（取消发生在 `executeTools()` 返回前），该 mutation 的副作用已落盘，但在 replay 中看不到——这属于**可接受的已知限制**，因为：
      1. 下一轮模型看到 user 消息后，会重新规划；
      2. 若下一轮重复同一 mutation，后果取决于工具幂等性，与是否记录无关；
      3. 彻底规避需要"每个 mutation 独立 push + 每次 push 都检查 abort + 结构可能变化"的复杂改造，超出本轮范围
    - **readonly 并行批次中途取消**：允许整批结果被丢弃；这类工具无副作用，下一轮可安全重跑（已在 A3⑤ 测试中覆盖）
  - `finally` 块中：若 `abortSignal.aborted`，则 `this.messages.length = lastCompleteTurnEnd`（保留所有已落盘的完整 tool 往返，截断进行中的不完整 assistant/tool_result）
  - **理由**：已执行的工具可能有副作用（文件写入、终端命令），模型下一轮需要知道这些操作已发生，否则可能重复执行
  - UI transcript 可保留 assistant 已完成部分但标为 `incomplete`/`cancelled`；回放给模型的 history（来自 `this.messages`）仅移除 incomplete assistant/thinking，**保留** 已完成的 tool 往返
  - **与 B3 的统一契约**：`cancelled` **不等于整轮 response 从 replay history 消失**。凡是已经完整落盘到 `this.messages` 的 `tool_use + tool_result`，后续 replay 必须继续可见；B3 不得再采用“cancelled response 整条跳过”的语义

- **toolBridge 取消集成**：`VSCodeToolBridge` 构造函数**已有** `token: CancellationToken` 参数（每次 `invoke()` 新建实例时传入），**不再新增** `abortSignal`。`invokeWithTimeout()` 同时监听 `this.token.onCancellationRequested` 和 `setTimeout`，任一触发即 reject（`CancellationError`）。当前 `setTimeout` + 手动 reject 的模式需要增加 `this.token.onCancellationRequested(...)` 分支。**注意**：`onCancellationRequested` 返回的 `IDisposable` 必须在 `invokeWithTimeout` 的 `finally` 块中 dispose，避免 token 生命周期长于单次调用时泄漏 listener。**理由**：toolBridge 是 VS Code 侧组件，应使用 VS Code 原生的 `CancellationToken`（由 `directorCodeAgent.ts` 透传），而非引入平行的 `AbortSignal`。`AbortSignal` 仅用于 AgentEngine 内部和 Provider 层

- **toolBridge timeout/cancellation 竞态顺序（v2.25 写死）**：`invokeWithTimeout()` 的实现模板：
  ```typescript
  private async invokeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutHandle: any;
    let cancelListener: IDisposable | undefined;
    try {
      return await new Promise<T>((resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new CancellationError('Tool invocation timeout')), timeoutMs);
        cancelListener = this.token.onCancellationRequested(() => reject(new CancellationError('User cancelled')));
        fn().then(resolve, reject);
      });
    } finally {
      if (timeoutHandle !== undefined) { clearTimeout(timeoutHandle); }
      cancelListener?.dispose();
    }
  }
  ```
  - **竞态安全点**：① `Promise` 只 settle 一次（JS 原生语义），即使 timeout 与 cancel 同时触发，只会有一个 reject 生效；② `clearTimeout` 对已 fire 的 timer 是 no-op（幂等）；③ `cancelListener?.dispose()` 对已 disposed 的 disposable 是 no-op（VS Code 标准实现幂等）；④ `fn()` 成功 resolve 后 finally 仍会 clearTimeout/dispose，不会泄漏

- **withRetry() 可取消 sleep**：`retry.ts` 的 `sleep()` 改为可取消版本 `abortableSleep(ms, signal?)`，检查 `signal.aborted` 后设置 `setTimeout`，`signal` 的 `abort` 事件触发时 `clearTimeout` 并 reject `CancellationError`。`withRetry` 每次循环前也检查 `signal.aborted`

**验收标准**：
- 取消后网络请求真正中断
- UI 不再把取消显示为成功
- 取消前的 assistant 片段带 `incomplete` 标记，下一轮请求看不到
- 工具卡死超时后不再继续运行僵尸调用
- 取消后下一轮 replay 仍能看到已完成的 tool_use/tool_result，避免重复执行副作用工具

**已知限制**：取消只能阻止尚未开始的后续工具调用和进行中的网络请求。已执行完毕的操作（如文件写入、终端命令）不会回滚。与 VS Code 上游及所有主流 Agent 行为一致。

**当前代码脱节点（执行前必须知道）**：

- `agentEngine.ts` 当前没有围绕 `submitMessage()` 的 `try-finally`，所以取消后 `this.messages` 不会被收口
- **`agentEngine.ts` L221-231 构造的 `requestParams` 里没有 `abortSignal` 字段**；`this.config.abortSignal` 只被传给了 `withRetry`，流式路径 `provider.createMessageStream(requestParams)` 调用时 Provider 拿到的 `params.abortSignal` 是 `undefined`——底层 `fetch()` 虽然写了 `signal: params.abortSignal` 但等价于没挂取消信号
- `toolBridge.ts` 当前只有超时 reject，没有接 `token.onCancellationRequested`
- `retry.ts` 当前的 sleep 不可取消
- `directorCodeModelProvider.ts` 非流式 fallback 路径没显式传 `abortSignal`
- `directorCodeAgent.ts` 当前取消退出后虽然能停止循环，但返回结果还没完全收口成 `cancelled` 语义

**A2 细化执行 checklist（文件级，按顺序执行）**：

1. **A2-0 先冻结取消契约**
   - **先读文件**：`agentEngine.ts`、`toolBridge.ts`、`retry.ts`、`directorCodeAgent.ts`、`directorCodeModelProvider.ts`
   - **先冻结契约**：
     - 用户取消 = 终止网络请求 + 阻止后续工具 + history 保留完整 tool 往返
     - 不回滚已执行副作用
     - UI 结果 subtype = `cancelled`
   - **完成标志**：后续所有修改都围绕同一个取消语义

2. **A2-1 先改 `agentEngine.ts` 外层结构**
   - **主要文件**：`agentEngine.ts`
   - **要做的事**：
     - 给 `submitMessage()` 包上 `try-finally`
     - 引入 `lastCompleteTurnEnd`
     - **补上流式路径的 `abortSignal` 传递**：`requestParams`（L221-231）新增 `abortSignal: this.config.abortSignal` 字段；否则流式路径 Provider `fetch()` 的 `signal` 永远是 `undefined`，HTTP 请求无法真正中断
     - **推进粒度口径（v2.25 修正）**：每当 `executeTools()` 返回后的 `this.messages.push(tool_results 批次)` 完成、且 `abortSignal` 未触发时，推进 `lastCompleteTurnEnd = this.messages.length`；**不再**按"mutation 单个结果 / readonly 整批结果"分开推进（当前 `executeTools()` 整批才 push 一次 user message，物理上只能在 `this.messages` 级别推进）
     - 接受的已知限制：mutation 已执行但 `this.messages.push` 尚未完成时发生取消，该 mutation 的副作用已落盘但 replay 看不到（见 A2 正文"mutation 中途取消的副作用处理"）
     - `finally` 中按契约截断 incomplete assistant/thinking
   - **完成标志**：取消后 `this.messages` 不再保留半截脏历史；流式 HTTP 请求能被 abortSignal 实际中断；推进语义与 A3⑤ 的 slot 回填机制一致

3. **A2-2 再补 `cancelled` 结果语义**
   - **主要文件**：`agentEngine.ts`、`directorCodeAgent.ts`
   - **要做的事**：
     - AgentEngine 生成显式 `cancelled` 终态
     - `DirectorCodeAgent.invoke()` 返回 `metadata.subtype = 'cancelled'`
     - 不设置会把 UI 映射成红错的 `errorDetails.code = canceled`
   - **完成标志**：用户取消后 UI 呈现为取消，不是假成功也不是报错

4. **A2-3 把 toolBridge 接到 VS Code 原生 CancellationToken**
   - **主要文件**：`toolBridge.ts`
   - **要做的事**：
     - `invokeWithTimeout()` 同时监听 timeout 与 `this.token.onCancellationRequested`
     - listener 在 `finally` 中 dispose
   - **完成标志**：用户取消时 tool invocation 不再靠 120s timeout 才结束

5. **A2-4 改 `retry.ts`，让 sleep 可取消**
   - **主要文件**：`retry.ts`
   - **要做的事**：
     - 引入可取消 sleep
     - `withRetry()` 每轮前检查 `abortSignal`
   - **完成标志**：取消发生在 backoff 等待期间时能立即退出

6. **A2-5 对齐标准 Chat/非流式路径**
   - **主要文件**：`directorCodeModelProvider.ts`
   - **要做的事**：
     - 非流式 fallback 同样传 `abortSignal`
   - **完成标志**：标准 Chat 路径与 Agent 路径取消语义一致

7. **A2-6 先补测试，再做取消 smoke**
   - **至少更新/新增的测试文件**：
     - `agentEngine.test.ts`
     - `directorCodeModelProvider.test.ts`
     - 如需要，可补 `toolBridge` 相邻测试
   - **必须覆盖的用例**：
     - 取消后返回 `cancelled`
     - `lastCompleteTurnEnd` 保留完整 tool 往返
     - timeout 与 cancellation 二者都能终止工具
     - retry sleep 可取消
   - **完成标志**：A2 不再只能靠手工点取消验证

---

### A3. 修复 Agent 主循环的结构化输出正确性

**问题**：多工具并发串台；JSON 错误静默包装为 `{ raw }`；`max_tokens` 截断破坏结构化输出；compact 假成功。

**涉及文件**：
- `common/agentEngine/agentEngine.ts`
- `common/agentEngine/compact.ts`
- `common/agentEngine/providers/providerTypes.ts`（StreamEvent 类型扩展）

**实现方式**：

**① `tool_call_delta` 分桶**：
- **前置步骤**：扩展 `providerTypes.ts` 的 `StreamEvent` 类型，给 `tool_use_start` 和 `tool_input_delta` 加上 `readonly index?: number`（当前仅 `tool_call_delta` 有 `index`，否则统一 Map 处理的伪代码无法通过 TypeScript 编译）
- Provider 负责标准化 index，AgentEngine 统一用 `Map<number, toolState>` 按 index 分桶（`pendingTools`），替换现有单一 `currentTool` 变量
- **运行时契约写死**：进入 AgentEngine 之后，`tool_use_start` / `tool_input_delta` / `tool_call_delta` 在**多工具场景**下都必须带同一 `index`；`index?:` 仅用于 TypeScript 兼容层，不代表运行时可以长期缺省
- 仅在 `pendingTools.size <= 1` 的单工具兼容路径上允许缺省 `index` fallback；一旦已有多工具并发且事件缺 `index`，视为 provider 协议错误：记录 warn/error，丢弃当前不完整 tool 聚合或走重试，**不得**再默默 fallback 到“最后一个工具”
- Provider 输出的 `index` 统一语义为**"本次 response 中工具调用的序号（从 0 开始，仅计工具，不计 text block）"**：

| Provider | 原始字段 | 标准化方式 |
|----------|---------|-----------|
| OpenAI | `tool_calls[i].index` | 直接透传（本身就是工具序号） |
| Anthropic | `content_block_start.index`（**content block 全局 index，含 text block**）+ `content_block_delta.index`（同样全局 block index） | Provider 内部维护 `toolIndex` 计数器（仅 `type=tool_use` 的 block 递增）**和** `blockIndex -> toolIndex` 映射；`tool_use_start` 带上当前 `toolIndex`；`tool_input_delta` 通过 `event.index` 查映射，找到对应 `toolIndex` 后再带出 |
| Gemini | 无 | Provider 按 `functionCall` 出现顺序编号 0, 1, 2 |

**Anthropic 标准化伪代码**（执行时务必看一眼，避免只给 `tool_use_start` 带 index 而 `tool_input_delta` 漏带）：

```typescript
// anthropicProvider.ts 流式解析片段
let toolIndex = 0;
const blockIndexToToolIndex = new Map<number, number>();

case 'content_block_start': {
  const block = event.content_block;
  if (block?.type === 'tool_use' && block.id && block.name) {
    blockIndexToToolIndex.set(event.index, toolIndex);
    yield { type: 'tool_use_start', index: toolIndex, id: block.id, name: block.name };
    toolIndex++;
  }
  break;
}
case 'content_block_delta': {
  const delta = event.delta;
  if (delta?.type === 'input_json_delta' && delta.partial_json) {
    const mappedToolIndex = blockIndexToToolIndex.get(event.index);
    if (mappedToolIndex !== undefined) {
      yield { type: 'tool_input_delta', index: mappedToolIndex, json: delta.partial_json };
    }
    // ...其他 delta 类型保持不变
  }
  break;
}
```

- AgentEngine 流式路径将 `tool_use_start`、`tool_input_delta`、`tool_call_delta` 三种事件统一到同一个 `pendingTools` Map 处理（当前代码是两个独立 `case` 分支各自维护 `currentTool`，合并后消除分裂）：

```typescript
const pendingTools = new Map<number, { id: string; name: string; input: string }>();

case 'tool_use_start':
case 'tool_call_delta': {
  const idx = resolveToolIndex(event, pendingTools);
  const tool = pendingTools.get(idx) ?? { id: '', name: '', input: '' };
  if (event.id && !tool.id) tool.id = event.id;
  if (event.name && !tool.name) tool.name = event.name;
  if ('arguments' in event && event.arguments) tool.input += event.arguments;
  pendingTools.set(idx, tool);
  break;
}
case 'tool_input_delta': {
  const idx = resolveToolIndex(event, pendingTools);
  pendingTools.get(idx)!.input += event.json;
  break;
}

function resolveToolIndex(event: { index?: number }, pendingTools: Map<number, unknown>): number {
  if (typeof event.index === 'number') {
    return event.index;
  }
  if (pendingTools.size <= 1) {
    return pendingTools.size === 0 ? 0 : [...pendingTools.keys()][0];
  }
  throw new Error('Missing tool index in multi-tool response');
}
```

**② JSON 解析失败重试**：
- 失败时作为 `tool_result` 回传模型，`is_error: true`，内容：`"JSON parse error in tool call '<toolName>': <error>. Please retry with valid JSON."`
- 同一工具最多修正 **2 次**（首次 + 2 次纠错 = 3 次尝试），每次消耗 1 个 turn（受 `maxTurns` 约束）
- 第 3 次仍无效：注入 `"Tool '<toolName>' failed after 3 attempts due to invalid JSON. Skip this tool and continue."`
- **Turn 预算说明**：JSON 纠错和 `max_tokens` 续写均消耗 `maxTurns` 全局预算，不设联合上限。各自的连续上限（`MAX_JSON_RETRIES = 2`、`MAX_CONTINUATIONS = 3`）足以防止死循环。一次逻辑操作最多额外消耗 5 个 turn（2 JSON 纠错 + 3 续写），在 turn 预算紧张时需通过 `yield { type: 'progress' }` 告知用户额外消耗原因
- **语义说明（v2.27 补充）**：发生 JSON parse error 时工具**尚未被执行**，但仍用 `tool_result is_error: true` 回传（而非注入 user-level feedback message）是**有意设计**，理由：
  1. 上游 Anthropic/OpenAI 的 tool calling 协议要求每个 `tool_use` 必须有配对的 `tool_result`，否则下一轮请求的 messages 会结构不合法（Anthropic 会返回 400 "unexpected role" / OpenAI 会返回 "tool_calls without tool responses"）
  2. `is_error: true` 是协议内的标准错误标记，模型训练时已针对该语义学习；用 user message 形式注入 feedback 反而会让模型更可能忽略或误解
  3. 与 open-agent-sdk / Cline / Aider 等主流 Agent 的策略一致
- **已知语义偏差（可接受）**：模型可能在极少数情况下误以为工具"曾尝试执行"。这是协议层强制 tool_use/tool_result 配对带来的必然副作用；实际测试中主流 LLM 都能正确理解 "JSON parse error" 文案指向输入层而非执行层，不构成 blocker

**③ `max_tokens` 截断检测**：
- `stopReason === 'max_tokens'` 时，用 `pendingTools.size > 0` 判断截断位置
- `pendingTools.size > 0` → 截断在工具 JSON 中间：丢弃不完整调用，注入提示让模型重新输出
- `pendingTools.size === 0` → 普通文本续写：注入 "Please continue from where you left off."
- 每次续写消耗 1 个 turn（受 `maxTurns` 约束），且独立上限 `MAX_CONTINUATIONS = 3`，超限后停止续写，返回当前已有内容

**④ compact 成功判定（新增逻辑，当前代码仅以无异常判断成功）**：
- 成功条件三项全满足：HTTP 200 + 返回非空（≥10 字符）+ 估算 token < 原始的 90%
- 失败时保留原始消息不替换，`console.warn`，不发 `compact_boundary`
- **注意**：本项仅修复判定逻辑，compact 仍使用主模型。C4② 引入专用 compact 模型时再替换
- **成本窗口期**：A3④ 完成到 C4② 完成之间约 3-4 周，compact 使用主模型（如 `claude-opus-4-6`）做压缩，成本偏高。当前无外部用户，窗口期可接受；若期间有外部试用，需在文档中提示此限制

**⑤ 工具执行顺序**：
- **分类机制**（代码已存在）：`toolBridge.ts` 中 `isToolReadOnly(toolData)` 检查 `toolData.tags?.includes('readonly')`，有 `readonly` tag 的工具视为只读，其余视为 mutation
- **执行策略**（代码已存在）：只读工具批量并行（`MAX_CONCURRENCY = 10`），mutation 工具严格串行
- **当前代码脱节点（必须知道）**：全仓库**没有任何上游工具**声明 `tags: ['readonly']`（经 `rg '"readonly"' src/vs/workbench/contrib` 与 `rg "tags:.*readonly" src/vs/workbench/contrib` 确认），这意味着当前 `isToolReadOnly()` **永远返回 false**，所有工具都被当作 mutation 严格串行。所谓 "MAX_CONCURRENCY = 10 并行能力" 在真实用户路径上是 **dead code**。**A2 的 `lastCompleteTurnEnd` 推进规则中 "readonly 整批推进" 的分支，当前也永远走不到。**
- **需要修复的 bug（本轮必做）**：当前实现先拼所有只读结果再拼 mutation 结果（`readOnly → mutations`），不保证原始 tool_use 顺序。修复方式：改为 **slot 数组保序回填**——**在分区之前**为每个 `toolUseBlock` 记录其在原始 `toolUseBlocks` 数组中的 index（`originalIndex`），预分配 `results = new Array(toolUseBlocks.length)`，执行完成后按 `originalIndex` 写回，最终结果保持模型输出的工具调用顺序。**此 bug 修复不依赖任何工具被打上 readonly tag，即使所有工具都是 mutation 也需要保序**。
- **已拍板（v2.24，执行口径）**：**选项 2**——本轮 A3⑤ 在修保序 bug 的**同一 PR**内，为明确无副作用的内置只读工具补上 `tags: ['readonly']`，让 MAX_CONCURRENCY 并行路径与 A2 的 `lastCompleteTurnEnd` "readonly 整批推进" 分支真正生效。
- **Readonly tag 目标工具清单（首轮最小集）**：以上游 `contrib/chat/browser/tools/` 下实际注册的 Tool 为准，**首轮只打明确无副作用的 5 个**：
  - `read_file`（读取文件内容）
  - `list_dir`（列出目录）
  - `file_search` / `find_files`（按 glob 搜文件名）
  - `semantic_search` / `codebase_search`（语义搜索）
  - `grep` / `grep_search`（文本搜索）
  - **具体工具 id 以上游最新代码为准**，执行前先 `rg "id:\\s*'.*'"` 和 `rg "toolReferenceName"` 对齐，避免误伤新增工具
- **不在首轮范围的工具（保持 mutation 串行）**：`run_in_terminal` / `edit_file` / `create_file` / `delete_file` / 所有 MCP 工具 / 所有 chat participant 自定义工具——即使表面看着是读，只要**可能触发副作用或权限检查**就保留 mutation
- **上游改动约束**：
  - 只在 Tool 定义处加 `tags: [..., 'readonly']`（追加，不删除现有 tags）
  - 每处加注释 `// [Director-Code] readonly-parallel-safe`，方便 rebase 时识别
  - **不**在本轮重构 `isToolReadOnly()` 逻辑，只消费 tag
  - **不**扩展 readonly 判定到 `toolSet` 级别
- **rebase 策略（v2.25 决策 5 写死）**：每次 VS Code 上游 rebase 后，**必须**在 rebase checklist 中执行以下验证步骤：
  1. `rg "tags:\\s*\\[.*readonly.*\\]" vscode/src/vs/workbench/contrib/chat/browser/tools/` 检查现有 readonly tag 是否仍挂在正确的工具定义上（上游若重命名/删除 tool，需同步调整）
  2. 对照本文 **附录 A.1** 的 readonly tag 清单（v2.28 Q6：唯一维护位置），逐项核对实际工具注册是否覆盖全部 5 个 id
  3. 扫描 rebase 本轮新增的 Tool 定义，若存在**明确无副作用**的只读工具（match `read` / `search` / `list` / `get` 语义且 `invoke` 方法不调用文件写入/终端/网络副作用），评估是否追加到 readonly 清单
  4. 若步骤 3 评估后决定追加，必须经过**二次核对**："无副作用 + 无权限副作用" 两条全满足，才允许打上 `tags: ['readonly']` 并追加到 `.cursor` 清单
  5. 若 tool id 被上游改名，优先修正 Director-Code 侧 tag 引用而非保留旧 id；保留注释 `// [Director-Code] readonly-parallel-safe (renamed from <old-id> on <date>)` 便于追溯
  6. 上述 5 步结果作为 rebase PR 描述的一部分提交（简要填写 "readonly tag 清单验证：5/5 matched" 或说明差异）
- **上游若新增同名工具**：默认保持 mutation，除非主动通过上述步骤 3-4 确认可安全并行
- **测试要求**：A3⑤ 的保序测试要**同时覆盖** "5 个 readonly + 3 个 mutation 混合" 的场景，保证 originalIndex 回填正确且并行/串行分组不串结果

**⑥ thinking 处理**：流式 thinking 纳入完整 response 聚合（用于 UI 展示，通过 `yield { type: 'thinking_delta' }` 事件），但 **不写入** `this.messages` 历史（不参与下一轮 API 请求、不参与 compact）。**实现方式**：在 `this.messages.push()` 前过滤掉 thinking 块（`contentBlocks.filter(b => b.type !== 'thinking')`），而非在发送请求时过滤——保证 `this.messages` 始终干净，compact 和历史回放无需再做额外过滤

**当前代码脱节点（执行前必须知道）**：

- `agentEngine.ts` 流式路径当前仍用单一 `currentTool`
- `tool_call_delta` / `tool_input_delta` / `tool_use_start` 没统一成一个 index-based 容器
- JSON parse 失败仍主要靠静默容错
- `max_tokens` 截断后的工具/文本恢复逻辑还不够显式
- `executeTools()` 当前读写分组执行后再拼结果，原始顺序可能丢
- thinking 仍可能混入历史/compact 相关路径

**A3 细化执行 checklist（文件级，按顺序执行）**：

1. **A3-0 先冻结流式聚合数据结构**
   - **先读文件**：`agentEngine.ts`、`providerTypes.ts`
   - **先冻结原则**：
     - 工具流统一按 `index` 分桶
     - 文本块、工具块、thinking 聚合路径分离
   - **完成标志**：后续不再围绕 `currentTool` 打补丁，而是整体切到 `pendingTools` 结构

2. **A3-1 先扩 `StreamEvent` 类型**
   - **主要文件**：`providerTypes.ts`
   - **要做的事**：
     - 给 `tool_use_start`、`tool_input_delta` 增加 `index?`
   - **完成标志**：TypeScript 层已经能表达统一工具分桶

3. **A3-2 重构 `agentEngine.ts` 流式工具聚合**
   - **主要文件**：`agentEngine.ts`
   - **要做的事**：
     - `currentTool` → `pendingTools: Map<number, ...>`
     - `tool_use_start` / `tool_input_delta` / `tool_call_delta` 三类事件统一落到同一个容器
   - **完成标志**：多工具并发时参数不会互串

4. **A3-3 明确 JSON 解析失败重试**
   - **主要文件**：`agentEngine.ts`
   - **要做的事**：
     - JSON parse error 作为 `tool_result is_error` 回传模型
     - 加 2 次纠错上限
   - **完成标志**：坏 JSON 不再 silently 包成 `{ raw }`

5. **A3-4 把 `max_tokens` 截断逻辑显式化**
   - **主要文件**：`agentEngine.ts`
   - **要做的事**：
     - 区分“截断在工具 JSON 中间” vs “普通文本续写”
     - 连续续写上限 `MAX_CONTINUATIONS = 3`
   - **完成标志**：`max_tokens` 不再把结构化输出打坏后静默结束

6. **A3-5 收口 compact 成功判定**
   - **主要文件**：`agentEngine.ts`、`compact.ts`
   - **要做的事**：
     - 仅在真正压缩成功时发 `compact_boundary`
     - 失败则保留原消息
   - **完成标志**：UI 不再出现“看起来已 compact，实际没变”的假象

7. **A3-6 工具执行顺序保序**
   - **主要文件**：`agentEngine.ts`
   - **要做的事**：
     - 结果数组按 `originalIndex` 回填
   - **完成标志**：只读并发 + mutation 串行后，最终 tool_result 顺序仍与模型输出顺序一致

8. **A3-7 thinking 只留在 UI，不进历史**
   - **主要文件**：`agentEngine.ts`
   - **要做的事**：
     - push `this.messages` 前过滤掉 thinking
   - **完成标志**：history / compact / replay 不再含 thinking 噪音

9. **A3-8 先补测试，再做多工具/截断 smoke**
   - **至少更新/新增的测试文件**：
     - `agentEngine.test.ts`
     - 必要时相邻 end-to-end 测试
   - **必须覆盖的用例**：
     - 多工具 delta 按 index 聚合
     - JSON 错误重试
     - `max_tokens` 工具截断 vs 文本续写
     - tool result 保序
     - thinking 不进历史
   - **完成标志**：A3 的结构化输出正确性有自动化保护

**验收标准**：
- 多工具并发时参数不混入其他工具
- JSON 无效时模型能收到明确纠错反馈
- compact 失败时 UI 不再显示"已压缩"假象

---

### A4. 收口 MCP/工具确认安全边界

**问题**：Director-Code 静默开启全局 autoApprove；MCP Sampling "Not Now" 等同"Allow"。

#### A4a. MCP Sampling "Not Now" 语义修正

**涉及文件**：`vscode/src/vs/workbench/contrib/mcp/common/mcpSamplingService.ts`（**上游 bug**）

**实现**：`_getMatchingModelInner()` 中 `_sessionSets.allowedDuringChat` 和 `allowedOutsideChat` **当前已是 `Map<string, boolean>`**，剩余问题是匹配逻辑仍按 `.has(id)` 判定，无法区分 "Allow" 与 "Not Now"。修复方式：保持 `Map<string, boolean>` 结构不变，仅把检查逻辑从 `.has(id)` 改为 `.get(id) === true`。

**当前代码事实（v2.28 补充澄清）**：`allowButtons()` 方法 L182-201 **已经**实现了正确的 `set(id, true/false)` 语义：
- `'Allow in this Session'` → `set(id, true)` ✓
- `'Not Now'` → `set(id, false)`（当前代码已写入 false）
- `'Always'` → 不动 session，写配置 `c[key] = true`
- `'Never'` → 不动 session，写配置 `c[key] = false`

真正的 bug **仅在** `_getMatchingModelInner` L238/L240 的 `.has(id)` 判定——`.has()` 无论 value 是 `true` 还是 `false` 都返回 truthy，导致 "Not Now" 被误当作"已允许"。

**最小侵入修复口径（本轮执行）**：
- **只**改 `_getMatchingModelInner` 的两处 `.has(id)` → `.get(id) === true`
- **不改** `allowButtons()` 的 `'Not Now'` 分支——保留 `set(id, false)` 写入不动。理由：`false !== true`，改完判定后 "Not Now" 自然返回 `UnsureAllowedDuringChat` / `UnsureAllowedOutsideChat`，下次同条件会再次询问，行为已满足需求；删掉 `set(id, false)` 是等价改动但增加 rebase 冲突面，无必要
- **历史修订记录中出现过的**"用户点 'Not Now' 时不写入 session allow cache，也不写入 false 值"表述仅指**判定结果等价**，不要求实际代码修改 `allowButtons()`
- "Never" 仍走现有配置写入链，不动

改动极小（仅改 2 处判定表达式），Rebase 冲突概率极低。

**测试**：新建 `mcp/test/common/mcpSamplingService.test.ts`，覆盖 Allow/Not Now/Never 三条路径。

#### A4b. 删除全局 autoApprove 篡改，走 permissionLevel 机制

**涉及文件**：`browser/agentEngine/agentEngine.contribution.ts`（**自研代码**）

**实现**：
1. **删除** `_enableToolAutoApprove()` 方法及其调用，让 `chat.tools.global.autoApprove` 保持上游默认 `false`
2. 工具批准通过 VS Code 内置 permissionLevel 机制：用户选择 Autopilot 模式时自动批准，其他模式手动确认
3. 用户仍可通过 Settings 自行开启全局 autoApprove（自担风险）

**经代码追踪验证**：删除 `_enableToolAutoApprove` 后，动态 Agent 工具确认 UI 可正常渲染（渲染链路无 `isDynamic`/`extensionId` 分支判断）。Autopilot 模式下所有工具跳过确认。`toolBridge.ts` 120s 超时兜底仍有效。

#### A4c. 无需改动的上游代码

`mcpLanguageModelToolContribution.ts` 中 `allowAutoConfirm = true` 仅表示"有资格被自动批准"，删除我们的 `_enableToolAutoApprove` 后不再导致自动批准。

**前置条件**：A1 应在 A4b 之前完成（并发场景下 `invokeTool` 的 `.at(-1)` 可能导致 toolInvocation 挂错请求）。

**当前代码脱节点（执行前必须知道）**：

- `agentEngine.contribution.ts` 当前还在主动把 `chat.tools.global.autoApprove` 改成 `true`
- `mcpSamplingService.ts` 虽已把 session 集合改成 `Map<string, boolean>`，但 `ModelMatch` 判定仍在用 `.has(...)`，`Not Now` 现在会被当成“曾经有值，因此不再询问”
- `languageModelToolsService.ts` 的 request 绑定问题若不先修，A4b 即使关掉 autoApprove，也可能把确认链挂错 request

**A4 细化执行 checklist（文件级，按顺序执行）**：

1. **A4-0 先冻结安全边界**
   - **先读文件**：`mcpSamplingService.ts`、`agentEngine.contribution.ts`
   - **先冻结两条边界**：
     - `Not Now` = 本次拒绝；**仅** `.get(id) === true` 视为「session 内已允许采样」；`set(id, false)`（若上游保留）**不得**被 `.has(id)` 误判为已允许——与 A4a v2.28 最小改法一致，**不要求**删 `allowButtons()` 里对 `Not Now` 的 `set(id, false)` 写入
     - Director-Code 不再篡改全局 autoApprove 默认值
   - **完成标志**：后续修改都围绕这两条明确边界，不再有语义暧昧

2. **A4-1 先修 `mcpSamplingService.ts` 的 `Not Now` 语义**
   - **主要文件**：`mcpSamplingService.ts`
   - **要做的事**：
     - `_getMatchingModelInner()` 不再只看 `.has(id)`
     - 仅 `.get(id) === true` 视为允许
     - **不**修改 `allowButtons()` 的 `Not Now` 分支（见 A4a 正文）；若测试需要可断言 `set(id, false)` 后匹配逻辑仍返回「未允许」
   - **完成标志**：同一会话里点了 `Not Now` 之后，下次还能再次询问

3. **A4-2 删除 `_enableToolAutoApprove()`**
   - **主要文件**：`agentEngine.contribution.ts`
   - **要做的事**：
     - 删除方法和调用
     - 保持上游默认 `chat.tools.global.autoApprove = false`
   - **完成标志**：Director-Code 不再在启动时偷偷开 YOLO

4. **A4-3 确认工具确认链交还给 permissionLevel**
   - **主要文件**：`agentEngine.contribution.ts`、必要时相邻 mode/permission 消费点
   - **要做的事**：
     - 确认 Autopilot 自动批准仍可用
     - 非 Autopilot 情况下走正常确认 UI
   - **完成标志**：工具确认策略重新回到 VS Code 原生机制

5. **A4-4 先补上游/边界测试**
   - **至少更新/新增的测试文件**：
     - `mcp/test/common/mcpSamplingService.test.ts`
     - 若需要，补 `agentEngine.contribution` 相邻测试或 smoke
   - **必须覆盖的用例**：
     - Allow
     - Not Now
     - Never
     - 未开启 autoApprove 时危险工具不自动通过
   - **完成标志**：A4 不再依赖手工点弹窗验证

**A 批次内部并行**：A2 和 A3 对 A1/A4 无依赖，可与 A1→A4 并行开发，有助于压缩 2 周工期。**但 A2 和 A3 均改动 `agentEngine.ts`**：A3 重构流式循环内部结构（`currentTool` → `pendingTools` Map + JSON 重试 + 截断续写），A2 在外层加 `try-finally` + `lastCompleteTurnEnd` + `requestParams` 的 `abortSignal` 传递。**推荐顺序：A3 先落地（内部循环重构），A2 再在重构后的代码上包 try-finally**——反向操作会导致 A3 的大面积 diff 与 A2 的 try-finally 冲突。两者可并行开发，但合并到主线时 A3 先合。

**Git 操作建议**：
- 开两个分支：`feat/a3-stream-tool-aggregation` 与 `feat/a2-cancellation-semantics`
- A3 分支先发 PR 合入主线；A2 分支 `git rebase origin/main` 解决冲突后再发 PR
- **禁止** A2/A3 共用一个 PR——合起来 diff 跨两类语义（流式结构 + 取消收口），review 难度陡增
- 若时间紧，允许单人顺序做（A3 完成 + merge → A2 开始），此时分支复用 `agentEngine.ts`，冲突为零

**验收标准**：
- 未选 Autopilot 且未手动开启 autoApprove 时，危险工具不被默认自动批准
- Not Now 后同一会话内不被当作已允许
- Director-Code 不再修改 `chat.tools.global.autoApprove`

---

## 批次 B：P1 认证链、模型链、历史上下文链与产品元数据

### B 内部执行顺序

```
B4-core（产品元数据主收口，独立最先做）
  → B1 + B2（并行）
    → 原 A5（标准 Chat 主路径统一，依赖 B1+B2）
      → B3（历史回放，依赖 A2 + 原 A5，最后做）
```

B3 的**接口设计**（函数签名、数据路径、常量定义）在 B1+B2 并行期同步产出设计文档。

**完成定义补充**：`B4-core = B4-0 ~ B4-7`，对应 B 批次里“最先做”与 ACP 预研门槛中的 “B4 已冻结”；`B4-followup = B4-8`，用于与 `C2/C4` 收尾对账，必须在 Phase 1 发布前关闭，但不影响 Week 6 的 “B 主线实现完成” 口径。

---

### B4. 修复产品元数据与数据隔离（B 批次最先做）

**目标**：Director-Code 彻底去 Copilot 化；稳定版隔离数据目录。

**完成定义**：`B4-core = B4-0 ~ B4-7`；`B4-followup = B4-8`。文中后续提到 “B4 最先做”“B4 已冻结” 时，均指 `B4-core`。

**涉及文件**：`product.json`（**根目录**，非 `vscode/product.json`）、`prepare_vscode.sh`、`main.ts`、`environmentService.ts`、`chatSetupProviders.ts`、`chatSetupRunner.ts`、`chatSetupController.ts`、`chatSetupContributions.ts`、`chatSetupGrowthSession.ts`（`chatSetup/` 子目录，已确认含 "Try Copilot" / "Welcome to GitHub Copilot" 等直接面向用户的文案，**必须纳入**）、`chatGettingStarted.ts`（实际路径：`vscode/src/vs/workbench/contrib/chat/browser/actions/chatGettingStarted.ts`，**在 `actions/` 子目录下，不在 `browser/` 根**）、`chatActions.ts`、`extensionGalleryService.ts`、`mainThreadLanguageModelTools.ts`、`chatStatusDashboard.ts`、`chatStatusEntry.ts`、`chatStatusWidget.ts`、`chatUsageWidget.ts`、`chatQuotaExceededPart.ts`、`chatManagementEditorInput.ts`、`chatManagementEditor.ts`、`chatModelPicker.ts`、`modelPickerActionItem.ts`、`chatWidget.ts`、`chatQuick.ts`、`chatAnonymousRateLimitedPart.ts`、`chatContinueInAction.ts`、`chatTipContentPart.ts`、`defaultAccount.ts`（实际路径：`vscode/src/vs/workbench/services/accounts/browser/defaultAccount.ts`）、`chatEntitlementService.ts`（实际路径：`vscode/src/vs/workbench/services/chat/common/chatEntitlementService.ts`）、`welcomeAgentSessions/browser/agentSessionsWelcome.ts`（实际路径：`vscode/src/vs/workbench/contrib/welcomeAgentSessions/browser/agentSessionsWelcome.ts`，**注意在 chat 模块之外**）、`agentTitleBarStatusWidget.ts`（实际路径：`vscode/src/vs/workbench/contrib/chat/browser/agentSessions/experiments/agentTitleBarStatusWidget.ts`）、`agentSessions/agentSessions.ts`、`welcomeGettingStarted/common/gettingStartedContent.ts`（文中个别位置旧称 `welcomeGettingStarted.ts`，**实际文件名是 `gettingStartedContent.ts` / `gettingStarted.ts`**，不存在 `welcomeGettingStarted.ts`），以及全仓其他直接消费 `defaultChatAgent` 或硬编码 `Copilot` 文案的 UI 触点

**⚠️ `product.json` 修改位置**：所有 B4 的 `product.json` 修改必须放到**根目录** `product.json`，不是 `vscode/product.json`。原因：`prepare_vscode.sh` L122-123 执行 `jq -s '.[0] * .[1]' product.json ../product.json`（根目录右侧优先覆盖），且脚本开头会 `cp -rp src/stable/* vscode/` 重置 vscode 目录。直接改 `vscode/product.json` 会在下次 `prepare_vscode.sh` 时丢失。同时需在 `prepare_vscode.sh` 的 **stable 分支**（L91 `else` 块）补上 `setpath "product" "dataFolderName" ".director-code"`（当前仅 insider 分支 L67 设了此字段，值为 `.director-code-insiders`）。

**⚠️ `dataFolderName` 的两通道语义**（避免被误解为矛盾）：
- **stable**：`.director-code`（本轮 B4 补上，用户主目录下 `<userHome>/.director-code`）
- **insider**：`.director-code-insiders`（脚本 L67 已有，保持不变）
- **dev/watch 模式**：`main.ts:460-463` 会追加 `-dev` 后缀，实际目录为 `.director-code-dev` 或 `.director-code-insiders-dev`
- **这三种数据目录各自独立**，不做迁移；发布产物 smoke 时以不带 `-dev` 的目录名为准

**`product.json` 配置变更**：

涉及两个层级：`defaultChatAgent` 对象内字段（`IDefaultChatAgent`，定义在 `base/common/product.ts:340`）和 `product.json` 顶层字段（`IProductConfiguration`，同文件 `~L227`）。Director-Code 需要填充 `defaultChatAgent` 全部字段以避免运行时 crash（`browser/widget/chatWidget.ts:990` 等处无 `?.` 访问 `provider`）。**字段策略改为分层处理，不再假设“置空即可静默失效”**：

- **运行时必读结构字段**（如 `provider.default`）填真实值，保证不 crash；`terms/privacy/publicCode` 若无独立文档则通过 guard 隐藏依赖 UI，而不是用占位链接硬撑
- **用户可直接点击到的入口字段**填真实可用目标；`manageSettingsUrl` 直接改为 `command:director-code.openSettings`
- **quota/plan/entitlement/sign-up 等 Copilot 专属链路**必须先在运行时 `guard skip`，只有在入口被收口后，相关字段才允许保持空字符串；禁止仅靠空字符串赌调用方不会触发

**built-in mode 判定条件（v2.27 拍板）**：

代码里判断"当前是否处于 Director-Code built-in mode"统一使用**双判定**（兼容源码/watch 模式与 prepare 后发布模式）：

```typescript
function isDirectorCodeBuiltInMode(product: IProductService['productConfiguration']): boolean {
  const defaultChat = product.defaultChatAgent;
  if (!defaultChat) { return false; }
  return defaultChat.chatExtensionId === ''
    || defaultChat.extensionId === 'director-code.agent';
}
```

- **为什么需要双判定**：
  - 源码/watch 模式：`prepare_vscode.sh` 未执行，根 `product.json` 的 `defaultChatAgent` 未合并到 `vscode/product.json`，`defaultChatAgent.extensionId` 仍是上游默认 `GitHub.copilot-chat`，但 `chatExtensionId` 已在 B4 阶段改为空字符串 → 命中 `chatExtensionId === ''` 分支
  - prepare 后/发布产物：根 `product.json` 合并生效，`extensionId === 'director-code.agent'` → 命中第二分支
  - 当前 `chatActions.ts:93` 已经有 `provider: product.defaultChatAgent?.provider ?? { enterprise: { id: '' } }` 这类 fallback，说明上游已有空字符串被合法消费的先例
- **实现位置**：新建一个共享 helper 放在 `vscode/src/vs/workbench/contrib/chat/common/agentEngine/builtInModeUtil.ts`（或等价位置），所有 B4 guard / `triggerSetup*` 别名 / `install(chatExtensionId)` skip 等处都导入同一个函数；禁止各处重复手写条件
- **不采用**：
  - 仅用 `extensionId === 'director-code.agent'`（源码态会走 Copilot 分支，开发 UX 和发布 UX 不一致，不便对比验证）
  - 仅用 `chatExtensionId === ''`（太宽松；上游未来若把 `chatExtensionId` 当作独立判据扩展新语义会冲突）
  - 新加 `product.directorCodeBuiltInMode: true` 字段（需改上游 product 类型定义；`chatExtensionId === ''` 已经够表达，不要无谓扩表）

**built-in mode 目标态（本轮写死）**：

- 不再展示 Copilot 订阅、额度、升级、匿名试用等产品语义
- 状态类 UI 只保留两类信息：**配置状态**（未配置时显示 `Configure Director Code AI` / 打开 Settings）与 **运行状态**（有 agent session 运行时显示中性进行中状态）
- **配置状态内部再细分**为 `未配置` 与 `已配置但当前不可用`（如 auth 失效 / provider 错误 / quota 限制），两者都保持中性 Director-Code 文案，不恢复 Copilot 升级/付费语义
- `workbench.action.chat.upgradePlan`、`workbench.action.chat.manageOverages`、Copilot sign-up / entitlement / paid usage 相关路径在 built-in mode 下必须不可达
- **兼容命令策略**：保留 `workbench.action.chat.triggerSetup`、`workbench.action.chat.triggerSetupAnonymousWithoutDialog`、`workbench.action.chat.triggerSetupForceSignIn`、`workbench.action.chat.triggerSetupFromAccounts`、`workbench.action.chat.triggerSetupSupportAnonymousAction` 等 setup 命令族，但在 built-in mode 下统一转发到 `director-code.openSettings`，并返回 truthy 成功值，避免旧调用点走进 Copilot sign-in/anonymous/setup 分支
- 兼容别名需走统一 helper；除返回 truthy 外，还要保留必要的 context refresh / focus / open-editor side effects，不能让各调用点各自做 no-op
- **失败处理已拍板（v2.25 决策 1）**：`director-code.openSettings` 执行失败时，helper **始终返回 truthy** 避免旧调用点 fallback 到 Copilot sign-in 分支，**同时**显式调用 `INotificationService.error('Failed to open Director Code settings: <reason>. Please try Ctrl+Shift+P → "Director Code: Open Settings".')` 弹窗提示用户。不接受"静默失败返回 truthy"或"返回 false 触发 Copilot fallback"两种极端方案
- 用户可见图标/文案一并纳入品牌收口范围：文案改完但保留 `$(copilot)` / `Codicon.copilot` 的可见入口，视为 B4 未完成

**已定决策（已拍板）**：

- `termsStatementUrl` / `privacyStatementUrl` / `publicCodeMatchesUrl` 采用**发布前补真实独立页面**路线。开发期可保持空字符串并隐藏依赖 UI；**默认开启 / 对外发布前必须替换为正式 URL**，否则不满足发布门槛
- 发布门槛按 **4 个 URL** 闭环：`defaultChatAgent.{termsStatementUrl, privacyStatementUrl, publicCodeMatchesUrl}` + 顶层 `privacyStatementUrl`；缺任一项都只能视为开发/内测构建
- **承载平台与默认落版方案已拍板**：这 4 个页面统一放 **GitHub Pages**，host base 固定为 `https://daxijiu.github.io/Director-Code/`
- **默认 URL 固定为**：
  - `defaultChatAgent.termsStatementUrl` → `https://daxijiu.github.io/Director-Code/terms/`
  - `defaultChatAgent.privacyStatementUrl` 与顶层 `privacyStatementUrl` → `https://daxijiu.github.io/Director-Code/privacy/`
  - `defaultChatAgent.publicCodeMatchesUrl` → `https://daxijiu.github.io/Director-Code/public-code/`
- **页面 owner 已拍板**：仓库 owner
- **首版文案来源已拍板**：先用仓内文档起草首版，再单独做一次文案/合规校对
- **外部依赖提醒**：这 4 个 URL 只是“代码/配置侧必须存在”的发布门槛，不自动等于内容已齐备。当前剩余工作是把页面内容实际产出并把正式 URL 写入发布产物；这已是交付事项，不再是待决策事项
- **交付边界补充（新增）**：GitHub Pages 四页的“内容起草 -> Pages 发布 -> URL 探测”属于 **B4 的并行非代码交付**，不会因为 `product.json` 已写正式 URL 而自动完成。最晚在 RC 冻结前必须完成一次完整闭环；若代码侧已写正式 URL 但页面仍未发布、为空壳或 404，B4 仍视为**未满足发布门槛**

**状态映射（built-in mode）**：

| 旧语义 | 新语义 |
|------|------|
| signed out / new user / anonymous | 统一收敛为 **Configure Director Code AI**，主操作打开 Settings |
| auth invalid / provider unavailable / quota reached | **Director Code AI unavailable**，主操作为 Retry 或打开 Settings；不展示升级/付费 CTA |
| disabled / untrusted | 显示中性“AI disabled / untrusted”状态，不引导 Copilot setup |
| sessions in progress | 保留中性进行中状态 |
| paid plan / upgrade / overage | 不展示，不可达 |

**① `defaultChatAgent` 对象内字段**（放在 `product.json` 的 `"defaultChatAgent": { ... }` 中）：

| 字段 | 值 | 说明 |
|------|----|------|
| `extensionId` | `"director-code.agent"` | 与现有自研链路里的 synthetic extension id 保持一致（`agentEngine.contribution.ts` / `directorCodeModelProvider.ts` 已使用该值）；扩展不存在但经验证安全 |
| `chatExtensionId` | `""` | 空字符串走 proposal 回退，内置工具仍标为 Internal |
| `chatExtensionOutputId` | `""` | 同步清空 |
| `chatExtensionOutputExtensionStateCommand` | `""` | 不引入伪造占位命令 |
| **`provider`** | `{ "default": { "id": "director-code", "name": "Director Code" }, "enterprise": { "id": "", "name": "" }, "google": { "id": "", "name": "" }, "apple": { "id": "", "name": "" } }` | **必填**，`chatWidget.ts:990` 无 `?.` 访问。仅 `default` 有值，其余置空 |
| `providerExtensionId` | `""` | Director-Code 不依赖外部 auth provider 扩展 |
| `providerUriSetting` | `""` | 无对应 setting |
| `providerScopes` | `[]` | 无 GitHub OAuth scopes |
| `documentationUrl` | `"https://github.com/daxijiu/Director-Code#readme"` | |
| `skusDocumentationUrl` | `"https://github.com/daxijiu/Director-Code"` | 当前阶段统一到仓库主页 |
| `publicCodeMatchesUrl` | `""`（开发期） / 正式独立页面 URL（发布前必填） | 开发期可为空并隐藏依赖 UI；未替换正式 URL 不得默认开启/对外发布 |
| `termsStatementUrl` | `""`（开发期） / 正式独立页面 URL（发布前必填） | 同上 |
| `privacyStatementUrl` | `""`（开发期） / 正式独立页面 URL（发布前必填） | 同上 |
| `manageSettingsUrl` | `"command:director-code.openSettings"` | 保留为真实可用入口，避免 Settings/齿轮/管理面板坏跳转 |
| `managePlanUrl` | `""` | 保持空字符串，但前提是相关 plan/upgrade 入口已在下文 `guard skip` |
| `manageOverageUrl` | `""` | 同上 |
| `upgradePlanUrl` | `""` | 同上 |
| `signUpUrl` | `""` | 同上 |
| `entitlementUrl` | `""` | 保持空字符串，但前提是 entitlement/default account 链已被 `guard skip` 或 no-op 化 |
| `entitlementSignupLimitedUrl` | `""` | 同上 |
| `tokenEntitlementUrl` | `""` | 同上 |
| `mcpRegistryDataUrl` | `""` | 同上 |
| `chatQuotaExceededContext` | `""` | 同上 |
| `completionsQuotaExceededContext` | `""` | 同上 |
| `walkthroughCommand` | `""` | 同上 |
| `completionsMenuCommand` | `""` | 同上 |
| `completionsRefreshTokenCommand` | `""` | 同上 |
| `chatRefreshTokenCommand` | `""` | 同上 |
| `generateCommitMessageCommand` | `""` | 同上 |
| `resolveMergeConflictsCommand` | `""` | 同上 |
| `completionsAdvancedSetting` | `""` | 同上 |
| `completionsEnablementSetting` | `""` | 同上 |
| `nextEditSuggestionsSetting` | `""` | 同上 |

**② `product.json` 顶层字段**（不在 `defaultChatAgent` 内，直接放在 `product.json` 根级）：

| 字段 | 值 | 说明 |
|------|----|------|
| `reportIssueUrl` | `"https://github.com/daxijiu/Director-Code/issues/new"` | 顶层字段，非 `defaultChatAgent` 成员 |
| `requestFeatureUrl` | `"https://github.com/daxijiu/Director-Code/issues/new"` | 同上 |
| `releaseNotesUrl` | `"https://github.com/daxijiu/Director-Code/releases"` | 同上 |
| `privacyStatementUrl` | `""`（开发期） / 正式独立页面 URL（发布前必填） | 顶层 Help/Telemetry 入口同样需指向正式隐私页；开发期可为空 |

**`dataFolderName`**：从 `.vscode-oss` 直接改为 `.director-code`，不做自动数据迁移（当前无外部用户）。**注意路径语义**：`dataFolderName` 走 `userHome`，Windows 下实际目录是用户主目录下的 `C:\Users\<name>\.director-code`，**不是** `%APPDATA%\.director-code`。**开发者提示**：在 `agentEngine.contribution.ts` 启动时加一次性检测——若旧目录 `.vscode-oss` 存在且新目录 `.director-code` 不存在，通过 `INotificationService.info()` 提示"检测到旧数据目录，如需保留设置请手动复制"（~10 行，不阻塞启动）。

**受影响路径首轮处置清单（非完整清单）**：

**统一实现策略：分层处理，而非仅靠 `chatExtensionId` falsy**。对 setup/install/teardown/oauth/quota/plan/entitlement 等 Copilot 专属链路统一 `guard skip`；对仍保留的用户入口接到 Director-Code 自身能力（例如 Settings）；对欢迎页/管理页/免责声明等直接露出的文案做字符串重写。**不删除上游代码块**（最小侵入，rebase 冲突最小）。每处 guard 用 `// [Director-Code] skip: built-in agent` 注释标记，方便 rebase 时识别。

**免责声明 UI 规则**：

- 开发期若 `terms/privacy/publicCode` 相关 URL 为空，依赖这些 URL 的 disclaimer / markdown 链接块必须**整体隐藏**，不能渲染空链接或占位链接
- 发布构建若这些 UI 仍可见，则对应链接必须都已替换为正式独立页面 URL

| 文件 | 关键逻辑 | 处置 |
|------|---------|------|
| `chatSetupController.ts` L264-272 | `install(chatExtensionId)` | **guard skip** |
| `chatSetupContributions.ts` L94, 564-603, 303-341 | `checkExtensionInstallation` + `triggerSetup*` 命令注册 | **guard + override**：`installed` context 恒 true；`triggerSetup*` 命令族在 built-in mode 下统一别名到 `director-code.openSettings` |
| `chatSetupContributions.ts` L615-617 | URL handler `authority === chatExtensionId` | **guard + 重写**：换 Director-Code URL scheme |
| `chatSetupContributions.ts` L697-718 | Teardown enable/disable | **guard skip** |
| `chatSetupContributions.ts` L511-516 | `github.copilot.chat.*` 硬编码命令 | **guard skip** |
| `chatSetupProviders.ts` L59-65, 515-516 | 超时文案 + `copilot_` 前缀 | **字符串重写**为 Director-Code |
| `chatSetupProviders.ts` L719-756 | `replaceAgentInRequestModel` | **重写**为 DC agent id 映射（目标 chat agent id = `director-code`，不要与 extension id `director-code.agent` 混淆） |
| `chatGettingStarted.ts` L33-77 | 监听 Install 事件 | **guard + 重写**：guard 掉上游的扩展安装监听；重写为 agent 注册完成后的**中性 AI 配置引导**，主按钮统一打开 `director-code.openSettings`。**不要写成 API key-only 语义**。**触发时机写实**：改为监听 `IChatAgentService.onDidChangeAgents` 或在 contribution 自身 `LifecyclePhase.Restored` 时触发一次；用现有 `storageService.getBoolean(ChatGettingStartedContribution.hideWelcomeView, StorageScope.APPLICATION, false)` 作为"已显示过"的一次性 guard（语义从"Copilot 安装后引导"变为"Director-Code 首次引导"），避免每次启动都强制弹 UI。**阶段性实现**：若 B4 先于 B1/C2 落地，初版判定"已配置"使用：<br/>```typescript<br/>const providers: ProviderName[] = ['anthropic','openai','gemini','openai-compatible','anthropic-compatible'];<br/>const results = await Promise.all(providers.map(p => apiKeyService.hasApiKey(p)));<br/>const hasAnyApiKey = results.some(Boolean);<br/>```<br/>**⚠️ 不要**写成 `providers.some(p => await apiKeyService.hasApiKey(p))`——`Array.prototype.some` 不 await Promise（会立即看到 truthy 的 Promise 对象），导致永远判为 "已配置"。C2 完成后切到统一 `IAuthStateService`（v2.26 决策 4，任一 provider 存在可用 API key 或 OAuth 即隐藏）。**过渡期 UX 已知限制（v2.26 决策 3 接受）**：B4 完成到 C2 完成之间的窗口期（约 2-3 周），已 OAuth 登录但无 API key 的用户会看到错误的"需配置"引导；**接受该已知限制**，不在 B4 提前集成 `IOAuthService` 以避免与 B1 耦合放大。窗口期仅影响内部/早期测试，C2 完成前本来就不是对外发布状态。**不要**在 B4 阶段就去耦合 `IOAuthService`，否则与 B1 拍板的"OAuth 主路径非本轮主线"冲突 |
| `chatSetup.ts` L76-108 | 重启 `github-authentication` | **guard skip** |
| `chatParticipant.contribution.ts` L340-360 | 兼容性通知 | **guard skip** |
| `chatSetupRunner.ts` L200-207, 255-265 | `provider.enterprise/google/apple.name` 按钮文案 + Terms/Privacy/Public Code footer | **guard skip** 整个 setup runner 入口；**不依赖**空 `name` 触发 `"Continue with "` 这类偶然退化；若 footer 保留显示则链接必须为正式 URL，开发期为空时隐藏 footer |
| `chatSetupGrowthSession.ts` L80, L81, L131, L133 | `Try Copilot` 标签 / `GitHub Copilot is available` 描述 / `Tell me about GitHub Copilot!` previousRequest / `Welcome to GitHub Copilot, your AI coding assistant!` previousResponse，**均为直接对用户呈现的 session item 文案** | **整段 guard skip growth session 注册（已拍板 v2.30）**。built-in mode 下不再注册 growth session contribution，彻底移除该入口；不保留重写文案方案。理由：`chatGettingStarted.ts` 已承担中性首次引导职责，growth session 在 Phase 1 无独立价值，且 4 处文案重写 + storage key 语义转变的维护成本不值得。`STORAGE_KEY = 'chat.growthSession.dismissed'` 保留不改（不改不删，上游 rebase 友好）；guard 方式：在 contribution 注册入口用 `isDirectorCodeBuiltInMode()` 判定，返回空 disposable 跳过注册 |
| `chatActions.ts` L78+, 1088, 1115 | `triggerSetup*` / `triggerSetupSupportAnonymousAction` 命令定义、`provider.enterprise.id`、Settings 打开入口 | setup 命令族统一别名到 `director-code.openSettings` 并返回 truthy；`ContextKeyExpr` **保留不改**；Settings 入口改走真实 `manageSettingsUrl = command:director-code.openSettings` |
| `extensionGalleryService.ts` L1162-1174 | 搜索结果重排 | **保留不改**：无实际效果 |
| `extensionGalleryService.ts` L2010-2017 | deprecation 注入 | **guard skip** |
| `mainThreadLanguageModelTools.ts` L123-129 | `isBuiltinTool` 与 contribution 不对称 | **补齐 proposal 回退**：`chatExtensionId` falsy 时检查 `chatParticipantPrivate` proposal |
| `chatStatusDashboard.ts` | Manage/Upgrade/Overage 按钮 + Copilot 配额文案 + anonymous disclaimer | **guard + 重写**：不再允许空 URL 直开；保留的入口统一改到 Director-Code Settings；若 Terms/Privacy URL 为空则不渲染 anonymous disclaimer |
| `chatStatusEntry.ts` | status bar `$(copilot*)` 图标、signed-out/quota/finish-setup 状态机 | **重写为 built-in mode 状态机**：未配置→`Configure Director Code AI`；运行中→中性进行中；移除 Copilot quota/upgrade 语义 |
| `chatStatusWidget.ts` | anonymous/free quota CTA 文案 | **guard skip** 或 **重写** 为 Director-Code 配置引导，不再出现 “Sign in to use Copilot Free” |
| `chatUsageWidget.ts` | Usage 面板 quota 明细 | **guard skip** 或 **重写** 为配置/运行状态摘要；built-in mode 不再展示 Copilot usage quota 模型 |
| `chatQuotaExceededPart.ts` | quota exceeded 响应内 Upgrade/Manage Overages CTA | **guard skip** Copilot 付费路径；保留 Retry，必要时改为 Settings CTA |
| `chatManagementEditorInput.ts` | editor 标题/标签 | **字符串重写**：如 `Manage AI` / `Director Code AI`，不再显示 `Manage Copilot` |
| `chatManagementEditor.ts` | plan card / upgrade button / usage CTA | **guard + 重写**：built-in mode 下不再显示 Copilot plan 升级路径 |
| `defaultAccount.ts` | entitlement/token URL、默认 auth provider 配置 | **guard + no-op fallback**：built-in mode 下不再发 Copilot entitlement/default account 请求 |
| `chatEntitlementService.ts` | sign-up / upgrade / quota dialog 链路 | **guard skip**：built-in mode 下不再触发 Copilot 升级/注册路径 |
| `welcomeAgentSessions/browser/agentSessionsWelcome.ts` | 欢迎卡标题/说明 | **字符串重写**，去掉 `Try GitHub Copilot for free` |
| `agentTitleBarStatusWidget.ts` | quota reached / sign-in CTA | **guard + 重写**：built-in mode 下不再出现 Copilot Free/quota 文案，改为设置引导或中性状态提示 |
| `agentSessions/agentSessions.ts` | provider label / description / growth 文案 | **重写或隐藏**：`Background/Cloud/Growth` 这类 Copilot-specific provider 不得以 Copilot 品牌暴露；如当前阶段无对应 Director-Code 能力，则在 UI 中隐藏；`Claude`/`Codex` 等可保留，但描述不得依赖 “GitHub Copilot subscription” 语义 |
| `chatModelPicker.ts` / `modelPickerActionItem.ts` / `chatAnonymousRateLimitedPart.ts` / `chatTipContentPart.ts` / `chatContinueInAction.ts` | upgrade hover / premium models CTA / setup command 入口 / Copilot-only 排序提示 | **移除 built-in mode 下的 upgrade CTA**；setup 入口依赖 `triggerSetup*` 别名统一落到 Settings；保留通用模型管理，不再假定存在 Copilot premium 模型路径 |
| `chatWidget.ts` / `chatQuick.ts` / `inlineChatWidget.ts` / `welcomeGettingStarted/common/gettingStartedContent.ts`（**文档之前写的 `welcomeGettingStarted.ts` 名字不准确，实际是 `gettingStartedContent.ts`；另外 `browser/gettingStarted.ts` 也含 Copilot 提及，需一并核查**） | TOS / public-code / settings 文案中的 `Copilot` 静态字符串 | **guard + 字符串重写**；URL 为空时隐藏对应 disclaimer block；禁止出现 `Director Code Copilot` 这类半替换文案 |

**注意**：`browser/widget/chatWidget.ts:990-991` 使用 `product.defaultChatAgent.provider` 无 `?.`，必须确保 `defaultChatAgent` 块配置完整。

**实施前后验证**：编码前后各执行一次全仓 Grep：`defaultChatAgent|chatExtensionId|defaultChatAgent\?\.extensionId|manageSettingsUrl|upgradePlanUrl|entitlementUrl|GitHub Copilot|Copilot|Codicon.copilot|\\$\\(copilot|workbench.action.chat.upgradePlan|workbench.action.chat.manageOverages|workbench.action.chat.triggerSetup|triggerSetupAnonymousWithoutDialog|triggerSetupForceSignIn|triggerSetupFromAccounts|triggerSetupSupportAnonymousAction|CHAT_SETUP_ACTION_ID|vendor: 'copilot'|copilot-fast`，对直接露给用户的 UI 文案、图标、付费/升级命令链、setup 命令族和 Copilot-only 模型选择路径做二次复核。上表仅为**首轮清单**，不宣称完整。**注意**：`provider.enterprise` 等子对象 `{ "id": "", "name": "" }` **是 truthy**（JS 中对象始终为 truthy），因此需额外排查 `if (provider.enterprise)` 或 `if (defaultChat.provider.google)` 之类的对象级判断——这些会通过条件分支。空字符串字段（`id`/`name`）是 falsy，字符串级判断安全。**已知具体触发点**：`chatActions.ts:93` 的 `product.defaultChatAgent?.provider ?? { enterprise: { id: '' } }` 已是截断 fallback，但 fallback 里 `enterprise` 仍是 truthy 对象；B4 修改时要核对 `if (defaultChat.provider.enterprise)` 之类分支是否仍按预期进入。

**`defaultChatAgent.extensionId` 消费路径审核（B4-6 扫尾必查）**：把 `extensionId` 改为 `director-code.agent` 后，以下非 chat 模块的消费点需要确认 **no-op 安全**（没有真实扩展 id 为 `director-code.agent`，所以相关判定链只会静默走 "未命中" 分支，但语义上仍需人工过一遍）：

| 文件 | 消费语义 | 改名后行为 |
|------|---------|-----------|
| `services/extensionManagement/browser/extensionEnablementService.ts:102` | `_completionsExtensionId = defaultChatAgent?.extensionId.toLowerCase()` | 会被设为 `director-code.agent`；后续按 id 匹配真扩展的路径永远 miss，no-op 安全 |
| `services/inlineCompletions/common/inlineCompletionsUnification.ts:72` | 同上，completions extension id 识别 | 同上 no-op 安全 |
| `contrib/extensions/browser/extensionsWorkbenchService.ts:2743` | `areSameExtensions(extension.identifier, { id: defaultChatAgent.extensionId })` | 永远 false，不会把本地扩展错标为 Copilot |
| `services/accounts/browser/defaultAccount.ts:92` | 作为 `defaultAccountRegistrationKey` 之一 | 需在 B4 的 `defaultAccount.ts` guard skip 里同时处理（已在表中）|

若未来希望让 `extensionId` 不再被当作 "completions extension" 消费（避免语义漂移），可作为后续优化；**本轮已拍板按 "no-op 安全" 收口（保留 `director-code.agent`，不改名、不加额外 guard）**：
- `B4-6` 扫尾时必须人工核对上述 4 处消费点，确认没有真实的执行副作用（比如没有"完成 init 后又误写 `director-code.agent` 为 completions extension id 的本地 config"这种二阶效应）
- 核对结果作为 B4-6 的交付记录（简要标注 "4/4 consumers verified no-op" 即可，不必写长审计报告）
- 若扫尾中发现任何一处**实际产生副作用**（而非纯 no-op），必须升级为 B4 blocker 并重新评估是否保留 `director-code.agent` 命名

**手动 Smoke Test Checklist**（编码完成后 0.5 天）：

| # | 检查项 | 预期 |
|---|--------|------|
| 1 | 欢迎页 | 不含 Copilot 文案 |
| 2 | Help → Documentation | 跳转 GitHub readme |
| 3 | Help → Report Issue | 跳转 GitHub issues |
| 4 | Help → Privacy Statement | 跳转正式 Privacy 页面（发布构建）。**注意**：`helpActions.ts:283` 的 `OpenPrivacyStatementUrlAction.AVAILABLE = !!product.privacyStatementUrl` 决定菜单项是否注册；**顶层 `privacyStatementUrl` 为空时整条 Help 菜单项不可见**。开发期该菜单项不可见属正常，发布构建前必须补上正式 URL 才能通过此项 |
| 5 | Chat / Setup / Welcome 中的 Terms / Privacy / Public Code 链接 | 开发期隐藏；发布构建跳转到正式独立页面 |
| 6 | Chat 模型选择器 | 显示 Director-Code 模型 |
| 7 | Usage / AI Management / Status 面板 | 不含 Copilot 文案，且无坏跳转/空链接 |
| 8 | Agent Sessions provider 列表/描述 | 不出现 `Copilot CLI` / `GitHub Copilot coding agent` / `Copilot features` / `GitHub Copilot subscription` 文案 |
| 9 | 旧 setup 入口（tip/continue in/quota 提示） | 全部打开 Director-Code Settings，不进入 Copilot setup/sign-in 流程 |
| 10 | Settings 搜 "copilot" | 无 Copilot 跳转 |
| 11 | 内置工具确认弹窗 | 正常渲染 |
| 12 | Getting Started | 不提示安装扩展；若无可用 auth，仅显示中性配置引导，不误写成 API Key-only |
| 13 | About | Director-Code 品牌 |
| 14 | 数据目录 | 用户主目录下的 `.director-code`（Windows 例如 `C:\Users\<name>\.director-code`）。**注意**：`main.ts:460-463` 在 `process.env['VSCODE_DEV']` 为真时会追加 `-dev` 后缀，**dev/watch 模式下实际目录是 `.director-code-dev`**（Windows 例如 `C:\Users\<name>\.director-code-dev`），这是预期行为；发布构建 / 打包产物应看到不带 `-dev` 的名称 |
| 15 | Chat 齿轮菜单 | Settings 正常打开 |

**验收环境补充**：B4 的品牌/链接/数据目录手动 smoke 必须基于 `prepare_vscode.sh` 之后的产物或最终安装包执行；**不以**未执行 prepare 的源码运行态 / watch 态作为品牌与发布门槛的验收依据。

**当前代码脱节点（执行前必须知道）**：

- `prepare_vscode.sh` 的 stable 分支当前仍**没有**设置 `dataFolderName = .director-code`，所以即使根 `product.json` 改对了，脚本产物仍可能被覆盖回旧值
- `mainThreadLanguageModelTools.ts` 与 `languageModelToolsContribution.ts` 的 builtin-tool 判定口径当前不对称：
  - 前者在 `chatExtensionId` 为空时直接判 `false`
  - 后者在 `chatExtensionId` 为空时回退到 `chatParticipantPrivate` proposal
  这会导致 built-in mode 下工具 source / Internal 标记前后不一致
- `chatSetupContributions.ts` / `chatActions.ts` / `chatSetupProviders.ts` / `chatStatus*` / `chatManagement*` 这几批文件里仍然深度耦合 setup / upgrade / entitlement / anonymous 语义；如果不按顺序收口，很容易改一处漏一处
- `provider.enterprise/google/apple` 这些对象即使 `id/name` 置空，**对象本身仍然 truthy**，所以不能把“置空字段”误当成 guard
- `chatWidget.ts` / `chatQuick.ts` 的 disclaimer 文案链仍直接取 `product.defaultChatAgent.provider.default.name`，所以 `defaultChatAgent` 结构必须完整，不能只改部分字段
- B4 最容易失败的不是“改不动”，而是**没有统一顺序，导致源头、入口、触点三层互相把旧语义拉回来**
- **在 B4 完成前，任何基于当前默认 merge 结果（根 `product.json` 未覆盖 + stable 未补 `dataFolderName`）的构建，都不代表 Director-Code 最终产品态，不应用于对外发布验证或品牌结论**

**B4 细化执行 checklist（文件级，按顺序执行）**：

1. **B4-0 先冻结“源头配置 -> 运行时入口 -> 用户可见触点”的三层顺序**
   - **先读文件**：`product.json`、`prepare_vscode.sh`、`chatActions.ts`、`chatSetupContributions.ts`
   - **先冻结顺序**：
     - 先改源头配置
     - 再改 setup/command alias/defaultChatAgent 消费点
     - 最后扫用户可见文案与 CTA
   - **完成标志**：后续每个改动都能明确属于“源头 / 入口 / 触点”哪一层

2. **B4-1 先把 `product.json` 与 `prepare_vscode.sh` 收口到同一真相**
   - **主要文件**：根 `product.json`、`prepare_vscode.sh`
   - **⚠️ 当前基线（v2.28 补充，执行前必知）**：
     - 根目录 `product.json` **完全不含** `defaultChatAgent` 块，也**不含** `reportIssueUrl` / `requestFeatureUrl` / `releaseNotesUrl` / `privacyStatementUrl` 这 4 个顶层字段；目前仅有 `extensionAllowedBadgeProviders` / `extensionEnabledApiProposals` / `extensionKind` 等扩展相关配置
     - 这意味着 `prepare_vscode.sh` 的 `jq -s '.[0] * .[1]'` merge 结果中，`defaultChatAgent` 完全继承 `vscode/product.json` 的 Copilot 默认值（`extensionId: "GitHub.copilot"` / `chatExtensionId: "GitHub.copilot-chat"` / 所有 URL 指向 aka.ms/github-copilot-* 等）
     - **B4-1 的工作性质是"整块新增"而非"小改几个字段"**：需要在根目录 `product.json` 新增完整的 `defaultChatAgent` JSON 对象（约 30 个字段）+ 4 个顶层字段；`prepare_vscode.sh` stable 分支补 `dataFolderName = .director-code`，并按 **v2.28 决策 Q5** 将 L47/L49 的 Microsoft 链接 **改写为 Director-Code 对称兜底 setpath**（与下文「三源对称兜底」段落一致；**不是**简单删除 L47/L49）
     - 工作量评估建议：B4-1 预留 0.5 天（而非"几分钟改改"），含 JSON 结构核对、开发态 smoke 验证 merge 结果正确
   - **要做的事**：
     - 根 `product.json` **整块新增** `defaultChatAgent` 对象（按前文 `① defaultChatAgent 对象内字段` 表格）
     - 根 `product.json` **整块新增** 4 个顶层字段（按前文 `② product.json 顶层字段` 表格）
     - `prepare_vscode.sh` stable 分支补 `dataFolderName = .director-code`
     - 校对 `urlProtocol`、`applicationName`、`dataFolderName`、`manageSettingsUrl`、顶层 `reportIssueUrl/requestFeatureUrl/releaseNotesUrl`（**仅校对现有品牌/应用协议配置，不把 OAuth callback 重新升格为前置**）
   - **`jq` 深度合并语义（务必理解）**：`prepare_vscode.sh` L122 的 `jq -s '.[0] * .[1]' product.json ../product.json` 是**递归对象合并**（对 object 递归；对 string/array/primitive 右侧覆盖）。这意味着：
     - 若你在根目录 `product.json` 只写 `"defaultChatAgent": { "extensionId": "director-code.agent" }`，merge 后 **除 `extensionId` 外的所有 `defaultChatAgent.*` 字段都保留 vscode/product.json 的旧值**（包括仍然是 `GitHub.copilot-chat` 的 `chatExtensionId`）。
     - **结论**：要覆盖某字段，必须在根目录 product.json 里**显式写出**该字段，包括"希望置空"时必须写 `"字段": ""`（空字符串），**不能用"省略"表示置空**。
     - 上方表格 `① defaultChatAgent 对象内字段` 与 `② 顶层字段` 是需要显式写出的最小集，不写就等于继承旧 Copilot 配置。
   - **prepare_vscode.sh 与根 product.json 的冗余（v2.28 决策 Q5 修订为"三源对称兜底"）**：`prepare_vscode.sh` L47-49 当前用 `setpath` 写入三个顶层链接，**实际行号-字段配对如下（v2.27 修正）**：
     - **L47**：`releaseNotesUrl` = `https://go.microsoft.com/fwlink/?LinkID=533483#vscode`（Microsoft 链接）
     - **L48**：`reportIssueUrl` = `https://github.com/daxijiu/Director-Code/issues/new`（**已改为 Director-Code**）
     - **L49**：`requestFeatureUrl` = `https://go.microsoft.com/fwlink/?LinkID=533482`（Microsoft 链接）
     - 根目录 `product.json` 的同名字段会通过 L122 的 merge **覆盖 setpath 结果**，因此功能上"只在根目录写"也能正确最终态。**本轮策略改为 `sync-to-director-code`（v2.28 决策 Q5 拍板，三源对称兜底）**：
     - 在 `B4-1` 内**同时**完成：① 把这 3 个顶层字段的最终值写入**根目录** `product.json`（主真相）；② **同步改写** `prepare_vscode.sh` **L47** 与 **L49** 的 setpath 值，从 Microsoft 链接改为 Director-Code 版本：
       - **L47** → `setpath "product" "releaseNotesUrl" "https://github.com/daxijiu/Director-Code/releases"`
       - **L48** → 保持不变（`https://github.com/daxijiu/Director-Code/issues/new`）
       - **L49** → `setpath "product" "requestFeatureUrl" "https://github.com/daxijiu/Director-Code/issues/new"`（与 L48 同 URL，因 Director-Code 用同一 issue tracker 收集 bug 与 feature request）
     - **三者对称兜底语义**：`releaseNotesUrl` / `reportIssueUrl` / `requestFeatureUrl` 全部采用 "setpath（Director-Code 版）+ 根 product.json 覆盖" 双源策略。正常路径根 product.json 的 merge 结果覆盖 setpath，行为一致；若根 product.json 意外缺失/损坏，setpath 兜底确保**所有**三个顶层链接都指向 Director-Code 域名，**不会**出现"用户点 Help > Release Notes 跳向 Microsoft 文档"的异常表现
     - **为什么选增补而非删除**（v2.28 决策 Q5 理由）：用户选项 B——若 L47/L49 删除，根 product.json 缺失场景下 `releaseNotesUrl` / `requestFeatureUrl` 会退回 vscode 上游默认（可能指向 Microsoft 或空），用户看到奇怪链接；"增补"比"删除"多两行代码，但确保三者完全对称兜底，异常路径也保持品牌一致
     - **⚠️ 历史错误提醒**：v2.24/v2.25 中曾把 L47/L48/L49 分别错写成 `reportIssueUrl` / `releaseNotesUrl` / `requestFeatureUrl`，并让 L47 保留、L48/L49 删除。**按该错误口径执行会颠倒地删掉 L48（Director-Code issues）而保留 L47（Microsoft 链接）**。本轮（v2.27）已基于 `prepare_vscode.sh` 当前内容核对修正；v2.28 在此基础上再把策略从"删除 L47/L49"改为"L47/L49 增补 Director-Code 版 setpath"
     - **不变动**的 setpath：`checksumFailMoreInfoUrl` / `documentationUrl` / `introductoryVideosUrl` / `keyboardShortcutsUrl*` / `licenseUrl` / `linkProtectionTrustedDomains` / `tipsAndTricksUrl` / `twitterUrl` / `extensionsGallery` 等继续由 `prepare_vscode.sh` 维护，不迁到 product.json
     - 完成后在 `B4-7` 扫尾 grep 里校验：`rg "go\.microsoft\.com" product.json prepare_vscode.sh`，确认结果集只剩已保留的 Microsoft 链接（如 `documentationUrl` / `tipsAndTricksUrl` / `keyboardShortcutsUrl*` 等**非品牌敏感**字段），**L47/L49 不应再命中 Microsoft 链接**
   - **完成标志**：源码运行与脚本产物看到的关键产品元数据一致

3. **B4-2 先修 setup 命令族与默认入口**
   - **主要文件**：`chatActions.ts`、`chatSetupContributions.ts`、`chatSetupController.ts`、`chatSetupProviders.ts`
   - **要做的事**：
     - `workbench.action.chat.triggerSetup*` built-in mode 下统一别名到 `director-code.openSettings`
     - 返回 truthy 成功值，阻止旧调用点继续 fallback
     - `install(chatExtensionId)`、teardown、`github.copilot.chat.*` 等路径统一 guard skip
   - **完成标志**：任何旧 setup 入口都只会把用户带到 Director-Code Settings

4. **B4-3 再修 builtin tool/source 判定口径**
   - **主要文件**：`mainThreadLanguageModelTools.ts`、`languageModelToolsContribution.ts`
   - **要做的事**：
     - 当 `chatExtensionId` 为空时，两边都统一走 proposal fallback
     - 确保 built-in mode 下 Internal/source 判定前后一致
   - **完成标志**：不会再出现一边把工具看成 Internal、另一边看成 extension 的分叉

5. **B4-4 收口状态栏、Quota、Management、Usage 这些状态类 UI**
   - **主要文件**：`chatStatusDashboard.ts`、`chatStatusEntry.ts`、`chatStatusWidget.ts`、`chatUsageWidget.ts`、`chatQuotaExceededPart.ts`、`chatManagementEditor.ts`、`chatManagementEditorInput.ts`
   - **要做的事**：
     - 统一状态映射到 `Configure Director Code AI` / 中性运行状态 / disabled-untrusted
     - 移除 upgrade / overage / paid plan 语义
     - 所有仍可点击入口统一改到 Settings 或直接 guard skip
   - **完成标志**：状态类 UI 不再暗示 Copilot 订阅体系，也没有空链接/坏跳转

6. **B4-5 扫欢迎页 / disclaimer / getting started / quick chat 文案链**
   - **主要文件**：`chatGettingStarted.ts`、`chatWidget.ts`、`chatQuick.ts`、`chatSetupRunner.ts`、`welcomeAgentSessions/browser/agentSessionsWelcome.ts`
   - **要做的事**：
     - `terms/privacy/publicCode` 为空时对应 disclaimer 整块隐藏
     - Getting Started 改成中性 AI 配置 / Settings 引导，不再监听扩展安装；最终显隐以“是否存在可用 auth（API key 或 OAuth）”为准
     - 欢迎页 / quick chat / setup runner 中残余 `Copilot` 文案做字符串重写
   - **完成标志**：用户第一次看到的页面和免责声明已经完全是 Director-Code 语义

7. **B4-6 最后处理 Agent Sessions / Model Picker / Tip/Continue-in 等边缘可见触点**
   - **主要文件**：`agentSessions/agentSessions.ts`、`agentTitleBarStatusWidget.ts`、`chatModelPicker.ts`、`modelPickerActionItem.ts`、`chatTipContentPart.ts`、`chatContinueInAction.ts`、`chatAnonymousRateLimitedPart.ts`
   - **要做的事**：
     - Agent Sessions provider 描述去掉 Copilot 品牌与订阅语义
     - built-in mode 下模型 picker / tip / continue-in 的 setup/upgrade CTA 统一导向 Settings 或移除
     - 同步核对 `AgentSessionProviders` 枚举与 `isBuiltInAgentSessionProvider` 等判定函数，避免 `Codex/openai-codex` 只改文案不改归类
     - 这些触点不要重新引入前面已清掉的 premium/upgrade 语义
   - **完成标志**：边缘触点不会把 B4 前面已经清掉的 Copilot 语义再带回来

8. **B4-7 全仓 grep 扫尾 + 手动 smoke 按表验**
   - **主要文件**：全仓（按文档 grep 模式）
   - **要做的事**：
     - 编码前后各跑一次 grep
     - 对命中的**用户可见**残留项逐一复核，不只看数量变化
     - 按 15 条 hand smoke checklist 验证
   - **完成标志**：B4 不是“局部文件看起来改了”，而是 built-in mode 的产品体验真正闭环

9. **B4-8（B4-followup）与 C2/C4 收尾对账**
   - **重点回看文件**：`chatModelPicker.ts`、`modelPickerActionItem.ts`、`chatActions.ts`
   - **执行时机（v2.26 明确）**：B4-8 **必须**在 `C2-9` 和 `C4-10` 都完成后执行（即 Week 9 末 C 主线实现完成后 0.5 天内）；提前执行会遇到 C2/C4 未稳定，对账无意义
   - **要做的事**：
     - 确认 B4 的去 Copilot 化不与 C2 的 Settings/OAuth 文案冲突
     - 确认 B4 的模型相关 CTA 不与 C4 的 auxiliary model fallback / manage models 逻辑打架
     - **明确交付物**：一份简短 "B4/C2/C4 对账表"（provider/状态→文案→行为），作为 B4-followup 交付，附到 B4 PR 或 RC tag 说明中
   - **完成标志**：产品元数据层、Settings 层、模型交互层不再互相拉扯

**验收标准**：
- 产品不再引导用户到 Copilot 页面
- 稳定版不与 `.vscode-oss` 共享数据目录
- 所有 setup/welcome/gallery 路径不再假定存在可安装扩展
- quota/plan/entitlement/status 链不再出现空 URL、坏跳转或残留 Copilot 升级路径
- `triggerSetup*` 命令族在 built-in mode 下统一打开 Settings，不再进入 Copilot setup/sign-in/anonymous flow
- 默认开启 / 对外发布前，`terms/privacy/publicCode` 相关 URL 已替换为正式独立页面
- 开发期若相关 URL 为空，免责声明区块不渲染空链接
- Agent Sessions 相关 provider 名称/描述不再暴露 Copilot 品牌或订阅语义

---

### B1. 修复 OAuth 正确性与生命周期

**目标**：OAuth 流程闭环，正式接入运行时。本轮仅支持 `anthropic` / `openai`；`gemini` / `openai-compatible` / `anthropic-compatible` 只支持 `api-key`。

**阶段口径**：
- **`B1-core`**：auth 契约、`IOAuthService` 注入链、Anthropic OAuth、共享 auth/cache 刷新链、Settings widget/controller 内核就位
- **`B1-ship`**：`B1-core` + OpenAI `B1-5 ~ B1-9` 全部通过（含 `openai-codex` transport 结论、真实 smoke、标准 Chat / Agent 消费闭环）
- 文末 **Phase 1 对外发布 / 默认开启门槛** 对应的是 **`B1-ship`**，不是只完成 `B1-core`

**涉及文件**：`common/agentEngine/oauthService.ts`、`browser/agentEngine/agentEngine.contribution.ts`、`common/agentEngine/apiKeyService.ts`、`common/agentEngine/providers/providerTypes.ts`、`common/agentEngine/providers/abstractProvider.ts`、`common/agentEngine/providers/openaiProvider.ts`、`browser/agentEngine/directorCodeAgent.ts`、`browser/agentEngine/directorCodeModelProvider.ts`、`browser/agentEngine/directorCodeSettingsEditor.ts`，以及必要时新增的 OAuth widget/controller 相邻文件

**当前状态（经代码调研，以下主要描述待 `B1-2` 替换的旧基线）**：
- `oauthService.ts` 现有实现按**统一 authorization-code callback** 模式写死 `redirect_uri = vscode://director-code/auth/callback`，但已拍板的新方案要求 **provider-specific flow**（`anthropic` 走 PKCE + 手动粘 code；`openai` 走 device code / 官方 public flow）
- `handleCallback(code, state)` 已实现，但**全仓库无生产代码调用它**
- `agentEngine.contribution.ts` 中**没有** `IOAuthService` 的 `registerSingleton`，**没有** URI handler 注册
- 并发 flow 用 SecretStorage 按 state 分键，无单飞锁，过期 state 无清理
- `directorCodeSettingsEditor.ts` 里的 `Subscription & Login` 仍是 `Coming Soon` 占位，说明 OAuth 现在**没有用户可达入口**
- **关键架构缝隙**：当前 `openaiProvider.ts` 是面向 `https://api.openai.com/v1/chat/completions` 的 Chat Completions Provider；而 Hermes 参考里的 OpenAI OAuth 实际上是 **`openai-codex` / ChatGPT-Codex backend**（`chatgpt.com/backend-api/codex` + `auth.openai.com` device code）。**这不是“只换 token 来源”，而是“认证 + 传输协议一起变”**
- **交付口径说明**：当前仓库里虽然已有 `oauthService.ts` 与相邻测试文件，但**这不等于 OAuth 已交付**。本文中 B1/C2 的“完成”标准以 **Workbench 注入链 + Settings 可达入口 + 真实请求可用** 为准，不以“存在服务文件/单测”视为完成
- **基线替换说明**：当前 `oauthService.ts` 仍是 **空 `clientId` + 统一 callback/PKCE + OpenAI 授权码流** 的旧基线；B1 对该文件的实施性质以**替换/重写为主**，不要按“在现有实现上小修补”估算工作量
- **URL protocol 对齐警告（新增）**：当前 `oauthService.ts` L81/L89 硬编码 `redirectUri: 'vscode://director-code/auth/callback'`，但实际应用的 `urlProtocol` stable 是 `director-code`、insider 是 `director-code-insiders`（见 `prepare_vscode.sh` L70/L97）。旧 `vscode://director-code/...` scheme **不是**当前应用已注册的 URL protocol，即使走到 callback 路径也不会被 `IURLHandler` 正确分发。B1 重写时：① 主路径走 Hermes-style provider-specific flow，**不复用**该旧 redirectUri；② 若未来把 URL callback 作为"可选增强"重新引入，`redirect_uri` 必须使用实际 `urlProtocol`（即 `director-code://auth/callback` 或 `director-code-insiders://auth/callback`），并通过 `productService.urlProtocol` 动态构造，不要继续硬编码 `vscode://`
- **旧代码保留策略（v2.26 决策 1，v2.27 细化 lint 策略）**：B1-2 重写 OAuthService 时，`handleCallback()` 及其关联的旧 `redirectUri` / 统一 callback state 管理代码**保留但标 `@deprecated`**（注释 `// [Director-Code] reserved for URI-callback-based provider expansion (disabled in Hermes-style flow)`），不要一次性删除。理由：未来某个 provider 的官方 public flow 可能确实需要 app callback（类似 GitHub OAuth App 模式），届时复活这些代码比重新实现成本更低。**保留约束**：① 不能在任何 production path 上被调用；② 必须有**运行时** guard（服务实现首行 `throw`，见下条 lint 策略），避免死代码被误调用；③ 每次 rebase 时核对是否需要跟上游变更同步。**注意**：下文写死**不**采用 `if (false && ...)` 作为唯一手段——与 ② 的「首行 throw」策略一致，勿混用两套表述
  - **具体 lint 策略（v2.27 写死）**：
    - `handleCallback()` 方法定义前加 JSDoc：`/** @deprecated Reserved for URI-callback-based provider expansion. Do not call directly. */`
    - 方法保留为 `IOAuthService` 接口方法，但服务实现中首行加 `throw new Error('handleCallback() is reserved for future URI-callback flows and must not be called in Hermes-style OAuth paths.');` 作为运行时 guard
    - 保留的 `redirectUri` 相关常量加注释 `// [Director-Code] reserved; not used in active Hermes-style flow (v2.27)`
    - **不使用** `if (false && ...)` 或注释掉整块——容易在下次 rebase 自动被 IDE/lint 扫除或引入 TS6133 "unused variable" 错误
    - **允许**对 `handleCallback()` 的参数加 `@param state - unused in reserved path` 注释，避免触发 `noUnusedParameters`
    - `eslint-disable-next-line @typescript-eslint/no-unused-vars` 仅对参数列表生效；不建议对整个方法 disable

**已定决策（已拍板）**：

- 采用 **Hermes-style provider-specific OAuth**，**不做 BYO `clientId`**，也不向终端用户暴露通用 `clientId` 输入
- `anthropic`：内置 public `clientId`，走 **PKCE + 手动粘 code** 流程（打开浏览器授权页，用户将 code 粘回 Settings / 登录面板）
- `openai`：内置 public `clientId`，走 **device code / provider 官方 public flow**；UI 展示 `verification_url + user_code` 并轮询结果，**不强行复用** `anthropic` 的 callback / paste-code 实现；**用户侧入口文案固定为 `OpenAI (ChatGPT/Codex OAuth)`**
- `gemini` / `openai-compatible` / `anthropic-compatible`：本轮继续 **API key only**
- `IURLHandler` / `urlProtocol` callback 从 B1 **主路径降级为可选增强**：若未来某个 provider 的官方 public flow 确认适合 app callback，再单独接回；**不再作为 Phase 1 blocker**
- **OpenAI 默认收口策略（新增，避免执行时误接线）**：先按 **“独立 auth/transport 变体”** 处理，不把 device-code 得到的 ChatGPT/Codex token 直接塞进现有 `openaiProvider.ts`
- **fixed public `clientId` 的来源归属**已拍板为 **C（复刻 Hermes 实现）**：当前轮次直接按 Hermes 同源 public `clientId` 落地；若后续因 policy/合规/可用性需要替换，再单列决策，不反向阻塞本轮实现顺序
- **当前范围约束（显式写死）**：同一 provider 在同一时刻只消费一条“有效 auth 路径”。若 `openai` 同时存在 API key 与 OAuth token，当前轮次默认按既定优先级走 OAuth（`authVariant = openai-codex`）；要回到 `api.openai.com` API-key 路径，需显式 logout / disable OAuth。若后续需要“同 provider 下 API key / OAuth 并存且可手动切换”，单列为新需求，不并入本轮收口。

**实现方式**：

1. **先补 auth/transport 契约缺口**（这是 B1 新增前置，必须早于 UI 和具体 flow）：
   - 当前 `ProviderOptions.apiKey`、`IResolvedProviderOptions.apiKey`、各 Provider 构造器都默认“只有 API key / Bearer token 一种字符串凭证”，这对 Hermes-style OpenAI OAuth **不够表达**
   - **最小安全改法**：把 provider resolved options 扩成显式认证结构，例如：
     - `auth: { kind: 'api-key'; value: string }`
     - `auth: { kind: 'bearer'; accessToken: string; refreshToken?: string; clientId?: string }`
     - 如需 delegated flow，后续再扩 `external`
   - `OpenAIProvider` / `AnthropicProvider` 自己决定如何把 `auth` 映射到 header，不再把所有凭证都塞进 `apiKey`
   - **默认策略**：Anthropic OAuth 即使当前 token 形态可能兼容 `x-api-key`，也仍按显式 `auth.kind` 落地，避免以后“看起来能跑、实际语义错位”
2. **OAuthService 抽象改为 provider-specific flow contract**：不要再假设所有 provider 都能抽象成同一个 `startOAuthFlow(provider, clientId?) -> auth_url -> handleCallback()` 模型。建议接口改为：
   - `startLogin(provider)` → 返回 provider-specific payload（如 `flow: 'pkce_manual' | 'device_code' | 'external'`、`authUrl`、`verificationUrl`、`userCode`、`expiresIn`、`sessionId`）
   - `submitManualCode(provider, sessionId, code)` → 仅供 `pkce_manual` 使用
   - `pollLogin(provider, sessionId)` → 仅供 `device_code` 使用
   - `logout(provider)` / `getStatus(provider)` → UI 统一消费
   - **原则**：状态机统一、UI 壳统一，但 provider 登录形态**不强行统一**
3. **服务注册**（B1 统一负责，原 A5 不重复注册）：
   - `registerSingleton(IOAuthService, OAuthService, InstantiationType.Delayed)`
   - `registerSingleton(IModelResolverService, ModelResolverService, InstantiationType.Delayed)`
   - 若后续某个 provider 的官方 public flow确实需要 app callback，再参照 `promptUrlHandler.ts` 新建独立的 `IWorkbenchContribution + IURLHandler` 类；但这条链路**不是** Anthropic / OpenAI 当前收口方案的前置
4. **OAuth 逻辑修复**：
   - `clientId` 改为 **provider-owned fixed public clientId**，集中定义在 OAuth provider config 中；对最终用户不可见。若确有 dev/test 覆盖需求，只允许走开发环境变量或隐藏调试开关，**不入正式 Settings UI**
   - `IOAuthState` / session state 保存 `provider`、`flowKind`、`clientId`、`codeVerifier/deviceCode`、`createdAt` 等 provider-specific 元数据
   - 持久化 token 时同时保存 `clientId` / `flowKind`（或等价字段）；refresh 一律使用**该 provider 对应的固定 clientId**，避免下次 refresh 与首次登录脱节
   - `pkce_manual` 的 state TTL 固定为 `15 * 60 * 1000`；`device_code` 会话 TTL 以 provider 返回的 `expires_in` 为主，UI 倒计时与 backend session 保持一致
- `startLogin` 对同一 provider 加单飞锁；PKCE 和 device-code 都要支持取消、超时和重试。**锁释放条件**以会话过期、用户取消、device-code 轮询失败/超时、以及（若存在的）URI callback 超时为准，不再绑定单一路径
   - 新增 `cleanupExpiredStates()` / `cleanupExpiredSessions()`，服务启动和新 flow 启动时执行
   - device-code 轮询采用 Hermes-style：UI 展示 code + verification URL，后台轮询；过期后进入明确的 retry 状态，不留下僵尸 session
   - refresh 定时器 delay 做 `MAX_SAFE_TIMEOUT` 截断
5. **OpenAI OAuth 传输策略单独收口**（新增）：
   - Hermes 参考的 OpenAI 是 `openai-codex`，不是当前 `openaiProvider.ts` 的 `api.openai.com/v1/chat/completions`
  - **默认实现策略**：为 OpenAI OAuth 增加一个内部 transport 变体，**内部命名固定为 `openai-codex`**，不要静默复用现有 `openai-completions`
   - 只有在真实 smoke test 证明 device-code 拿到的 token **可直接调用** 现有 `openaiProvider.ts` 目标端点时，才允许回收为单一 `openai` transport；在此之前，文档和代码都必须把两者视为不同通道
  - **用户可见层文案已拍板**：UI 固定显示为 `OpenAI (ChatGPT/Codex OAuth)`，不要再简化成 `OpenAI`；实现层同时保留独立 transport / authVariant，避免后续协议差异污染现有 API-key 路径

**Hermes 参考实现与执行映射（仅作示例参考，不构成执行前置）**：

- **参考依赖说明（新增）**：下列绝对路径是当时开发机上的参考 clone 位置，当前仓库**不保证自带**。若本机不存在这些路径，不构成 blocker，执行以本节已写死的 flow contract + `B1-0 ~ B1-9` checklist 为准；参考仓库只用于对照 payload / phase 形状，不应成为“没有 clone 就无法继续”的隐式前置

- **Flow 分类与后端 payload 形状**：看 `E:\Projects\sub-projects\hermes-agent\hermes_cli\web_server.py`
  - `_OAUTH_PROVIDER_CATALOG`：把 provider 明确分成 `pkce` / `device_code` / `external`
  - `list_oauth_providers()`：返回给 UI 的标准状态对象（`id/name/flow/cli_command/docs_url/status`）
  - `start_oauth_login()` / `submit_oauth_code()` / `poll_oauth_session()` / `cancel_oauth_session()`：对应 Director-Code 里的 `startLogin` / `submitManualCode` / `pollLogin` / `cancelLogin`
- **Anthropic 的 PKCE + 手动粘 code**：看 `E:\Projects\sub-projects\hermes-agent\agent\anthropic_adapter.py`
  - `_OAUTH_CLIENT_ID` / `_OAUTH_TOKEN_URL` / `_OAUTH_REDIRECT_URI`：固定 public client config
  - `_generate_pkce()`：本地生成 `code_verifier` / `code_challenge`
  - `run_hermes_oauth_login_pure()`：打开浏览器授权页、提示用户粘回 code、完成 token exchange
  - `refresh_anthropic_oauth_pure()`：refresh 路径继续使用同一个 fixed `clientId`
- **OpenAI/Codex 的 device code**：看 `E:\Projects\sub-projects\hermes-agent\hermes_cli\auth.py`
  - `CODEX_OAUTH_CLIENT_ID`：固定 public `clientId`
  - `_request_device_code()`：请求 `device_code/user_code/verification_uri/expires_in/interval`
  - `_poll_for_token()`：按 provider 返回的 `interval` 轮询 token endpoint
  - `_codex_device_code_login()`：完整 device-code 登录
  - `refresh_codex_oauth_pure()` / `get_codex_auth_status()`：refresh 与状态读取
  - **注意**：Hermes 的 runtime base URL 是 `chatgpt.com/backend-api/codex`，不是 `api.openai.com/v1`
- **CLI/状态持久化的分发入口**：看 `E:\Projects\sub-projects\hermes-agent\hermes_cli\auth_commands.py`
  - `auth_add_command()`：按 provider 分发到 `anthropic` / `nous` / `openai-codex` / `qwen-oauth`
  - 这里最值得借鉴的是：**统一入口 + provider-specific 分支 + 统一 credential pool 落盘**
- **Dashboard/UI 交互阶段机**：看 `E:\Projects\sub-projects\hermes-agent\web\src\components\OAuthLoginModal.tsx`
  - `Phase = "starting" | "awaiting_user" | "submitting" | "polling" | "approved" | "error"`
  - `pkce`：打开 `auth_url`，用户粘回 code，再调 `submitOAuthCode`
  - `device_code`：展示 `user_code + verification_url`，前端每 2s 调一次 `pollOAuthSession`
- **Director-Code 迁移映射（优先按此收口，不要在 payload / phase 上二次发明）**：
  - `vscode/src/vs/workbench/contrib/chat/common/agentEngine/oauthService.ts`：负责 **固定 clientId + session state + token store + refresh**
  - `vscode/src/vs/workbench/contrib/chat/common/agentEngine/apiKeyService.ts`：负责把“只有 `apiKey` 字符串”升级成显式 `auth` 结构，不要继续让 OAuth token 冒充 API key
  - `vscode/src/vs/workbench/contrib/chat/common/agentEngine/providers/providerTypes.ts` / `abstractProvider.ts`：负责 provider auth contract 升级
  - `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/directorCodeSettingsEditor.ts`：在 `B1-7` 仅负责**消费/挂载** Hermes-style 的 OAuth widget/controller 原型；不要把 OAuth 业务逻辑散落在 editor DOM 里
  - `anthropic`：实现 `startLogin()` 返回 `{ flow: 'pkce_manual', authUrl, expiresIn, sessionId }`；实现 `submitManualCode()`
  - `openai`：实现 `startLogin()` 返回 `{ flow: 'device_code', verificationUrl, userCode, expiresIn, sessionId }`；实现 `pollLogin()`；**并新增独立 transport / authVariant，不直接复用当前 `openaiProvider.ts`**
  - `getStatus(provider)`：至少返回 `loggedIn/source/sourceLabel/expiresAt/hasRefreshToken/flow` 这类 UI 真正需要的字段；不要只返回一个裸 boolean
  - 如果某条 provider 流程未来变成 `external`，直接沿用 Hermes 的思路：UI 展示外部 CLI 命令/说明，不把 delegated login 硬塞回统一 OAuth 内核

**实现顺序（避免执行时丢上下文）**：

> **若本节与下方 `B1-0 ~ B1-9` checklist 冲突，一律以 `B1-0 ~ B1-9` 为唯一执行顺序。** 本节只用于帮助理解技术依赖，不单独作为排期依据。

1. 先在 `oauthService.ts` 内把统一 callback 模型拆成 `pkce_manual` / `device_code`
2. 再补 provider config：固定 `clientId`、endpoints、scopes、flow kind
3. 先完成 Anthropic 的服务层闭环，再做 OpenAI transport spike；**没有 OpenAI transport 结论前不要做面向用户的 OpenAI UI**
4. 在 `B1-7` 时再接 `directorCodeSettingsEditor.ts` 的 phase UI（仅 widget/controller 原型，不扩 editor 布局编排）
5. 最后接 refresh / status / tests，并按 `B1-8/B1-9` 收口主路径与 smoke
6. 执行时若忘了状态机长什么样，**若本机存在参考仓库可先读** `E:\Projects\sub-projects\hermes-agent\web\src\components\OAuthLoginModal.tsx` 和 `E:\Projects\sub-projects\hermes-agent\hermes_cli\web_server.py`；**若不存在，以本文 phase 枚举、payload 形状与 `B1-0 ~ B1-9` checklist 为准**

**B1 细化执行 checklist（文件级，按顺序执行，不建议并行乱做）**：

1. **B1-0 基线确认与命名冻结**
   - **先读文件**：`oauthService.ts`、`apiKeyService.ts`、`providerTypes.ts`、`abstractProvider.ts`、`openaiProvider.ts`、`directorCodeSettingsEditor.ts`
   - **先冻结命名**：
     - `anthropic` OAuth UI 文案保持 `Anthropic`
     - `openai` OAuth UI 文案固定为 `OpenAI (ChatGPT/Codex OAuth)`
     - OpenAI OAuth 内部 `authVariant` **固定命名为** `openai-codex`；本轮执行期**不再保留临时改名空间**。若未来确需改名，必须同步处理 cache key、测试名、文档与迁移说明
     - `authVariant` / `flowKind` 的字面量、类型定义与默认值必须集中在**单一共享导出源**（优先 `providerTypes.ts`；若最终放到别处，也必须保持唯一导出），由 `oauthService.ts`、`modelResolver.ts`、`directorCodeModelProvider.ts`、Settings UI 与测试统一 import；禁止在多处手写 `'openai-codex'` / `'default'` / `'pkce_manual'` / `'device_code'`
   - **完成标志**：本段所用术语（`pkce_manual` / `device_code` / `authVariant` / `OpenAI (ChatGPT/Codex OAuth)`）在代码、测试、UI 文案里不再一套多词

2. **B1-1 先补认证契约，禁止 OAuth token 继续伪装成 `apiKey`**
   - **主要文件**：`providerTypes.ts`、`abstractProvider.ts`、`apiKeyService.ts`
   - **要做的事**：
     - 把 `ProviderOptions` / `ProviderConfig` / `IResolvedProviderOptions` 从单一 `apiKey: string` 扩成显式 `auth`
     - 统一引入 `auth.kind`（至少覆盖 `api-key` / `bearer`）
     - Provider 内部按 `auth.kind` 映射到 header，不再把 OAuth token 当作 “看起来像 API key 的字符串”
   - **破坏性改动联动清单（务必同一 PR 内完成，否则 TypeScript 编译不过）**：
     - 类型定义：`providerTypes.ts` 的 `ProviderOptions` / `ProviderConfig` + `apiKeyService.ts` 的 `IResolvedProviderOptions`
     - 基类：`abstractProvider.ts` 构造函数 + header 构建路径
     - 三家 Provider 子类：`anthropicProvider.ts` / `openaiProvider.ts` / `geminiProvider.ts` 的构造函数，以及各自 `createMessage` / `createMessageStream` 中 `Authorization` / `x-api-key` / `x-goog-api-key` / `?key=` 的 header/query 拼装点
     - 工厂函数：`createProvider(apiType, options)`（当前在 `providers/index.ts` 或等价位置）签名升级
     - 上层消费者：`directorCodeAgent.ts` / `directorCodeModelProvider.ts` 里每个调用 `createProvider({ apiKey, baseURL, ... })` 的点
     - 持久化：`apiKeyService.resolveProviderOptions()` 返回结构同步升级（**注**：v2.27 决策 4 延伸会在 B1-8 里把 `resolveProviderOptions()` 整体废弃；本 B1-1 阶段仍按升级旧返回结构处理，仅用于过渡；B1-8 完成后该方法从 production path 移除）
     - 测试：对应 `*.test.ts` 的 mock / assertion 必须同步从 `apiKey` 字段改为 `auth` 结构
     - **Gemini 特殊处理**：Gemini 继续使用 API key only（`auth.kind === 'api-key'`），但仍然要走新 contract，不允许单家 provider 保留旧 `apiKey: string` 路径
   - **这一阶段不要做**：UI、device-code 流程、手动粘 code 流程
   - **完成标志**：`openaiProvider.ts` / `anthropicProvider.ts` / `geminiProvider.ts` 都不再直接假设“所有凭证都是 `apiKey`”，且整仓库没有 `ts(2322)` / `ts(2345)` 等类型错误残留

3. **B1-2 重写 `OAuthService` 骨架，只保留 provider-specific flow contract**
   - **主要文件**：`oauthService.ts`
   - **要做的事**：
     - 删掉/废弃“统一 callback OAuth”假设
     - 新增 `startLogin(provider)`、`submitManualCode(provider, sessionId, code)`、`pollLogin(provider, sessionId)`、`getStatus(provider)`、`logout(provider)`
     - 引入统一的 session/state 结构：`provider`、`flowKind`、`clientId`、`codeVerifier/deviceCode`、`createdAt`、`expiresAt`
     - 把 provider 固定配置集中到一个 map：`clientId`、`flowKind`、authorize/token endpoints、scopes
   - **完成标志**：`oauthService.ts` 本身已经能表达 `anthropic(pkce_manual)` 与 `openai(device_code)` 两种不同流程，即使 UI 还没接上

4. **B1-3 注册服务与事件源，先把依赖注入链打通**
   - **主要文件**：`agentEngine.contribution.ts`
   - **要做的事**：
     - 注册 `IOAuthService`
     - 确认 `IModelResolverService` 注册时机与 `IOAuthService` 一致
     - 明确 `onDidChangeAuth` 是 OAuth 状态变化的唯一事件源，后续 UI/Provider 都订阅它
   - **注册顺序说明（v2.25 新增）**：`IOAuthService` 与 `IModelResolverService` 均采用 `InstantiationType.Delayed`，注册语句的**代码顺序无强依赖**（两者均在首次 `invokeFunction` / 构造注入时才实例化）。约束只有两条：① 两者都必须在同一个 contribution 的 `registerSingleton` 调用中出现（或对等的全局注册点），避免按 `isEqualOrParent` 检查的注册时机漏注；② `IModelResolverService` 的构造函数若注入 `IOAuthService`，DI 容器自动处理先后；**不要**在构造函数中先 `new` 再 `registerSingleton`，或用 `instantiationService.createInstance` 手动创建 OAuth 实例后再注册——会绕过 DI 生命周期
   - **完成标志**：`directorCodeSettingsEditor.ts`、`apiKeyService.ts`、`directorCodeModelProvider.ts` 已可注入 `IOAuthService`

5. **B1-4 先完成 Anthropic 的 PKCE + 手动粘 code，不碰 OpenAI**
   - **主要文件**：`oauthService.ts`
   - **参考实现**：`E:\Projects\sub-projects\hermes-agent\agent\anthropic_adapter.py`
   - **要做的事**：
     - `startLogin('anthropic')` 返回 `{ flow: 'pkce_manual', authUrl, expiresIn, sessionId }`
     - `submitManualCode('anthropic', sessionId, code)` 完成 token exchange
     - token 持久化 + refresh + logout + `getStatus('anthropic')`
   - **完成标志**：在没有任何 OpenAI 代码接入的前提下，Anthropic 登录链完整跑通。**本步允许先以服务层 + 测试 / 临时 harness 验证为主**；用户可达的 Settings 集成与 editor 级 UI 验收以后续 `B1-7` 为准
   - **最小真实端点 smoke（v2.27 新增，B1-core 放行条）**：即使 Settings UI 尚未接入，`B1-4` 结束前必须至少做**一次真实 Anthropic console 端点回路验证**，避免"服务层单测全绿但真实 endpoint 拒绝"的假完成：
     - 使用 dev harness / CLI 脚本（可写在 `oauthService.test.ts` 外，不纳入 CI）手动触发一次 `startLogin('anthropic')`
     - 在浏览器中完成授权并粘回真实 code
     - 验证 `submitManualCode()` 成功拿到 `access_token` + `refresh_token`
     - 使用该 access_token 发起一次真实 `POST https://api.anthropic.com/v1/messages` 请求并收到 200 响应（或至少 401 以外的结构化错误）
     - 结果作为 PR 描述附言（脱敏后），缺失该证据则 `B1-core` 不放行

6. **B1-5 OpenAI transport spike 是闸门步骤，先证明“怎么发请求”**
   - **主要文件**：`openaiProvider.ts`、`oauthService.ts`，必要时新增独立 transport 文件
   - **参考实现**：
     - `E:\Projects\sub-projects\hermes-agent\hermes_cli\auth.py`
     - `E:\Projects\sub-projects\free-code\src\services\oauth\codex-client.ts`
   - **要做的事**：
     - 先确认 device-code 拿到的 OpenAI token 是否能直接调用当前 `openaiProvider.ts` 指向的端点
     - 若不能，立即落到默认策略：新增独立 `openai-codex` transport，不再尝试兼容现有 `openai-completions`
     - 把结论写入测试名、注释或计划注记，避免后人重复猜
   - **停止条件**：
     - 如果 spike 结果不明确，**不要继续做 OpenAI UI**
     - 先把实现冻结在“独立 transport”路径，再继续后续步骤
     - 若在 **`B1-5` transport spike 阶段结束时** 仍无法证明稳定 transport 或真实 smoke 可用，则按已拍板策略执行：**允许先完成其他明确项，但继续阻塞 Phase 1 对外发布**；**不得**带着未定协议继续做 OpenAI OAuth UI/状态集成
   - **完成标志**：OpenAI 请求目标端点与 authVariant 已定，后续代码不再边做边猜

7. **B1-6 完成 OpenAI 的 device-code 登录与状态链**
   - **主要文件**：`oauthService.ts`、`openaiProvider.ts`（或新 transport 文件）、`directorCodeAgent.ts`、`directorCodeModelProvider.ts`
   - **参考实现**：
     - `E:\Projects\sub-projects\hermes-agent\hermes_cli\auth.py`
     - `E:\Projects\sub-projects\hermes-agent\hermes_cli\web_server.py`
   - **要做的事**：
     - `startLogin('openai')` 返回 `{ flow: 'device_code', verificationUrl, userCode, expiresIn, sessionId }`
     - `pollLogin('openai', sessionId)` 轮询直到 approved / error / timeout
     - 持久化 OpenAI OAuth token，并带上 `authVariant`
     - `directorCodeAgent` / `directorCodeModelProvider` 能消费该 `authVariant`
   - **完成标志**：OpenAI 登录链完整，但与现有 API-key OpenAI 路径不会互相污染

8. **B1-7 接 Settings UI，严格照 Hermes 的阶段机，不自己发明新交互**
   - **主要文件**：`directorCodeSettingsEditor.ts`（必要时带上 CSS/相关 widget）
   - **参考实现**：`E:\Projects\sub-projects\hermes-agent\web\src\components\OAuthLoginModal.tsx`
   - **要做的事**：
     - UI phase 统一为 `starting / awaiting_user / submitting / polling / approved / error`
     - `anthropic`：显示打开授权页 + 粘贴 code + 提交
     - `openai`：显示 `OpenAI (ChatGPT/Codex OAuth)` + `user_code + verification_url + polling`
    - **闸门提醒**：`openai` 这条用户可见流程只在 `B1-5/B1-6` 已冻结 transport / `authVariant` 后接线；在此之前只允许保留 widget/controller 内核或临时 harness，不做最终 editor 集成
     - 不新增通用 `clientId` 输入
     - API key 的 `Test Connection` 和 OAuth 的 `Check login/Refresh status` 分开
     - **职责边界**：本步只负责产出可复用的 OAuth widget/controller 与状态机内核；不要在这里把 `DirectorCodeSettingsEditor` 的 editor 布局、分隔线、状态栏、部件编排一并做完——这些归 `C2-4/C2-6`
     - **交付形态**：优先形成可复用的 `OAuthWidget` / `OAuthController`（物理文件可先临时与 editor 同文件共存）；`C2-4` 负责把它迁到最终文件布局并完成 editor 级编排，不重复发明第二套状态机
   - **完成标志**：`OAuthWidget` / `OAuthController` 在独立 harness 或临时挂载中能跑通两条 OAuth 流程，且不会让用户误以为要填 `clientId`；最终 editor 布局、状态栏和跨 widget 编排以 `C2-4/C2-6` 为准

9. **B1-8 接消费侧与缓存/状态刷新链（含新建 `IAuthStateService`）**
   - **主要文件**：`apiKeyService.ts`、**`authStateService.ts`（本步新建，路径 `common/agentEngine/authStateService.ts`，v2.26 决策 4）**、`directorCodeAgent.ts`、`directorCodeModelProvider.ts`、`modelResolver.ts`
   - **要做的事（v2.27 决策 4 延伸修订）**：
     - **彻底废弃** `apiKeyService.resolveProviderOptions()`——不再让它承担"API key OR OAuth"分支选择职责
     - **新建** `IAuthStateService` 与实现类 `AuthStateService`（**创建责任归 B1-8，C2 仅消费**），注册到 `agentEngine.contribution.ts`：`registerSingleton(IAuthStateService, AuthStateService, InstantiationType.Delayed)`
     - 接口方法 `resolveAuth(provider: ProviderName, model: string, authVariant: AuthVariantName): Promise<IResolvedAuthState>`（**三参数必填**，与 C2 v2.28 Q3 决策一致；漏传 `authVariant` 时 TypeScript 编译报错）
     - 返回统一 `{ source, authVariant, apiKey?, accessToken?, refreshToken?, identityKey?, metadata? }`
     - `DirectorCodeAgent` / `DirectorCodeModelProvider.sendChatRequest()` / 标准 Chat 通路 / `ModelResolver.resolveModels(...)` 的 `authIdentityKey` 提取，**统一**改走 `authStateService.resolveAuth()`，不再调用 `resolveProviderOptions()`
     - UI 同时订阅 `onDidChangeApiKey` 和 `onDidChangeAuth`（或 `IAuthStateService.onDidChangeAuthState` 聚合事件）
     - OpenAI 的 `authVariant` 进入 model cache / resolver bucket
     - **主路径闭环**：`IOAuthService` 注册、`IAuthStateService.resolveAuth()` 产出 OAuth/API-key 分支、`DirectorCodeAgent` / `DirectorCodeModelProvider` 消费统一 auth 视图、以及"缺凭证"错误文案从 API key-only 升级为可区分 OAuth / API key 状态，四者缺一不可
     - **resolveProviderOptions 调用点清理 checklist**（必须全清）：
       - `directorCodeAgent.ts`：原本的 `resolveProviderOptions()` 调用改为 `authStateService.resolveAuth()`
       - `directorCodeModelProvider.ts`：`sendChatRequest()` 和 `provideLanguageModelChatInfo()` 都改为走 AuthStateService
       - `modelResolver.ts`：如果内部有 `resolveProviderOptions()` 调用，改为接受外部传入的 resolved auth
       - 测试文件：对应 mock 从 `resolveProviderOptions` 改为 `authStateService.resolveAuth`
       - **grep 验收**：`rg "resolveProviderOptions" vscode/src/` 应只剩 deprecated stub 或测试夹具，不应在生产代码路径被实际调用
   - **完成标志**：登录/登出 OAuth 后不需要重启窗口，Agent 与标准 Chat 都能切到新状态；`resolveProviderOptions()` 已从所有 production path 彻底移除

10. **B1-9 测试、smoke、回归门槛**
   - **至少更新/新增的测试文件**：
     - `oauthService.test.ts`
     - `apiKeyService.test.ts`
     - **`authStateService.test.ts`**（B1-8 新建 `IAuthStateService`，必须有对应测试：覆盖三源优先级解析、`authVariant` 必填校验、API key/OAuth/missing 分支、`onDidChangeAuthState` 事件聚合）
     - `directorCodeModelProvider.test.ts`
     - `openaiProvider.test.ts`
     - 如有必要，补 `directorCodeSettingsEditor` 或相邻 widget 测试
   - **必须覆盖的用例**：
     - Anthropic `pkce_manual`：创建 session、提交 code、refresh、logout、过期清理
     - OpenAI `device_code`：start/poll/timeout/cancel/retry
     - `authVariant` 不串 cache
     - API key 测试与 OAuth 状态检查分离
     - Settings 在 `onDidChangeAuth` 后自动刷新
     - OpenAI OAuth token 不误落到现有 `api.openai.com` 通道
   - **手动 smoke checklist**：
     - Anthropic 登录成功一次
     - OpenAI device code 成功一次
     - 两者各自 logout 一次
     - 登录后 Agent 模式与标准 Chat 各发一次请求
     - Settings 中没有通用 `clientId` 输入
   - **`B1-ship` 最小放行条（写死）**：
     - `openai` device-code 登录成功一次
     - 请求**实际命中 codex backend**，而不是误落到 `api.openai.com`
     - Agent 与标准 Chat 各成功发起至少一轮真实请求
     - 应用重启后 token/refresh 仍可恢复一次
     - model picker / resolver 至少存在 **1 个** 已通过真实 smoke 的可发送模型
     - 缺任一项都只能记为 `B1-core` 或 “OpenAI OAuth 路径 WIP”，不得记为 `B1-ship`
   - **完成标志**：测试绿 + smoke 过 + 没有已知“登录成功但不能发请求”的假阳性路径

**验收标准**：
- `anthropic` 的 PKCE + 手动粘 code 流程完整可用
- `openai` 的 device code / 官方 public flow 完整可用
- exchange / poll 失败后可重试
- 过期 state 不会无限累积
- 仅 `anthropic`/`openai` 暴露 OAuth 入口
- provider-specific flow 状态机不会串台：`anthropic` 不误走 device code，`openai` 不误走 paste-code
- 内置 fixed `clientId` 在 token refresh、应用重启后仍可继续使用
- 最终用户 Settings 中**没有**通用 `clientId` 输入项
- OpenAI OAuth token 不会被误接到现有 `api.openai.com` API-key 通道；在 `authVariant = openai-codex` 场景下，验收 smoke **必须**命中 codex 后端，而不是误用 `api.openai.com` 凑通过；只有未来有独立证据证明单 transport 兼容时，才允许回收这条限制

---

### B2. 修复 ModelResolver 缓存隔离与并发去重

**涉及文件**：`common/agentEngine/modelResolver.ts`、`common/agentEngine/oauthService.ts`、`common/agentEngine/apiKeyService.ts`、`common/agentEngine/modelCatalog.ts`、`browser/agentEngine/directorCodeModelProvider.ts`，以及必要时的 `browser/agentEngine/directorCodeAgent.ts`

**并行边界**：`B2-0`、URL/provider 这类与 OAuth 身份形状无关的整理项，可与 `B1` 前半段并行；但从 **`B2-1` 起**，凡是依赖 `authIdentityKey` / `authVariant` / `getStatus()` 输出形状的步骤，**必须晚于** `B1-2`（新 flow contract）+ `B1-3`（服务注册与最小状态输出）产出最小可用实现。

**实现方式**：
- 缓存键加入身份维度，但**不再把 OAuth 路径抽象写成不落地的 `accountId`**。统一定义 `authIdentityKey`：
  - API key 路径：`sha256(apiKey).slice(0, 16)`
  - OAuth 路径：优先使用可稳定解出的主体标识（JWT `sub` / provider subject）；若当前 token 形态拿不到稳定主体，则退回 `sha256(refreshToken ?? accessToken).slice(0, 16)`
  - 无认证：`no-key`
- **回退身份键的取舍说明**：若 OAuth 路径退回到 `sha256(refreshToken ?? accessToken)`，且 token 在 refresh 后发生轮换，则允许 cache bucket 跟随切换。这里**安全优先于命中率**；调用链应在 `onDidChangeAuth` 后触发 resolver refresh，避免继续读取旧 bucket
- `OAuthService` 负责在 token 持久化时缓存/暴露 `authIdentityKey`；`ModelResolver` 只消费现成 identity key，**不**自行发起 `userinfo` / `whoami` 网络请求
- **最小改签名策略**：`IModelResolverService.resolveModels()` / `refreshModels()` 增加 optional `authIdentityKey?: string` 与 `authVariant?: string` 参数；API key 路径保持兼容不变，OAuth 路径在已解析到身份键 / transport 变体时透传这两个维度
- 最终缓存键：`provider + normalizedBaseURL + authIdentityKey + authVariant`
- **authVariant 新增说明**：对大多数 provider 可固定为 `default`；但 OpenAI 若同时存在 `api-key/api.openai.com` 与 `oauth` 通道下的 `authVariant = openai-codex` 两条通道，必须分桶，不能只靠 provider 名字共用 cache
- `normalizedBaseURL` 复用 `C1b` 的 URL 归一化语义：去掉尾随 `/`，并对 OpenAI/Anthropic 系按同一规则规范 `/v1`，避免等价 URL 形成不同 cache bucket
- **唯一真相约束**：B2 若早于 C1b 实现，可先在 resolver 侧提炼临时 `normalizeBaseURLForCache()`，但必须与 C1b 共享同一组测试向量；一旦 C1b 的共享 helper 落地，B2 应直接复用该 helper（或其导出的 normalize 子函数），不得长期并存两套语义近似的归一化实现
- 引入 in-flight promise map，命中进行中请求时直接复用
- `_openAIModelToResolved()` 不再用 `!!baseURL` 推断 provider 类型。**替代方案**：调用方（`_resolveOpenAI`/`_resolveOpenAICompatible`）已知 provider 类型，将 `providerType: 'openai' | 'openai-compatible'` 作为参数传入 `_openAIModelToResolved()`，直接使用而非从 URL 推断（当前代码 L307 `const isCompatible = !!baseURL` 会把使用代理 URL 的 OpenAI 原生用户误判为 compatible）
- 若 OpenAI OAuth 最终落为独立 `openai-codex` transport，则 `ModelResolver` **不要**再沿用 `GET /v1/models` 假设；在具备真实可用的 live models endpoint 之前，先回退到静态 allowlist / catalog 子集，避免 model picker 因 resolver 404/401 变成空列表

**B2 细化执行 checklist（文件级，按顺序执行）**：

1. **B2-0 先冻结 cache 维度与术语**
   - **先读文件**：`modelResolver.ts`、`apiKeyService.ts`、`oauthService.ts`、`directorCodeModelProvider.ts`
   - **先冻结四个 cache 维度**：
     - `provider`
     - `normalizedBaseURL`
     - `authIdentityKey`
     - `authVariant`
   - **明确约束**：
     - 没有这四个维度之前，不要先改 resolver 内部实现
     - OpenAI API-key 与 OpenAI OAuth/codex 必须视为两个不同 cache bucket
   - **完成标志**：文档、类型名、测试名都统一使用这四个维度，不再出现“账号维度”“身份维度”“OAuth 维度”混写

2. **B2-1 先让 `OAuthService` 能产出稳定身份键**
   - **主要文件**：`oauthService.ts`
   - **要做的事**：
     - token 持久化时保存 `authIdentityKey`
     - 优先从 token/JWT 中取稳定主体（如 `sub`）；拿不到时退回 `sha256(refreshToken ?? accessToken).slice(0, 16)`
     - 同时把 `authVariant` 也变成可读状态，供 resolver 侧消费
   - **这一阶段不要做**：改 `modelResolver.ts` 对外签名
   - **完成标志**：调用 `IOAuthService.getStatus()` 或等价接口，已经能拿到 `authIdentityKey` / `authVariant`

3. **B2-2 改 `IModelResolverService` 签名，但保持最小扩面**
   - **主要文件**：`modelResolver.ts`
   - **要做的事**：
     - `resolveModels()` / `refreshModels()` 增加 optional `authIdentityKey?: string` 与 `authVariant?: string`
     - `_cacheKey()` 同步升级
     - 保持 API key 路径兼容，不强制所有调用方一次性改完
   - **完成标志**：resolver 的接口已经能表达身份隔离与 authVariant 隔离，但旧 API-key 调用方仍可继续工作

4. **B2-3 重写 cache key / in-flight 去重，不再只看 provider+URL**
   - **主要文件**：`modelResolver.ts`
   - **要做的事**：
     - cache key 使用 `provider + normalizedBaseURL + authIdentityKey + authVariant`
     - 增加 in-flight promise map，避免并发 miss 打爆 provider `/models`
     - `refreshModels()` 既清 cache，也清对应 in-flight
   - **完成标志**：同 provider 不同账号 / 不同 authVariant 并发调用不会串结果，也不会重复打同一个请求风暴

5. **B2-4 先修 URL 归一化与 provider 误判**
   - **主要文件**：`modelResolver.ts`
   - **要做的事**：
     - 提炼 `normalizedBaseURL`
     - `_openAIModelToResolved()` 改为显式传 `providerType`
     - 不再通过 `!!baseURL` 猜是不是 `openai-compatible`
   - **完成标志**：`https://api.openai.com` / `https://api.openai.com/v1` / 代理 URL 不再因为 URL 形态差异造成错误 provider 或重复 bucket

6. **B2-5 给 OpenAI OAuth/codex 加独立 resolver 策略**
   - **主要文件**：`modelResolver.ts`、`directorCodeModelProvider.ts`、必要时 `modelCatalog.ts`
   - **要做的事**：
     - 如果 B1 证明 OpenAI OAuth 是独立 transport，则 resolver 不再默认走 `GET /v1/models`
     - 在 live endpoint 不稳定前，先回退到静态 allowlist / catalog 子集
     - `directorCodeModelProvider.provideLanguageModelChatInfo()` 也要认 `authVariant`，避免 picker 列表和真实请求脱节
   - **完成标志**：OpenAI OAuth 用户不会看到空 picker，也不会看到只在 API-key 路径可用的模型

7. **B2-6 接调用方：标准 Chat / Agent / Settings 共用同一解析口径**
   - **主要文件**：`apiKeyService.ts`、`directorCodeModelProvider.ts`、`directorCodeAgent.ts`（如需要）
   - **要做的事**：
     - `authStateService.resolveAuth()`（v2.27 决策 4 延伸，替代 `resolveProviderOptions()`）能把 `authIdentityKey` / `authVariant` 提供给 resolver 调用链
     - 标准 Chat 与 Agent 通路对同一 provider 使用同一 resolver 参数
     - 模型切换、登录/登出后，model provider 的 `onDidChange` 能触发列表刷新
   - **完成标志**：同一账号/同一 provider 下，Agent 与标准 Chat 看到的是同一份模型集；切账号/切 authVariant 时也同步变化

8. **B2-7 测试清单先补齐，再做 smoke**
   - **至少更新/新增的测试文件**：
     - `modelResolver.test.ts`
     - `apiKeyService.test.ts`
     - `directorCodeModelProvider.test.ts`
     - 必要时补 `oauthService.test.ts`
   - **必须覆盖的用例**：
     - 不同 API key → 不同 cache bucket
     - 不同 OAuth 账号 → 不同 `authIdentityKey`
     - 相同 provider + 等价 `/v1` URL → 同 bucket
     - OpenAI API-key 与 OpenAI OAuth/codex → 不同 `authVariant`
     - `_openAIModelToResolved()` 不因 baseURL 误判 provider
     - 并发 `resolveModels()` 只触发一次真实请求
     - `refreshModels()` 能清理旧 bucket 并重新拉取
   - **手动 smoke**：
     - 切换两个不同账号/凭证后，picker 变化正确
     - OpenAI API-key 与 OpenAI OAuth 路径互不串模型
     - 登出再登录后模型列表会刷新
   - **完成标志**：测试绿，且没有“切账号后还看到上一个账号模型列表”的污染问题

9. **B2-8 完成后再回看 A5/B1/C4 的耦合点**
   - **重点回看文件**：`directorCodeModelProvider.ts`、`modelCatalog.ts`、`oauthService.ts`
   - **要做的事**：
     - 确认 B2 没把 A5 的 full_unify 做散
     - 确认 C4 的静态 metadata 合并策略还能成立
     - 确认 B1 里的 OpenAI transport 分叉，在 B2 这里已经通过 `authVariant` 落到代码结构
   - **完成标志**：B2 不再是“局部修缓存”，而是为后续 A5/C4 铺好统一数据口径

**验收标准**：
- 不同 key 不串模型列表
- OAuth 路径在没有显式 `accountId` / `userinfo` 接口的情况下仍能稳定隔离缓存
- 等价 baseURL（如有无尾斜杠、OpenAI `/v1` 等价写法）不会形成重复 cache bucket
- 并发 resolve 不造成 stampede
- OpenAI API-key 路径与 OpenAI OAuth/codex 路径不会共用模型 cache 或错误互相污染

**Cache bucket 清理策略（v2.25 新增）**：

`ModelResolver` 的 cache 用 `Map<cacheKey, resolvedModels>` 存储。用户切换账号 / 登出 OAuth 后，旧 bucket 会保留在 map 中，理论上存在"无限累积"风险。本轮**不引入 LRU**（实现成本 > 收益）；采用**主动清理 + 被动过期**混合策略：

- **主动清理**：`IOAuthService.logout(provider)` 触发 `IModelResolverService.refreshModels(provider)`，该方法删除当前 provider 下所有 bucket（不仅是当前 authIdentityKey 的 bucket）
- **API key 变更**：`IApiKeyService.onDidChangeApiKey` 同样触发 `refreshModels(provider)`
- **被动过期**：每个 bucket entry 带 `createdAt` 时间戳；`resolveModels()` 读取时若 bucket 年龄 > 24 小时，视为过期并重新 resolve（不清除 map，下次写入覆盖）
- **手动刷新入口（v2.26 新增）**：用户在 Settings 页面的 Provider/Model 区域须有 **"Refresh Models"** 按钮，点击时调用 `IModelResolverService.refreshModels(provider)`（当前 provider 下所有 bucket 失效）。该按钮由 `C2-3` / `C2-6` 接入，与 API key Test Connection 同行或相邻放置。避免用户在上游模型列表更新后需要等 24h 才能看到新模型
- **最大容量兜底**：若同一 provider 下 bucket 数量 > 8，按 `createdAt` 删除最老的；正常使用场景一个用户不会有 >3 个 bucket，触发此兜底通常意味着异常使用
- **不做 LRU / 内存 size 追踪**：bucket 本身就是模型列表 metadata，单个 <10KB，即使极端累积也不会造成内存压力

---

### 原 A5（降至 B）. 修复标准 Chat 主路径配置统一

**目标**：标准 Chat 通路与 Agent 通路使用同一套模型/密钥/能力解析逻辑。统一范围为 **full_unify**（不做最小修复）。

**涉及文件**：`browser/agentEngine/directorCodeModelProvider.ts`、`browser/agentEngine/agentEngine.contribution.ts`、`common/agentEngine/apiKeyService.ts`、`common/agentEngine/modelResolver.ts`

**实现方式**：
- 确认 B1 已注册的 `IOAuthService` 和 `IModelResolverService` 在标准 Chat 通路中可正确注入和使用（**注册本身由 B1 完成**，此处不重复注册）
- `provideLanguageModelChatInfo()` 改为读取 ModelResolver 解析后的模型列表
- `sendChatRequest()` 统一走 `authStateService.resolveAuth()`（v2.27 决策 4 延伸：不再经 `resolveProviderOptions()`）
- 自定义模型、compatible provider、per-model 配置在标准 Chat 通路中全部接通

**当前代码脱节点（执行前必须知道）**：

- `directorCodeModelProvider.ts` 当前 `provideLanguageModelChatInfo()` 仍直接读 `MODEL_CATALOG.filter(m => m.provider === providerName)`，**没有接** `ModelResolver`
- 同文件 `sendChatRequest()` 仍直接 `getApiKey()` + `createProvider({ apiKey, baseURL })`，**没有走** 任何 auth 聚合层
- `directorCodeAgent.ts` 已经切到 `resolveProviderOptions()`，但 v2.27 决策 4 延伸后 `resolveProviderOptions()` 整体废弃；原 A5 执行时需同步将 `directorCodeAgent.ts` 也迁到 `authStateService.resolveAuth()`，两条通路一次性对齐

**原 A5 细化执行 checklist（文件级，按顺序执行）**：

1. **A5-0 冻结标准 Chat 的目标形态**
   - **先读文件**：`directorCodeModelProvider.ts`、`directorCodeAgent.ts`、`apiKeyService.ts`、`modelResolver.ts`
   - **先明确目标**：
     - 标准 Chat 与 Agent 通路使用同一套 **`authStateService.resolveAuth()`**（v2.27 决策 4 延伸，不再经 `resolveProviderOptions()`）
     - 标准 Chat 与 Agent 通路使用同一套模型解析（含 `authVariant` / OAuth 账号差异）
     - 标准 Chat 不再自己维护一套"简化版 provider 解析"
   - **完成标志**：原 A5 的“full_unify”在文档和实现计划里不再含糊，所有后续步骤都围绕 `directorCodeModelProvider.ts` 收口

2. **A5-1 先把 `directorCodeModelProvider.ts` 的依赖注入补齐**
   - **主要文件**：`directorCodeModelProvider.ts`
   - **要做的事**：
     - 注入 `IModelResolverService`
     - 如 B1/B2 最终需要，也注入 `IOAuthService` 或能提供 `authVariant` 的上层服务
     - 保持构造函数 shape 与 B1/B2 的服务注册一致
   - **这一阶段不要做**：直接改 `sendChatRequest()` 逻辑
   - **完成标志**：标准 Chat provider 已有拿到 resolver / OAuth 状态的能力，不再被迫只读配置 + catalog

3. **A5-2 重写 `provideLanguageModelChatInfo()`，先统一模型列表来源**
   - **主要文件**：`directorCodeModelProvider.ts`
   - **要做的事**：
     - 不再直接只读 `MODEL_CATALOG`
     - 改为优先走 `ModelResolverService.resolveModels(...)`
     - 再用静态 `MODEL_CATALOG` 覆盖 metadata
     - 保留 custom model 行为，但 custom model 的可见性要与当前 provider / authVariant 一致
   - **注意**：
     - OpenAI OAuth/codex 若走独立 transport，则列表必须走对应 `authVariant`
     - compatible provider 的自定义模型输入能力不能被这次改造搞丢
   - **完成标志**：标准 Chat 模型选择器不再只是“配置里写哪个 provider，就机械列 catalog 哪几项”

4. **A5-3 重写 `sendChatRequest()`，彻底对齐 Agent 通路**
   - **主要文件**：`directorCodeModelProvider.ts`、`directorCodeAgent.ts`（两者一起迁到 AuthStateService）
   - **要做的事（v2.27 决策 4 延伸修订）**：
     - 用 **`authStateService.resolveAuth(provider, model)`** 代替 `getApiKey()` / `resolveProviderOptions()`
     - `createProvider(...)` 改为消费 resolved auth `{ source, authVariant, apiKey?, accessToken?, ... }` / baseURL / capabilities
     - provider 创建逻辑与 `directorCodeAgent.ts` 保持一致；本步同时把 `directorCodeAgent.ts` 的 `resolveProviderOptions()` 调用也迁到 AuthStateService
     - 报错语义对齐：缺凭证时的 message 与 Settings 引导一致，能区分 "OAuth 未登录" / "API key 未配置" / "认证已失效"
   - **完成标志**：标准 Chat 不再自己拼一套"API key + baseURL"的旧逻辑；Agent 与标准 Chat 共用一套 AuthStateService 结果

5. **A5-4 对齐模型 ID / provider 推断 / custom model 逻辑**
   - **主要文件**：`directorCodeModelProvider.ts`、`modelCatalog.ts`
   - **要做的事**：
     - `modelId` 解析规则与 Agent 保持一致
     - 如果用户从 picker 选择模型，provider 推断要优先相信解析后的模型 definition / resolver 结果
     - custom model ID 在 compatible provider 下继续可用
     - OpenAI OAuth/codex 若独立 transport，需要显式区分“同名 OpenAI 模型但不同 authVariant”的解析路径
   - **完成标志**：从 picker 选模型、手输 custom model、切 provider 三种路径下，标准 Chat 的请求目标一致可预测

6. **A5-5 统一刷新链：配置变更、凭证变更、OAuth 变更都要触发模型列表刷新**
   - **主要文件**：`directorCodeModelProvider.ts`
   - **要做的事**：
     - 当前只监听 `CONFIG_PROVIDER` / `CONFIG_MODEL` 远远不够
     - 还要监听：
       - `CONFIG_BASE_URL`
       - `IApiKeyService.onDidChangeApiKey`
       - `IOAuthService.onDidChangeAuth`
       - `IModelResolverService.onDidChangeModels`
     - 触发 `this._onDidChange.fire()` 的条件要收口，不要漏，也不要无脑全量风暴
   - **完成标志**：登录/登出、改 API key、改 baseURL、手动刷新模型后，标准 Chat picker 都会跟着更新

7. **A5-6 对齐发送路径里的 authVariant / resolver bucket**
   - **主要文件**：`directorCodeModelProvider.ts`、`modelResolver.ts`、`apiKeyService.ts`
   - **要做的事**：
     - 标准 Chat 在请求前要拿到和 Agent 一样的 `authIdentityKey` / `authVariant`
     - 同一用户、同一 provider、同一 authVariant 下，标准 Chat 与 Agent 命中同一模型列表
     - 不同 authVariant（尤其 OpenAI API-key vs OAuth/codex）不能互串
   - **完成标志**：A5 与 B2 真正接上，不再只是“标准 Chat 改成调用 resolver”这么表面

8. **A5-7 保留 token count / metadata 的最小一致性**
   - **主要文件**：`directorCodeModelProvider.ts`
   - **要做的事**：
     - `provideTokenCount()` 可继续走轻量估算，但模型 metadata（`maxInputTokens/maxOutputTokens/family/capabilities`）要优先与 resolver 后的结果一致
     - 若 resolver 对某模型返回 `unknown` metadata，不要再用伪精确静态值覆盖成误导信息
   - **完成标志**：标准 Chat 的 picker / token count /真实请求不再是三套口径

9. **A5-8 测试与 smoke**
   - **至少更新/新增的测试文件**：
     - `directorCodeModelProvider.test.ts`
     - `configFlow.test.ts`
     - `agentRegistration.test.ts`（如需）
     - 必要时补新的标准 Chat 集成测试
   - **必须覆盖的用例**：
     - 标准 Chat 走 `authStateService.resolveAuth()`（v2.27 决策 4 延伸，不再用 `resolveProviderOptions()` 或 `getApiKey()`）
     - API key 变更后 picker 刷新
     - OAuth 登录/登出后 picker 刷新
     - compatible provider custom model 仍可发送
     - OpenAI API-key 与 OpenAI OAuth/codex 不互串
     - 标准 Chat 与 Agent 对同一模型的 provider/baseURL/capabilities 解析一致
   - **手动 smoke**：
     - 标准 Chat 选 Anthropic 模型发一次请求
     - 标准 Chat 选 OpenAI (ChatGPT/Codex OAuth) 路径模型发一次请求
     - 切换 provider / 登出再登录 / 修改 baseURL 后，picker 与真实请求都更新
   - **完成标志**：标准 Chat 不再是一条历史遗留通路，而是与 Agent 通路真正同构

10. **A5-9 与 B1/B2/C4 收尾对账**
   - **重点回看文件**：`directorCodeModelProvider.ts`、`modelResolver.ts`、`modelCatalog.ts`
   - **要做的事**：
     - 确认 A5 没绕开 B1 的 auth contract
     - 确认 A5 没绕开 B2 的 cache/authVariant
     - 确认 A5 与 C4 的 metadata merge 口径一致
   - **完成标志**：标准 Chat / Agent / picker / metadata / resolver 五处口径已经统一，不再出现“能选但不能发”“能发但列表不对”的脱节

**验收标准**：
- 同一模型在 Agent 与标准 Chat 通路行为一致
- per-model key/baseURL 变更后模型选择器与实际请求正确反映

---

### B3. 修复历史回放、进度渲染与 rich content 语义（B 批次最后做）

**目标**：历史回放不丢工具链；非流式路径显示正文；标准 Chat 不一律压成纯文本。本批次只修**当前会话历史回放**，不实现持久记忆或跨会话检索。

**涉及文件**：`browser/agentEngine/messageNormalization.ts`、`browser/agentEngine/progressBridge.ts`、`browser/agentEngine/directorCodeModelProvider.ts`、`browser/agentEngine/directorCodeAgent.ts`（注入 `IChatService`）

**数据来源（经代码调研确认）**：
- 上游 `toChatHistoryContent` 会过滤掉 `toolInvocation`，agent 收到的 `history` **本来就不含**工具块
- AgentEngine 内部 `this.messages` 在单次 `submitMessage` 中包含完整 tool 历史，但**跨轮次丢失**
- 获取完整 tool 历史：通过 `request.sessionResource` + `IChatService.getSession()` → `entireResponse.value`

**实现方式**：

**① messageNormalization 改造**：
- 保持纯函数，不引入 service 注入
- 在 `DirectorCodeAgent` 中**注入 `IChatService`**，通过 `chatService.getSession(request.sessionResource)` 获取完整 tool 历史
- `historyToNormalizedMessages` 增加可选第二参数 `richResponses?: ReadonlyArray<ReadonlyArray<IChatProgressResponseContent>>`
- **对齐防护**：`richResponses` 与 `history` 按索引一一对应（均来自同一 session 的 requests 列表）。**生产代码不做 hard assert**；若长度不等（理论上不应发生，但 rebase 后上游过滤逻辑可能变化），`console.warn` 并退回纯文本模式（不传 `richResponses`），不静默错位。严格相等断言写入测试，不放生产路径
- **门禁补充**：若 `history.length !== richResponses.length` 的 warn 在自动化测试或手动 smoke 中可稳定复现，则 `B3` 不得按“最佳努力降级后继续放行”收口，必须先定位根因，或把该降级显式升级为 blocker 说明
- 不修改上游 `toChatHistoryContent`（避免 rebase 风险）
- **时序说明**：`getSession()` 获取的 tool 历史仅包含**已完成的**历史 request/response（当前正在构建的 response 的 `entireResponse` 为空或 incomplete），与 `request.context.history` 的范围一致，不存在读到半成品的风险
- **Fallback**：若 `getSession()` 返回 `undefined`（session 已清理），则不传 `richResponses`，退回纯文本提取，不阻断对话
- **取消回放的额外校验点**：必须确认 `IChatService.getSession()` 对“上一轮已取消但已落盘 tool 往返”的 response 仍能返回这些结构化 part；若上游在 cancelled response 上丢失该数据，则 `DirectorCodeAgent` 需补一条**仅用于 replay** 的后备链路（优先复用 A2 收口后的 committed message snapshot），否则 B3 无法兑现“A2 保留副作用历史”的承诺
- **fallback 宿主写死**：A2/B3 所说的 replay-only committed message snapshot 不能停留在 `AgentEngine` 实例内部；若上游 cancelled response 无法从 `IChatService.getSession()` 取回完整结构化 part，必须把 snapshot 落到**可跨 request 访问的 session 级宿主**（优先 `DirectorCodeAgent` 持有的 `sessionResource -> replaySnapshot` map，或等价轻量 service）。仅当前轮 request 内可见的局部变量不算有效 fallback 源
- **snapshot map 生命周期（v2.27 新增，v2.28 决策 Q2 完善）**：`DirectorCodeAgent` 是 `InstantiationType.Delayed` 单例，生命周期与整个 workbench 一致；`sessionResource -> replaySnapshot` map 若无清理策略会随 session 打开/关闭累积内存。清理策略写死：
  - **主动清理**：订阅 `IChatService.onDidDisposeSession(sessionId)` 事件，session dispose 时同步删除对应 `sessionResource` 键（若该事件不存在，退回 TTL 兜底）
  - **容量兜底（LRU 触发时机）**：map 最多保留 **最近 16 个 session** 的 snapshot，按 LRU 淘汰；正常用户同时活跃 session 通常 < 5，16 是宽松上限。**触发时机写死**：**每次** 往 `_replaySnapshots.set(key, value)` **写入之前**检查 `this._replaySnapshots.size >= 16`，若是则从当前 map 中找到 `lastUpdated` 最小的 entry 删除后再写入新 entry；**不**使用独立 timer / setInterval。每个 entry 在被读或写时更新 `lastUpdated = Date.now()`，形成简单 LRU 近似
  - **单 snapshot 大小兜底（v2.28 决策 Q2 写死）**：单个 `replaySnapshot.messages` 最大 **200 条 messages**，超过后采用**"保留最早 1 条 user message + 最近 199 条"** 策略：
    - **语义理由**：最早的 user message 通常是整个会话的初始指令 / 核心约束（"帮我重构 X" / "我要实现 Y" / system-like 指令），对后续 replay 的连贯性至关重要；简单"保留最近 200 条"会把这条指令丢掉，模型 replay 时看到的是"对话中段的工具调用与响应"，容易误解为"从头开始的独立任务"
    - **保留规则**：若 `messages.length > 200`：
      ```typescript
      // 伪代码（实际实现放在 DirectorCodeAgent._pushReplaySnapshot 内）
      if (snapshot.messages.length > 200) {
        // 找到第一条 role === 'user' 的 message（通常就是 messages[0]，除非开头有 system）
        const firstUserIdx = snapshot.messages.findIndex(m => m.role === 'user');
        const firstUserMsg = firstUserIdx >= 0 ? snapshot.messages[firstUserIdx] : undefined;
        // 取最近 199 条
        const recent199 = snapshot.messages.slice(-199);
        // 若 firstUserMsg 不在 recent199 中（说明被截掉了），拼到最前
        if (firstUserMsg && !recent199.includes(firstUserMsg)) {
          snapshot.messages = [firstUserMsg, ...recent199];
        } else {
          snapshot.messages = recent199;
        }
      }
      ```
    - **边界情况**：若 `messages` 开头没有 user message（理论上不应发生，但为防御性编程），退回"保留最近 200 条"的简单截断，不抛错
    - **已知限制**：这是"锚点 + 滚动窗口"的近似方案，不完美：第 2~末尾的 user message 若包含后续分支指令（"等一下，改需求为 Z"），在极长会话下可能被截掉；但这类超长会话（>200 messages）本身已超出本轮 B3 的主要目标场景，**可接受**
  - **存储位置**：map 定义为 `DirectorCodeAgent` 私有字段 `private readonly _replaySnapshots = new Map<string, { messages: MessageParam[]; lastUpdated: number }>();`；不需要新建独立 service
  - **dispose 链**：`DirectorCodeAgent` 若未继承 `Disposable` 则补上继承（与 B3-1 的 `IChatService` 注入同步完成），`dispose()` 中 `this._replaySnapshots.clear()`

**② tool_use 重建**：**最佳努力策略，不做版本检测** — `toolCallId → id`、`toolId → name`、输入参数优先从 `toolSpecificData`（`kind === 'input'` 时的 `rawInput` 字段）恢复；terminal / simpleToolInvocation / todoList 等按各自字段恢复最小可用 input；无法稳定恢复时回退 `{ "_note": "arguments not available" }`（**不用空对象 `{}`**——空对象会让模型认为参数就是空的，加标记让模型知道参数信息丢失了）。`toolSpecificData` 是上游内部实现，不保证跨版本稳定——上游 rebase 时若字段变更则自然降级到带标记的 fallback，作为 smoke test checklist 项验证即可

**③ tool_result 截断**（U1-A 策略，纯文本两级 + 二进制检测）：
- 纯文本 `< MAX_INLINE_TOOL_RESULT_CHARS (4000)`：直接保留
- 纯文本 `>= 4000`：head-tail 截断（`TOOL_RESULT_HEAD_CHARS = 2500` + `TAIL_CHARS = 1000`，中间插入 `\n...(truncated)...\n`）
- 二进制/base64 检测（不论大小，优先于文本截断）：`output.type === 'data'` → mimeType 含 `image/audio/video` → data URI 前缀或长度>500 纯 base64 → 替换为占位说明（如 `[Binary data: image/png, 42KB]`）
- **base64 判定精度**：单纯 "全是 base64 字符且长度 >500" 不够严谨，JWT / hash / 长 hex 字符串都可能命中误伤。建议 regex 收紧为 `/^[A-Za-z0-9+/=]{500,}$/.test(content.trim())` **且** 不含换行/空白（`!/\s/.test(content)`）；**并且**优先用 `output.type === 'data'` + mimeType 做判定，把"纯字符串启发式"作为最后一道兜底，避免把长 JSON dump 误判为二进制

**④ thinking**：不进入历史回放（open-agent-sdk 策略一致）

**⑤ 取消语义与 A2 对齐**：`cancelled` response **不做整条跳过**。回放时保留已完成的 `tool_use + tool_result` 与其他已完成结构化 part；过滤 incomplete assistant 文本和 thinking。若某类 progress 无法可靠判定是否完整，则宁可降级为**仅保留工具块**，也不要把整条 response 丢弃。实现时以 A2 的 `lastCompleteTurnEnd` 契约为准：凡是已经完整落盘的工具往返，后续 replay 必须继续可见

**⑥ progressBridge**：无 `text_delta` 时允许回退渲染 assistant 文本

**⑦ DirectorCodeModelProvider**：保留图片、工具结果和结构化 part 的最小语义

**当前代码脱节点（执行前必须知道）**：

- `messageNormalization.ts` 当前几乎仍是**纯文本版 history 提取器**：
  - `historyToNormalizedMessages(history)` 只有一个参数
  - 只把 `markdownContent` / `text` 抽成 assistant 纯文本
  - 完全不保留 `tool_use` / `tool_result` / image / rich progress 结构
- `directorCodeAgent.ts` 目前**没有注入 `IChatService`**，因此拿不到 `request.sessionResource` 对应的完整 `entireResponse`
- `progressBridge.ts` 当前：
  - `assistant` 事件只渲染 thinking，不回退正文
  - `tool_result` 一律压成简短 `progressMessage`
  - 对 richer content 的保真几乎没有单独层次
- `directorCodeModelProvider.ts` 当前 `convertMessages()` 仍把 `IChatMessage` 直接压成纯文本 `NormalizedMessageParam[]`
- 现有测试主要覆盖的是：
  - 纯文本 history
  - thinking / text_delta / tool progress message
  - 但还没有把“rich history 回放”“取消后保留完整 tool 往返”“标准 Chat 最小保真 rich part”作为独立 checklist 一次收完

**B3 细化执行 checklist（文件级，按顺序执行）**：

1. **B3-0 先冻结“回放来源”和“回放保真边界”**
   - **先读文件**：`messageNormalization.ts`、`directorCodeAgent.ts`、`progressBridge.ts`、`directorCodeModelProvider.ts`
   - **先冻结两个来源**：
     - `history`：上游已过滤后的简化历史
     - `richResponses`：通过 `IChatService.getSession(request.sessionResource)` 拿到的完整 `entireResponse.value`
   - **先冻结一个边界**：
     - 这批只修**当前会话回放保真**，不做跨会话记忆
   - **完成标志**：后续所有步骤都围绕“`history + richResponses` 合成回放”展开，而不是继续从 `history` 单源硬挤 rich 信息

2. **B3-1 先改 `DirectorCodeAgent`，把完整 rich history 接进来**
   - **主要文件**：`directorCodeAgent.ts`
   - **要做的事**：
     - 注入 `IChatService`
     - 通过 `request.sessionResource` 取 session
     - 从 session requests 中提取 `entireResponse.value` 形成 `richResponses`
     - 若 `getSession()` 返回 `undefined`，显式走 fallback，不阻断对话
     - 若 cancelled response 的结构化 part 在 `getSession()` 中缺失，优先复用 A2 已提交消息快照形成 replay-only fallback；该 fallback **只**服务模型回放，不反向改 UI transcript
     - **落地约束**：该 replay-only fallback 所依赖的 snapshot 必须来自上述 session 级宿主，而不是直接复用上一轮 `AgentEngine` 的局部 `this.messages`；否则跨 request 时会名义存在、实际取不到
   - **循环依赖规避（v2.25 新增）**：`IChatService` → `ChatAgentService.invokeAgent` → `DirectorCodeAgent.invoke` 存在**潜在**循环依赖（构造 `DirectorCodeAgent` 时若立即注入 `IChatService`，而 `IChatService` 某些初始化路径又要查 registered agents）。**规避方案写死**：**不**在 `DirectorCodeAgent` 构造函数直接注入 `IChatService`；改为注入 `@IInstantiationService`，在 `invoke()` 运行时通过 `this.instaService.invokeFunction(accessor => accessor.get(IChatService))` **懒取**。此时 agent 注册早已完成，不会触发循环初始化。测试时可通过 mock `IInstantiationService` 直接返回 mock `IChatService`，测试可维护性不受影响
   - **这一阶段不要做**：修改 `messageNormalization.ts` 的具体重建逻辑
   - **完成标志**：`directorCodeAgent` 已有把 `history + richResponses` 一起传给 normalization 层的能力，且构造函数不触发 `IChatService` 构造链

3. **B3-2 重写 `messageNormalization.ts` 的接口，但保持纯函数**
   - **主要文件**：`messageNormalization.ts`
   - **要做的事**：
     - `historyToNormalizedMessages()` 扩成 `history + richResponses?`
     - 保持纯函数，不注入 service
     - 若 `history.length !== richResponses.length`，生产代码只 `console.warn` + 回退纯文本
   - **完成标志**：normalization 层已能接受 richer 输入，但没有把 service 依赖污染进去

4. **B3-3 先做最核心的 tool_use / tool_result 重建**
   - **主要文件**：`messageNormalization.ts`
   - **要做的事**：
     - 从 `richResponses` 中恢复 `tool_use`
     - 从 `toolSpecificData` / 已知字段中恢复最小可用 input
     - tool result 保留 `tool_use_id`、`tool_name`、`content`、`is_error`
     - 无法完整恢复时回退到 `{ "_note": "arguments not available" }`
   - **完成标志**：回放给模型的历史里首次真正包含结构化工具链，而不只是 assistant 文字总结

5. **B3-4 处理截断、二进制与 thinking 过滤**
   - **主要文件**：`messageNormalization.ts`
   - **要做的事**：
     - 大 `tool_result` 做 head-tail 截断
     - 二进制 / base64 结果转占位说明
     - thinking 不进入回放
     - cancelled / incomplete 的过滤语义与 A2 保持一致：保留完整 tool 往返，过滤 incomplete assistant/thinking
   - **完成标志**：历史回放既保留关键副作用信息，又不会把超长/二进制内容直接塞爆上下文

6. **B3-5 改 `progressBridge.ts`，把“流式优先、非流式补偿”的策略写实**
   - **主要文件**：`progressBridge.ts`
   - **要做的事**：
     - `assistant` 事件在无 `text_delta` 的非流式 fallback 下能补正文
     - `tool_result` 继续给 UI 可读摘要，但不要破坏 richer source data
     - 保持 thinking 与 text 的职责分离，避免重复渲染
   - **完成标志**：非流式路径下，用户仍能看到完整正文；流式路径下，不会因为 assistant fallback 再次重复文本

7. **B3-6 改 `directorCodeModelProvider.ts` 的最小 rich part 保真**
   - **主要文件**：`directorCodeModelProvider.ts`
   - **要做的事**：
     - `convertMessages()` 不再把所有 `IChatMessage` 无脑压成纯文本
     - 至少保留：
       - image
       - tool_result / tool context 的最小语义
       - 结构化 part 的可回放信息
     - 这里的目标不是完全复制 Agent history，而是让标准 Chat 也别“一律压平”
   - **完成标志**：标准 Chat 路径最少不会把图片和工具语义全部抹掉

8. **B3-7 先补测试，再做 smoke**
   - **至少更新/新增的测试文件**：
     - `messageNormalization.test.ts`
     - `progressBridge.test.ts`
     - `directorCodeModelProvider.test.ts`
     - 必要时补 `endToEnd.test.ts`
   - **必须覆盖的用例**：
     - `history + richResponses` 正常对齐
     - 长度不等时 warn + 退回纯文本
     - `tool_use` / `tool_result` 可重建
     - 参数恢复失败时 `_note` fallback
     - 大 `tool_result` 截断
     - 二进制结果占位
     - cancelled 只过滤 incomplete assistant/thinking，不过滤完整 tool 往返
     - cancelled response 若经 `getSession()` 回放，已完成 tool 往返仍可见；若上游缺失，则 fallback replay 路径生效
     - 非流式 assistant fallback 会补正文
   - **手动 smoke**：
     - 做一轮带工具调用的 Agent 对话，再追问一次，确认模型看得到前一轮工具结果
     - 走一次非流式 fallback，确认正文仍显示
     - 做一次取消后继续，确认不会重复执行已完成的副作用工具
   - **完成标志**：B3 的核心价值能被测试直接证明，而不是靠人工主观观察

9. **B3-8 完成后与 A2 / A5 收尾对账**
   - **重点回看文件**：`directorCodeAgent.ts`、`messageNormalization.ts`、`progressBridge.ts`、`directorCodeModelProvider.ts`
   - **要做的事**：
     - 确认 B3 没绕开 A2 的取消契约
     - 确认 B3 没把 A5 刚统一的标准 Chat 通路再次压回纯文本
     - 确认 UI 渲染层与模型回放层的“保真粒度”虽然不同，但语义不冲突
   - **完成标志**：B3 不再只是“补文本显示”，而是把“模型看到什么”和“用户看到什么”两条线都校正到合理边界

**验收标准**：
- 多轮对话中模型能看到之前的工具调用与结果
- 非流式 fallback 时用户仍能看到回答正文
- 取消后下一轮仍能看到已完成的工具结果，不会因为 replay 丢失而重复执行副作用工具

---

## 批次 C：P2 Provider 兼容、UI 配置、基础设施与构建收口

### C1. 收口 Provider 协议兼容性

**拆分**：C1a（不影响 C2，先做）+ C1b（与 C2 同步做）

**C1a**（Provider 独立修复，先做）：SSE 尾包 flush（`done` 路径增加尾 buffer flush）、Gemini error chunk 处理、Gemini function call ID 稳定化（当前 Gemini 返回的 function call 无稳定 ID，`geminiProvider` 需在流式解析时自行生成 `gemini-fc-{index}` 格式的合成 ID，确保 tool_use 和 tool_result 可正确配对）、SSE buffer 最大长度（`MAX_SSE_BUFFER_SIZE = 1MB`，超限截断 + warn，不终止流）、**OpenAI vision 补齐**（见下方，与 C1a 其他项同为 Provider 独立修复，无外部依赖）

**C1b**：`/v1` 路径归一化、`max_tokens`/`max_completion_tokens` 按模型系列切换、`stream_options.include_usage` 兼容开关

**`max_completion_tokens` 切换规则**：OpenAI reasoning/thinking 模型（`o1*`/`o3*`/`o4*`）使用 `max_completion_tokens` 字段，其余所有模型使用 `max_tokens`。在 `openaiProvider.ts` 的请求构建中根据 model ID 前缀判断（与 C4⑤ 模型白名单中 `o1*`/`o3*`/`o4*` 保持一致）。当前代码统一用 `max_tokens`，reasoning 模型可能因此报错

**`/v1` 归一化策略**：采用"智能跳过"——在 `abstractProvider.ts` 中实现 `protected buildUrl(baseURL: string, path: string): string` 方法，当 `path` 以 `/v1` 开头且 `baseURL` 已以 `/v1` 结尾时，自动去掉 `path` 中的 `/v1` 前缀，避免重复。其他情况原样拼接。这样普通用户填 `https://api.openai.com` 正常（Provider 补 `/v1`），高级用户填 `https://api.openai.com/v1` 也正常（不重复），填 `https://my-proxy.com/v2` 不被篡改。**适用范围**：仅 OpenAI 系 Provider（`openaiProvider`、`openai-compatible`）和 `anthropicProvider`/`anthropic-compatible` 调用此方法；`geminiProvider` 的 URL 格式为 `models/{model}:generateContent`，不经过 `/v1` 检查，子类直接拼接即可。**与 B2 的共享契约**：`ModelResolver` 的 `normalizedBaseURL` 必须复用同一 helper 或至少复用同一组测试向量；禁止 cache 归一化与真实请求拼接各自实现一套“看起来差不多”的规则

**OpenAI vision 补齐**（仅 OpenAI 缺失，~20-30 行）：
- `openaiProvider.ts` 的 `convertUserMessage()` 增加 `case 'image'` 分支
- 转为 `{ type: 'image_url', image_url: { url: 'data:...' } }`
- 检测到 image 时 content 从字符串改为数组格式
- 同时支持 URL 图片引用
- **能力边界**：默认只对 `openai` 的 default / API-key transport 暴露 vision；`authVariant = openai-codex` 不自动继承该能力，只有单独协议验证通过后才可在 metadata / picker 中宣称支持
- **openai-codex 路径上的 image block 处置（v2.26 补充）**：`convertUserMessage()` 需要读取当前 provider options 的 `authVariant`（通过构造函数注入或调用时传递）：
  - 若 `authVariant === 'openai-codex'` 且 message 中含 `image` block：**跳过该 image block 并在调试日志中 warn**（`console.warn('[OpenAI-Codex] vision input not verified, dropped image block')`），**不抛异常**——因为用户通常不会预期 Agent 对话因为图片被拒绝而崩溃
  - 若未来 codex 协议验证通过，删除这条 warn 分支，把 image block 正常编码
  - **UI 层辅助提示**：picker 中 `authVariant = openai-codex` 的模型在 metadata 上标 `capabilities.vision = false`（由 C4 `MODEL_CATALOG` 的 codex allowlist 定义决定），避免 chat UI 显示"支持视觉"而实际输入被丢弃

**Gemini tool_result → functionResponse** 保留原工具名

**涉及文件**：`providers/abstractProvider.ts`、`providers/openaiProvider.ts`、`providers/geminiProvider.ts`

**当前代码脱节点（执行前必须知道）**：

- `abstractProvider.ts` 目前**没有** `buildUrl()`，URL 拼接规则分散在各子类里，`/v1` 归一化无法统一落点
- `abstractProvider.ts` 的 `readSSELines()` 只按换行切分，没有：
  - 结束时尾 buffer flush
  - 最大 buffer 长度保护
  - 对 error/event 类型行的统一处理钩子
- `openaiProvider.ts` 当前：
  - 非流式/流式都硬编码 `max_tokens`，没有 `o1*`/`o3*`/`o4*` 的 `max_completion_tokens` 分支
  - **仅**流式路径 `createMessageStream()` 设置 `stream_options: { include_usage: true }`；非流式 `createMessage()` 不设置该字段（计划 C1b-2 的"硬开"描述仅针对流式路径）
  - `convertUserMessage()` 没有 image 分支
  - URL 直接 `${this.baseURL}/chat/completions`，`this.baseURL` 默认 `https://api.openai.com/v1`；没有统一 `/v1` 智能跳过，若用户填 `https://api.openai.com/v1` 会拼成 `/v1/v1/chat/completions`
- `geminiProvider.ts` 当前：
  - tool id 生成仍靠全局递增 `geminiCallCounter`，不稳定
  - SSE 解析没显式处理 `error` chunk
  - 流式 functionCall 的 id 不能保证与非流式 / tool_result 回放稳定对应
- 测试虽已覆盖不少基础行为，但还没有把这些协议边界作为独立 checklist 一次收完

**C1a 细化执行 checklist（Provider 独立修复，先做）**：

1. **C1a-0 先冻结“公共基座 vs 子类协议”的改动边界**
   - **先读文件**：`abstractProvider.ts`、`openaiProvider.ts`、`geminiProvider.ts`
   - **先冻结原则**：
     - 只要是“所有 SSE provider 共享的问题”，优先收口到 `abstractProvider.ts`
     - 只要是“某家协议自己的字段/路径/事件语义”，留在子类
   - **完成标志**：后续每项修改都能明确归类到“基座”或“子类”，不再来回搬逻辑

2. **C1a-1 先补 `abstractProvider.ts` 的 SSE 基座能力**
   - **主要文件**：`abstractProvider.ts`
   - **要做的事**：
     - `readSSELines()` 增加**尾 buffer flush**
     - 增加 `MAX_SSE_BUFFER_SIZE = 1MB` 防止服务端异常流把内存吃满
     - 超限时 `console.warn` 并做有界截断，不直接把整个 provider 流搞挂
     - 如需要，可加轻量 helper 区分 `data:` 与其他 SSE 行，但不要过度抽象
   - **完成标志**：所有基于 `readSSELines()` 的 provider 都自动获得尾包 flush 和 buffer 保护

3. **C1a-2 Gemini：先修 tool id 稳定性**
   - **主要文件**：`geminiProvider.ts`
   - **要做的事**：
     - 删除/废弃基于全局计数器的 `generateGeminiToolId()`
     - 改成与本次 response 内顺序绑定的稳定 id（如计划里已定的 `gemini-fc-{index}`）
     - 流式与非流式都使用同一套 id 生成规则
   - **完成标志**：同一 response 内，tool_use 与 tool_result 可以稳定配对，不因全局计数器而漂移

4. **C1a-3 Gemini：补 error chunk 与 finish reason 边界**
   - **主要文件**：`geminiProvider.ts`
   - **要做的事**：
     - 流式 `parseGeminiSSEStream()` 看到 `chunk.error` 时，显式抛结构化错误，不再静默当作空 chunk 跳过
     - finish reason 继续保留 provider-specific map，但 error 不得落成“空成功”
   - **完成标志**：Gemini 流式失败时，上层看到的是明确错误，而不是看似正常结束的空回复

5. **C1a-4 OpenAI：补 vision 输入转换**
   - **主要文件**：`openaiProvider.ts`、**同步核对** `modelCatalog.ts`
   - **要做的事**：
     - `convertUserMessage()` 增加 `image` 分支
     - 文本-only 时仍走字符串 content
     - 一旦混入 image，切到数组 content，生成 OpenAI 兼容的 `image_url`
     - 同时支持 data URL 与外部 URL 两类输入
     - **modelCatalog 同步对齐（v2.27 新增）**：`modelCatalog.ts` 中 OpenAI default transport 的 vision-capable 模型（至少 `gpt-4o` / `gpt-4o-mini` / `gpt-4-turbo`）必须在 metadata 中显式标 `capabilities: { vision: true }`；否则 picker UI 不会向用户暴露"支持视觉"，Provider 侧虽能发图但用户不会用
     - 只改 OpenAI default transport；`openai-codex`（authVariant）保持 `vision: false`，与 C1 正文"openai-codex image block 处置 = drop + warn" 一致
   - **完成标志**：带图片的请求不再在 OpenAI 路径上被静默降级成纯文本；picker UI 上 vision-capable 模型有明确能力标识

6. **C1a-5 OpenAI/Gemini：把新增边界补到现有测试文件，而不是另开散测试**
   - **主要文件**：`openaiProvider.test.ts`、`geminiProvider.test.ts`、必要时 `abstractProvider.test.ts`
   - **必须覆盖的用例**：
     - SSE 尾 buffer flush
     - SSE buffer 超限保护
     - Gemini error chunk 抛错
     - Gemini function call id 稳定
     - OpenAI image 输入转换
   - **完成标志**：`C1a` 结束时，相关风险都能在现有 provider test 套件里看到回归保护

**C1b 细化执行 checklist（协议兼容与请求字段，和 C2 同步做）**：

1. **C1b-0 先把 URL 规则收口到基座，不要在子类里零散判断**
   - **主要文件**：`abstractProvider.ts`
   - **要做的事**：
     - 新增 `buildUrl(baseURL, path)` helper
     - 支持 `/v1` 智能跳过
     - 仅供 OpenAI/Anthropic 系 provider 调用；Gemini 继续自己拼
   - **完成标志**：URL 归一化逻辑只有一份，不再散落在 `apiKeyService.testConnection()` / `openaiProvider.ts` / 未来兼容 provider 里各写一遍

2. **C1b-1 OpenAI：切分 `max_tokens` 与 `max_completion_tokens`**
   - **主要文件**：`openaiProvider.ts`
   - **要做的事**：
     - 根据 model id 前缀识别 `o1*` / `o3*` / `o4*`
     - reasoning 系列发 `max_completion_tokens`
     - 其他模型继续发 `max_tokens`
   - **完成标志**：reasoning 模型不再因为字段不兼容而请求报错

3. **C1b-2 OpenAI：`stream_options.include_usage` 改为兼容开关，不再永远硬开**
   - **主要文件**：`openaiProvider.ts`
   - **要做的事**：
     - 给请求构建增加兼容开关/降级策略
     - 如果 provider / 代理不支持 `include_usage`，应能回退而不是整条流失败
    - **回退边界**：仅当首个 HTTP 响应阶段明确返回“不支持 `include_usage`”且尚未产出任何 chunk 时，才允许去掉 `include_usage` 重试一次；一旦已经产出流式 chunk，不得再做第二次请求
    - 将“不支持 `include_usage`”按 `provider + normalizedBaseURL + authVariant` 缓存，避免每次先失败再重试
     - 不要在 C1b 里过度设计成全局设置；先以最小兼容为目标
   - **完成标志**：OpenAI-compatible 代理遇到 `stream_options` 不支持时，流式请求仍可工作

4. **C1b-3 `apiKeyService.testConnection()` 与 Provider URL 规则对齐**
   - **主要文件**：`apiKeyService.ts`（尽管不在 C1 标题文件列表里，但这里必须联动）
   - **要做的事**：
     - `_testOpenAI` / 相邻 URL 拼接逻辑与 `buildUrl()` 对齐
     - 避免 Provider 修好了 `/v1`，测试连接还保留旧逻辑再次分叉
   - **完成标志**：同一个 baseURL，在真实请求与 Test Connection 下得到一致结果

5. **C1b-4 测试与 smoke**
   - **至少更新/新增的测试文件**：
     - `openaiProvider.test.ts`
     - `abstractProvider.test.ts`
     - `apiKeyService.test.ts`（URL 归一化联动）
   - **必须覆盖的用例**：
     - `https://api.openai.com` / `https://api.openai.com/v1` 不重复 `/v1`
     - reasoning 模型发 `max_completion_tokens`
     - 普通模型继续发 `max_tokens`
     - `stream_options.include_usage` 不支持时可回退
     - Test Connection 与真实 provider URL 规则一致
   - **手动 smoke**：
     - OpenAI 原生 baseURL 一次
     - OpenAI 原生 `/v1` 结尾 baseURL 一次
     - OpenAI-compatible 代理一次
     - Gemini 流式错误一次
   - **完成标志**：C1b 结束时，不再出现“Provider 能调，Test Connection 不能调”或“原生能调，代理不能调”的协议分叉问题

6. **C1-收尾对账**
   - **重点回看文件**：`abstractProvider.ts`、`openaiProvider.ts`、`geminiProvider.ts`、`apiKeyService.ts`
   - **要做的事**：
     - 确认 C1a 的基座修复没有被 C1b 再次绕开
     - 确认新增 helper 没把 Gemini 这类非 `/v1` provider 硬套进 OpenAI/Anthropic 规则
     - 确认 B1 的 auth contract 改造后，C1 里的 header/URL 改法仍成立
   - **完成标志**：Provider 协议层形成一套稳定边界，后续 C2/C4 只消费，不再反向修协议问题

**验收标准**：
- 流式错误不被伪装成空成功
- Gemini `error chunk` 显式抛错，`gemini-fc-{index}` 在流式 / 非流式路径保持稳定一致
- OpenAI image 输入不再静默降为纯文本
- OpenAI / Anthropic 系 `/v1` 归一化不重复拼接
- `o1*` / `o3*` / `o4*` 使用 `max_completion_tokens`，其余模型继续使用 `max_tokens`
- `stream_options.include_usage` 仅允许在首包前做一次兼容回退，并按 `provider + normalizedBaseURL + authVariant` 缓存结果
- SSE 尾 buffer flush 与 1MB buffer 保护生效
- 三家 Provider 行为边界清晰

---

### C2. 收口 API Key、事件契约与设置页行为

**涉及文件**：`apiKeyService.ts`、`apiKeysWidget.ts`、`providerSettingsWidget.ts`、`directorCodeSettingsEditor.ts`

**前置依赖**：`C2` 不在 OAuth service 仍未接入 DI / Workbench 时先做“假 UI”。至少要求 `B1` 已完成 **auth 契约**、`IOAuthService` 注册、以及最小可用的 OAuth widget/controller / flow contract；否则只会产生再次返工的占位层。**补充闸门**：`C2-4/C2-6/C2-8` 中 `openai` 的用户可见 UI / 状态集成必须晚于 `B1-5/B1-6` 已冻结 transport / `authVariant`；在此之前，`C2` 只允许推进 editor 壳、Anthropic 路径、API key 区域和通用刷新链。

**修复项**：
- `onDidChangeApiKey` payload 结构化
- `MODEL_CONFIG_PREFIX` 变更进入通知链
- `getProviderAuthMethod()` 当前是**无注入能力且全仓未消费**的纯函数，不能继续承载运行时 auth 判定。本轮**直接删除该 helper**，改为新建独立的 **`IAuthStateService`**（v2.26 决策 4）：
  - **文件路径（写死）**：`vscode/src/vs/workbench/contrib/chat/common/agentEngine/authStateService.ts`
  - **职责单一**：给定 `(provider, model?)` 返回 resolved auth state `{ source: 'oauth' | 'per-model-key' | 'provider-key' | 'missing', authVariant: string, identityKey?: string, ...metadata }`
  - **内部聚合**：同时读 `IApiKeyService` + `IOAuthService`，按 `OAuth active → per-model key → provider-level key → missing` 的固定优先级输出
  - **消费侧**：`C2` 的 `ApiKeysWidget` / `OAuthWidget` / `StatusBar` / `ProviderSettingsWidget` **统一读这个 service**，不再各自推断；`B2` `ModelResolver` 若需要 auth 维度，也经此 service 取 `identityKey` / `authVariant`，不直接读 OAuth 内部状态
  - **事件**：`onDidChangeAuthState(provider)` 统一对外发事件；内部订阅 `IApiKeyService.onDidChangeApiKey` 和 `IOAuthService.onDidChangeAuth` 合并输出
  - **禁止**扩展 `IApiKeyService` 来承担 OAuth 语义（会让 service 名字与职责脱节）；**禁止**让 `IOAuthService` 兼任 auth facade（职责混杂且 API key 场景绕远）
  - **注册**：已在 B1-8 中注册 `registerSingleton(IAuthStateService, AuthStateService, InstantiationType.Delayed)`（`agentEngine.contribution.ts`），C2 不重复注册，直接注入消费
- `directorCodeSettingsEditor.ts` 当前 `Subscription & Login / Coming Soon` 占位必须替换为 **Hermes-style provider-specific OAuth 区域**：仅 `anthropic/openai` 显示 Login / Logout / 状态；`anthropic` 展示打开授权页 + 粘贴 code 提交交互；`openai` 区块标题/按钮文案固定为 **`OpenAI (ChatGPT/Codex OAuth)`**，并展示 device-code 的 `verification_url + user_code + polling` 交互；**不新增** 面向终端用户的通用 `clientId` 输入框
- UI 具体交互直接参考 `E:\Projects\sub-projects\hermes-agent\web\src\components\OAuthLoginModal.tsx`；后端返回字段直接参考 `E:\Projects\sub-projects\hermes-agent\hermes_cli\web_server.py` 的 `/api/providers/oauth*` 系列接口，避免自己重新发明 payload 形状
- **参考依赖说明（新增）**：上述 Hermes 路径仅作示例参考，不是执行前置。若本机不存在对应仓库，直接以 B1 已冻结的 `flowKind`、payload 形状和 phase 状态机为准，不阻塞 C2
- **“API Key 测试” 与 “OAuth 状态检查” 分离**：`testConnection()` 继续只服务 API key 路径（`TEST_CONNECTION_TIMEOUT_MS = 15000`，使用 provider-specific model/baseURL）；OAuth 不要复用这个接口去“拿 token 当 apiKey 硬测”。OAuth 区域改为 `Check login` / `Refresh status` / 自动状态刷新，数据源来自 `IOAuthService.getStatus()` / `onDidChangeAuth`
- UI 刷新链要同时监听 `onDidChangeApiKey` 与 `IOAuthService.onDidChangeAuth`；不能只靠 API key 事件驱动，否则 OAuth 登录/登出后 Settings 状态会停留旧值
- Settings 状态识别 per-model key：在 **provider + authVariant + model** 粒度合成三源状态（配置源 / API key 源 / OAuth 源）。**写死统一顺序**：**OAuth active** → **per-model key configured** → **provider-level key configured** → **missing**；状态栏、API key 区域和 OAuth 区域必须共享这套判定，不允许各自猜测。对 `openai` 至少要通过共享 resolved-auth view model 区分 `default` 与 `openai-codex`，不能只按 provider slug 合并状态
- **与 B1 的范围约束保持一致**：Settings 本轮不新增“API key / OAuth 手动切换器”。同一 provider 只呈现当前 resolved-auth 主路径；若 `openai` 需要从 OAuth/codex 切回 API-key 路径，以 logout / disable OAuth 为切换手势
- **API-key-only 控件的生效边界（v2.25 决策 3 写死）**：当 `openai` 当前 resolved auth 为 OAuth / `authVariant = openai-codex` 时，`baseURL` 输入框、API key `Test Connection` 按钮、以及只对 API-key transport 生效的提示项**统一采用"只读 + 灰显 + 说明态"呈现**：
  - DOM 侧：`input[readonly] + disabled`，CSS `opacity: 0.6` + `cursor: not-allowed`
  - 控件下方追加说明文字：`"当前由 OpenAI OAuth (ChatGPT/Codex OAuth) 接管，此项仅在 API-key 模式下生效。如需切回 API-key，请在上方 OAuth 区域 Logout。"`
  - **不采用**完全 hide（display:none）——因为切回 API key 时需要用户能看到这些字段存在；也**不采用**默认折叠 details——保持可见性便于用户理解当前状态
  - **同一原则推广到其他 authVariant**：未来若 Anthropic 等 provider 也出现"OAuth vs API key 双路径"场景，沿用同一呈现策略，不为每个 provider 发明新交互
- `anthropic-compatible` 空模型不静默写空字符串
- 配置写入改为 async + 防抖（`debounceDelay = 500ms`）。**Test Connection 交互**：点击 Test Connection 时，先 `await` 强制刷新待写入的 pending 配置（`flushPendingWrites()`），再用最新配置发起测试，避免防抖延迟导致测试使用旧配置
- **文案边界补充**：顶层 provider slug 仍是 `openai`；API key 区域/Provider 配置区可继续显示 `OpenAI (GPT-4, o3)` 这类能力导向文案，而 OAuth 区域固定使用 `OpenAI (ChatGPT/Codex OAuth)`，两者都指向同一个 provider，但代表**不同认证入口**

**Model picker UX 呈现（v2.27 决策 3 拍板）**：

Model picker（standard Chat 与 Agent 共用）在涉及 OpenAI 时**显示为两组条目**，用户显式选择一组：

| picker 分组 | 底层 authVariant | 模型 allowlist 来源 |
|------|------|------|
| `OpenAI` | `default` | `api.openai.com/v1/models` / `MODEL_CATALOG` openai-default |
| `OpenAI (ChatGPT/Codex OAuth)` | `openai-codex` | `MODEL_CATALOG` openai-codex allowlist（静态） |

- **实现要求**：
  - `directorCodeModelProvider.provideLanguageModelChatInfo()` 返回的 `ILanguageModelChatMetadata[]` 中，OpenAI 系模型按 `authVariant` 分组，每组模型的 `family` 字段前缀加上所属分组标识（如 `openai` / `openai-codex`），UI 层按该字段分组渲染
  - 用户点击选择某组模型时，若对应 `authVariant` 尚未登录/配置，picker 直接弹出引导（未登录 OAuth 则打开登录 UI；未配置 API key 则打开 Settings）
  - **避免 UX 陷阱**：不要让用户通过"登录 OAuth 后自动切换 picker 显示"这种方式——用户不知道自己看到的是哪条通道；必须显式分组
- **AuthStateService 输出对齐（v2.28 决策 Q3 写死）**：`authStateService.resolveAuth(provider, model, authVariant)` 的 `authVariant` 参数为**必填**（required），**不是** optional。由于同一模型 ID（如 `gpt-4o`）可能在两种 authVariant 下都存在（default 肯定有，codex 未来可能有），调用方**必须**显式传 `authVariant`，让 TypeScript 在漏传时编译报错，避免默默走错通道（API-key vs OAuth/codex）的运行时 bug：
  - 接口定义：`resolveAuth(provider: ProviderName, model: string, authVariant: AuthVariantName): Promise<IResolvedAuthState>`
  - **`AuthVariantName` 类型定义**：集中在 `providerTypes.ts`（与 B1-0 冻结的"单一共享导出源"约束一致），至少包含 `'default'` 与 `'openai-codex'`，未来扩 delegated/external 时加枚举项
  - **调用约定**：
    - `DirectorCodeAgent.invoke()` / `DirectorCodeModelProvider.sendChatRequest()` 从 `directorCode.ai.authVariant` 配置项或 picker 选中模型的 `authVariant` 元数据读取后传入
    - `DirectorCodeModelProvider.provideLanguageModelChatInfo()` 返回的模型元数据中每条都带 `authVariant`，UI 层用它分组 picker
    - 对**非 OpenAI provider**（anthropic / gemini / 等），调用方仍必须传 `authVariant`，固定传 `'default'`
  - **默认值策略**：**不**在 `resolveAuth` 内部 default 参数值；所有调用点必须显式传。理由：optional + 默认 fallback 只是把漏传风险从编译期推到运行期，与本决策"用 TS 编译报错防漏传"目标冲突
  - **迁移策略**：B1-1 破坏性改动联动清单里补这条：所有 `resolveProviderOptions(provider, model, baseURL?)` 调用点切到 `authStateService.resolveAuth(provider, model, authVariant)` 时**同步补齐 `authVariant` 入参**；B1-8 的 grep 验收标准扩展为"`rg \"resolveAuth\\(\" vscode/src/` 所有命中行都必须至少 3 个参数"
- **配置 persistence**：用户选择 OpenAI (ChatGPT/Codex OAuth) 模型后，`directorCode.ai.provider` 仍为 `openai`，但 `directorCode.ai.authVariant` 新增字段保存 `'openai-codex'`；下次打开 picker 时默认选中上次的分组
- **`directorCode.ai.authVariant` schema 注册位置（写死）**：与 `directorCode.ai.compactModel` 同理，`directorCode.ai.authVariant` 的 `configurationRegistry.registerConfiguration(...)` **必须**加到 `agentEngine.contribution.ts` 已有的 configuration 块中（不新建 contribution 文件）。Schema 定义：`type: 'string'`、`default: 'default'`、`enum: ['default', 'openai-codex']`（后续扩 delegated 时加枚举项）、`description` 字段说明仅影响 OpenAI provider 的认证通道选择。**注册时机归 B1-3**（与 `IOAuthService` 注册同步），C2 消费

**当前代码脱节点（执行前必须知道）**：

- `apiKeysWidget.ts` 目前只认识“所有 provider 都是 API key 行”，没有 OAuth provider-specific 状态/按钮
- `apiKeysWidget.ts` 当前 `render()` 只看 `hasApiKey()`；`handleTest()` 只会走 `testConnection(apiKey, baseURL, model)`
- `providerSettingsWidget.ts` 目前是同步 `change -> updateValue()` 模式，没有防抖、没有 flush、也没有与 OAuth 状态联动
- `directorCodeSettingsEditor.ts` 里 OAuth 区域仍是 `Coming Soon` 占位，且当前 status bar 只显示 `Provider / Model / API Key`
- `DirectorCodeStatusBar` 当前只订阅 `onDidChangeApiKey`，不会因 OAuth 登录/登出而刷新
- 当前代码里还**没有** `TEST_CONNECTION_TIMEOUT_MS = 15000` 的实现或等价超时封装；这一条是 `C2` 要补的目标态，不是仓内已存在事实
- 当前测试虽然已有 `apiKeysWidget.test.ts` / `providerSettingsWidget.test.ts` / `apiKeyService.test.ts`，但**没有**针对 OAuth 区域、状态刷新链、配置防抖/flush 的完整覆盖

**C2 细化执行 checklist（文件级，按顺序执行）**：

1. **C2-0 先冻结 Settings 的状态模型与事件源**
   - **先读文件**：`apiKeyService.ts`、`apiKeysWidget.ts`、`providerSettingsWidget.ts`、`directorCodeSettingsEditor.ts`
   - **先冻结三个状态源**：
     - 配置源：`IConfigurationService`
     - API key 源：`IApiKeyService`
     - OAuth 源：`IOAuthService`
   - **消费 `IAuthStateService`（v2.26 决策 4，由 B1-8 创建）**：C2-0 一并冻结 C2 对 `IAuthStateService` 的消费契约。**`IAuthStateService` 的文件创建、接口定义与 `registerSingleton` 归 B1-8 负责**，C2 不重复新建
     - `IAuthStateService` 是上述三个状态源的**聚合层**，C2 所有 widget 统一只读它，不绕到底层 service
     - 输出形状固定为 `{ source: 'oauth' | 'per-model-key' | 'provider-key' | 'missing', authVariant, identityKey?, metadata? }`
     - widget 刷新逻辑统一问"当前 resolved source 是什么"，不再直接问"有没有 API key" / "OAuth 登录了吗"
   - **先冻结一个原则**：
     - UI 不自己推断“当前是 OAuth 还是 API key”，统一由 `IAuthStateService` 给答案
     - 对 `openai` 必须通过 `IAuthStateService` 的 `authVariant` 字段区分 `default` 与 `openai-codex`
   - **完成标志**：后续 checklist 每一步都围绕这三类状态源 + `IAuthStateService` 展开，不再把"刷新 UI"写成泛泛描述

2. **C2-1 先补 `IApiKeyService` / 相邻 service 的状态契约**
   - **主要文件**：`apiKeyService.ts`
   - **要做的事**：
     - `onDidChangeApiKey` payload 从裸字符串升级为结构化事件（至少含 provider、scope/provider-or-model、changeKind）
     - `MODEL_CONFIG_PREFIX` 变更进入通知链，不能只有 key CRUD 才发事件
     - 明确 `testConnection()` 只服务 API key 路径，不承接 OAuth 健康检查
   - **完成标志**：Widget 层不再需要靠猜 key 名来决定刷新哪一块 UI

3. **C2-2 先把配置写入链改成“防抖 + 可 flush”**
   - **主要文件**：`providerSettingsWidget.ts`
   - **要做的事**：
     - 抽出统一的 pending write 队列
     - 所有 `change -> updateValue()` 改为防抖写入（`debounceDelay = 500ms`）
     - 新增 `flushPendingWrites()` 或等价方法，供 Test Connection / OAuth 操作前显式等待
     - 兼容 provider/model/baseURL/maxTurns/maxTokens/maxInputTokens
     - **职责边界（写死）**：`flushPendingWrites()` 由 `DirectorCodeSettingsEditor` 作为唯一 orchestrator 暴露并调度；`ApiKeysWidget` / OAuth widget 不直接触碰 `ProviderSettingsWidget` 私有队列，只通过 editor 级协调层请求 flush
     - **取消/关闭交互（写死）**：`editor.dispose()` 或 editor 被关闭时，pending write 必须**强制 flush**一次再释放（保证用户最后输入的内容不丢），而不是直接丢弃。Test Connection 进行中被用户取消时，**pending write 继续 flush**（用户输入视为"意图保存"），但测试结果丢弃，避免下次打开 Settings 看到未保存的旧值
   - **这一阶段不要做**：OAuth UI 组件
   - **完成标志**：配置写入不再是“每次 change 直接打 configService”，且外部可以显式 flush

4. **C2-3 重构 `ApiKeysWidget`，把“API key 区域”收窄为 API key 专属**
   - **主要文件**：`apiKeysWidget.ts`
   - **要做的事**：
     - 保留 API key 的 Save / Test / Delete，但明确它只负责 API key provider 行为
     - provider-specific 状态行要能显示“当前 provider 已由 OAuth 接管”或“OAuth 优先于 API key”
     - `handleTest()` 前先 `flushPendingWrites()`，再读取最新 config
     - per-model key / provider-level key 状态不要再只显示一个笼统的 `Configured`
   - **完成标志**：API key 区域不再误导用户认为“OpenAI (ChatGPT/Codex OAuth)”也要在这里填 key

5. **C2-4 把 OAuth 区域从 editor 占位抽成独立 widget**
   - **主要文件**：`directorCodeSettingsEditor.ts`，必要时新建 `oauthWidget.ts` / 相邻文件
   - **参考实现**：`E:\Projects\sub-projects\hermes-agent\web\src\components\OAuthLoginModal.tsx`
   - **要做的事**：
     - 不要继续把 OAuth UI 写成 editor 里的几行占位 DOM
     - 抽成独立 widget / controller，承接 `starting / awaiting_user / submitting / polling / approved / error`
     - `anthropic`：打开授权页、粘贴 code、提交
    - `openai`：显示 `OpenAI (ChatGPT/Codex OAuth)`、`user_code`、`verification_url`、轮询状态；**仅在** `B1-5/B1-6` 已冻结 transport / `authVariant` 后接线
     - **职责边界**：优先复用 `B1-7` 已产出的 OAuth widget/controller 与状态机；`C2-4` 负责把它挂进 editor、接线刷新链、补 UI 壳，不要二次发明同一套 phase 状态机
   - **完成标志**：OAuth 区域可独立刷新/测试/销毁，不再把所有逻辑堆在 `createEditor()`

6. **C2-5 重写 Status Bar / Summary，不再只会显示 API key**
   - **主要文件**：`directorCodeSettingsEditor.ts`（`DirectorCodeStatusBar`）
   - **要做的事**：
     - 状态栏从 `Provider / Model / API Key` 升级为至少能表达：
       - 当前 provider
       - 当前 model
       - Auth method（API key / OAuth / Missing）
       - Ready / Needs config / Logged in
     - 订阅 `onDidChangeApiKey` 与 `onDidChangeAuth`
     - 对 OpenAI OAuth 文案使用固定名称 `OpenAI (ChatGPT/Codex OAuth)`
   - **完成标志**：用户登录 OAuth 后，不会看到状态栏还显示 `API Key: Not set` 这种假失败状态

7. **C2-6 把 provider settings、API key 区域、OAuth 区域接成统一刷新链**
   - **主要文件**：`directorCodeSettingsEditor.ts`、`providerSettingsWidget.ts`、`apiKeysWidget.ts`
   - **要做的事**：
     - 编辑器创建时统一接线三类部件的事件
     - provider/model/baseURL 变更后，OAuth 区域、API key 区域、状态栏都能重新评估
     - 登录/登出 OAuth 后，API key 区域和状态栏也会同步刷新
   - **完成标志**：不刷新窗口的情况下，所有部件状态保持一致

8. **C2-7 特殊 provider 行为单独收口**
   - **主要文件**：`providerSettingsWidget.ts`、`apiKeysWidget.ts`
   - **要做的事**：
     - `anthropic-compatible` 空模型不静默写空字符串
     - compatible provider 的 custom model/baseURL 提示继续保留
     - `anthropic/openai` 有 OAuth 时，优先级文案要说清：OAuth 优先于 API key
     - `openai` 当前若由 OAuth 接管，`baseURL` / API key `Test Connection` / 仅 API-key transport 生效的说明项必须进入只读或显式标注态；除非用户 logout / disable OAuth，否则这些值不得在 UI 上被展示成“当前生效配置”
     - `gemini` / compatible providers 不显示 OAuth 入口
   - **完成标志**：同一页里不同 provider 的交互不会互相误导

9. **C2-8 测试先补足，再 smoke**
   - **至少更新/新增的测试文件**：
     - `apiKeyService.test.ts`
     - `apiKeysWidget.test.ts`
     - `providerSettingsWidget.test.ts`
     - 如需新增：`directorCodeSettingsEditor.test.ts` / `oauthWidget.test.ts`
   - **必须覆盖的用例**：
     - `onDidChangeApiKey` 结构化 payload
     - `MODEL_CONFIG_PREFIX` 变更能触发 UI 刷新
     - 防抖写入 + `flushPendingWrites()`
     - Test Connection 总是使用最新配置
     - OAuth 登录/登出后 status bar 与 widget 自动刷新
     - `anthropic/openai` 显示 OAuth 区域，其他 provider 不显示
     - `OpenAI (ChatGPT/Codex OAuth)` 文案不会退化成 `OpenAI`
     - 同一 `openai` provider 下 API key 路径与 `authVariant = openai-codex` 的 Settings 状态不串台
     - OpenAI OAuth 激活时，API-key-only 控件显示为非当前生效/只读说明态，不把 `baseURL` 等值误展示成 Codex OAuth 的运行态
   - **手动 smoke**：
     - 改 provider/model/baseURL，状态栏立即变化
     - 保存 API key -> 测试连接 -> 删除 API key
     - Anthropic 登录一次 / 登出一次
     - OpenAI device-code 登录一次 / 登出一次
     - 登录后不刷新窗口，Settings 状态正确
   - **完成标志**：Settings 不再是“看起来可配但状态不可信”的页面

10. **C2-9 与 B1 / A5 收尾对账**
   - **重点回看文件**：`directorCodeSettingsEditor.ts`、`directorCodeModelProvider.ts`、`apiKeyService.ts`
   - **要做的事**：
     - 确认 C2 没绕开 B1 的 OAuth 状态机
     - 确认 C2 没绕开 A5 的标准 Chat 统一口径
     - 确认 UI 文案、状态、真实请求三者一致
   - **完成标志**：用户在 Settings 页面看到的状态，和标准 Chat / Agent 真正会用到的配置是一致的

**验收标准**：
- UI 不再误报"未配置"
- Test Connection 不卡死、不产生假结果
- 仅 `anthropic`/`openai` 展示 OAuth 入口
- Settings 不再停留在 `Coming Soon` 占位，OAuth 入口与状态真实可用
- OAuth 登录/登出后无需刷新窗口，Settings 状态可自动更新

---

### C3. 收口资源生命周期与基础设施边缘路径

**涉及文件**：`directorCodeModelProvider.ts`、`chatAgents.ts`（上游，极小改动；**实际路径在 `vscode/src/vs/workbench/contrib/chat/common/participants/chatAgents.ts`**，不在 `common/` 根下）、`mcpAddContextContribution.ts`（上游，一行）、`mcpLanguageModelToolContribution.ts`（上游，catch 修改；实际路径在 `mcp/common/`）

- `DirectorCodeModelProvider` 继承 `Disposable`，取消监听和 emitter 纳入 dispose 链
- `registerDynamicAgent()` 重复 ID 防护：若 `_dynamicAgents.has(id)`，先 `dispose()` 旧注册再注册新实例（**不 throw**——支持热重载场景）。`dispose()` 内部从 `_dynamicAgents` 删除 entry 并调用注册时返回的 `IDisposable.dispose()`
- `McpAddContextContribution` 正确订阅 capability 变化
- `resource_link` 图片读取失败返回显式错误/占位文本，**不**再 fallback 成 linked resource 或空成功

**当前代码脱节点（执行前必须知道）**：

- `directorCodeModelProvider.ts` 当前**没有继承 `Disposable`**，但构造函数里已注册配置监听；后续若再加 `onDidChangeAuth` / `onDidChangeModels`，泄漏风险会继续扩大
- `chatAgents.ts` 的 `registerDynamicAgent()` 当前没有“重复 ID 先 dispose 旧实例”的热重载保护，重复注册的语义依赖现有 map 状态，后续很容易在开发/恢复场景里踩到
- `mcpAddContextContribution.ts` 当前通过 `derived + autorun` 读 capability，主逻辑不复杂，但这条链是“有没有资源能力”的入口，一旦监听边界错了，MCP Resource picker 会出现显隐错乱
- `mcpLanguageModelToolContribution.ts` 当前 `resource_link` 走图片 inline 时，`readFile(...).catch(() => VSBuffer.alloc(0))` 会把失败静默吞成**空图片数据**，对模型和 UI 都是弱信号，排查困难
- `mcpLanguageModelToolContribution.ts` 的实际路径在 `vscode/src/vs/workbench/contrib/mcp/common/`，不是 browser；后续执行时不要找错文件

**C3 细化执行 checklist（文件级，按顺序执行）**：

1. **C3-0 先冻结“生命周期归属”**
   - **先读文件**：`directorCodeModelProvider.ts`、`chatAgents.ts`、`mcpAddContextContribution.ts`、`mcpLanguageModelToolContribution.ts`
   - **先冻结四类归属**：
     - provider 自身 listener/emitter 生命周期
     - dynamic agent 注册生命周期
     - MCP capability 显隐生命周期
     - `resource_link` 文件读取失败语义
   - **完成标志**：后续每项修改都能明确回答“这个对象由谁 dispose / 失败时该向谁暴露”

2. **C3-1 先把 `DirectorCodeModelProvider` 收进 `Disposable` 链**
   - **主要文件**：`directorCodeModelProvider.ts`
   - **要做的事**：
     - 让类继承 `Disposable`
     - 把现有配置监听纳入 `_register(...)`
     - 后续 B1/B2/A5 新增的 `onDidChangeAuth` / `onDidChangeModels` / `onDidChangeApiKey` 一并纳入 dispose 链
     - 如需要，给内部 emitter 明确释放顺序
   - **完成标志**：`DirectorCodeModelProvider` 生命周期收口后，不再靠“窗口关掉了自然一起回收”的隐含假设

3. **C3-2 给 `registerDynamicAgent()` 增加重复 ID 热重载保护**
   - **主要文件**：`chatAgents.ts`
   - **要做的事**：
     - `registerDynamicAgent()` 遇到已存在 id 时，先 dispose 旧实例再注册新实例
     - `dispose()` 要确保同时移除 map entry 与注册副作用
     - 不要直接 throw，保留开发态/热重载友好性
   - **完成标志**：同 id 反复注册时，最终只保留一个有效实例，且不会误删最新实例

4. **C3-3 MCP Resource picker 的 capability 订阅链做一次“显隐正确性”收口**
   - **主要文件**：`mcpAddContextContribution.ts`
   - **要做的事**：
     - 确认 capability 从 `undefined -> known`、`known -> disabled`、多 server 混合状态三条路径都能正确更新 picker 显隐
     - 保留现有 `derived + autorun` 模式即可，除非证据显示它漏更新
     - 如只需一行改动，保持最小侵入
   - **完成标志**：MCP resource picker 不会因为 capability 变化而残留错误状态

5. **C3-4 `resource_link` 图片失败语义从“空数据”改成“显式失败/占位”**
   - **主要文件**：`mcpLanguageModelToolContribution.ts`
   - **要做的事**：
     - 不再在图片 `resource_link` 读取失败时直接塞 `VSBuffer.alloc(0)`
    - **本轮写死策略**：返回显式错误/占位文本给模型和 UI，**不**再 fallback 成 linked resource；优先保证“不假成功”，而不是弱降级继续工作
     - 保持 text/resource 正常路径不受影响
   - **完成标志**：资源读取失败时，不再制造“看起来成功但内容为空”的假阳性

6. **C3-5 先补测试，再做手动 smoke**
   - **至少更新/新增的测试文件**：
     - 若已有对应测试，优先扩现有 test；否则补最小新测试
     - 涉及 `chatAgents.ts` / `mcpAddContextContribution.ts` / `mcpLanguageModelToolContribution.ts` 的相邻测试文件
   - **必须覆盖的用例**：
     - `registerDynamicAgent()` 重复 ID 时 dispose-old-then-register
     - `DirectorCodeModelProvider` dispose 后不再响应后续事件
     - MCP capability 变化导致 picker 显隐正确更新
     - `resource_link` 图片读取失败不会返回空成功
   - **手动 smoke**：
     - 反复打开/关闭 Settings 或重建 provider 场景，确认无明显重复触发
     - 模拟动态 agent 重注册一次
     - 触发一个缺失图片资源的 `resource_link`
   - **完成标志**：生命周期问题可重复验证，而不是只能靠长期运行“感觉没泄漏”

7. **C3-6 与 B1/A5/C4 收尾对账**
   - **重点回看文件**：`directorCodeModelProvider.ts`、`chatAgents.ts`
   - **要做的事**：
     - 确认 C3 没把 B1/B2/A5 新增的监听再放回裸 listener 模式
     - 确认 model provider 的 onDidChange 事件在 A5/C4 扩展后仍能正确 dispose
   - **完成标志**：C3 不再只是“补几个边角 bug”，而是把后续新增监听的生命周期底座也铺平

**验收标准**：长时间运行不累积监听泄漏；动态 agent 生命周期不误删后注册实例

---

### C4. 收口 token/cost/compact 与模型元数据双源

**涉及文件**：`tokens.ts`、`compact.ts`、`modelCatalog.ts`、`modelResolver.ts`、`chatThinkingContentPart.ts`、`chatEditingExplanationModelManager.ts`、`chatModelPicker.ts`、`modelPickerActionItem.ts`、`terminalContrib/chatAgentTools/browser/tools/monitoring/outputMonitor.ts`

**① Token 估算**：`Math.ceil(new TextEncoder().encode(text).length / 3.5)` — 不引入 tiktoken（~4MB 不适合 VS Code bundle）

**② Compact 专用模型**：三级回退 — 用户 Settings > Provider 默认小模型 > 主模型

| Provider | 默认 compact 模型 |
|----------|-------------------|
| `anthropic` | `claude-haiku-4-5` |
| `openai` | `gpt-4o-mini` |
| `gemini` | `gemini-2.5-flash` |
| `openai-compatible` / `anthropic-compatible` | 无默认，直接用主模型 |

不可用时回退到下一级，`console.warn` 记录。新增 Settings: `directorCode.ai.compactModel`。**可用性检测**：通过 `ModelResolver` 已解析的模型列表判断（`resolvedModels.find(m => m.id === compactModelId)`），不通过实际 API 调用试探——避免每次 compact 前多一次网络请求。若模型在列表中但 API 返回 403/404（密钥权限不够），则在该 compact 调用失败后按当前 session 标记为不可用并回退到主模型，后续 session 内不再尝试。**标记维度至少包含** `provider + normalizedBaseURL + authIdentityKey + authVariant + compactModelId`，避免不同账号 / baseURL / transport 互相污染。

- **OpenAI OAuth/codex 例外**：若当前 `openai` provider 实际走 `authVariant = openai-codex`，默认 compact 候选必须先从该 `authVariant` 对应的静态 allowlist / resolver 结果中选择最小可用模型；若该通道没有明确的小模型候选，则**直接回退主模型**，不要强行套用 `gpt-4o-mini`

**跨 Provider 限制**：compact 模型必须与主模型使用同一 Provider（`compactConversation()` 复用调用方传入的 `provider` 实例，无法跨 Provider 发送请求）。`directorCode.ai.compactModel` 校验逻辑：检查 compact 模型是否属于当前 Provider 的模型列表，不属于则 `console.warn` 并回退到主模型。跨 Provider compact 作为后续优化（需扩展接口接受独立 `compactProvider` 参数）。

**跨 authVariant 限制（v2.26 补充）**：`authVariant` 也必须与主模型一致，不只是 provider name 一致。**具体规则**：
- 若主模型 `authVariant = openai-codex`，用户显式设置 `directorCode.ai.compactModel = gpt-4o-mini`（落在 `api.openai.com` default transport）：**视为跨 authVariant 不匹配**，`console.warn("compact model '%s' requires 'default' authVariant, but session is using 'openai-codex'. Falling back to main model.", compactModelId)` 并回退主模型
- 若主模型 `authVariant = default`，用户设置的 compact 模型须落在同一 `authVariant` 的 allowlist 内，否则回退主模型
- **原因**：同 provider name 下的不同 `authVariant` 使用不同 transport / endpoint / 凭证，`compactConversation()` 当前只复用调用方传入的 `provider` 实例，无法在运行时切换 transport 层
- **测试用例必须覆盖**：`openai` default 主模型 + codex-only compact 模型（应回退）、`openai` codex 主模型 + default-only compact 模型（应回退）、同 authVariant 内部配置（应生效）

**③ `shouldAutoCompact()` 增加下界保护**：估算 token 数低于 `MIN_COMPACT_THRESHOLD = 8000` 时不触发 compact（即使百分比超限），避免对短对话频繁 compact

**④ 模型元数据统一**：`modelCatalog` 只负责静态默认 metadata，`ModelResolver` 负责运行时发现。最终视图 = `ModelResolver` 结果 + `modelCatalog` 覆盖 + `authStateService.resolveAuth()` 的 `authVariant`（v2.27 决策 4 延伸：用 AuthStateService 替代 `resolveProviderOptions()`）

**OpenAI OAuth 的模型元数据注意事项（新增）**：

- 若 B1 最终把 OpenAI OAuth 落为独立 `openai-codex` transport，则本节默认假设的 `openai = api.openai.com` 不再完全成立
- **默认收口策略**：在 OpenAI OAuth transport 拿到稳定 live model list 之前，先使用静态 allowlist / catalog 子集（例如当前已验证可用的 GPT/Codex 模型），不要让 model picker 直接依赖 `api.openai.com/v1/models`
- `directorCodeModelProvider.ts` / `ModelResolverService` / `MODEL_CATALOG` 需要共享同一个 `authVariant` 概念，否则 UI 列表、真实请求、成本/上下文元数据会再次三层脱节
- `openai-codex` 的静态 allowlist **至少**应包含“本轮已通过真实 smoke 的模型子集”；若某账号 / authVariant 下解析后列表为空，picker 必须阻断请求并给出明确说明（例如 Settings / auth 状态提示），**不得**静默回落到不存在或未验证的模型
- **发布门槛下限**：`openai-codex` 路径至少要有 **1 个** 已通过真实 smoke 验证的可发送模型；若最终 allowlist 为空，则该路径视为**未交付**，不是“受限交付”
- `openai-codex` 不自动继承 `openai` default transport 的 vision / pricing / capability 结论；若无独立证据，按 `unknown` metadata 或最小 capability 处理

**⑤ 动态模型过滤**：

| Provider | 过滤规则 |
|----------|---------|
| OpenAI | 保留 `gpt-*`/`o1*`/`o3*`/`o4*`/`chatgpt-*`；排除含 `embed`/`moderation`/`tts`/`whisper`/`dall-e` |
| Gemini | 保留含 `gemini` 且 `supportedGenerationMethods` 含 `generateContent` |
| OpenAI-compatible | 排除含 `embed`，其余放入 picker |
| Anthropic-compatible | 不过滤（API 只返回 chat 模型）|

通过过滤但未收录的模型：`price`/`contextWindow`/`maxOutputTokens` 标为 `unknown`。

> 首版使用硬编码白名单/排除列表。后续可考虑改为排除列表模式（只排除已知非 chat 模型，默认放行未知模型），提高可扩展性。这是有意的初版简化，不是遗漏。
>
> **迁移触发条件**：当出现以下任一情况时切换到排除列表模式：① OpenAI 发布的新 chat 模型前缀不在白名单中累计达 2 次；② Phase 2 ACP 开发启动时（统一模型发现机制）。

**⑥ 用户可见辅助功能中的 `vendor: 'copilot'` 硬编码**：

- **涉及文件**（含实际路径）：
  - `chatThinkingContentPart.ts`（实际路径：`vscode/src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatThinkingContentPart.ts`，**在 `widget/chatContentParts/` 下**，约 L864 有 `vendor: 'copilot', id: 'copilot-fast'`）
  - `chatEditingExplanationModelManager.ts`（约 L240）
  - `chatModelPicker.ts` / `modelPickerActionItem.ts`
  - `terminalContrib/chatAgentTools/browser/tools/monitoring/outputMonitor.ts`（约 L629、L931 等多处）
- **问题**：部分标题生成、解释生成、模型选择 hover/CTA 仍显式依赖 `vendor: 'copilot'` / `copilot-fast`，在 Director-Code built-in mode 下会退化成无模型、错误 CTA 或异常排序
- **修复策略**：
  - 需要“快速模型”做标题/解释生成的辅助功能，不再写死 `selectLanguageModels({ vendor: 'copilot', id: 'copilot-fast' })`
  - `outputMonitor.ts` 这类终端 Agent 工具辅助路径同样纳入：优先用当前会话活动模型或同 provider 小模型，不再回落到只查 Copilot vendor
  - 优先顺序统一为：**当前会话活动模型** → **`vendor: 'director-code'` 可用模型** → **同 provider 小模型/默认模型** → **graceful fallback**（本地 fallback title / 不展示 explanation），而不是报 “No language model available”
  - 用户可见排序、hover、upgrade CTA 不再按 `vendor === 'copilot'` 特判；built-in mode 下移除 premium/upgrade 文案，仅保留中性模型管理和不可用说明
- **范围限定**：`languageModels.ts` 内部的默认 vendor 特判、注释/示例中的 `copilot-instructions.md` 等非用户可见兼容内容，不作为 blocker

**当前代码脱节点（执行前必须知道）**：

- `tokens.ts` 当前仍是：
  - `estimateTokens(text.length / 4)` 的旧估算
  - `getContextWindowSize()` / `MODEL_PRICING` 各自维护一份启发式表
  - 与 `modelCatalog.ts` / `modelResolver.ts` 没有统一数据源
- `compact.ts` 当前：
  - `shouldAutoCompact()` 只看阈值，不做最小下界保护
  - `compactConversation()` 只要不抛异常就算“成功”
  - compact 始终复用主模型，没有 compact 专用模型选择逻辑
  - micro-compact 只按字符数截断 `tool_result`，没有二进制/占位说明策略
- `modelCatalog.ts` 当前只是一份静态默认表，没有显式“unknown metadata / runtime overlay / authVariant”概念
- `modelResolver.ts` 当前虽然已有三层 fallback，但：
  - 仍假定 OpenAI live models endpoint 是主路径
  - 对 OpenAI OAuth/codex 的 live models 还没有独立策略
  - 运行时解析结果与 `modelCatalog.ts` 的 merge 规则还没被明确钉死
- 用户可见辅助模型入口仍残留 Copilot 假设：
  - `chatThinkingContentPart.ts` 直接查 `vendor: 'copilot', id: 'copilot-fast'`
  - `chatEditingExplanationModelManager.ts` 同样直接查 `copilot-fast`
  - `outputMonitor.ts` 先找 `copilot-fast`，再找 `vendor: 'copilot'`
  - `chatModelPicker.ts` / `modelPickerActionItem.ts` 仍保留 upgrade CTA / premium 语义
- 现有测试虽覆盖 `tokens.ts` / `compact.ts` / `modelResolver.ts` 的基础逻辑，但还没有把“静态 metadata / runtime overlay / auxiliary model fallback / unknown metadata”这批问题当成一个闭环来收

**C4 细化执行 checklist（文件级，按顺序执行）**：

1. **C4-0 先冻结“静态表 vs 运行时解析 vs 用户可见消费”的三层边界**
   - **先读文件**：`tokens.ts`、`compact.ts`、`modelCatalog.ts`、`modelResolver.ts`
   - **先冻结三层职责**：
     - `modelCatalog.ts`：静态默认 metadata / allowlist / fallback 底表
     - `modelResolver.ts`：运行时发现、缓存、overlay
     - 用户可见消费层（picker/辅助模型选择/compact/tokens）只读**统一后的视图**
   - **完成标志**：后续所有改动都围绕“三层边界”展开，不再出现谁都能各自维护一份模型数据的情况

2. **C4-1 先收口 `tokens.ts`，把估算与静态 metadata 从“散表”变成“统一消费口”**
   - **主要文件**：`tokens.ts`、必要时 `modelCatalog.ts`
   - **要做的事**：
     - `estimateTokens()` 改为 `Math.ceil(new TextEncoder().encode(text).length / 3.5)`
     - `getContextWindowSize()` 尽量优先读统一 metadata，而不是继续无限扩 if/else
     - `estimateCost()` 对未知模型明确返回基于 fallback 的保守值，避免伪精确
     - 给 `MODEL_PRICING` / context window 的“unknown”语义留出口
   - **完成标志**：token/cost 估算不再与 `modelCatalog`/`modelResolver` 各说各话

3. **C4-2 先改 `modelCatalog.ts`，明确它只是静态默认 metadata，不是唯一真相**
   - **主要文件**：`modelCatalog.ts`
   - **要做的事**：
     - 明确静态字段用途：`family`、`apiType`、默认上下文窗、默认输出上限、已知价格
     - 为“unknown metadata”预留语义（哪怕只是注释/类型约定）
     - 如 OpenAI OAuth/codex 需要单独静态 allowlist，在这里显式落版，不要散到 UI 文件
   - **完成标志**：`modelCatalog.ts` 从“硬编码真相”变成“静态默认层”，后续 overlay 逻辑更容易统一

4. **C4-3 再改 `modelResolver.ts`，把 runtime overlay 规则钉死**
   - **主要文件**：`modelResolver.ts`
   - **要做的事**：
     - 明确最终视图 = `runtime resolved models + static catalog overlay`
     - OpenAI OAuth/codex 若无稳定 live endpoint，回退到静态 allowlist / catalog 子集
     - 通过 overlay 机制把运行时新模型标成 `unknown` metadata，而不是瞎填默认价格/窗口
   - **完成标志**：`modelResolver` 不再只是“拿列表”，而是唯一的 runtime 视图整合器

5. **C4-4 收口 `compact.ts`：先把成功判定和触发阈值做对**
   - **主要文件**：`compact.ts`
   - **要做的事**：
     - `shouldAutoCompact()` 增加 `MIN_COMPACT_THRESHOLD = 8000`
     - compact 成功判定不再只是“没抛异常”，而是：
       - HTTP 200
       - 返回非空（`>= 10` 字符）
       - 估算 token `< 原始的 90%`
     - **口径统一**：本节沿用 A3④ 的数值标准，只把实现责任迁入 `compact.ts` 和相邻测试；后续若要改阈值，必须同步更新 A3/C4/测试清单，不能两处各写一套
     - 失败时不发“已 compact”假象
   - **完成标志**：compact 不再因为一次空 summary 或几乎没压缩成功也被当作成功

6. **C4-5 给 compact 加专用模型选择链**
   - **主要文件**：`compact.ts`、`modelResolver.ts`、必要时 Settings 相关文件
   - **要做的事**：
     - 先按文档既定顺序：用户设置 > provider 默认小模型 > 主模型
     - 把 `directorCode.ai.compactModel` 明确落到配置注册与 Settings UI（配置 schema + `ProviderSettingsWidget` 或相邻 compact 配置入口），不要只停留在 `compact.ts` 内部常量
     - **Schema 注册位置（v2.27 写死）**：`directorCode.ai.compactModel` 的 `configurationRegistry.registerConfiguration({ ... })` 调用**必须**加到 `vscode/src/vs/workbench/contrib/chat/browser/agentEngine/agentEngine.contribution.ts` 已有的 configuration 块中（该文件已注册 `directorCode.ai.provider` / `directorCode.ai.model` 等配置）；不要新建独立 contribution 文件
       - schema 定义至少包含：`type: 'string'`、`default: ''`（空表示走 provider 默认小模型）、`description` 字段说明三级回退语义
       - 不要在 schema 里硬编码 `enum` 候选模型列表，那样跟不上 provider 新模型发布；改为 `'string'` 自由输入 + 运行时按 ModelResolver 校验
     - **职责边界**：C4-5 负责 compact 模型的配置 schema、选择链和可用性语义；最终 Settings 页面挂载、刷新链与 widget 编排仍由 `C2-2/C2-6` 承接。若 `C2` 尚未就绪，先落 schema / 状态模型，不在 C4 里单独发明第二套 UI wiring
     - **与 C2-6 的交付顺序（v2.27 写死）**：schema 在 C4-5 注册后，`ProviderSettingsWidget` 在 C2 阶段读 `IConfigurationService` 已能拿到该字段；但"compact model 专用输入控件"（如下拉选择器）归 C2-6 扫尾时与 Settings 布局一并确定。若 C4-5 先于 C2-6 完成，用户暂时只能通过 `settings.json` 文本输入 `directorCode.ai.compactModel`，不影响功能正确性
     - 用 `ModelResolver` 已解析结果做"模型是否可用"判断
    - 若 API 返回 403/404，把该 compact 模型在当前 session 按 `provider + normalizedBaseURL + authIdentityKey + authVariant + compactModelId` 标记为不可用并降级
     - 严守同 provider 限制，不偷做跨 provider compact
   - **完成标志**：compact 模型选择逻辑稳定且可解释，不再永远拿主模型硬压

7. **C4-6 把 micro-compact 从“长文本截断”升级成“tool_result hygiene”**
   - **主要文件**：`compact.ts`
   - **要做的事**：
     - 保留长文本 `tool_result` 的 head-tail 截断
     - 增加二进制/base64/data URI 检测
     - 二进制结果统一转占位说明而不是直接拼进上下文
   - **完成标志**：上下文不会因为图片/base64/tool dump 被异常污染

8. **C4-7 收口辅助模型选择：先去掉 `copilot-fast` 假设**
   - **主要文件**：`chatThinkingContentPart.ts`、`chatEditingExplanationModelManager.ts`、`outputMonitor.ts`
   - **要做的事**：
     - 不再直接 `selectLanguageModels({ vendor: 'copilot', id: 'copilot-fast' })`
     - 按既定优先级：
       - 当前会话活动模型
       - `vendor: 'director-code'` 可用模型
       - 同 provider 小模型/默认模型
       - graceful fallback
     - 不要因为找不到 Copilot vendor 就报 `No language model available`
   - **完成标志**：标题生成、解释生成、终端辅助路径在无 Copilot vendor 时仍能工作或优雅降级

9. **C4-8 收口模型选择器与 CTA，不再保留 Copilot 升级语义**
   - **主要文件**：`chatModelPicker.ts`、`modelPickerActionItem.ts`
   - **要做的事**：
     - built-in mode 下去掉 upgrade / premium / Copilot Pro CTA
     - unavailable model 的提示改成中性文案，不默认把用户导向升级
     - **职责边界**：B4 负责“去 Copilot 化 CTA/品牌收口”的主修改；C4-8 只负责确保辅助模型/模型选择逻辑在 B4 修改后**不重新引回**旧 CTA，不再二次接管产品文案策略
    - **执行顺序**：同文件若同时被 `B4-6/B4-7` 与 `C4-8` 修改，先以 `B4` 完成产品级文案/CTA 收口，再由 `C4-8` 只补逻辑/降级与不可用原因；除技术不可用说明外，`C4-8` 不回改产品级字符串
   - **完成标志**：模型选择器在 Director-Code 模式下只表达“可用 / 不可用 / 需要配置”，不再表达 Copilot 订阅语义

10. **C4-9 先补测试，再做 smoke**
   - **至少更新/新增的测试文件**：
     - `tokens.test.ts`
     - `compact.test.ts`
     - `modelResolver.test.ts`
     - 必要时补相邻 UI/辅助模型逻辑测试
   - **必须覆盖的用例**：
     - `TextEncoder/3.5` 估算规则
     - unknown metadata 不伪精确
     - compact 成功/失败判定
     - `MIN_COMPACT_THRESHOLD`
     - compact 模型降级
     - 二进制 tool_result 占位
     - 无 Copilot vendor 时辅助模型选择 graceful fallback
   - **手动 smoke**：
     - 长对话触发 compact 一次
     - 设置 compact 专用模型一次
     - OpenAI OAuth/codex 路径 picker 一次
     - thinking title / explanation / outputMonitor 各触发一次
   - **完成标志**：C4 的数据层与用户可见层没有再出现“模型能用但元数据错”“标题入口直接挂掉”“compact 假成功”这些老问题

11. **C4-10 与 B2 / A5 / C1 收尾对账**
   - **重点回看文件**：`modelResolver.ts`、`modelCatalog.ts`、`compact.ts`、`tokens.ts`
   - **要做的事**：
     - 确认 C4 没绕开 B2 的 `authVariant`
     - 确认 C4 没绕开 A5 的统一模型视图
     - 确认 C4 新加的 compact / metadata 逻辑没有和 C1 的 provider 协议兼容修复打架
   - **完成标志**：C4 成为“统一模型数据消费层”，而不是又新长出一套模型/成本/compact 的旁路逻辑

**验收标准**：
- 不因负阈值导致一直 compact
- 模型元数据不双源漂移
- 未知模型不显示伪精确成本
- 用户可见辅助功能在无 Copilot vendor 的情况下仍可工作或优雅降级，不再出现错误 upgrade CTA / `No language model available`

---

### C5. 收口构建脚本与工作树污染

**涉及文件**：`prepare_vscode.sh`、`build.sh`、`.gitignore`

**运行环境前置（v2.25 新增，v2.27 细化）**：`prepare_vscode.sh` / `build.sh` 是 **bash 脚本**，Windows 开发者必须通过 **Git Bash** / **WSL** / **MSYS2** 运行；**直接在 PowerShell / cmd 执行会失败**。脚本中的 `trap cleanup EXIT` 仅在 bash/POSIX shell 下生效，PowerShell 无等价语义。开发者文档 / README 需明确标注运行环境要求。CI 环境默认使用 Linux runner，不受此限制。

**Windows bash 环境优先顺序（v2.27 新增）**：
1. **推荐**：Git Bash（Git for Windows 自带，与 Windows 文件系统同根，`npm ci` / electron 下载速度正常）
2. **可用但不推荐**：MSYS2（与 Git Bash 等价，多一层包管理器，无明显优势）
3. **可用但强烈不推荐日常使用**：WSL（文件若位于 `/mnt/e/...` 或 `/mnt/c/...` 走 Windows 主机文件系统，`npm ci` 跨文件系统 IO 会比 Git Bash 慢 10-50 倍；仅当开发者主力在 WSL 环境、仓库也 clone 在 WSL 原生文件系统（如 `~/projects/...`）时才具备接近原生的速度）
- 开发者文档需把"Git Bash = 默认推荐"写在前面，避免新开发者按 WSL 走发现构建奇慢再返工

**Electron 预下载缓存目录创建责任（v2.27 新增，v2.28 修正现状）**：
- **目录路径**：仓库根目录下的 `.electron-cache/`（相对路径，不要在 `vscode/` 内）
- **当前现状（v2.28 修正）**：
  - `prepare_vscode.sh` **当前脚本内没有** `mkdir -p .electron-cache` 语句（L40-170 已核对）
  - 仓库根目录已存在 `.electron-cache/electron-v39.8.0-win32-x64.zip` 和**平级根目录** `electron-v39.8.0-win32-x64.zip`——前者位置合理，后者是异常产物；说明当前 electron zip 下载路径是靠**其他机制**（很可能是 `npm ci` 内部 `electron` npm 包的 postinstall 下载），**不是** `prepare_vscode.sh` 显式管理
  - 如果不设显式 env（`ELECTRON_CUSTOM_DIR` / `ELECTRON_MIRROR`），electron npm 包会同时写入系统级缓存（`~/.npm/_cacache/`）与工作目录
- **目标策略（C5-1 / C5-5 需落实）**：
  - `prepare_vscode.sh` 在 `npm ci` 前显式 `export ELECTRON_CUSTOM_DIR="$(pwd)/.electron-cache"` 且 `mkdir -p "$ELECTRON_CUSTOM_DIR"`，让 electron 下载目标固定到 `.electron-cache/`；避免 electron zip 同时掉落根目录或系统级缓存
  - 同步为 cleanup 阶段增加"清理根目录遗留的 `electron-v*.zip`"动作（若不能阻止生成，至少在脚本退出时扫一次并删除）
- **当前遗留处理**：根目录已有的 `electron-v39.8.0-win32-x64.zip` 需手动删除（本轮执行时一次性清理），并在 `C5-1` 落地后验证新脚本不会再次生成
- **消费方**：`ELECTRON_CUSTOM_DIR` / `ELECTRON_MIRROR` 等 electron download env 指向该目录；本轮 C5 的落地策略是显式把 electron zip 下载目标固定到 `./.electron-cache/`，避免系统级缓存累积与工作树污染并存

**开发者文档更新（v2.26 新增）**：`C5-5` 完成后，必须在 `README.md`（仓库根目录）或 `CONTRIBUTING.md` / `CLAUDE.md`（如存在）的"构建说明"段补充以下条目：
1. Windows 开发者运行 `prepare_vscode.sh` / `build.sh` 须使用 Git Bash / WSL / MSYS2，**不**支持 PowerShell / cmd
2. `DIRECTOR_CODE_SKIP_EXTENSIONS_BUILD=1` 环境变量的用途与发布边界
3. `.electron-cache/` 作为 Electron 预下载缓存的约定位置，不提交到 git
4. 若 `prepare_vscode.sh` 中途失败，`trap cleanup EXIT` 会自动恢复 `.npmrc.bak` / `package.json.bak` / `manifest.json.bak` / `product.json.bak`；开发者不需要手动清理

**落点建议**：可放在 `CLAUDE.md` 的"构建脚本"段（若有）或新建 `docs/building.md`；不强求放单一文件，但必须可被新加入开发者快速检索到。

**修复项**：
- `compile-extensions-build` 改为可选步骤：在 `prepare_vscode.sh` 或构建脚本中检测 `DIRECTOR_CODE_SKIP_EXTENSIONS_BUILD=1` 环境变量，设置时跳过 builtInExtensions 下载和编译（已知在公司内网受限环境下载失败）
- `.bak` 污染按**失败路径也要清理**处理：`prepare_vscode.sh` 当前会产生 `product.json.bak`、`.npmrc.bak`、`package.json.bak`、`resources/server/manifest.json.bak`。不能只在脚本结尾清理；需用 `trap cleanup EXIT`（或等价机制）确保成功 / 失败 / 中断三种路径都恢复或删除临时备份，不残留在 git 工作树中
- **构建缓存/下载产物的唯一落点**：Electron 预下载 zip 与其他构建期下载物不得散落仓库根目录。默认策略写死为：持久缓存统一落在 `.electron-cache/` 并由 `.gitignore` 忽略；根目录 `electron-v*.zip` 视为异常产物，必须清理或阻止生成
- **ignore 策略写死（新增）**：`.gitignore` **只**负责忽略 `.electron-cache/` 这类约定缓存目录；仓库根目录 `electron-v*.zip` 继续视为异常产物，**不加入 `.gitignore`**，否则会掩盖脚本未清理 / 错误下载的问题

**当前代码脱节点（执行前必须知道）**：

- `prepare_vscode.sh` 当前确实会产生：
  - `product.json.bak`
  - `.npmrc.bak`
  - `package.json.bak`
  - `resources/server/manifest.json.bak`
  但没有统一 `cleanup` / `trap`
- `.npmrc.bak` 现在只在 `npm ci` 成功路径后被 `mv .npmrc.bak .npmrc` 恢复；中途失败时仍可能遗留
- `build.sh` 当前直接执行 `npm run gulp compile-extensions-build`，还没有 `DIRECTOR_CODE_SKIP_EXTENSIONS_BUILD` 的保护分支
- 现在文档里虽已说明可以跳过扩展编译，但脚本本身还没把这个策略落成可执行开关
- 当前仓库 `.gitignore` 还没有显式覆盖 `.electron-cache/`；同时根目录 `electron-v*.zip` 仍可能作为异常产物出现。这里的收口目标是：`.electron-cache/` 要被 ignore，根目录 zip **不**进 ignore，而是由脚本清理或阻止生成

**C5 细化执行 checklist（文件级，按顺序执行）**：

1. **C5-0 先冻结“哪些文件允许临时改，哪些必须恢复”**
   - **先读文件**：`prepare_vscode.sh`、`build.sh`、`.gitignore`
   - **先列出临时文件清单**：
     - `vscode/product.json.bak`
     - `vscode/.npmrc.bak`
     - `vscode/package.json.bak`
     - `vscode/resources/server/manifest.json.bak`
     - `.electron-cache/**`（若作为持久缓存目录，必须被 `.gitignore` 覆盖）
     - `electron-v*.zip`（仓库根目录异常产物；**不加入 `.gitignore`**，必须清理或阻止生成）
   - **完成标志**：后续 cleanup 逻辑针对的是一张明确清单，不再靠“grep 一下 .bak”兜底

2. **C5-1 先在 `prepare_vscode.sh` 建立统一 cleanup 框架**
   - **主要文件**：`prepare_vscode.sh`
   - **要做的事**：
     - 新增统一 `cleanup()` 函数
     - 用 `trap cleanup EXIT`（必要时补 `INT` / `TERM`）覆盖成功/失败/中断路径
     - cleanup 同时处理恢复与删除逻辑，不要求每个调用点自己善后
     - **固定 electron 下载目录（v2.28 新增）**：在脚本开头 `cd vscode` 之前，显式 `export ELECTRON_CUSTOM_DIR="$(pwd)/.electron-cache"` + `mkdir -p "$ELECTRON_CUSTOM_DIR"`；同时把 cleanup 阶段扩展为"若根目录存在 `electron-v*.zip` 则记录 warn 并 `rm -f`"，防止 electron npm 包绕开 env 继续掉落根目录
   - **完成标志**：脚本里后续再加新的临时文件，也有统一落点可接入；electron zip 不再同时出现在系统级缓存 + 根目录 + `.electron-cache/` 三处

3. **C5-2 `.npmrc` 替换路径单独收口**
   - **主要文件**：`prepare_vscode.sh`
   - **要做的事**：
     - 把当前 `.npmrc -> .npmrc.bak -> cp ../npmrc -> npm ci -> mv 回来` 这条链改成失败安全
     - 确保 `npm ci` 报错或重试超限时，原 `.npmrc` 仍被恢复
   - **完成标志**：依赖安装失败不会把仓内 `.npmrc` 留在错误状态

4. **C5-3 `package.json` / `manifest.json` 备份恢复策略落地**
   - **主要文件**：`prepare_vscode.sh`
   - **要做的事**：
     - 明确 `.bak` 是“恢复源”还是“只做临时留存”
     - 若脚本后续并不需要这些 `.bak` 常驻，则 cleanup 阶段统一清理
     - 不要求在失败时回滚已执行的所有替换，但至少不能把 `.bak` 残留进工作树
   - **完成标志**：构建中断后 `git status` 不再因为这些备份文件变脏

5. **C5-4 给 `build.sh` / 构建入口加 `DIRECTOR_CODE_SKIP_EXTENSIONS_BUILD` 分支**
   - **主要文件**：`build.sh`，必要时 `prepare_vscode.sh`
   - **要做的事**：
     - 在执行 `npm run gulp compile-extensions-build` 前判断环境变量
     - 设置为 `1` 时跳过该步骤，并输出清晰日志说明
     - **发布边界**：`DIRECTOR_CODE_SKIP_EXTENSIONS_BUILD=1` 默认只用于受限网络环境的本地/CI 构建；若要用于 RC/release，必须额外附“被跳过的 builtInExtensions 不影响 Phase 1 发布范围”的验证记录，否则只视为开发/内测构建
     - 不要影响后续核心构建/打包步骤
   - **完成标志**：公司网络受限环境下可以稳定走“跳过扩展编译”的构建路径

6. **C5-5 先补脚本级验证，再做一次失败路径 smoke**
   - **主要文件**：`prepare_vscode.sh`、`build.sh`、`.gitignore`
   - **要做的事**：
     - 自查脚本中所有 `.bak` 相关路径是否都纳入 cleanup
     - 模拟一次中途失败（例如假设 `npm ci` 失败）后的工作树状态
     - 验证 `DIRECTOR_CODE_SKIP_EXTENSIONS_BUILD=1` 时不会调用对应 gulp 任务
     - 验证 `.electron-cache/` 已被 `.gitignore` 覆盖，且仓库根目录不残留 `electron-v*.zip`
   - **完成标志**：C5 不再只是文档建议，而是脚本本身具备失败安全与可跳过分支

7. **C5-6 与 B4/构建文档收尾对账**
   - **重点回看文件**：`prepare_vscode.sh`、相关构建说明文档
   - **要做的事**：
     - 确认 B4 对 `product.json` / `dataFolderName` 的修改不会被 cleanup 误回滚
     - 确认构建说明与脚本实际行为一致（尤其是 skip-extensions-build）
   - **完成标志**：C5 与 B4 不互相打架，构建文档不再和脚本行为脱节

**验收标准**：
- 设置 `DIRECTOR_CODE_SKIP_EXTENSIONS_BUILD=1` 后完整构建成功，不因缺少 builtInExtensions 报错；若该开关用于 RC/release，已附缺失 extensions 影响验证
- 构建成功或中途失败后，`git status` 均无 `.bak` 文件或未约定的缓存/下载产物残留；`.electron-cache/` 如保留则已被 `.gitignore` 忽略，根目录不留 `electron-v*.zip`

---

## 批次 D：P3 防御性加固

低成本收口。D1/D2 在 **Phase 1 对外发布 / 默认开启前** 完成（文中旧称“Phase 2 默认开启前”，与 ACP Phase 2 排期不同），D3/D4 为持续改进项：

> **门禁语义补充**：D1/D2 被列为发布门禁，表示“默认值与对外交互安全基线必须有验证闭环”，**不等于**把现状直接定性为高危漏洞。下文“不纳入主线 blocker”的列表是为了避免过度定性，不是否定 D1/D2 的收口价值。

- **D1. Gemini key in URL**：增加 header 方式开关。**兼容性验证标准**：测试 `generativelanguage.googleapis.com` 的 `generateContent` 和 `models.list` 两个我们用到的端点均支持 `x-goog-api-key` header 认证（替代 URL `?key=`）。验证通过后默认切到 header 方式，保留 `directorCode.ai.geminiKeyInUrl` 布尔设置作为回退开关。**若两端点验证结果不一致**（v2.26 决策 2 严格阻塞）：
  - **不切默认值**（保持 query）
  - `D1` 视为未完成并**继续阻塞** Phase 1 对外发布
  - 允许在实验分支做 endpoint-level fallback，但**不作为**放行 D1 的路径，也**不计入**本轮收口完成
  - **处置逻辑**：若真的出现该场景（预期概率极低，Google 对同 API key 不同端点通常认证一致），说明 Google 某端点可能已弃用或正在迁移，需**另开决策**重新评估 Phase 1 特性集是否继续依赖 Gemini
  - **不接受**"endpoint-level fallback 看似可用就发布"或"先默认 query 带着不稳定切换发布"等折中方案
- **D2. 密钥输入安全**：禁用自动填充，提交后重建 input，缩短明文停留时间
- **D3. 通用 fetch helper**（持续改进）：抽 `fetchWithTimeout()` / `fetchJsonWithTimeout()`，收口 ModelResolver、testConnection、CDN、OAuth 等路径
- **D4. Editor 生命周期**（持续改进）：仅审计自研 `directorCodeSettingsEditor.ts` 的 `dispose()` 和 `setInput()` 实现，确认无 listener 泄漏和重入竞态。不审计上游 `EditorPane` 基类（上游有自己的测试覆盖）

**当前代码脱节点（执行前必须知道）**：

- Gemini 相关代码当前仍广泛把 key 放在 URL query：
  - `geminiProvider.ts`：`...:generateContent?key=${this.apiKey}`
  - `modelResolver.ts`：`GET /v1beta/models?key=${apiKey}`
  - `apiKeyService.ts`：`_testGemini()` 也走 `?key=`
- `apiKeysWidget.ts` 虽然已经 `autocomplete = 'off'` 且提交后清空 `input.value`，但还没有“重建 input DOM 节点”这一步，浏览器/密码管理器残留风险仍在
- `oauthService.ts`、`modelResolver.ts`、`apiKeyService.ts` 各自都在重复：
  - `fetch(...)`
  - `AbortController`
  - `setTimeout(...abort...)`
  没有统一 helper，超时、错误格式、清理语义不一致
- `directorCodeSettingsEditor.ts` 当前：
  - `createEditor()` 里 `editorDisposables.clear()`
  - `setInput()` 只做 `super.setInput` + `layout`
  - 没有专门的生命周期审计测试
  这不一定有 bug，但属于需要收口验证的热点

**D1 细化执行 checklist（Gemini key header 开关）**：

1. **D1-0 先冻结“header 优先、query 兜底”的总策略**
   - **先读文件**：`geminiProvider.ts`、`modelResolver.ts`、`apiKeyService.ts`
   - **先冻结原则**：
     - 默认目标：`x-goog-api-key` header
     - 配置开关：`directorCode.ai.geminiKeyInUrl`
     - 仅当兼容性验证不通过或用户手动开启回退时，才走 query `?key=`
   - **完成标志**：后续修改都围绕同一开关，不再一处 header 一处 query 混搭

2. **D1-1 先给 Gemini 请求路径抽“认证位置选择”**
   - **主要文件**：`geminiProvider.ts`、`apiKeyService.ts`、`modelResolver.ts`
   - **要做的事**：
     - 抽一个轻量 helper/判断：当前请求该把 key 放 header 还是 query
     - `createMessage()` / `createMessageStream()` / `_testGemini()` / `_fetchGeminiModels()` 共用这条规则
   - **完成标志**：Gemini 三条调用链（真实请求、Test Connection、ModelResolver）认证位置一致

3. **D1-2 先完成兼容性验证，再决定默认值**
   - **主要文件**：文档 + 测试/验证记录
   - **要做的事**：
     - 验证 `generateContent`
     - 验证 `models.list`
    - 两个端点都通过后，再把默认值切到 header
    - 若两个端点结论不一致，则默认值保持 query 模式，`D1` 视为未完成并继续阻塞默认开启 / 对外发布；端点级 fallback 仅可作为实验分支记录，不计入本轮收口
   - **验证证据形式写死（v2.27 新增）**：
     - **主证据**：开发者使用**本人真实 Google API key** 各跑一次两端点验证（推荐写成独立脚本 `scripts/d1-gemini-header-check.ts` 或 `verify-d1.sh`，不纳入 CI，仅本地可跑）
     - **请求形态**：① `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`（带 `x-goog-api-key` header，body 传最小 prompt）；② `GET https://generativelanguage.googleapis.com/v1beta/models`（带 `x-goog-api-key` header）
     - **成功标准**：两端点都返回 HTTP 200 且响应体结构与当前 query-param 模式一致（非 401/403）
     - **证据记录**：截取 HTTP 状态码 + 响应 header 片段 + 首 200 字符响应体，**脱敏 API key** 后贴入 D1 PR 描述（或 `docs/d1-header-verification.md`）
     - **拒绝标准**：任一端点返回 401 / 403 / 4xx，不允许"经 retry 偶尔 200 就记为通过"，必须稳定 200
     - **若无真实 API key**：暂停 D1 收口，不接受用 mock/nock 替代真实验证（因为 D1 目标就是验证 Google 真实服务行为）
   - **完成标志**：默认值不是猜出来的，而是有明确验证依据 + 可复核的脱敏原始响应记录

4. **D1-3 补测试与 smoke**
   - **至少更新/新增的测试文件**：
     - `geminiProvider.test.ts`
     - `apiKeyService.test.ts`
     - `modelResolver.test.ts`
   - **必须覆盖的用例**：
     - header 模式
     - query 回退模式
     - 配置开关控制生效
   - **完成标志**：Gemini key 传递方式切换不会再靠手工回归

**D2 细化执行 checklist（密钥输入安全）**：

1. **D2-0 先冻结目标：降低明文停留时间，而不是追求“绝对不可见”**
   - **先读文件**：`apiKeysWidget.ts`
   - **先冻结原则**：
     - 目标是缩短 DOM/浏览器层明文停留时间
     - 不把它包装成“完全防泄漏”
   - **完成标志**：实现与文档宣传一致，不夸大安全收益

2. **D2-1 先补输入控件级约束**
   - **主要文件**：`apiKeysWidget.ts`
   - **要做的事**：
     - 保持 `type=password`
    - 保持/补充 `autocomplete="off"` 作为最低要求，必要时可升级到 `new-password` 等更强约束
     - 如有需要，补充与密码管理器/自动填充相关的最小防御属性
   - **完成标志**：输入控件本身尽量不被浏览器/密码管理器主动记忆或回填

3. **D2-2 提交后重建 input，而不只是清空 value**
   - **主要文件**：`apiKeysWidget.ts`
   - **要做的事**：
     - Save/Delete/Render 后不要只 `input.value = ''`
     - 改成重建 input DOM 节点或等价重置方式
     - 保证事件监听重新挂载，不影响交互
   - **完成标志**：提交后旧 input 节点及其可能缓存的浏览器状态被一起淘汰

4. **D2-3 补测试与 smoke**
   - **至少更新/新增的测试文件**：
     - `apiKeysWidget.test.ts`
   - **必须覆盖的用例**：
     - 提交后 input 被清空/重建
     - 自动填充相关属性存在
   - **完成标志**：D2 改动可回归验证，不靠 DOM 肉眼观察

**D2 验收标准**：
- `apiKeysWidget` 的密钥输入控件至少具备约定的 autofill-suppression 属性集（最低 `autocomplete="off"`；若实现了更强约束，以更强约束为准）
- Save/Delete/Render 后旧 input 节点已被重建或等价替换，不再仅靠 `value = ''`
- 自动化测试能证明上述两点成立；不接受只靠人工目测作为 `D2` 发布门禁证据

**D3 细化执行 checklist（通用 fetch helper）**：

1. **D3-0 先冻结 helper 的适用边界**
   - **先读文件**：`oauthService.ts`、`modelResolver.ts`、`apiKeyService.ts`
   - **先冻结原则**：
     - D3 先收口“服务层 fetch”，不碰 Provider 主请求路径
     - 统一超时、AbortController、JSON 解析、错误格式
   - **完成标志**：D3 不会和 C1 的 Provider 协议层改动交叉打架

2. **D3-1 抽 `fetchWithTimeout()` / `fetchJsonWithTimeout()`**
   - **主要文件**：可新建 `common/agentEngine/fetchUtils.ts`（或等价名称）
   - **要做的事**：
     - 统一封装 timeout + abort + clearTimeout
     - JSON helper 统一处理非 2xx / parse fail
   - **完成标志**：后续服务层不再重复手写 `AbortController + setTimeout`

3. **D3-2 先迁 `modelResolver.ts`**
   - **主要文件**：`modelResolver.ts`
   - **要做的事**：
     - Provider API 拉模型
     - CDN JSON
     两类路径都接 helper
   - **完成标志**：resolver 成为第一批统一用 helper 的调用点

4. **D3-3 再迁 `apiKeyService.testConnection()` 与 `oauthService.ts`**
   - **主要文件**：`apiKeyService.ts`、`oauthService.ts`
   - **要做的事**：
     - `_testAnthropic` / `_testOpenAI` / `_testGemini`
     - OAuth token exchange / refresh
     都切到 helper
   - **完成标志**：Test Connection 与 OAuth 路径不再各自维护一套超时/错误处理

5. **D3-4 补测试与最小回归**
   - **至少更新/新增的测试文件**：
     - `modelResolver.test.ts`
     - `apiKeyService.test.ts`
     - `oauthService.test.ts`
   - **必须覆盖的用例**：
     - 超时
     - 取消
     - JSON parse 失败
     - 非 2xx 错误格式一致
   - **完成标志**：helper 不只是“抽出来”，而是减少了三条服务链的行为分叉

**D4 细化执行 checklist（Editor 生命周期审计）**：

1. **D4-0 先冻结审计范围**
   - **先读文件**：`directorCodeSettingsEditor.ts`
   - **先冻结原则**：
     - 只审计自研 `DirectorCodeSettingsEditor`
     - 不扩展到上游 `EditorPane`
    - 执行时机晚于 `C2-6/C2-9`，避免在 editor 编排尚未稳定前提前给出会过期的审计结论
   - **完成标志**：D4 保持在低成本 audit 范围，不演变成大重构

2. **D4-1 审 `createEditor()` / `editorDisposables.clear()` / 子 widget 生命周期**
   - **主要文件**：`directorCodeSettingsEditor.ts`
   - **要做的事**：
     - 确认重复创建 editor 时旧 widget/disposables 都会释放
     - 确认 status bar / provider settings / api keys widget 都挂在同一 dispose 链上
   - **完成标志**：重复打开/重建 editor 不会积累 listener

3. **D4-2 审 `setInput()` / `layout()` / `bodyContainer` 的重入边界**
   - **主要文件**：`directorCodeSettingsEditor.ts`
   - **要做的事**：
     - 确认 `setInput()` 在不同调用顺序下不会访问无效 DOM
     - 确认 `layout()` 在 `bodyContainer` 未创建/已替换时是安全的
   - **完成标志**：editor 生命周期边界已被明确验证，不再靠“看起来应该没问题”

4. **D4-3 补最小测试或审计记录**
   - **至少更新/新增的测试文件**：
     - 如可低成本实现，补 `directorCodeSettingsEditor.test.ts`
     - 若测试成本过高，至少在文档/代码注释中留下审计结论
   - **完成标志**：D4 的结论是可追踪的，而不是口头判断

**不纳入主线 blocker 的条目**：
- "Gemini API key 在 URL query = 项目级漏洞"（API 约束）
- "密码输入框 = 致命明文泄露"（低证据）
- "modelResolver 未 abort = 套接字泄漏"（低概率）
- "compact.ts 单线程 = 严重并发污染"（低证据）
- "`chatTipService` / sessions welcome overlay 因 `chatExtensionId` 为空而默认禁用"（Phase 1 可接受的 UX 退化；若后续希望保留 Director-Code 专属 tips/welcome，再单独设计）

---

## Phase 2 ACP 预研与发布门槛

> **对齐说明**：`.cursor/plan-04-phase2-acp.md` 中“**前提：Phase 1 完成**”仍适用于**正式进入 Phase 2 的排期与主线投入**。本节只补充**收口期允许并行开展的 ACP 预研 / 原型边界**，不改变 `.cursor/` 的阶段定义。本文这里说的“默认开启 / 对外发布门槛”，指的是 **Phase 1 收口后的发布门槛**，不是 `.cursor` 意义上的“正式进入 Phase 2 ACP”。
>
> **Phase 2 并发约束（v2.27 决策 5 拍板）**：用户已明确选择**严格按 `.cursor/plan-04-phase2-acp.md` 执行**——即 Phase 2 必须等 Phase 1 完成（含 `B1-ship`）后才能正式启动。收口期内**允许**协议调研、接口 sketch、文档撰写这类**零代码**预研工作；**不允许**开启 Phase 2 的实质代码实现（包括隔离分支、原型脚手架、ACP 协议层抽取等）。这与 Q4（B1-ship 永远阻塞发布）的组合意味着：**若 B1-ship 长期无法完成，Phase 2 也会相应延后**，二者顺序强耦合；作为项目取舍已接受。

**预研（零代码）门槛**（允许开始**纯文档 / 协议设计 / 外部 ACP server 调研**，但**不允许写 Director-Code 仓内的 ACP 代码**）：

- 批次 A **全部完成**
- B1 / B2 / B4-core 的接口与策略已冻结：**OAuth provider-specific flow contract / `authVariant` / OpenAI transport 分叉策略**、ModelResolver 缓存键、产品元数据去 Copilot 化分层方案已明确，不再频繁改签名/改口径
- 说明：这里的“B4 已冻结”指 `B4-core` 已冻结，即**分层策略、命令别名和 built-in mode 规则已定，且 B4-core 对应主实现 / grep / 首轮 smoke 已完成**；受影响触点清单仍可继续通过全仓 grep 增补，不要求首轮表格已经穷尽
- **不允许的工作**（v2.27 决策 5）：Director-Code 仓内的 Phase 2 ACP 代码文件（如 `acpService.ts` / `acpClient.ts` / `acpServerProcess.ts`）；ACP 协议层 TypeScript 类型定义；ACP 相关的 UI widget；任何提交到主分支或隔离分支的 Phase 2 代码改动
- **允许的工作**：协议调研文档（写入 `.cursor/` 或 `docs/phase2-research/`）；对外部 ACP server（如 `claude-code-acp`、`@google/gemini-cli --acp`）的黑盒测试记录；设计评审用的 mermaid 图；Phase 2 依赖的上游 VS Code API 可用性调查

**Phase 1 内部收口门槛（v2.25 新增，区别于对外发布）**：

- 批次 A **全部完成**；批次 B 中 `B4-core` + **`B1-core`** + `B2` + 原 A5 + `B3` 全部完成；批次 C **全部完成**
- 回归测试全部通过；内部构建可用；**不要求** `B1-ship`、**不要求** GitHub Pages 4 页发布
- 允许内部测试 / 受控分发，但**不得**对外宣传为 "Phase 1 已发布"

**Phase 1 对外发布 / 默认开启门槛**：

- **前置**：Phase 1 内部收口全部达标
- 批次 A-C **全部完成**，回归测试全部通过；其中 `B1` 必须达到 **`B1-ship`**（含 OpenAI `B1-5 ~ B1-9` 与对应 smoke），不能只停在 `B1-core`
- 批次 D 中 **Gemini key header 开关（D1）** 和 **密钥输入安全（D2）** 完成；其中 `D1` 必须附 `generateContent` + `models.list` 的 header 兼容性验证证据，若两端点结果不一致则默认值不切换且 `D1` 视为未完成
- B4 中 `defaultChatAgent.{termsStatementUrl, privacyStatementUrl, publicCodeMatchesUrl}` **以及** 顶层 `privacyStatementUrl` 正式独立页面 URL 已配置到发布产物；未配置时只允许开发/内测，不允许默认开启或对外发布。**发布候选验证需实际打开/探测这 4 个 GitHub Pages URL**，确认至少返回 200 且不是空壳/404 页面
- 批次 D 中 **通用 fetch helper（D3）** 和 **Editor 生命周期审计（D4）** 标记为 Phase 2 期间的持续改进项，不阻塞默认开启
- 发布候选需在**清理 NLS/clp 缓存后的干净环境**完成启动验证（Windows 参考 `%APPDATA%\Director-Code\clp` 清理后首启），确保无白屏 / NLS 缓存残留问题

理由：这样既不让收口修复无限阻塞 ACP 预研，也不篡改 `.cursor/` 对“正式进入 Phase 2”的阶段定义，同时继续维持默认开启 / 对外发布的质量门槛。D3/D4 是纯代码质量改善，不影响功能正确性和安全边界。

---

## 测试清单

> **门禁说明**：A-C 全部属于主发布门禁；D 中仅 `D1/D2` 属发布门禁，`D3/D4` 为持续改进项，不阻塞 Phase 1 默认开启。
>
> **验证说明**：默认以自动化测试为主；脚本/assert 与手动 smoke 作为补充；仅 `D4` 等文中明确标注的审计项可用“自动化测试或审计记录”二选一收口。
>
> **CI gating 策略（v2.27 新增）**：
> - CI 按三类 job 划分（不要用单一 "required check" 把所有测试绑在一起）：
>   - `test:core`（**Phase 1 对外发布 required**）：覆盖 A/B/C 全部 + D1/D2 的自动化测试；任何一项失败即阻止 `B1-ship` 放行和 RC 发布
>   - `test:d-improvement`（**非 required，但 PR 可见警告**）：覆盖 D3/D4 的自动化测试/审计记录；失败不阻止 PR 合并，但会在 PR checks 面板标橙色 warning
>   - `smoke:manual`（**非 CI，手动 checklist**）：B4 品牌 smoke、B1 真实 OAuth 端点 smoke（Anthropic + OpenAI/Codex）、D1 真实 Gemini 端点 smoke；以 PR 描述附言形式记录，不纳入自动 CI
> - `B1-ship` 放行前必须：`test:core` 绿 + `smoke:manual` 的 B1 真实 OAuth 端点 smoke 已记录
> - `Phase 1 对外发布` 放行前必须：`test:core` 绿 + 全部 `smoke:manual` 条目已记录 + GitHub Pages 4 页可探测
> - 若未来把 D3/D4 某条提升为发布门禁，**必须**显式从 `test:d-improvement` 迁到 `test:core`，并同步更新测试清单与发布门槛章节；不允许靠"口头约定"改门禁语义

| 批次 | 方向 | 重点用例 |
|------|------|---------|
| A | request 绑定 | 多 request 并存；目标非最后一个；确认与执行落同一 request |
| A | 取消与超时 | `cancelled` subtype；工具超时取消底层（toolBridge 用 CancellationToken）；toolBridge timeout/cancellation 竞态安全（finally 幂等 clearTimeout + dispose listener）；非流式 abort；incomplete 不进 replay；`lastCompleteTurnEnd` 按 `this.messages` 级别整批推进（每次 tool_results 批次 push 后推进），保留已落盘副作用历史；mutation 已执行但 push 未完成时取消，副作用已落盘但 replay 看不到的已知限制 |
| A | tool stream | 多 delta 按 index 聚合；多工具缺 `index` 不静默 fallback；JSON 错误回传+重试上限；compact 失败不发 boundary；工具执行结果按原始 tool_use 顺序保序回填；thinking 块不进入 `this.messages` |
| A | MCP 状态机 | Allow/Not Now/Never 三路径 |
| B | OAuth + AuthState | `anthropic` PKCE + 手动粘 code；`openai` device code / 官方 public flow；exchange/poll 失败重试；过期 cleanup；仅 anthropic/openai；provider-specific flow 不串台；fixed `clientId` 在 refresh / restart 后仍生效；**`IAuthStateService` 三源优先级解析**（OAuth active → per-model key → provider-level key → missing）；`resolveAuth()` 三参数必填与 `authVariant` 路由正确性；`onDidChangeAuthState` 事件聚合输出；**Phase 1 发布门槛对应 `B1-ship`，要求 OpenAI device code / codex backend smoke 通过** |
| B | ModelResolver | 缓存键含身份维度；并发 miss 去重；不同账号不串；仅 chat/generative 进 picker；`_openAIModelToResolved` 不因 baseURL 误判 provider；OAuth 无显式 `accountId` 时仍可用 `authIdentityKey` 隔离缓存；`normalizedBaseURL` 对等价 `/v1` URL 不重复分桶；OpenAI API-key 与 OAuth/codex 路径按 `authVariant` 隔离；logout/切 API key 后 `refreshModels(provider)` 清旧 bucket；bucket 年龄 > 24h 自动重 resolve |
| B | History | 历史保留工具链；无 text_delta 时仍展示正文；rich content 不被抹平；cancelled response 保留已完成 tool 往返，仅过滤 incomplete assistant/thinking；`history.length !== richResponses.length` 时 `console.warn` 并退回纯文本模式，不错位；`_replaySnapshots` map size >= 16 时写入前 LRU 淘汰最久未访问 entry（v2.28 Q2）；单 snapshot > 200 messages 时保留最早 1 条 user message + 最近 199 条（v2.28 Q2），验证：① 200 条 → 不截断；② 201 条且第 0 条是 user → 保留第 0 条 + 最近 199 条；③ 201 条且第 0 条是 system（无 user）→ 退回保留最近 200 条不抛错 |
| B | Product metadata | defaultChatAgent 去 Copilot 化；链接替换；dataFolderName；`triggerSetup*` 命令族别名到 Settings；chatSetup/gallery/status/usage/upgrade/agentSessions 路径收口；发布产物含正式 `defaultChatAgent.{terms/privacy/publicCode}` + 顶层 `privacyStatementUrl`；根 product.json 显式写出全部 30+ `defaultChatAgent.*` 字段与 4 个顶层字段（省略等于继承 Copilot 旧值，v2.28 补注）；`prepare_vscode.sh` L47/L49 三者对称兜底（v2.28 Q5）：L47 `releaseNotesUrl` = GitHub releases、L48 `reportIssueUrl` = GitHub issues、L49 `requestFeatureUrl` = GitHub issues，任一路径下用户不应看到 Microsoft 链接 |
| C | Provider | SSE 尾包 flush；Gemini error；Gemini stable tool id；OpenAI vision / `/v1` / `max_completion_tokens`；`stream_options.include_usage` 仅在首包前允许一次兼容回退 |
| C | Settings | per-model key；Test Connection 超时；`flushPendingWrites()`；OAuth 入口仅 anthropic/openai；`Subscription & Login` 不再是 `Coming Soon` 占位；按 provider 渲染 PKCE/device-code UI；不暴露通用 `clientId` 输入；auth 状态解析不依赖静态 helper；`openai` 的 `authVariant` 状态不串台；`authStateService.resolveAuth(provider, model, authVariant)` 第三参数必填（v2.28 Q3），漏传时 TypeScript 编译报错；非 OpenAI provider 调用固定传 `'default'`；`rg "resolveAuth\\(" vscode/src/` 全部命中行至少 3 个参数 |
| C | Lifecycle | `DirectorCodeModelProvider` dispose 链；`registerDynamicAgent()` 重复 ID 热重载安全；MCP capability 显隐；`resource_link` 图片失败不再空成功 |
| C | Tokens/Compact/Metadata | `TextEncoder/3.5` 估算；compact 成功判定；compact 专用模型降级；compact 不可用标记按 `provider + normalizedBaseURL + authIdentityKey + authVariant + compactModelId` 隔离；unknown metadata 不伪精确；OpenAI OAuth/codex 静态 allowlist；`authVariant` 不串 UI 列表 |
| C | Auxiliary model selection | thinking title / explanation manager / `outputMonitor.ts` 不再硬编码 `copilot-fast`；model picker / hover / CTA 不再依赖 Copilot premium 语义 |
| C | Build | 构建脚本开关；`.bak` 清理；`trap cleanup` 覆盖失败路径 |
| D | Gemini header | `x-goog-api-key` header 发送正确；`geminiKeyInUrl` 开关回退到 URL 模式；`generateContent` + `models.list` 双端点验证证据齐全；**双端点结果一致**（均返回 200 + 正确响应）时允许切默认 header；**任一端点 401 / 拒绝** 时 `D1` 记为未完成；测试样本至少覆盖：① 两端点都支持 header → 默认 header；② 两端点都不支持 → 默认 query；③ 一支持一不支持 → `D1` 阻塞发布 |
| D | 密钥输入 | 提交后 input 值已清空/重建；存在约定的 autofill-suppression 属性集（至少 `autocomplete="off"` 或等价更强约束） |
| D | Fetch helper | `fetchWithTimeout()` / `fetchJsonWithTimeout()` 覆盖 ModelResolver、testConnection、OAuth；超时/取消/JSON parse 失败错误格式一致 |
| D | Editor lifecycle | `DirectorCodeSettingsEditor` 的 `createEditor()` / `setInput()` / `layout()` / dispose 链无重入竞态与 listener 泄漏；以自动化测试或审计记录二选一收口 |
| Release | RC startup | 清理 NLS/clp 缓存后的干净环境首启验证；无白屏 / NLS 缓存残留；门禁字符串、URL 与数据目录路径与发布产物一致；4 个 GitHub Pages URL 可打开且非 404/空壳页 |

---

## 附录 A. Readonly 工具 tag 清单（A3⑤ 执行依据，v2.28 决策 Q6 落版）

> **维护位置说明**：v2.28 决策 Q6 拍板，Readonly 工具 tag 清单物理维护在**本文件附录**（与 A3⑤ 正文物理相邻，方便 rebase PR 描述一并更新），**不**单独开 `.cursor/readonly-tools.md`，**不**放 `.cursor/plan-04-phase2-acp.md` 末尾。每次 VS Code 上游 rebase 后，按 v2.25 决策 5 的 6 步验证流程核对本附录清单，结果作为 rebase PR 描述的一部分提交。

### A.1 首轮首批受打 `readonly` tag 的工具（5 个）

按 A3⑤ 决策口径（v2.24 拍板），本轮同时为**明确无副作用**的内置只读工具补上 `tags: ['readonly']`，让 `MAX_CONCURRENCY = 10` 并行路径和 A2 `lastCompleteTurnEnd` "整批推进"分支真正生效。首轮最小集如下（**具体 tool id 以上游最新注册为准**，执行前用 `rg "id:\\s*'.*'" vscode/src/vs/workbench/contrib/chat/browser/tools/` 与 `rg "toolReferenceName" vscode/src/vs/workbench/contrib/chat/browser/tools/` 对齐）：

| 工具语义 | 候选 tool id（待执行前核对） | 副作用评估 |
|---------|-----------------------------|----------|
| 读取文件内容 | `read_file` / `readFile` / 类似 | 无副作用（仅 IO 读）|
| 列出目录 | `list_dir` / `listDir` / `listDirectory` / 类似 | 无副作用（仅 IO 读）|
| 按 glob 搜文件名 | `file_search` / `findFiles` / `fileSearch` / 类似 | 无副作用 |
| 语义搜索 | `semantic_search` / `codebase_search` / 类似 | 无副作用（仅查 embedding index）|
| 文本搜索 | `grep` / `grep_search` / `textSearch` / 类似 | 无副作用（仅 IO 读）|

### A.2 明确不在首轮范围的工具（保持 mutation 串行）

以下工具即使表面看着是"读"，只要**可能触发副作用或权限检查**就保留 mutation 串行，**不**打 `readonly` tag：

- `run_in_terminal` / `terminalCommand` / 类似 — 执行 shell 命令，天然副作用
- `edit_file` / `create_file` / `delete_file` / `apply_patch` / 类似 — 写文件
- 所有 **MCP 工具**（来自 MCP server 的动态工具）— 外部 server 行为未知
- 所有 **chat participant 自定义工具**（通过 `@xxx` 触发）— 第三方实现未知
- 任何**需要用户确认**的工具（含 permission level 审核）— 并行会打乱确认 UX
- 任何**涉及网络请求**的工具（fetch / API 调用）— 速率限制 / auth 状态问题

### A.3 Rebase checklist（v2.25 决策 5 完整 6 步流程）

每次 VS Code 上游 rebase 后，**必须**在 rebase PR 描述中按此 6 步记录验证结果：

1. **现有 tag 存在性校验**：`rg "tags:\\s*\\[.*readonly.*\\]" vscode/src/vs/workbench/contrib/chat/browser/tools/` 检查 5 处现有 readonly tag 是否仍挂在正确工具定义上（上游若重命名/删除 tool，需同步调整）
2. **清单对照**：逐项核对上方 A.1 表格的 5 个 tool id 在当前代码中的实际注册覆盖情况
3. **新增 tool 评估**：扫描 rebase 本轮新增的 Tool 定义，若存在**明确无副作用**的只读工具（匹配 `read` / `search` / `list` / `get` 语义且 `invoke` 方法不调用文件写入/终端/网络副作用），**评估**是否追加到 readonly 清单
4. **二次核对**：若步骤 3 评估后决定追加，必须经过二次核对——"无副作用 + 无权限副作用"两条全满足，才允许打上 `tags: ['readonly']` 并追加到本附录 A.1 表格
5. **改名处理**：若 tool id 被上游改名，优先修正 Director-Code 侧 tag 引用而非保留旧 id；保留注释 `// [Director-Code] readonly-parallel-safe (renamed from <old-id> on <date>)` 便于追溯；同步更新本附录 A.1 表格
6. **PR 描述交付**：上述 5 步结果以简短文本形式写入 rebase PR 描述（例如 "readonly tag 清单验证：5/5 matched" 或 "readonly tag 清单验证：4/5 matched（`grep_search` 被上游改名为 `text_search`，已同步）"）

### A.4 上游改动约束

- **只在 Tool 定义处**加 `tags: [..., 'readonly']`（追加，不删除现有 tags）
- **每处**加注释 `// [Director-Code] readonly-parallel-safe`，方便 rebase 时识别
- **不**在本轮重构 `isToolReadOnly()` 逻辑，只消费 tag
- **不**扩展 readonly 判定到 `toolSet` 级别
- **上游若新增同名工具**：默认保持 mutation，除非主动通过上述 rebase checklist 步骤 3-4 确认可安全并行
