import { describe, it, expect } from 'vitest';
import { topologicalSort } from './topological-sort.js';
import type { TaskMasterTask } from '../schemas/taskmaster.js';

function makeTask(id: number, deps: number[] = []): TaskMasterTask {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for task ${id}`,
    status: 'pending',
    priority: 'medium',
    dependencies: deps,
  };
}

describe('topologicalSort', () => {
  it('handles tasks with no dependencies (all tier 0, sorted by ID)', () => {
    const tasks = [makeTask(3), makeTask(1), makeTask(2)];
    const result = topologicalSort(tasks);
    expect(result.map((r) => r.task.id)).toEqual([1, 2, 3]);
    expect(result.every((r) => r.tier === 0)).toBe(true);
  });

  it('sorts a linear chain correctly', () => {
    const tasks = [makeTask(3, [2]), makeTask(2, [1]), makeTask(1)];
    const result = topologicalSort(tasks);
    expect(result.map((r) => r.task.id)).toEqual([1, 2, 3]);
    expect(result.map((r) => r.tier)).toEqual([0, 1, 2]);
  });

  it('handles diamond dependency', () => {
    const tasks = [
      makeTask(4, [2, 3]),
      makeTask(3, [1]),
      makeTask(2, [1]),
      makeTask(1),
    ];
    const result = topologicalSort(tasks);
    expect(result[0].task.id).toBe(1);
    expect(result[0].tier).toBe(0);
    expect(result[1].task.id).toBe(2);
    expect(result[2].task.id).toBe(3);
    expect(result[1].tier).toBe(1);
    expect(result[2].tier).toBe(1);
    expect(result[3].task.id).toBe(4);
    expect(result[3].tier).toBe(2);
  });

  it('throws on circular dependency', () => {
    const tasks = [makeTask(1, [3]), makeTask(2, [1]), makeTask(3, [2])];
    expect(() => topologicalSort(tasks)).toThrow('Circular dependency');
  });

  it('throws on self-referential dependency', () => {
    const tasks = [makeTask(1, [1])];
    expect(() => topologicalSort(tasks)).toThrow('Circular dependency');
  });

  it('throws on missing dependency', () => {
    const tasks = [makeTask(1, [99])];
    expect(() => topologicalSort(tasks)).toThrow('not found');
  });

  it('handles disconnected components', () => {
    const tasks = [makeTask(1), makeTask(2), makeTask(3, [2])];
    const result = topologicalSort(tasks);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.task.id)).toEqual([1, 2, 3]);
  });

  it('produces deterministic output across runs', () => {
    const tasks = [makeTask(5, [1, 2]), makeTask(2), makeTask(1), makeTask(4, [2]), makeTask(3)];
    const run1 = topologicalSort(tasks).map((r) => r.task.id);
    const run2 = topologicalSort(tasks).map((r) => r.task.id);
    const run3 = topologicalSort(tasks).map((r) => r.task.id);
    expect(run1).toEqual(run2);
    expect(run2).toEqual(run3);
  });
});