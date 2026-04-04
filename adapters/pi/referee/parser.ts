/**
 * ActionParser - Extract JSON actions from orchestrator output
 * 
 * Parses raw model text into typed OrchestratorAction objects.
 * Handles:
 * - JSON in code blocks (```json ... ```)
 * - Bare JSON objects
 * - Non-JSON output (returns ParseFailure)
 * 
 * @module referee/parser
 */

import {
  OrchestratorAction,
  OrchestratorActionType,
  ALLOWED_ACTIONS,
  ParseResult,
  Role,
  Phase,
  BlockerType,
} from "../types/referee.js";

// ============================================================
// Patterns for extraction
// ============================================================

const JSON_BLOCK_PATTERN = /```(?:json)?\s*\n?([\s\S]*?)\n?```/i;
const JSON_OBJECT_PATTERN = /\{[\s\S]*\}/;
const ACTION_FIELD_PATTERN = /"action"\s*:\s*"([A-Z_]+)"/;

// ============================================================
// Parser Class
// ============================================================

export class ActionParser {
  /**
   * Parse raw orchestrator output into typed action
   * 
   * @param rawOutput - Raw text from orchestrator
   * @returns ParseResult with action or error
   */
  parse(rawOutput: string): ParseResult {
    // Trim whitespace
    const trimmed = rawOutput.trim();
    
    if (!trimmed) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: "Empty output from orchestrator",
        },
      };
    }

    // Try to extract JSON
    const jsonStr = this.extractJson(trimmed);
    
    if (!jsonStr) {
      return {
        success: false,
        error: {
          code: "NO_JSON_FOUND",
          message: "No valid JSON found in orchestrator output. Expected JSON action object.",
          raw_output: trimmed.slice(0, 500),
        },
      };
    }

    // Try to parse JSON
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: `Invalid JSON: ${(e as Error).message}`,
          raw_output: jsonStr.slice(0, 200),
        },
      };
    }

    // Validate it's an object
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: "JSON must be an object, not array or primitive",
        },
      };
    }

    // Extract action type
    const actionType = parsed.action as OrchestratorActionType | undefined;
    
    if (!actionType) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: 'Missing required field "action" in JSON object',
        },
      };
    }

    // Validate action type
    if (!ALLOWED_ACTIONS.includes(actionType)) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: `Unknown action type "${actionType}". Allowed: ${ALLOWED_ACTIONS.join(", ")}`,
        },
      };
    }

    // Validate required base fields
    if (!parsed.parent_task_id) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: 'Missing required field "parent_task_id"',
        },
      };
    }

    // Parse and validate action-specific fields
    const action = this.parseAction(parsed, actionType);
    
    if (!action.success) {
      return {
        success: false,
        error: action.error,
      };
    }

    return {
      success: true,
      action: action.action,
    };
  }

  /**
   * Extract JSON string from raw output
   */
  private extractJson(text: string): string | null {
    // Try JSON in code blocks first
    const blockMatch = text.match(JSON_BLOCK_PATTERN);
    if (blockMatch) {
      return blockMatch[1].trim();
    }

    // Try single JSON object
    const objectMatch = text.match(JSON_OBJECT_PATTERN);
    if (objectMatch) {
      // Make sure we get the full object (might be nested)
      const start = objectMatch.index || 0;
      const jsonStr = objectMatch[0];
      
      // Try to find matching braces
      let depth = 0;
      let end = 0;
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === "{") depth++;
        else if (jsonStr[i] === "}") {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
      
      if (end > 0) {
        return jsonStr.slice(0, end);
      }
      
      return jsonStr;
    }

    return null;
  }

  /**
   * Parse action-specific payload
   */
  private parseAction(
    parsed: any,
    actionType: OrchestratorActionType
  ): { success: true; action: OrchestratorAction } | { success: false; error: ParseResult["error"] } {
    const base = {
      action: actionType,
      parent_task_id: parsed.parent_task_id,
      reason: parsed.reason || "",
      expected_effect: parsed.expected_effect || "",
    };

    switch (actionType) {
      case "SPAWN_SUBTASK":
        return this.parseSpawnAction(parsed, base);
      case "MERGE_SUBTASK_RESULT":
        return this.parseMergeAction(parsed, base);
      case "ADVANCE_PHASE":
        return this.parseAdvanceAction(parsed, base);
      case "RAISE_BLOCKER":
        return this.parseBlockerAction(parsed, base);
      case "REQUEST_USER_DECISION":
        return this.parseDecisionAction(parsed, base);
      default:
        return {
          success: false,
          error: {
            code: "PARSE_ERROR",
            message: `Unhandled action type: ${actionType}`,
          },
        };
    }
  }

  private parseSpawnAction(
    parsed: any,
    base: any
  ): { success: true; action: any } | { success: false; error: ParseResult["error"] } {
    const payload = parsed.payload;
    
    if (!payload) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: 'SPAWN_SUBTASK requires "payload" field',
        },
      };
    }

    // NOTE: Parser only checks structure (field existence)
    // Semantic validation (non-empty values) is done by Validator
    if (payload.child_task_id === undefined) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: 'SPAWN_SUBTASK payload requires "child_task_id"',
        },
      };
    }

    if (payload.title === undefined) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: 'SPAWN_SUBTASK payload requires "title"',
        },
      };
    }

    if (payload.role === undefined) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: 'SPAWN_SUBTASK payload requires "role"',
        },
      };
    }

    return {
      success: true,
      action: {
        ...base,
        action: "SPAWN_SUBTASK",
        payload: {
          child_task_id: payload.child_task_id,
          title: payload.title,
          role: payload.role,
          phase: payload.phase || "discovery",
          depends_on: payload.depends_on || [],
          skill: payload.skill,
          output_contract: payload.output_contract,
        },
      },
    };
  }

  private parseMergeAction(
    parsed: any,
    base: any
  ): { success: true; action: any } | { success: false; error: ParseResult["error"] } {
    const payload = parsed.payload;
    
    if (!payload) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: 'MERGE_SUBTASK_RESULT requires "payload" field',
        },
      };
    }

    // NOTE: Parser only checks structure (field existence)
    // Semantic validation (non-empty values) is done by Validator
    if (payload.child_task_id === undefined) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: 'MERGE_SUBTASK_RESULT payload requires "child_task_id"',
        },
      };
    }

    return {
      success: true,
      action: {
        ...base,
        action: "MERGE_SUBTASK_RESULT",
        payload: {
          child_task_id: payload.child_task_id,
          summary: payload.summary || "",
          finding_refs: payload.finding_refs || [],
          evidence_refs: payload.evidence_refs || [],
          parent_updates: payload.parent_updates,
        },
      },
    };
  }

  private parseAdvanceAction(
    parsed: any,
    base: any
  ): { success: true; action: any } | { success: false; error: ParseResult["error"] } {
    const payload = parsed.payload;
    
    if (!payload) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: 'ADVANCE_PHASE requires "payload" field',
        },
      };
    }

    if (!payload.from_phase) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: 'ADVANCE_PHASE payload requires "from_phase"',
        },
      };
    }

    if (!payload.to_phase) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: 'ADVANCE_PHASE payload requires "to_phase"',
        },
      };
    }

    return {
      success: true,
      action: {
        ...base,
        action: "ADVANCE_PHASE",
        payload: {
          from_phase: payload.from_phase,
          to_phase: payload.to_phase,
          gate_basis: payload.gate_basis || {
            required_roles: [],
            completed_child_tasks: [],
            evidence_refs: [],
          },
        },
      },
    };
  }

  private parseBlockerAction(
    parsed: any,
    base: any
  ): { success: true; action: any } | { success: false; error: ParseResult["error"] } {
    const payload = parsed.payload;
    
    if (!payload) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: 'RAISE_BLOCKER requires "payload" field',
        },
      };
    }

    return {
      success: true,
      action: {
        ...base,
        action: "RAISE_BLOCKER",
        payload: {
          blocker_type: payload.blocker_type || "unknown",
          details: payload.details || "",
          blocked_tasks: payload.blocked_tasks || [],
          suggested_next_step: payload.suggested_next_step || "",
        },
      },
    };
  }

  private parseDecisionAction(
    parsed: any,
    base: any
  ): { success: true; action: any } | { success: false; error: ParseResult["error"] } {
    const payload = parsed.payload;
    
    if (!payload) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: 'REQUEST_USER_DECISION requires "payload" field',
        },
      };
    }

    if (!payload.question) {
      return {
        success: false,
        error: {
          code: "PARSE_ERROR",
          message: 'REQUEST_USER_DECISION payload requires "question"',
        },
      };
    }

    return {
      success: true,
      action: {
        ...base,
        action: "REQUEST_USER_DECISION",
        payload: {
          question: payload.question,
          options: payload.options || [],
          default: payload.default || "",
        },
      },
    };
  }
}

// ============================================================
// Factory function
// ============================================================

export function createActionParser(): ActionParser {
  return new ActionParser();
}
