const MAX_REMOTE_PATH_LENGTH = 4096
const MAX_ENTRY_NAME_BYTES = 255

/** Absolute POSIX path with `.`/`..`/duplicate slashes resolved and no trailing slash. */
export function normalizeRemotePath(value: string): string | null {
  if (!value.startsWith('/') || value.includes('\0') || value.length > MAX_REMOTE_PATH_LENGTH) {
    return null
  }
  const segments: string[] = []
  for (const segment of value.split('/')) {
    if (segment === '' || segment === '.') {
      continue
    }
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return `/${segments.join('/')}`
}

export function joinRemotePath(directory: string, name: string): string {
  return directory === '/' ? `/${name}` : `${directory}/${name}`
}

export function remoteParentPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index <= 0 ? '/' : path.slice(0, index)
}

export function remoteBaseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** A single folder entry name the server can create: no separators, not `.`/`..`. */
export function isValidRemoteEntryName(name: string): boolean {
  return (
    name !== '' &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\0') &&
    new TextEncoder().encode(name).length <= MAX_ENTRY_NAME_BYTES
  )
}

/** Segment-wise containment, so `/var/www/app2` is not inside `/var/www/app`. */
export function isSameOrInsideRemotePath(path: string, root: string): boolean {
  return root === '/' || path === root || path.startsWith(`${root}/`)
}

export function relativeRemotePath(root: string, path: string): string | null {
  if (!isSameOrInsideRemotePath(path, root) || path === root) {
    return null
  }
  return root === '/' ? path.slice(1) : path.slice(root.length + 1)
}

/** The protected root that covers `path` (the path itself or a folder above it). */
export function findProtectedRoot(path: string, roots: readonly string[]): string | null {
  return roots.find((root) => isSameOrInsideRemotePath(path, root)) ?? null
}

/** A protected root strictly inside `path`: removing or renaming `path` would take it too. */
export function findProtectedDescendant(path: string, roots: readonly string[]): string | null {
  return roots.find((root) => root !== path && isSameOrInsideRemotePath(root, path)) ?? null
}

export function normalizeProtectedPaths(values: readonly string[]): string[] {
  const normalized = values
    .map((value) => normalizeRemotePath(value.trim()))
    .filter((value): value is string => value !== null)
  return [...new Set(normalized)]
}
