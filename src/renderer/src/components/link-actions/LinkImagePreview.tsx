import { useEffect, useState } from 'react'
import {
  getLocalImageSrcCacheKey,
  releaseLocalImageSrcByKey,
  useLocalImageSrc
} from '@/components/editor/useLocalImageSrc'
import { chatImageAccess } from '@/lib/local-file-access'
import type { LinkImagePreviewTarget } from './link-action-request'

// Why chat-image access: the preview loads before any open gesture, so main serves only real image files.
const PREVIEW_ACCESS = chatImageAccess()

/** The linked image itself; renders nothing until it loads, so an unreadable file keeps the plain rows. */
export function LinkImagePreview({
  preview,
  openLabel,
  onOpen
}: {
  preview: LinkImagePreviewTarget
  openLabel: string
  onOpen: () => void
}): React.JSX.Element | null {
  const { filePath, context } = preview
  const src = useLocalImageSrc(filePath, filePath, context.connectionId, context, PREVIEW_ACCESS)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const releaseKey = getLocalImageSrcCacheKey(
    filePath,
    filePath,
    context.connectionId,
    context,
    PREVIEW_ACCESS
  )
  // Why release on close: a popover preview is transient and should not hold its blob in the cache.
  useEffect(
    () => (releaseKey ? () => releaseLocalImageSrcByKey(releaseKey) : undefined),
    [releaseKey]
  )

  if (!src || src === failedSrc) {
    return null
  }
  return (
    <button
      type="button"
      aria-label={openLabel}
      title={openLabel}
      className="mb-1 flex w-full justify-center overflow-hidden rounded-md border border-border bg-muted transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-link-image-preview
      onClick={onOpen}
    >
      <img
        src={src}
        alt={filePath.split(/[/\\]/).pop() ?? filePath}
        className="block h-auto max-h-60 w-auto max-w-full object-contain"
        onError={() => setFailedSrc(src)}
      />
    </button>
  )
}
