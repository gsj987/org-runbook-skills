/**
 * Role Gate Validator - Phase 2 (T2.3)
 * 
 * Validates that phase advancement is backed by required specialist roles.
 * 
 * PRD Rule B3: Orchestrator may not bypass required role gate.
 * - If phase policy requires specialist roles
 * - Those roles must appear in completed child tasks
 * - Before phase advance is allowed
 * 
 * PRD Section 9: Phase Gate Policy provides the formal requirements.
 */

import {
  ValidationError,
  OrchestratorAction,
  OrgState,
  TaskState,
  Role,
  Phase,
} from "../types/referee.js";

// ============================================================
// Phase Gate Policy
// ============================================================

export interface PhaseGateRequirement {
  /** Roles that must have completed child tasks */
  completed_child_roles?: Role[];
  /** Minimum number of child tasks that must be DONE */
  min_child_done?: number;
  /** Minimum evidence count */
  min_evidence?: number;
  /** Allowed evidence types */
  allowed_evidence_types?: string[];
  /** Minimum findings count */
  min_findings?: number;
}

export interface PhaseGate {
  /** Phase name */
  phase: Phase;
  /** Next phase when gate is passed */
  advance_to: Phase;
  /** Requirements to pass this gate */
  requires: PhaseGateRequirement;
  /** Whether this is a terminal phase */
  terminal?: boolean;
}

export type PhaseGatePolicy = Map<Phase, PhaseGate>;

// ============================================================
// Default Phase Gate Policy (PRD Section 9.1)
// ============================================================

export const DEFAULT_PHASE_GATE_POLICY: PhaseGatePolicy = new Map([
  ["discovery", {
    phase: "discovery",
    advance_to: "design",
    requires: {
      min_findings: 3,
      min_evidence: 1,
      completed_child_roles: [],
    },
  }],
  ["design", {
    phase: "design",
    advance_to: "implementation",
    requires: {
      min_findings: 3,
      min_evidence: 1,
      completed_child_roles: ["research-agent"],
    },
  }],
  ["implementation", {
    phase: "implementation",
    advance_to: "test",
    requires: {
      completed_child_roles: ["code-agent"],
      min_child_done: 1,
      min_evidence: 2,
      allowed_evidence_types: ["file", "command", "agent-output"],
    },
  }],
  ["test", {
    phase: "test",
    advance_to: "integration",
    requires: {
      completed_child_roles: ["test-agent"],
      min_evidence: 2,
    },
  }],
  ["integration", {
    phase: "integration",
    advance_to: "deploy-check",
    requires: {
      completed_child_roles: ["code-agent", "test-agent"],
      min_evidence: 2,
    },
  }],
  ["deploy-check", {
    phase: "deploy-check",
    advance_to: "acceptance",
    requires: {
      completed_child_roles: ["ops-agent"],
      min_evidence: 1,
    },
  }],
  ["acceptance", {
    phase: "acceptance",
    advance_to: "acceptance",
    requires: {},
    terminal: true,
  }],
]);

// ============================================================
// Role Gate Validation Result
// ============================================================

export interface RoleGateValidationResult {
  /** Whether the role gate is satisfied */
  satisfied: boolean;
  /** Missing required roles */
  missingRoles: Role[];
  /** Completed required roles */
  completedRoles: Role[];
  /** Child tasks that are done */
  completedChildTasks: string[];
  /** Current evidence count */
  evidenceCount: number;
  /** Evidence types present */
  evidenceTypes: string[];
  /** Validation errors */
  errors: ValidationError[];
  /** Warnings */
  warnings: string[];
}

// ============================================================
// Role Gate Validator
// ============================================================

export class RoleGateValidator {
  private policy: PhaseGatePolicy;
  
  constructor(policy?: PhaseGatePolicy) {
    this.policy = policy || DEFAULT_PHASE_GATE_POLICY;
  }
  
  /**
   * Validate role gate for phase advancement
   */
  validateRoleGate(
    action: OrchestratorAction,
    orgState: OrgState
  ): RoleGateValidationResult {
    // Only applies to ADVANCE_PHASE
    if (action.action !== "ADVANCE_PHASE") {
      return {
        satisfied: true,
        missingRoles: [],
        completedRoles: [],
        completedChildTasks: [],
        evidenceCount: 0,
        evidenceTypes: [],
        errors: [],
        warnings: [],
      };
    }
    
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    
    const fromPhase = action.payload.from_phase;
    const toPhase = action.payload.to_phase;
    const parentTaskId = action.parent_task_id;
    
    // Get parent task
    const parentTask = orgState.tasks.get(parentTaskId);
    if (!parentTask) {
      errors.push({
        code: "TASK_NOT_FOUND",
        message: `Parent task "${parentTaskId}" not found`,
        path: "parent_task_id",
      });
      return {
        satisfied: false,
        missingRoles: [],
        completedRoles: [],
        completedChildTasks: [],
        evidenceCount: 0,
        evidenceTypes: [],
        errors,
        warnings,
      };
    }
    
    // Get gate for current phase
    const gate = this.policy.get(fromPhase);
    if (!gate) {
      warnings.push(`No gate policy defined for phase "${fromPhase}"`);
      return {
        satisfied: true,
        missingRoles: [],
        completedRoles: [],
        completedChildTasks: [],
        evidenceCount: 0,
        evidenceTypes: [],
        errors,
        warnings,
      };
    }
    
    // Check if target phase matches expected
    if (gate.advance_to !== toPhase && !gate.terminal) {
      errors.push({
        code: "INVALID_PHASE_TRANSITION",
        message: `Cannot advance from "${fromPhase}" to "${toPhase}". Expected: "${gate.advance_to}"`,
        path: "payload.to_phase",
      });
    }
    
    // Get all child tasks
    const childTasks = this.getChildTasks(parentTaskId, orgState);
    const completedChildTasks = childTasks.filter(t => t.status === "DONE");
    
    // Check required roles
    const requiredRoles = gate.requires.completed_child_roles || [];
    const completedRoles: Role[] = [];
    const missingRoles: Role[] = [];
    
    for (const requiredRole of requiredRoles) {
      const hasRole = completedChildTasks.some(task => {
        // Check if task has the required role (could be stored in owner or metadata)
        return task.owner === requiredRole || 
               this.taskHasRole(task, requiredRole);
      });
      
      if (hasRole) {
        completedRoles.push(requiredRole);
      } else {
        missingRoles.push(requiredRole);
        errors.push({
          code: "PHASE_GATE_UNSATISFIED",
          message: `Phase gate requires "${requiredRole}" role completion, but no completed child task has this role`,
          path: "payload.gate_basis.completed_child_tasks",
        });
      }
    }
    
    // Check minimum child tasks done
    const minChildDone = gate.requires.min_child_done || 0;
    if (completedChildTasks.length < minChildDone) {
      errors.push({
        code: "PHASE_GATE_UNSATISFIED",
        message: `Phase gate requires at least ${minChildDone} completed child task(s), but only ${completedChildTasks.length} are done`,
        path: "payload.gate_basis.completed_child_tasks",
      });
    }
    
    // Check evidence requirements
    const allEvidence = this.getAllEvidence(parentTask, childTasks);
    const evidenceCount = allEvidence.length;
    const evidenceTypes = [...new Set(allEvidence.map(e => e.type))];
    
    const minEvidence = gate.requires.min_evidence || 0;
    if (evidenceCount < minEvidence) {
      errors.push({
        code: "PHASE_GATE_UNSATISFIED",
        message: `Phase gate requires at least ${minEvidence} evidence, but only ${evidenceCount} found`,
        path: "payload.gate_basis.evidence_refs",
      });
    }
    
    // Check evidence types
    const allowedTypes = gate.requires.allowed_evidence_types;
    if (allowedTypes && allowedTypes.length > 0) {
      const invalidTypes = evidenceTypes.filter(t => !allowedTypes.includes(t));
      if (invalidTypes.length > 0) {
        warnings.push(
          `Evidence types [${invalidTypes.join(", ")}] not in allowed types [${allowedTypes.join(", ")}]`
        );
      }
    }
    
    // Check findings
    const allFindings = this.getAllFindings(parentTask, childTasks);
    const minFindings = gate.requires.min_findings || 0;
    if (allFindings.length < minFindings) {
      errors.push({
        code: "PHASE_GATE_UNSATISFIED",
        message: `Phase gate requires at least ${minFindings} findings, but only ${allFindings.length} found`,
        path: "payload.gate_basis.evidence_refs",
      });
    }
    
    return {
      satisfied: errors.length === 0,
      missingRoles,
      completedRoles,
      completedChildTasks: completedChildTasks.map(t => t.id),
      evidenceCount,
      evidenceTypes,
      errors,
      warnings,
    };
  }
  
  /**
   * Get all child tasks for a parent
   */
  private getChildTasks(parentId: string, orgState: OrgState): TaskState[] {
    const children: TaskState[] = [];
    
    for (const task of orgState.tasks.values()) {
      if (task.parent === parentId) {
        children.push(task);
      }
    }
    
    return children;
  }
  
  /**
   * Get all evidence from parent and children
   */
  private getAllEvidence(parent: TaskState, children: TaskState[]): EvidenceState[] {
    const evidence: EvidenceState[] = [...parent.evidence];
    
    for (const child of children) {
      evidence.push(...child.evidence);
    }
    
    return evidence;
  }
  
  /**
   * Get all findings from parent and children
   */
  private getAllFindings(parent: TaskState, children: TaskState[]): FindingState[] {
    const findings: FindingState[] = [...parent.findings];
    
    for (const child of children) {
      findings.push(...child.findings);
    }
    
    return findings;
  }
  
  /**
   * Check if a task has a specific role
   * (This would need actual implementation based on how roles are stored)
   */
  private taskHasRole(task: TaskState, role: Role): boolean {
    // For now, check if owner matches role name
    // In a real implementation, roles would be stored in task metadata
    return task.owner === role;
  }
  
  /**
   * Update the phase gate policy
   */
  setPolicy(policy: PhaseGatePolicy): void {
    this.policy = policy;
  }
  
  /**
   * Get current policy
   */
  getPolicy(): PhaseGatePolicy {
    return this.policy;
  }
  
  /**
   * Check if a phase is terminal
   */
  isTerminalPhase(phase: Phase): boolean {
    const gate = this.policy.get(phase);
    return gate?.terminal || false;
  }
  
  /**
   * Get the expected next phase for a given phase
   */
  getNextPhase(phase: Phase): Phase | null {
    const gate = this.policy.get(phase);
    return gate?.advance_to || null;
  }
}

// ============================================================
// Factory Function
// ============================================================

export function createRoleGateValidator(
  policy?: PhaseGatePolicy
): RoleGateValidator {
  return new RoleGateValidator(policy);
}
