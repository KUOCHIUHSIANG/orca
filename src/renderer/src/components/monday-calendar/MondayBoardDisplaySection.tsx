import { useId } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { translate } from '@/i18n/i18n'
import {
  MONDAY_RECENT_WEEK_OPTIONS,
  type MondayBoardDisplaySetting,
  type MondayBoardDisplaySettings,
  type MondayBoardSummary
} from '../../../../shared/monday-calendar-types'

const ALL_GROUPS = '__all__'
const ALL_TIME = 'all'
const DEFAULT_SETTING: MondayBoardDisplaySetting = {
  groupId: null,
  ignorePeopleFilter: false,
  includeDone: false,
  recentWeeks: null
}

function SettingSwitch(props: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />
      {props.label}
    </label>
  )
}

function BoardRow(props: {
  board: MondayBoardSummary
  setting: MondayBoardDisplaySetting
  onChange: (setting: MondayBoardDisplaySetting) => void
}): React.JSX.Element {
  const fieldId = useId()
  const { board, setting } = props
  return (
    <div className="space-y-2.5 rounded-md border border-border p-3">
      <p className="truncate text-sm font-medium">{board.name}</p>
      <div className="flex items-center gap-3">
        <Label htmlFor={`${fieldId}-group`} className="w-16 shrink-0">
          {translate('auto.components.mondayCalendar.boardSettings.group', 'Group')}
        </Label>
        <Select
          value={setting.groupId ?? ALL_GROUPS}
          onValueChange={(value) =>
            props.onChange({ ...setting, groupId: value === ALL_GROUPS ? null : value })
          }
        >
          <SelectTrigger id={`${fieldId}-group`} size="sm" className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_GROUPS}>
              {translate('auto.components.mondayCalendar.boardSettings.allGroups', 'All groups')}
            </SelectItem>
            {board.groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <Label htmlFor={`${fieldId}-range`} className="w-16 shrink-0">
          {translate('auto.components.mondayCalendar.boardSettings.range', 'Time range')}
        </Label>
        <Select
          value={setting.recentWeeks === null ? ALL_TIME : String(setting.recentWeeks)}
          onValueChange={(value) =>
            props.onChange({ ...setting, recentWeeks: value === ALL_TIME ? null : Number(value) })
          }
        >
          <SelectTrigger id={`${fieldId}-range`} size="sm" className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TIME}>
              {translate('auto.components.mondayCalendar.boardSettings.allTime', 'All time')}
            </SelectItem>
            {MONDAY_RECENT_WEEK_OPTIONS.map((weeks) => (
              <SelectItem key={weeks} value={String(weeks)}>
                {weeks === 1
                  ? translate('auto.components.mondayCalendar.boardSettings.thisWeek', 'This week')
                  : translate(
                      'auto.components.mondayCalendar.boardSettings.recentWeeks',
                      'Last {{value0}} weeks',
                      { value0: weeks }
                    )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SettingSwitch
        checked={setting.ignorePeopleFilter}
        onCheckedChange={(checked) => props.onChange({ ...setting, ignorePeopleFilter: checked })}
        label={translate(
          'auto.components.mondayCalendar.boardSettings.ignorePeople',
          'Show everyone’s tasks on this board, ignoring the people filter'
        )}
      />
      <SettingSwitch
        checked={setting.includeDone}
        onCheckedChange={(checked) => props.onChange({ ...setting, includeDone: checked })}
        label={translate(
          'auto.components.mondayCalendar.boardSettings.includeDone',
          'Always show done tasks on this board'
        )}
      />
    </div>
  )
}

/** Per-board group scope and people-filter bypass; applies immediately, no save step. */
export function MondayBoardDisplaySection(props: {
  boards: readonly MondayBoardSummary[]
  settings: MondayBoardDisplaySettings
  onChange: (settings: MondayBoardDisplaySettings) => void
}): React.JSX.Element | null {
  if (props.boards.length === 0) {
    return null
  }
  return (
    <section className="space-y-2 border-t border-border pt-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">
          {translate('auto.components.mondayCalendar.boardSettings.title', 'Board display')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.mondayCalendar.boardSettings.description',
            'Limit a board to one group or recent weeks, or keep showing its tasks whoever they belong to.'
          )}
        </p>
      </div>
      <div className="scrollbar-sleek max-h-72 space-y-2 overflow-y-auto">
        {props.boards.map((board) => (
          <BoardRow
            key={board.id}
            board={board}
            setting={props.settings[board.id] ?? DEFAULT_SETTING}
            onChange={(setting) => props.onChange({ ...props.settings, [board.id]: setting })}
          />
        ))}
      </div>
    </section>
  )
}
