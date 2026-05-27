import type { RuleCategory } from '../types/index.js';

export interface RepoScanResult {
  packageManager: string | null;
  testRunner: string | null;
  linters: string[];
  frequentDirs: string[];
  hasLockfile: boolean;
}

export interface HistoryInsight {
  failureRate: number;
  trend: 'improving' | 'declining' | 'stable';
  totalRuns: number;
}

export interface RuleSuggestion {
  category: RuleCategory;
  text: string;
  severity: 'low' | 'medium' | 'high';
  reason: string;
}
