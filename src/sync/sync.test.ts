import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TaskMasterTask } from '../schemas/taskmaster.js';
import { IdMapper } from '../mapping/id-mapper.js';
import { formatEpicDescription, mapPriority, createEpic, createEpics } from './epic-creator.js';
import { formatChildDescription, createChildren, createAllChildren } from './child-creator.js';
import { wireEpicDependencies, wireSubtaskDependencies, wireAllDependencies } from './dependency-wirer.js';
import { mapStatus, syncAllStatuses } from './status-syncer.js';

function makeTask(overrides: Partial<TaskMasterTask> = {}): TaskMasterTask {
  return {
    id: 1,
    title: 'Test task',
    description: 'A test task',
    status: 'pending',
    priority: 'high',
    dependencies: [],
    ...overrides,
  };
}

function makeMockCli() {
  return {
    createEpic: vi.fn().mockResolvedValue({ id: 'bd-abc', title: 'T' }),
    createChild: vi.fn().mockResolvedValue({ id: 'bd-abc.1', title: 'C' }),
    addDependency: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    addLabel: vi.fn().mockResolvedValue(undefined),
    checkInit: vi.fn().mockResolvedValue(true),
    projectPath: '/project',
    verbose: false,
  };
}

describe('epic-creator', () => {
  describe('formatEpicDescription', () => {
    it('includes all sections when present', () => {
      const task = makeTask({
        description: 'My desc',
        details: 'My details',
        testStrategy: 'My tests',
        complexity: 5,
      });
      const result = formatEpicDescription(task);
      expect(result).toContain('## Description');
      expect(result).toContain('My desc');
      expect(result).toContain('## Implementation Details');
      expect(result).toContain('My details');
      expect(result).toContain('## Test Strategy');
      expect(result).toContain('My tests');
      expect(result).toContain('Complexity: 5/10');
    });

    it('omits optional sections when missing', () => {
      const task = makeTask();
      const result = formatEpicDescription(task);
      expect(result).toContain('## Description');
      expect(result).not.toContain('## Implementation Details');
      expect(result).not.toContain('## Test Strategy');
      expect(result).not.toContain('Complexity');
    });
  });

  describe('mapPriority', () => {
    it('maps correctly', () => {
      expect(mapPriority('high')).toBe(0);
      expect(mapPriority('medium')).toBe(1);
      expect(mapPriority('low')).toBe(2);
    });
  });

  describe('createEpic', () => {
    it('calls CLI and updates mapper', async () => {
      const cli = makeMockCli();
      const mapper = new IdMapper();
      const task = makeTask({ id: 1, priority: 'high' });
      const id = await createEpic(task, cli as any, mapper);
      expect(cli.createEpic).toHaveBeenCalledWith(
        'Test task',
        expect.stringContaining('## Description'),
        0,
      );
      expect(id).toBe('bd-abc');
      expect(mapper.getEpicId(1)).toBe('bd-abc');
    });
  });

  describe('createEpics', () => {
    it('creates all epics with progress', async () => {
      const cli = makeMockCli();
      let callCount = 0;
      cli.createEpic.mockImplementation(async () => ({
        id: `bd-${++callCount}`,
        title: 'T',
      }));
      const mapper = new IdMapper();
      const progress = vi.fn();
      await createEpics([makeTask({ id: 1 }), makeTask({ id: 2 })], cli as any, mapper, progress);
      expect(progress).toHaveBeenCalledWith(1, 2);
      expect(progress).toHaveBeenCalledWith(2, 2);
      expect(mapper.getEpicId(1)).toBe('bd-1');
      expect(mapper.getEpicId(2)).toBe('bd-2');
    });
  });
});

describe('child-creator', () => {
  describe('formatChildDescription', () => {
    it('includes details when present', () => {
      const result = formatChildDescription({
        id: 1, title: 'T', description: 'Desc', status: 'pending', details: 'Details here',
      });
      expect(result).toContain('Desc');
      expect(result).toContain('## Implementation Details');
      expect(result).toContain('Details here');
    });

    it('omits details section when missing', () => {
      const result = formatChildDescription({
        id: 1, title: 'T', description: 'Desc', status: 'pending',
      });
      expect(result).toBe('Desc');
    });
  });

  describe('createChildren', () => {
    it('skips tasks with no subtasks', async () => {
      const cli = makeMockCli();
      const mapper = new IdMapper();
      mapper.addEpic(1, 'bd-abc');
      await createChildren(makeTask({ id: 1 }), 'bd-abc', cli as any, mapper);
      expect(cli.createChild).not.toHaveBeenCalled();
    });

    it('creates children sorted by ID', async () => {
      const cli = makeMockCli();
      let n = 0;
      cli.createChild.mockImplementation(async () => ({ id: `bd-abc.${++n}`, title: 'C' }));
      const mapper = new IdMapper();
      mapper.addEpic(1, 'bd-abc');
      const task = makeTask({
        id: 1,
        subtasks: [
          { id: 3, title: 'S3', description: 'D', status: 'pending' },
          { id: 1, title: 'S1', description: 'D', status: 'pending' },
          { id: 2, title: 'S2', description: 'D', status: 'pending' },
        ],
      });
      await createChildren(task, 'bd-abc', cli as any, mapper);
      expect(cli.createChild.mock.calls[0][1]).toBe('S1');
      expect(cli.createChild.mock.calls[1][1]).toBe('S2');
      expect(cli.createChild.mock.calls[2][1]).toBe('S3');
    });
  });

  describe('createAllChildren', () => {
    it('throws when epic ID missing', async () => {
      const cli = makeMockCli();
      const mapper = new IdMapper();
      await expect(
        createAllChildren([makeTask({ id: 1, subtasks: [{ id: 1, title: 'S', description: 'D', status: 'pending' }] })], cli as any, mapper),
      ).rejects.toThrow('Epic ID not found');
    });
  });
});

describe('dependency-wirer', () => {
  let cli: ReturnType<typeof makeMockCli>;
  let mapper: IdMapper;

  beforeEach(() => {
    cli = makeMockCli();
    mapper = new IdMapper();
    mapper.addEpic(1, 'bd-1');
    mapper.addEpic(2, 'bd-2');
    mapper.addEpic(3, 'bd-3');
  });

  describe('wireEpicDependencies', () => {
    it('skips tasks with no deps', async () => {
      const count = await wireEpicDependencies([makeTask({ id: 1 })], cli as any, mapper);
      expect(cli.addDependency).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });

    it('wires deps in correct order', async () => {
      const count = await wireEpicDependencies(
        [makeTask({ id: 2, dependencies: [1] }), makeTask({ id: 3, dependencies: [1, 2] })],
        cli as any,
        mapper,
      );
      expect(cli.addDependency).toHaveBeenCalledWith('bd-2', 'bd-1');
      expect(cli.addDependency).toHaveBeenCalledWith('bd-3', 'bd-1');
      expect(cli.addDependency).toHaveBeenCalledWith('bd-3', 'bd-2');
      expect(count).toBe(3);
    });
  });

  describe('wireSubtaskDependencies', () => {
    it('wires intra-epic subtask deps', async () => {
      mapper.addSubtask(1, 1, 'bd-1.1');
      mapper.addSubtask(1, 2, 'bd-1.2');
      const task = makeTask({
        id: 1,
        subtasks: [
          { id: 1, title: 'S1', description: 'D', status: 'pending', dependencies: [] },
          { id: 2, title: 'S2', description: 'D', status: 'pending', dependencies: [1] },
        ],
      });
      const count = await wireSubtaskDependencies([task], cli as any, mapper);
      expect(cli.addDependency).toHaveBeenCalledWith('bd-1.2', 'bd-1.1');
      expect(count).toBe(1);
    });
  });

  describe('wireAllDependencies', () => {
    it('returns combined counts', async () => {
      mapper.addSubtask(1, 1, 'bd-1.1');
      mapper.addSubtask(1, 2, 'bd-1.2');
      const tasks = [
        makeTask({
          id: 1,
          subtasks: [
            { id: 1, title: 'S1', description: 'D', status: 'pending' },
            { id: 2, title: 'S2', description: 'D', status: 'pending', dependencies: [1] },
          ],
        }),
        makeTask({ id: 2, dependencies: [1] }),
      ];
      const result = await wireAllDependencies(tasks, cli as any, mapper);
      expect(result.epicDeps).toBe(1);
      expect(result.subtaskDeps).toBe(1);
    });
  });
});

describe('status-syncer', () => {
  describe('mapStatus', () => {
    it('maps all statuses correctly', () => {
      expect(mapStatus('pending')).toEqual({ close: false });
      expect(mapStatus('in-progress')).toEqual({ status: 'in_progress', close: false });
      expect(mapStatus('done')).toEqual({ close: true });
      expect(mapStatus('deferred')).toEqual({ status: 'deferred', close: false });
    });
  });

  describe('syncAllStatuses', () => {
    it('calls close for done tasks', async () => {
      const cli = makeMockCli();
      const mapper = new IdMapper();
      mapper.addEpic(1, 'bd-1');
      await syncAllStatuses([makeTask({ id: 1, status: 'done' })], cli as any, mapper);
      expect(cli.close).toHaveBeenCalledWith('bd-1');
      expect(cli.updateStatus).not.toHaveBeenCalled();
    });

    it('calls updateStatus for in-progress tasks', async () => {
      const cli = makeMockCli();
      const mapper = new IdMapper();
      mapper.addEpic(1, 'bd-1');
      await syncAllStatuses([makeTask({ id: 1, status: 'in-progress' })], cli as any, mapper);
      expect(cli.updateStatus).toHaveBeenCalledWith('bd-1', 'in_progress');
    });

    it('skips pending tasks', async () => {
      const cli = makeMockCli();
      const mapper = new IdMapper();
      mapper.addEpic(1, 'bd-1');
      await syncAllStatuses([makeTask({ id: 1, status: 'pending' })], cli as any, mapper);
      expect(cli.close).not.toHaveBeenCalled();
      expect(cli.updateStatus).not.toHaveBeenCalled();
    });

    it('syncs subtask statuses too', async () => {
      const cli = makeMockCli();
      const mapper = new IdMapper();
      mapper.addEpic(1, 'bd-1');
      mapper.addSubtask(1, 1, 'bd-1.1');
      const task = makeTask({
        id: 1,
        subtasks: [{ id: 1, title: 'S', description: 'D', status: 'done' }],
      });
      await syncAllStatuses([task], cli as any, mapper);
      expect(cli.close).toHaveBeenCalledWith('bd-1.1');
    });
  });
});
