# Skill: runbook-multiagent

> **Type**: Orchestration Skill（协调层）
> **Trigger**: 当任务复杂到需要并行多个子 agent，或任务跨越多个轮次时激活
> **What it does**: 主控 agent 如何拆任务、派子 agent、收结果、推送进度、合并产出
> **依赖**: runbook-org（基础层，必须先读）

---

## 什么是 runbook-multiagent

当一个任务满足以下任一条件时，激活这个 skill：
- 需要 **2 个以上子 agent 并行执行**
- 需要 **多个轮次** 才能完成
- 子 agent 的产出需要 **合并** 成最终交付物
- 需要 **周期性向用户推送进度**（而不是等用户来问）

---

## 0. 核心概念

**主控 agent（你）：**
- 不做具体研究，只做：拆任务 → 派发 → 观察 → 合并
- 每次只关注一件事：当前还有哪些子 agent 在跑？有没有完成的？

**子 agent：**
- 在 `sessions_spawn` 里启动
- 严格遵循 runbook-org
- 产出写到 org 的指定任务节点
- 完成后通知主 agent

**工作流文件（.org）：**
- 主任务 + 多个子任务节点
- 子任务完成后，主 agent 读取内容，合并到主任务

---

## 1. 启动流程（5步）

### Step 1：评估任务是否需要多 agent

触发条件（满足任一）：
- 任务可以自然拆分为独立模块？
- 各模块可以并行查资料？
- 预计需要 2+ 个子 agent？

如果否 → 不激活这个 skill，直接用 runbook-org 单 agent 执行。

---

### Step 2：设计任务树

在 org 文件里建立任务结构：

```org
* Project: <项目名>

** Task Queue

*** TODO <父任务：总体协调>
:PROPERTIES:
:ID: parent-001
:OWNER: main-agent
:STATUS: in-progress
:END:
- Goal :: <一句话目标>
- Context :: <背景+依赖>
- Findings ::
- Evidence ::
- Next Actions ::

*** TODO <子任务A>
:PROPERTIES:
:ID: child-a
:PARENT: parent-001
:OWNER:
:STATUS: todo
:END:
- Goal ::
- Context :: <依赖：<外部URL>>
- Findings ::
- Evidence ::
- Next Actions ::

*** TODO <子任务B>
:PROPERTIES:
:ID: child-b
:PARENT: parent-001
:OWNER:
:STATUS: todo
:END:
- Goal ::
- Context ::
- Findings ::
- Evidence ::
- Next Actions ::
```

---

### Step 3：定义子 agent 的任务 prompt

每个子 agent 的 prompt 必须包含：

```
Task: <具体目标，一句话>
Context files: <要读的文件路径>
Skill: /workspace/skills/runbook-org/SKILL.md  ← 只传路径，不抄全文
Org file: /workspace/<项目名>.org
Your task ID: <task-id>
Evidence format: file: /abs/path | web: URL
Checkpoint: 每 3 条 finding 必须写一条进度
Do NOT copy runbook-org.md into this prompt.

**Agent → Skill 注册表（派发时使用）**

核心角色（所有项目通用）：arch-agent / pm-agent / ux-agent / research-agent / code-agent / test-agent / deps-agent / deploy-agent → 全部注入 `/workspace/skills/runbook-org/SKILL.md`

扩展技术角色：api-agent / data-agent / security-agent / perf-agent / docs-agent / frontend-agent / backend-agent / mobil-agent / ml-agent / fintech-agent / infra-agent / qa-agent → 全部注入 `/workspace/skills/runbook-org/SKILL.md`

详细对应关系见 `/workspace/skills.md` 的 Agent → Skill 注册表。
```

**禁止在 prompt 里写：**
- 完整的 skills.md 全文（浪费上下文）
- 与任务无关的描述（"这个项目是一个量化平台..."）

---

### Step 4：派发子 agent

派发后**立即**在父任务写检查点：

```org
- [<时间戳>] 🤖 spawn <agent-name-1> (预计<10分钟>) → <子任务ID>
- [<时间戳>] 🤖 spawn <agent-name-2> (预计<10分钟>) → <子任务ID>
```

**派发模式：**
- **并行派发**：所有子 agent 同时启动（最快的收敛）
- **串行列举**：各 agent 完成后，下一个再启动（节省 token，适合有依赖的情况）

---

### Step 5：等待子 agent 完成

**等待方式：不轮询，等通知。**

子 agent 会通过 `subagent_announce` 事件通知你。每个通知里包含：
- agent 代号
- 任务结果摘要
- 产出的 org 文件路径

**收到完成通知后：**
1. 读取 org 中该子任务的 Findings + Evidence
2. 将关键发现合并到父任务（用 append-finding，不 rewrite）
3. 检查是否还有其他子 agent 在跑
4. 如果全部完成 → 启动合并流程

---

## 2. 进度推送规则

**主动推，不要等用户问。**

触发条件（满足任一）：
- 一个子 agent 完成
- 所有子 agent 全部完成
- 遇到阻塞，需要用户决策
- 超过 15 分钟没有进度更新

**推送格式（简洁，bullet points）：**
```
🤖 <项目名> 进度
✅ 子任务A — 完成（<关键发现一句话>）
🔄 子任务B — 运行中（已完成X，正在做Y）
⏳ 子任务C — 等待中
下一步：...
```

---

## 3. 合并流程

当所有子 agent 完成后：

### 3.1 收集
读取每个子任务的 Findings 和 Evidence

### 3.2 去重 + 排序
- 重复的 finding 只保留一条（保留可靠性最高的那个来源）
- 按主题分类：技术类 / 产品类 / 业务类

### 3.3 写合并产出文件
```
/workspace/<项目名>/FINAL_<产出名>.md
```

合并文件头部标注：
```markdown
> 本文件由以下子 agent 协作产出：
> - <agent-A>: <负责模块>
> - <agent-B>: <负责模块>
> 合并时间：<时间戳>
```

### 3.4 更新 org
- 父任务 STATUS → done
- 父任务 Findings → 合并后的摘要
- 父任务 Next Actions → 最终交付物路径

---

## 4. 错误处理

### 4.1 子 agent 超时
**症状：** 收到超时完成事件，但 org 文件里可能有内容。

**处理：**
1. 检查 org 中该子任务是否有 ≥1 条 finding + evidence
2. 如果有 → 视为**部分完成**，将内容合并到父任务，继续
3. 如果没有 → **全部重来**，用不同的策略

### 4.2 子 agent 写错 org 文件
**症状：** 写到了错误的 org 节点，或者路径不存在。

**处理：**
1. 主 agent 读取聊天里的结果摘要（每个完成事件里都有）
2. 主 agent 补写到正确的 org 节点

### 4.3 某个子任务一直不完成
**症状：** 其他子 agent 都完成了，只剩一个在跑。

**处理：**
1. 等超时事件
2. 超时后，合并已完成的子 agent 结果，继续推进
3. 未完成的子 agent 内容，由主 agent 自己补写

---

## 5. 终止条件（什么时候结束这个任务）

满足任一即为完成：
- 所有子 agent 状态为 `done`
- 父任务的 Findings 包含所有子任务的核心发现
- 最终交付物文件已生成并写入 org

---

## 6. 主 agent 的"检查清单"（每次收到子 agent 完成通知时执行）

```
□ 读取子 agent 的 org 节点
□ 提取 Findings → append-finding 到父任务
□ 提取 Evidence → attach-evidence 到父任务
□ 更新 org 中子任务 STATUS → done
□ 检查是否还有在跑的子 agent
  □ 有 → 继续等待
  □ 没有 → 启动合并流程
□ 推送进度给用户
□ 检查是否需要用户决策（阻塞点）
  □ 需要 → 停下来，问用户
  □ 不需要 → 继续合并
```

---

*这是 runbook-multiagent skill（orchestration layer）。依赖于 runbook-org。*
