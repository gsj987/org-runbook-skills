/**
 * Fallback Approval System - Phase 5 Implementation
 * 
 * Implements explicit fallback approval flow:
 * 1. Orchestrator requests fallback when no suitable role exists
 * 2. User must explicitly approve before degraded mode
 * 3. All fallbacks are logged with approval reference
 * 
 * @module fallback-approval
 */

import {
  OrchestratorAction,
  OrgState,
  TaskState,
  Phase,
} from '../types/referee.js';

import {
  getExceptionRouting,
  getRoleDefinition,
  isTerminalPhase,
} from './phase-gate-policy.js';

import {
  getChildTasks,
  getCompletedChildTasksByRole,
} from './org-state-reader.js';

// ============================================================
// Types
// ============================================================

export type FallbackType = 
  | 'no-suitable-role'
  | 'role-unavailable'
  | 'emergency-intervention'
  | 'degraded-mode'
  | 'direct-execution';

export type FallbackApprovalStatus = 
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'used';

export interface FallbackRequest {
  requestId: string;
  parentTaskId: string;
  fallbackType: FallbackType;
  reason: string;
  requestedWork: string;
  proposedApproach?: string;
  estimatedImpact?: string;
  requestedAt: string;
  expiresAt?: string;
  status: FallbackApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  executedAt?: string;
  auditTrail: FallbackAuditEntry[];
}

export interface FallbackAuditEntry {
  timestamp: string;
  action: string;
  actor: string;
  details: string;
}

export interface FallbackValidationResult {
  canRequestFallback: boolean;
  reason: FallbackType;
  details: string;
  alternativeRoles: string[];
  requiredApprovalLevel: 'user' | 'admin' | 'none';
}

export interface FallbackApprovalConfig {
  requireExplicitApproval: boolean;
  defaultApproval: 'reject';
  approvalTimeoutMinutes: number;
  maxFallbacksPerTask: number;
  logAllFallbacks: boolean;
  allowEmergencyOverride: boolean;
}

export interface FallbackDecision {
  decision: 'approve' | 'reject' | 'defer';
  approvedBy?: string;
  reason?: string;
  deferredUntil?: string;
}

export interface FallbackExecutionResult {
  success: boolean;
  executedAt?: string;
  output?: string;
  findings?: string[];
  evidence?: string[];
  error?: string;
}

// ============================================================
// Default Configuration
// ============================================================

export const DEFAULT_FALLBACK_CONFIG: FallbackApprovalConfig = {
  requireExplicitApproval: true,
  defaultApproval: 'reject',
  approvalTimeoutMinutes: 60,
  maxFallbacksPerTask: 3,
  logAllFallbacks: true,
  allowEmergencyOverride: false,
};

// ============================================================
// Exception Classifier
// ============================================================

export class ExceptionClassifier {
  /**
   * Classify an exception and determine if fallback is needed
   */
  classify(
    exceptionType: string,
    context: {
      currentPhase: Phase;
      parentTaskId: string;
      orgState: OrgState;
      missingRole?: string;
    }
  ): FallbackValidationResult {
    // Check exception routing for known types
    const routing = getExceptionRouting(exceptionType);
    
    if (routing) {
      // Known exception - delegate to configured role
      return {
        canRequestFallback: false,
        reason: 'role-unavailable',
        details: `${exceptionType} should be handled by ${routing.delegate_to}`,
        alternativeRoles: [routing.delegate_to],
        requiredApprovalLevel: routing.priority === 'high' ? 'user' : 'none',
      };
    }

    // Check if required role exists
    if (context.missingRole) {
      const roleDef = getRoleDefinition(context.missingRole);
      
      if (!roleDef) {
        // Role doesn't exist at all - fallback might be needed
        return {
          canRequestFallback: true,
          reason: 'no-suitable-role',
          details: `No role definition found for: ${context.missingRole}`,
          alternativeRoles: this.findAlternativeRoles(context.missingRole),
          requiredApprovalLevel: 'user',
        };
      }
    }

    // Check for child tasks that should handle this
    const childTasks = getChildTasks(context.parentTaskId, context.orgState);
    const completedByRole = getCompletedChildTasksByRole(context.parentTaskId, context.orgState);
    
    // Check phase-specific requirements
    const phaseRequirements = this.getPhaseRoleRequirements(context.currentPhase);
    
    for (const requiredRole of phaseRequirements) {
      if (!completedByRole.has(requiredRole)) {
        // Required role not completed - check if available
        const roleDef = getRoleDefinition(requiredRole);
        
        if (!roleDef) {
          return {
            canRequestFallback: true,
            reason: 'no-suitable-role',
            details: `Required role ${requiredRole} has no definition`,
            alternativeRoles: this.findAlternativeRoles(requiredRole),
            requiredApprovalLevel: 'user',
          };
        }
      }
    }

    // Default: fallback not needed
    return {
      canRequestFallback: false,
      reason: 'no-suitable-role',
      details: 'No fallback required - standard delegation available',
      alternativeRoles: [],
      requiredApprovalLevel: 'none',
    };
  }

  /**
   * Get role requirements for a phase
   */
  private getPhaseRoleRequirements(phase: Phase): string[] {
    const phaseRoleMap: Record<Phase, string[]> = {
      'discovery': [],
      'design': ['research-agent'],
      'implementation': ['code-agent'],
      'test': ['test-agent'],
      'integration': ['code-agent', 'test-agent'],
      'deploy-check': ['ops-agent'],
      'acceptance': [],
    };
    
    return phaseRoleMap[phase] || [];
  }

  /**
   * Find alternative roles for a missing role
   */
  private findAlternativeRoles(missingRole: string): string[] {
    const roleAlternatives: Record<string, string[]> = {
      'code-agent': ['arch-agent'],
      'test-agent': ['code-agent'],
      'ops-agent': ['integration-agent'],
      'research-agent': ['arch-agent', 'pm-agent'],
      'security-agent': ['arch-agent'],
    };
    
    return roleAlternatives[missingRole] || [];
  }
}

// ============================================================
// Fallback Request Generator
// ============================================================

export class FallbackRequestGenerator {
  /**
   * Generate a fallback request action
   */
  generateFallbackRequest(
    parentTaskId: string,
    validation: FallbackValidationResult,
    context: {
      currentPhase: Phase;
      proposedWork: string;
      estimatedDuration?: string;
    }
  ): OrchestratorAction {
    const requestId = this.generateRequestId();
    
    return {
      action: 'REQUEST_USER_DECISION',
      parent_task_id: parentTaskId,
      reason: `Fallback required: ${validation.details}`,
      payload: {
        decision_type: 'fallback-approval',
        request_id: requestId,
        question: `Approve orchestrator fallback for this task?`,
        description: `A suitable specialist role could not be found for the required work.`,
        
        options: [
          {
            id: 'fallback-approve',
            label: 'Approve Fallback',
            description: 'Allow orchestrator to perform the work directly',
            requires_acknowledgment: true,
            warnings: [
              'Direct execution bypasses role separation',
              'Evidence will be marked as orchestrator-generated',
              'This should be logged for audit',
            ],
          },
          {
            id: 'fallback-reject',
            label: 'Reject & Find Alternative',
            description: 'Do not allow fallback - seek alternative approach',
            is_default: true,
          },
          {
            id: 'fallback-defer',
            label: 'Defer Decision',
            description: 'Pause and decide later',
            requires_note: true,
          },
        ],
        
        fallback_metadata: {
          request_id: requestId,
          fallback_type: validation.reason,
          proposed_work: context.proposedWork,
          estimated_duration: context.estimatedDuration,
          alternative_roles: validation.alternativeRoles,
          phase: context.currentPhase,
          required_approval_level: validation.requiredApprovalLevel,
        },
        
        default: 'fallback-reject',
      },
      expected_effect: 'workflow pauses pending user decision',
    };
  }

  /**
   * Generate a fallback request for emergency intervention
   */
  generateEmergencyFallbackRequest(
    parentTaskId: string,
    reason: string,
    proposedWork: string
  ): OrchestratorAction {
    const requestId = this.generateRequestId();
    
    return {
      action: 'REQUEST_USER_DECISION',
      parent_task_id: parentTaskId,
      reason: `Emergency fallback requested: ${reason}`,
      payload: {
        decision_type: 'fallback-approval',
        request_id: requestId,
        question: `EMERGENCY: Approve immediate orchestrator intervention?`,
        description: `An emergency situation requires immediate action.`,
        
        options: [
          {
            id: 'fallback-approve',
            label: 'EMERGENCY APPROVE',
            description: 'Allow immediate orchestrator intervention',
            is_destructive: true,
            requires_acknowledgment: true,
            warnings: [
              'EMERGENCY MODE ACTIVATED',
              'All normal checks bypassed',
              'This action will be logged and reported',
            ],
          },
          {
            id: 'fallback-reject',
            label: 'Cancel Emergency',
            description: 'Do not allow emergency intervention',
            is_default: true,
          },
        ],
        
        fallback_metadata: {
          request_id: requestId,
          fallback_type: 'emergency-intervention',
          proposed_work: proposedWork,
          is_emergency: true,
          required_approval_level: 'admin',
        },
        
        default: 'fallback-reject',
      },
      expected_effect: 'emergency approval pending',
    };
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `FB-${timestamp}-${random}`;
  }
}

// ============================================================
// Fallback Approval Handler
// ============================================================

export class FallbackApprovalHandler {
  private config: FallbackApprovalConfig;
  private pendingRequests: Map<string, FallbackRequest> = new Map();
  private executedFallbacks: Map<string, FallbackRequest> = new Map();

  constructor(config: Partial<FallbackApprovalConfig> = {}) {
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config };
  }

  /**
   * Create a new fallback request
   */
  createRequest(
    parentTaskId: string,
    fallbackType: FallbackType,
    reason: string,
    proposedWork: string
  ): FallbackRequest {
    const requestId = this.generateRequestId();
    const now = new Date().toISOString();
    
    const request: FallbackRequest = {
      requestId,
      parentTaskId,
      fallbackType,
      reason,
      requestedWork: proposedWork,
      requestedAt: now,
      expiresAt: this.calculateExpiry(now),
      status: 'pending',
      auditTrail: [
        {
          timestamp: now,
          action: 'REQUEST_CREATED',
          actor: 'orchestrator',
          details: `Fallback request created: ${reason}`,
        },
      ],
    };

    this.pendingRequests.set(requestId, request);
    return request;
  }

  /**
   * Process a user decision on a fallback request
   */
  processDecision(
    requestId: string,
    decision: FallbackDecision
  ): { 
    request: FallbackRequest; 
    canExecute: boolean;
    message: string;
  } {
    const request = this.pendingRequests.get(requestId);
    
    if (!request) {
      throw new Error(`Fallback request not found: ${requestId}`);
    }

    if (request.status !== 'pending') {
      throw new Error(`Request ${requestId} is not pending (status: ${request.status})`);
    }

    const now = new Date().toISOString();

    // Add audit entry
    request.auditTrail.push({
      timestamp: now,
      action: `DECISION_${decision.decision.toUpperCase()}`,
      actor: decision.approvedBy || 'user',
      details: decision.reason || `User chose to ${decision.decision}`,
    });

    if (decision.decision === 'approve') {
      request.status = 'approved';
      request.approvedBy = decision.approvedBy;
      request.approvedAt = now;
      
      return {
        request,
        canExecute: true,
        message: 'Fallback approved - orchestrator may proceed with direct execution',
      };
    } else if (decision.decision === 'reject') {
      request.status = 'rejected';
      request.rejectedBy = decision.approvedBy;
      request.rejectedAt = now;
      
      return {
        request,
        canExecute: false,
        message: 'Fallback rejected - orchestrator must find alternative approach',
      };
    } else {
      // Defer
      return {
        request,
        canExecute: false,
        message: `Fallback deferred until ${decision.deferredUntil || 'later'}`,
      };
    }
  }

  /**
   * Check if fallback can be executed
   */
  canExecute(requestId: string): boolean {
    const request = this.pendingRequests.get(requestId);
    
    if (!request) {
      return false;
    }

    if (request.status !== 'approved') {
      return false;
    }

    // Check expiry
    if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
      request.status = 'expired';
      return false;
    }

    return true;
  }

  /**
   * Execute a fallback action
   */
  executeFallback(
    requestId: string,
    result: FallbackExecutionResult
  ): { success: boolean; auditEntry: FallbackAuditEntry } {
    const request = this.pendingRequests.get(requestId);
    
    if (!request) {
      throw new Error(`Fallback request not found: ${requestId}`);
    }

    if (!this.canExecute(requestId)) {
      throw new Error(`Cannot execute fallback ${requestId}: not approved or expired`);
    }

    const now = new Date().toISOString();

    // Update request
    request.status = 'used';
    request.executedAt = now;

    const auditEntry: FallbackAuditEntry = {
      timestamp: now,
      action: 'FALLBACK_EXECUTED',
      actor: 'orchestrator',
      details: `Fallback executed${result.success ? '' : ' with errors'}: ${result.error || 'success'}`,
    };

    request.auditTrail.push(auditEntry);

    // Move to executed (for audit log)
    this.executedFallbacks.set(requestId, request);
    this.pendingRequests.delete(requestId);

    return {
      success: result.success,
      auditEntry,
    };
  }

  /**
   * Get pending requests for a task
   */
  getPendingRequests(parentTaskId?: string): FallbackRequest[] {
    const requests = Array.from(this.pendingRequests.values());
    
    if (parentTaskId) {
      return requests.filter(r => r.parentTaskId === parentTaskId);
    }
    
    return requests;
  }

  /**
   * Get executed fallbacks for a task
   */
  getExecutedFallbacks(parentTaskId?: string): FallbackRequest[] {
    const requests = Array.from(this.executedFallbacks.values());
    
    if (parentTaskId) {
      return requests.filter(r => r.parentTaskId === parentTaskId);
    }
    
    return requests;
  }

  /**
   * Generate audit log entry
   */
  generateAuditLog(parentTaskId: string): string {
    const executed = this.getExecutedFallbacks(parentTaskId);
    const pending = this.getPendingRequests(parentTaskId);

    let log = `# Fallback Audit Log for ${parentTaskId}\n\n`;
    log += `Generated: ${new Date().toISOString()}\n\n`;

    if (executed.length > 0) {
      log += `## Executed Fallbacks (${executed.length})\n\n`;
      
      for (const fb of executed) {
        log += `### ${fb.requestId}\n`;
        log += `- Type: ${fb.fallbackType}\n`;
        log += `- Reason: ${fb.reason}\n`;
        log += `- Requested: ${fb.requestedAt}\n`;
        log += `- Approved by: ${fb.approvedBy} at ${fb.approvedAt}\n`;
        log += `- Executed: ${fb.executedAt}\n`;
        log += `- Status: ${fb.status}\n`;
        log += `\n#### Audit Trail\n`;
        
        for (const entry of fb.auditTrail) {
          log += `- [${entry.timestamp}] ${entry.actor}: ${entry.details}\n`;
        }
        
        log += '\n';
      }
    } else {
      log += `## Executed Fallbacks: None\n\n`;
    }

    if (pending.length > 0) {
      log += `## Pending Requests (${pending.length})\n\n`;
      
      for (const fb of pending) {
        log += `- ${fb.requestId}: ${fb.fallbackType} (${fb.status})\n`;
      }
      
      log += '\n';
    }

    return log;
  }

  /**
   * Check if fallback limits are exceeded
   */
  isLimitExceeded(parentTaskId: string): boolean {
    const executed = this.getExecutedFallbacks(parentTaskId);
    return executed.length >= this.config.maxFallbacksPerTask;
  }

  /**
   * Get fallback statistics for a task
   */
  getStatistics(parentTaskId: string): {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
    executed: number;
  } {
    const pending = this.getPendingRequests(parentTaskId);
    const executed = this.getExecutedFallbacks(parentTaskId);
    
    const all = [...pending, ...executed];
    
    return {
      total: all.length,
      approved: all.filter(r => r.status === 'approved').length,
      rejected: all.filter(r => r.status === 'rejected').length,
      pending: pending.length,
      executed: executed.length,
    };
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `FB-${timestamp}-${random}`;
  }

  /**
   * Calculate expiry time
   */
  private calculateExpiry(requestedAt: string): string {
    const requested = new Date(requestedAt);
    requested.setMinutes(
      requested.getMinutes() + this.config.approvalTimeoutMinutes
    );
    return requested.toISOString();
  }
}

// ============================================================
// Orchestrator Fallback Validator
// ============================================================

export class OrchestratorFallbackValidator {
  private classifier: ExceptionClassifier;
  private requestGenerator: FallbackRequestGenerator;
  private approvalHandler: FallbackApprovalHandler;
  private config: FallbackApprovalConfig;

  constructor(config: Partial<FallbackApprovalConfig> = {}) {
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config };
    this.classifier = new ExceptionClassifier();
    this.requestGenerator = new FallbackRequestGenerator();
    this.approvalHandler = new FallbackApprovalHandler(config);
  }

  /**
   * Validate if orchestrator is attempting direct execution
   */
  validateOrchestratorFallback(
    orchestratorOutput: string,
    context: {
      parentTaskId: string;
      currentPhase: Phase;
      orgState: OrgState;
      isDirectExecution?: boolean;
    }
  ): {
    isFallbackAttempt: boolean;
    validation?: FallbackValidationResult;
    request?: FallbackRequest;
    requiresApproval: boolean;
  } {
    // Check if this looks like direct execution
    const isDirectExec = this.detectDirectExecution(orchestratorOutput);
    
    if (!isDirectExec && !context.isDirectExecution) {
      return {
        isFallbackAttempt: false,
        requiresApproval: false,
      };
    }

    // Classify the exception
    const validation = this.classifier.classify('fallback-check', context);

    if (!validation.canRequestFallback) {
      return {
        isFallbackAttempt: true,
        validation,
        requiresApproval: false,
      };
    }

    // Create fallback request
    const request = this.approvalHandler.createRequest(
      context.parentTaskId,
      validation.reason,
      validation.details,
      orchestratorOutput.substring(0, 500) // Truncate for logging
    );

    return {
      isFallbackAttempt: true,
      validation,
      request,
      requiresApproval: true,
    };
  }

  /**
   * Detect if orchestrator output indicates direct execution
   */
  private detectDirectExecution(output: string): boolean {
    // Patterns that suggest direct execution vs delegation
    const directExecutionPatterns = [
      /^Here'?s (the |my )?(implementation|code|fix|solution)/i,
      /^I('ll| will) (implement|write|create|fix)/i,
      /\n```(?:typescript|javascript|python|bash|sh|sql)\n/,
      /^```(?:typescript|javascript|python|bash|sh|sql)\n/m,
      /\n@@ -?\d+(,?\d+)? -?\d+,(,?\d+)? @@/m, // git diff
    ];

    return directExecutionPatterns.some(pattern => pattern.test(output));
  }

  /**
   * Generate fallback request action
   */
  generateFallbackRequest(
    parentTaskId: string,
    proposedWork: string,
    context: {
      currentPhase: Phase;
      orgState: OrgState;
      missingRole?: string;
    }
  ): OrchestratorAction {
    const validation = this.classifier.classify('fallback-check', {
      ...context,
      parentTaskId,
    });

    return this.requestGenerator.generateFallbackRequest(
      parentTaskId,
      validation,
      {
        currentPhase: context.currentPhase,
        proposedWork,
      }
    );
  }

  /**
   * Process user decision
   */
  processDecision(
    requestId: string,
    decision: FallbackDecision
  ): {
    request: FallbackRequest;
    canExecute: boolean;
    message: string;
  } {
    return this.approvalHandler.processDecision(requestId, decision);
  }

  /**
   * Execute approved fallback
   */
  executeFallback(
    requestId: string,
    result: FallbackExecutionResult
  ): { success: boolean; auditEntry: FallbackAuditEntry } {
    return this.approvalHandler.executeFallback(requestId, result);
  }

  /**
   * Check if can execute
   */
  canExecuteFallback(requestId: string): boolean {
    return this.approvalHandler.canExecute(requestId);
  }

  /**
   * Get pending requests
   */
  getPendingRequests(parentTaskId?: string): FallbackRequest[] {
    return this.approvalHandler.getPendingRequests(parentTaskId);
  }

  /**
   * Get statistics
   */
  getStatistics(parentTaskId: string) {
    return this.approvalHandler.getStatistics(parentTaskId);
  }

  /**
   * Generate audit log
   */
  generateAuditLog(parentTaskId: string): string {
    return this.approvalHandler.generateAuditLog(parentTaskId);
  }
}

// ============================================================
// Factory Functions
// ============================================================

export function createExceptionClassifier(): ExceptionClassifier {
  return new ExceptionClassifier();
}

export function createFallbackRequestGenerator(): FallbackRequestGenerator {
  return new FallbackRequestGenerator();
}

export function createFallbackApprovalHandler(
  config?: Partial<FallbackApprovalConfig>
): FallbackApprovalHandler {
  return new FallbackApprovalHandler(config);
}

export function createOrchestratorFallbackValidator(
  config?: Partial<FallbackApprovalConfig>
): OrchestratorFallbackValidator {
  return new OrchestratorFallbackValidator(config);
}
