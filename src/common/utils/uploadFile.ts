import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { dirname } from 'path';

export async function uploadFile(filePath: string, file: File): Promise<void> {
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  // Strip leading slash so join() builds a path under cwd on all platforms
  const relativePath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const storagePath = join(process.cwd(), 'storage', 'app', relativePath);

  // Create directory if it doesn't exist (dirname works with both / and \)
  const dir = dirname(storagePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Write file
  writeFileSync(storagePath, fileBuffer);
}
