/**
 * Citation Validator - Phase 2 (T2.2)
 * 
 * Validates that orchestrator merge actions cite existing child task outputs.
 * 
 * PRD Rule B2: Orchestrator may merge, but not fabricate.
 * - All `finding_refs` must exist in the child task
 * - All `evidence_refs` must exist in the child task
 * - Cannot cite findings from non-child tasks
 * 
 * This ensures the orchestrator only merges real child task results,
 * not fabricated findings or evidence.
 */

import { 
  ValidationError,
  OrchestratorAction,
  OrgState,
  TaskState,
  FindingState,
  EvidenceState,
} from "../types/referee.js";

// ============================================================
// Citation Validation Result
// ============================================================

export interface CitationValidationResult {
  /** Whether all citations are valid */
  valid: boolean;
  /** Invalid finding references */
  invalidFindings: FindingReference[];
  /** Invalid evidence references */
  invalidEvidence: EvidenceReference[];
  /** Findings cited from non-child tasks */
  nonChildFindings: FindingReference[];
  /** Evidence cited from non-child tasks */
  nonChildEvidence: EvidenceReference[];
  /** Validation errors */
  errors: ValidationError[];
}

export interface FindingReference {
  ref: string;       // e.g., "F-001"
  claimedSource: string;  // Task ID claiming to own this finding
  actualSource?: string; // Actual task ID (if exists)
  exists: boolean;
}

export interface EvidenceReference {
  ref: string;       // e.g., "E-001"
  claimedSource: string;  // Task ID claiming to own this evidence
  actualSource?: string; // Actual task ID (if exists)
  exists: boolean;
}

// ============================================================
// Citation Validator
// ============================================================

export class CitationValidator {
  /**
   * Validate citation references in a merge action
   */
  validateMergeCitation(
    action: OrchestratorAction,
    orgState: OrgState
  ): CitationValidationResult {
    // Only applies to MERGE_SUBTASK_RESULT
    if (action.action !== "MERGE_SUBTASK_RESULT") {
      return {
        valid: true,
        invalidFindings: [],
        invalidEvidence: [],
        nonChildFindings: [],
        nonChildEvidence: [],
        errors: [],
      };
    }
    
    const errors: ValidationError[] = [];
    const invalidFindings: FindingReference[] = [];
    const invalidEvidence: EvidenceReference[] = [];
    const nonChildFindings: FindingReference[] = [];
    const nonChildEvidence: EvidenceReference[] = [];
    
    const childTaskId = action.payload.child_task_id;
    const parentTaskId = action.parent_task_id;
    
    // Get child and parent tasks
    const childTask = orgState.tasks.get(childTaskId);
    const parentTask = orgState.tasks.get(parentTaskId);
    
    if (!childTask) {
      errors.push({
        code: "TASK_NOT_FOUND",
        message: `Child task "${childTaskId}" not found for citation validation`,
        path: "payload.child_task_id",
      });
      return {
        valid: false,
        invalidFindings: [],
        invalidEvidence: [],
        nonChildFindings: [],
        nonChildEvidence: [],
        errors,
      };
    }
    
    // Validate finding references
    const findingRefs = action.payload.finding_refs || [];
    for (const ref of findingRefs) {
      const findingRef = this.validateFindingReference(
        ref,
        childTaskId,
        parentTaskId,
        childTask,
        parentTask,
        orgState
      );
      
      if (!findingRef.exists) {
        invalidFindings.push(findingRef);
        errors.push({
          code: "MISSING_EVIDENCE_REF",
          message: `Finding "${ref}" does not exist in child task "${childTaskId}"`,
          path: "payload.finding_refs",
        });
      } else if (findingRef.actualSource && findingRef.actualSource !== childTaskId) {
        nonChildFindings.push(findingRef);
        errors.push({
          code: "MISSING_EVIDENCE_REF",
          message: `Finding "${ref}" belongs to task "${findingRef.actualSource}", not child task "${childTaskId}"`,
          path: "payload.finding_refs",
        });
      }
    }
    
    // Validate evidence references
    const evidenceRefs = action.payload.evidence_refs || [];
    for (const ref of evidenceRefs) {
      const evidenceRef = this.validateEvidenceReference(
        ref,
        childTaskId,
        parentTaskId,
        childTask,
        parentTask,
        orgState
      );
      
      if (!evidenceRef.exists) {
        invalidEvidence.push(evidenceRef);
        errors.push({
          code: "MISSING_EVIDENCE_REF",
          message: `Evidence "${ref}" does not exist in child task "${childTaskId}"`,
          path: "payload.evidence_refs",
        });
      } else if (evidenceRef.actualSource && evidenceRef.actualSource !== childTaskId) {
        nonChildEvidence.push(evidenceRef);
        errors.push({
          code: "MISSING_EVIDENCE_REF",
          message: `Evidence "${ref}" belongs to task "${evidenceRef.actualSource}", not child task "${childTaskId}"`,
          path: "payload.evidence_refs",
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      invalidFindings,
      invalidEvidence,
      nonChildFindings,
      nonChildEvidence,
      errors,
    };
  }
  
  /**
   * Validate a finding reference
   */
  private validateFindingReference(
    ref: string,
    childTaskId: string,
    parentTaskId: string,
    childTask: TaskState,
    parentTask: TaskState | undefined,
    orgState: OrgState
  ): FindingReference {
    // Check if finding exists in child task
    const findingInChild = childTask.findings.find(f => f.id === ref);
    if (findingInChild) {
      return {
        ref,
        claimedSource: childTaskId,
        actualSource: childTaskId,
        exists: true,
      };
    }
    
    // Check if finding exists in parent task
    const findingInParent = parentTask?.findings.find(f => f.id === ref);
    if (findingInParent) {
      return {
        ref,
        claimedSource: childTaskId,
        actualSource: parentTaskId,
        exists: true,
      };
    }
    
    // Search all tasks for the finding
    for (const [taskId, task] of orgState.tasks) {
      if (task.findings.some(f => f.id === ref)) {
        return {
          ref,
          claimedSource: childTaskId,
          actualSource: taskId,
          exists: true,
        };
      }
    }
    
    // Finding doesn't exist anywhere
    return {
      ref,
      claimedSource: childTaskId,
      exists: false,
    };
  }
  
  /**
   * Validate an evidence reference
   */
  private validateEvidenceReference(
    ref: string,
    childTaskId: string,
    parentTaskId: string,
    childTask: TaskState,
    parentTask: TaskState | undefined,
    orgState: OrgState
  ): EvidenceReference {
    // Check if evidence exists in child task
    const evidenceInChild = childTask.evidence.find(e => e.id === ref);
    if (evidenceInChild) {
      return {
        ref,
        claimedSource: childTaskId,
        actualSource: childTaskId,
        exists: true,
      };
    }
    
    // Check if evidence exists in parent task
    const evidenceInParent = parentTask?.evidence.find(e => e.id === ref);
    if (evidenceInParent) {
      return {
        ref,
        claimedSource: childTaskId,
        actualSource: parentTaskId,
        exists: true,
      };
    }
    
    // Search all tasks for the evidence
    for (const [taskId, task] of orgState.tasks) {
      if (task.evidence.some(e => e.id === ref)) {
        return {
          ref,
          claimedSource: childTaskId,
          actualSource: taskId,
          exists: true,
        };
      }
    }
    
    // Evidence doesn't exist anywhere
    return {
      ref,
      claimedSource: childTaskId,
      exists: false,
    };
  }
  
  /**
   * Check if a finding belongs to a specific task (directly or transitively)
   */
  isFindingFromTask(findingId: string, taskId: string, orgState: OrgState): boolean {
    const task = orgState.tasks.get(taskId);
    if (!task) return false;
    
    // Direct finding in task
    if (task.findings.some(f => f.id === findingId)) {
      return true;
    }
    
    // Check child tasks (findings transitively owned by parent through merge)
    for (const [childId, childTask] of orgState.tasks) {
      if (childTask.parent === taskId && childTask.findings.some(f => f.id === findingId)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if an evidence belongs to a specific task
   */
  isEvidenceFromTask(evidenceId: string, taskId: string, orgState: OrgState): boolean {
    const task = orgState.tasks.get(taskId);
    if (!task) return false;
    
    // Direct evidence in task
    if (task.evidence.some(e => e.id === evidenceId)) {
      return true;
    }
    
    // Check child tasks
    for (const [childId, childTask] of orgState.tasks) {
      if (childTask.parent === taskId && childTask.evidence.some(e => e.id === evidenceId)) {
        return true;
      }
    }
    
    return false;
  }
}

// ============================================================
// Factory Function
// ============================================================

export function createCitationValidator(): CitationValidator {
  return new CitationValidator();
}
