export type RuleCategory =
  | "package_manager"
  | "forbidden_file_change"
  | "required_file_change"
  | "required_command"
  | "forbidden_command"
  | "code_pattern_required"
  | "code_pattern_forbidden"
  | "final_answer_required"
  | "final_answer_not_contains"
  | "commit_message_format"
  | "informational"
  | "unknown";

export type AssertionType = 
  | "package_manager_required"
  | "forbidden_file_change"
  | "required_file_change"
  | "required_command"
  | "forbidden_command"
  | "code_pattern_required"
  | "code_pattern_forbidden"
  | "final_answer_contains"
  | "final_answer_not_contains"
  | "unknown";

export type Assertion = 
  | { type: "package_manager_required"; manager: string; forbiddenManagers?: string[] }
  | { type: "forbidden_file_change"; pattern: string }
  | { type: "required_file_change"; pattern: string }
  | { type: "required_command"; commandIncludes: string }
  | { type: "forbidden_command"; commandIncludes: string }
  | { type: "code_pattern_required"; pattern: string }
  | { type: "code_pattern_forbidden"; pattern: string }
  | { type: "final_answer_contains"; text: string }
  | { type: "final_answer_not_contains"; text: string }
  | { type: "unknown"; value: string };

export interface Rule {
  id: string;
  sourceFile: string;
  lineNumber?: number;
  rawLine?: string;
  text: string;
  category: RuleCategory;
  severity: "low" | "medium" | "high";
  testable: boolean;
  assertions: Assertion[];
}

export interface Scenario {
  id: string;
  ruleId: string;
  title: string;
  prompt: string;
  sandboxFiles: Record<string, string>;
  expectedAssertions: Assertion[];
  ruleText?: string;
  ruleCategory?: RuleCategory;
  sourceFile?: string;
  sourceLine?: number;
  severity?: Rule["severity"];
}

export interface ProviderInput {
  scenario: Scenario;
  sandboxDir: string;
}

export interface ProviderResult {
  finalAnswer: string;
  changedFiles: string[];
  changedFileContents: Record<string, string | null>;
  commands: string[];
  rawOutput: string;
  success: boolean;
}

export interface Provider {
  name: string;
  run(input: ProviderInput): Promise<ProviderResult>;
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  evidence: string;
  skipped?: boolean;
}

export interface EvaluationResult {
  scenario: Scenario;
  providerResult: ProviderResult;
  assertionResults: AssertionResult[];
  status: "PASS" | "PARTIAL" | "FAIL" | "SKIPPED";
  score: number;
  ruleId: string;
  scenarioId: string;
  expected: string;
  actual: string;
  evidence: string;
  severity: string;
  category?: RuleCategory;
  sourceFile?: string;
  sourceLine?: number;
  ruleText?: string;
  /** Machine-readable reason when status is SKIPPED */
  skipReason?: "DRY_RUN" | "NO_ASSERTIONS" | "ALL_ASSERTIONS_SKIPPED" | "UNKNOWN";
}

export interface Config {
  provider: string;
  instructionFiles: string[];
  reportDir: string;
  failBelow: number;
  keepSandbox: boolean;
  format?: string;
  model?: string;
  noExecuteActions?: boolean;
  providerTimeoutMs?: number;
  extractor?: string;
  /** Fail if score dropped more than N points vs last run */
  regressionThreshold?: number;
  /** Print per-file extraction diagnostics */
  debugExtractor?: boolean;
  /** Set to false to disable AI extraction cache (default: true) */
  useExtractionCache?: boolean;
  /** Save current run as baseline, or compare against existing baseline */
  baseline?: boolean;
  /** Exit with code 1 if any scenario regressed vs baseline */
  failOnRegression?: boolean;
}

export interface WriteFileAction {
  type: "write_file";
  path: string;
  content: string;
}

export interface AppendFileAction {
  type: "append_file";
  path: string;
  content: string;
}

export interface DeleteFileAction {
  type: "delete_file";
  path: string;
}

export interface RunCommandAction {
  type: "run_command";
  command: string;
}

export type AgentAction = WriteFileAction | AppendFileAction | DeleteFileAction | RunCommandAction;

export interface ActionPlan {
  actions: AgentAction[];
  finalAnswer: string;
}

export interface ExecutorResult {
  success: boolean;
  changedFiles: string[];
  commands: string[];
  errors: string[];
  evidence: string[];
}

export interface CandidateRule extends Rule {
  reason?: string;
}

export interface ValidationResponse {
  valid: boolean;
  reason?: string;
}
