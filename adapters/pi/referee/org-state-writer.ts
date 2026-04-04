/**
 * Org State Writer - Phase 3 (T3.4)
 * 
 * Writes state changes back to workflow.org files.
 * Adds referee metadata fields as specified in PRD Section 13.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { OrgState, TaskState, OrchestratorAction } from '../types/referee.js';
import { loadPhaseGatePolicy, isTerminalPhase } from './phase-gate-policy.js';

// ============================================================
// Referee Metadata Fields (PRD Section 13.2)
// ============================================================

export interface RefereeMetadata {
  /** Current gate status */
  gateStatus?: 'pass' | 'fail' | 'pending';
  /** Last accepted action */
  lastAction?: string;
  /** Last action result */
  lastActionResult?: 'accepted' | 'rejected';
  /** Last rejection reason */
  refereeError?: string;
  /** Current loop turn count */
  loopTurn?: number;
  /** Whether user approval is needed */
  awaitingUserApproval?: boolean;
}

export interface ActionLogEntry {
  timestamp: string;
  action: string;
  result: 'accepted' | 'rejected';
  details?: string;
}

// ============================================================
// Org State Writer
// ============================================================

export interface WriteResult {
  success: boolean;
  newState?: OrgState;
  errors: string[];
  warnings: string[];
}

/**
 * Update org state with an accepted action
 */
export function writeAcceptedAction(
  workflowPath: string,
  action: OrchestratorAction,
  metadata?: RefereeMetadata
): WriteResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Read current content
    if (!existsSync(workflowPath)) {
      return {
        success: false,
        errors: [`Workflow file not found: ${workflowPath}`],
        warnings: [],
      };
    }
    
    let content = readFileSync(workflowPath, 'utf-8');
    
    // Apply action to content
    content = applyAction(content, action);
    
    // Add action log entry
    content = appendActionLog(content, {
      timestamp: new Date().toISOString(),
      action: action.action,
      result: 'accepted',
      details: `${action.parent_task_id}: ${action.reason}`,
    });
    
    // Write updated content
    writeFileSync(workflowPath, content, 'utf-8');
    
    // Return updated state
    const { readOrgState } = require('./org-state-reader.js');
    const result = readOrgState(workflowPath);
    
    return {
      success: true,
      newState: result.orgState,
      errors,
      warnings,
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Error writing to workflow: ${error}`],
      warnings: [],
    };
  }
}

/**
 * Write rejection to org state
 */
export function writeRejection(
  workflowPath: string,
  parentTaskId: string,
  errorMessage: string,
  loopTurn?: number
): WriteResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    if (!existsSync(workflowPath)) {
      return {
        success: false,
        errors: [`Workflow file not found: ${workflowPath}`],
        warnings: [],
      };
    }
    
    let content = readFileSync(workflowPath, 'utf-8');
    
    // Add action log entry for rejection
    content = appendActionLog(content, {
      timestamp: new Date().toISOString(),
      action: 'RETRY_INVALID_ACTION',
      result: 'rejected',
      details: `${parentTaskId}: ${errorMessage}`,
    });
    
    // Update referee metadata for the task
    content = updateRefereeMetadata(content, parentTaskId, {
      lastActionResult: 'rejected',
      refereeError: errorMessage,
      loopTurn,
    });
    
    // Write updated content
    writeFileSync(workflowPath, content, 'utf-8');
    
    return {
      success: true,
      errors,
      warnings,
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Error writing rejection: ${error}`],
      warnings: [],
    };
  }
}

/**
 * Update gate status for a task
 */
export function updateGateStatus(
  workflowPath: string,
  taskId: string,
  gateStatus: 'pass' | 'fail' | 'pending'
): WriteResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    if (!existsSync(workflowPath)) {
      return {
        success: false,
        errors: [`Workflow file not found: ${workflowPath}`],
        warnings: [],
      };
    }
    
    let content = readFileSync(workflowPath, 'utf-8');
    
    // Update or add GATE_STATUS property
    content = updateProperty(content, taskId, 'GATE_STATUS', gateStatus.toUpperCase());
    
    // Write updated content
    writeFileSync(workflowPath, content, 'utf-8');
    
    return {
      success: true,
      errors,
      warnings,
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Error updating gate status: ${error}`],
      warnings: [],
    };
  }
}

// ============================================================
// Action Application
// ============================================================

/**
 * Apply an action to org content
 */
function applyAction(content: string, action: OrchestratorAction): string {
  switch (action.action) {
    case 'SPAWN_SUBTASK':
      return applySpawnAction(content, action);
    case 'MERGE_SUBTASK_RESULT':
      return applyMergeAction(content, action);
    case 'ADVANCE_PHASE':
      return applyAdvanceAction(content, action);
    case 'RAISE_BLOCKER':
      return applyBlockerAction(content, action);
    case 'REQUEST_USER_DECISION':
      return applyDecisionAction(content, action);
    default:
      return content;
  }
}

/**
 * Apply SPAWN_SUBTASK action
 */
function applySpawnAction(content: string, action: OrchestratorAction): string {
  const { child_task_id, title, role, phase } = action.payload;
  
  const newTask = `
** TODO [ ] ${child_task_id} :${phase}:
:PROPERTIES:
:PARENT: ${action.parent_task_id}
:ROLE: ${role}
:PHASE: ${phase}
:GATE_STATUS: PENDING
:END:

- ${action.reason}

`;
  
  // Find the parent task and append the new child
  const parentPattern = new RegExp(`(\\*+\\s+\\[.\\]\\s+\\[${escapeRegex(action.parent_task_id)}\\].*)`, 'i');
  
  if (parentPattern.test(content)) {
    return content.replace(parentPattern, `$1${newTask}`);
  }
  
  // If parent not found, append to end
  return content + newTask;
}

/**
 * Apply MERGE_SUBTASK_RESULT action
 */
function applyMergeAction(content: string, action: OrchestratorAction): string {
  const { child_task_id, summary, finding_refs, evidence_refs } = action.payload;
  
  // Mark child task as DONE
  const childPattern = new RegExp(`^(\\*+\\s+)\\[ \\]\\s+\\[${escapeRegex(child_task_id)}\\]`, 'im');
  content = content.replace(childPattern, '$1[X]');
  
  // Update parent with merged findings
  const mergeNote = `
- Merged from ${child_task_id}: ${summary}
${finding_refs?.map(f => `  - [${f}]`).join('\n') || ''}
${evidence_refs?.map(e => `  - [${e}]`).join('\n') || ''}
`;
  
  // Find parent and append merge note
  const parentPattern = new RegExp(`^(\\*+\\s+\\[.\\]\\s+\\[${escapeRegex(action.parent_task_id)}\\].*)`, 'im');
  
  if (parentPattern.test(content)) {
    return content.replace(parentPattern, `$1${mergeNote}`);
  }
  
  return content;
}

/**
 * Apply ADVANCE_PHASE action
 */
function applyAdvanceAction(content: string, action: OrchestratorAction): string {
  const { from_phase, to_phase } = action.payload;
  
  // Update PHASE property for the task
  const phasePattern = new RegExp(`(\\*+\\s+\\[.\\]\\s+\\[${escapeRegex(action.parent_task_id)}\\].*?:PROPERTIES:.*?:PHASE:)\\s*\\w+`, 'is');
  
  if (phasePattern.test(content)) {
    return content.replace(phasePattern, `$1 ${to_phase}`);
  }
  
  // If no properties block, add one
  const taskPattern = new RegExp(`^(\\*+\\s+\\[.\\]\\s+\\[${escapeRegex(action.parent_task_id)}\\].*)`, 'im');
  
  if (taskPattern.test(content)) {
    return content.replace(taskPattern, `$1\n:PROPERTIES:\n:PHASE: ${to_phase}\n:END:`);
  }
  
  return content;
}

/**
 * Apply RAISE_BLOCKER action
 */
function applyBlockerAction(content: string, action: OrchestratorAction): string {
  const { blocker_type, details, blocked_tasks } = action.payload;
  
  // Mark task as blocked
  const taskPattern = new RegExp(`^(\\*+\\s+)\\[.\\]\\s+\\[${escapeRegex(action.parent_task_id)}\\]`, 'im');
  content = content.replace(taskPattern, '$1[-]');
  
  // Add blocker details
  const blockerNote = `
- BLOCKER (${blocker_type}): ${details}
  Blocked tasks: ${blocked_tasks?.join(', ') || 'N/A'}
`;
  
  return content.replace(taskPattern, `$1${blockerNote}`);
}

/**
 * Apply REQUEST_USER_DECISION action
 */
function applyDecisionAction(content: string, action: OrchestratorAction): string {
  const { question, options } = action.payload;
  
  // Mark as awaiting user
  const taskPattern = new RegExp(`^(\\*+\\s+)\\[.\\]\\s+\\[${escapeRegex(action.parent_task_id)}\\]`, 'im');
  
  const decisionNote = `
- AWAITING USER DECISION:
  ${question}
${options?.map(o => `  - ${o.id}: ${o.description}`).join('\n') || ''}
`;
  
  return content.replace(taskPattern, `$1${decisionNote}`);
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Append action log entry
 */
function appendActionLog(content: string, entry: ActionLogEntry): string {
  const logEntry = `\n- [${entry.timestamp.split('T')[0]}] referee ${entry.result} ${entry.action} for ${entry.details}`;
  
  // Find or create log section
  const logSectionPattern = /\*+ Action Log\n/;
  
  if (logSectionPattern.test(content)) {
    return content.replace(logSectionPattern, `* Action Log\n${logEntry}\n`);
  }
  
  // Append log at end
  return content + `\n* Action Log\n${logEntry}\n`;
}

/**
 * Update referee metadata for a task
 */
function updateRefereeMetadata(
  content: string,
  taskId: string,
  metadata: Partial<RefereeMetadata>
): string {
  // Find the task's properties section
  const taskPattern = new RegExp(
    `(\\*+\\s+\\[.\\]\\s+\\[${escapeRegex(taskId)}\\].*?:PROPERTIES:.*?)(:END:)`,
    'is'
  );
  
  if (!taskPattern.test(content)) {
    return content;
  }
  
  let metadataLines = '';
  if (metadata.gateStatus) {
    metadataLines += `:GATE_STATUS: ${metadata.gateStatus.toUpperCase()}\n`;
  }
  if (metadata.lastAction) {
    metadataLines += `:LAST_ACTION: ${metadata.lastAction}\n`;
  }
  if (metadata.lastActionResult) {
    metadataLines += `:LAST_ACTION_RESULT: ${metadata.lastActionResult.toUpperCase()}\n`;
  }
  if (metadata.refereeError) {
    metadataLines += `:REFEREE_ERROR: ${metadata.refereeError}\n`;
  }
  if (metadata.loopTurn !== undefined) {
    metadataLines += `:LOOP_TURN: ${metadata.loopTurn}\n`;
  }
  if (metadata.awaitingUserApproval) {
    metadataLines += `:AWAITING_USER_APPROVAL: t\n`;
  }
  
  return content.replace(taskPattern, `$1${metadataLines}$2`);
}

/**
 * Update or add a property
 */
function updateProperty(
  content: string,
  taskId: string,
  property: string,
  value: string
): string {
  // Check if property exists
  const propPattern = new RegExp(
    `(\\*+\\s+\\[.\\]\\s+\\[${escapeRegex(taskId)}\\].*?:PROPERTIES:.*?):${property}:\\s*[^\\n]+`,
    'is'
  );
  
  if (propPattern.test(content)) {
    // Update existing property
    return content.replace(propPattern, `$1:${property}: ${value}`);
  }
  
  // Add new property before :END:
  const endPattern = new RegExp(
    `(\\*+\\s+\\[.\\]\\s+\\[${escapeRegex(taskId)}\\].*?:PROPERTIES:.*?)(:END:)`,
    'is'
  );
  
  if (endPattern.test(content)) {
    return content.replace(endPattern, `$1:${property}: ${value}\n$2`);
  }
  
  return content;
}

/**
 * Create initial workflow.org structure
 */
export function createWorkflowOrg(
  workflowPath: string,
  rootTaskId: string,
  rootTaskTitle: string,
  phase: string = 'discovery'
): WriteResult {
  const content = `* TODO [ ] ${rootTaskId} :${phase}:
:PROPERTIES:
:PHASE: ${phase}
:GATE_STATUS: PENDING
:LOOP_TURN: 0
:END:

** Action Log

`;
  
  try {
    writeFileSync(workflowPath, content, 'utf-8');
    return {
      success: true,
      errors: [],
      warnings: [],
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Error creating workflow: ${error}`],
      warnings: [],
    };
  }
}
