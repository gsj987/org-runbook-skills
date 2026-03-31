/**
 * claude-adapter: Claude Code Hooks for org-runbook-skills
 * 
 * Purpose: Implements runtime adapter layer for Claude Code
 * 
 * Key capabilities:
 * - Tool use interception (guardrail)
 * - Path protection
 * - Role-based permissions
 * 
 * Based on:
 * - Claude Code hooks API
 * - runbook-multiagent/SKILL.md protocol
 * - orchestrator-skill/SKILL.md profile
 */

// ============================================================
// Types
// ============================================================

type Role = "orchestrator" | "code-agent" | "test-agent" | "ops-agent" | "pm-agent" | "arch-agent";

interface ClaudeCodeHooks {
  toolUse?: (tool: string, args: Record<string, unknown>, context: HookContext) => HookResult;
  preTask?: (task: string, context: HookContext) => void;
  postTask?: (task: string, result: unknown, context: HookContext) => void;
}

interface HookContext {
  role: Role;
  sessionId: string;
  workingDirectory: string;
}

interface HookResult {
  allow?: boolean;
  error?: string;
  modifiedArgs?: Record<string, unknown>;
}

// ============================================================
// Configuration
// ============================================================

const PROTECTED_PATHS = [
  "/path/to/secrets",
  "/path/to/prod",
  "/.claude/secrets",
  "/.ssh",
];

const DANGEROUS_COMMANDS = [
  "rm -rf /",
  "git push --force",
  "docker push",
  "kubectl delete",
  "DROP DATABASE",
];

// Role tool permissions
const ROLE_TOOLS: Record<Role, string[]> = {
  orchestrator: ["Read", "Workflow.*", "Worker.*", "Glob", "Grep", "GrepAll"],
  "code-agent": ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "GrepAll"],
  "test-agent": ["Read", "Bash", "Glob", "Grep", "GrepAll"],
  "ops-agent": ["Read", "Bash", "Glob", "Grep", "GrepAll"],
  "pm-agent": ["Read", "Write", "Glob", "Grep", "GrepAll"],
  "arch-agent": ["Read", "Write", "Glob", "Grep", "GrepAll"],
};

// ============================================================
// Helper Functions
// ============================================================

function isPathProtected(path: string): boolean {
  return PROTECTED_PATHS.some(p => path.startsWith(p));
}

function isToolAllowed(toolName: string, role: Role): boolean {
  const allowedTools = ROLE_TOOLS[role] || [];
  return allowedTools.some(allowed => {
    if (allowed.endsWith(".*")) {
      return toolName.startsWith(allowed.slice(0, -2));
    }
    return toolName === allowed;
  });
}

function isDangerousCommand(command: string): boolean {
  return DANGEROUS_COMMANDS.some(d => command.includes(d));
}

// ============================================================
// Main Hooks Implementation
// ============================================================

export const hooks: ClaudeCodeHooks = {
  /**
   * Tool Use Hook
   * 
   * Called before each tool execution.
   * Use for:
   * - Permission checking
   * - Path protection
   * - Argument modification
   */
  toolUse: (tool: string, args: Record<string, unknown>, context: HookContext) => {
    const { role } = context;
    
    // Check if tool is allowed for role
    if (!isToolAllowed(tool, role)) {
      return {
        allow: false,
        error: `Tool '${tool}' is not permitted for role '${role}'`,
      };
    }
    
    // Path protection for file operations
    if (["Write", "Edit", "Read"].includes(tool)) {
      const path = args.path as string;
      if (path && isPathProtected(path)) {
        return {
          allow: false,
          error: `Path '${path}' is protected`,
        };
      }
    }
    
    // Dangerous command check for Bash
    if (tool === "Bash") {
      const command = args.command as string;
      if (command && isDangerousCommand(command)) {
        return {
          allow: false,
          error: `Dangerous command blocked: ${command.substring(0, 50)}...`,
        };
      }
    }
    
    // Allow the tool
    return { allow: true };
  },
  
  /**
   * Pre-Task Hook
   * 
   * Called before starting a task.
   * Use for:
   * - Task validation
   * - Context setup
   */
  preTask: (task: string, context: HookContext) => {
    console.log(`[${context.role}] Starting task: ${task}`);
  },
  
  /**
   * Post-Task Hook
   * 
   * Called after a task completes.
   * Use for:
   * - Result logging
   * - Artifact collection
   */
  postTask: (task: string, result: unknown, context: HookContext) => {
    console.log(`[${context.role}] Completed task: ${task}`);
  },
};

// ============================================================
// Claude Code Configuration
// ============================================================

/**
 * Claude Code configuration for org-runbook-skills
 * 
 * Usage:
 * 1. Copy this configuration to ~/.claude/projects/<project>/settings.json
 * 2. Or include hooks.ts in your project
 * 
 * See: https://docs.claude.com/claude-code/hooks
 */
export const claudeConfig = {
  hooks: {
    "tool-use": "hooks.toolUse",
    "pre-task": "hooks.preTask",
    "post-task": "hooks.postTask",
  },
  
  subagents: {
    orchestrator: {
      profile: "orchestrator",
      hooks: ["tool-use"],
    },
    "code-agent": {
      profile: "developer",
      hooks: ["tool-use"],
    },
  },
};

// ============================================================
// Export
// ============================================================

export default hooks;
