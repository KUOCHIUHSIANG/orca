import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { COMMAND_TEMPLATE_FIELDS } from '../../../../shared/server-files-command-template'
import type { ServerProfile, ServerProject } from '../../../../shared/server-files-types'
import { createBrowserUuid } from '@/lib/browser-uuid'

type FieldsProps = { draft: ServerProfile; onChange: (next: ServerProfile) => void }

const PROTECTED_PATH_EXAMPLE = '/var/www/myshop'

export function ProtectedPathsFields({ draft, onChange }: FieldsProps): React.JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor="server-files-protected">
        {translate(
          'auto.components.serverFiles.profile.protectedLabel',
          'Protected paths, one per line'
        )}
      </Label>
      <Textarea
        id="server-files-protected"
        rows={6}
        variant="code"
        placeholder={PROTECTED_PATH_EXAMPLE}
        value={draft.protectedPaths.join('\n')}
        onChange={(e) => onChange({ ...draft, protectedPaths: e.target.value.split('\n') })}
      />
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.serverFiles.profile.protectedHint',
          'Nothing at or under these paths can be deleted or renamed from here, even when the server allows it. Overwriting files there asks once more and lists them. Symlinked spellings are covered too.'
        )}
      </p>
    </div>
  )
}

function ProjectCard(props: {
  project: ServerProject
  onChange: (next: ServerProject) => void
  onRemove: () => void
}): React.JSX.Element {
  const { project, onChange } = props
  const field = (key: keyof Omit<ServerProject, 'id'>, label: string, placeholder: string) => (
    <div className="space-y-1">
      <Label htmlFor={`server-files-project-${project.id}-${key}`}>{label}</Label>
      <Input
        id={`server-files-project-${project.id}-${key}`}
        value={project[key]}
        placeholder={placeholder}
        className="h-8"
        onChange={(e) => onChange({ ...project, [key]: e.target.value })}
      />
    </div>
  )
  return (
    <div className="relative grid grid-cols-2 gap-3 rounded-md border border-border p-3">
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-1 right-1"
        onClick={props.onRemove}
        aria-label={translate(
          'auto.components.serverFiles.profile.removeProject',
          'Remove project'
        )}
      >
        <X />
      </Button>
      {field(
        'name',
        translate('auto.components.serverFiles.profile.projectName', 'Project name'),
        'myshop'
      )}
      {field(
        'serviceName',
        translate('auto.components.serverFiles.profile.service', 'Service'),
        'kestrel-myshop.service'
      )}
      {field(
        'projectPath',
        translate('auto.components.serverFiles.profile.projectPath', 'Project folder'),
        '/var/www/myshop'
      )}
      {field(
        'backupPath',
        translate('auto.components.serverFiles.profile.backupPath', 'Backup folder'),
        '/home/me/project'
      )}
      {field(
        'databaseName',
        translate('auto.components.serverFiles.profile.database', 'Database'),
        'myshop_db'
      )}
    </div>
  )
}

export function ProjectsFields({ draft, onChange }: FieldsProps): React.JSX.Element {
  const update = (projects: ServerProject[]): void => onChange({ ...draft, projects })
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.serverFiles.profile.projectsHint',
          'Back up copies items to the backup folder at the same path inside it. Commands fill {專案} {資料庫} {服務} from the project you are browsing.'
        )}
      </p>
      {draft.projects.map((project, index) => (
        <ProjectCard
          key={project.id}
          project={project}
          onChange={(next) => update(draft.projects.map((p, i) => (i === index ? next : p)))}
          onRemove={() => update(draft.projects.filter((_, i) => i !== index))}
        />
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          update([
            ...draft.projects,
            {
              id: createBrowserUuid(),
              name: '',
              projectPath: '',
              backupPath: '',
              serviceName: '',
              databaseName: ''
            }
          ])
        }
      >
        <Plus />
        {translate('auto.components.serverFiles.profile.addProject', 'Add project')}
      </Button>
    </div>
  )
}

export function TemplatesFields({ draft, onChange }: FieldsProps): React.JSX.Element {
  const update = (commandTemplates: ServerProfile['commandTemplates']): void =>
    onChange({ ...draft, commandTemplates })
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {translate(
          'auto.components.serverFiles.profile.templatesHint',
          'Fields you can use: {{value0}}. Commands are typed into the terminal without Enter.',
          {
            value0: COMMAND_TEMPLATE_FIELDS.map((field) => `{${field}}`).join(' ')
          }
        )}
      </p>
      {draft.commandTemplates.map((template, index) => (
        <div key={template.id} className="flex items-start gap-2">
          <Input
            value={template.label}
            className="h-8 w-40 shrink-0"
            aria-label={translate('auto.components.serverFiles.profile.templateName', 'Name')}
            onChange={(e) =>
              update(
                draft.commandTemplates.map((t, i) =>
                  i === index ? { ...t, label: e.target.value } : t
                )
              )
            }
          />
          <Input
            value={template.command}
            className="h-8 flex-1"
            aria-label={translate('auto.components.serverFiles.profile.templateCommand', 'Command')}
            onChange={(e) =>
              update(
                draft.commandTemplates.map((t, i) =>
                  i === index ? { ...t, command: e.target.value } : t
                )
              )
            }
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => update(draft.commandTemplates.filter((_, i) => i !== index))}
            aria-label={translate(
              'auto.components.serverFiles.profile.removeTemplate',
              'Remove command'
            )}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          update([...draft.commandTemplates, { id: createBrowserUuid(), label: '', command: '' }])
        }
      >
        <Plus />
        {translate('auto.components.serverFiles.profile.addTemplate', 'Add command')}
      </Button>
    </div>
  )
}
