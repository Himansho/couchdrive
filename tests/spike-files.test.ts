import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, describe, expect, it } from 'vitest';
import { createSpikeFiles, makePdf } from '../server/spike-files';

const sampleMp4 = path.resolve('tests', 'fixtures', 'sample.mp4');
const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('createSpikeFiles', () => {
  it('writes one valid file of each type', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'couchdrive-files-'));
    tempDirs.push(dir);
    const files = await createSpikeFiles(dir, sampleMp4);
    const read = (id: string) => fs.readFile(files.find((f) => f.id === id)!.path);

    expect(files.map((f) => path.extname(f.name))).toEqual(['.mp4', '.pdf', '.zip', '.apk', '.pdf']);
    expect(await read('mp4')).toEqual(await fs.readFile(sampleMp4));
    expect(strFromU8(unzipSync(await read('zip'))['readme.txt'])).toContain('Couchdrive');
    expect(Object.keys(unzipSync(await read('apk')))).toEqual(['README.txt']);
    expect((await read('hindi')).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('makePdf', () => {
  it('points every cross-reference entry at its object', () => {
    const pdf = makePdf('Hello').toString('latin1');
    const xrefAt = Number(pdf.match(/startxref\n(\d+)/)![1]);
    expect(pdf.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const offsets = [...pdf.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, i) => expect(pdf.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });
});
