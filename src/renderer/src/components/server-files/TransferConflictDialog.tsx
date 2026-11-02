import { useState } from 'react'
import { ShieldAlert, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  countConflictsByAge,
  shouldOverwriteConflict
} from '../../../../shared/server-files-overwrite-policy'
import type {
  FileTimes,
  OverwritePolicy,
  TransferConflict,
  TransferPlan
} from '../../../../shared/server-files-types'
import { formatBytes, formatModified } from './server-files-messages'

export type ConflictAnswer = { policy: OverwritePolicy; overwrite: string[] }

const POLICIES: OverwritePolicy[] = ['newer', 'overwrite', 'skip', 'each']

function policyLabel(policy: OverwritePolicy): string {
  switch (policy) {
    case 'newer':
      return translate('auto.components.serverFiles.conflict.newer', 'Overwrite only newer')
    case 'overwrite':
      return translate('auto.components.serverFiles.conflict.overwriteAll', 'Overwrite all')
    case 'skip':
      return translate('auto.components.serverFiles.conflict.skipAll', 'Skip all')
    case 'each':
      return translate('auto.components.serverFiles.conflict.each', 'Decide per file')
  }
}

function Times({ times, newer }: { times: FileTimes; newer: boolean }): React.JSX.Element {
  return (
    <span className={newer ? 'font-medium text-foreground' : 'text-muted-foreground'}>
      {formatModified(times.modifiedMs)} · {formatBytes(times.size)}
    </span>
  )
}

function ConflictRow(props: {
  conflict: TransferConflict
  overwrite: boolean
  editable: boolean
  onToggle: (checked: boolean) => void
}): React.JSX.Element {
  const { conflict, overwrite, editable, onToggle } = props
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="py-1 pr-2 align-top">
        <Checkbox
          checked={overwrite}
          disabled={!editable}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-label={conflict.relativePath}
        />
      </td>
      <td className="max-w-0 py-1 pr-3 align-top font-mono break-all">
        {conflict.relativePath}
        {conflict.protected ? (
          <ShieldAlert className="ml-1 inline size-3.5 text-muted-foreground" />
        ) : null}
        {conflict.writable === false ? (
          <span className="ml-2 font-sans text-destructive">
            {translate('auto.components.serverFiles.conflict.notWritable', 'No write permission')}
          </span>
        ) : null}
      </td>
      <td className="py-1 pr-3 align-top whitespace-nowrap">
        <Times times={conflict.source} newer={conflict.newer === 'source'} />
      </td>
      <td className="py-1 align-top whitespace-nowrap">
        <Times times={conflict.destination} newer={conflict.newer === 'destination'} />
      </td>
    </tr>
  )
}

/** Remounted per plan (keyed), so each plan starts from its own defaults. */
function ConflictBody(props: {
  plan: TransferPlan
  onSettle: (answer: ConflictAnswer | null) => void
}): React.JSX.Element {
  const { plan, onSettle } = props
  const conflicts = plan.conflicts
  const [policy, setPolicy] = useState<OverwritePolicy>('newer')
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(conflicts.filter((c) => c.newer === 'source').map((c) => c.relativePath))
  )
  const counts = countConflictsByAge(conflicts)
  const overwriting = conflicts.filter((c) => shouldOverwriteConflict(c, policy, chosen))
  const upload = plan.direction === 'upload'
  const sourceLabel = upload
    ? translate('auto.components.serverFiles.conflict.local', 'This computer')
    : translate('auto.components.serverFiles.conflict.server', 'Server')
  const destinationLabel = upload
    ? translate('auto.components.serverFiles.conflict.server', 'Server')
    : translate('auto.components.serverFiles.conflict.local', 'This computer')
  const unwritable = overwriting.filter((c) => c.writable === false).length
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {translate(
            'auto.components.serverFiles.conflict.title',
            '{{value0}} files already exist in {{value1}}',
            {
              value0: conflicts.length,
              value1: plan.destinationDir
            }
          )}
        </DialogTitle>
        <DialogDescription>
          {translate(
            'auto.components.serverFiles.conflict.summary',
            '{{value0}} newer here, {{value1}} with the same time, {{value2}} newer at the destination. {{value3}} new files are copied as well.',
            {
              value0: counts.source,
              value1: counts.same,
              value2: counts.destination,
              value3: plan.fileCount - conflicts.length
            }
          )}
        </DialogDescription>
      </DialogHeader>
      <RadioGroup
        value={policy}
        onValueChange={(value) => {
          const next = POLICIES.find((candidate) => candidate === value)
          if (next) {
            setPolicy(next)
          }
        }}
        className="flex flex-wrap"
      >
        {POLICIES.map((option) => (
          <div key={option} className="flex items-center gap-2">
            <RadioGroupItem value={option} id={`server-files-policy-${option}`} />
            <Label htmlFor={`server-files-policy-${option}`}>{policyLabel(option)}</Label>
          </div>
        ))}
      </RadioGroup>
      <div className="scrollbar-sleek max-h-80 overflow-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="w-8 py-1.5 pl-2" />
              <th className="py-1.5 pr-3 font-medium">
                {translate('auto.components.serverFiles.conflict.file', 'File')}
              </th>
              <th className="py-1.5 pr-3 font-medium">{sourceLabel}</th>
              <th className="py-1.5 pr-2 font-medium">{destinationLabel}</th>
            </tr>
          </thead>
          <tbody className="[&_td:first-child]:pl-2">
            {conflicts.map((conflict) => (
              <ConflictRow
                key={conflict.relativePath}
                conflict={conflict}
                overwrite={shouldOverwriteConflict(conflict, policy, chosen)}
                editable={policy === 'each'}
                onToggle={(checked) =>
                  setChosen((current) => {
                    const next = new Set(current)
                    if (checked) {
                      next.add(conflict.relativePath)
                    } else {
                      next.delete(conflict.relativePath)
                    }
                    return next
                  })
                }
              />
            ))}
          </tbody>
        </table>
      </div>
      {unwritable > 0 ? (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <TriangleAlert className="size-4" />
          {translate(
            'auto.components.serverFiles.conflict.unwritableWarning',
            '{{value0}} of the files to overwrite have no write permission; the transfer stops at the first one.',
            { value0: unwritable }
          )}
        </p>
      ) : null}
      <DialogFooter className="items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          {translate(
            'auto.components.serverFiles.conflict.result',
            'Overwrite {{value0}}, keep {{value1}}',
            {
              value0: overwriting.length,
              value1: conflicts.length - overwriting.length
            }
          )}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onSettle(null)}>
            {translate('auto.components.serverFiles.dialog.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={() =>
              onSettle({
                policy,
                overwrite: policy === 'each' ? [...chosen] : []
              })
            }
          >
            {upload
              ? translate('auto.components.serverFiles.conflict.upload', 'Upload')
              : translate('auto.components.serverFiles.conflict.download', 'Download')}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

export function TransferConflictDialog(props: {
  plan: TransferPlan | null
  onSettle: (answer: ConflictAnswer | null) => void
}): React.JSX.Element {
  const { plan, onSettle } = props
  return (
    <Dialog open={plan !== null} onOpenChange={(open) => !open && onSettle(null)}>
      <DialogContent surface="security" showCloseButton={false} className="sm:max-w-4xl">
        {plan ? <ConflictBody key={plan.planId} plan={plan} onSettle={onSettle} /> : null}
      </DialogContent>
    </Dialog>
  )
}
