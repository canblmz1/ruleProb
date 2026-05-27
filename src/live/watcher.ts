import chokidar from 'chokidar';
import { globalEventBus } from './eventBus.js';

export function watchSandbox(sandboxDir: string, scenarioId: string, scenarioTitle: string): () => void {
  const watcher = chokidar.watch(sandboxDir, {
    ignoreInitial: true,
    depth: 5,
    ignored: /node_modules/
  });

  watcher.on('add', (filePath) => {
    globalEventBus.emit({
      type: 'file_write',
      scenarioId,
      scenarioTitle,
      payload: filePath.replace(sandboxDir, '.'),
      timestamp: Date.now()
    });
  });

  watcher.on('change', (filePath) => {
    globalEventBus.emit({
      type: 'file_write',
      scenarioId,
      scenarioTitle,
      payload: filePath.replace(sandboxDir, '.'),
      timestamp: Date.now()
    });
  });

  watcher.on('unlink', (filePath) => {
    globalEventBus.emit({
      type: 'file_delete',
      scenarioId,
      scenarioTitle,
      payload: filePath.replace(sandboxDir, '.'),
      timestamp: Date.now()
    });
  });

  return () => watcher.close();
}
