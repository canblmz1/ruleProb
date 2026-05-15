import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import chalk from 'chalk';
import { getEnv } from '../config/env.js';

export interface DoctorCheck {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detail: string;
}

export async function runDoctor(options: { cwd?: string; json?: boolean } = {}): Promise<{ checks: DoctorCheck[]; criticalFailures: number; summary: string }> {
  const checks: DoctorCheck[] = [];
  const cwd = options.cwd || process.cwd();

  checks.push(checkNodeVersion());
  checks.push(await checkBinaryAvailable('pnpm', '--version'));
  checks.push(await checkBinaryAvailable('git', '--version'));
  checks.push(await checkBinaryAvailable('claude', '--version', { warnIfMissing: true }));

  checks.push(await checkDistArtifact(cwd));
  checks.push(await checkShebang(cwd));

  for (const key of ['GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'OPENCODE_GO_API_KEY', 'OPENCODE_GO_MODEL']) {
    checks.push(checkEnvVar(key));
  }

  checks.push(await checkRuleprobeWriteable(cwd));

  const criticalFailures = checks.filter(check => check.status === 'FAIL').length;
  const summary = criticalFailures > 0
    ? `${criticalFailures} critical issue(s) found`
    : 'no critical issues';

  if (!options.json) {
    for (const check of checks) {
      const tag = check.status === 'PASS' ? chalk.green('PASS')
        : check.status === 'WARN' ? chalk.yellow('WARN')
        : chalk.red('FAIL');
      console.log(`${tag}  ${check.name}: ${check.detail}`);
    }

    if (criticalFailures > 0) {
      console.log(chalk.red(`\nDoctor found ${criticalFailures} critical issue(s).`));
    } else {
      console.log(chalk.green('\nDoctor: no critical issues detected.'));
    }
  }

  return { checks, criticalFailures, summary };
}

function checkNodeVersion(): DoctorCheck {
  const major = Number(process.versions.node.split('.')[0] || 0);
  if (major >= 18) {
    return { name: 'Node version', status: 'PASS', detail: `node ${process.versions.node}` };
  }
  return { name: 'Node version', status: 'FAIL', detail: `node ${process.versions.node} < 18 (RuleProbe requires Node >= 18)` };
}

async function checkBinaryAvailable(bin: string, ...args: string[] | [string, { warnIfMissing?: boolean }]): Promise<DoctorCheck> {
  let warnIfMissing = false;
  let realArgs: string[] = args as string[];
  if (args.length > 0 && typeof args[args.length - 1] === 'object') {
    const opts = args[args.length - 1] as { warnIfMissing?: boolean };
    warnIfMissing = !!opts.warnIfMissing;
    realArgs = args.slice(0, -1) as string[];
  }
  try {
    const child = await execa(bin, realArgs, { reject: false, timeout: 4000 });
    if (child.exitCode === 0) {
      return { name: `${bin} available`, status: 'PASS', detail: child.stdout.split('\n')[0] || `ok` };
    }
    return { name: `${bin} available`, status: warnIfMissing ? 'WARN' : 'FAIL', detail: `exit ${child.exitCode}` };
  } catch (e: any) {
    return { name: `${bin} available`, status: warnIfMissing ? 'WARN' : 'FAIL', detail: e?.message || 'not found on PATH' };
  }
}

async function checkDistArtifact(cwd: string): Promise<DoctorCheck> {
  const distCli = path.join(cwd, 'dist', 'cli', 'index.js');
  if (await fs.pathExists(distCli)) {
    return { name: 'dist/cli/index.js', status: 'PASS', detail: distCli };
  }
  return { name: 'dist/cli/index.js', status: 'WARN', detail: 'Not built yet — run `pnpm build` before publishing or globally installing.' };
}

async function checkShebang(cwd: string): Promise<DoctorCheck> {
  const distCli = path.join(cwd, 'dist', 'cli', 'index.js');
  if (!await fs.pathExists(distCli)) {
    return { name: 'CLI shebang', status: 'WARN', detail: 'dist/cli/index.js not present; cannot verify.' };
  }
  const head = (await fs.readFile(distCli, 'utf-8')).slice(0, 32);
  if (head.startsWith('#!/usr/bin/env node')) {
    return { name: 'CLI shebang', status: 'PASS', detail: '#!/usr/bin/env node present' };
  }
  return { name: 'CLI shebang', status: 'FAIL', detail: `dist/cli/index.js does not start with #!/usr/bin/env node — npm install -g will produce a non-executable bin. (head: ${JSON.stringify(head)})` };
}

function checkEnvVar(name: string): DoctorCheck {
  const present = !!getEnv(name);
  return {
    name: `env ${name}`,
    status: 'WARN',
    detail: present ? 'present (value not displayed)' : 'not set'
  };
}

async function checkRuleprobeWriteable(cwd: string): Promise<DoctorCheck> {
  const dir = path.join(cwd, '.ruleprobe');
  try {
    await fs.ensureDir(dir);
    const probe = path.join(dir, '.doctor-probe');
    await fs.writeFile(probe, 'ok', 'utf-8');
    await fs.remove(probe);
    return { name: '.ruleprobe writeable', status: 'PASS', detail: dir };
  } catch (e: any) {
    return { name: '.ruleprobe writeable', status: 'FAIL', detail: e?.message || 'cannot write to report directory' };
  }
}
