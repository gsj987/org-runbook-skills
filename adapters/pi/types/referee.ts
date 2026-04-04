/**
 * Referee Types - Orchestrator Action Schemas
 * 
 * Defines the structured output contract for orchestrator actions.
 * Based on PRD Section 7: Structured Output Contract
 * 
 * @module referee/types
 */

// ============================================================
// Core Types
// ============================================================

/**
 * Allowed orchestrator actions (PRD Section 6.1)
 * Including optional actions (G4): CANCEL_TASK, REPLAN_SUBTASKS
 */
export type OrchestratorActionType =
  | "SPAWN_SUBTASK"
  | "MERGE_SUBTASK_RESULT"
  | "ADVANCE_PHASE"
  | "RAISE_BLOCKER"
  | "REQUEST_USER_DECISION"
  | "CANCEL_TASK"         // G4: Cancel a task
  | "REPLAN_SUBTASKS";    // G4: Replan child tasks

/**
 * All allowed action types for validation
 */
export const ALLOWED_ACTIONS: OrchestratorActionType[] = [
  "SPAWN_SUBTASK",
  "MERGE_SUBTASK_RESULT",
  "ADVANCE_PHASE",
  "RAISE_BLOCKER",
  "REQUEST_USER_DECISION",
  "CANCEL_TASK",
  "REPLAN_SUBTASKS",
];

/**
 * Role codes for task assignment
 */
export type Role =
  | "orchestrator"
  | "code-agent"
  | "test-agent"
  | "ops-agent"
  | "pm-agent"
  | "arch-agent"
  | "research-agent"
  | "ux-agent"
  | "api-agent"
  | "qa-agent"
  | "integration-agent"
  | "deploy-agent"
  | "deps-agent"
  | "security-agent"
  | "perf-agent"
  | "data-agent";

/**
 * Phase names for workflow progression
 */
export type Phase =
  | "discovery"
  | "design"
  | "implementation"
  | "test"
  | "integration"
  | "deploy-check"
  | "acceptance";

/**
 * Valid phase transitions
 */
export const VALID_PHASE_TRANSITIONS: Record<Phase, Phase | null> = {
  "discovery": "design",
  "design": "implementation",
  "implementation": "test",
  "test": "integration",
  "integration": "deploy-check",
  "deploy-check": "acceptance",
  "acceptance": null, // Terminal phase
};

/**
 * Blocker types for RAISE_BLOCKER action
 */
export type BlockerType =
  | "missing-role"
  | "dependency-blocked"
  | "external-dependency"
  | "user-decision-required"
  | "runtime-limitation"
  | "unknown";

// ============================================================
// Action Interfaces
// ============================================================

/**
 * Base interface for all orchestrator actions
 */
export interface BaseOrchestratorAction {
  action: OrchestratorActionType;
  parent_task_id: string;
  reason: string;
  expected_effect: string;
}

/**
 * SPAWN_SUBTASK - Create a new child task and assign to a role
 * PRD Section 7.2.A
 */
export interface SpawnSubtaskAction extends BaseOrchestratorAction {
  action: "SPAWN_SUBTASK";
  payload: {
    child_task_id: string;
    title: string;
    role: Role;
    phase: Phase;
    depends_on: string[];
    skill?: string;
    output_contract?: {
      required_findings: number;
      required_evidence_types: EvidenceType[];
      deliverables: string[];
    };
  };
}

/**
 * MERGE_SUBTASK_RESULT - Merge completed child results into parent
 * PRD Section 7.2.B
 */
export interface MergeSubtaskResultAction extends BaseOrchestratorAction {
  action: "MERGE_SUBTASK_RESULT";
  payload: {
    child_task_id: string;
    summary: string;
    finding_refs: string[];  // F-<uuid> references
    evidence_refs: string[];  // E-<uuid> references
    parent_updates?: {
      findings_append?: string[];
      next_actions_append?: string[];
    };
  };
}

/**
 * ADVANCE_PHASE - Transition to next workflow phase
 * PRD Section 7.2.C
 */
export interface AdvancePhaseAction extends BaseOrchestratorAction {
  action: "ADVANCE_PHASE";
  payload: {
    from_phase: Phase;
    to_phase: Phase;
    gate_basis: {
      required_roles: Role[];
      completed_child_tasks: string[];
      evidence_refs: string[];
    };
  };
}

/**
 * RAISE_BLOCKER - Mark task or phase as blocked
 * PRD Section 7.2.D
 */
export interface RaiseBlockerAction extends BaseOrchestratorAction {
  action: "RAISE_BLOCKER";
  payload: {
    blocker_type: BlockerType;
    details: string;
    blocked_tasks: string[];
    suggested_next_step: string;
  };
}

/**
 * REQUEST_USER_DECISION - Pause for human input
 * PRD Section 7.2.E
 */
export interface RequestUserDecisionAction extends BaseOrchestratorAction {
  action: "REQUEST_USER_DECISION";
  payload: {
    question: string;
    options: Array<{
      id: string;
      description: string;
    }>;
    default: string;
  };
}

/**
 * CANCEL_TASK - Cancel a task (G4)
 * Optional action for terminating a task without completing it.
 */
export interface CancelTaskAction extends BaseOrchestratorAction {
  action: "CANCEL_TASK";
  payload: {
    task_id: string;
    reason: string;
    alternatives?: string[];
  };
}

/**
 * REPLAN_SUBTASKS - Replan child tasks (G4)
 * Optional action for regenerating child task plan.
 */
export interface ReplanSubtasksAction extends BaseOrchestratorAction {
  action: "REPLAN_SUBTASKS";
  payload: {
    current_tasks: string[];
    completed_tasks: string[];
    failed_tasks: string[];
    new_plan: Array<{
      task_id: string;
      title: string;
      role: Role;
      depends_on: string[];
    }>;
  };
}

/**
 * Union type of all valid orchestrator actions
 */
export type OrchestratorAction =
  | SpawnSubtaskAction
  | MergeSubtaskResultAction
  | AdvancePhaseAction
  | RaiseBlockerAction
  | RequestUserDecisionAction
  | CancelTaskAction
  | ReplanSubtasksAction;

// ============================================================
// Evidence Types (from runbook-org)
// ============================================================

export type EvidenceType = "file" | "command" | "web" | "blog" | "agent-output";

export type EvidenceRating = "★★★" | "★★" | "★";

export type FindingRating = "★★★" | "★★" | "★";

// ============================================================
// Validation Types
// ============================================================

/**
 * Validation error codes (PRD Section 12.2)
 */
export type ValidationErrorCode =
  | "INVALID_JSON"
  | "UNKNOWN_ACTION"
  | "SPECIALIST_CONTENT_DETECTED"
  | "TASK_NOT_FOUND"
  | "PHASE_GATE_UNSATISFIED"
  | "CHILD_NOT_DONE"
  | "DEPENDENCY_UNSATISFIED"
  | "NO_STATE_CHANGE"
  | "MISSING_EVIDENCE_REF"
  | "MULTIPLE_ACTIONS"
  | "INVALID_PHASE_TRANSITION"
  | "INVALID_ROLE"
  | "INVALID_TASK_ID"
  | "INVALID_REASON"
  | "INVALID_PARENT_UPDATES"   // G2: Invalid parent_updates field
  | "EVIDENCE_TYPE_NOT_ALLOWED" // G3: Evidence type not in allowed list
  | "TASK_ALREADY_CANCELLED";   // G4: Task already cancelled

/**
 * Validation error with code and message
 */
export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  path?: string;
}

/**
 * Validation warning (non-blocking issues)
 */
export interface ValidationWarning {
  code: string;
  message: string;
}

/**
 * Result of action validation
 */
export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Parse result - either successful action or failure
 */
export interface ParseResult {
  success: boolean;
  action?: OrchestratorAction;
  error?: {
    code: "PARSE_ERROR" | "NO_JSON_FOUND" | "MULTIPLE_JSON";
    message: string;
    raw_output?: string;
  };
}

// ============================================================
// Org State Types
// ============================================================

/**
 * Minimal task state from org file
 */
export interface TaskState {
  id: string;
  status: "TODO" | "IN-PROGRESS" | "DONE" | "BLOCKED" | "CANCELLED";
  owner?: string;
  phase?: Phase;
  parent?: string;
  findings: FindingState[];
  evidence: EvidenceState[];
}

/**
 * Finding state from org
 */
export interface FindingState {
  id: string;  // F-<uuid>
  content: string;
  rating: FindingRating;
  timestamp: string;
}

/**
 * Evidence state from org
 */
export interface EvidenceState {
  id: string;  // E-<uuid>
  type: EvidenceType;
  source: string;
  finding_ref: string;  // F-<uuid>
  rating: EvidenceRating;
  timestamp: string;
}

/**
 * Current org workflow state
 */
export interface OrgState {
  workflowPath: string;
  tasks: Map<string, TaskState>;
  rootTaskId?: string;
}

// ============================================================
// Referee Configuration
// ============================================================

/**
 * Referee configuration options
 */
export interface RefereeConfig {
  /**
   * Enable strict mode (Phase 1: lenient parsing)
   */
  strictMode: boolean;
  
  /**
   * Enable specialist content detection (Phase 2)
   */
  detectSpecialistContent: boolean;
  
  /**
   * Enable phase gate validation (Phase 3)
   */
  validatePhaseGates: boolean;
  
  /**
   * Max retry attempts before escalating
   */
  maxRetries: number;
  
  /**
   * Custom phase transition policy path
   */
  phaseGatePolicyPath?: string;
}

/**
 * Default referee configuration
 */
export const DEFAULT_REFEREE_CONFIG: RefereeConfig = {
  strictMode: false,
  detectSpecialistContent: false,
  validatePhaseGates: false,
  maxRetries: 3,
};
