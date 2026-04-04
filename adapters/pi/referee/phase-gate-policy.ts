/**
 * Phase Gate Policy Loader - Phase 3 (T3.2)
 * 
 * Loads and parses the phase-gates.yaml policy file.
 * Provides TypeScript interfaces for the policy structure.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Types for the policy file
export interface PhaseGateRequirement {
  min_findings?: number;
  min_evidence?: number;
  completed_child_roles?: string[];
  min_child_done?: number;
  allowed_evidence_types?: string[];
  min_finding_rating?: string;
  requires_user_approval?: boolean;
}

export interface PhaseGateDefinition {
  description: string;
  advance_to: string;
  requirements: PhaseGateRequirement;
  output_contract?: {
    required_findings: number;
    required_evidence: number;
    description: string;
  };
  can_skip: boolean;
  terminal?: boolean;
}

export interface ExceptionRoutingEntry {
  delegate_to: string;
  priority: 'high' | 'medium' | 'low';
  description: string;
}

export interface PhaseGatePolicyConfig {
  version: string;
  defaults: {
    min_reason_length: number;
    max_retry_count: number;
  };
  phases: Record<string, PhaseGateDefinition>;
  exception_routing: Record<string, ExceptionRoutingEntry>;
  roles: Record<string, {
    description: string;
    skills: string[];
    output_types: string[];
  }>;
}

// ============================================================
// Policy Loader
// ============================================================

let cachedPolicy: PhaseGatePolicyConfig | null = null;

/**
 * Load phase gate policy from YAML file
 */
export function loadPhaseGatePolicy(): PhaseGatePolicyConfig {
  if (cachedPolicy) {
    return cachedPolicy;
  }

  // Default policy (in case YAML loading fails)
  const defaultPolicy = getDefaultPolicy();
  
  try {
    // Try to find the config file
    const possiblePaths = [
      resolve(process.cwd(), 'config/phase-gates.yaml'),
      resolve(process.cwd(), 'adapters/pi/config/phase-gates.yaml'),
      resolve(dirname(fileURLToPath(import.meta.url)), '../../config/phase-gates.yaml'),
    ];
    
    for (const configPath of possiblePaths) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const policy = parseYamlPolicy(content);
        cachedPolicy = policy;
        return policy;
      } catch {
        // Try next path
      }
    }
    
    // If no file found, return default
    console.warn('[PhaseGatePolicy] No phase-gates.yaml found, using default policy');
    return defaultPolicy;
    
  } catch (error) {
    console.warn('[PhaseGatePolicy] Error loading policy, using default:', error);
    return defaultPolicy;
  }
}

/**
 * Parse YAML content into policy object
 */
function parseYamlPolicy(content: string): PhaseGatePolicyConfig {
  // Simple YAML parser for our specific structure
  // In production, you'd use js-yaml or similar
  
  const lines = content.split('\n');
  const policy: any = {
    version: '1.0',
    defaults: { min_reason_length: 10, max_retry_count: 3 },
    phases: {},
    exception_routing: {},
    roles: {},
  };
  
  let currentSection: string | null = null;
  let currentPhase: string | null = null;
  let currentRole: string | null = null;
  let currentException: string | null = null;
  let currentRoleList: string | null = null; // Track which list we're in for roles
  let indent = 0;
  
  for (let line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;
    
    // Detect section
    if (line.trim() === 'phases:') {
      currentSection = 'phases';
      continue;
    }
    if (line.trim() === 'exception_routing:') {
      currentSection = 'exception_routing';
      continue;
    }
    if (line.trim() === 'roles:') {
      currentSection = 'roles';
      continue;
    }
    if (line.trim() === 'defaults:') {
      currentSection = 'defaults';
      continue;
    }
    
    const lineIndent = line.search(/\S/);
    
    // Phase definition
    if (currentSection === 'phases' && lineIndent === 2 && line.includes(':')) {
      currentPhase = line.trim().replace(':', '');
      policy.phases[currentPhase] = {
        description: '',
        advance_to: currentPhase,
        requirements: {},
        can_skip: false,
      };
      continue;
    }
    
    // Phase properties
    if (currentSection === 'phases' && currentPhase) {
      if (lineIndent === 4) {
        const [key, ...valueParts] = line.trim().split(':');
        const value = valueParts.join(':').trim();
        
        if (key === 'description') {
          policy.phases[currentPhase].description = value;
        } else if (key === 'advance_to') {
          policy.phases[currentPhase].advance_to = value;
        } else if (key === 'can_skip') {
          policy.phases[currentPhase].can_skip = value === 'true';
        } else if (key === 'terminal') {
          policy.phases[currentPhase].terminal = value === 'true';
        }
        continue;
      }
      
      // Requirements section
      if (lineIndent === 4 && line.trim() === 'requirements:') {
        policy.phases[currentPhase].requirements = {};
        continue;
      }
      
      if (lineIndent === 6 && currentPhase) {
        const [key, ...valueParts] = line.trim().split(':');
        const value = valueParts.join(':').trim();
        
        if (key === 'min_findings' || key === 'min_evidence' || key === 'min_child_done') {
          policy.phases[currentPhase].requirements[key] = parseInt(value) || 0;
        } else if (key === 'min_finding_rating') {
          policy.phases[currentPhase].requirements[key] = value;
        } else if (key === 'requires_user_approval') {
          policy.phases[currentPhase].requirements[key] = value === 'true';
        } else if (key === 'completed_child_roles') {
          policy.phases[currentPhase].requirements.completed_child_roles = [];
        } else if (key === 'allowed_evidence_types') {
          policy.phases[currentPhase].requirements.allowed_evidence_types = [];
        }
        continue;
      }
      
      // List items
      if (lineIndent === 8 && currentPhase) {
        if (line.trim().startsWith('- ')) {
          const item = line.trim().substring(2);
          if (policy.phases[currentPhase].requirements.completed_child_roles !== undefined) {
            policy.phases[currentPhase].requirements.completed_child_roles.push(item);
          } else if (policy.phases[currentPhase].requirements.allowed_evidence_types !== undefined) {
            policy.phases[currentPhase].requirements.allowed_evidence_types.push(item);
          }
          continue;
        }
      }
    }
    
    // Exception routing
    if (currentSection === 'exception_routing' && lineIndent === 2 && line.includes(':')) {
      currentException = line.trim().replace(':', '');
      policy.exception_routing[currentException] = {
        delegate_to: '',
        priority: 'medium',
        description: '',
      };
      continue;
    }
    
    if (currentSection === 'exception_routing' && currentException) {
      if (lineIndent === 4) {
        const [key, ...valueParts] = line.trim().split(':');
        const value = valueParts.join(':').trim();
        
        if (key === 'delegate_to') {
          policy.exception_routing[currentException].delegate_to = value;
        } else if (key === 'priority') {
          policy.exception_routing[currentException].priority = value;
        } else if (key === 'description') {
          policy.exception_routing[currentException].description = value;
        }
        continue;
      }
    }
    
    // Roles
    if (currentSection === 'roles' && lineIndent === 2 && line.includes(':')) {
      currentRole = line.trim().replace(':', '');
      policy.roles[currentRole] = {
        description: '',
        skills: [],
        output_types: [],
      };
      currentRoleList = null;
      continue;
    }
    
    if (currentSection === 'roles' && currentRole) {
      if (lineIndent === 4) {
        const [key, ...valueParts] = line.trim().split(':');
        const value = valueParts.join(':').trim();
        
        if (key === 'description') {
          policy.roles[currentRole].description = value;
          currentRoleList = null;
        } else if (key === 'skills') {
          policy.roles[currentRole].skills = [];
          currentRoleList = 'skills';
        } else if (key === 'output_types') {
          policy.roles[currentRole].output_types = [];
          currentRoleList = 'output_types';
        }
        continue;
      }
      
      if (lineIndent === 6 && currentRole && currentRoleList) {
        if (line.trim().startsWith('- ')) {
          const item = line.trim().substring(2);
          if (currentRoleList === 'skills') {
            policy.roles[currentRole].skills.push(item);
          } else if (currentRoleList === 'output_types') {
            policy.roles[currentRole].output_types.push(item);
          }
          continue;
        }
      }
    }
  }
  
  return policy;
}

/**
 * Get default policy (hardcoded fallback)
 */
function getDefaultPolicy(): PhaseGatePolicyConfig {
  return {
    version: "1.0",
    defaults: {
      min_reason_length: 10,
      max_retry_count: 3,
    },
    phases: {
      discovery: {
        description: "Initial research and requirement gathering",
        advance_to: "design",
        requirements: {
          min_findings: 3,
          min_evidence: 1,
          completed_child_roles: [],
          min_child_done: 0,
          allowed_evidence_types: ["web", "blog", "agent-output"],
          min_finding_rating: "★★",
        },
        can_skip: false,
      },
      design: {
        description: "Architecture and detailed design",
        advance_to: "implementation",
        requirements: {
          min_findings: 3,
          min_evidence: 1,
          completed_child_roles: ["research-agent"],
          min_child_done: 1,
          allowed_evidence_types: ["web", "file", "command", "agent-output"],
          min_finding_rating: "★★",
        },
        can_skip: false,
      },
      implementation: {
        description: "Code implementation",
        advance_to: "test",
        requirements: {
          min_findings: 2,
          min_evidence: 2,
          completed_child_roles: ["code-agent"],
          min_child_done: 1,
          allowed_evidence_types: ["file", "command", "agent-output"],
          min_finding_rating: "★★★",
        },
        can_skip: false,
      },
      test: {
        description: "Testing and quality assurance",
        advance_to: "integration",
        requirements: {
          min_findings: 2,
          min_evidence: 2,
          completed_child_roles: ["test-agent"],
          min_child_done: 1,
          allowed_evidence_types: ["file", "command", "agent-output"],
          min_finding_rating: "★★★",
        },
        can_skip: false,
      },
      integration: {
        description: "Integration and system testing",
        advance_to: "deploy-check",
        requirements: {
          min_findings: 1,
          min_evidence: 2,
          completed_child_roles: ["code-agent", "test-agent"],
          min_child_done: 2,
          allowed_evidence_types: ["file", "command", "agent-output"],
          min_finding_rating: "★★★",
        },
        can_skip: false,
      },
      "deploy-check": {
        description: "Deployment readiness verification",
        advance_to: "acceptance",
        requirements: {
          min_findings: 1,
          min_evidence: 1,
          completed_child_roles: ["ops-agent"],
          min_child_done: 1,
          allowed_evidence_types: ["file", "command", "agent-output"],
          min_finding_rating: "★★★",
        },
        can_skip: false,
      },
      acceptance: {
        description: "Final review and acceptance",
        advance_to: "acceptance",
        requirements: {
          requires_user_approval: true,
        },
        output_contract: {
          required_findings: 0,
          required_evidence: 0,
          description: "User acceptance confirmed",
        },
        can_skip: false,
        terminal: true,
      },
    },
    exception_routing: {
      "impl-bug": {
        delegate_to: "code-agent",
        priority: "high",
        description: "Implementation bug requires code-agent fix",
      },
      "test-failure": {
        delegate_to: "test-agent",
        priority: "high",
        description: "Test failure requires test-agent investigation",
      },
      "integration-mismatch": {
        delegate_to: "integration-agent",
        priority: "high",
        description: "Integration issue requires integration-agent",
      },
      "deploy-config-error": {
        delegate_to: "ops-agent",
        priority: "high",
        description: "Deployment config requires ops-agent",
      },
      "requirement-gap": {
        delegate_to: "pm-agent",
        priority: "medium",
        description: "Missing requirements requires pm-agent clarification",
      },
      "environment-issue": {
        delegate_to: "ops-agent",
        priority: "medium",
        description: "Environment issue requires ops-agent",
      },
      "security-concern": {
        delegate_to: "security-agent",
        priority: "high",
        description: "Security concern requires security-agent review",
      },
    },
    roles: {
      "code-agent": {
        description: "Implements features and fixes bugs",
        skills: ["@runbook-org"],
        output_types: ["file", "command"],
      },
      "test-agent": {
        description: "Writes and runs tests",
        skills: ["@runbook-org"],
        output_types: ["file", "command"],
      },
      "ops-agent": {
        description: "Handles deployment and infrastructure",
        skills: ["@runbook-org"],
        output_types: ["command", "agent-output"],
      },
      "research-agent": {
        description: "Conducts research and analysis",
        skills: ["@runbook-org"],
        output_types: ["web", "agent-output"],
      },
      "integration-agent": {
        description: "Handles system integration",
        skills: ["@runbook-org"],
        output_types: ["file", "command"],
      },
      "pm-agent": {
        description: "Manages requirements and priorities",
        skills: ["@runbook-org"],
        output_types: ["agent-output"],
      },
      "arch-agent": {
        description: "Designs system architecture",
        skills: ["@runbook-org"],
        output_types: ["file", "agent-output"],
      },
      "security-agent": {
        description: "Reviews security concerns",
        skills: ["@runbook-org"],
        output_types: ["agent-output"],
      },
    },
  };
}

/**
 * Clear cached policy (for testing)
 */
export function clearPolicyCache(): void {
  cachedPolicy = null;
}

/**
 * Get role definition from policy
 */
export function getRoleDefinition(role: string): PhaseGatePolicyConfig['roles'][string] | undefined {
  const policy = loadPhaseGatePolicy();
  return policy.roles[role];
}

/**
 * Get exception routing for a failure type
 */
export function getExceptionRouting(failureType: string): ExceptionRoutingEntry | undefined {
  const policy = loadPhaseGatePolicy();
  return policy.exception_routing[failureType];
}

/**
 * Check if a phase is terminal
 */
export function isTerminalPhase(phase: string): boolean {
  const policy = loadPhaseGatePolicy();
  return policy.phases[phase]?.terminal || false;
}

/**
 * Get the next phase for a given phase
 */
export function getNextPhase(phase: string): string | null {
  const policy = loadPhaseGatePolicy();
  return policy.phases[phase]?.advance_to || null;
}

/**
 * Get phase requirements
 */
export function getPhaseRequirements(phase: string): PhaseGateRequirement | undefined {
  const policy = loadPhaseGatePolicy();
  return policy.phases[phase]?.requirements;
}
