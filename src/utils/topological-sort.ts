import type { TaskMasterTask } from '../schemas/taskmaster.js';

export interface SortedTask {
  task: TaskMasterTask;
  tier: number;
}

export function topologicalSort(tasks: TaskMasterTask[]): SortedTask[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<number>();
  const visiting = new Set<number>();
  const sorted: SortedTask[] = [];
  const tierMap = new Map<number, number>();

  function visit(taskId: number): number {
    if (visited.has(taskId)) return tierMap.get(taskId)!;
    if (visiting.has(taskId)) {
      throw new Error(`Circular dependency detected involving task ${taskId}`);
    }

    const task = taskMap.get(taskId);
    if (!task) throw new Error(`Task ${taskId} referenced but not found`);

    visiting.add(taskId);

    let maxDepTier = -1;
    for (const depId of task.dependencies) {
      const depTier = visit(depId);
      maxDepTier = Math.max(maxDepTier, depTier);
    }

    const tier = maxDepTier + 1;
    tierMap.set(taskId, tier);
    visiting.delete(taskId);
    visited.add(taskId);
    sorted.push({ task, tier });

    return tier;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) visit(task.id);
  }

  return sorted.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.task.id - b.task.id;
  });
}