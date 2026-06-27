# Agent 编码学习手册

> 一份面向开发者的实战指南：如何构建「能读懂某个领域或代码库、做出分析、并自动起草报告」的智能体（Agent）。
>
> 本手册的全部条目均来自一次多源联网调研——6 个检索角度、29 个一手来源、121 条候选论断，经过 3 票对抗式核验后保留 25 条（25 条全部通过、0 条被推翻），再合并去重为 11 组核心发现。所有项目均附 GitHub / 论文原始链接，便于按图索骥。数据截至 2026 年中。

---

**AGENT 编码学习手册 · 第 1 章**

# 第 1 章——代码库理解智能体：从静态分析到可交互图谱

这一类工具，是 understand-anything 最近的「同类」——它们都在做同一件事：把一座庞大、沉默、只有编译器读得懂的代码库，翻译成人类（以及其他智能体）一眼能看懂的结构。它们的共同配方是「大语言模型（LLM）＋静态分析（Static Analysis）」，但在「用什么底座去理解代码」这个关键抉择上，整条光谱从一端铺到了另一端：有人完全交给模型去猜，有人请来语言服务器（LSP）逐符号求证，还有人干脆把代码的图结构焊进了模型的注意力里。读懂这条光谱上每一个落点的取舍，是构建这类智能体的第一课。

光谱最「重」的一端，是 **CodeBoarding**（[github.com/CodeBoarding/CodeBoarding](https://github.com/CodeBoarding/CodeBoarding)）——也是与 understand-anything 架构最直接对应的开源旗舰。它把基于语言服务器协议（LSP, Language Server Protocol）的静态分析，和一条多组件的智能体流水线缝在一起：应用编排器与仓库管理器（Application Orchestrator & Repository Manager）负责调度，LLM 智能体核心（LLM Agent Core）调用一组专用工具去「触碰」代码与分析数据，增量分析引擎（Incremental Analysis Engine）只重算变动的部分，最后由文档与图表生成器（Documentation & Diagram Generator）把结果吐成可点击的 Mermaid 架构图和 Markdown 文档，统一写进项目里的 `.codeboarding/` 目录。值得注意的是它用 LSP 客户端与语言适配器（覆盖 Python、TypeScript、JavaScript、Java、Go、PHP、Rust、C#）作为 tree-sitter / AST 之外的另一种静态分析底座——会把各语言的语言服务器二进制下载到 `~/.codeboarding/servers/`。这是「重底座」路线：精度高、跨语言要逐个适配、运行成本也更高。

光谱最「轻」的另一端，是 **Swark**（[github.com/swark-io/swark](https://github.com/swark-io/swark)）。它是一个 VS Code 扩展，生成 Mermaid 架构图的方式简单到近乎粗暴：直接把代码文件喂给 LLM（通过 VS Code 的 Language Model API / GitHub Copilot），把所有分析逻辑全部封装在模型里。它的 README 把这条路线的哲学讲得很透彻——「所有『逻辑』都被封装在 LLM 之内，因此它天生支持所有语言」，并明确对比「传统代码可视化方案是确定性的，每支持一门新语言都要增量地加代码」。这是「零底座」路线：跨语言几乎免费、却把准确性完全押在模型身上。这里要替读者把话挑明：「天生支持所有语言」是项目方对其方法的自我描述，而非经第三方基准测试背书的质量保证。

夹在两端之间、并把「图」这个底座推到极致的，是三种形态各异的代码知识图谱（Code Knowledge Graph）路线，我们留到第 3 章细讲；这里先记住两位代表。其一是 **Blarify**（[github.com/blarApp/blarify](https://github.com/blarApp/blarify)），它把一座本地代码库表示成一张图结构，好让 LLM「遍历这张图来理解代码的逻辑与流向」。其二是研究级的 **CGM（Code Graph Model）**（论文 [arXiv:2505.16901](https://arxiv.org/abs/2505.16901)），它不走工具调用的智能体路线，而是把仓库的代码图结构直接整合进 LLM 的注意力机制（attention mechanism）——靠一个图感知的注意力掩码，外加一个两层 MLP 适配器，把图节点的属性映射进模型的输入嵌入空间。CGM 建立在开放权重模型 Qwen2.5-72B 之上，配一条轻量的「无智能体图 RAG（agentless graph RAG）」检索流水线，在 SWE-bench Lite 上取得了 43.00% 的解决率——在开放权重（open-weight）模型中排名第一（NeurIPS 2025；权重与代码见 codefuse-ai/CodeFuse-CGM）。这条发现的分量在于：它证明了「无智能体 + 图入注意力」可以成为专有工具调用智能体框架之外的一条可行替代路线。（需精确表述：CGM 是「开放权重模型中第一」，在开放源代码系统中排第二、总榜第八——把它笼统说成「开源第一」会略微夸大。）

光谱之外，还有两类值得收进工具箱的「邻居」。一类是检索增强（RAG over code）路线的产品标杆 **Cody**（Sourcegraph，[github.com/sourcegraph/cody-public-snapshot](https://github.com/sourcegraph/cody-public-snapshot)）：它用语义检索 + 关键词（BM25）+ 代码图符号查找的两段式「先检索后重排」流水线，从本地与远端代码库一起拉取关于 API、符号与用法模式的上下文，覆盖 VS Code、JetBrains 与 Web。这里有一处必须如实告知的时效性脚注——其公开快照仓库已于 2025 年 8 月归档，Cody 如今转为仅面向企业（Enterprise-only）；它的 RAG 架构仍是极佳的参考设计，但已不再是可自由取用的开源产品。另一类是把「分析」与「渲染」彻底解耦的极简范例 **Architecture Diagram Generator**（Cocoon-AI，[github.com/Cocoon-AI/architecture-diagram-generator](https://github.com/Cocoon-AI/architecture-diagram-generator)）：它是一个 Claude AI 技能（skill），把一段朴素的英文系统描述变成独立的 HTML/SVG 图，却刻意「不分析代码本身」——它要求用户先用另一个 AI 工具（Cursor、ChatGPT、Claude Code）去「分析这个代码库并描述其架构」，再把那段文字粘进来。这个看似偷懒的设计，恰恰给出了一条重要的架构启示：把昂贵、与语言强绑定的「分析阶段」，和确定性、可复用的「渲染阶段」拆开。这一点我们会在第 5 章重提。

补充几位在检索中频繁现身、值得纳入视野的成员：**Greptile** 把仓库索引成文件、函数及其依赖的图，并用这套结构去回答问题、带着全库视野去 review PR；学术侧的 **RepoAgent**（[arXiv:2402.16667](https://arxiv.org/abs/2402.16667)，EMNLP 2024 Demo）则是一个三阶段、做仓库级代码文档自动生成的框架，是这一章里与 understand-anything「文档层」最对得上的同行评审工作。

---

**AGENT 编码学习手册 · 第 2 章**

# 第 2 章——领域分析师智能体：把语料读成一份报告

如果说第 1 章的主角是「读懂代码」，那么这一章的主角就是「读懂一个领域，然后写出一份报告」。这两件事的骨架惊人地相似——都是「摄取语料 → 推理 → 起草结构化产物」——所以专做代码理解的人，极有必要把这一类通用分析师智能体看明白：它们在「如何把一份报告拆成可装配的工序」上，已经趟出了一批可以直接挪用的蓝图。

这一类里最具示范性的模式，是「多智能体的规划者／执行者（planner/executor）流水线」，而它的开源标杆是 **GPT Researcher**（[github.com/assafelovic/gpt-researcher](https://github.com/assafelovic/gpt-researcher)，2.7 万＋星）。它被描述为「首个同时面向联网与本地研究、面向任意任务的开放深度研究智能体，产出带引用、翔实、客观的研究报告」。它的流水线是这样转的：先为本次任务创建一个专属智能体，由规划者生成一组研究子问题，再为每个子问题派出爬取／执行智能体去搜集与摘要信息、并对每份来源做出处追踪（source-tracking），最后由规划者过滤并聚合这些摘要，拼装成一份带引用的终稿。它能吃本地文档（PDF、CSV、Excel、Markdown、PPT、Word），支持多家 LLM 供应商，并能把 2000＋字的报告导出为 PDF / Word / Markdown / JSON / CSV。对一个想自动起草报告的智能体而言，这套「规划—执行—聚合」的三段式几乎是拿来即用的起点。

如果你想把「报告起草」拆得更细、更可替换，那么斯坦福的 **STORM**（[github.com/stanford-oval/storm](https://github.com/stanford-oval/storm)，2.7 万＋星，NAACL 2024）是教科书级的蓝图。它「从零开始、基于联网检索写出维基百科式的带引用文章」，靠的是一条四模块流水线：知识策展（Knowledge Curation，通过模拟多视角专家问答来搜集信息）、大纲生成（Outline Generation，层级化组织）、文章生成（Article Generation，填充内容）、文章润色（Article Polishing，精修）。关键在于——每个模块都在 `knowledge_storm/interface.py` 里有明确定义的接口，实现散落在 `storm_wiki/modules/*`，这就坐实了它的模块化与可定制：你完全可以只换掉「知识策展」这一节去对接代码库，而保留其余三节。对照第 1 章的 understand-anything 把分析拆成 project-scanner、file-analyzer、architecture-analyzer、tour-builder——你会发现这是同一种「命名工序、各司其职、接口可换」的工程直觉，只不过一个面向代码、一个面向文本。

把这套打法在某个垂直领域里做到极致的，是 **FinRobot**（[github.com/AI4Finance-Foundation/FinRobot](https://github.com/AI4Finance-Foundation/FinRobot)）——一个开源的、四层架构的金融多智能体平台。它自上而下是：金融 AI 智能体层（用「金融思维链」Financial Chain-of-Thought 提示，下设预测、文档分析、交易等专用智能体）、金融 LLM 算法层、LLMOps / DataOps 层、多源基础模型层。它从 SEC 申报文件、Finnhub、Financial Modeling Prep、Yahoo Finance 摄取领域语料（仓库里 `finnhub_utils.py`、`fmp_utils.py`、`sec_utils.py`、`yfinance_utils.py` 等模块可对应印证），最终用 reportlab 自动生成带 15＋种图表的多页 HTML/PDF 股票研究报告（白皮书见 [arXiv:2405.14767](https://arxiv.org/abs/2405.14767)，专论估值的 arXiv:2411.08804 标题即《AI Agent for Equity Research and Valuation》）。它给代码理解工具的启示是：一旦你想从「画张图」走向「出一份够专业、能直接交付的报告」，分层（智能体层 / 算法层 / 运维层 / 数据层）会成为绕不开的组织方式。（如实标注：「超越 FinGPT」「15＋种图表」均为项目自述，而非第三方实测。）

光谱的另一端是「对话式 / 自动化数据分析」智能体，它把 LLM＋RAG 用来把自然语言问题翻译成可执行代码、跑在数据上。产品侧的代表是 **PandasAI**（[pandas-ai.com](https://pandas-ai.com/)，仓库 sinaptik-ai/pandas-ai，约 2.36 万星）：让非技术用户用自然语言查询 dataframe / SQL / CSV / parquet，底层是 LLM＋RAG，并通过 LiteLLM 接入 GPT-4 等模型（核心库为 MIT 协议，`ee/` 企业版另行授权——所以「MIT 授权」是个简化说法）。研究侧更前沿的是 **DataSage**（[arXiv:2511.14299](https://arxiv.org/abs/2511.14299)，2025 年 11 月），一个由四模块组成、在迭代问答循环里运转的多智能体框架：数据集描述、检索增强知识生成（RAKG，当 LLM 内部知识不足时动态检索并综合外部领域知识）、问题提出（通过「发散—收敛」的多角色辩论来打磨出高质量分析问题）、洞见生成（把问题翻译成可执行 Python、多路推理、解释输出、最终产出洞见）。DataSage 把「多角色辩论」与「多路推理」引入分析师智能体的洞见发现环节，是这一章里方法学上最新、最值得借鉴的一笔。

---

**AGENT 编码学习手册 · 第 3 章**

# 第 3 章——技术底座：AST、代码知识图谱与 GraphRAG

到这里，问题从「有哪些工具」收敛到一个更硬的工程抉择上：你的智能体到底用什么数据结构去「理解」代码？这一章把第 1 章一笔带过的「图」摊开来讲，因为代码知识图谱（Code Knowledge Graph）正是这一整类工具反复依赖的底座——而它至少有三种判然不同的形态，对应三种完全不同的工程承诺。

第一种形态是「把仓库变成一张供 LLM 遍历的图」。**Blarify**（[github.com/blarApp/blarify](https://github.com/blarApp/blarify)）是这一形态的范本：它在 AST 解析之上叠加 LSP / SCIP，把代码库转成一张文件、函数及其关系的图（检索中的线索指出，SCIP 在引用解析上比 LSP 快约 330 倍），让 LLM 顺着这张图去理解逻辑与流向。这一形态的承诺是：图是「外置」的，模型仍是通用模型，靠遍历来获得结构感知。

第二种形态是「从非结构化文本里抽取知识图谱，用来增强 LLM 的输出」。微软的 **GraphRAG**（[github.com/microsoft/graphrag](https://github.com/microsoft/graphrag)）是这一形态的代表：它是「一套数据流水线与转换套件，用 LLM 从非结构化文本里抽取有意义的结构化数据」，并提供「用知识图谱式的记忆结构来增强 LLM 输出的方法论」。它本是为文本设计，但对「把代码当文本来抽关系」的场景同样适用，是连接第 2 章「语料分析」与第 3 章「代码图谱」的一座桥。

第三种形态最激进，已在第 1 章登场：把图结构直接整合进模型的注意力机制——**CGM**（[arXiv:2505.16901](https://arxiv.org/abs/2505.16901)）。它不再把图当作模型外部的、靠工具去查询的东西，而是用图感知注意力掩码 + 两层 MLP 适配器，把图节点属性映射进输入嵌入空间，让「图」成为模型内部的一等公民。三种形态的取舍很清晰：Blarify 式「外置图遍历」改动最小、最易落地；GraphRAG 式「抽取增强」适合文本与代码混合的语料；CGM 式「图入注意力」上限最高，但要训练、要改模型，工程门槛也最高。

这一章还要补一个绕不开的经典底座——代码属性图（Code Property Graph, CPG），其权威实现是 **Joern**（[docs.joern.io/code-property-graph](https://docs.joern.io/code-property-graph/)）。CPG 把抽象语法树（AST）、控制流图（CFG）与程序依赖图（PDG）合并进同一张图里，是静态分析与安全审计领域多年沉淀下来的成熟结构。对一个「读懂代码」的智能体来说，tree-sitter / AST 是最轻的入口，LSP / SCIP 是带语义解析的进阶，CPG 则是把控制流与数据流也一并纳入的重型底座——你在精度、覆盖面与成本之间的落点，基本就由「选了哪一层底座」决定。understand-anything 选用 web-tree-sitter（WASM）正是这条光谱上「轻、跨平台、浏览器安全」的一个有意识的落点。

---

**AGENT 编码学习手册 · 第 4 章**

# 第 4 章——架构模式：多智能体流水线与检索增强

把前三章的具体项目抽象一层，会浮现出几条反复出现、跨领域通用的架构模式。认得出这些模式，你就能在面对一个新需求时，不必从零发明，而是从一组已被验证的骨架里挑选、组合。

第一条、也是最主干的一条，是**多智能体的规划者／执行者流水线（planner/executor pipeline）**。第 2 章的 GPT Researcher、STORM、DataSage 全是它的变体：一个负责「拆解任务、分派子问题、最后聚合」的规划者，加上一组负责「各自啃一块、产出结构化中间结果」的执行者。把这套模式在软件工程领域做成「软件公司」的，是 **MetaGPT**（[github.com/FoundationAgents/MetaGPT](https://github.com/FoundationAgents/MetaGPT))——它给智能体分配产品经理、架构师、项目经理、工程师、QA 等专门角色，让它们像流水线一样把**结构化产物**逐站传递下去。这正是 understand-anything 的智能体流水线（project-scanner → file-analyzer → architecture-analyzer → tour-builder → graph-reviewer）所镜像的同一套直觉：角色专门化、产物结构化、阶段间靠落盘的中间文件交接（understand-anything 把中间结果写进 `.understand-anything/intermediate/` 而非塞回上下文——这是个值得照抄的好习惯，能把昂贵的上下文窗口省下来）。

第二条是**对代码／语料的检索增强（RAG）**。无论是 Cody 的「语义 + BM25 + 符号查找」三路混合检索，还是 GPT Researcher 对本地文档的摄取，核心都是同一件事：在让模型作答之前，先把「最相关的那一小块」捞出来塞进上下文。这条模式的工程细节，留到第 5 章用 Qodo 的实战经验来填。

第三条是**模块化的报告／图表生成阶段**。STORM 的四模块、FinRobot 的四层、DataSage 的四模块——它们不约而同地把「出活」拆成命名清晰、接口明确、可单独替换的工序。这条模式的价值在第 5 章会被反复印证：把「分析」与「渲染」、把「检索」与「起草」拆开，几乎是这一整类工具积累下来的共同智慧。

把这三条放在一起看，你会得到一张相当通用的施工图：**规划者拆解 → 执行者并行检索与分析 → 结构化中间产物落盘 → 模块化渲染出最终报告/图谱**。第 1 到第 3 章的几乎每一个项目，都是这张施工图在不同领域、不同底座上的一次具体浇筑。

---

**AGENT 编码学习手册 · 第 5 章**

# 第 5 章——最佳实践与悬而未决的问题

最后一章，把散落在各项目里的工程经验收拢成几条可操作的准则，再诚实地列出这个领域目前还没答好的问题——后者往往比前者更值得一个建设者放在心上。

**■ 准则一：把分析与渲染拆开**

这是这一整类工具最一致的共识。Cocoon-AI 的 Architecture Diagram Generator 把它做到了极端——技能本身只管渲染，把「分析代码」完全外包给上游的另一个 AI。这么做的回报是：渲染阶段是确定性的、与语言无关的、可复用的，而分析阶段是昂贵的、与语言强绑定的、易变的；拆开之后，两边可以各自独立演进、独立测试。任何想长期维护的代码理解工具，都应该认真考虑在「产出知识图谱 JSON」和「把 JSON 画成仪表盘」之间划一条清晰的界线（understand-anything 的 core / dashboard 分包正是这条界线的体现）。

**■ 准则二：把报告起草拆成命名工序**

STORM 与 DataSage 反复证明：与其让一个巨型提示词一口气写完整篇报告，不如把它拆成知识策展、大纲、生成、润色这样可单独调试、单独替换的模块。当某一节质量不行时，你能精确定位、单独迭代，而不必推倒重来。

**■ 准则三：审慎选择代码理解的底座**

LLM-only（Swark）、LSP（CodeBoarding）、AST / tree-sitter（understand-anything）、图入注意力（CGM）——这四种底座在覆盖面、精度与成本上各有取舍，没有免费的午餐。跨语言要快、可以容忍不精确，就偏 LLM-only；要精度、肯为每门语言付适配成本，就上 LSP / AST；要冲基准、肯训练，才考虑图入注意力。这是设计之初就要拍板、且很难中途反悔的决定。

**■ 准则四：RAG 的成败在于切块（chunking）**

来自 Qodo 索引一万个仓库的实战博客（[qodo.ai/blog/rag-for-large-scale-code-repos](https://www.qodo.ai/blog/rag-for-large-scale-code-repos/)）的经验很朴素却很硬：嵌入「仍能包含相关上下文的最小块」——块里掺进无关文本会稀释嵌入向量、拉低检索质量。对代码而言，这意味着按函数 / 类等语义边界切块，而不是按固定行数粗暴切割。Sourcegraph 关于 Cody 如何理解代码库的工程文章（[sourcegraph.com/blog/how-cody-understands-your-codebase](https://sourcegraph.com/blog/how-cody-understands-your-codebase)）是另一份值得精读的一手材料。

**■ 准则五：把中间结果落盘，别塞回上下文**

understand-anything 把智能体的中间产物写进磁盘、装配完再清理，而不是把它们一路塞回模型上下文——这与 MetaGPT「结构化产物逐站传递」是同一个道理。上下文窗口是这类长流水线里最稀缺的资源，能省则省。

**■ 悬而未决的问题**

诚实地说，这个领域还有几个没答好的硬问题，它们恰恰是后来者的机会所在：

其一，**超大单体仓库（monorepo）上的规模与增量**。LSP 式分析（CodeBoarding）、AST / tree-sitter（understand-anything）、图入注意力（CGM）在延迟与成本上的实际天花板各是多少？谁能做到真正的增量更新、而不是每次推倒重算（CodeBoarding 有增量分析引擎，其余多数仍从头来过）？

其二、也是最尖锐的一条——**生成产物的质量到底怎么评**。SWE-bench 这类「改代码」基准衡量不了「一张架构图画得对不对」「一份分析报告靠不靠谱」。本次调研中，没有任何一个图表／报告生成器给出过针对其产出物准确性的严谨基准。这是一片几乎空白的评测荒地。

其三，**前端与交互层的比较与标准化**。understand-anything、CodeBoarding 这类可交互仪表盘，在图渲染、导航、导览（tour）上的体验如何与 Swark、Cocoon 的静态 HTML / Mermaid 产出权衡？更现实的是：它们各自吐出的「知识图谱 JSON」之间，有没有一个可复用的开放标准？目前没有——这或许是这个新生领域最值得去推动的一件公共基础设施。

---

## 附录：项目与来源索引

| 项目 / 论文 | 类别 | 链接 |
| --- | --- | --- |
| CodeBoarding | 代码库理解（LSP + 多智能体 → Mermaid） | https://github.com/CodeBoarding/CodeBoarding |
| Cody (Sourcegraph) | RAG over code（已转企业版，架构可参考） | https://github.com/sourcegraph/cody-public-snapshot |
| Swark | LLM-only 架构图生成（VS Code） | https://github.com/swark-io/swark |
| Blarify | 仓库即图，供 LLM 遍历 | https://github.com/blarApp/blarify |
| CGM (Code Graph Model) | 图入注意力、无智能体、SWE-bench Lite 43% | https://arxiv.org/abs/2505.16901 |
| Cocoon Architecture Diagram Generator | 仅渲染、分析外包的 Claude 技能 | https://github.com/Cocoon-AI/architecture-diagram-generator |
| GPT Researcher | 规划者/执行者深度研究报告 | https://github.com/assafelovic/gpt-researcher |
| STORM (Stanford) | 四模块维基式报告生成（NAACL 2024） | https://github.com/stanford-oval/storm |
| FinRobot | 四层金融多智能体 → 股票研究报告 | https://github.com/AI4Finance-Foundation/FinRobot |
| PandasAI | 自然语言数据分析（LLM + RAG） | https://pandas-ai.com/ |
| DataSage | 多角色辩论 + 多路推理洞见生成 | https://arxiv.org/abs/2511.14299 |
| Microsoft GraphRAG | 从文本抽取知识图谱增强 LLM | https://github.com/microsoft/graphrag |
| MetaGPT | 角色化多智能体「软件公司」 | https://github.com/FoundationAgents/MetaGPT |
| RepoAgent | 仓库级代码文档生成（EMNLP 2024） | https://arxiv.org/abs/2402.16667 |
| Joern / Code Property Graph | AST+CFG+PDG 合一的代码属性图 | https://docs.joern.io/code-property-graph/ |
| Qodo（实战经验） | 万仓库 RAG 切块经验 | https://www.qodo.ai/blog/rag-for-large-scale-code-repos/ |

**调研方法与可信度**：6 个检索角度、29 个一手来源、抽取 121 条论断，对其中 25 条做 3 票对抗式核验（需 2/3 票判伪才推翻），结果 25 条全部通过、0 条被推翻，去重合并为 11 组核心发现。已知注意事项：Cody 公开仓库已归档并转企业版；Swark「天生支持所有语言」、FinRobot「超越 FinGPT / 15＋图表」等为项目自述而非第三方实测；CGM 精确表述为「开放权重模型第一」（总榜第八）；PandasAI 为 MIT 核心 + 商业企业版混合授权；本领域演进极快，星标、榜单与授权层级数月内即可能变动（数据截至 2026 年中）。
