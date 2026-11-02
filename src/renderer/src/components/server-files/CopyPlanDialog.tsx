import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { translate } from '@/i18n/i18n'
import type { CopyPlan } from '../../../../shared/server-files-types'
import { formatModified, leftoverRefusalReason } from './server-files-messages'

export type CopyAnswer = { clearLeftovers: boolean; overwriteExisting: boolean }

function LeftoversSection(props: {
  plan: CopyPlan
  clear: boolean
  onClearChange: (clear: boolean) => void
}): React.JSX.Element {
  const { plan, clear, onClearChange } = props
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">
        {translate(
          'auto.components.serverFiles.copy.leftoversTitle',
          '{{value0}} already holds {{value1}} items',
          {
            value0: plan.destinationRoot,
            value1: plan.leftovers.length
          }
        )}
      </h3>
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.serverFiles.copy.leftoversHint',
          'Often the last backup, possibly of another project. Mixing them makes a later restore ambiguous.'
        )}
      </p>
      <ul className="scrollbar-sleek max-h-36 overflow-y-auto rounded-md border border-border bg-muted/30 py-1 font-mono text-xs">
        {plan.leftovers.map((leftover) => (
          <li key={leftover.path} className="flex gap-3 px-3 py-0.5">
            <span className="min-w-0 flex-1 break-all">
              {leftover.path}
              {leftover.kind === 'directory' ? '/' : ''}
            </span>
            <span className="shrink-0 font-sans text-muted-foreground">
              {formatModified(leftover.modifiedMs)}
            </span>
          </li>
        ))}
      </ul>
      {plan.leftoversRefusal ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.serverFiles.copy.cannotClear',
            'Cannot be cleared here: {{value0}}',
            {
              value0: leftoverRefusalReason(plan.leftoversRefusal)
            }
          )}
        </p>
      ) : (
        <RadioGroup
          value={clear ? 'clear' : 'keep'}
          onValueChange={(value) => onClearChange(value === 'clear')}
          className="flex flex-wrap"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="clear" id="server-files-leftovers-clear" />
            <Label htmlFor="server-files-leftovers-clear">
              {translate(
                'auto.components.serverFiles.copy.clearFirst',
                'Delete these first, then back up'
              )}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="keep" id="server-files-leftovers-keep" />
            <Label htmlFor="server-files-leftovers-keep">
              {translate(
                'auto.components.serverFiles.copy.keep',
                'Keep them; overwrite same names'
              )}
            </Label>
          </div>
        </RadioGroup>
      )}
    </section>
  )
}

/** Remounted per plan (keyed), so each plan starts from its own defaults. */
function CopyPlanBody(props: {
  plan: CopyPlan
  onSettle: (answer: CopyAnswer | null) => void
}): React.JSX.Element {
  const { plan, onSettle } = props
  const [clear, setClear] = useState(false)
  const [overwrite, setOverwrite] = useState(true)
  const existing = plan.items.filter((item) => item.destinationExists).length
  const backup = plan.kind === 'backup'
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {backup
            ? translate(
                'auto.components.serverFiles.copy.backupTitle',
                'Back up {{value0}} items to {{value1}}',
                {
                  value0: plan.items.length,
                  value1: plan.destinationRoot
                }
              )
            : translate(
                'auto.components.serverFiles.copy.copyTitle',
                'Copy {{value0}} items to {{value1}}',
                {
                  value0: plan.items.length,
                  value1: plan.destinationRoot
                }
              )}
        </DialogTitle>
        <DialogDescription>
          {translate(
            'auto.components.serverFiles.copy.onServer',
            'Copied on the server with cp -a, keeping permissions and times. Nothing passes through this computer.'
          )}
        </DialogDescription>
      </DialogHeader>
      {plan.leftovers.length > 0 ? (
        <LeftoversSection plan={plan} clear={clear} onClearChange={setClear} />
      ) : null}
      <section className="space-y-2">
        <ul className="scrollbar-sleek max-h-48 overflow-y-auto rounded-md border border-border bg-muted/30 py-1 font-mono text-xs">
          {plan.items.map((item) => (
            <li key={item.source} className="px-3 py-0.5 break-all">
              {item.source}
              <span className="px-1.5 font-sans text-muted-foreground">→</span>
              {item.destination}
              {item.destinationExists ? (
                <span className="pl-2 font-sans text-muted-foreground">
                  {translate('auto.components.serverFiles.copy.exists', '(exists)')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {existing > 0 && !clear ? (
          <div className="flex items-center gap-2">
            <Checkbox
              id="server-files-copy-overwrite"
              checked={overwrite}
              onCheckedChange={(checked) => setOverwrite(checked === true)}
            />
            <Label htmlFor="server-files-copy-overwrite">
              {translate(
                'auto.components.serverFiles.copy.overwriteExisting',
                'Overwrite the {{value0}} that already exist',
                {
                  value0: existing
                }
              )}
            </Label>
          </div>
        ) : null}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
              {translate('auto.components.serverFiles.copy.showCommands', 'Commands that will run')}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="scrollbar-sleek mt-2 max-h-40 overflow-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap break-all">
              {plan.items.map((item) => item.command).join('\n')}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </section>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onSettle(null)}>
          {translate('auto.components.serverFiles.dialog.cancel', 'Cancel')}
        </Button>
        <Button
          onClick={() => onSettle({ clearLeftovers: clear, overwriteExisting: clear || overwrite })}
        >
          {backup
            ? translate('auto.components.serverFiles.copy.backup', 'Back up')
            : translate('auto.components.serverFiles.copy.copy', 'Copy')}
        </Button>
      </DialogFooter>
    </>
  )
}

export function CopyPlanDialog(props: {
  plan: CopyPlan | null
  onSettle: (answer: CopyAnswer | null) => void
}): React.JSX.Element {
  const { plan, onSettle } = props
  return (
    <Dialog open={plan !== null} onOpenChange={(open) => !open && onSettle(null)}>
      <DialogContent surface="security" showCloseButton={false} className="sm:max-w-3xl" scrollable>
        {plan ? <CopyPlanBody key={plan.planId} plan={plan} onSettle={onSettle} /> : null}
      </DialogContent>
    </Dialog>
  )
}
