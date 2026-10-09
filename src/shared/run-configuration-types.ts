export type RunConfigurationType = 'dotnet' | 'npm'

export type RunConfiguration = {
  id: string
  type: RunConfigurationType
  /** Display label, e.g. "Project3.Ti: MvcWeb" or "dev" */
  label: string
  /** Shell command to execute, e.g. "dotnet run --project path/to/X.csproj" */
  command: string
  /** Secondary text, e.g. a launch profile's application URL */
  detail?: string
  /** Submenu shared with sibling configs, e.g. { label: "EcommerceApi", itemLabel: "https" } */
  group?: { label: string; itemLabel: string }
  /** Absolute path to .csproj or package.json */
  projectPath: string
  /** Whether this was auto-detected or manually added */
  isAutoDetected: boolean
  /** Starts in the menu's Hidden submenu until the user shows it, e.g. `lint` or `test` */
  defaultHidden?: boolean
}
