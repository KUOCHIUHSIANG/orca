import { lstat, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fail } from './server-files-errors'
import { MAX_WALK_ENTRIES } from './server-files-remote-walk'

export type LocalWalkItem = {
  localPath: string
  /** POSIX-separated, rooted at the picked item's own name. */
  relativePath: string
  kind: 'file' | 'directory'
  size: number
  modifiedMs: number
}

/** lstat only: local symlinks are skipped, so nothing the user didn't pick leaves the machine. */
export async function walkLocalSources(
  sources: readonly string[],
  /** `contents`: a picked folder's children land in the destination, not the folder itself. */
  mode: 'items' | 'contents' = 'items'
): Promise<{ items: LocalWalkItem[]; skippedLinks: string[] }> {
  const items: LocalWalkItem[] = []
  const skippedLinks: string[] = []
  const visit = async (localPath: string, relativePath: string): Promise<void> => {
    if (items.length + skippedLinks.length >= MAX_WALK_ENTRIES) {
      fail('invalid', `More than ${MAX_WALK_ENTRIES} items; pick fewer at a time`, localPath)
    }
    const stats = await lstat(localPath)
    if (stats.isSymbolicLink()) {
      skippedLinks.push(localPath)
      return
    }
    if (stats.isFile()) {
      items.push({
        localPath,
        relativePath,
        kind: 'file',
        size: stats.size,
        modifiedMs: stats.mtimeMs
      })
      return
    }
    if (!stats.isDirectory()) {
      skippedLinks.push(localPath)
      return
    }
    items.push({ localPath, relativePath, kind: 'directory', size: 0, modifiedMs: stats.mtimeMs })
    const names = (await readdir(localPath)).sort()
    for (const name of names) {
      await visit(join(localPath, name), `${relativePath}/${name}`)
    }
  }
  for (const source of sources) {
    const stats = mode === 'contents' ? await lstat(source) : null
    if (stats?.isDirectory()) {
      for (const name of (await readdir(source)).sort()) {
        await visit(join(source, name), name)
      }
      continue
    }
    await visit(source, basename(source))
  }
  return { items, skippedLinks }
}
