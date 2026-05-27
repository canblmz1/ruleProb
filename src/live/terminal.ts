import chalk from 'chalk';
import { globalEventBus, LiveEvent } from './eventBus.js';

export function startLiveReporter(): void {
  if (!process.stdout.isTTY) return;  // suppress when piped
  globalEventBus.on((event: LiveEvent) => {
    const time = new Date(event.timestamp).toISOString().slice(11, 19);
    const prefix = chalk.dim(`[${time}]`);

    switch (event.type) {
      case 'scenario_start':
        console.log(`\n${prefix} ${chalk.cyan('▶')} ${event.scenarioTitle}`);
        break;
      case 'file_write':
        console.log(`${prefix} ${chalk.green('✎')} ${event.payload}`);
        break;
      case 'file_delete':
        console.log(`${prefix} ${chalk.red('✗')} ${event.payload}`);
        break;
      case 'command_exec':
        console.log(`${prefix} ${chalk.yellow('$')} ${event.payload}`);
        break;
      case 'scenario_end':
        console.log(`${prefix} ${chalk.dim('◼')} done`);
        break;
    }
  });
}
