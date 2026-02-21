import fs from 'fs/promises';

export interface SubtaskMapping {
  tmId: number;
  beadsId: string;
}

export interface TaskMapping {
  tmId: number;
  beadsId: string;
  subtasks: SubtaskMapping[];
}

export interface MappingFile {
  version: string;
  generatedAt: string;
  tasks: TaskMapping[];
}

export class IdMapper {
  private tasks: TaskMapping[] = [];

  addEpic(tmId: number, beadsId: string): void {
    this.tasks.push({ tmId, beadsId, subtasks: [] });
  }

  addSubtask(taskTmId: number, subtaskTmId: number, beadsId: string): void {
    const task = this.tasks.find((t) => t.tmId === taskTmId);
    if (!task) throw new Error(`Task ${taskTmId} not found in mapping`);
    task.subtasks.push({ tmId: subtaskTmId, beadsId });
  }

  getEpicId(tmId: number): string | undefined {
    return this.tasks.find((t) => t.tmId === tmId)?.beadsId;
  }

  getSubtaskId(taskTmId: number, subtaskTmId: number): string | undefined {
    const task = this.tasks.find((t) => t.tmId === taskTmId);
    return task?.subtasks.find((s) => s.tmId === subtaskTmId)?.beadsId;
  }

  getStats() {
    const epicCount = this.tasks.length;
    const childCount = this.tasks.reduce((sum, t) => sum + t.subtasks.length, 0);
    return { epicCount, childCount };
  }

  async save(filePath: string): Promise<void> {
    const data: MappingFile = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      tasks: this.tasks,
    };
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  static async load(filePath: string): Promise<IdMapper> {
    const content = await fs.readFile(filePath, 'utf-8');
    const data: MappingFile = JSON.parse(content);
    const mapper = new IdMapper();
    mapper.tasks = data.tasks;
    return mapper;
  }

  static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
