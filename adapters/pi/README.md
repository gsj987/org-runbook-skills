# pi-adapter

> org-runbook-skills 在 pi (pi-mono) 环境下的运行时适配层

## 目录

- [架构概览](#架构概览)
- [核心问题](#核心问题)
- [extension.ts](#extensionts---工具限制与拦截)
- [supervisor.ts / protocol.ts](#supervisorts--protocolts---进程管理器)
- [通信协议](#通信协议)
- [使用流程](#使用流程)
- [API 参考](#api-参考)
- [当前状态](#当前状态)

---

## 架构概览

```
┌──────────────────────────────────────────────────────────────────┐
│                         用户终端                                   │
│                                                                  │
│    npx ts-node protocol.ts  ← 启动 Supervisor                     │
│           │                                                     │
│           │ HTTP API (port 3847)                                 │
│           ▼                                                     │
│    ┌─────────────────────────────────────────────────────────┐   │
│    │                    pi 主会话                             │   │
│    │  ┌─────────────────────────────────────────────────┐   │   │
│    │  │              pi-adapter Extension                 │   │   │
│    │  │                                                  │   │   │
│    │  │  • registerTool() → workflow.* / worker.*       │   │   │
│    │  │  • pi.on("tool_call") → 拦截检查                │   │   │
│    │  └─────────────────────────────────────────────────┘   │   │
│    │                          │                             │   │
│    │                          │ fetch()                     │   │
│    │                          ▼                             │   │
│    │  orchestrator 调用 worker.spawn({ role: "code-agent" }) │   │
│    └─────────────────────────────────────────────────────────┘   │
│           │                                                     │
│           │ spawn("pi --role=code-agent ...")                   │
│           ▼                                                     │
│    ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│    │ pi worker  │  │ pi worker  │  │ pi worker  │              │
│    │ code-agent │  │ test-agent │  │ ops-agent  │              │
│    │ (extension)│  │ (extension)│  │ (extension)│              │
│    └────────────┘  └────────────┘  └────────────┘              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 核心问题

### pi 的设计哲学

pi 的设计哲学是**最小化 + 可扩展**：

| 特性 | 意味着什么 |
|------|-----------|
| 无内建 sub-agent | 必须自己实现多进程管理 |
| 无 permission popup | 需要扩展来控制权限 |
| 默认 4 个工具太通用 | 需要替换成语义明确的工具 |

### 我们的适配目标

1. **让 orchestrator 只能做流程控制**：不能直接 edit 代码
2. **让 code-agent 只能写代码**：不能做部署操作
3. **真正的进程级隔离**：每个 role 是独立 pi 进程

---

## extension.ts - 工具限制与拦截

### 1. 注册自定义工具 (`registerTool`)

**问题**：pi 默认的 4 个工具太底层，orchestrator 可以用它做任何事。

**解决方案**：注册高层语义的工具。

```typescript
// 旧方式：orchestrator 可以直接编辑任何文件
await edit({ path: "src/main.ts", oldText: "...", newText: "..." })

// 新方式：只有特定角色能用特定工具
await workflow.claimTask({ taskId: "task-001", strategy: "parallel" })
```

### 2. 工具拦截 (`pi.on("tool_call")`)

```typescript
pi.on("tool_call", async (event, ctx) => {
  // 检查 1：这个角色能用这个工具吗？
  if (!isToolAllowed(toolName)) {
    return { error: "Tool not allowed for this role" };
  }
  
  // 检查 2：访问的路径受保护吗？
  if (["write", "edit"].includes(toolName)) {
    if (isPathProtected(event.args.path)) {
      return { error: "Path protected" };
    }
  }
  
  // 检查 3：bash 命令危险吗？
  if (toolName === "bash") {
    if (isDangerousCommand(event.args.command)) {
      return { error: "Dangerous command blocked" };
    }
  }
  
  return null;  // 允许执行
});
```

### 3. 角色工具限制表

```typescript
const ROLE_TOOLS: Record<Role, string[]> = {
  orchestrator: [
    "workflow.claimTask",
    "workflow.appendFinding", 
    "workflow.setStatus",
    "worker.spawn",
    "worker.awaitResult",
    "read", "grep", "find", "ls"  // 只有只读
  ],
  "code-agent": [
    "read", "write", "edit", "bash"  // 能写代码
  ],
  "test-agent": [
    "read", "bash"  // 只能读和运行测试
  ],
  "ops-agent": [
    "read", "bash"  // 只能读和运维命令
  ]
};
```

---

## supervisor.ts / protocol.ts - 进程管理器

### 问题

extension.ts 里的 `worker.spawn` 只是一个工具注册，它**不能真正启动新进程**。

### 解决方案：External Supervisor

Supervisor 是一个独立的 Node.js 进程，暴露 HTTP API 供 extension 调用。

**职责**：
1. 读取 workflow.org
2. 解析任务状态
3. 根据 PHASE 决定该启动哪些 worker
4. `spawn()` 启动新的 pi 进程
5. 等待 worker 完成
6. 收集结果，写回 workflow.org

### protocol.ts - HTTP API Server

```typescript
// 暴露的 API 端点
app.post("/worker/spawn", ...)    // 启动 worker
app.get("/worker/:id/status", ...) // 查询状态
app.post("/worker/:id/await", ...) // 等待结果
app.post("/workflow/update", ...)  // 写回 findings
```

---

## 通信协议

### 1. Extension → Supervisor

Extension 通过 fetch 调用 Supervisor 的 HTTP API：

```typescript
// spawn worker
await fetch("http://localhost:3847/worker/spawn", {
  method: "POST",
  body: JSON.stringify({
    role: "code-agent",
    task: "Implement feature X",
    taskId: "task-001",
    workflowPath: "./workflow.org"
  })
})

// await result
await fetch("http://localhost:3847/worker/worker-xxx/await", {
  method: "POST",
  body: JSON.stringify({ timeout: 300 })
})
```

### 2. Environment Variables

```
PI_ROLE=code-agent           # 当前角色
PI_WORKER_ID=worker-xxx      # worker ID（只有 worker 有）
PI_TASK_ID=task-001          # 当前任务 ID
PI_SUPERVISOR_PORT=3847      # supervisor 端口
PI_RESULTS_DIR=/tmp/...      # 结果目录
```

### 3. Worker 结果保存

Worker 完成后，将 findings 保存到文件：

```
/tmp/pi-adapter-results/
  ├── worker-xxx.json   # worker-xxx 的结果
  ├── worker-yyy.json   # worker-yyy 的结果
  └── ...
```

```json
{
  "workerId": "worker-xxx",
  "taskId": "task-001",
  "role": "code-agent",
  "exitCode": 0,
  "findings": [
    { "id": "F-xxx", "content": "...", "rating": "★★★" }
  ],
  "artifacts": []
}
```

---

## 使用流程

### 1. 启动 Supervisor

```bash
cd adapters/pi
npx ts-node protocol.ts
```

输出：
```
╔═══════════════════════════════════════════════════════════╗
║           pi-adapter Supervisor v1.0                      ║
╠═══════════════════════════════════════════════════════════╣
║  Port: 3847                                               ║
║  Results Dir: /tmp/pi-adapter-results                      ║
╚═══════════════════════════════════════════════════════════╝

✅ Supervisor listening on http://localhost:3847
```

### 2. 启动主 pi 会话（orchestrator）

```bash
pi \
  -e ./extension.ts \
  @./workflow.org \
  "Execute runbook workflow"
```

### 3. Orchestrator 委派任务

```typescript
// orchestrator 调用 worker.spawn
await worker.spawn({
  role: "code-agent",
  task: "Implement feature X",
  taskId: "impl-001",
  workflowPath: "./workflow.org"
})
// 返回: { workerId: "worker-xxx", statusUrl: "..." }
```

### 4. Supervisor 启动 Worker

```
supervisor 收到请求
         ↓
spawn("pi -e ./extension.ts -- PI_ROLE=code-agent ...")
         ↓
Worker pi 启动，加载 extension.ts
         ↓
Worker 被工具限制（不能 spawn 新 worker）
```

### 5. 等待并收集结果

```typescript
// orchestrator 等待 worker 完成
await worker.awaitResult({
  workerId: "worker-xxx",
  timeout: 300
})
// 返回: { findings: [...], artifacts: [...] }
```

---

## API 参考

### Supervisor HTTP API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | 健康检查 |
| `/worker/spawn` | POST | 启动 worker |
| `/worker/:id/status` | GET | 查询 worker 状态 |
| `/worker/:id/await` | POST | 等待 worker 完成 |
| `/workflow/update` | POST | 写 findings 到 workflow |
| `/workers` | GET | 列出活跃 worker |
| `/results` | GET | 获取所有结果 |

### Extension Tools

| Tool | 角色 | Description |
|------|------|-------------|
| `workflow.claimTask` | orchestrator | 声明任务 |
| `workflow.appendFinding` | all | 添加 finding |
| `workflow.attachEvidence` | all | 添加证据 |
| `workflow.setStatus` | all | 设置状态 |
| `workflow.advancePhase` | orchestrator | 推进阶段 |
| `workflow.update` | orchestrator | 写回 workflow |
| `worker.spawn` | orchestrator | 启动 worker |
| `worker.awaitResult` | orchestrator | 等待结果 |
| `worker.status` | orchestrator | 查询状态 |

### Extension Commands

| Command | Description |
|---------|-------------|
| `/adapter-status` | 显示 adapter 状态 |
| `/set-role <role>` | 切换角色（测试用） |
| `/findings` | 显示本地 findings |

---

## 当前状态

| 模块 | 状态 | 说明 |
|------|------|------|
| extension.ts | ✅ 完成 | 工具注册、拦截、通信 |
| protocol.ts | ✅ 完成 | HTTP API、worker 管理 |
| 集成测试 | ⏳ 待测 | 需要实际运行验证 |

### 已实现功能

- ✅ `registerTool` 注册高层语义工具
- ✅ `pi.on("tool_call")` 拦截器
- ✅ 角色工具限制表
- ✅ 路径保护
- ✅ 危险命令拦截
- ✅ Supervisor HTTP API
- ✅ worker spawn/await/status
- ✅ findings 收集和保存
- ✅ workflow update

### 待验证

- ⏳ 实际 spawn 进程
- ⏳ 结果写回 workflow.org
- ⏳ Phase 推进

---

## 安装依赖

```bash
cd adapters/pi
npm install typescript @types/node express
```

---

## See Also

- [[file:../claude/README.md][claude-adapter]] - Claude Code 适配器
- [[file:../../runbook-multiagent/SKILL.md][runbook-multiagent]] - 多 agent 协议
- [[file:../../orchestrator-skill/SKILL.md][orchestrator-skill]] - 编排器 profile
- [[https://github.com/badlogic/pi-mono][pi-mono]] - pi 编码 agent
