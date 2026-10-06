export type RunConfigurationType = 'dotnet' | 'npm'

export type RunConfiguration = {
  id: string
  type: RunConfigurationType
  /** Display label, e.g. "Project3.Ti: MvcWeb" or "dev" */
  label: string
  /** Shell command to execute, e.g. "dotnet run --project path/to/X.csproj" */
  command: string
  /** Absolute path to .csproj or package.json */
  projectPath: string
  /** Whether this was auto-detected or manually added */
  isAutoDetected: boolean
}
