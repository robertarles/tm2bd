import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  TaskMasterTaskSchema,
  parseTasksJson,
  validateDependencyIds,
  validateCircularDependencies,
} from './taskmaster.js';

const validTask = {
  id: 1,
  title: 'Test task',
  description: 'A test task',
  status: 'pending',
  priority: 'high',
  dependencies: [],
};

describe('TaskMasterTaskSchema', () => {
  it('validates a valid task', () => {
    const result = TaskMasterTaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
  });

  it('coerces string IDs to numbers', () => {
    const result = TaskMasterTaskSchema.parse({ ...validTask, id: '5' });
    expect(result.id).toBe(5);
  });

  it('coerces string dependency IDs to numbers', () => {
    const result = TaskMasterTaskSchema.parse({ ...validTask, dependencies: ['1', '2'] });
    expect(result.dependencies).toEqual([1, 2]);
  });

  it('rejects invalid status', () => {
    const result = TaskMasterTaskSchema.safeParse({ ...validTask, status: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid priority', () => {
    const result = TaskMasterTaskSchema.safeParse({ ...validTask, priority: 'urgent' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = TaskMasterTaskSchema.safeParse({ id: 1 });
    expect(result.success).toBe(false);
  });

  it('allows optional fields to be omitted', () => {
    const result = TaskMasterTaskSchema.safeParse(validTask);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subtasks).toBeUndefined();
      expect(result.data.details).toBeUndefined();
      expect(result.data.complexity).toBeUndefined();
    }
  });

  it('rejects complexity outside 1-10', () => {
    expect(TaskMasterTaskSchema.safeParse({ ...validTask, complexity: 0 }).success).toBe(false);
    expect(TaskMasterTaskSchema.safeParse({ ...validTask, complexity: 11 }).success).toBe(false);
    expect(TaskMasterTaskSchema.safeParse({ ...validTask, complexity: 5 }).success).toBe(true);
  });
});

describe('parseTasksJson', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tm2bd-test-'));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('parses a valid tasks.json', async () => {
    const file = path.join(tmpDir, 'valid.json');
    await fs.writeFile(file, JSON.stringify({ tasks: [validTask] }));
    const project = await parseTasksJson(file);
    expect(project.tasks).toHaveLength(1);
    expect(project.tasks[0].title).toBe('Test task');
  });

  it('handles tag-wrapped format', async () => {
    const file = path.join(tmpDir, 'tagged.json');
    await fs.writeFile(file, JSON.stringify({ master: { tasks: [validTask] } }));
    const project = await parseTasksJson(file);
    expect(project.tasks).toHaveLength(1);
  });

  it('throws for non-existent file', async () => {
    await expect(parseTasksJson('/nonexistent/tasks.json')).rejects.toThrow('not found');
  });

  it('throws for malformed JSON', async () => {
    const file = path.join(tmpDir, 'bad.json');
    await fs.writeFile(file, '{ invalid json }');
    await expect(parseTasksJson(file)).rejects.toThrow('Invalid JSON');
  });

  it('throws for missing required fields', async () => {
    const file = path.join(tmpDir, 'missing.json');
    await fs.writeFile(file, JSON.stringify({ tasks: [{ id: 1 }] }));
    await expect(parseTasksJson(file)).rejects.toThrow('Validation errors');
  });

  it('parses empty tasks array', async () => {
    const file = path.join(tmpDir, 'empty.json');
    await fs.writeFile(file, JSON.stringify({ tasks: [] }));
    const project = await parseTasksJson(file);
    expect(project.tasks).toHaveLength(0);
  });
});

describe('validateDependencyIds', () => {
  it('passes with no dependencies', () => {
    const tasks = [
      { ...validTask, id: 1 },
      { ...validTask, id: 2 },
    ] as any;
    expect(validateDependencyIds(tasks).valid).toBe(true);
  });

  it('passes with valid dependencies', () => {
    const tasks = [
      { ...validTask, id: 1, dependencies: [] },
      { ...validTask, id: 2, dependencies: [1] },
    ] as any;
    expect(validateDependencyIds(tasks).valid).toBe(true);
  });

  it('fails with non-existent dependency', () => {
    const tasks = [
      { ...validTask, id: 1, dependencies: [99] },
    ] as any;
    const result = validateDependencyIds(tasks);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('99');
  });
});

describe('validateCircularDependencies', () => {
  it('passes with no dependencies', () => {
    const tasks = [
      { ...validTask, id: 1, dependencies: [] },
      { ...validTask, id: 2, dependencies: [] },
    ] as any;
    expect(validateCircularDependencies(tasks).valid).toBe(true);
  });

  it('passes with linear chain', () => {
    const tasks = [
      { ...validTask, id: 1, dependencies: [] },
      { ...validTask, id: 2, dependencies: [1] },
      { ...validTask, id: 3, dependencies: [2] },
    ] as any;
    expect(validateCircularDependencies(tasks).valid).toBe(true);
  });

  it('passes with diamond dependency', () => {
    const tasks = [
      { ...validTask, id: 1, dependencies: [] },
      { ...validTask, id: 2, dependencies: [1] },
      { ...validTask, id: 3, dependencies: [1] },
      { ...validTask, id: 4, dependencies: [2, 3] },
    ] as any;
    expect(validateCircularDependencies(tasks).valid).toBe(true);
  });

  it('detects circular dependency', () => {
    const tasks = [
      { ...validTask, id: 1, dependencies: [3] },
      { ...validTask, id: 2, dependencies: [1] },
      { ...validTask, id: 3, dependencies: [2] },
    ] as any;
    const result = validateCircularDependencies(tasks);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Circular');
  });

  it('detects self-referential dependency', () => {
    const tasks = [
      { ...validTask, id: 1, dependencies: [1] },
    ] as any;
    const result = validateCircularDependencies(tasks);
    expect(result.valid).toBe(false);
  });
});