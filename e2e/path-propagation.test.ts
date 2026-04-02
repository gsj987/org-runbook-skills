/**
 * E2E Test: Path propagation from orchestrator to workers
 * 
 * This test verifies that spawned workers run in the correct project directory,
 * even when the supervisor is started from a different directory.
 * 
 * Bug Fixed:
 * When the supervisor was started from /home or another directory (rather than
 * the project directory), workers would incorrectly use "/" as their working
 * directory, causing file not found errors like:
 *   Error: File not found: /runbook/001-my-project.org
 * 
 * Fix:
 * The extension now passes projectDir (process.cwd()) to the supervisor,
 * which uses it as the working directory for spawned workers.
 * 
 * Run:
 *   cd /home/gsj987/Workspace/org-runbook-skills
 *   ./deploy.sh --project .
 *   npx ts-node --esm e2e/path-propagation.test.ts
 * 
 * Note: Requires a running supervisor on port 3947. To start one:
 *   cd .pi/extensions/pi-adapter
 *   PI_SUPERVISOR_PORT=3947 npx ts-node --esm protocol.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { execSync } from "child_process";

const SUPERVISOR_PORT = 3847;
const SUPERVISOR_URL = `http://localhost:${SUPERVISOR_PORT}`;
const PROJECT_ROOT = "/home/gsj987/Workspace/org-runbook-skills";

async function request<T>(endpoint: string, options: any = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = http.request(`${SUPERVISOR_URL}${endpoint}`, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json" },
    }, (res: any) => {
      let data = "";
      res.on("data", (c: string) => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON: ${data}`)); }
      });
    });
    req.on("error", reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function main() {
  console.log("🧪 E2E: Path propagation from orchestrator to workers");
  console.log("=".repeat(60));
  
  // Check if supervisor is running
  try {
    await request("/health");
    console.log("✅ Supervisor is running on port", SUPERVISOR_PORT);
  } catch {
    console.error("❌ Supervisor not running on port", SUPERVISOR_PORT);
    console.error("   Start it with: PI_SUPERVISOR_PORT=3947 npx ts-node --esm .pi/extensions/pi-adapter/protocol.ts");
    process.exit(1);
  }
  
  // Create test workflow
  const workflowPath = path.join(PROJECT_ROOT, "runbook", "010-e2e-path-test.org");
  fs.writeFileSync(workflowPath, `#+title: E2E Path Test
#+TODO: TODO(t) | DONE(d)
* TODO Path test task
- Goal :: Verify worker runs in correct directory
- Findings ::
`);
  console.log(`✅ Created workflow: ${workflowPath}`);
  
  try {
    // Spawn worker with explicit projectDir (simulating extension behavior)
    console.log("\n🤖 Spawning worker with projectDir...");
    const projectDir = PROJECT_ROOT;
    
    const spawnRes = await request<{ success: boolean; workerId: string }>("/worker/spawn", {
      method: "POST",
      body: {
        role: "ops-agent",
        task: "Run: pwd && ls runbook/",
        taskId: "e2e-path-001",
        workflowPath: "runbook/010-e2e-path-test.org",
        projectDir,
      },
    });
    
    if (!spawnRes.success) {
      console.error("❌ Spawn failed");
      process.exit(1);
    }
    console.log(`✅ Worker spawned: ${spawnRes.workerId}`);
    
    // Wait for completion
    console.log("⏳ Waiting for worker...");
    let result: any = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const res = await request<{ success: boolean; result?: any }>(
          `/worker/${spawnRes.workerId}/await`,
          { method: "POST", body: { timeout: 5 } }
        );
        if (res.success && res.result) {
          result = res.result;
          break;
        }
      } catch {}
    }
    
    if (!result) {
      console.error("❌ Worker timed out");
      process.exit(1);
    }
    
    console.log("\n📊 Worker Output:");
    console.log(`   ${(result.stdout || "(empty)").split("\n").slice(0, 10).join("\n   ")}`);
    
    // Verify results
    const stdout = result.stdout || "";
    // Check for correct directory (pwd output contains project name or full path)
    const correctCwd = stdout.includes("org-runbook-skills") || stdout.includes("gsj987");
    // Check for runbook directory content:
    // - ls output contains file names ending in .org (e.g., "001-my-project.org")
    // - Or task completion message mentions "org files visible"
    const hasRunbookFiles = stdout.includes(".org") || 
                            stdout.includes("org files") ||
                            stdout.includes("runbook");
    
    console.log("\n" + "=".repeat(60));
    console.log("📋 Verification:");
    console.log(`   ${correctCwd ? "✅" : "❌"} Worker runs in correct project directory`);
    console.log(`   ${hasRunbookFiles ? "✅" : "❌"} runbook/ directory accessible`);
    console.log("\n   Worker stdout excerpt:");
    console.log(`   ${stdout.split("\n").slice(0, 8).join("\n   ")}`);
    
    if (!correctCwd || !hasRunbookFiles) {
      console.log("\n❌ FAIL: Path propagation issue detected");
      console.log("   Worker stdout:", stdout.slice(0, 500));
      process.exit(1);
    }
    
    console.log("\n✅ All checks passed!");
    
  } finally {
    // Cleanup
    try { fs.unlinkSync(workflowPath); } catch {}
  }
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
