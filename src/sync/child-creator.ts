import type { TaskMasterTask, TaskMasterSubtask } from '../schemas/taskmaster.js';
import type { BeadsCli } from '../beads/cli.js';
import type { IdMapper } from '../mapping/id-mapper.js';

function formatChildDescription(subtask: TaskMasterSubtask): string {
  const parts = [subtask.description];

  if (subtask.details) {
    parts.push('', '## Implementation Details', subtask.details);
  }

  return parts.join('\n');
}

export async function createChildren(
  task: TaskMasterTask,
  epicId: string,
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<void> {
  if (!task.subtasks || task.subtasks.length === 0) return;

  const sortedSubtasks = [...task.subtasks].sort((a, b) => a.id - b.id);

  for (const subtask of sortedSubtasks) {
    const description = formatChildDescription(subtask);
    const result = await cli.createChild(epicId, subtask.title, description);
    mapper.addSubtask(task.id, subtask.id, result.id);
  }
}

export async function createAllChildren(
  tasks: TaskMasterTask[],
  cli: BeadsCli,
  mapper: IdMapper,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  let processed = 0;
  const totalSubtasks = tasks.reduce((sum, t) => sum + (t.subtasks?.length ?? 0), 0);

  for (const task of tasks) {
    const epicId = mapper.getEpicId(task.id);
    if (!epicId) throw new Error(`Epic ID not found for task ${task.id}`);

    await createChildren(task, epicId, cli, mapper);

    processed += task.subtasks?.length ?? 0;
    onProgress?.(processed, totalSubtasks);
  }
}

export { formatChildDescription };
