# Skill: runbook-org

> **Type**: Base Execution Skill（所有任务的基础）
> **Trigger**: 当需要执行一个具体任务时自动激活
> **What it does**: 将任务写入 org-mode 工作流文件，严格按步骤执行，记录证据，中途失败必须有检查点

---

## 什么是 runbook-org

当你（主 agent）收到一个任务时，这个 skill 规定了你如何把这个任务变成一个可追踪的工作单元。

**它解决的问题：**
- agent 跳步骤、不写中间结果、失败后全部重来
- 多个 agent 并行时不知道谁在哪一步
- 结论在聊天里，文件里是空的

**它强制要求：**
- 每个任务有唯一的 ID 和 OWNER
- 每一步都有记录（哪怕一句话）
- 所有发现必须有证据来源
- 失败必须有检查点（下次可以接着跑）

---

## 0. 核心原则

1. **org 是唯一事实来源** — 聊天不是。聊天里的结论不叫结论，写进 org 才算
2. **Evidence 是一等公民** — 没来源的发现不存在
3. **检查点必须即时写** — 不要等最后一起写。每完成一个有意义步骤，立即写进去
4. **禁止重试失败的方法超过 2 次** — 失败后必须换策略，记录换法
5. **Claim 了就要负责** — OWNER 是谁，谁就要写检查点
6. **禁止删别人的 findings** — 只能 append，不能 rewrite

---

## 1. 任务结构

每个任务是一个 `*** TODO <任务名>` 节点：

```org
*** TODO <任务名>
:PROPERTIES:
:ID: <唯一ID>
:OWNER: <负责的agent名>
:STATUS: <todo|in-progress|blocked|done>
:CREATED: <时间戳>
:END:

- Goal :: <一句话描述这个任务要什么>
- Context :: <背景：依赖什么、外部资源、已知约束>
- Findings :: <所有发现写在这里>
- Evidence :: <所有证据来源写在这里>
- Next Actions :: <待办项>
```

---

## 2. 允许的动作（仅这些）

### 2.1 claim-task
拿到任务后，第一件事。

**必须做：**
1. 找到对应 `*** TODO <任务名>` 节点
2. 设置 `OWNER` 为你的名字
3. 设置 `STATUS` 为 `in-progress`
4. **立即写第一条检查点 finding：**
```org
- [<时间戳>] 🔒 开始分析 <目标>，策略：<你打算怎么查>，依赖：<URL或文件>
```

### 2.2 append-finding
记录一个发现。

```org
- [<时间戳>] <发现内容>
```

**质量规则：**
- 好的发现：具体、可操作、有来源
- 坏的发现：模糊观点、重复、无来源猜测

**进度约定：** 每 3–5 条 finding，写一条进度 note：
```org
- [<时间戳>] 🔄 进度：已完成X，正在做Y，待做Z
```

### 2.3 attach-evidence
证据必须标注来源类型和可靠性。

```org
- [<时间戳>] <type>: <来源>  # reliability: ★★★|★★|★
```

**来源类型：**

| 类型 | 说明 | 可靠性 |
|------|------|--------|
| `file:` | 本地源码文件，有绝对路径 | ★★★ |
| `web:` | GitHub / 官方文档 / 官方网站 | ★★ |
| `blog:` | 第三方博客 / 二手分析 | ★ |
| `command:` | 执行命令的输出摘要 | ★★★ |
| `agent-output:` | 子 agent 的产出摘要 | ★★ |

### 2.4 set-status
更新状态。

**允许的状态：** `todo` → `in-progress` → `done` 或 `blocked`

**done 的要求：**
- 至少 1 条 finding
- 至少 1 条 evidence

**blocked 的要求：**
- findings 里必须有一条：`- [BLOCKED] <原因>，尝试：<替代方案>`
- Next Actions 里必须有下一步

### 2.5 spawn-subtask
派生子任务。

```org
*** TODO <子任务名>
:PROPERTIES:
:ID: <父ID>-1
:OWNER:
:STATUS: todo
:CREATED: <时间戳>
:PARENT: <父任务ID>
:END:

- Goal :: <子任务目标>
- Context :: <依赖：<外部URL或资源>>
- Findings ::
- Evidence ::
- Next Actions ::
```

### 2.6 append-next-action
写下一个待办。

```org
- [ ] <具体动作>
```

**规则：**
- 必须具体（"分析 X 文件" 而非 "继续分析"）
- 如果知道某个路径会失败，写备用方案：`- [ ] 如果 A 失败 → 改用 B`

---

## 3. 禁止的动作

- ❌ rewrite 别人的 findings/evidence
- ❌ 删除已有的记录
- ❌ 修改不相关的任务节点
- ❌ 跳过检查点（超过 3 条 finding 还没有检查点 = 做错了）
- ❌ 用失败的方法试第 3 次
- ❌ 把结论只留在聊天里

---

## 4. 执行模式（每个任务必须遵循）

```
1. claim-task       → 立即写检查点
2. append-finding    → 边做边写
3. attach-evidence  → 每条发现绑定来源
4. [checkpoint]    → 每 3 条 finding 后写进度
5. append-next-action → 每步完成后写下一步
6. set-status       → 推进状态
```

**Do NOT skip. Do NOT go silent.**

---

## 5. 失败处理

如果卡住了：

```
1. append-finding: - [BLOCKED] <原因>
2. append-next-action: - [ ] 切换策略：<替代方案>
3. set-status: blocked
4. set-status: in-progress  ← 不要停在这里，立即换方法继续
```

---

## 6. 主 agent 职责

主 agent 在多 agent 任务中的额外职责：

- **派发任务前**：更新父任务 `Next Actions`，明确每个子 agent 的任务边界
- **派发后**：立即在父任务写检查点：`- [<时间戳>] 🤖 spawn <agent-name> 预计耗时 <N分钟>`
- **收到子 agent 完成**：读取 org 中子任务的内容，合并到父任务
- **周期性推送**：每完成一个里程碑，主动给用户发送进度摘要（不需要用户问）

---

*这是 runbook-org skill（base layer）。所有任务的基础规则。*
