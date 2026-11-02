import type { FileTimes, OverwritePolicy, TransferConflict } from './server-files-types'

/** SFTP reports whole seconds and filesystems round differently, so near-equal times are equal. */
export const MODIFIED_TIME_TOLERANCE_MS = 2000

export function compareModifiedTimes(
  source: FileTimes,
  destination: FileTimes
): TransferConflict['newer'] {
  const difference = source.modifiedMs - destination.modifiedMs
  if (Math.abs(difference) <= MODIFIED_TIME_TOLERANCE_MS) {
    return 'same'
  }
  return difference > 0 ? 'source' : 'destination'
}

export function shouldOverwriteConflict(
  conflict: TransferConflict,
  policy: OverwritePolicy,
  chosen: ReadonlySet<string>
): boolean {
  switch (policy) {
    case 'overwrite':
      return true
    case 'skip':
      return false
    case 'newer':
      return conflict.newer === 'source'
    case 'each':
      return chosen.has(conflict.relativePath)
  }
}

export function countConflictsByAge(
  conflicts: readonly TransferConflict[]
): Record<TransferConflict['newer'], number> {
  const counts = { source: 0, destination: 0, same: 0 }
  for (const conflict of conflicts) {
    counts[conflict.newer] += 1
  }
  return counts
}
