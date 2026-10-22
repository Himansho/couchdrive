// Milestone 1 spike: small files of each type, to record how Chrome on Android
// handles downloading them over plain HTTP from a local IP.
import fs from 'node:fs/promises';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';

export interface SpikeFile {
  id: string;
  label: string;
  /** File name the phone should save it as. */
  name: string;
  path: string;
  note?: string;
}

/** "Hello world" in Hindi; checks that non-English names survive download. */
export const HINDI_FILE_NAME = 'नमस्ते दुनिया.pdf';

/** Writes the test files into `dir` (overwriting old ones) and describes them. */
export async function createSpikeFiles(dir: string, sampleMp4Path: string): Promise<SpikeFile[]> {
  await fs.mkdir(dir, { recursive: true });
  const files: (Omit<SpikeFile, 'path'> & { data: Uint8Array })[] = [
    { id: 'mp4', label: 'MP4 video', name: 'couchdrive-test.mp4', data: await fs.readFile(sampleMp4Path) },
    { id: 'pdf', label: 'PDF document', name: 'couchdrive-test.pdf', data: makePdf('Couchdrive test PDF') },
    {
      id: 'zip',
      label: 'ZIP archive',
      name: 'couchdrive-test.zip',
      data: zipSync({ 'readme.txt': strToU8('Couchdrive made this ZIP to test downloads.\n') }),
    },
    {
      id: 'apk',
      label: 'APK (Android app)',
      name: 'couchdrive-test.apk',
      note: "Not a real app, so it won't install. It only tests Chrome's download warning.",
      // An APK is a ZIP; this one holds only a text file.
      data: zipSync({
        'README.txt': strToU8('Not a real Android app. Couchdrive uses it only to test how Chrome downloads .apk files.\n'),
      }),
    },
    { id: 'hindi', label: 'Hindi file name', name: HINDI_FILE_NAME, data: makePdf('Hindi file name test') },
  ];
  return Promise.all(
    files.map(async ({ data, ...file }) => {
      const filePath = path.join(dir, file.name);
      await fs.writeFile(filePath, data);
      return { ...file, path: filePath };
    }),
  );
}

/** A one-page PDF showing `text` (ASCII only). */
export function makePdf(text: string): Buffer {
  const content = `BT /F1 28 Tf 72 700 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
