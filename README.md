# OpenClaw Skills — Skill Index

> 所有 skill 均位于 `<skill-name>/SKILL.md`

---

## 如何使用

当你说以下话时，对应的 skill 会自动激活：

| 你说 | 激活 skill | 触发词 |
|------|----------|--------|
| "按skills.md规范执行" | `runbook-org` | skills、skill、runbook |
| "帮我研究X / 脑爆Y" | `runbook-brainstorm` | 研究、脑爆、分析 |
| "多角色并行做这个" | `runbook-multiagent` | 并行、分工、多角色 |

---

## Skill 1：runbook-org（基础层）

**路径：** `runbook-org/SKILL.md`

**作用：** 单 agent 任务执行规范。org-mode 工作流，claim-task / append-finding / attach-evidence / set-status。

**核心规则：**
- claim-task → 立即写检查点
- 每条发现必须有证据来源
- 失败写 BLOCKED + 换策略
- 禁止重试同一方法超过 2 次

---

## Skill 2：runbook-multiagent（协调层）

**路径：** `runbook-multiagent/SKILL.md`

**作用：** 主控 agent 管理多 sub-agent 并行任务的规范。

**核心规则：**
- spawn 后立即写检查点到父任务
- 等待 `subagent_announce` 事件，不轮询
- 收到完成通知后读取 org，合并到父任务
- 超过 15 分钟无进度 → 主动推用户

---

## Skill 3：runbook-brainstorm（任务层）

**路径：** `runbook-brainstorm/SKILL.md`

**作用：** 完整的多角色研究流程。

**核心规则：**
- 激活后**先问用户**：目标/交付形式/范围
- 选角色模板（arch-agent / pm-agent / ...）
- 设计轮次（2轮 or 3轮）
- 发现分歧时停下来问用户，不替用户做决定

---

## Agent → Skill 注册表（扩展版）

Spawn sub-agent 时，**主 agent 根据角色代号注入 skill**。Sub-agent 不自动加载，由主 agent 在 spawn prompt 里告知。

### Spawn prompt 标准格式

```
Agent: <代号>
Task: <具体目标>
Skill: <skill路径>  ← 主 agent 注入
Context files: <需要读取的文件>
Org file: <org文件路径>
```

---

### 核心角色（所有项目通用）

| Agent 代号 | 激活触发词 | 职责 | 最小 Skill |
|-----------|-----------|------|-----------|
| `arch-agent` | 架构/模块/系统设计/分层 | 系统架构、模块边界、调用路径 | `runbook-org` |
| `pm-agent` | 产品/需求/功能范围/PRD/特性 | 用户需求、功能设计、PRD | `runbook-org` |
| `ux-agent` | UX/交互/界面/用户体验/页面设计 | 页面流程、组件状态、交互规范 | `runbook-org` |
| `research-agent` | 研究/调研/技术选型/分析 | 技术调研、竞品分析、资料采集 | `runbook-org` |
| `code-agent` | 实现/写代码/开发/功能开发 | 代码实现、函数设计、API实现 | `runbook-org` |
| `test-agent` | 测试/测试用例/覆盖率/E2E | 单元测试、集成测试、测试策略 | `runbook-org` |
| `deps-agent` | 依赖/包管理/第三方库 | 依赖可用性、版本分析、替代方案 | `runbook-org` |
| `deploy-agent` | 部署/DevOps/CI/CD/发布 | 部署架构、CI/CD流程、发布策略 | `runbook-org` |

### 技术角色（按领域扩展）

| Agent 代号 | 激活触发词 | 职责 | 最小 Skill |
|-----------|-----------|------|-----------|
| `api-agent` | API/接口/协议/REST | API设计、接口契约、协议定义 | `runbook-org` |
| `data-agent` | 数据/数据模型/数据库/存储 | 数据模型、数据库设计、数据流 | `runbook-org` |
| `security-agent` | 安全/权限/鉴权/合规 | 安全设计、权限模型、合规检查 | `runbook-org` |
| `perf-agent` | 性能/优化/瓶颈/压测 | 性能分析、瓶颈定位、优化方案 | `runbook-org` |
| `docs-agent` | 文档/说明/注释/README | 技术文档、接口文档、用户手册 | `runbook-org` |
| `qa-agent` | 质量/验收/测试计划 | QA流程、验收标准、质量检查 | `runbook-org` |
| `frontend-agent` | 前端/React/Vue/UI组件 | 前端架构、组件设计、样式规范 | `runbook-org` |
| `backend-agent` | 后端/Python/FastAPI/服务 | 后端架构、API实现、业务逻辑 | `runbook-org` |
| `mobil-agent` | 移动端/iOS/Android/小程序 | 移动端适配、原生交互、性能 | `runbook-org` |
| `ml-agent` | 机器学习/模型/训练/AI | AI模型设计、训练流程、推理优化 | `runbook-org` |
| `fintech-agent` | 金融/量化/交易/风控 | 量化策略、交易接口、风控模型 | `runbook-org` |
| `infra-agent` | 基础设施/运维/监控/SRE | 基础设施、监控告警、日志分析 | `runbook-org` |

---

### Spawn 原则

1. **一个子任务只给一个 Agent 代号**。两个不相关方向正交 → spawn 两个 sub-agent 并行。
2. **有依赖时先后再前**：API设计 → API实现，先设计再实现。
3. **遇到阻塞立即推用户**：不替用户做决定。
4. **合并后再派新任务**：Round N 全部完成 → 主 agent 合并 → 有需要才派 Round N+1。

---

## 在 Codex / Claude Code 里使用

这些工具不会自动读取 skill，在 spawn prompt 里引用路径：

```
参考 skill：/path-to-skills/runbook-org/SKILL.md
参考 skill：/path-to-skills/runbook-brainstorm/SKILL.md
```

附上路径即可，不要复制全文。
