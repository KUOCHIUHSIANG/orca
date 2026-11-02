import { useMemo, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import {
  commandTemplateFields,
  commandTemplateValuesForProject,
  renderCommandTemplate,
  type CommandTemplateValues
} from '../../../../shared/server-files-command-template'
import type { ServerCommandTemplate, ServerProject } from '../../../../shared/server-files-types'
import { useRedirectTargetCheck } from './use-redirect-target-check'
import {
  openServerTerminal,
  serverTerminalTabs,
  typeIntoServerTerminal
} from './server-files-terminal'

export type TemplateRequest = {
  /** Distinct per opening, so the dialog's fields reset each time. */
  key: string
  serverId: string
  serverLabel: string
  template: ServerCommandTemplate
  project: ServerProject | null
  cwd: string
  homePath: string
}

const NEW_TERMINAL = '__new__'

function rememberedKey(serverId: string): string {
  return `orca.serverFiles.templateValues.${serverId}`
}

function readRemembered(serverId: string): Partial<CommandTemplateValues> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(rememberedKey(serverId)) ?? '{}')
    return typeof parsed === 'object' && parsed !== null
      ? Object.fromEntries(
          Object.entries(parsed).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      : {}
  } catch {
    return {}
  }
}

function initialValues(request: TemplateRequest): CommandTemplateValues {
  const fromProject = commandTemplateValuesForProject(request.project, new Date())
  const remembered = readRemembered(request.serverId)
  return {
    專案: fromProject.專案 || remembered.專案 || '',
    資料庫: fromProject.資料庫 || remembered.資料庫 || '',
    服務: fromProject.服務 || remembered.服務 || '',
    日期: fromProject.日期
  }
}

/** Remounted per request (keyed), so each opens with its own project's values. */
function TemplateBody(props: { request: TemplateRequest; onClose: () => void }): React.JSX.Element {
  const { request, onClose } = props
  const fields = useMemo(() => commandTemplateFields(request.template.command), [request])
  const terminals = useMemo(() => serverTerminalTabs(request.serverId), [request])
  const [values, setValues] = useState(() => initialValues(request))
  const [edited, setEdited] = useState<string | null>(null)
  const [target, setTarget] = useState(() => terminals.at(-1)?.tabId ?? NEW_TERMINAL)

  const command = edited ?? renderCommandTemplate(request.template.command, values)
  const overwriteWarning = useRedirectTargetCheck(request.serverId, command, request.homePath)

  const send = async (): Promise<void> => {
    if (!command.trim()) {
      return
    }
    localStorage.setItem(rememberedKey(request.serverId), JSON.stringify(values))
    onClose()
    if (target !== NEW_TERMINAL && (await typeIntoServerTerminal(target, command))) {
      return
    }
    if (target !== NEW_TERMINAL) {
      toast(
        translate(
          'auto.components.serverFiles.template.terminalGone',
          'That terminal is no longer connected to the server, so a new one was opened'
        )
      )
    }
    await openServerTerminal(request.serverId, request.cwd, { command })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {request.template.label}（{request.serverLabel}）
        </DialogTitle>
        <DialogDescription>
          {translate(
            'auto.components.serverFiles.template.description',
            'The command is typed at the terminal prompt without pressing Enter. Check it there, then press Enter yourself.'
          )}
        </DialogDescription>
      </DialogHeader>
      {fields.length > 0 ? (
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
          {fields.map((field) => (
            <div key={field} className="contents">
              <Label htmlFor={`server-files-field-${field}`}>{field}</Label>
              <Input
                id={`server-files-field-${field}`}
                value={values[field]}
                onChange={(event) => {
                  setEdited(null)
                  setValues((current) => ({ ...current, [field]: event.target.value }))
                }}
              />
            </div>
          ))}
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="server-files-template-command">
          {translate('auto.components.serverFiles.template.command', 'Command (you can edit it)')}
        </Label>
        <Textarea
          id="server-files-template-command"
          value={command}
          onChange={(event) => setEdited(event.target.value.replace(/[\r\n]+/g, ' '))}
          rows={3}
          variant="code"
        />
        {overwriteWarning ? (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            {translate(
              'auto.components.serverFiles.template.exists',
              '{{value0}} already exists; running this replaces it',
              {
                value0: overwriteWarning
              }
            )}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label>{translate('auto.components.serverFiles.template.sendTo', 'Type into')}</Label>
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {terminals.map((terminal) => (
              <SelectItem key={terminal.tabId} value={terminal.tabId}>
                {terminal.title}
              </SelectItem>
            ))}
            <SelectItem value={NEW_TERMINAL}>
              {translate(
                'auto.components.serverFiles.template.newTerminal',
                'A new terminal in {{value0}}',
                {
                  value0: request.cwd
                }
              )}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {translate('auto.components.serverFiles.dialog.cancel', 'Cancel')}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(command)
            toast.success(
              translate('auto.components.serverFiles.template.copied', 'Command copied')
            )
          }}
        >
          {translate('auto.components.serverFiles.template.copy', 'Copy')}
        </Button>
        <Button onClick={() => void send()} disabled={!command.trim()}>
          {translate('auto.components.serverFiles.template.send', 'Type into terminal')}
        </Button>
      </DialogFooter>
    </>
  )
}

export function CommandTemplateDialog(props: {
  request: TemplateRequest | null
  onClose: () => void
}): React.JSX.Element {
  const { request, onClose } = props
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent surface="security" showCloseButton={false} className="sm:max-w-2xl">
        {request ? <TemplateBody key={request.key} request={request} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}
