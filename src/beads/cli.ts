import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';

export interface BeadsCreateResult {
  id: string;
  title: string;
}

export class BeadsCli {
  constructor(
    private projectPath: string,
    private verbose: boolean = false,
  ) {}

  private async exec(args: string[]): Promise<string> {
    if (this.verbose) {
      console.log(`[bd] bd ${args.join(' ')}`);
    }
    const result = await execa('bd', args, { cwd: this.projectPath });
    if (this.verbose && result.stdout) {
      console.log(result.stdout);
    }
    return result.stdout;
  }

  async createEpic(
    title: string,
    description: string,
    priority: number,
  ): Promise<BeadsCreateResult> {
    const args = ['create', title, '-t', 'epic', '-p', priority.toString(), '--json'];
    if (description) {
      args.push('-d', description);
    }
    const output = await this.exec(args);
    return this.parseCreateOutput(output);
  }

  async createChild(
    parentId: string,
    title: string,
    description: string,
  ): Promise<BeadsCreateResult> {
    const args = ['create', title, '--parent', parentId, '--json'];
    if (description) {
      args.push('-d', description);
    }
    const output = await this.exec(args);
    return this.parseCreateOutput(output);
  }

  async addDependency(blockedId: string, blockingId: string): Promise<void> {
    await this.exec(['dep', 'add', blockedId, blockingId]);
  }

  async updateStatus(issueId: string, status: string): Promise<void> {
    await this.exec(['update', issueId, '-s', status]);
  }

  async close(issueId: string): Promise<void> {
    await this.exec(['close', issueId]);
  }

  async addLabel(issueId: string, label: string): Promise<void> {
    await this.exec(['update', issueId, '--add-label', label]);
  }

  async checkInit(): Promise<boolean> {
    try {
      await fs.access(path.join(this.projectPath, '.beads'));
      return true;
    } catch {
      return false;
    }
  }

  private parseCreateOutput(output: string): BeadsCreateResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      throw new Error(`Failed to parse bd output as JSON: ${output}`);
    }

    const obj = parsed as Record<string, unknown>;
    if (typeof obj.id !== 'string' || !obj.id) {
      throw new Error(`Unexpected bd create output: missing id field`);
    }

    return {
      id: obj.id as string,
      title: (obj.title as string) ?? '',
    };
  }
}
