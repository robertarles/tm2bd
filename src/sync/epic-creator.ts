import type { TaskMasterTask } from '../schemas/taskmaster.js';
import type { BeadsCli } from '../beads/cli.js';
import type { IdMapper } from '../mapping/id-mapper.js';

function mapPriority(tmPriority: 'high' | 'medium' | 'low'): number {
  const priorityMap = { high: 0, medium: 1, low: 2 };
  return priorityMap[tmPriority];
}

function formatEpicDescription(task: TaskMasterTask): string {
  const parts = ['## Description', task.description, ''];

  if (task.details) {
    parts.push('## Implementation Details', task.details, '');
  }

  if (task.testStrategy) {
    parts.push('## Test Strategy', task.testStrategy, '');
  }

  parts.push('## Metadata');
  parts.push(`- Task-Master ID: ${task.id}`);
  if (task.complexity) {
    parts.push(`- Complexity: ${task.complexity}/10`);
  }
  parts.push(`- Original Status: ${task.status}`);

  return parts.join('\n');
}

export async function createEpic(
  task: TaskMasterTask,
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<string> {
  const description = formatEpicDescription(task);
  const priority = mapPriority(task.priority);
  const result = await cli.createEpic(task.title, description, priority);
  mapper.addEpic(task.id, result.id);
  return result.id;
}

export async function createEpics(
  tasks: TaskMasterTask[],
  cli: BeadsCli,
  mapper: IdMapper,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < tasks.length; i++) {
    await createEpic(tasks[i], cli, mapper);
    onProgress?.(i + 1, tasks.length);
  }
}

export { formatEpicDescription, mapPriority };
