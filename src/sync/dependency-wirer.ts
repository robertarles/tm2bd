import type { TaskMasterTask } from '../schemas/taskmaster.js';
import type { BeadsCli } from '../beads/cli.js';
import type { IdMapper } from '../mapping/id-mapper.js';

export async function wireEpicDependencies(
  tasks: TaskMasterTask[],
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<number> {
  let count = 0;
  for (const task of tasks) {
    if (task.dependencies.length === 0) continue;

    const blockedEpicId = mapper.getEpicId(task.id);
    if (!blockedEpicId) throw new Error(`Epic ID not found for task ${task.id}`);

    for (const depId of task.dependencies) {
      const blockingEpicId = mapper.getEpicId(depId);
      if (!blockingEpicId) throw new Error(`Epic ID not found for dependency ${depId}`);
      await cli.addDependency(blockedEpicId, blockingEpicId);
      count++;
    }
  }
  return count;
}

export async function wireSubtaskDependencies(
  tasks: TaskMasterTask[],
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<number> {
  let count = 0;
  for (const task of tasks) {
    if (!task.subtasks) continue;

    for (const subtask of task.subtasks) {
      if (!subtask.dependencies || subtask.dependencies.length === 0) continue;

      const blockedId = mapper.getSubtaskId(task.id, subtask.id);
      if (!blockedId) throw new Error(`Subtask ID not found for ${task.id}.${subtask.id}`);

      for (const depId of subtask.dependencies) {
        const blockingId = mapper.getSubtaskId(task.id, depId);
        if (!blockingId) throw new Error(`Subtask ID not found for dependency ${task.id}.${depId}`);
        await cli.addDependency(blockedId, blockingId);
        count++;
      }
    }
  }
  return count;
}

export async function wireAllDependencies(
  tasks: TaskMasterTask[],
  cli: BeadsCli,
  mapper: IdMapper,
): Promise<{ epicDeps: number; subtaskDeps: number }> {
  const epicDeps = await wireEpicDependencies(tasks, cli, mapper);
  const subtaskDeps = await wireSubtaskDependencies(tasks, cli, mapper);
  return { epicDeps, subtaskDeps };
}
