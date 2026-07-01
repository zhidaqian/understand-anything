# Codex 使用指南（中文）

本指南面向使用 **OpenAI Codex CLI** 的中文用户，介绍从安装、审批权限、仓库结构约定到高效工作流技巧的完整用法，并说明如何配合本仓库 **Understand-Anything** 使用。

> 提示：Codex CLI 迭代很快，命令行参数与配置项可能随版本变化。遇到不一致时，请以 `codex --help` 与官方文档为准。

---

## 目录

- [1. 什么是 Codex](#1-什么是-codex)
- [2. 安装与登录](#2-安装与登录)
- [🖥️ Codex 桌面应用（App）](#-codex-桌面应用app)
- [3. 快速开始](#3-快速开始)
- [4. 审批模式与绕过权限](#4-审批模式与绕过权限)
- [5. 仓库结构约定](#5-仓库结构约定)
- [6. 配置文件 config.toml](#6-配置文件-configtoml)
- [7. 与 Understand-Anything 集成](#7-与-understand-anything-集成)
- [8. 高效工作流技巧与循环用法](#8-高效工作流技巧与循环用法)
- [9. 用例：用提示词把一切自动化](#9-用例用提示词把一切自动化)
- [10. 常见问题](#10-常见问题)

---

## 1. 什么是 Codex

Codex CLI 是 OpenAI 推出的命令行编码智能体（coding agent）。它运行在你的终端里，能够：

- 阅读并理解整个代码仓库；
- 自主编辑文件、运行命令、执行测试；
- 在沙箱（sandbox）中安全地完成多步骤任务。

与在浏览器里聊天不同，Codex 直接在你的本地项目上工作，因此**权限**（审批）与**仓库结构约定**是使用它的两个核心概念。

---

## 2. 安装与登录

### 安装

```bash
# 通过 npm 全局安装（macOS / Linux / Windows 通用）
npm install -g @openai/codex

# 或使用 Homebrew（macOS）
brew install codex
```

**Windows（PowerShell）** 同样用 npm 安装即可：

```powershell
npm install -g @openai/codex
```

> Windows 用户推荐直接用 [Codex 桌面应用](#-codex-桌面应用app)——图形界面、ChatGPT 账号登录，沙箱与权限都由应用托管，最省心。

安装后验证：

```bash
codex --version
codex --help
```

### 登录

```bash
codex login
```

按提示在浏览器中用 **ChatGPT 账号**登录即可（ChatGPT Plus / Pro / Business / Edu / Enterprise 套餐均包含 Codex），也可以改用 API Key。

> 不想碰命令行？直接用 **Codex 桌面应用**——同样用 ChatGPT 账号登录，全程图形界面。见下一节。

---

## 🖥️ Codex 桌面应用（App）

除了命令行，Codex 还提供一个**桌面应用**，在 **macOS 与 Windows** 上都能用（Windows 版自 2026 年 3 月起提供）。它把「并行多线程、Git worktree、自动化、内置浏览器、审批权限」全部塞进图形界面——不用记命令，鼠标点点就能跑。这也是 Windows 用户最省心的方式。

### 安装与登录（三步）

1. **下载 Codex 应用**并安装（企业可通过 Microsoft Store + MDM 统一分发）。
2. 打开应用，用 **ChatGPT 账号登录**（Plus / Pro / Business / Edu / Enterprise 均含 Codex），或填入 OpenAI API Key。
3. 选择要打开的本地仓库文件夹，开始新建一个**线程**（thread）下达任务。

> **Windows 沙箱说明**：应用在 Windows 上原生运行时，使用 **PowerShell + Windows 沙箱**来隔离；如果你需要 Linux 原生环境，也可以在应用里配置成走 **WSL2**。这一切都由应用管理，你不需要手敲 PowerShell 命令。

### 应用的核心能力

| 能力 | 说明 |
|------|------|
| **并行线程** | 同时开多个线程，让多个 agent 各干各的，互不打架。 |
| **Git worktree** | 每个线程在独立 worktree 里改代码，天然隔离，方便分别 review diff。 |
| **自动化（Automations）** | 把常用任务做成可重复的一键动作；还能**定时**运行，或**唤醒**同一线程做周期性检查。 |
| **内置浏览器 / Computer Use** | 应用自带浏览器，agent 可以真正打开网页、点击操作——这正是做**市场调研**类任务的基础。 |
| **产物预览 / 插件 / 技能** | 直接预览生成的图表、文档等产物，并支持 plugins 与 skills（Understand-Anything 就是一个技能）。 |

### 在应用里设置权限（含"绕过"）

应用把权限收敛成三个模式，从线程里的权限菜单（等价于 CLI 的 `/permissions`）随时切换：

| 模式 | 能做什么 | 适用场景 |
|------|----------|----------|
| **Read Only（只读）** | 只能读代码、聊天、规划，不改任何文件。 | 方案设计、代码审阅、市场调研收集信息 |
| **Auto（自动）** | 在工作目录内自动读文件、改代码、跑命令。 | 日常开发（推荐默认） |
| **Full Access（完全访问）** | 解除沙箱：可访问系统任意文件并联网。**这就是"绕过权限"。** | 仅限隔离环境 |

> ⚠️ **绕过权限 = Full Access，请当作 `sudo` 看待**
> `Full Access` 完全移除沙箱限制，威力大也危险。**只应**在 Docker 容器、一次性虚拟机或实验性分支里使用。日常请用 `Auto`，它已足够顺手且保留基本隔离。
>
> 注：CLI 的 `--full-auto` 旧开关已在 v0.128 起弃用，官方转向**可组合的显式权限**（沙箱 / 审批 / 信任三者独立）——应用里的三个模式正是这一思路的图形化体现。

---

## 3. 快速开始

进入你的项目目录，直接运行：

```bash
cd your-project
codex
```

然后用自然语言描述任务，例如：

```
帮我把 src/utils/date.ts 里的时区处理改成使用 UTC，并补充单元测试
```

Codex 会分析代码、提出修改计划，并在**获得你的批准后**执行。

### 非交互（脚本/CI）模式

```bash
# 一次性执行任务并退出，适合脚本与 CI
codex exec "运行测试并修复所有失败的用例"
```

---

## 4. 审批模式与绕过权限

这是 Codex 最重要的概念。Codex 用两条正交的机制控制它能做什么：

1. **审批策略（approval policy）** — 什么时候需要你点头。
2. **沙箱策略（sandbox）** — 允许它读写哪些范围、能否联网。

### 4.1 审批策略 `--ask-for-approval`

| 取值 | 含义 |
|------|------|
| `untrusted` | 只有明确可信的命令自动执行，其余都要问你（最谨慎） |
| `on-failure` | 命令在沙箱中先跑，失败时才请求升级权限 |
| `on-request` | 由模型自行决定何时请求更高权限（默认较常用） |
| `never` | 从不询问；配合沙箱使用，全自动 |

```bash
codex --ask-for-approval on-failure
```

### 4.2 沙箱策略 `--sandbox`

| 取值 | 含义 |
|------|------|
| `read-only` | 只读，只能看不能改（最安全，适合代码理解/审阅） |
| `workspace-write` | 可读写当前工作目录，默认禁止联网 |
| `danger-full-access` | 无沙箱限制，可读写任意路径并联网（危险） |

```bash
codex --sandbox workspace-write
```

### 4.3 常用组合快捷方式

- **`--full-auto`** ≈ `workspace-write` 沙箱 + `on-failure` 审批。
  低摩擦、较安全：Codex 在工作目录内自动干活，只在真正卡住时才问你。

  ```bash
  codex --full-auto "重构这个模块并让所有测试通过"
  ```

  > 注：`--full-auto` 开关自 CLI v0.128 起已弃用，官方转向显式、可组合的权限（沙箱 / 审批 / 信任独立设置）。等价写法：`codex --sandbox workspace-write --ask-for-approval on-request "..."`。桌面应用里对应 **Auto** 模式。

### 4.4 绕过权限（YOLO 模式）⚠️

当你**完全信任**任务、且在**受控/隔离环境**（如一次性容器、CI 沙箱、Docker）中运行时，可以彻底绕过审批与沙箱：

```bash
codex --dangerously-bypass-approvals-and-sandbox "把整个仓库升级到最新依赖并修复破坏性变更"
```

也有等价的简写（视版本而定）：

```bash
codex --yolo "..."
```

> ⚠️ **安全警告**
> - `--dangerously-bypass-approvals-and-sandbox` 会关闭所有防护：Codex 可以删除文件、执行任意命令、访问网络。
> - **切勿**在你的主力开发机或包含敏感数据的环境中对不受信任的任务使用该模式。
> - 推荐仅在**一次性隔离容器**中使用，例如：
>   ```bash
>   docker run --rm -it -v "$PWD":/work -w /work node:24 bash
>   # 容器内再运行 codex --dangerously-bypass-approvals-and-sandbox ...
>   ```
> - 日常开发首选 `--full-auto`，它已经足够顺手且保留了基本防护。

### 4.5 也可在配置中固定

在 `~/.codex/config.toml` 里设置默认策略（见[第 6 节](#6-配置文件-configtoml)），避免每次都敲长参数。

---

## 5. 仓库结构约定

Codex 会自动读取项目中的约定文件，用它来"了解你的规矩"。良好的仓库结构能显著提升 Codex 的表现。

### 5.1 `AGENTS.md` — 给智能体的项目说明

在仓库根目录放一个 `AGENTS.md`，写清楚项目的关键信息。Codex 每次启动都会读取它。建议包含：

```markdown
# 项目说明（供智能体阅读）

## 技术栈
- Node.js >= 22，pnpm，TypeScript strict 模式，ESM

## 目录结构
- src/        业务源码
- packages/   工作区子包
- tests/      测试

## 常用命令
- 安装依赖：pnpm install
- 构建：    pnpm build
- 测试：    pnpm test
- 代码检查：pnpm lint

## 约定
- 所有改动都要保证 `pnpm test` 与 `pnpm lint` 通过
- 不要提交 .env、密钥或构建产物
- 提交信息使用中文，遵循 Conventional Commits
```

要点：
- **命令要写全**，让 Codex 知道如何构建/测试/检查，它才会主动跑起来验证自己的改动。
- **写明禁区**（不要动的文件、不要提交的内容）。
- `AGENTS.md` 支持分层：子目录也可以放各自的 `AGENTS.md`，就近覆盖父级说明。

### 5.2 推荐的仓库骨架

```
your-project/
├── AGENTS.md              # 给 Codex 的项目说明（必备）
├── README.md              # 面向人的说明
├── .gitignore
├── .codexignore           # 让 Codex 忽略的文件/目录（可选）
├── src/                   # 源码
├── tests/                 # 测试
├── docs/                  # 文档
└── package.json           # 声明脚本：build / test / lint
```

### 5.3 `.codexignore`（可选）

与 `.gitignore` 类似，用来把大目录、生成物、密钥目录排除在 Codex 的视野之外，既提速又更安全：

```
node_modules/
dist/
build/
.env*
*.log
coverage/
```

---

## 6. 配置文件 config.toml

全局配置位于 `~/.codex/config.toml`（Windows 为 `%USERPROFILE%\.codex\config.toml`）。用它设定默认模型、审批/沙箱策略、profile、MCP 服务器等。

```toml
# 默认模型
model = "gpt-5-codex"

# 默认审批与沙箱策略（等价于命令行参数）
approval_policy = "on-request"
sandbox_mode    = "workspace-write"

# 针对不同场景的 profile，用 `codex --profile <name>` 切换
[profiles.review]
approval_policy = "never"
sandbox_mode    = "read-only"        # 只读，适合代码审阅

[profiles.yolo]
approval_policy = "never"
sandbox_mode    = "danger-full-access"   # 仅在隔离容器里使用！

# MCP 服务器（让 Codex 接入外部工具）
[mcp_servers.example]
command = "npx"
args    = ["-y", "some-mcp-server"]
```

切换 profile：

```bash
codex --profile review "审阅这个 PR 的改动，指出潜在 bug"
```

---

## 7. 与 Understand-Anything 集成

本仓库的 **Understand-Anything** 支持 Codex 平台，一行命令即可安装为 Codex 的技能（skill）：

```bash
curl -fsSL https://raw.githubusercontent.com/Lum1104/Understand-Anything/main/install.sh | bash -s codex
```

安装脚本会把仓库克隆到 `~/.understand-anything/repo`，并在 `~/.agents/skills` 下为 Codex 建立按技能拆分的符号链接。安装后重启 Codex CLI。

随后你就可以让 Codex 调用理解类技能，例如让它先"读懂"一个陌生代码库、生成交互式知识图谱，再动手改代码。

- 更新：`./install.sh --update`
- 卸载：`./install.sh --uninstall codex`

> 建议搭配 `--sandbox read-only` 做纯理解/审阅任务——这样即使 Codex 探索整个仓库，也绝不会误改任何文件。

---

## 8. 高效工作流技巧与循环用法

下面是一组能显著提升日常效率的技巧，重点是把 Codex 用成**可迭代的循环**，而不是一问一答。

### 技巧 1 — 让它自己跑测试形成"改→测→修"闭环

在 `AGENTS.md` 里写清测试命令后，直接下达带验收标准的任务：

```
实现 feature X，并确保 `pnpm test` 全部通过；如果失败就自己修，直到全绿。
```

配合 `--full-auto`，Codex 会自动进入 **编辑 → 运行测试 → 读报错 → 再修** 的循环，直到达成目标。

### 技巧 2 — 用 `codex exec` 做批处理循环

对多个目标重复同一操作，可以用 shell 循环包裹非交互模式：

```bash
for pkg in packages/*; do
  codex exec --full-auto "为 $pkg 补齐缺失的 TypeScript 类型并让其构建通过"
done
```

这在做大规模迁移、批量修复、统一风格时非常好用。

### 技巧 3 — "循环收集技巧"式自我改进

让 Codex 在完成任务后，把学到的项目约定、踩过的坑追加回 `AGENTS.md`，形成正反馈：

```
完成任务后，把本次发现的项目约定/易错点，简洁地追加到 AGENTS.md 的"约定"小节。
```

下次它就更懂你的项目——仓库知识随使用不断累积。

### 技巧 4 — 先规划再动手

对复杂任务，先让它只输出计划（不改文件）：

```
先只给出实现计划和涉及的文件清单，不要改任何代码，等我确认。
```

确认后再放开 `--full-auto` 执行。这样能在动手前对齐方向，避免大范围返工。

### 技巧 5 — 小步提交，便于回滚

要求 Codex 每完成一个逻辑单元就提交一次：

```
每完成一个独立改动就 git commit 一次，提交信息用中文说明"做了什么、为什么"。
```

出问题时可以精确回退到某一步。

### 技巧 6 — 按场景切 profile

- 读代码 / 审 PR：`codex --profile review`（只读，零风险）。
- 日常开发：`codex --full-auto`。
- 隔离容器里的批量重活：`codex --profile yolo`。

### 技巧 7 — 明确"完成的定义"

模糊的任务得到模糊的结果。给出可验证的验收标准：

> ❌ "优化一下性能"
> ✅ "把 `parse()` 的耗时从 O(n²) 降到 O(n log n)，并新增基准测试证明提升，测试要通过"

---

## 9. 用例：用提示词把一切自动化

Codex 的真正威力在于——**你几乎只用写"提示词（prompt）"，就能把整条流程自动化**。下面给出几个从"下达指令"到"落地产物"的完整例子。原则是：**说清目标 + 说清产物 + 说清验收标准**，剩下交给 agent。

### 用例 A — 市场调研（Read Only + 内置浏览器）

在应用里新建线程，选 **Read Only** 模式（只读、零风险），下达：

```
你是一名市场研究员。用内置浏览器调研"面向中小团队的 AI 代码助手"市场：
1. 列出 6-8 个主要产品，整理定价、目标用户、核心卖点、明显短板；
2. 汇总成一张 Markdown 对比表，并写一段 200 字的机会点分析；
3. 每条结论后面附上来源链接。
把结果保存为 research/ai-coding-assistants.md。
```

Codex 会用内置浏览器逐个网站取证、整理成表格产物，你可在应用里直接预览。**只读模式**保证它绝不会误改你的文件。

### 用例 B — 搭一个"自动化 agent"（Automations + 定时）

想要一个每天自检的助手？用应用的 **Automations**（自动化）把一段提示词变成定时任务：

```
每个工作日 09:00：
1. git pull 拉取最新代码；
2. 运行 `pnpm test` 与 `pnpm lint`；
3. 若有失败，用一段中文摘要列出失败项与可能原因；
4. 把摘要追加到 reports/daily-YYYYMMDD.md。
只在有失败时提醒我。
```

保存为自动化后，它会**按时唤醒同一线程**重复执行——这就是一个"值班 agent"。同理可做：每天汇总依赖更新、每周生成变更周报、监控某网页有无更新。

### 用例 C — 从零搭项目骨架（Auto 模式）

```
帮我初始化一个 TypeScript + Vitest 的库项目：
- 生成 package.json（含 build/test/lint 脚本）、tsconfig、eslint 配置；
- 建立 src/ 与 tests/ 目录与示例文件；
- 写一份 AGENTS.md 说明技术栈、命令与约定；
- 最后运行一次 test 确认全绿，并 git 初始化提交。
```

### 用例 D — 批量重构 / 迁移（Auto + worktree）

开多个并行线程，每个线程在独立 worktree 里处理一个子包，互不干扰：

```
把 packages/ 下所有子包从 CommonJS 迁移到 ESM，逐包修改并保证各自构建通过；
每完成一个子包就 commit 一次，提交信息说明改了什么。
```

### 写好提示词的通用配方

> **角色 + 目标 + 步骤 + 产物 + 验收 + 边界**
> - **角色**：你是一名市场研究员 / 资深后端工程师……
> - **目标**：要解决的问题，一句话说清。
> - **步骤**：拆成有序小步，降低跑偏概率。
> - **产物**：明确落到哪个文件、什么格式（表格 / 报告 / 代码）。
> - **验收**：可验证的完成标准（"测试全绿""附来源链接"）。
> - **边界**：不要动什么、失败时怎么办、需不需要先给计划。

把这套配方写进 `AGENTS.md` 或自动化里，就能让 Codex 稳定复现你想要的结果——**一切皆可由提示词驱动**。

---

## 10. 常见问题

**Q：每一步都要我确认，太慢了怎么办？**
A：切到 **Auto** 模式（应用里选，或 CLI 用 `--sandbox workspace-write --ask-for-approval on-request`）——它在工作目录内自动干活，只在必要时才问你。也可在 `config.toml` 里设为默认。

**Q：绕过权限安全吗？**
A：绕过权限就是 **Full Access**（CLI 的 `--dangerously-bypass-approvals-and-sandbox`），会关闭全部防护，只应在一次性隔离容器 / CI 沙箱中对可信任务使用。日常请用 **Auto**。

**Q：Codex 改错了怎么办？**
A：养成小步提交的习惯（技巧 5），用 `git diff` / `git restore` / `git reset` 精确回退。

**Q：怎么让 Codex 更懂我的项目？**
A：认真写 `AGENTS.md`（第 5 节），把技术栈、目录、命令、禁区都说清楚；并用技巧 3 让它持续补充。

**Q：只想让它读代码、不改文件？**
A：`codex --sandbox read-only`，或使用只读的 `review` profile。

**Q：我在 Windows 上用，需要注意什么？**
A：Windows 上最省心的方式是用 [Codex 桌面应用](#-codex-桌面应用app)：ChatGPT 账号登录，权限从三档模式里选（Read Only / Auto / Full Access），沙箱由应用托管；需要 Linux 原生环境时可在应用里切到 WSL2。高权限（Full Access）任务仍建议放进容器或一次性 VM。

---

## 参考

- Codex CLI 帮助：`codex --help`
- OpenAI Codex 官方文档：<https://developers.openai.com/codex/cli>
- Understand-Anything 安装：见仓库根目录 [`README.zh-CN.md`](../READMEs/README.zh-CN.md)
