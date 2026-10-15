// Keeps only the newest local build zips, so dist/ stops growing by ~250 MB per build.
import { readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'

const BUILD_ZIP = /-arm64-mac\.zip$/

/** Deletes all but the `keep` newest build zips (and their .blockmap); returns what it removed. */
export function pruneOldBuildZips(distDir, keep = 2) {
  let names
  try {
    names = readdirSync(distDir)
  } catch {
    return []
  }
  const zips = names
    .filter((name) => BUILD_ZIP.test(name))
    .map((name) => ({ name, mtimeMs: statSync(path.join(distDir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  const removed = zips.slice(keep).map(({ name }) => name)
  for (const name of removed) {
    rmSync(path.join(distDir, name), { force: true })
    rmSync(path.join(distDir, `${name}.blockmap`), { force: true })
  }
  return removed
}
