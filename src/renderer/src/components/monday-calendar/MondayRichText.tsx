import { useMemo } from 'react'
import DOMPurify from 'dompurify'

const EXTERNAL_URL = /^https?:\/\//i

function sanitizeMondayHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe'],
    FORBID_ATTR: ['style', 'class', 'id']
  })
}

/** Renders a monday.com update body; links and images open in the system browser. */
export function MondayRichText(props: { html: string }): React.JSX.Element {
  const sanitized = useMemo(() => sanitizeMondayHtml(props.html), [props.html])

  const handleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!(event.target instanceof Element)) {
      return
    }
    const anchor = event.target.closest('a')
    const image = event.target.closest('img')
    const url = anchor?.getAttribute('href') ?? image?.getAttribute('src') ?? null
    if (!anchor && !image) {
      return
    }
    // Why: a followed link would navigate the Orca window itself.
    event.preventDefault()
    if (url && EXTERNAL_URL.test(url)) {
      void window.api.shell.openUrl(url)
    }
  }

  return (
    <div
      onClick={handleClick}
      className="min-w-0 break-words text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_img]:my-2 [&_img]:max-h-80 [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-md [&_img]:border [&_img]:border-border [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  )
}
