/**
 * ActionValidator - Validate orchestrator actions against protocol rules
 * 
 * Implements validation rules from PRD Section 8:
 * - Rule Group A: Output Legality (A1-A4)
 * - Rule Group B: Role Boundary (B1-B3)
 * - Rule Group C: State Validity (C1-C5)
 * - Rule Group D: Loop Validity (D1-D3)
 * 
 * Phase 1 implements basic validation:
 * - Schema validation (A1-A3)
 * - Task existence (C1)
 * 
 * Phase 2 adds role boundary enforcement:
 * - B1: Specialist content detection
 * - B2: Citation validation
 * - B3: Role gate validation
 * 
 * @module referee/validator
 */

import {
  OrchestratorAction,
  OrchestratorActionType,
  ALLOWED_ACTIONS,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationErrorCode,
  OrgState,
  TaskState,
  VALID_PHASE_TRANSITIONS,
  Phase,
} from "../types/referee.js";

// Phase 2 validators
import { 
  SpecialistContentDetector, 
  createSpecialistContentDetector,
  DetectionResult 
} from "./specialist-detector.js";

import { 
  CitationValidator, 
  createCitationValidator 
} from "./citation-validator.js";

import { 
  RoleGateValidator, 
  createRoleGateValidator,
  PhaseGatePolicy 
} from "./role-gate-validator.js";

// ============================================================
// Validator Class
// ============================================================

export interface ValidatorConfig {
  /** Enable strict mode */
  strictMode?: boolean;
  /** Enable specialist content detection (Phase 2) */
  detectSpecialistContent?: boolean;
  /** Enable phase gate validation (Phase 3) */
  validatePhaseGates?: boolean;
  /** Custom phase gate policy */
  phaseGatePolicy?: PhaseGatePolicy;
}

export class ActionValidator {
  private orgState: OrgState | null = null;
  private config: ValidatorConfig;
  
  // Phase 2 validators
  private specialistDetector: SpecialistContentDetector;
  private citationValidator: CitationValidator;
  private roleGateValidator: RoleGateValidator;
  
  // Store raw output for specialist detection
  private lastRawOutput?: string;

  constructor(config: ValidatorConfig = {}) {
    this.config = {
      strictMode: false,
      detectSpecialistContent: false,
      validatePhaseGates: false,
      ...config,
    };
    
    // Initialize Phase 2 validators
    this.specialistDetector = createSpecialistContentDetector();
    this.citationValidator = createCitationValidator();
    this.roleGateValidator = createRoleGateValidator(this.config.phaseGatePolicy);
  }

  /**
   * Set the current org state for validation
   */
  setOrgState(state: OrgState): void {
    this.orgState = state;
  }

  /**
   * Clear org state
   */
  clearOrgState(): void {
    this.orgState = null;
  }
  
  /**
   * Set raw output for specialist content detection
   */
  setRawOutput(rawOutput: string): void {
    this.lastRawOutput = rawOutput;
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<ValidatorConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.phaseGatePolicy) {
      this.roleGateValidator.setPolicy(config.phaseGatePolicy);
    }
  }

  /**
   * Validate an orchestrator action
   */
  validate(action: OrchestratorAction, rawOutput?: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Use provided raw output or last stored
    const outputToCheck = rawOutput || this.lastRawOutput || "";
    
    // ========================================
    // Phase 1: Basic Validation
    // ========================================
    
    // Rule A1: Single action only (already enforced by parser)
    // Rule A2: JSON only (already enforced by parser)
    // Rule A3: Known action only (already enforced by parser)

    // Validate action-specific fields
    const actionErrors = this.validateActionFields(action);
    errors.push(...actionErrors);

    // Rule C1: Task existence
    if (this.orgState) {
      const taskErrors = this.validateTaskExistence(action);
      errors.push(...taskErrors);

      // Rule C2: Dependency validity
      const depErrors = this.validateDependencies(action);
      errors.push(...depErrors);

      // Rule C3: Phase validity
      const phaseErrors = this.validatePhaseTransition(action);
      errors.push(...phaseErrors);

      // Rule C4: Merge validity (child must be DONE)
      const mergeErrors = this.validateMergePreconditions(action);
      errors.push(...mergeErrors);

      // Rule D3: No-op detection (only in strict mode)
      if (this.config.strictMode) {
        const noOpErrors = this.validateNoOpDetection(action);
        errors.push(...noOpErrors);
      }
    }
    
    // ========================================
    // Phase 2: Role Boundary Enforcement
    // ========================================
    
    if (this.config.detectSpecialistContent) {
      // Rule B1: Specialist content detection
      const specialistErrors = this.validateSpecialistContent(outputToCheck);
      errors.push(...specialistErrors);
    }
    
    if (this.orgState) {
      // Rule B2: Citation validation for MERGE
      if (action.action === "MERGE_SUBTASK_RESULT") {
        const citationResult = this.citationValidator.validateMergeCitation(
          action, 
          this.orgState
        );
        errors.push(...citationResult.errors);
      }
      
      // Rule B3: Role gate validation for ADVANCE_PHASE
      if (action.action === "ADVANCE_PHASE" && this.config.validatePhaseGates) {
        const gateResult = this.roleGateValidator.validateRoleGate(
          action, 
          this.orgState
        );
        errors.push(...gateResult.errors);
        warnings.push(...gateResult.warnings.map(w => ({ code: "ROLE_GATE_WARNING", message: w })));
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings,
    };
  }
  
  /**
   * Phase 2: Validate no specialist content in output
   */
  private validateSpecialistContent(rawOutput: string): ValidationError[] {
    if (!rawOutput) return [];
    
    const result = this.specialistDetector.detect(rawOutput);
    
    if (result.detected) {
      const error = this.specialistDetector.toValidationError(result);
      if (error) {
        return [error];
      }
    }
    
    return [];
  }
  
  /**
   * Get specialist content detection result (for debugging)
   */
  detectSpecialistContent(rawOutput: string): DetectionResult {
    return this.specialistDetector.detect(rawOutput);
  }

  /**
   * Validate citation for MERGE action
   */
  validateCitation(action: OrchestratorAction): import("./citation-validator.js").CitationValidationResult | null {
    if (!this.orgState || action.action !== "MERGE_SUBTASK_RESULT") {
      return null;
    }
    return this.citationValidator.validateMergeCitation(action, this.orgState);
  }
  
  /**
   * Validate role gate for ADVANCE_PHASE action
   */
  validateRoleGate(action: OrchestratorAction): import("./role-gate-validator.js").RoleGateValidationResult | null {
    if (!this.orgState || action.action !== "ADVANCE_PHASE") {
      return null;
    }
    return this.roleGateValidator.validateRoleGate(action, this.orgState);
  }

  /**
   * Validate action-specific fields
   */
  private validateActionFields(action: OrchestratorAction): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate parent_task_id is non-empty
    if (!action.parent_task_id || action.parent_task_id.trim() === "") {
      errors.push({
        code: "INVALID_TASK_ID",
        message: "parent_task_id cannot be empty",
        path: "parent_task_id",
      });
    }

    // Validate reason is present and non-trivial
    if (!action.reason || action.reason.trim().length < 5) {
      errors.push({
        code: "INVALID_REASON",
        message: "reason must be at least 5 characters explaining the action",
        path: "reason",
      });
    }

    // Action-specific validation
    switch (action.action) {
      case "SPAWN_SUBTASK":
        this.validateSpawnFields(action, errors);
        break;
      case "MERGE_SUBTASK_RESULT":
        this.validateMergeFields(action, errors);
        break;
      case "ADVANCE_PHASE":
        this.validateAdvanceFields(action, errors);
        break;
      case "CANCEL_TASK":
        this.validateCancelTaskFields(action, errors);
        break;
      case "REPLAN_SUBTASKS":
        this.validateReplanFields(action, errors);
        break;
    }

    // G2: Validate MERGE parent_updates if present
    if (action.action === "MERGE_SUBTASK_RESULT" && action.payload.parent_updates) {
      const parentUpdatesErrors = this.validateParentUpdates(action.payload.parent_updates);
      errors.push(...parentUpdatesErrors);
    }

    return errors;
  }

  private validateParentUpdates(parentUpdates: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!parentUpdates) return errors;

    // Validate findings_append
    if (parentUpdates.findings_append !== undefined) {
      if (!Array.isArray(parentUpdates.findings_append)) {
        errors.push({
          code: "INVALID_PARENT_UPDATES",
          message: "parent_updates.findings_append must be an array",
          path: "payload.parent_updates.findings_append",
        });
      } else {
        for (let i = 0; i < parentUpdates.findings_append.length; i++) {
          const finding = parentUpdates.findings_append[i];
          if (typeof finding !== "string" && typeof finding !== "object") {
            errors.push({
              code: "INVALID_PARENT_UPDATES",
              message: `parent_updates.findings_append[${i}] must be a string or object`,
              path: `payload.parent_updates.findings_append[${i}]`,
            });
          }
        }
      }
    }

    // Validate next_actions_append
    if (parentUpdates.next_actions_append !== undefined) {
      if (!Array.isArray(parentUpdates.next_actions_append)) {
        errors.push({
          code: "INVALID_PARENT_UPDATES",
          message: "parent_updates.next_actions_append must be an array",
          path: "payload.parent_updates.next_actions_append",
        });
      } else {
        for (let i = 0; i < parentUpdates.next_actions_append.length; i++) {
          const action_item = parentUpdates.next_actions_append[i];
          if (typeof action_item !== "string" && typeof action_item !== "object") {
            errors.push({
              code: "INVALID_PARENT_UPDATES",
              message: `parent_updates.next_actions_append[${i}] must be a string or object`,
              path: `payload.parent_updates.next_actions_append[${i}]`,
            });
          }
        }
      }
    }

    return errors;
  }

  private validateSpawnFields(action: any, errors: ValidationError[]): void {
    const { payload } = action;

    if (!payload.child_task_id || payload.child_task_id.trim() === "") {
      errors.push({
        code: "INVALID_TASK_ID",
        message: "child_task_id cannot be empty",
        path: "payload.child_task_id",
      });
    }

    if (!payload.title || payload.title.trim() === "") {
      errors.push({
        code: "INVALID_TASK_ID",
        message: "title cannot be empty",
        path: "payload.title",
      });
    }

    if (!payload.role || payload.role.trim() === "") {
      errors.push({
        code: "INVALID_ROLE",
        message: "role cannot be empty",
        path: "payload.role",
      });
    }
  }

  private validateMergeFields(action: any, errors: ValidationError[]): void {
    const { payload } = action;

    if (!payload.child_task_id || payload.child_task_id.trim() === "") {
      errors.push({
        code: "INVALID_TASK_ID",
        message: "child_task_id cannot be empty",
        path: "payload.child_task_id",
      });
    }

    // MERGE requires at least summary or finding_refs
    if (!payload.summary && (!payload.finding_refs || payload.finding_refs.length === 0)) {
      errors.push({
        code: "MISSING_EVIDENCE_REF",
        message: "MERGE requires either summary or finding_refs",
        path: "payload",
      });
    }
  }

  private validateAdvanceFields(action: any, errors: ValidationError[]): void {
    const { payload } = action;

    const validPhases: Phase[] = [
      "discovery", "design", "implementation", "test",
      "integration", "deploy-check", "acceptance"
    ];

    if (!validPhases.includes(payload.from_phase)) {
      errors.push({
        code: "INVALID_PHASE_TRANSITION",
        message: `Invalid from_phase: ${payload.from_phase}`,
        path: "payload.from_phase",
      });
    }

    if (!validPhases.includes(payload.to_phase)) {
      errors.push({
        code: "INVALID_PHASE_TRANSITION",
        message: `Invalid to_phase: ${payload.to_phase}`,
        path: "payload.to_phase",
      });
    }
  }

  /**
   * G4: Validate CANCEL_TASK fields
   */
  private validateCancelTaskFields(action: any, errors: ValidationError[]): void {
    const { payload } = action;

    if (!payload.task_id || payload.task_id.trim() === "") {
      errors.push({
        code: "INVALID_TASK_ID",
        message: "task_id cannot be empty for CANCEL_TASK",
        path: "payload.task_id",
      });
    }

    if (!payload.reason || payload.reason.trim().length < 10) {
      errors.push({
        code: "INVALID_REASON",
        message: "CANCEL_TASK requires a reason of at least 10 characters",
        path: "payload.reason",
      });
    }
  }

  /**
   * G4: Validate REPLAN_SUBTASKS fields
   */
  private validateReplanFields(action: any, errors: ValidationError[]): void {
    const { payload } = action;

    if (!Array.isArray(payload.current_tasks)) {
      errors.push({
        code: "INVALID_TASK_ID",
        message: "current_tasks must be an array",
        path: "payload.current_tasks",
      });
    }

    if (!Array.isArray(payload.new_plan)) {
      errors.push({
        code: "INVALID_TASK_ID",
        message: "new_plan must be an array",
        path: "payload.new_plan",
      });
    } else if (payload.new_plan.length === 0) {
      errors.push({
        code: "INVALID_TASK_ID",
        message: "new_plan cannot be empty",
        path: "payload.new_plan",
      });
    } else {
      for (let i = 0; i < payload.new_plan.length; i++) {
        const plan = payload.new_plan[i];
        if (!plan.task_id) {
          errors.push({
            code: "INVALID_TASK_ID",
            message: `new_plan[${i}].task_id is required`,
            path: `payload.new_plan[${i}].task_id`,
          });
        }
        if (!plan.role) {
          errors.push({
            code: "INVALID_ROLE",
            message: `new_plan[${i}].role is required`,
            path: `payload.new_plan[${i}].role`,
          });
        }
      }
    }
  }

  /**
   * Rule C1: Task existence
   */
  private validateTaskExistence(action: OrchestratorAction): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!this.orgState) return errors;

    // Check parent task exists
    const parentTask = this.orgState.tasks.get(action.parent_task_id);
    if (!parentTask) {
      errors.push({
        code: "TASK_NOT_FOUND",
        message: `Parent task "${action.parent_task_id}" not found in workflow`,
        path: "parent_task_id",
      });
    }

    // For SPAWN and MERGE, check child task
    if (action.action === "SPAWN_SUBTASK" || action.action === "MERGE_SUBTASK_RESULT") {
      const childTaskId = action.payload.child_task_id || 
        (action.action === "MERGE_SUBTASK_RESULT" ? action.payload.child_task_id : null);
      
      if (childTaskId && action.action === "MERGE_SUBTASK_RESULT") {
        const childTask = this.orgState.tasks.get(childTaskId);
        if (!childTask) {
          errors.push({
            code: "TASK_NOT_FOUND",
            message: `Child task "${childTaskId}" not found in workflow`,
            path: "payload.child_task_id",
          });
        }
      }
    }

    // For MERGE, validate finding and evidence references
    if (action.action === "MERGE_SUBTASK_RESULT") {
      const { finding_refs, evidence_refs } = action.payload;

      if (finding_refs && finding_refs.length > 0) {
        for (const ref of finding_refs) {
          if (!this.findFindingInState(ref)) {
            errors.push({
              code: "MISSING_EVIDENCE_REF",
              message: `Finding reference "${ref}" not found in workflow`,
              path: "payload.finding_refs",
            });
          }
        }
      }

      if (evidence_refs && evidence_refs.length > 0) {
        for (const ref of evidence_refs) {
          if (!this.findEvidenceInState(ref)) {
            errors.push({
              code: "MISSING_EVIDENCE_REF",
              message: `Evidence reference "${ref}" not found in workflow`,
              path: "payload.evidence_refs",
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * Rule C2: Dependency validity
   */
  private validateDependencies(action: OrchestratorAction): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!this.orgState || action.action !== "SPAWN_SUBTASK") {
      return errors;
    }

    const { depends_on } = action.payload;
    if (!depends_on || depends_on.length === 0) {
      return errors;
    }

    for (const depId of depends_on) {
      const depTask = this.orgState.tasks.get(depId);
      if (!depTask) {
        errors.push({
          code: "DEPENDENCY_UNSATISFIED",
          message: `Dependency task "${depId}" not found in workflow`,
          path: "payload.depends_on",
        });
      } else if (depTask.status !== "DONE") {
        errors.push({
          code: "DEPENDENCY_UNSATISFIED",
          message: `Dependency task "${depId}" must be DONE, current status: ${depTask.status}`,
          path: "payload.depends_on",
        });
      }
    }

    return errors;
  }

  /**
   * Rule C3: Phase validity
   */
  private validatePhaseTransition(action: OrchestratorAction): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!this.orgState || action.action !== "ADVANCE_PHASE") {
      return errors;
    }

    const { from_phase, to_phase } = action.payload;

    // Check if transition is valid
    const validNextPhase = VALID_PHASE_TRANSITIONS[from_phase];
    if (validNextPhase === null) {
      errors.push({
        code: "INVALID_PHASE_TRANSITION",
        message: `Phase "${from_phase}" is terminal, cannot advance`,
        path: "payload.from_phase",
      });
    } else if (to_phase !== validNextPhase) {
      errors.push({
        code: "INVALID_PHASE_TRANSITION",
        message: `Invalid phase transition: ${from_phase} -> ${to_phase}. Must be: ${from_phase} -> ${validNextPhase}`,
        path: "payload.to_phase",
      });
    }

    return errors;
  }

  /**
   * Rule C4: Merge validity (child must be DONE)
   */
  private validateMergePreconditions(action: OrchestratorAction): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!this.orgState || action.action !== "MERGE_SUBTASK_RESULT") {
      return errors;
    }

    const childTask = this.orgState.tasks.get(action.payload.child_task_id);
    if (childTask && childTask.status !== "DONE") {
      errors.push({
        code: "CHILD_NOT_DONE",
        message: `Child task "${action.payload.child_task_id}" must be DONE before merge, current status: ${childTask.status}`,
        path: "payload.child_task_id",
      });
    }

    return errors;
  }

  /**
   * Find a finding in org state
   */
  private findFindingInState(findingId: string): boolean {
    if (!this.orgState) return false;

    for (const task of this.orgState.tasks.values()) {
      if (task.findings.some(f => f.id === findingId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Find evidence in org state
   */
  private findEvidenceInState(evidenceId: string): boolean {
    if (!this.orgState) return false;

    for (const task of this.orgState.tasks.values()) {
      if (task.evidence.some(e => e.id === evidenceId)) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Rule D3: No-Op Detection
   * 
   * In strict mode, detects actions that don't change observable state:
   * - ADVANCE_PHASE with same phase
   * - MERGE without new findings or evidence
   */
  private validateNoOpDetection(action: OrchestratorAction): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!this.orgState) return errors;

    const parentTask = this.orgState.tasks.get(action.parent_task_id);
    if (!parentTask) return errors;

    // Check ADVANCE_PHASE with same phase
    if (action.action === "ADVANCE_PHASE") {
      const { from_phase, to_phase } = action.payload;
      if (from_phase === to_phase) {
        errors.push({
          code: "NO_STATE_CHANGE",
          message: `ADVANCE_PHASE cannot transition ${from_phase} -> ${to_phase} (no change)`,
          path: "payload",
        });
      }
    }

    // Check MERGE without new findings or evidence
    if (action.action === "MERGE_SUBTASK_RESULT") {
      const { finding_refs, evidence_refs } = action.payload;
      const hasFindings = finding_refs && finding_refs.length > 0;
      const hasEvidence = evidence_refs && evidence_refs.length > 0;
      
      if (!hasFindings && !hasEvidence) {
        errors.push({
          code: "NO_STATE_CHANGE",
          message: "MERGE must add at least one finding or evidence reference",
          path: "payload",
        });
      }
    }

    return errors;
  }
}

// ============================================================
// Factory function
// ============================================================

export function createActionValidator(options?: { strictMode?: boolean }): ActionValidator {
  return new ActionValidator(options);
}
