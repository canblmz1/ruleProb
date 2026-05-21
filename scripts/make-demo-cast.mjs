/**
 * Generates docs/demo.cast (asciinema v2 format) by running real CLI commands
 * against examples/strict, then produces docs/demo.svg via svg-term-cli.
 *
 * Usage:
 *   node scripts/make-demo-cast.mjs
 *
 * Requires: pnpm build was run first.
 */
import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { stripVTControlCharacters } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const WIDTH = 110;
const HEIGHT = 36;

function run(args, cwd = root) {
  const result = spawnSync('node', ['dist/cli/index.js', ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, FORCE_COLOR: '1' },
    maxBuffer: 1024 * 1024
  });
  return (result.stdout ?? '') + (result.stderr ?? '');
}

function buildCast(commands) {
  const header = JSON.stringify({
    version: 2,
    width: WIDTH,
    height: HEIGHT,
    timestamp: Math.floor(Date.now() / 1000),
    title: 'RuleProbe demo — run examples/strict --demo',
    env: { TERM: 'xterm-256color', SHELL: '/bin/bash' }
  });

  const events = [header];
  let t = 0.3;

  for (const { prompt, args, delay = 0.05 } of commands) {
    // Print the prompt line
    events.push(JSON.stringify([t, 'o', `\u001b[1;32m$ \u001b[0m${prompt}\r\n`]));
    t += 0.4;

    const output = run(args);
    const lines = output.split('\n');
    for (const line of lines) {
      events.push(JSON.stringify([t, 'o', line + '\r\n']));
      t += delay;
    }
    t += 1.2; // pause after command
  }

  // trailing pause
  events.push(JSON.stringify([t + 2, 'o', '']));

  return events.join('\n');
}

// ----- Main -----
mkdirSync(join(root, 'docs'), { recursive: true });

const castContent = buildCast([
  {
    prompt: 'ruleprobe list-rules examples/strict',
    args: ['list-rules', 'examples/strict'],
    delay: 0.03
  },
  {
    prompt: 'ruleprobe run examples/strict --demo --fail-below 0',
    args: ['run', 'examples/strict', '--demo', '--fail-below', '0'],
    delay: 0.07
  }
]);

const castPath = join(root, 'docs', 'demo.cast');
writeFileSync(castPath, castContent, 'utf-8');
console.log(`Cast written: ${castPath}`);

// Generate SVG via svg-term-cli
const svgPath = join(root, 'docs', 'demo.svg');
const svg = spawnSync('svg-term', [
  '--in', castPath,
  '--out', svgPath,
  '--width', String(WIDTH),
  '--height', String(HEIGHT),
  '--window',
  '--no-cursor'
], { cwd: root, encoding: 'utf-8', shell: true });

if (svg.error) {
  console.error('svg-term failed:', svg.error.message);
  process.exit(1);
}
if (svg.status !== 0) {
  console.error('svg-term failed with status', svg.status);
  console.error('stderr:', svg.stderr);
  console.error('stdout:', svg.stdout);
  process.exit(1);
}
console.log(`SVG written: ${svgPath}`);
