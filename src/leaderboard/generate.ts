import fs from 'fs-extra';
import path from 'path';

export interface LeaderboardEntry {
  repo: string;
  url: string;
  instructionFile: string;
  ruleCount: number;
  categories: string[];
  extractionScore: number; // % of expected mustContain rules found
  badge: string;           // green / yellow / red
  lastUpdated: string;     // ISO date
}

export interface LeaderboardReport {
  generatedAt: string;
  entries: LeaderboardEntry[];
}

function scoreBadge(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

export async function generateLeaderboard(
  corpusPath: string,
  workspaceRoot: string
): Promise<LeaderboardReport> {
  const corpus = await fs.readJson(corpusPath);
  const { extractRules } = await import('../rules/extract.js');

  const entries: LeaderboardEntry[] = [];

  for (const repo of corpus.repos) {
    const fixturePath = path.resolve(workspaceRoot, repo.fixture);
    if (!(await fs.pathExists(fixturePath))) continue;

    const content = await fs.readFile(fixturePath, 'utf-8');
    const rules = extractRules([{ path: fixturePath, content }]);

    const categories = [...new Set(rules.map((r: { category: string }) => r.category))];

    // Score = fraction of mustContain rules matched
    const mustContain: { category: string; textIncludes?: string; commandIncludes?: string; pattern?: string }[] =
      repo.expected?.mustContain ?? [];

    let matched = 0;
    for (const mc of mustContain) {
      const found = rules.some((r: { category: string; text?: string; command?: string; pattern?: string }) => {
        if (r.category !== mc.category) return false;
        if (mc.textIncludes && !JSON.stringify(r).toLowerCase().includes(mc.textIncludes.toLowerCase())) return false;
        if (mc.commandIncludes && !JSON.stringify(r).toLowerCase().includes(mc.commandIncludes.toLowerCase())) return false;
        if (mc.pattern && !JSON.stringify(r).toLowerCase().includes(mc.pattern.toLowerCase())) return false;
        return true;
      });
      if (found) matched++;
    }

    const extractionScore = mustContain.length > 0 ? Math.round((matched / mustContain.length) * 100) : 100;

    entries.push({
      repo: repo.name,
      url: repo.url,
      instructionFile: repo.instructionFiles[0] ?? 'unknown',
      ruleCount: rules.length,
      categories: categories as string[],
      extractionScore,
      badge: scoreBadge(extractionScore),
      lastUpdated: new Date().toISOString().slice(0, 10),
    });
  }

  // Sort by extractionScore desc, then ruleCount desc
  entries.sort((a, b) => b.extractionScore - a.extractionScore || b.ruleCount - a.ruleCount);

  return { generatedAt: new Date().toISOString(), entries };
}

export function formatLeaderboardMarkdown(report: LeaderboardReport): string {
  const badgeEmoji: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴' };
  const lines: string[] = [
    '# RuleProbe OSS Leaderboard',
    '',
    `_Generated: ${report.generatedAt.slice(0, 10)}_`,
    '',
    'Extraction quality across popular AI instruction files.',
    'Score = % of expected rules successfully extracted by the deterministic extractor.',
    '',
    '| Repo | File | Rules | Categories | Score |',
    '|------|------|------:|------------|------:|',
  ];

  for (const e of report.entries) {
    const badge = badgeEmoji[e.badge] ?? '';
    const repoLink = e.url !== 'fixture-only' ? `[${e.repo}](${e.url})` : e.repo;
    lines.push(
      `| ${repoLink} | \`${e.instructionFile}\` | ${e.ruleCount} | ${e.categories.join(', ')} | ${badge} ${e.extractionScore}% |`
    );
  }

  lines.push('', '> Run `ruleprobe leaderboard` to regenerate with your local fixtures.', '');
  return lines.join('\n');
}
