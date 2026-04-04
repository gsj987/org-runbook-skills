/**
 * Org State Reader - Phase 3 (T3.3)
 * 
 * Parses workflow.org files and extracts current task state.
 * Provides methods to read and analyze org-mode workflow state.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  OrgState,
  TaskState,
  FindingState,
  EvidenceState,
  Phase,
  Role,
} from '../types/referee.js';

// ============================================================
// Org-Mode Parsing Patterns
// ============================================================

const TODO_KEYWORDS = ['TODO', 'IN-PROGRESS', 'DONE', 'BLOCKED', 'CANCELLED'] as const;
const FINDING_PATTERN = /\[\s*F-([a-zA-Z0-9-]+)\s*\]\s*(.+?)(?:\s*"([^"]+)")?(?:\s*@(\d{4}-\d{2}-\d{2}))?/;
const EVIDENCE_PATTERN = /\[\s*E-([a-zA-Z0-9-]+)\s*\]\s*(\w+)\s*:\s*(.+?)(?:\s*→\s*F-([a-zA-Z0-9-]+))?(?:\s*\*+)?(?:\s*@(\d{4}-\d{2}-\d{2}))?/;
// Matches: * TODO [ ] task-id :tags: or ** TODO [ ] task-id
const TASK_PATTERN = /^(\*+)\s+(TODO|IN-PROGRESS|DONE|BLOCKED|CANCELLED)\s+\[([ X-])\]\s+(.+?)(?:\s+:([a-zA-Z0-9_:]+))?\s*$/i;
const PHASE_PROPERTY_PATTERN = /:PHASE:\s*([\w-]+)/;
const PARENT_PROPERTY_PATTERN = /:PARENT:\s*([\w-]+)/;
const ROLE_PROPERTY_PATTERN = /:ROLE:\s*([\w-]+)/;
const GATE_STATUS_PATTERN = /:GATE_STATUS:\s*(\w+)/;
const LAST_ACTION_PATTERN = /:LAST_ACTION:\s*(.+)/;
const REFEREE_ERROR_PATTERN = /:REFEREE_ERROR:\s*(.+)/;

// ============================================================
// Org State Reader
// ============================================================

export interface OrgParseResult {
  success: boolean;
  orgState?: OrgState;
  errors: string[];
  warnings: string[];
}

/**
 * Read and parse a workflow.org file
 */
export function readOrgState(workflowPath: string): OrgParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Resolve path
  let resolvedPath = workflowPath;
  if (!existsSync(workflowPath)) {
    resolvedPath = resolve(process.cwd(), workflowPath);
    if (!existsSync(resolvedPath)) {
      return {
        success: false,
        errors: [`Workflow file not found: ${workflowPath}`],
        warnings: [],
      };
    }
  }
  
  try {
    const content = readFileSync(resolvedPath, 'utf-8');
    const orgState = parseOrgContent(content, resolvedPath);
    
    return {
      success: true,
      orgState,
      errors,
      warnings,
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Error reading workflow file: ${error}`],
      warnings: [],
    };
  }
}

/**
 * Parse org-mode content into OrgState
 */
export function parseOrgContent(content: string, workflowPath: string): OrgState {
  const tasks = new Map<string, TaskState>();
  const lines = content.split('\n');
  
  let currentTask: TaskState | null = null;
  let currentPhase: Phase = 'discovery';
  let currentParent: string | undefined;
  
  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;
    
    // Check for task header (TODO item)
    const taskMatch = line.match(TASK_PATTERN);
    if (taskMatch) {
      // Save previous task
      if (currentTask) {
        tasks.set(currentTask.id, currentTask);
      }
      
      // New pattern: /^\*+\s+(TODO|...)\s+\[([ X-])\]\s+(.+?)(?:\s+:([a-zA-Z0-9_:]+))?\s*$/
      const [full, stars, keyword, checkbox, titleOrId, tags] = taskMatch;
      
      // Parse status from checkbox
      let status: TaskState['status'] = 'TODO';
      if (checkbox === 'X') {
        status = 'DONE';
      } else if (checkbox === '-') {
        status = 'BLOCKED';
      }
      
      // The titleOrId might be the actual task-id or a title
      // If it looks like a task-id (contains - or is short), use it
      // Otherwise, generate an id from it
      let taskId: string;
      let title: string;
      
      if (/^[a-z0-9-]+$/.test(titleOrId) && titleOrId.length < 30) {
        taskId = titleOrId;
        title = titleOrId;
      } else {
        taskId = generateTaskId(titleOrId);
        title = titleOrId;
      }
      
      // Update parent for child tasks (more than one star)
      if (stars.length > 1 && currentTask) {
        currentParent = currentTask.id;
      }
      
      // Create new task
      currentTask = {
        id: taskId,
        status,
        phase: currentPhase,
        parent: currentParent,
        findings: [],
        evidence: [],
      };
      
      // Parse tags for phase
      if (tags) {
        const phaseMatch = tags.match(/phase:(\w+)/);
        if (phaseMatch) {
          currentTask.phase = phaseMatch[1] as Phase;
        }
      }
      
      continue;
    }
    
    // Check for phase property
    const phaseMatch = line.match(PHASE_PROPERTY_PATTERN);
    if (phaseMatch && currentTask) {
      currentTask.phase = phaseMatch[1] as Phase;
      currentPhase = currentTask.phase;
      continue;
    }
    
    // Check for parent property
    const parentMatch = line.match(PARENT_PROPERTY_PATTERN);
    if (parentMatch && currentTask) {
      currentTask.parent = parentMatch[1];
      currentParent = currentTask.parent;
      continue;
    }
    
    // Check for role property
    const roleMatch = line.match(ROLE_PROPERTY_PATTERN);
    if (roleMatch && currentTask) {
      currentTask.owner = roleMatch[1] as Role;
      continue;
    }
    
    // Parse findings
    const findingMatch = line.match(FINDING_PATTERN);
    if (findingMatch && currentTask) {
      const [, id, content, rating, timestamp] = findingMatch;
      currentTask.findings.push({
        id: `F-${id}`,
        content: content.trim(),
        rating: (rating || '★★') as FindingState['rating'],
        timestamp: timestamp || new Date().toISOString(),
      });
      continue;
    }
    
    // Parse evidence
    const evidenceMatch = line.match(EVIDENCE_PATTERN);
    if (evidenceMatch && currentTask) {
      const [, id, type, source, findingRef, timestamp] = evidenceMatch;
      currentTask.evidence.push({
        id: `E-${id}`,
        type: type as EvidenceState['type'],
        source: source.trim(),
        finding_ref: findingRef ? `F-${findingRef}` : '',
        rating: '★★',
        timestamp: timestamp || new Date().toISOString(),
      });
      continue;
    }
    
    // Check for refile (child task creation)
    if (line.includes(':REFILE_TO:') && currentTask) {
      // This would indicate a spawned child task
      // Child tasks are typically created in separate subtrees
    }
  }
  
  // Save last task
  if (currentTask) {
    tasks.set(currentTask.id, currentTask);
  }
  
  return {
    workflowPath,
    tasks,
    rootTaskId: findRootTask(tasks),
  };
}

/**
 * Generate a task ID from title
 */
function generateTaskId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .substring(0, 20);
  return `${slug}-${Date.now().toString(36).slice(-4)}`;
}

/**
 * Find the root task (task without parent)
 */
function findRootTask(tasks: Map<string, TaskState>): string | undefined {
  for (const [id, task] of tasks) {
    if (!task.parent) {
      return id;
    }
  }
  return undefined;
}

// ============================================================
// State Analysis Utilities
// ============================================================

/**
 * Get all child tasks for a parent
 */
export function getChildTasks(parentId: string, orgState: OrgState): TaskState[] {
  const children: TaskState[] = [];
  
  for (const task of orgState.tasks.values()) {
    if (task.parent === parentId) {
      children.push(task);
    }
  }
  
  return children;
}

/**
 * Get completed child tasks
 */
export function getCompletedChildTasks(parentId: string, orgState: OrgState): TaskState[] {
  return getChildTasks(parentId, orgState).filter(t => t.status === 'DONE');
}

/**
 * Get completed child tasks by role
 */
export function getCompletedChildTasksByRole(
  parentId: string,
  orgState: OrgState
): Map<Role, TaskState[]> {
  const result = new Map<Role, TaskState[]>();
  const completedChildren = getCompletedChildTasks(parentId, orgState);
  
  for (const child of completedChildren) {
    const role = (child.owner || 'unknown') as Role;
    if (!result.has(role)) {
      result.set(role, []);
    }
    result.get(role)!.push(child);
  }
  
  return result;
}

/**
 * Count findings across parent and children
 */
export function countFindings(orgState: OrgState, parentId: string): number {
  const parent = orgState.tasks.get(parentId);
  if (!parent) return 0;
  
  let count = parent.findings.length;
  
  // Add findings from children
  for (const child of getChildTasks(parentId, orgState)) {
    count += child.findings.length;
  }
  
  return count;
}

/**
 * Count evidence across parent and children
 */
export function countEvidence(orgState: OrgState, parentId: string): number {
  const parent = orgState.tasks.get(parentId);
  if (!parent) return 0;
  
  let count = parent.evidence.length;
  
  // Add evidence from children
  for (const child of getChildTasks(parentId, orgState)) {
    count += child.evidence.length;
  }
  
  return count;
}

/**
 * Get evidence types present in parent and children
 */
export function getEvidenceTypes(orgState: OrgState, parentId: string): string[] {
  const types = new Set<string>();
  
  const parent = orgState.tasks.get(parentId);
  if (parent) {
    for (const evidence of parent.evidence) {
      types.add(evidence.type);
    }
  }
  
  for (const child of getChildTasks(parentId, orgState)) {
    for (const evidence of child.evidence) {
      types.add(evidence.type);
    }
  }
  
  return Array.from(types);
}

/**
 * Calculate average finding rating
 */
export function calculateAverageFindingRating(
  orgState: OrgState,
  parentId: string
): number {
  const parent = orgState.tasks.get(parentId);
  if (!parent) return 0;
  
  const ratings: number[] = [];
  
  for (const finding of parent.findings) {
    ratings.push(ratingToNumber(finding.rating));
  }
  
  for (const child of getChildTasks(parentId, orgState)) {
    for (const finding of child.findings) {
      ratings.push(ratingToNumber(finding.rating));
    }
  }
  
  if (ratings.length === 0) return 0;
  return ratings.reduce((a, b) => a + b, 0) / ratings.length;
}

/**
 * Convert rating string to number
 */
function ratingToNumber(rating: string): number {
  switch (rating) {
    case '★★★': return 3;
    case '★★': return 2;
    case '★': return 1;
    default: return 2;
  }
}

/**
 * Check if task is in terminal state
 */
export function isTerminalState(task: TaskState): boolean {
  return ['DONE', 'CANCELLED', 'BLOCKED'].includes(task.status);
}

/**
 * Get task summary for debugging
 */
export function getTaskSummary(task: TaskState): string {
  return `${task.id} [${task.status}] phase=${task.phase} findings=${task.findings.length} evidence=${task.evidence.length}`;
}
