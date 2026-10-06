import { open, stat } from 'node:fs/promises';
import { MAX_TEXT } from './model';
export async function readInput(path: string): Promise<string> {
  if (!(await stat(path)).isFile()) throw new Error('Input must be a regular UTF-8 JSON file.');
  const file = await open(path, 'r');
  try {
    const info = await file.stat(); const maximum = MAX_TEXT * 4;
    if (!info.isFile() || info.size > maximum) throw new Error('Input must be a regular file of at most 800,000 bytes.');
    const bytes = Buffer.alloc(maximum + 1); let length = 0;
    while (length < bytes.length) {
      const read = await file.read(bytes, length, bytes.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > maximum) throw new Error('Input exceeds 800,000 bytes.');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
  } finally { await file.close(); }
}
