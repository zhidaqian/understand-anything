# Codex 使用指南（中文）

本指南面向使用 **OpenAI Codex CLI** 的中文用户，介绍从安装、审批权限、仓库结构约定到高效工作流技巧的完整用法，并说明如何配合本仓库 **Understand-Anything** 使用。

> 提示：Codex CLI 迭代很快，命令行参数与配置项可能随版本变化。遇到不一致时，请以 `codex --help` 与官方文档为准。

---

## 目录

- [1. 什么是 Codex](#1-什么是-codex)
- [2. 安装与登录](#2-安装与登录)
- [3. 快速开始](#3-快速开始)
- [4. 审批模式与绕过权限](#4-审批模式与绕过权限)
- [5. 仓库结构约定](#5-仓库结构约定)
- [6. 配置文件 config.toml](#6-配置文件-configtoml)
- [7. 与 Understand-Anything 集成](#7-与-understand-anything-集成)
- [8. 高效工作流技巧与循环用法](#8-高效工作流技巧与循环用法)
- [9. 常见问题](#9-常见问题)

---

## 1. 什么是 Codex

Codex CLI 是 OpenAI 推出的命令行编码智能体（coding agent）。它运行在你的终端里，能够：

- 阅读并理解整个代码仓库；
- 自主编辑文件、运行命令、执行测试；
- 在沙箱（sandbox）中安全地完成多步骤任务。

与在浏览器里聊天不同，Codex 直接在你的本地项目上工作，因此**权限（审批）**与**仓库结构约定**是使用它的两个核心概念。

---

## 2. 安装与登录

### 安装

```bash
# 通过 npm 全局安装
npm install -g @openai/codex

# 或使用 Homebrew（macOS）
brew install codex
```

安装后验证：

```bash
codex --version
codex --help
```

### 登录

```bash
codex login
```

按提示在浏览器中完成 OAuth 授权，或使用 API Key：

```bash
export OPENAI_API_KEY="sk-..."
```

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

全局配置位于 `~/.codex/config.toml`。用它设定默认模型、审批/沙箱策略、profile、MCP 服务器等。

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

## 9. 常见问题

**Q：每一步都要我确认，太慢了怎么办？**
A：改用 `--full-auto`（工作目录内自动干活，只在失败时问你），或在 `config.toml` 里设默认策略。

**Q：绕过权限安全吗？**
A：`--dangerously-bypass-approvals-and-sandbox` 会关闭全部防护，只应在一次性隔离容器 / CI 沙箱中对可信任务使用。日常请用 `--full-auto`。

**Q：Codex 改错了怎么办？**
A：养成小步提交的习惯（技巧 5），用 `git diff` / `git restore` / `git reset` 精确回退。

**Q：怎么让 Codex 更懂我的项目？**
A：认真写 `AGENTS.md`（第 5 节），把技术栈、目录、命令、禁区都说清楚；并用技巧 3 让它持续补充。

**Q：只想让它读代码、不改文件？**
A：`codex --sandbox read-only`，或使用只读的 `review` profile。

---

## 参考

- Codex CLI 帮助：`codex --help`
- OpenAI Codex 官方文档：<https://developers.openai.com/codex/cli>
- Understand-Anything 安装：见仓库根目录 [`README.zh-CN.md`](../READMEs/README.zh-CN.md)
