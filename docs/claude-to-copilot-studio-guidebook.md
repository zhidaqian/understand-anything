# 把 Claude 智能体迁移到 Microsoft Copilot Studio：转换手册

> 一份面向开发者的实战指南：如何把一个用 Claude 构建的智能体（Claude Code 子智能体 / 技能、Claude Agent SDK、Anthropic Messages API 工具调用、以及它们背后的 MCP），系统性地搬到 **Microsoft Copilot Studio** 这套低代码智能体平台上。
>
> 本手册的事实条目来自一次多源联网调研（6 个检索角度、26 个一手来源、抽取 48 条论断、核验 25 条），并以一手来源为准——Claude 侧取自 Anthropic / Claude 官方文档，Copilot Studio 侧取自 Microsoft 官方博客与 Microsoft Learn。两条经核验**被推翻**的论断已在正文中按「请勿这样断言」处理。数据截至 2025 年底 / 2026 年中。

---

**CLAUDE → COPILOT STUDIO 转换手册 · 第 1 章**

# 第 1 章——两种世界观：代码优先的 Claude 与低代码的 Copilot Studio

迁移的第一道坎，不是工具，而是世界观。Claude 的智能体是**代码优先（code-first）**的：一个智能体往往就是一个带 YAML frontmatter 的 Markdown 文件、一段系统提示词（system prompt）、一组工具定义（JSON Schema），外加若干 MCP 服务器——它的灵魂是「提示词 + 工具」，开发者像写代码一样把它敲出来、用 git 管起来。而 Copilot Studio 是**低代码（low-code）**的：一个智能体由智能体指令（agent instructions）、主题（topics）、动作（actions）、连接器（connectors）、知识源（knowledge sources）、以及生成式编排（generative orchestration）拼装而成，主战场是浏览器里的可视化门户与 Power Platform 治理体系。把前者搬到后者，本质上是把「一段被精心打磨的提示词 + 一堆函数」翻译成「一套被企业治理框起来的、声明式的智能体配置」。

在动手之前，必须先拆穿一个最常见、也最致命的混淆：**Microsoft Copilot Studio ≠ GitHub Copilot CLI**。这是两个完全不同的产品。Copilot Studio 是面向业务的低代码 SaaS 平台，产出能发布到 Teams、Microsoft 365 Copilot 等渠道的智能体；GitHub Copilot CLI 则是一个跑在终端里的编码智能体，和 Claude Code 是同一物种。网上不少题为「从 Claude Code 迁移」的指南——例如 [github.com/drvoss/everything-copilot-cli](https://github.com/drvoss/everything-copilot-cli/blob/main/guides/migration-from-claude-code.md) 里的 `migration-from-claude-code.md`——经核验，其映射关系（`CLAUDE.md` → `copilot-instructions.md`、`.claude/skills/` → `skills/`、斜杠命令 → `agent_type` 参数）针对的是 **GitHub Copilot CLI，而非 Copilot Studio**，因此**不适用**于 Copilot Studio 的主题／连接器低代码范式。该指南里有一条结论倒是普适且有用：Claude Code 技能与 Copilot CLI 技能格式几乎一致（都是带 YAML frontmatter 的 Markdown），所以在 **CLI 语境**下技能迁移很直接——但请记住，这条便利属于 CLI，不属于 Studio。本手册讲的，自始至终是 Copilot Studio。

好消息是：这条鸿沟近一年已被微软自己大幅填平。两件事让「Claude → Copilot Studio」从「彻底重写」变成了「有桥可走」：其一，Copilot Studio **原生支持了 MCP**（已正式可用 GA），意味着 Claude 智能体挂载的那些 MCP 工具有望被整体复用；其二，**Anthropic 的 Claude 模型已进入 Copilot Studio 的多模型阵容**，可作为智能体的后端模型。换句话说，你既能把 Claude 的「手」（工具）搬过去，也能把 Claude 的「脑」（模型）请过去。后面几章会把这两座桥逐一走通。

---

**CLAUDE → COPILOT STUDIO 转换手册 · 第 2 章**

# 第 2 章——拆解源端：Claude 智能体的四种构件

要迁移，先得把源端拆清楚。Claude 侧的「智能体」其实是四种构件的统称，迁移时它们各自对应 Copilot Studio 的不同位置，绝不能一锅烩。

**■ 构件一：Claude Code 子智能体（Subagents）**

子智能体是一个带 YAML frontmatter 的 Markdown 文件：frontmatter 写配置（`name`、`description`、`tools`、`model`），Markdown 正文就是它的系统提示词；其中只有 `name` 和 `description` 是必填（[code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents)）。工具访问由 `tools` 白名单控制（省略则继承全部工具），或用 `disallowedTools` 黑名单收口；`model` 字段选模型（`sonnet`/`opus`/`haiku`/`fable`、完整模型 ID、或 `inherit`，默认 `inherit`）。编排方式是**按描述自动委派**：每个子智能体跑在自己独立的上下文窗口里，有自定义系统提示、特定工具访问与独立权限，任务完成后**只把结果**返回主对话——这正是 understand-anything 那条 project-scanner → file-analyzer → architecture-analyzer 流水线的同款机制。子智能体还能通过 `mcpServers` frontmatter 字段挂载 MCP 服务器（按名引用已配置的服务器，或内联定义），这让 MCP 成为 Claude 智能体模型里的一等集成机制。存储有明确的作用域优先级：受管设置（最高）> `--agents` CLI 参数 > 项目 `.claude/agents/` > 用户 `~/.claude/agents/` > 插件 `agents/` 目录（最低），而身份只由 `name` 字段决定。

**■ 构件二：Claude 技能（Agent Skills）**

技能由一个 `SKILL.md` 文件定义，frontmatter 只有两个必填字段：`name`（≤64 字符，仅小写字母／数字／连字符）与 `description`（非空，≤1024 字符，且要同时说清「做什么」和「何时该用」）（[platform.claude.com/.../agent-skills/overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)）。技能的精髓是**三级渐进式披露（progressive disclosure）**：第 1 级元数据（name/description，启动时常驻，约 100 tokens）；第 2 级 SKILL.md 正文指令（触发时加载，<5k tokens）；第 3 级捆绑的资源／代码（按需加载，几乎不限量）。Claude Code 只支持**自定义（文件系统）技能**，从含 `SKILL.md` 的目录里自动发现，存于 `~/.claude/skills/` 或项目 `.claude/skills/`，**无需 API 上传**。而经由 Claude API 使用时，技能跑在一个**无网络、无运行时装包**的代码执行容器里，需要三个 beta 头（`code-execution-2025-08-25`、`skills-2025-10-02`、`files-api-2025-04-14`）并在 container 参数里指定 `skill_id`。一个与迁移高度相关的事实：Anthropic 的预置技能（pptx/xlsx/docx/pdf）与自定义技能**已可在 Microsoft Foundry 上使用**，沿用与 Claude API 相同的「经 Skills API 上传」机制——这是 Claude 技能进入微软生态的一条官方通道。

**■ 构件三：Messages API 的工具定义（Tool Use）**

最底层的构件，是 Anthropic Messages API 的工具定义：一个 JSON 对象，含必填 `name`（匹配 `^[a-zA-Z0-9_-]{1,64}$`）、纯文本 `description`、以及作为 JSON Schema 的 `input_schema`；所有客户端工具都放在请求顶层的 `tools` 参数里（[docs.anthropic.com/.../tool-use/implement-tool-use](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use)）。这里有个对迁移很关键的细节：当你传入 `tools` 时，API 会**自动从工具定义、工具配置和用户系统提示三者拼出一个特殊的系统提示**——也就是说，「用户系统提示」与「工具 schema」是两份**彼此独立、可组合**的输入。记住这一点，因为到了 Copilot Studio，它俩会被拆到两个不同的地方去（指令 vs 动作）。调用时 Claude 产出一个 `tool_use` 内容块（含 `id`/`name`/`input`），可在其前夹带自然语言；`tool_choice` 可设 `auto`/`any`/`tool`/`none`。Anthropic 的两条工具设计最佳实践尤其能平滑迁移：一是**给极其详细的描述**（每个工具建议至少 3–4 句，这是工具表现最重要的因素）；二是**把相关操作合并进单个带 `action` 参数的工具**，并用服务前缀命名（如 `github_list_prs`、`slack_send_message`）——后者在概念上正好对应 Copilot Studio「把动作归到连接器名下」的组织方式。

**■ 构件四：Agent SDK 与 MCP 传输**

Claude Agent SDK 把上述构件编排成可运行的智能体，其与外部世界的接口主要是 MCP。SDK 支持三类 MCP 传输（[docs.claude.com/en/docs/agent-sdk/mcp](https://docs.claude.com/en/docs/agent-sdk/mcp)）：`stdio`（本地进程，走 stdin/stdout）、HTTP/SSE（远端／云托管，走 URL）、以及**进程内 SDK MCP 服务器**（直接在应用代码里定义自定义工具）。流式 HTTP 用 `type: "http"`；在 `.mcp.json` 等配置文件里 `streamable-http` 是可接受的别名，但编程用的 `mcpServers` 选项只认 `http`。MCP 工具遵循 `mcp__<server-name>__<tool-name>` 命名（如 `github` 服务器的 `list_issues` 工具变成 `mcp__github__list_issues`）；工具必须经 `allowedTools` 显式授权 Claude 才能调用，通配符 `mcp__github__*` 可一次性放行某服务器的全部工具。配置可写在代码里（传给 `query()` 的 `mcpServers`），也可放进项目根的 `.mcp.json`（经 `settingSources` 加载，需启用 `project` 来源）。鉴权方面，MCP 规范支持 OAuth 2.1，但 SDK **不自动处理** OAuth 流程——开发者需在自己应用里走完流程，再把拿到的 access token 经 Authorization 头传入。这一层与迁移的关系最直接：**MCP 是把 Claude 的工具整体搬进 Copilot Studio 的那条高速公路**，详见第 4 章。

---

**CLAUDE → COPILOT STUDIO 转换手册 · 第 3 章**

# 第 3 章——概念映射表：每个构件落到 Copilot Studio 的哪里

把第 2 章拆出的构件，逐一映射到 Copilot Studio 的对应物，迁移的骨架就立起来了。这张映射是整本手册的脊梁：

- **系统提示词（Markdown 正文 / API system prompt）→ 智能体指令（agent instructions）。** 这是最干净的一对一。把子智能体正文或 API 的 system prompt 原文搬进 Copilot Studio 的指令框即可。回忆第 2 章那条事实——Claude 把「系统提示」与「工具 schema」当两份独立输入；Copilot Studio 同样把「指令」与「动作」分开，所以这一步天然对齐：指令归指令，工具归动作。
- **单个子智能体 → 一个 Copilot Studio 智能体；多子智能体编排 → 连接的智能体（connected agents）／多智能体编排。** Claude「主智能体按描述委派子智能体、子智能体各自独立上下文、只回传结果」的模式，在 Copilot Studio 对应**多智能体编排**——经核验，Copilot Studio 的多智能体编排可以**协调多个使用不同主模型的智能体**，因此一个 Claude 后端的智能体完全可以作为其中一员参与协作（[Anthropic joins the multi-model lineup](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/anthropic-joins-the-multi-model-lineup-in-microsoft-copilot-studio/)）。
- **工具定义（JSON Schema）→ 动作（actions）／连接器（connectors）／MCP。** 这是工作量最大的一对多。一次性的 REST 调用适合做成自定义连接器或 Power Automate 流；而如果你的 Claude 工具本就由 MCP 服务器提供，那么**别逐个重写**——直接走 MCP（第 4 章）。Anthropic「相关操作合并成带 `action` 参数的单一工具、用服务前缀命名」的建议，恰好预演了 Copilot Studio「动作归属连接器」的结构，迁移时几乎可以照搬分组。
- **技能（Skills）→ 视情况拆解。** 技能里「告诉模型怎么做」的指令部分，并入智能体指令；技能捆绑的参考资料／文档，做成**知识源（knowledge sources）**；若技能依赖代码执行，则更适合走 Microsoft Foundry——Anthropic 预置技能与自定义技能已可经 Foundry 的 Skills API 使用。
- **RAG / 检索知识 → 知识源（knowledge sources）。** Claude 侧塞进上下文或经检索喂入的领域知识，在 Copilot Studio 直接配置为知识源，交给平台做检索与编排。
- **MCP 服务器 → MCP（原生）。** Copilot Studio 已原生支持 MCP，这是整张映射里**性价比最高**的一格，单列第 4 章细讲。

一句话记住这张表：**提示词搬去「指令」，工具优先走「MCP」、否则做「连接器」，知识进「知识源」，多智能体用「连接的智能体」，而模型本身也可以继续是 Claude。**

---

**CLAUDE → COPILOT STUDIO 转换手册 · 第 4 章**

# 第 4 章——MCP：把工具整体搬过去的高速公路

如果你的 Claude 智能体把能力都放在 MCP 服务器里，那么这一章就是整本手册里最省力的一段路。经核验的核心事实是：**MCP 已在 Microsoft Copilot Studio 正式可用（GA）**（[MCP is now generally available in Copilot Studio](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/model-context-protocol-mcp-is-now-generally-available-in-microsoft-copilot-studio/)）。其机制设计得相当优雅：MCP 服务器**经由现有的连接器基础设施**接入 Copilot Studio，而**该 MCP 服务器发布的每一个工具，都会被自动转成 Copilot Studio 里的一个动作（action）**。也就是说，你在 Claude 侧那些 `mcp__server__tool` 形态的工具，搬到 Copilot Studio 后会一一变成可被智能体调用的动作，无需逐个手工重建。

接入方式很直接：对于已有的 MCP 服务器，在智能体里选「**添加工具（Add a Tool）**」，搜索你的 MCP 服务器即可（[Introducing MCP in Copilot Studio](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/introducing-model-context-protocol-mcp-in-copilot-studio-simplified-integration-with-ai-apps-and-agents/)）。这里要纠正一条**已过时、经核验被推翻**的说法：早期资料称「自定义 MCP 接入必须先用 SDK 建服务器、再额外构建一个自定义连接器把 MCP 服务器接到 Copilot Studio」——在 MCP GA 之后，这条「**必须再建自定义连接器**」的要求已不成立，应以「Add a Tool → 搜索 MCP 服务器」为准。请勿在迁移文档里继续断言「必须手搓自定义连接器」。

三条必须记牢的约束与红利：

其一，**必须启用生成式编排（generative orchestration）才能使用 MCP**。这是硬性前提——若你的 Copilot Studio 智能体还停在经典编排，MCP 工具不会生效。

其二，**它白拿了 Power Platform 的企业治理**。因为 MCP 跑在连接器基础设施上，所以它直接继承了虚拟网络（VNet）集成、数据丢失防护（DLP）、以及多种鉴权方式等企业安全与治理控制。对从 Claude「开发者自己用 Authorization 头管 OAuth」迁过来的团队，这意味着鉴权与合规从「代码里自理」变成了「平台层托管」。

其三，**留意传输层（transport）的演进**。Copilot Studio 最初的 MCP 支持以 **SSE（Server-Sent Events）** 为传输、且发布时处于预览；其后传输层扩展到**可流式（streamable HTTP）**，而 **SSE 已被弃用**（仍保留在公共预览中）。迁移时优先按可流式 HTTP 规划，别把新集成压在已弃用的 SSE 上。

迁移结论很清楚：**凡是 Claude 侧以 MCP 暴露的能力，迁移策略一律是「复用 MCP」，而不是「在 Copilot Studio 里重写连接器」**——这是这套迁移里投入产出比最高的决定。

---

**CLAUDE → COPILOT STUDIO 转换手册 · 第 5 章**

# 第 5 章——反向驱动：用 Claude 来构建 Copilot Studio，并让 Claude 当后端模型

这一章讲两件让「Claude 人」感到惊喜的事：你不必离开 Claude，就能构建 Copilot Studio 智能体；而且搬过去之后，智能体的大脑可以**继续是 Claude**。

**■ 用 Claude Code 构建 Copilot Studio：Skills for Copilot Studio 插件**

迁移中最实用的一项发现，是微软开源的「**Skills for Copilot Studio**」插件（来自微软 Copilot Studio 客户顾问团队 MCSCAT，[microsoft.github.io/mcscatblog/.../skills-for-copilot-studio](https://microsoft.github.io/mcscatblog/posts/skills-for-copilot-studio/)）。它让开发者通过**生成／编辑 YAML 文件**来创作、测试、排障 Copilot Studio 智能体——YAML 直接对应 Copilot Studio 的原生构件：主题（topics）、动作（actions）、知识（knowledge）、触发器（triggers）、变量（variables）。它把建智能体从「在门户里点来点去」重塑为**代码／YAML 优先**的工作流：自然语言需求 → 生成 YAML 形态的智能体架构 → 推送到 Copilot Studio，官方宣称最高可达 20 倍开发提速（此为项目自述，非第三方实测）。

对从 Claude 迁移的人来说，这个插件最妙的一点是：它**被明确设计为运行在 Claude Code 之内**（同时也支持 GitHub Copilot CLI 与 VS Code）——这就在「Claude 编码智能体」与「Copilot Studio 智能体创作」之间架了一座直接的桥。你可以让 Claude Code 读懂你原有的子智能体／技能，再驱动这个插件把等价的 Copilot Studio 智能体以 YAML 生成出来。插件本身还**暴露了三个分别对应开发生命周期不同阶段（创作 vs 测试／排障）的专用子智能体**，这本身就是一次面向 Copilot Studio 的多智能体分解——与 Claude 子智能体的思路同源。

但有一条**必须写进迁移清单的坑**：**Copilot Studio 的 YAML schema 不稳定，可能在不通知的情况下变更**，因此生成的智能体定义务必先人工审阅、校验后再用。把这条当成迁移流程里的强制门禁，别让生成的 YAML 直接进生产。

**■ 让 Claude 当后端模型：Copilot Studio 的多模型阵容**

迁移不一定意味着换脑。经核验，自 **2025 年 9 月 24 日**起，**Anthropic Claude 模型已作为后端模型进入 Microsoft Copilot Studio**，与 OpenAI 模型一同推出（[Anthropic joins the multi-model lineup](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/anthropic-joins-the-multi-model-lineup-in-microsoft-copilot-studio/)）。Claude 可**按场景选用**于智能体——包括提示构建器（prompt builder）和自定义提示中——用于构建与编排智能体；前述多智能体编排还能协调多个使用不同主模型的智能体。两条治理事实要记牢：使用 Anthropic 模型**需先由管理员在 Microsoft 365 管理中心启用**；**若未启用，智能体会回退到默认模型 OpenAI GPT-4o**。（注：关于「Copilot Studio 里具体提供哪几个 Claude 版本」的某条坊间说法经核验**被推翻**，故本手册不锁定具体版本号——请以 Copilot Studio 内当时实际可选项与管理中心为准。）

**■ 更靠近代码的一层：Claude in Microsoft Foundry**

若你的迁移需要更接近开发者平台的能力，可走 Microsoft Foundry 这条线。经核验，**Claude Sonnet 4.5、Haiku 4.5、Opus 4.1 已在 Microsoft Foundry 公共预览**，经**无服务器（serverless）部署**提供、由 Anthropic 托管基础设施（[Claude in Microsoft Foundry](https://www.anthropic.com/news/claude-in-microsoft-foundry)）。这些模型在 Foundry 支持一整套 Claude 开发者平台能力：代码执行工具、网页搜索与抓取、引用（citations）、视觉、工具调用、提示缓存等。商务上，Claude in Foundry **符合 Microsoft Azure 消费承诺（MACC）资格**，沿用现有 Azure 协议与账单、无需另行供应商审批。还有一条信号说明这条整合已相当深入：**Claude 已在为 Microsoft 365 Copilot 里的 Researcher 智能体提供算力**，处理复杂的多步研究任务，并支持在 Copilot Studio 中进行自定义智能体开发。

---

**CLAUDE → COPILOT STUDIO 转换手册 · 第 6 章**

# 第 6 章——迁移实操、坑位与治理

把前五章收拢成一条可执行的迁移路径，并把所有坑集中列清。

**■ 推荐迁移流程**

1. **盘点源端构件**：把你的 Claude 智能体拆成第 2 章的四类——子智能体（系统提示 + 工具 + 模型）、技能、API 工具定义、MCP 服务器。
2. **优先走 MCP**：凡是经 MCP 暴露的能力，规划为「在 Copilot Studio 里 Add a Tool → 搜索 MCP 服务器」，并**启用生成式编排**。这一步能省掉绝大部分工具重写。
3. **搬运提示词**：子智能体正文 / API system prompt → 智能体指令。
4. **重建非 MCP 工具**：一次性 REST 调用做成自定义连接器 / Power Automate 流；按 Anthropic 的「合并操作 + 服务前缀」分组对齐到连接器。
5. **安置知识**：技能附带资料与 RAG 语料 → 知识源。
6. **决定大脑**：是否启用 Claude 作为后端模型（需管理员在 M365 管理中心开启），或走 Foundry。
7. **（可选）用 Claude Code 加速**：借 Skills for Copilot Studio 插件，从需求直接生成 Copilot Studio 智能体的 YAML，再人工校验。
8. **重测编排逻辑**：Claude 的「按描述自动委派」与 Copilot Studio 的生成式编排判定机制不同，迁移后务必重新测试多智能体协作与触发行为。

**■ 坑位清单**

- **别把 Copilot Studio 当成 GitHub Copilot CLI**。网上多数「从 Claude Code 迁移」的指南针对的是 CLI，其 `CLAUDE.md→copilot-instructions.md`、`.claude/skills→skills/`、斜杠命令→`agent_type` 等映射**不适用**于 Copilot Studio。
- **YAML schema 不稳定**。Skills for Copilot Studio 生成的定义可能因 schema 无预告变更而失效，必须人工审阅校验后再用。
- **MCP 接入别再手搓自定义连接器**。GA 之后正确路径是「Add a Tool → 搜索 MCP 服务器」；旧资料里「必须额外建自定义连接器」的说法已被推翻。
- **生成式编排是 MCP 的前提**。忘了开它，MCP 工具不工作。
- **传输层选型**：优先可流式 HTTP，SSE 已弃用（仅留在公共预览）。
- **模型治理**：Claude 后端需管理员显式启用，否则静默回退到 GPT-4o——迁移后若发现「智能体不像 Claude」，先查这里。
- **别锁定具体 Claude 版本号**：Copilot Studio 内的可选 Claude 版本以平台当时实际项为准（坊间的具体版本清单经核验不可靠）。

**■ 治理与最佳实践**

迁移到 Copilot Studio 的最大范式收益，是鉴权、合规与数据治理从「开发者在代码里自理」上移到「平台层托管」：MCP 走连接器基础设施即自动获得 VNet、DLP 与多种鉴权。相应地，最佳实践也随之改变——把原来散落在 Claude Agent SDK OAuth 处理、`allowedTools` 白名单里的安全意图，翻译成 Power Platform 的 DLP 策略与连接器治理；把原来用「极其详细的工具描述」驱动选择的工程经验，转化为清晰的智能体指令 + 结构化连接器 schema。Claude 侧那套「描述即接口」的直觉依然有用，只是落点从提示词，变成了 Copilot Studio 里被治理框起来的声明式配置。下一章把这些最佳实践按主题展开成一份可逐条对照的清单。

---

**CLAUDE → COPILOT STUDIO 转换手册 · 第 7 章**

# 第 7 章——迁移最佳实践（逐主题清单）

迁移的成败，往往不在「能不能搬」，而在「搬得对不对」。这一章把散落在前六章的经验，连同从源端构件自然推导出的工程纪律，整理成八组可逐条对照的最佳实践。贯穿其中的一条总原则是：**不要原样平移（lift-and-shift），而要按平台的强项重新架构（re-architect）**——Claude 的提示词与工具是为「代码优先」打磨的，Copilot Studio 要的是「声明式 + 受治理」。

**■ 指令设计（Instructions）**

- **别把 Claude 系统提示原样粘进去。** Claude 的 system prompt 里常夹带宿主特有措辞（工具名、`You are Claude Code`、harness 指令）；迁移时先剥掉这些，把它重构成「角色 + 目标 + 步骤规则 + 护栏」的清晰结构。
- **指令要短、要声明式；长资料下沉到知识源。** 这正是把 Claude 技能「三级渐进式披露」的智慧搬过来：元信息留指令，参考资料进知识源，别把万字文档塞进指令框。
- **把「何时用哪个工具／智能体」写清楚。** 生成式编排靠描述做路由，机理与 Claude 子智能体「按描述委派」一致——所以 Anthropic「给极其详细的描述（每项≥3–4 句）」的纪律，要原封不动地带到动作描述与连接的智能体描述上。

**■ 工具与动作设计（Actions）**

- **能走 MCP 的一律走 MCP，别重写。** 只有一次性的 REST 调用才值得做成自定义连接器或 Power Automate 流。
- **沿用「操作合并 + 服务前缀」分组。** Anthropic 建议把相关操作并进带 `action` 参数的单一工具、用 `github_*`/`slack_*` 前缀命名——这天然对应 Copilot Studio「动作归属连接器」，迁移时照搬分组即可。
- **为每个动作写丰富描述、清晰的输入/输出 schema。** 生成式编排选动作的依据，就是这些描述与 schema，等价于 Claude 依赖工具描述做 `tool_use`。
- **写操作要加确认与最小权限。** 把 Claude 的 `tool_choice`/权限直觉，翻译成 Copilot Studio 的确认步骤 + 连接器层 DLP；危险动作（删除、外发、付款）默认需用户确认。

**■ MCP 接入**

- **先开生成式编排**——这是 MCP 工作的硬前提，最常见的「MCP 不生效」就是忘了这一步。
- **用可流式 HTTP，别用已弃用的 SSE。**
- **逐个验证自动生成的动作。** 每个 MCP 工具会自动转成一个动作，但 schema 边角可能需要复核——导入后逐一冒烟测试。
- **按服务器最小授权**，让每个 MCP 连接器落在合适的 DLP 分组里。

**■ 知识源（Knowledge）**

- **把 RAG 语料迁成知识源，并交平台做检索**——别再手工切块；Claude 侧的 chunking 工程在这里交给平台。
- **精选与限定范围**：知识源要少而准，命名清晰，好让编排选对来源；定期清理过期文档以保新鲜。
- **盯住可溯源性（groundedness）**：知识类回答要能引用来源，把它作为质量门槛。

**■ 多智能体编排（Multi-agent）**

- **主智能体 + 子智能体 → 父智能体 + 连接的智能体。** 每个连接的智能体保持单一职责，复刻 Claude 子智能体「独立上下文、独立权限、只回传结果」的隔离性。
- **按需混搭模型**：多智能体编排允许各智能体用不同主模型——把 Claude 放在重推理的那几个，便宜模型处理常规分流。
- **让路由边界互斥**：连接的智能体／主题描述别相互重叠，否则编排会路由歧义。

**■ 模型选择与回退（Model）**

- **上线前先在 M365 管理中心启用 Anthropic 模型**，并把「依赖 Claude」这件事写进部署清单——否则会**静默回退到 GPT-4o**，表现却不报错。
- **按场景选模型**（prompt builder 支持）：Claude 留给高级推理，常规步骤用更省的模型。
- **要开发者级控制就走 Foundry**：无服务器部署、支持代码执行/网页搜索/引用/视觉/提示缓存，且 MACC 计费——适合需要精细能力与企业采购对齐的场景。

**■ 安全与治理（Governance）**

- **拥抱平台 DLP，而非代码级护栏。** 为连接器定义 DLP 策略、给 MCP 连接器分类；把 Claude 侧 `allowedTools` 与自理 OAuth 的安全意图，翻译成 Power Platform 的连接器治理。
- **最小权限 + 环境隔离**：dev/test/prod 分环境，凭据按环境隔离。
- **留审计轨迹**：用 Power Platform 管理工具做用量与合规审计。

**■ 测试、评估与生命周期（Test & ALM）**

- **迁移后必重测编排**：Copilot Studio 的生成式编排判定与 Claude 的委派机制不同，触发与动作选择都要回归。
- **建一组代表性话术回归集**，覆盖主题触发、动作选择、知识回答三类路径。
- **把「校验生成的 YAML」设成强制门禁**：schema 不稳定，发布前务必人工审阅。
- **把智能体当代码管理**：用解决方案（solutions）、环境变量与源代码管理；Skills for Copilot Studio 插件的 YAML/代码优先流程天然契合 git 与分阶段发布。
- **先切一条窄竖片**：一个主题 + 一个 MCP 工具 + 一个知识源，跑通验证后再扩面，别一次性大爆炸式迁移；把附录 A 的映射表当成活的迁移追踪清单。

---

## 附录 A：构件映射速查表

| Claude 侧构件 | Copilot Studio 侧对应物 | 迁移要点 |
| --- | --- | --- |
| 子智能体正文 / API system prompt | 智能体指令（agent instructions） | 近乎一对一搬运 |
| 工具定义（JSON Schema，非 MCP） | 动作 / 自定义连接器 / Power Automate 流 | 按「操作合并 + 服务前缀」对齐连接器 |
| 工具定义（经 MCP 暴露） | MCP（Add a Tool → 搜索服务器） | **首选**；每个 MCP 工具自动变成一个动作 |
| 多子智能体编排 | 连接的智能体 / 多智能体编排 | 可混用不同主模型，Claude 可作其一 |
| 技能指令部分 | 智能体指令 | 并入指令 |
| 技能捆绑资料 / RAG 语料 | 知识源（knowledge sources） | 交平台做检索 |
| 依赖代码执行的技能 | Microsoft Foundry（Skills API） | 预置 + 自定义技能均可经 Foundry 使用 |
| 后端模型（Claude） | Copilot Studio 多模型 / Foundry | 需管理员启用，否则回退 GPT-4o |
| MCP 鉴权（自理 OAuth） | 连接器治理（VNet / DLP / 多鉴权） | 安全从代码上移到平台 |

## 附录 B：来源索引

| 主题 | 来源 | 链接 |
| --- | --- | --- |
| MCP 在 Copilot Studio 正式可用（GA） | Microsoft 官方博客 | https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/model-context-protocol-mcp-is-now-generally-available-in-microsoft-copilot-studio/ |
| MCP 引入 Copilot Studio（机制） | Microsoft 官方博客 | https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/introducing-model-context-protocol-mcp-in-copilot-studio-simplified-integration-with-ai-apps-and-agents/ |
| Anthropic 加入 Copilot Studio 多模型阵容 | Microsoft 官方博客 | https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/anthropic-joins-the-multi-model-lineup-in-microsoft-copilot-studio/ |
| Claude in Microsoft Foundry | Anthropic 官方 | https://www.anthropic.com/news/claude-in-microsoft-foundry |
| Skills for Copilot Studio 插件（运行于 Claude Code） | MCSCAT 博客 | https://microsoft.github.io/mcscatblog/posts/skills-for-copilot-studio/ |
| 「从 Claude Code 迁移」指南（注意：针对 GitHub Copilot CLI，非 Studio） | 社区仓库 | https://github.com/drvoss/everything-copilot-cli/blob/main/guides/migration-from-claude-code.md |
| Claude Code 子智能体 | Claude 官方文档 | https://code.claude.com/docs/en/sub-agents |
| Claude Agent SDK + MCP | Claude 官方文档 | https://docs.claude.com/en/docs/agent-sdk/mcp |
| Claude 技能（Agent Skills）总览 | Claude 官方文档 | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview |
| Messages API 工具调用 | Anthropic 官方文档 | https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use |
| Copilot Studio 生成式编排 / 多智能体 / 知识 / 流 / DLP（参考） | Microsoft Learn | https://learn.microsoft.com/en-us/microsoft-copilot-studio/ |

**调研方法与可信度**：6 个检索角度、26 个一手来源、抽取 48 条论断、核验 25 条（确认 23、推翻 2）。两条被推翻、本手册据此规避的论断：①「自定义 MCP 接入必须额外构建自定义连接器」（MCP GA 后已不成立）；②「Copilot Studio 提供的具体 Claude 版本为某某」（不可靠，不锁定版本号）。本领域演进极快，模型阵容、传输层支持、预览／GA 状态与管理中心开关可能数月内变动（事实截至 2025 年底至 2026 年中）。
