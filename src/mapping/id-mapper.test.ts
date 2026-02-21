import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { IdMapper } from './id-mapper.js';

describe('IdMapper', () => {
  it('adds and retrieves epic IDs', () => {
    const mapper = new IdMapper();
    mapper.addEpic(1, 'bd-abc');
    mapper.addEpic(2, 'bd-def');
    expect(mapper.getEpicId(1)).toBe('bd-abc');
    expect(mapper.getEpicId(2)).toBe('bd-def');
    expect(mapper.getEpicId(99)).toBeUndefined();
  });

  it('adds and retrieves subtask IDs', () => {
    const mapper = new IdMapper();
    mapper.addEpic(1, 'bd-abc');
    mapper.addSubtask(1, 1, 'bd-abc.1');
    mapper.addSubtask(1, 2, 'bd-abc.2');
    expect(mapper.getSubtaskId(1, 1)).toBe('bd-abc.1');
    expect(mapper.getSubtaskId(1, 2)).toBe('bd-abc.2');
    expect(mapper.getSubtaskId(1, 99)).toBeUndefined();
  });

  it('throws when adding subtask to non-existent task', () => {
    const mapper = new IdMapper();
    expect(() => mapper.addSubtask(99, 1, 'bd-x.1')).toThrow('not found');
  });

  it('tracks stats correctly', () => {
    const mapper = new IdMapper();
    mapper.addEpic(1, 'bd-a');
    mapper.addEpic(2, 'bd-b');
    mapper.addSubtask(1, 1, 'bd-a.1');
    mapper.addSubtask(2, 1, 'bd-b.1');
    mapper.addSubtask(2, 2, 'bd-b.2');
    const stats = mapper.getStats();
    expect(stats.epicCount).toBe(2);
    expect(stats.childCount).toBe(3);
  });

  describe('persistence', () => {
    let tmpDir: string;

    beforeAll(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tm2bd-mapper-'));
    });

    afterAll(async () => {
      await fs.rm(tmpDir, { recursive: true });
    });

    it('saves and loads mapping file', async () => {
      const mapper = new IdMapper();
      mapper.addEpic(1, 'bd-abc');
      mapper.addSubtask(1, 1, 'bd-abc.1');
      mapper.addEpic(2, 'bd-def');

      const file = path.join(tmpDir, 'map.json');
      await mapper.save(file);

      const loaded = await IdMapper.load(file);
      expect(loaded.getEpicId(1)).toBe('bd-abc');
      expect(loaded.getSubtaskId(1, 1)).toBe('bd-abc.1');
      expect(loaded.getEpicId(2)).toBe('bd-def');
    });

    it('detects file existence', async () => {
      const file = path.join(tmpDir, 'exists.json');
      expect(await IdMapper.exists(file)).toBe(false);
      await fs.writeFile(file, '{}');
      expect(await IdMapper.exists(file)).toBe(true);
    });
  });
});
