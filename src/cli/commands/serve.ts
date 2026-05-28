import { Command } from 'commander';
import chalk from 'chalk';
import http from 'http';
import { createExpressHandlers } from '../../integrations/express.js';

export function register(program: Command): void {
  program
    .command('serve')
    .description('Start a minimal HTTP API server (POST /ruleprobe/run, GET /ruleprobe/rules)')
    .option('--port <port>', 'Port to listen on', '3099')
    .option('--dir <dir>', 'Target directory to analyze')
    .option('--provider <provider>', 'Provider to use (mock or dry-run)', 'mock')
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      const handlers = createExpressHandlers({ dir: options.dir, provider: options.provider });

      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, `http://localhost:${port}`);
        const body = await readBody(req);

        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'POST' && url.pathname === '/ruleprobe/run') {
          (req as any).body = body;
          await handlers.handleRun(req as any, res as any);
        } else if (req.method === 'GET' && url.pathname === '/ruleprobe/rules') {
          (req as any).query = Object.fromEntries(url.searchParams);
          await handlers.handleRules(req as any, res as any);
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ ok: false, error: 'Not found' }));
        }
      });

      server.listen(port, () => {
        console.log(chalk.green(`RuleProbe HTTP API listening on http://localhost:${port}`));
        console.log(chalk.dim(`  POST /ruleprobe/run   — run compliance check`));
        console.log(chalk.dim(`  GET  /ruleprobe/rules — list extracted rules`));
        console.log(chalk.dim(`  Ctrl+C to stop`));
      });

      process.on('SIGINT', () => {
        server.close(() => process.exit(0));
      });
    });
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}
