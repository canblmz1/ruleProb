import fs from 'fs-extra';
import chalk from 'chalk';
import path from 'path';

export interface BenchmarkSummary {
  tested: number;
  passed: number;
  failed: number;
  coverage: number;
}

export async function runBenchmark(options: any): Promise<BenchmarkSummary> {
  console.log(chalk.blue('RuleProbe Benchmark\n'));

  const baseDir = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const corpusPath = path.resolve(baseDir, 'benchmarks/corpus.json');
  if (!await fs.pathExists(corpusPath)) {
    throw new Error(`Corpus not found at ${corpusPath}`);
  }

  const corpus = await fs.readJson(corpusPath);
  let totalTested = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const repo of corpus.repos) {
    totalTested++;
    console.log(chalk.yellow(repo.name));
    console.log(`- Fixture: ${repo.fixture}`);
    const fixturePath = path.resolve(baseDir, repo.fixture);

    let content = '';
    if (options.fixturesOnly) {
      if (await fs.pathExists(fixturePath)) {
        content = await fs.readFile(fixturePath, 'utf-8');
      } else {
        console.log(chalk.red(`Fixture not found: ${repo.fixture}`));
        console.log(`- Must-contain checks: ${chalk.red('FAIL')}\n`);
        totalFailed++;
        continue;
      }
    } else {
      content = await fs.readFile(fixturePath, 'utf-8');
    }

    const { routeExtraction } = await import('../extractors/merge.js');
    const rules = await routeExtraction([{ path: fixturePath, content }], options);

    console.log(`- Rules extracted: ${rules.length}`);
    console.log(`- Expected minimum: ${repo.expected.minRules}`);

    const categoriesFound = new Set(rules.map((rule: any) => rule.category));
    console.log(`- Categories found:`);
    for (const category of categoriesFound) {
      console.log(`  - ${category}`);
    }

    const categoriesCheck = (repo.expected.categories || []).every((category: string) => categoriesFound.has(category));
    if (!categoriesCheck) {
      const missingCategories = (repo.expected.categories || []).filter((category: string) => !categoriesFound.has(category));
      console.log(`- Missing categories: ${missingCategories.join(', ')}`);
    }

    let mustContainCheck = true;
    for (const check of repo.expected.mustContain) {
      const matchingRules = rules.filter((rule: any) => rule.category === check.category);
      let passesCheck = false;

      for (const rule of matchingRules) {
        if (check.textIncludes && rule.text.toLowerCase().includes(check.textIncludes.toLowerCase())) passesCheck = true;
        if (check.commandIncludes) {
          const hasAssertion = rule.assertions.some((assertion: any) =>
            assertion.commandIncludes && assertion.commandIncludes.toLowerCase().includes(check.commandIncludes.toLowerCase())
          );
          if (hasAssertion) passesCheck = true;
        }
        if (check.pattern && rule.assertions.some((assertion: any) => assertion.pattern === check.pattern)) passesCheck = true;
      }

      if (!passesCheck && check.commandIncludes) {
        for (const rule of matchingRules) {
          if (rule.text.toLowerCase().includes(check.commandIncludes.toLowerCase())) passesCheck = true;
        }
      }

      if (!passesCheck) {
        mustContainCheck = false;
        console.log(`- mustContain miss: category=${check.category} ${check.commandIncludes || check.pattern || check.textIncludes || ''}`);
        break;
      }
    }

    let mustNotContainCheck = true;
    const mustNotContainViolations: string[] = [];
    const noiseGates: any[] = repo.expected.mustNotContain || [];
    for (const gate of noiseGates) {
      for (const rule of rules) {
        if (gate.category && rule.category !== gate.category) continue;
        if (gate.commandIncludes) {
          const hasCommand = rule.assertions.some((assertion: any) =>
            assertion.commandIncludes && assertion.commandIncludes.toLowerCase().includes(String(gate.commandIncludes).toLowerCase())
          );
          if (hasCommand) {
            mustNotContainCheck = false;
            mustNotContainViolations.push(`forbidden command-noise rule still extracted: ${gate.commandIncludes}`);
          }
        }
        if (gate.pattern) {
          const hasPattern = rule.assertions.some((assertion: any) => assertion.pattern === gate.pattern);
          if (hasPattern) {
            mustNotContainCheck = false;
            mustNotContainViolations.push(`forbidden pattern-noise rule still extracted: ${gate.pattern}`);
          }
        }
        if (gate.textIncludes && rule.text.toLowerCase().includes(String(gate.textIncludes).toLowerCase())) {
          mustNotContainCheck = false;
          mustNotContainViolations.push(`forbidden text-noise rule still extracted: ${gate.textIncludes}`);
        }
      }
    }
    if (!mustNotContainCheck) {
      console.log(`- mustNotContain violations:`);
      for (const violation of mustNotContainViolations) {
        console.log(`  - ${violation}`);
      }
    }

    const passed = categoriesCheck && mustContainCheck && mustNotContainCheck && rules.length >= repo.expected.minRules;
    if (passed) {
      console.log(`- Must-contain checks: ${chalk.green('PASS')}\n`);
      totalPassed++;
    } else {
      console.log(`- Must-contain checks: ${chalk.red('FAIL')}\n`);
      totalFailed++;
    }
  }

  const coverage = Math.round((totalPassed / (totalTested || 1)) * 100);
  console.log(`Overall:`);
  console.log(`- Repos tested: ${totalTested}`);
  console.log(`- Passed: ${totalPassed}`);
  console.log(`- Failed: ${totalFailed}`);
  console.log(`- Extraction coverage: ${coverage}%`);

  const reportData: BenchmarkSummary = {
    tested: totalTested,
    passed: totalPassed,
    failed: totalFailed,
    coverage
  };

  const reportDir = path.resolve(baseDir, '.ruleprobe');
  await fs.ensureDir(reportDir);
  await fs.writeJson(path.join(reportDir, 'benchmark.json'), reportData, { spaces: 2 });
  await fs.writeFile(path.join(reportDir, 'benchmark.md'), `# Benchmark Coverage\nCoverage: ${coverage}%\nrepos: ${totalTested}\nfailed: ${totalFailed}\n`);
  await fs.writeFile(path.join(reportDir, 'benchmark.html'), `<h1>Coverage ${coverage}%</h1><p>Repos: ${totalTested}</p><p>Failed: ${totalFailed}</p>`);

  if (totalFailed > 0) {
    throw new Error(`Benchmark failed: ${totalFailed} repo(s) failed.`);
  }

  return reportData;
}
