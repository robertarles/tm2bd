import type { TaskMasterTask } from '../schemas/taskmaster.js';
import type { BeadsCli } from '../beads/cli.js';
import type { IdMapper } from '../mapping/id-mapper.js';

function mapStatus(tmStatus: string): { status?: string; close: boolean } {
  const statusMap: Record<string, { status?: string; close: boolean }> = {
    pending: { close: false },
    'in-progress': { status: 'in_progress', close: false },
    done: { close: true },
    deferred: { status: 'deferred', close: false },
    cancelled: { close: true },
    blocked: { status: 'blocked', close: false },
  };
  return statusMap[tmStatus] ?? { close: false };
}

export async function syncEpicStatus(
  task: TaskMasterTask,
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<void> {
  const epicId = mapper.getEpicId(task.id);
  if (!epicId) throw new Error(`Epic ID not found for task ${task.id}`);

  const { status, close } = mapStatus(task.status);

  if (close) {
    await cli.close(epicId);
  } else if (status) {
    await cli.updateStatus(epicId, status);
  }
}

export async function syncSubtaskStatus(
  task: TaskMasterTask,
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<void> {
  if (!task.subtasks) return;

  for (const subtask of task.subtasks) {
    const subtaskId = mapper.getSubtaskId(task.id, subtask.id);
    if (!subtaskId) throw new Error(`Subtask ID not found for ${task.id}.${subtask.id}`);

    const { status, close } = mapStatus(subtask.status);

    if (close) {
      await cli.close(subtaskId);
    } else if (status) {
      await cli.updateStatus(subtaskId, status);
    }
  }
}

export async function syncAllStatuses(
  tasks: TaskMasterTask[],
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<void> {
  for (const task of tasks) {
    await syncEpicStatus(task, cli, mapper);
    await syncSubtaskStatus(task, cli, mapper);
  }
}

export { mapStatus };
