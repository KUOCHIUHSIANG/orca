import { useId, useState } from 'react'
import { ExternalLink, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useMountedRef } from '@/hooks/useMountedRef'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import { translate } from '@/i18n/i18n'
import {
  findUnrecognizedMondayReferences,
  parseMondayBoardReferences,
  parseMondayDocReferences,
  type MondayConnectionStatus
} from '../../../../shared/monday-calendar-types'
import { describeMondayFailure } from './monday-failure-copy'

const API_TOKEN_DOCS_URL = 'https://developer.monday.com/api-reference/docs/authentication'
const BOARD_URL_EXAMPLE = 'https://example.monday.com/boards/1234567890'

/** What the settings field shows for a saved connection: board ids, then doc URLs. */
export function connectionReferenceLines(
  status: Pick<MondayConnectionStatus, 'boardIds' | 'docs'>
): string[] {
  return [...status.boardIds, ...status.docs.map((doc) => doc.url || `docs/${doc.objectId}`)]
}

export function MondayConnectForm(props: {
  /** Board ids and doc URLs, one per line in the field. */
  initialReferences: readonly string[]
  hasStoredToken: boolean
  submitLabel: string
  onConnected: (status: MondayConnectionStatus) => void
  secondaryAction?: React.ReactNode
}): React.JSX.Element {
  const fieldId = useId()
  const mountedRef = useMountedRef()
  const [apiToken, setApiToken] = useState('')
  const [boardsText, setBoardsText] = useState(props.initialReferences.join('\n'))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const unrecognized = findUnrecognizedMondayReferences(boardsText)
    if (unrecognized.length > 0) {
      setError(
        translate(
          'auto.components.mondayCalendar.connect.unrecognized',
          'Not a monday board or doc URL: {{value0}}',
          { value0: unrecognized.join(', ') }
        )
      )
      return
    }
    const boardIds = parseMondayBoardReferences(boardsText)
    const docObjectIds = parseMondayDocReferences(boardsText)
    if (boardIds.length + docObjectIds.length === 0) {
      setError(describeMondayFailure({ ok: false, kind: 'board-not-found', message: '' }))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const token = apiToken.trim()
      const result = await window.api.monday.connect({
        boardIds,
        docObjectIds,
        ...(token ? { apiToken: token } : {})
      })
      if (!mountedRef.current) {
        return
      }
      if (result.ok) {
        setApiToken('')
        props.onConnected(result.status)
      } else {
        setError(describeMondayFailure(result))
      }
    } catch (connectError) {
      if (mountedRef.current) {
        setError(
          describeMondayFailure({
            ok: false,
            kind: 'api',
            message: readIpcErrorMessage(connectError) ?? ''
          })
        )
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false)
      }
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void submit(event)}>
      <div className="space-y-2">
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-token`}>
            {translate('auto.components.mondayCalendar.connect.tokenLabel', 'API token')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.mondayCalendar.connect.tokenHelp',
              'In monday.com, open your avatar → Developers → API token. The token is encrypted on this computer.'
            )}
          </p>
        </div>
        <Input
          id={`${fieldId}-token`}
          type="password"
          autoComplete="off"
          autoFocus={!props.hasStoredToken}
          value={apiToken}
          onChange={(event) => setApiToken(event.target.value)}
          placeholder={
            props.hasStoredToken
              ? translate(
                  'auto.components.mondayCalendar.connect.tokenKeepPlaceholder',
                  'Saved — leave empty to keep it'
                )
              : undefined
          }
        />
      </div>
      <div className="space-y-2">
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-boards`}>
            {translate('auto.components.mondayCalendar.connect.boardsLabel', 'Boards and docs')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.mondayCalendar.connect.boardsHelp',
              'One board or doc URL (or just its ID) per line. Boards go on the calendar and docs in the Docs tab; subitems are included automatically.'
            )}
          </p>
        </div>
        <Textarea
          id={`${fieldId}-boards`}
          rows={3}
          value={boardsText}
          onChange={(event) => setBoardsText(event.target.value)}
          placeholder={BOARD_URL_EXAMPLE}
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {props.secondaryAction ?? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void window.api.shell.openUrl(API_TOKEN_DOCS_URL)}
          >
            <ExternalLink className="size-3.5" />
            {translate('auto.components.mondayCalendar.connect.tokenDocs', 'How to get a token')}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          {props.submitLabel}
        </Button>
      </div>
    </form>
  )
}
