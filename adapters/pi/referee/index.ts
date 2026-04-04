/**
 * Referee Module - Orchestrator Action Validation Layer
 * 
 * This module provides the referee/gatekeeper functionality for
 * enforcing orchestrator protocol compliance.
 * 
 * @module referee
 * 
 * Usage:
 * ```typescript
 * import { createReferee } from './referee';
 * 
 * const referee = createReferee();
 * 
 * // Parse orchestrator output
 * const parseResult = referee.parse(rawOutput);
 * if (!parseResult.success) {
 *   const retry = referee.generateRetryEnvelope(parseResult.error);
 *   return retry;
 * }
 * 
 * // Validate action
 * const validation = referee.validate(parseResult.action);
 * if (!validation.ok) {
 *   const retry = referee.generateRetryEnvelope(validation);
 *   return retry;
 * }
 * 
 * // Action is valid, apply it
 * referee.apply(parseResult.action);
 * ```
 */

// Types
export {
  // Core types
  OrchestratorActionType,
  OrchestratorAction,
  Role,
  Phase,
  BlockerType,
  EvidenceType,
  ALLOWED_ACTIONS,
  VALID_PHASE_TRANSITIONS,
  
  // Action interfaces
  SpawnSubtaskAction,
  MergeSubtaskResultAction,
  AdvancePhaseAction,
  RaiseBlockerAction,
  RequestUserDecisionAction,
  BaseOrchestratorAction,
  
  // Validation types
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationErrorCode,
  ParseResult,
  
  // Org state types
  OrgState,
  TaskState,
  FindingState,
  EvidenceState,
  
  // Config types
  RefereeConfig,
  DEFAULT_REFEREE_CONFIG,
  
  // Retry envelope types
  RetryEnvelope,
} from "../types/referee.js";

// Parser
export { ActionParser, createActionParser } from "./parser.js";

// Validator
export { ActionValidator, createActionValidator } from "./validator.js";

// Retry envelope
export {
  RetryEnvelopeGenerator,
  createRetryEnvelopeGenerator,
} from "./retry-envelope.js";

// Phase 2 exports
export { 
  SpecialistContentDetector, 
  createSpecialistContentDetector,
  DetectionResult,
  DetectionThresholds,
  SpecialistContentType,
  ContentFinding,
} from "./specialist-detector.js";

export { 
  CitationValidator, 
  createCitationValidator,
  CitationValidationResult,
  FindingReference,
  EvidenceReference,
} from "./citation-validator.js";

export { 
  RoleGateValidator, 
  createRoleGateValidator,
  PhaseGate,
  PhaseGatePolicy,
  PhaseGateRequirement,
  RoleGateValidationResult,
  DEFAULT_PHASE_GATE_POLICY,
} from "./role-gate-validator.js";

// Phase 3: Phase Gate Policy Loader
export {
  loadPhaseGatePolicy,
  clearPolicyCache,
  getRoleDefinition,
  getExceptionRouting,
  isTerminalPhase,
  getNextPhase,
  getPhaseRequirements,
  type PhaseGatePolicyConfig,
  type PhaseGateDefinition,
  type ExceptionRoutingEntry,
} from "./phase-gate-policy.js";

// Phase 3: Org State Reader/Writer
export {
  readOrgState,
  parseOrgContent,
  getChildTasks,
  getCompletedChildTasks,
  getCompletedChildTasksByRole,
  countFindings,
  countEvidence,
  getEvidenceTypes,
  calculateAverageFindingRating,
  isTerminalState,
  getTaskSummary,
  type OrgParseResult,
} from "./org-state-reader.js";

export {
  writeAcceptedAction,
  writeRejection,
  updateGateStatus,
  createWorkflowOrg,
  type RefereeMetadata,
  type ActionLogEntry,
  type WriteResult,
} from "./org-state-writer.js";

export type { ValidatorConfig } from "./validator.js";

// Phase 5: Fallback Approval
export {
  ExceptionClassifier,
  createExceptionClassifier,
  FallbackRequestGenerator,
  createFallbackRequestGenerator,
  FallbackApprovalHandler,
  createFallbackApprovalHandler,
  OrchestratorFallbackValidator,
  createOrchestratorFallbackValidator,
  type FallbackType,
  type FallbackApprovalStatus,
  type FallbackRequest,
  type FallbackAuditEntry,
  type FallbackValidationResult,
  type FallbackApprovalConfig,
  type FallbackDecision,
  type FallbackExecutionResult,
  DEFAULT_FALLBACK_CONFIG,
} from "./fallback-approval.js";

// Phase 4: Loop Driver
export {
  LoopDriver,
  createLoopDriver,
  WorkflowStateTracker,
  createWorkflowStateTracker,
  NextStepDecider,
  createNextStepDecider,
  ChildCompletionHandler,
  createChildCompletionHandler,
  type LoopTurn,
  type LoopState,
  type LoopDecision,
  type OrchestratorInput,
  type ChildCompletionEvent,
  type LoopDriverConfig,
  type WaitReason,
  DEFAULT_LOOP_DRIVER_CONFIG,
} from "./loop-driver.js";

// ============================================================
// Referee Facade
// ============================================================

import {
  ActionParser,
  ActionValidator,
  RetryEnvelopeGenerator,
  OrchestratorAction,
  OrgState,
  ValidationResult,
  ParseResult,
  RefereeConfig,
  DEFAULT_REFEREE_CONFIG,
  RetryEnvelope,
} from "../types/referee.js";

import { createActionParser } from "./parser.js";
import { createActionValidator } from "./validator.js";
import { createRetryEnvelopeGenerator } from "./retry-envelope.js";

/**
 * Main Referee class - combines parser, validator, and envelope generator
 * 
 * Phase 1: Basic validation (action schema, task existence)
 * Phase 2: Role boundary enforcement (specialist content, citations, role gates)
 */
export class Referee {
  private parser: ActionParser;
  private validator: ActionValidator;
  private envelopeGenerator: RetryEnvelopeGenerator;
  private config: RefereeConfig;
  private retryCount: Map<string, number> = new Map();

  constructor(config: Partial<RefereeConfig> = {}) {
    this.parser = createActionParser();
    this.validator = createActionValidator({ 
      strictMode: config.strictMode ?? false,
      detectSpecialistContent: config.detectSpecialistContent ?? false,
      validatePhaseGates: config.validatePhaseGates ?? false,
    });
    this.envelopeGenerator = createRetryEnvelopeGenerator();
    this.config = { ...DEFAULT_REFEREE_CONFIG, ...config };
  }

  /**
   * Set the current org state for validation
   */
  setOrgState(state: OrgState): void {
    this.validator.setOrgState(state);
  }

  /**
   * Clear org state
   */
  clearOrgState(): void {
    this.validator.clearOrgState();
  }
  
  /**
   * Update referee configuration (enables Phase 2 features)
   */
  updateConfig(config: Partial<RefereeConfig>): void {
    this.config = { ...this.config, ...config };
    this.validator.updateConfig({
      detectSpecialistContent: this.config.detectSpecialistContent,
      validatePhaseGates: this.config.validatePhaseGates,
    });
  }

  /**
   * Parse raw orchestrator output into typed action
   */
  parse(rawOutput: string): ParseResult {
    return this.parser.parse(rawOutput);
  }

  /**
   * Validate an orchestrator action
   */
  validate(action: OrchestratorAction, rawOutput?: string): ValidationResult {
    return this.validator.validate(action, rawOutput);
  }

  /**
   * Process orchestrator output end-to-end
   * Returns either a valid action or a retry envelope
   */
  process(rawOutput: string, parentTaskId?: string): {
    success: boolean;
    action?: OrchestratorAction;
    retryEnvelope?: RetryEnvelope;
  } {
    // Phase 2: Check for specialist content even before parsing
    // This catches orchestrator outputs that contain specialist work
    // instead of the required JSON action format
    if (this.config.detectSpecialistContent) {
      const validationResult = this.validate({} as OrchestratorAction, rawOutput);
      
      // If specialist content is detected, return error before parsing
      if (!validationResult.ok && validationResult.errors.some(e => e.code === "SPECIALIST_CONTENT_DETECTED")) {
        const envelope = this.envelopeGenerator.generateFromParseError(
          parentTaskId || "unknown",
          {
            code: "SPECIALIST_CONTENT_DETECTED",
            message: validationResult.errors.find(e => e.code === "SPECIALIST_CONTENT_DETECTED")!.message,
            raw_output: rawOutput,
          }
        );
        return { success: false, retryEnvelope: envelope };
      }
    }
    
    // Parse
    const parseResult = this.parse(rawOutput);
    
    if (!parseResult.success) {
      const envelope = this.envelopeGenerator.generateFromParseError(
        parentTaskId || "unknown",
        parseResult.error!
      );
      return { success: false, retryEnvelope: envelope };
    }

    // Validate (pass raw output for Phase 2 specialist content detection)
    const validationResult = this.validate(parseResult.action!, rawOutput);
    
    if (!validationResult.ok) {
      const envelope = this.envelopeGenerator.generate(
        parseResult.action!,
        validationResult
      );
      return { success: false, retryEnvelope: envelope };
    }

    // Success
    return { success: true, action: parseResult.action };
  }

  /**
   * Generate retry envelope for validation errors
   */
  generateRetryEnvelope(
    action: OrchestratorAction,
    validationResult: ValidationResult
  ): RetryEnvelope {
    return this.envelopeGenerator.generate(action, validationResult);
  }

  /**
   * Generate retry envelope for parse errors
   */
  generateRetryFromParseError(
    parentTaskId: string,
    parseError: { code: string; message: string; raw_output?: string }
  ): RetryEnvelope {
    return this.envelopeGenerator.generateFromParseError(parentTaskId, parseError);
  }

  /**
   * Get retry count for a task
   */
  getRetryCount(parentTaskId: string): number {
    return this.retryCount.get(parentTaskId) || 0;
  }

  /**
   * Increment retry count
   */
  incrementRetryCount(parentTaskId: string): number {
    const current = this.getRetryCount(parentTaskId);
    const next = current + 1;
    this.retryCount.set(parentTaskId, next);
    return next;
  }

  /**
   * Check if max retries exceeded
   */
  isMaxRetriesExceeded(parentTaskId: string): boolean {
    return this.getRetryCount(parentTaskId) >= this.config.maxRetries;
  }

  /**
   * Reset retry count for a task
   */
  resetRetryCount(parentTaskId: string): void {
    this.retryCount.delete(parentTaskId);
  }

  /**
   * Get configuration
   */
  getConfig(): RefereeConfig {
    return { ...this.config };
  }

  /**
   * Format retry envelope as JSON string
   */
  formatRetryAsJson(envelope: RetryEnvelope): string {
    return this.envelopeGenerator.formatAsJson(envelope);
  }

  /**
   * Format retry envelope as markdown
   */
  formatRetryAsMarkdown(envelope: RetryEnvelope): string {
    return this.envelopeGenerator.formatAsMarkdown(envelope);
  }
}

/**
 * Factory function to create a Referee instance
 */
export function createReferee(config?: Partial<RefereeConfig>): Referee {
  return new Referee(config);
}
