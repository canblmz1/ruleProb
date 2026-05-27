export type LiveEventType = 'file_write' | 'file_delete' | 'command_exec' | 'scenario_start' | 'scenario_end';

export interface LiveEvent {
  type: LiveEventType;
  scenarioId: string;
  scenarioTitle: string;
  payload: string;       // e.g., file path, command string, status
  timestamp: number;
}

export class EventBus {
  private handlers: Array<(event: LiveEvent) => void> = [];

  on(handler: (event: LiveEvent) => void): void {
    this.handlers.push(handler);
  }

  emit(event: LiveEvent): void {
    for (const h of this.handlers) h(event);
  }
}

export const globalEventBus = new EventBus();
