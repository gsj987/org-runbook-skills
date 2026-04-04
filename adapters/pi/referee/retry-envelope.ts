/**
 * RetryEnvelope - Generate retry responses for invalid actions
 * 
 * Implements PRD Section 7.2.F: RETRY_INVALID_ACTION
 * 
 * When an orchestrator action is rejected, this generates a structured
 * retry envelope that:
 * 1. Explains why the action was rejected
 * 2. Lists the error codes
 * 3. Shows the allowed actions
 * 4. Provides an example of a valid action
 * 
 * @module referee/retry-envelope
 */

import {
  OrchestratorActionType,
  ALLOWED_ACTIONS,
  ValidationResult,
  ValidationError,
} from "../types/referee.js";

// ============================================================
// Retry Envelope Types
// ============================================================

/**
 * The RETRY_INVALID_ACTION envelope sent back to orchestrator
 */
export interface RetryEnvelope {
  action: "RETRY_INVALID_ACTION";
  parent_task_id: string;
  reason: string;
  payload: {
    error_code: string;
    details: string;
    errors: Array<{
      code: string;
      message: string;
      path?: string;
    }>;
    allowed_actions: OrchestratorActionType[];
  };
  expected_effect: string;
  guidance: {
    summary: string;
    suggestions: string[];
    example?: object;
  };
}

// ============================================================
// Error Code Descriptions
// ============================================================

const ERROR_DESCRIPTIONS: Record<string, string> = {
  INVALID_JSON: "Output must be valid JSON",
  UNKNOWN_ACTION: "Action type not in allowed list",
  SPECIALIST_CONTENT_DETECTED: "Orchestrator attempted specialist work directly",
  TASK_NOT_FOUND: "Referenced task ID does not exist",
  PHASE_GATE_UNSATISFIED: "Phase gate requirements not met",
  CHILD_NOT_DONE: "Child task must be DONE before merge",
  DEPENDENCY_UNSATISFIED: "Dependency task not completed",
  NO_STATE_CHANGE: "Action did not change observable state",
  MISSING_EVIDENCE_REF: "Referenced finding or evidence not found",
  MULTIPLE_ACTIONS: "Only one action per turn is allowed",
  INVALID_PHASE_TRANSITION: "Invalid phase transition",
  INVALID_ROLE: "Invalid or missing role",
  INVALID_TASK_ID: "Invalid or missing task ID",
  INVALID_REASON: "Reason must explain why action is needed",
  PARSE_ERROR: "Could not parse action from output",
  NO_JSON_FOUND: "No JSON found in output",
};

// ============================================================
// Message Templates
// ============================================================

function formatErrorList(errors: ValidationError[]): string {
  return errors.map(e => `  - [${e.code}] ${e.message}`).join("\n");
}

function generateGuidanceSummary(errors: ValidationError[]): string {
  const errorCodes = new Set(errors.map(e => e.code));
  
  if (errorCodes.has("PARSE_ERROR") || errorCodes.has("NO_JSON_FOUND") || errorCodes.has("INVALID_JSON")) {
    return "Your output must be valid JSON only, wrapped in a code block if desired.";
  }
  
  if (errorCodes.has("UNKNOWN_ACTION") || errorCodes.has("MULTIPLE_ACTIONS")) {
    return "You must emit exactly one action from the allowed list.";
  }
  
  if (errorCodes.has("TASK_NOT_FOUND")) {
    return "Check that all task IDs exist in the workflow before referencing them.";
  }
  
  if (errorCodes.has("CHILD_NOT_DONE") || errorCodes.has("DEPENDENCY_UNSATISFIED")) {
    return "Wait for child/dependency tasks to complete before merging or advancing.";
  }
  
  if (errorCodes.has("PHASE_GATE_UNSATISFIED")) {
    return "Review the phase gate requirements and ensure all criteria are met.";
  }
  
  if (errorCodes.has("INVALID_REASON")) {
    return "Provide a clear explanation (at least 5 characters) for why this action is needed.";
  }
  
  return "Fix the errors listed above and retry with a valid action.";
}

function generateSuggestions(errors: ValidationError[]): string[] {
  const suggestions: string[] = [];
  const errorCodes = new Set(errors.map(e => e.code));

  // General suggestions based on error types
  if (errorCodes.has("PARSE_ERROR") || errorCodes.has("NO_JSON_FOUND")) {
    suggestions.push("Wrap your JSON in a code block: ```json ... ```");
    suggestions.push("Ensure the JSON is valid and complete");
  }

  if (errorCodes.has("UNKNOWN_ACTION")) {
    suggestions.push(`Use one of: ${ALLOWED_ACTIONS.join(", ")}`);
  }

  if (errorCodes.has("INVALID_REASON")) {
    suggestions.push("Explain why this action is necessary in the 'reason' field");
  }

  if (errorCodes.has("TASK_NOT_FOUND")) {
    suggestions.push("Verify task IDs exist by reading the workflow.org file");
    suggestions.push("Use workflow.init() or create tasks before referencing them");
  }

  if (errorCodes.has("CHILD_NOT_DONE")) {
    suggestions.push("Wait for worker.awaitResult() to confirm child task is DONE");
    suggestions.push("Do not merge until child task status is DONE in workflow");
  }

  if (errorCodes.has("MISSING_EVIDENCE_REF")) {
    suggestions.push("Ensure findings have been written via workflow.appendFinding()");
    suggestions.push("Reference findings by their F-<uuid> IDs exactly");
  }

  if (suggestions.length === 0) {
    suggestions.push("Review the specific error messages above");
    suggestions.push("Check the PRD Section 7 for action schemas");
  }

  return suggestions;
}

// ============================================================
// Example Actions
// ============================================================

const EXAMPLES: Record<OrchestratorActionType, object> = {
  SPAWN_SUBTASK: {
    action: "SPAWN_SUBTASK",
    parent_task_id: "parent-001",
    reason: "Need code-agent to implement the API endpoint",
    payload: {
      child_task_id: "impl-api-001",
      title: "Implement user authentication API",
      role: "code-agent",
      phase: "implementation",
      depends_on: [],
      output_contract: {
        required_findings: 3,
        required_evidence_types: ["file", "command"],
        deliverables: ["code change", "test result"],
      },
    },
    expected_effect: "child task enters TODO and is ready for claim",
  },

  MERGE_SUBTASK_RESULT: {
    action: "MERGE_SUBTASK_RESULT",
    parent_task_id: "parent-001",
    reason: "Child task completed with valid evidence",
    payload: {
      child_task_id: "impl-api-001",
      summary: "API endpoint implemented with JWT authentication",
      finding_refs: ["F-001", "F-002"],
      evidence_refs: ["E-001", "E-002"],
    },
    expected_effect: "parent task gains derived findings and evidence",
  },

  ADVANCE_PHASE: {
    action: "ADVANCE_PHASE",
    parent_task_id: "parent-001",
    reason: "All implementation subtasks complete, gate requirements satisfied",
    payload: {
      from_phase: "implementation",
      to_phase: "test",
      gate_basis: {
        required_roles: ["code-agent"],
        completed_child_tasks: ["impl-api-001"],
        evidence_refs: ["E-001", "E-002"],
      },
    },
    expected_effect: "parent phase transitions from implementation to test",
  },

  RAISE_BLOCKER: {
    action: "RAISE_BLOCKER",
    parent_task_id: "parent-001",
    reason: "Waiting for external API documentation",
    payload: {
      blocker_type: "external-dependency",
      details: "Cannot proceed without third-party API spec",
      blocked_tasks: ["impl-api-001"],
      suggested_next_step: "Request user to provide documentation or skip this integration",
    },
    expected_effect: "task marked as BLOCKED pending external input",
  },

  REQUEST_USER_DECISION: {
    action: "REQUEST_USER_DECISION",
    parent_task_id: "parent-001",
    reason: "Two valid implementation paths, requires human choice",
    payload: {
      question: "Choose implementation approach for authentication",
      options: [
        { id: "jwt", description: "Use JWT tokens (recommended)" },
        { id: "session", description: "Use session-based auth" },
      ],
      default: "jwt",
    },
    expected_effect: "workflow pauses for user input",
  },
};

// ============================================================
// RetryEnvelope Generator
// ============================================================

export class RetryEnvelopeGenerator {
  /**
   * Generate a retry envelope for invalid action
   */
  generate(
    originalAction: { parent_task_id: string; action?: string },
    validationResult: ValidationResult
  ): RetryEnvelope {
    const errors = validationResult.errors;
    const primaryError = errors[0];

    // Determine error code for envelope
    let errorCode = primaryError?.code || "PARSE_ERROR";
    
    // Map various parse errors to a single code
    if (["PARSE_ERROR", "NO_JSON_FOUND", "INVALID_JSON"].includes(errorCode)) {
      errorCode = "PARSE_ERROR";
    }

    const errorDescription = ERROR_DESCRIPTIONS[errorCode] || "Invalid action";

    return {
      action: "RETRY_INVALID_ACTION",
      parent_task_id: originalAction.parent_task_id || "unknown",
      reason: "Invalid orchestrator action",
      payload: {
        error_code: errorCode,
        details: primaryError?.message || errorDescription,
        errors: errors.map(e => ({
          code: e.code,
          message: e.message,
          path: e.path,
        })),
        allowed_actions: ALLOWED_ACTIONS,
      },
      expected_effect: "orchestrator retries with a valid action",
      guidance: {
        summary: generateGuidanceSummary(errors),
        suggestions: generateSuggestions(errors),
        example: this.getRelevantExample(errors),
      },
    };
  }

  /**
   * Generate a retry envelope from a failed parse result
   */
  generateFromParseError(
    parentTaskId: string,
    parseError: { code: string; message: string; raw_output?: string }
  ): RetryEnvelope {
    return {
      action: "RETRY_INVALID_ACTION",
      parent_task_id: parentTaskId,
      reason: "Could not parse orchestrator output",
      payload: {
        error_code: parseError.code,
        details: parseError.message,
        errors: [
          {
            code: parseError.code,
            message: parseError.message,
          },
        ],
        allowed_actions: ALLOWED_ACTIONS,
      },
      expected_effect: "orchestrator retries with valid JSON action",
      guidance: {
        summary: "Your output must be valid JSON representing exactly one action.",
        suggestions: [
          "Output JSON only, no explanatory text",
          "Use a code block if needed: ```json { ... } ```",
          "Include required fields: action, parent_task_id, reason, expected_effect",
          `Action must be one of: ${ALLOWED_ACTIONS.join(", ")}`,
        ],
        example: EXAMPLES.SPAWN_SUBTASK,
      },
    };
  }

  /**
   * Get a relevant example based on error types
   */
  private getRelevantExample(errors: ValidationError[]): object | undefined {
    const errorCodes = new Set(errors.map(e => e.code));

    // If missing a task, suggest SPAWN
    if (errorCodes.has("TASK_NOT_FOUND")) {
      return EXAMPLES.SPAWN_SUBTASK;
    }

    // If child not done, suggest waiting
    if (errorCodes.has("CHILD_NOT_DONE")) {
      return EXAMPLES.MERGE_SUBTASK_RESULT;
    }

    // Default to SPAWN as most common first action
    return EXAMPLES.SPAWN_SUBTASK;
  }

  /**
   * Format envelope as JSON string
   */
  formatAsJson(envelope: RetryEnvelope): string {
    return JSON.stringify(envelope, null, 2);
  }

  /**
   * Format envelope as markdown for display
   */
  formatAsMarkdown(envelope: RetryEnvelope): string {
    const lines: string[] = [];

    lines.push("## ❌ Invalid Action - Retry Required");
    lines.push("");
    lines.push(`**Error Code**: ${envelope.payload.error_code}`);
    lines.push(`**Details**: ${envelope.payload.details}`);
    lines.push("");
    lines.push("### Errors");
    lines.push("");
    
    for (const error of envelope.payload.errors) {
      lines.push(`- **[${error.code}]** ${error.message}`);
      if (error.path) {
        lines.push(`  - Path: \`${error.path}\``);
      }
    }

    lines.push("");
    lines.push("### Allowed Actions");
    lines.push("");
    lines.push(envelope.payload.allowed_actions.map(a => `- \`${a}\``).join("\n"));

    lines.push("");
    lines.push("### Guidance");
    lines.push("");
    lines.push(envelope.guidance.summary);
    lines.push("");
    lines.push("**Suggestions:**");
    for (const suggestion of envelope.guidance.suggestions) {
      lines.push(`1. ${suggestion}`);
    }

    if (envelope.guidance.example) {
      lines.push("");
      lines.push("### Example Valid Action");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(envelope.guidance.example, null, 2));
      lines.push("```");
    }

    return lines.join("\n");
  }
}

// ============================================================
// Factory function
// ============================================================

export function createRetryEnvelopeGenerator(): RetryEnvelopeGenerator {
  return new RetryEnvelopeGenerator();
}
