import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BeadsCli } from './cli.js';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
  },
}));

import { execa } from 'execa';
import fs from 'fs/promises';

const mockExeca = vi.mocked(execa);
const mockAccess = vi.mocked(fs.access);

describe('BeadsCli', () => {
  let cli: BeadsCli;

  beforeEach(() => {
    vi.clearAllMocks();
    cli = new BeadsCli('/project', false);
  });

  describe('createEpic', () => {
    it('calls bd create with correct args', async () => {
      mockExeca.mockResolvedValue({ stdout: '{"id":"bd-abc123","title":"My Epic"}' } as any);
      const result = await cli.createEpic('My Epic', 'Description here', 0);
      expect(mockExeca).toHaveBeenCalledWith(
        'bd',
        ['create', 'My Epic', '-t', 'epic', '-p', '0', '--json', '-d', 'Description here'],
        { cwd: '/project' },
      );
      expect(result.id).toBe('bd-abc123');
      expect(result.title).toBe('My Epic');
    });

    it('skips description flag when empty', async () => {
      mockExeca.mockResolvedValue({ stdout: '{"id":"bd-abc","title":"T"}' } as any);
      await cli.createEpic('T', '', 1);
      const args = mockExeca.mock.calls[0][1] as string[];
      expect(args).not.toContain('-d');
    });
  });

  describe('createChild', () => {
    it('calls bd create with parent flag', async () => {
      mockExeca.mockResolvedValue({ stdout: '{"id":"bd-abc.1","title":"Child"}' } as any);
      const result = await cli.createChild('bd-abc', 'Child', 'Desc');
      expect(mockExeca).toHaveBeenCalledWith(
        'bd',
        ['create', 'Child', '--parent', 'bd-abc', '--json', '-d', 'Desc'],
        { cwd: '/project' },
      );
      expect(result.id).toBe('bd-abc.1');
    });
  });

  describe('addDependency', () => {
    it('calls bd dep add with correct order', async () => {
      mockExeca.mockResolvedValue({ stdout: '' } as any);
      await cli.addDependency('bd-blocked', 'bd-blocker');
      expect(mockExeca).toHaveBeenCalledWith(
        'bd',
        ['dep', 'add', 'bd-blocked', 'bd-blocker'],
        { cwd: '/project' },
      );
    });
  });

  describe('updateStatus', () => {
    it('calls bd update with status flag', async () => {
      mockExeca.mockResolvedValue({ stdout: '' } as any);
      await cli.updateStatus('bd-abc', 'in_progress');
      expect(mockExeca).toHaveBeenCalledWith(
        'bd',
        ['update', 'bd-abc', '-s', 'in_progress'],
        { cwd: '/project' },
      );
    });
  });

  describe('close', () => {
    it('calls bd close', async () => {
      mockExeca.mockResolvedValue({ stdout: '' } as any);
      await cli.close('bd-abc');
      expect(mockExeca).toHaveBeenCalledWith(
        'bd',
        ['close', 'bd-abc'],
        { cwd: '/project' },
      );
    });
  });

  describe('checkInit', () => {
    it('returns true when .beads exists', async () => {
      mockAccess.mockResolvedValue(undefined);
      expect(await cli.checkInit()).toBe(true);
    });

    it('returns false when .beads missing', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      expect(await cli.checkInit()).toBe(false);
    });
  });

  describe('error handling', () => {
    it('throws on invalid JSON output', async () => {
      mockExeca.mockResolvedValue({ stdout: 'not json' } as any);
      await expect(cli.createEpic('T', 'D', 0)).rejects.toThrow('Failed to parse');
    });

    it('throws on missing id field', async () => {
      mockExeca.mockResolvedValue({ stdout: '{"title":"T"}' } as any);
      await expect(cli.createEpic('T', 'D', 0)).rejects.toThrow('missing id');
    });

    it('propagates execa errors', async () => {
      mockExeca.mockRejectedValue(new Error('command not found'));
      await expect(cli.createEpic('T', 'D', 0)).rejects.toThrow('command not found');
    });
  });

  describe('verbose mode', () => {
    it('logs commands when verbose', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const verboseCli = new BeadsCli('/project', true);
      mockExeca.mockResolvedValue({ stdout: '{"id":"bd-x","title":"T"}' } as any);
      await verboseCli.createEpic('T', '', 0);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[bd]'));
      spy.mockRestore();
    });
  });
});
