import type { ServerCommandTemplate, ServerProject } from './server-files-types'

export const COMMAND_TEMPLATE_FIELDS = ['專案', '資料庫', '服務', '日期'] as const
export type CommandTemplateField = (typeof COMMAND_TEMPLATE_FIELDS)[number]
export type CommandTemplateValues = Record<CommandTemplateField, string>

const PLACEHOLDER = /\{(專案|資料庫|服務|日期)\}/g

/** Fields a template uses, in the order they first appear. */
export function commandTemplateFields(command: string): CommandTemplateField[] {
  const seen = new Set<CommandTemplateField>()
  for (const match of command.matchAll(PLACEHOLDER)) {
    const field = COMMAND_TEMPLATE_FIELDS.find((candidate) => candidate === match[1])
    if (field) {
      seen.add(field)
    }
  }
  return [...seen]
}

export function renderCommandTemplate(command: string, values: CommandTemplateValues): string {
  return command.replace(PLACEHOLDER, (_match, name: string) => {
    const field = COMMAND_TEMPLATE_FIELDS.find((candidate) => candidate === name)
    return field ? values[field] : ''
  })
}

/** The user's backup folders are named like `myshop_1013` (month and day). */
export function formatCommandTemplateDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}${day}`
}

export function commandTemplateValuesForProject(
  project: ServerProject | null,
  date: Date
): CommandTemplateValues {
  return {
    專案: project?.name ?? '',
    資料庫: project?.databaseName || (project ? `${project.name}_db` : ''),
    服務: project?.serviceName ?? '',
    日期: formatCommandTemplateDate(date)
  }
}

export type DefaultCommandTemplateLabels = {
  stop: string
  restart: string
  status: string
  backupDatabase: string
}

export function defaultCommandTemplates(
  createId: () => string,
  labels: DefaultCommandTemplateLabels
): ServerCommandTemplate[] {
  return [
    { id: createId(), label: labels.stop, command: 'sudo systemctl stop {服務}' },
    { id: createId(), label: labels.restart, command: 'sudo systemctl restart {服務}' },
    { id: createId(), label: labels.status, command: 'sudo systemctl status {服務}' },
    {
      id: createId(),
      label: labels.backupDatabase,
      command:
        'mkdir -p ~/backupdb/{專案}_{日期} && sudo mysqldump -u root -p {資料庫} > ~/backupdb/{專案}_{日期}/{資料庫}.sql'
    }
  ]
}
