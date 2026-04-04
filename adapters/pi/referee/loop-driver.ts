/**
 * Loop Driver - Phase 4 Implementation
 * 
 * Manages the outer orchestration loop:
 * - Automatically reruns until terminal state
 * - Handles child completion events
 * - Manages blocked/waiting/decision pause states
 * 
 * @module loop-driver
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  OrchestratorAction,
  OrgState,
  ValidationResult,
  RetryEnvelope,
  TaskState,
  Phase,
} from '../types/referee.js';

import {
  parseOrgContent,
  getChildTasks,
  isTerminalState,
  countFindings,
  countEvidence,
  getCompletedChildTasks,
  getCompletedChildTasksByRole,
  calculateAverageFindingRating,
} from './org-state-reader.js';

import {
  loadPhaseGatePolicy,
  isTerminalPhase,
  getNextPhase,
  getPhaseRequirements,
} from './phase-gate-policy.js';

import {
  writeAcceptedAction,
  writeRejection,
  updateGateStatus,
  createWorkflowOrg,
  RefereeMetadata,
  WriteResult,
} from './org-state-writer.js';

// ============================================================
// Types
// ============================================================

export type WaitReason = 
  | 'child-completion'
  | 'user-decision'
  | 'external-input'
  | 'blocked'
  | 'loop-active';

export interface LoopTurn {
  turn: number;
  action: OrchestratorAction | null;
  actionResult: 'accepted' | 'rejected' | 'pending';
  validationResult?: ValidationResult;
  waitReason?: WaitReason;
  timestamp: string;
}

export interface LoopState {
  workflowPath: string;
  parentTaskId: string;
  currentPhase: Phase;
  turn: number;
  status: 'active' | 'waiting' | 'blocked' | 'completed' | 'failed';
  waitReason?: WaitReason;
  waitData?: any;
  loopHistory: LoopTurn[];
  retryCount: number;
  metadata: RefereeMetadata;
}

export interface LoopDecision {
  type: 'continue' | 'wait' | 'advance-phase' | 'complete' | 'fail';
  action?: OrchestratorAction;
  waitReason?: WaitReason;
  waitData?: any;
  message?: string;
}

export interface OrchestratorInput {
  taskId: string;
  taskTitle: string;
  currentPhase: Phase;
  status: TaskState['status'];
  parentContext?: {
    findings: string[];
    evidence: string[];
    completedChildren: string[];
  };
  childTasks: {
    id: string;
    title: string;
    status: string;
    role?: string;
    phase: Phase;
    findings: number;
    evidence: number;
  }[];
  pendingActions: LoopTurn[];
  suggestions?: string[];
}

export interface ChildCompletionEvent {
  childTaskId: string;
  status: 'completed' | 'failed' | 'blocked';
  findings?: any[];
  evidence?: any[];
  summary?: string;
  timestamp: string;
}

export interface LoopDriverConfig {
  maxLoopTurns: number;
  maxRetriesPerTurn: number;
  autoAdvanceThreshold: number;
  enableChildCompletionHook: boolean;
  enableWaitStrategies: boolean;
}

// ============================================================
// Default Configuration
// ============================================================

export const DEFAULT_LOOP_DRIVER_CONFIG: LoopDriverConfig = {
  maxLoopTurns: 50,
  maxRetriesPerTurn: 5,
  autoAdvanceThreshold: 3,
  enableChildCompletionHook: true,
  enableWaitStrategies: true,
};

// ============================================================
// Workflow State Tracker
// ============================================================

export class WorkflowStateTracker {
  private state: LoopState | null = null;

  /**
   * Initialize loop state for a workflow
   */
  initialize(workflowPath: string, parentTaskId: string, phase: Phase): LoopState {
    const now = new Date().toISOString();
    this.state = {
      workflowPath,
      parentTaskId,
      currentPhase: phase,
      turn: 0,
      status: 'active',
      loopHistory: [],
      retryCount: 0,
      metadata: {
        gateStatus: 'PENDING',
        lastAction: 'NONE',
        lastActionResult: 'NONE',
        loopTurn: 0,
        refereeError: undefined,
        lastError: undefined,
      },
    };
    return this.state;
  }

  /**
   * Get current state
   */
  getState(): LoopState | null {
    return this.state;
  }

  /**
   * Load state from org file
   */
  loadFromOrg(workflowPath: string, parentTaskId: string): LoopState | null {
    if (!existsSync(workflowPath)) {
      return null;
    }

    const content = readFileSync(workflowPath, 'utf-8');
    const orgState = parseOrgContent(content, workflowPath);
    
    const task = orgState.tasks.get(parentTaskId);
    if (!task) {
      return null;
    }

    // Reconstruct state from org
    this.state = {
      workflowPath,
      parentTaskId,
      currentPhase: task.phase,
      turn: 0,
      status: isTerminalState(task) ? 'completed' : 'active',
      loopHistory: [],
      retryCount: 0,
      metadata: {
        gateStatus: (task.metadata?.['GATE_STATUS'] as any) || 'PENDING',
        lastAction: (task.metadata?.['LAST_ACTION'] as any) || 'NONE',
        lastActionResult: (task.metadata?.['LAST_ACTION_RESULT'] as any) || 'NONE',
        loopTurn: parseInt((task.metadata?.['LOOP_TURN'] as any) || '0'),
        refereeError: task.metadata?.['REFEREE_ERROR'] as any,
        lastError: undefined,
      },
    };

    return this.state;
  }

  /**
   * Record a loop turn
   */
  recordTurn(
    action: OrchestratorAction | null,
    result: 'accepted' | 'rejected' | 'pending',
    validationResult?: ValidationResult,
    waitReason?: WaitReason
  ): void {
    if (!this.state) return;

    this.state.turn++;
    this.state.loopHistory.push({
      turn: this.state.turn,
      action,
      actionResult: result,
      validationResult,
      waitReason,
      timestamp: new Date().toISOString(),
    });

    this.state.metadata.loopTurn = this.state.turn;
  }

  /**
   * Set wait state
   */
  setWait(reason: WaitReason, data?: any): void {
    if (!this.state) return;
    this.state.status = 'waiting';
    this.state.waitReason = reason;
    this.state.waitData = data;
  }

  /**
   * Clear wait state
   */
  clearWait(): void {
    if (!this.state) return;
    this.state.status = 'active';
    this.state.waitReason = undefined;
    this.state.waitData = undefined;
  }

  /**
   * Set blocked state
   */
  setBlocked(reason: string, data?: any): void {
    if (!this.state) return;
    this.state.status = 'blocked';
    this.state.waitReason = 'blocked';
    this.state.waitData = { reason, ...data };
  }

  /**
   * Mark as completed
   */
  complete(): void {
    if (!this.state) return;
    this.state.status = 'completed';
    this.state.metadata.gateStatus = 'PASSED';
  }

  /**
   * Mark as failed
   */
  fail(error: string): void {
    if (!this.state) return;
    this.state.status = 'failed';
    this.state.metadata.refereeError = error;
    this.state.metadata.lastError = error;
  }

  /**
   * Update last action
   */
  updateLastAction(action: string, result: 'accepted' | 'rejected'): void {
    if (!this.state) return;
    this.state.metadata.lastAction = action;
    this.state.metadata.lastActionResult = result;
  }

  /**
   * Increment retry count
   */
  incrementRetry(): number {
    if (!this.state) return 0;
    this.state.retryCount++;
    return this.state.retryCount;
  }

  /**
   * Reset retry count
   */
  resetRetry(): void {
    if (!this.state) return;
    this.state.retryCount = 0;
  }

  /**
   * Check if max turns exceeded
   */
  isMaxTurnsExceeded(config: LoopDriverConfig): boolean {
    return this.state ? this.state.turn >= config.maxLoopTurns : false;
  }

  /**
   * Check if max retries exceeded
   */
  isMaxRetriesExceeded(config: LoopDriverConfig): boolean {
    return this.state ? this.state.retryCount >= config.maxRetriesPerTurn : false;
  }
}

// ============================================================
// Next Step Decider
// ============================================================

export class NextStepDecider {
  private config: LoopDriverConfig;
  private policy = loadPhaseGatePolicy();

  constructor(config: Partial<LoopDriverConfig> = {}) {
    this.config = { ...DEFAULT_LOOP_DRIVER_CONFIG, ...config };
  }

  /**
   * Build orchestrator input from current state
   */
  buildOrchestratorInput(orgState: OrgState, parentTaskId: string): OrchestratorInput {
    const parentTask = orgState.tasks.get(parentTaskId);
    if (!parentTask) {
      throw new Error(`Parent task not found: ${parentTaskId}`);
    }

    const childTasks = getChildTasks(parentTaskId, orgState);
    const completedChildren = getCompletedChildTasks(parentTaskId, orgState);

    const completedByRole = getCompletedChildTasksByRole(parentTaskId, orgState);
    const roleSummary = Array.from(completedByRole.entries()).map(([role, tasks]) => ({
      role,
      count: tasks.length,
      tasks: tasks.map(t => t.id),
    }));

    return {
      taskId: parentTaskId,
      taskTitle: parentTask.title || parentTaskId,
      currentPhase: parentTask.phase,
      status: parentTask.status,
      parentContext: {
        findings: parentTask.findings.map(f => `[F-${f.id}] ${f.content}`),
        evidence: parentTask.evidence.map(e => `[E-${e.id}] ${e.type}: ${e.source}`),
        completedChildren: completedChildren.map(t => t.id),
      },
      childTasks: childTasks.map(task => ({
        id: task.id,
        title: task.title || task.id,
        status: task.status,
        role: task.owner,
        phase: task.phase,
        findings: task.findings.length,
        evidence: task.evidence.length,
      })),
      pendingActions: [],
      suggestions: this.generateSuggestions(parentTask, childTasks, completedChildren),
    };
  }

  /**
   * Decide what to do next based on current state
   */
  decide(
    orgState: OrgState,
    parentTaskId: string,
    lastAction: OrchestratorAction | null
  ): LoopDecision {
    const parentTask = orgState.tasks.get(parentTaskId);
    if (!parentTask) {
      return { type: 'fail', message: `Parent task not found: ${parentTaskId}` };
    }

    // Check for terminal state
    if (isTerminalState(parentTask)) {
      return { type: 'complete', message: 'Parent task is in terminal state' };
    }

    // Check if terminal phase
    if (isTerminalPhase(parentTask.phase)) {
      return { type: 'complete', message: 'Parent task is in terminal phase' };
    }

    // Check for blocked child tasks
    const childTasks = getChildTasks(parentTaskId, orgState);
    const blockedChildren = childTasks.filter(t => t.status === 'BLOCKED');
    if (blockedChildren.length > 0) {
      return {
        type: 'wait',
        waitReason: 'blocked',
        waitData: { blockedTasks: blockedChildren.map(t => t.id) },
        message: `Waiting for blocked tasks: ${blockedChildren.map(t => t.id).join(', ')}`,
      };
    }

    // Check for incomplete child tasks
    const incompleteChildren = childTasks.filter(t => t.status !== 'DONE' && t.status !== 'CANCELLED');
    if (incompleteChildren.length > 0) {
      return {
        type: 'continue',
        message: `${incompleteChildren.length} child task(s) still in progress`,
      };
    }

    // Check phase gate requirements
    const gateResult = this.checkPhaseGate(parentTask, orgState);
    if (!gateResult.satisfied) {
      return {
        type: 'continue',
        message: `Phase gate not satisfied: ${gateResult.reasons.join(', ')}`,
      };
    }

    // Phase gate satisfied - orchestrator should ADVANCE_PHASE
    return {
      type: 'advance-phase',
      message: `Phase gate satisfied. Ready to advance from ${parentTask.phase} to ${getNextPhase(parentTask.phase)}`,
    };
  }

  /**
   * Check if phase gate is satisfied
   */
  private checkPhaseGate(task: TaskState, orgState: OrgState): {
    satisfied: boolean;
    reasons: string[];
  } {
    const requirements = getPhaseRequirements(task.phase);
    if (!requirements) {
      return { satisfied: true, reasons: [] };
    }

    const reasons: string[] = [];

    // Check completed child roles
    if (requirements.completed_child_roles && requirements.completed_child_roles.length > 0) {
      const completedByRole = getCompletedChildTasksByRole(task.id, orgState);
      for (const requiredRole of requirements.completed_child_roles) {
        if (!completedByRole.has(requiredRole) || completedByRole.get(requiredRole)!.length === 0) {
          reasons.push(`Missing completed role: ${requiredRole}`);
        }
      }
    }

    // Check min findings
    if (requirements.min_findings) {
      const findings = countFindings(orgState, task.id);
      if (findings < requirements.min_findings) {
        reasons.push(`Need ${requirements.min_findings} findings, have ${findings}`);
      }
    }

    // Check min evidence
    if (requirements.min_evidence) {
      const evidence = countEvidence(orgState, task.id);
      if (evidence < requirements.min_evidence) {
        reasons.push(`Need ${requirements.min_evidence} evidence, have ${evidence}`);
      }
    }

    // Check min child done
    if (requirements.min_child_done) {
      const completedChildren = getCompletedChildTasks(task.id, orgState);
      if (completedChildren.length < requirements.min_child_done) {
        reasons.push(`Need ${requirements.min_child_done} completed children, have ${completedChildren.length}`);
      }
    }

    return {
      satisfied: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Generate suggestions for the orchestrator
   */
  private generateSuggestions(
    parentTask: TaskState,
    childTasks: TaskState[],
    completedChildren: TaskState[]
  ): string[] {
    const suggestions: string[] = [];

    // Check if any children need to be spawned
    if (childTasks.length === 0) {
      suggestions.push('Consider spawning a child task for the next step of work');
    }

    // Check phase gate satisfaction
    const requirements = getPhaseRequirements(parentTask.phase);
    if (requirements) {
      if (requirements.completed_child_roles && requirements.completed_child_roles.length > 0) {
        const completedByRole = getCompletedChildTasksByRole(parentTask.id, parentTask.metadata?.['workflowPath'] ? {
          workflowPath: '',
          tasks: new Map(),
        } : { workflowPath: '', tasks: new Map() });
        
        for (const role of requirements.completed_child_roles) {
          suggestions.push(`Phase gate may require ${role} to complete a child task`);
        }
      }
    }

    // Check for completed children ready to merge
    if (completedChildren.length > 0) {
      suggestions.push(`Found ${completedChildren.length} completed child task(s) ready to merge`);
    }

    return suggestions;
  }
}

// ============================================================
// Child Completion Handler
// ============================================================

export class ChildCompletionHandler {
  private config: LoopDriverConfig;

  constructor(config: Partial<LoopDriverConfig> = {}) {
    this.config = { ...DEFAULT_LOOP_DRIVER_CONFIG, ...config };
  }

  /**
   * Handle child task completion event
   */
  handleCompletion(event: ChildCompletionEvent, orgState: OrgState): {
    shouldRestartLoop: boolean;
    action?: OrchestratorAction;
    message: string;
  } {
    const childTask = orgState.tasks.get(event.childTaskId);
    if (!childTask) {
      return {
        shouldRestartLoop: false,
        message: `Child task not found: ${event.childTaskId}`,
      };
    }

    // Update task state from event
    if (event.status === 'completed') {
      // Check if parent needs to merge
      const parentTask = childTask.parent ? orgState.tasks.get(childTask.parent) : null;
      if (parentTask && !isTerminalState(parentTask)) {
        return {
          shouldRestartLoop: true,
          action: this.createMergeAction(childTask, parentTask, event),
          message: `Child ${event.childTaskId} completed. Recommended: MERGE_SUBTASK_RESULT`,
        };
      }
    }

    return {
      shouldRestartLoop: event.status === 'completed',
      message: `Child ${event.childTaskId} ${event.status}`,
    };
  }

  /**
   * Create a merge action based on child completion
   */
  private createMergeAction(
    childTask: TaskState,
    parentTask: TaskState,
    event: ChildCompletionEvent
  ): OrchestratorAction {
    return {
      action: 'MERGE_SUBTASK_RESULT',
      parent_task_id: parentTask.id,
      reason: `Child task ${childTask.id} completed`,
      payload: {
        child_task_id: childTask.id,
        summary: event.summary || `Completed ${childTask.title || childTask.id}`,
        finding_refs: childTask.findings.map(f => f.id),
        evidence_refs: childTask.evidence.map(e => e.id),
        parent_updates: {
          findings_append: [],
          next_actions_append: [],
        },
      },
      expected_effect: 'parent task gains child findings/evidence',
    };
  }

  /**
   * Check if any child tasks completed since last check
   */
  findCompletedChildren(
    currentState: OrgState,
    previousState: OrgState | null
  ): ChildCompletionEvent[] {
    if (!previousState) {
      return [];
    }

    const events: ChildCompletionEvent[] = [];
    const now = new Date().toISOString();

    for (const [taskId, task] of currentState.tasks) {
      const previousTask = previousState.tasks.get(taskId);
      
      if (previousTask && previousTask.status !== 'DONE' && task.status === 'DONE') {
        events.push({
          childTaskId: taskId,
          status: 'completed',
          findings: task.findings,
          evidence: task.evidence,
          summary: `Completed ${task.title || taskId}`,
          timestamp: now,
        });
      }

      if (previousTask && previousTask.status !== 'BLOCKED' && task.status === 'BLOCKED') {
        events.push({
          childTaskId: taskId,
          status: 'blocked',
          timestamp: now,
        });
      }
    }

    return events;
  }
}

// ============================================================
// Main Loop Driver
// ============================================================

export class LoopDriver {
  private tracker: WorkflowStateTracker;
  private decider: NextStepDecider;
  private childHandler: ChildCompletionHandler;
  private config: LoopDriverConfig;
  private previousOrgState: OrgState | null = null;

  constructor(config: Partial<LoopDriverConfig> = {}) {
    this.config = { ...DEFAULT_LOOP_DRIVER_CONFIG, ...config };
    this.tracker = new WorkflowStateTracker();
    this.decider = new NextStepDecider(this.config);
    this.childHandler = new ChildCompletionHandler(this.config);
  }

  /**
   * Initialize the loop driver for a workflow
   */
  initialize(workflowPath: string, parentTaskId: string, phase: Phase): LoopState {
    return this.tracker.initialize(workflowPath, parentTaskId, phase);
  }

  /**
   * Load loop state from existing org file
   */
  loadState(workflowPath: string, parentTaskId: string): LoopState | null {
    return this.tracker.loadFromOrg(workflowPath, parentTaskId);
  }

  /**
   * Get current orchestrator input
   */
  getOrchestratorInput(workflowPath: string, parentTaskId: string): OrchestratorInput {
    const content = readFileSync(workflowPath, 'utf-8');
    const orgState = parseOrgContent(content, workflowPath);
    return this.decider.buildOrchestratorInput(orgState, parentTaskId);
  }

  /**
   * Process an orchestrator action
   */
  processAction(
    action: OrchestratorAction,
    validationResult: ValidationResult,
    orgState: OrgState
  ): {
    success: boolean;
    shouldContinue: boolean;
    waitReason?: WaitReason;
    message: string;
  } {
    const state = this.tracker.getState();
    if (!state) {
      return { success: false, shouldContinue: false, message: 'Loop not initialized' };
    }

    // Record the turn
    this.tracker.recordTurn(action, 'accepted', validationResult);
    this.tracker.updateLastAction(action.action, 'accepted');

    // Check for wait conditions based on action type
    switch (action.action) {
      case 'SPAWN_SUBTASK':
        // Continue loop to wait for child completion
        this.tracker.clearWait();
        return {
          success: true,
          shouldContinue: true,
          message: 'Child task spawned. Loop continues.',
        };

      case 'MERGE_SUBTASK_RESULT':
        // Continue loop - child findings merged
        this.tracker.clearWait();
        return {
          success: true,
          shouldContinue: true,
          message: 'Child results merged. Loop continues.',
        };

      case 'ADVANCE_PHASE':
        // Check if new phase is terminal
        if (isTerminalPhase(action.payload.to_phase)) {
          this.tracker.complete();
          return {
            success: true,
            shouldContinue: false,
            message: `Advanced to terminal phase: ${action.payload.to_phase}`,
          };
        }
        this.tracker.clearWait();
        return {
          success: true,
          shouldContinue: true,
          message: `Advanced to phase: ${action.payload.to_phase}`,
        };

      case 'RAISE_BLOCKER':
        // Block until external resolution
        this.tracker.setBlocked(action.payload.blocker_type, action.payload);
        return {
          success: true,
          shouldContinue: false,
          waitReason: 'blocked',
          message: `Blocked: ${action.payload.blocker_type}`,
        };

      case 'REQUEST_USER_DECISION':
        // Wait for user input
        this.tracker.setWait('user-decision', action.payload);
        return {
          success: true,
          shouldContinue: false,
          waitReason: 'user-decision',
          message: 'Waiting for user decision',
        };

      default:
        return {
          success: true,
          shouldContinue: true,
          message: `Action ${action.action} processed.`,
        };
    }
  }

  /**
   * Handle child completion event
   */
  handleChildCompletion(
    childTaskId: string,
    status: 'completed' | 'failed' | 'blocked',
    eventData?: Partial<ChildCompletionEvent>
  ): {
    shouldRestartLoop: boolean;
    action?: OrchestratorAction;
    message: string;
  } {
    const state = this.tracker.getState();
    if (!state) {
      return { shouldRestartLoop: false, message: 'Loop not initialized' };
    }

    // Clear any wait states
    this.tracker.clearWait();

    // Load current org state
    if (!existsSync(state.workflowPath)) {
      return { shouldRestartLoop: false, message: 'Workflow file not found' };
    }

    const content = readFileSync(state.workflowPath, 'utf-8');
    const orgState = parseOrgContent(content, state.workflowPath);

    const event: ChildCompletionEvent = {
      childTaskId,
      status,
      timestamp: new Date().toISOString(),
      ...eventData,
    };

    return this.childHandler.handleCompletion(event, orgState);
  }

  /**
   * Decide next step
   */
  decideNext(workflowPath: string, parentTaskId: string): LoopDecision {
    const state = this.tracker.getState();
    if (!state) {
      return { type: 'fail', message: 'Loop not initialized' };
    }

    if (!existsSync(workflowPath)) {
      return { type: 'fail', message: 'Workflow file not found' };
    }

    const content = readFileSync(workflowPath, 'utf-8');
    const orgState = parseOrgContent(content, workflowPath);

    // Store current state for change detection
    this.previousOrgState = orgState;

    return this.decider.decide(orgState, parentTaskId, null);
  }

  /**
   * Check for state changes (completed children, etc.)
   */
  checkStateChanges(workflowPath: string): ChildCompletionEvent[] {
    if (!this.previousOrgState) {
      return [];
    }

    if (!existsSync(workflowPath)) {
      return [];
    }

    const content = readFileSync(workflowPath, 'utf-8');
    const currentState = parseOrgContent(content, workflowPath);

    return this.childHandler.findCompletedChildren(currentState, this.previousOrgState);
  }

  /**
   * Check if loop should continue
   */
  shouldContinue(): boolean {
    const state = this.tracker.getState();
    if (!state) return false;

    if (state.status === 'completed' || state.status === 'failed') {
      return false;
    }

    if (this.tracker.isMaxTurnsExceeded(this.config)) {
      state.metadata.refereeError = 'MAX_LOOP_TURNS_EXCEEDED';
      state.status = 'failed';
      return false;
    }

    return true;
  }

  /**
   * Get current loop state
   */
  getState(): LoopState | null {
    return this.tracker.getState();
  }

  /**
   * Get loop statistics
   */
  getStats(): {
    turns: number;
    status: string;
    waitReason?: WaitReason;
    loopHistoryLength: number;
  } | null {
    const state = this.tracker.getState();
    if (!state) return null;

    return {
      turns: state.turn,
      status: state.status,
      waitReason: state.waitReason,
      loopHistoryLength: state.loopHistory.length,
    };
  }

  /**
   * Reset the loop
   */
  reset(): void {
    this.tracker = new WorkflowStateTracker();
    this.previousOrgState = null;
  }
}

// ============================================================
// Factory Functions
// ============================================================

export function createLoopDriver(config?: Partial<LoopDriverConfig>): LoopDriver {
  return new LoopDriver(config);
}

export function createWorkflowStateTracker(): WorkflowStateTracker {
  return new WorkflowStateTracker();
}

export function createNextStepDecider(config?: Partial<LoopDriverConfig>): NextStepDecider {
  return new NextStepDecider(config);
}

export function createChildCompletionHandler(
  config?: Partial<LoopDriverConfig>
): ChildCompletionHandler {
  return new ChildCompletionHandler(config);
}
