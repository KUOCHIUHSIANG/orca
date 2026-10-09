import { EyeOff, TerminalSquare } from 'lucide-react'
import {
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import type { RunConfiguration } from '../../../../shared/run-configuration-types'
import { RunConfigSectionHeader, TabBarRunConfigMenuEntries } from './TabBarRunConfigMenuEntries'

function DotnetIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  )
}

type RunConfigSectionsProps = {
  configs: readonly RunConfiguration[]
  runningSet: ReadonlySet<string>
  hidden: boolean
  onSelect: (config: RunConfiguration) => void
  onToggleVisibility: (configs: RunConfiguration[]) => void
}

/** .NET projects then npm scripts, each under its own header. */
export function RunConfigSections({
  configs,
  ...entryProps
}: RunConfigSectionsProps): React.JSX.Element {
  const dotnetConfigs = configs.filter((c) => c.type === 'dotnet')
  const npmConfigs = configs.filter((c) => c.type === 'npm')
  return (
    <>
      {dotnetConfigs.length > 0 ? (
        <>
          <RunConfigSectionHeader icon={<DotnetIcon className="size-3" />} label=".NET Projects" />
          <TabBarRunConfigMenuEntries configs={dotnetConfigs} Icon={DotnetIcon} {...entryProps} />
        </>
      ) : null}
      {dotnetConfigs.length > 0 && npmConfigs.length > 0 ? <DropdownMenuSeparator /> : null}
      {npmConfigs.length > 0 ? (
        <>
          <RunConfigSectionHeader
            icon={<TerminalSquare className="size-3" />}
            label="npm Scripts"
          />
          <TabBarRunConfigMenuEntries configs={npmConfigs} Icon={TerminalSquare} {...entryProps} />
        </>
      ) : null}
    </>
  )
}

/** Configs the user (or detection) hid; they stay runnable here until shown again. */
export function RunConfigHiddenSubmenu({
  configs,
  ...sectionProps
}: Omit<RunConfigSectionsProps, 'hidden'>): React.JSX.Element {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer">
        <EyeOff className="size-3" />
        <span className="min-w-0 flex-1 truncate">Hidden</span>
        <span className="text-[10px] text-muted-foreground">{configs.length}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-80">
        <div className="max-h-80 overflow-y-auto scrollbar-sleek">
          <RunConfigSections configs={configs} hidden {...sectionProps} />
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
