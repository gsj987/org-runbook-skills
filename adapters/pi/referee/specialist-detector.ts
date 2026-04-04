/**
 * Specialist Content Detector - Phase 2
 * 
 * Detects when orchestrator output contains specialist work
 * that should have been delegated to child tasks.
 * 
 * PRD Rule B1: Orchestrator cannot claim specialist completion directly.
 * 
 * This detector identifies:
 * - Code blocks (implementation code)
 * - Shell scripts or commands
 * - Patch/diff hunks
 * - Implementation prose (detailed technical explanations)
 * - Test implementation details
 * - Direct completion claims without evidence
 */

import { ValidationError } from "../types/referee.js";

// ============================================================
// Detection Patterns
// ============================================================

/**
 * Patterns that indicate specialist content
 */
const SPECIALIST_PATTERNS = {
  // Code blocks with language hints
  codeBlock: /```(?:typescript|javascript|python|go|rust|java|cpp|c\+\+|bash|sh|shell|json|yaml|yml|xml|sql|html|css|jsx|tsx)\s*\n[\s\S]*?```/gi,
  
  // Generic code blocks (no language)
  genericCodeBlock: /```\n[\s\S]*?```/gi,
  
  // Shell command executions
  shellCommand: /\$\s*(?:npm|yarn|pnpm|git|docker|kubectl|helm|terraform|make|cmake|gradle|maven|apt|yum|brew|chmod|chown|mkdir|rm|rmdir|cp|mv|cat|echo|grep|sed|awk|find|xargs|curl|wget|ssh|scp|rsync|systemctl|service|journalctl)\s/mgi,
  
  // Diff/patch hunks
  diffHunk: /^(?:---|\+\+\+|@@|\+\s|\-\s).+$/gm,
  
  // File paths suggesting code changes
  filePaths: /(?:src\/|lib\/|pkg\/|cmd\/|internal\/|api\/|models?|controllers?|services?|views?|components?|pages?|routes?|config|dist\/|build\/|test[s]?\/|tests?\/|examples?\/)[^\s]*/gi,
  
  // Function/class definitions suggesting implementation
  implementationHints: /(?:function\s+\w+|class\s+\w+|def\s+\w+\(|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|interface\s+\w+|type\s+\w+\s*=|enum\s+\w+|import\s+|export\s+|async\s+|await\s+)/g,
  
  // Test implementations
  testImplementation: /(?:describe\(|it\(|test\(|expect\(|assert\(|should\(|Given|When|Then)/g,
};

// ============================================================
// Detection Thresholds
// ============================================================

export interface DetectionThresholds {
  /** Minimum code block length to trigger warning */
  minCodeBlockLength: number;
  /** Minimum shell commands to trigger warning */
  minShellCommands: number;
  /** Minimum implementation hints to trigger warning */
  minImplementationHints: number;
  /** Allow delegation narrative (discussing strategy) */
  allowDelegationNarrative: boolean;
}

export const DEFAULT_DETECTION_THRESHOLDS: DetectionThresholds = {
  minCodeBlockLength: 50,        // Ignore short inline snippets
  minShellCommands: 2,            // At least 2 shell commands
  minImplementationHints: 3,      // At least 3 implementation hints
  allowDelegationNarrative: true, // Allow explaining what to do
};

// ============================================================
// Detection Result
// ============================================================

export interface DetectionResult {
  /** Whether specialist content was detected */
  detected: boolean;
  /** List of detected content types */
  types: SpecialistContentType[];
  /** Detailed findings */
  findings: ContentFinding[];
  /** Overall severity (for potential warning vs error) */
  severity: "none" | "warning" | "error";
}

export type SpecialistContentType = 
  | "code_block"
  | "shell_command"
  | "diff_patch"
  | "implementation_prose"
  | "test_implementation"
  | "direct_completion_claim";

export interface ContentFinding {
  type: SpecialistContentType;
  match: string;
  line?: number;
  length?: number;
  context?: string;
}

// ============================================================
// Specialist Content Detector
// ============================================================

export class SpecialistContentDetector {
  private config: DetectionThresholds;
  
  constructor(config: Partial<DetectionThresholds> = {}) {
    this.config = { ...DEFAULT_DETECTION_THRESHOLDS, ...config };
  }
  
  /**
   * Detect specialist content in raw orchestrator output
   */
  detect(rawOutput: string): DetectionResult {
    const findings: ContentFinding[] = [];
    const types = new Set<SpecialistContentType>();
    
    // ========================================
    // Check for code blocks FIRST (in raw output)
    // ========================================
    
    const codeBlocks = this.detectCodeBlocks(rawOutput);
    if (codeBlocks.length > 0) {
      findings.push(...codeBlocks);
      types.add("code_block");
    }
    
    // Check for diff/patch patterns in raw output
    const diffPatches = this.detectDiffPatches(rawOutput);
    if (diffPatches.length > 0) {
      findings.push(...diffPatches);
      types.add("diff_patch");
    }
    
    // Check for shell commands in raw output
    const shellCommands = this.detectShellCommands(rawOutput);
    if (shellCommands.length >= this.config.minShellCommands) {
      findings.push(...shellCommands);
      types.add("shell_command");
    }
    
    // ========================================
    // Then extract narrative for prose checks
    // ========================================
    
    const narrativeText = this.extractNarrative(rawOutput);
    
    if (!narrativeText) {
      // No narrative text, output is likely pure JSON
      // But we might have already detected code blocks
      if (findings.length === 0) {
        return {
          detected: false,
          types: [],
          findings: [],
          severity: "none",
        };
      }
    } else {
      // Check for implementation hints (technical detail)
      const implementationProse = this.detectImplementationHints(narrativeText);
      if (implementationProse.length >= this.config.minImplementationHints) {
        findings.push(...implementationProse);
        types.add("implementation_prose");
      }
      
      // Check for test implementation
      const testImplementation = this.detectTestImplementation(narrativeText);
      if (testImplementation.length > 0) {
        findings.push(...testImplementation);
        types.add("test_implementation");
      }
      
      // Check for direct completion claims
      const completionClaims = this.detectCompletionClaims(narrativeText);
      if (completionClaims.length > 0) {
        findings.push(...completionClaims);
        types.add("direct_completion_claim");
      }
    }
    
    // Determine severity
    let severity: "none" | "warning" | "error" = "none";
    if (findings.length > 0) {
      // Error if contains code blocks or shell commands
      if (types.has("code_block") || types.has("shell_command") || types.has("diff_patch")) {
        severity = "error";
      } else if (types.has("implementation_prose") || types.has("test_implementation")) {
        severity = "error";
      } else if (types.has("direct_completion_claim")) {
        severity = "warning";
      }
    }
    
    return {
      detected: types.size > 0,
      types: Array.from(types),
      findings,
      severity,
    };
  }
  
  /**
   * Generate validation error from detection result
   */
  toValidationError(result: DetectionResult): ValidationError | null {
    if (!result.detected) {
      return null;
    }
    
    const typeDescriptions = result.types.map(t => t.replace(/_/g, " ")).join(", ");
    
    return {
      code: "SPECIALIST_CONTENT_DETECTED",
      message: `Orchestrator output contains specialist content: ${typeDescriptions}. ` +
        `Orchestrator should delegate specialist work to child tasks instead of performing it directly.`,
      path: "raw_output",
    };
  }
  
  /**
   * Extract narrative text (non-JSON portions)
   */
  private extractNarrative(rawOutput: string): string {
    // Remove JSON code blocks
    let text = rawOutput
      .replace(/```json\n?/gi, "")
      .replace(/```\n?/gi, "");
    
    // Try to extract text outside JSON object
    // If output is pure JSON, return empty
    try {
      JSON.parse(text);
      return ""; // Pure JSON, no narrative
    } catch {
      // Not pure JSON, extract narrative
      // Remove JSON object content
      text = text.replace(/\{[\s\S]*?"action"\s*:\s*"[^"]*"[\s\S]*?\}/, "");
      return text.trim();
    }
  }
  
  /**
   * Detect code blocks in text
   */
  private detectCodeBlocks(text: string): ContentFinding[] {
    const findings: ContentFinding[] = [];
    
    // Check language-tagged code blocks
    let match;
    const regex = new RegExp(SPECIALIST_PATTERNS.codeBlock.source, "gi");
    while ((match = regex.exec(text)) !== null) {
      if (match[0].length >= this.config.minCodeBlockLength) {
        findings.push({
          type: "code_block",
          match: match[0].substring(0, 200) + (match[0].length > 200 ? "..." : ""),
          length: match[0].length,
        });
      }
    }
    
    // Check generic code blocks (longer than threshold)
    const genericRegex = new RegExp(SPECIALIST_PATTERNS.genericCodeBlock.source, "gi");
    while ((match = genericRegex.exec(text)) !== null) {
      if (match[0].length >= this.config.minCodeBlockLength) {
        // Avoid duplicate with language-tagged
        const isDuplicate = findings.some(f => 
          text.substring(match!.index, match!.index + match![0].length).includes(f.match)
        );
        if (!isDuplicate) {
          findings.push({
            type: "code_block",
            match: match[0].substring(0, 200) + (match[0].length > 200 ? "..." : ""),
            length: match[0].length,
          });
        }
      }
    }
    
    return findings;
  }
  
  /**
   * Detect shell commands
   */
  private detectShellCommands(text: string): ContentFinding[] {
    const findings: ContentFinding[] = [];
    
    let match;
    const regex = new RegExp(SPECIALIST_PATTERNS.shellCommand.source, "gi");
    while ((match = regex.exec(text)) !== null) {
      findings.push({
        type: "shell_command",
        match: match[0],
      });
    }
    
    return findings;
  }
  
  /**
   * Detect diff/patch hunks
   */
  private detectDiffPatches(text: string): ContentFinding[] {
    const findings: ContentFinding[] = [];
    
    let match;
    const regex = new RegExp(SPECIALIST_PATTERNS.diffHunk.source, "gm");
    while ((match = regex.exec(text)) !== null) {
      findings.push({
        type: "diff_patch",
        match: match[0],
      });
    }
    
    return findings;
  }
  
  /**
   * Detect implementation hints
   */
  private detectImplementationHints(text: string): ContentFinding[] {
    const findings: ContentFinding[] = [];
    
    let match;
    const regex = new RegExp(SPECIALIST_PATTERNS.implementationHints.source, "g");
    while ((match = regex.exec(text)) !== null) {
      findings.push({
        type: "implementation_prose",
        match: match[0],
      });
    }
    
    return findings;
  }
  
  /**
   * Detect test implementation patterns
   */
  private detectTestImplementation(text: string): ContentFinding[] {
    const findings: ContentFinding[] = [];
    
    let match;
    const regex = new RegExp(SPECIALIST_PATTERNS.testImplementation.source, "g");
    while ((match = regex.exec(text)) !== null) {
      findings.push({
        type: "test_implementation",
        match: match[0],
      });
    }
    
    return findings;
  }
  
  /**
   * Detect direct completion claims without evidence
   */
  private detectCompletionClaims(text: string): ContentFinding[] {
    const findings: ContentFinding[] = [];
    
    // Patterns that suggest direct completion claims
    const completionPatterns = [
      /\b(implemented|completed|finished|done|resolved|fixed)\s+(?:the\s+)?(?:issue|bug|feature|task|implementation)/gi,
      /\b(Code|Test|Feature)\s+(?:is\s+)?(?:now\s+)?(?:complete|done|working|implemented)/gi,
      /\b(?:I have|I)\s+(?:implemented|completed|finished|written)\s+(?:the\s+)?/gi,
      /\bAll\s+(?:the\s+)?(?:code|tests?|implementation)\s+(?:is|are)\s+(?:in\s+)?(?:place|done|complete)/gi,
    ];
    
    for (const pattern of completionPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        findings.push({
          type: "direct_completion_claim",
          match: match[0],
        });
      }
    }
    
    return findings;
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<DetectionThresholds>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Get current configuration
   */
  getConfig(): DetectionThresholds {
    return { ...this.config };
  }
}

// ============================================================
// Factory Function
// ============================================================

export function createSpecialistContentDetector(
  config?: Partial<DetectionThresholds>
): SpecialistContentDetector {
  return new SpecialistContentDetector(config);
}
