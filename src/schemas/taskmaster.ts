import { z } from 'zod';
import fs from 'fs/promises';

const TaskMasterStatusSchema = z.enum(['pending', 'in-progress', 'done', 'deferred', 'cancelled', 'blocked']);
const TaskMasterPrioritySchema = z.enum(['high', 'medium', 'low']);

export const TaskMasterSubtaskSchema = z.object({
  id: z.coerce.number(),
  title: z.string(),
  description: z.string(),
  status: TaskMasterStatusSchema,
  dependencies: z.array(z.coerce.number()).optional(),
  details: z.string().optional(),
});

export const TaskMasterTaskSchema = z.object({
  id: z.coerce.number(),
  title: z.string(),
  description: z.string(),
  status: TaskMasterStatusSchema,
  priority: TaskMasterPrioritySchema,
  dependencies: z.array(z.coerce.number()),
  complexity: z.number().min(1).max(10).optional(),
  subtasks: z.array(TaskMasterSubtaskSchema).optional(),
  details: z.string().optional(),
  testStrategy: z.string().optional(),
});

export const TaskMasterProjectSchema = z.object({
  tasks: z.array(TaskMasterTaskSchema),
});

export type TaskMasterSubtask = z.infer<typeof TaskMasterSubtaskSchema>;
export type TaskMasterTask = z.infer<typeof TaskMasterTaskSchema>;
export type TaskMasterProject = z.infer<typeof TaskMasterProjectSchema>;

/**
 * Parse and validate a tasks.json file.
 * Handles both raw { tasks: [...] } and tag-wrapped { "tag": { tasks: [...] } } formats.
 */
export async function parseTasksJson(filePath: string): Promise<TaskMasterProject> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`tasks.json not found: ${filePath}`);
    }
    throw new Error(`Failed to read tasks.json: ${(err as Error).message}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Invalid JSON in ${filePath}`);
  }

  // Handle tag-wrapped format: { "master": { "tasks": [...] } }
  const unwrapped = unwrapTaggedFormat(raw);

  const result = TaskMasterProjectSchema.safeParse(unwrapped);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Validation errors in ${filePath}:\n${issues}`);
  }

  return result.data;
}

function unwrapTaggedFormat(raw: unknown): unknown {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    !Array.isArray(raw)
  ) {
    const obj = raw as Record<string, unknown>;
    // If it has a "tasks" key directly, use as-is
    if ('tasks' in obj) return obj;
    // Otherwise look for a single tag key containing { tasks: [...] }
    const keys = Object.keys(obj);
    if (keys.length === 1) {
      const inner = obj[keys[0]];
      if (typeof inner === 'object' && inner !== null && 'tasks' in inner) {
        return inner;
      }
    }
  }
  return raw;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateDependencyIds(tasks: TaskMasterTask[]): ValidationResult {
  const validIds = new Set(tasks.map((t) => t.id));
  const errors: string[] = [];

  for (const task of tasks) {
    for (const depId of task.dependencies) {
      if (!validIds.has(depId)) {
        errors.push(`Task ${task.id} depends on non-existent task ${depId}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateCircularDependencies(tasks: TaskMasterTask[]): ValidationResult {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<number>();
  const visiting = new Set<number>();
  const errors: string[] = [];

  function visit(taskId: number, path: number[]): boolean {
    if (visited.has(taskId)) return false;
    if (visiting.has(taskId)) {
      const cycleStart = path.indexOf(taskId);
      const cycle = path.slice(cycleStart).concat(taskId);
      errors.push(`Circular dependency: ${cycle.join(' → ')}`);
      return true;
    }

    visiting.add(taskId);
    const task = taskMap.get(taskId);
    if (task) {
      for (const depId of task.dependencies) {
        visit(depId, [...path, taskId]);
      }
    }
    visiting.delete(taskId);
    visited.add(taskId);
    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      visit(task.id, []);
    }
  }

  return { valid: errors.length === 0, errors };
}