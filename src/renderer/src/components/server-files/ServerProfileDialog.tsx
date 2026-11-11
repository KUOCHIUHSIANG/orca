import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { defaultCommandTemplates } from '../../../../shared/server-files-command-template'
import { normalizeRemotePath } from '../../../../shared/server-files-paths'
import type { ServerProfile, ServerProfileSummary } from '../../../../shared/server-files-types'
import { ServerProfileConnectionFields, type PasswordDraft } from './ServerProfileConnectionFields'
import { ProjectsFields, ProtectedPathsFields, TemplatesFields } from './ServerProfileListFields'
import { errorSummary } from './server-files-messages'
import { useServerFilesPrompts } from './server-files-prompts-context'
import { toProfile } from './server-files-store'
import { createNonSecureContextUuid as createBrowserUuid } from '../../../../shared/non-secure-context-uuid'

export type ProfileTab = 'connection' | 'protected' | 'projects' | 'templates'

export type ProfileDialogRequest = { profile: ServerProfileSummary | null; tab: ProfileTab }

export function newServerProfile(): ServerProfile {
  return {
    id: createBrowserUuid(),
    label: '',
    endpoint: { kind: 'ssh-config', alias: '' },
    auth: 'auto',
    identityFile: '',
    startPath: '',
    downloadDir: '',
    protectedPaths: [],
    projects: [],
    commandTemplates: defaultCommandTemplates(createBrowserUuid, {
      stop: translate('auto.components.serverFiles.templates.stop', 'Stop service'),
      restart: translate('auto.components.serverFiles.templates.restart', 'Restart service'),
      status: translate('auto.components.serverFiles.templates.status', 'Service status'),
      backupDatabase: translate(
        'auto.components.serverFiles.templates.backupDatabase',
        'Back up database'
      )
    })
  }
}

/** What the server would reject, so Save can say why before it is pressed. */
function validationError(draft: ServerProfile): string | null {
  if (!draft.label.trim()) {
    return translate('auto.components.serverFiles.profile.needName', 'Give the connection a name')
  }
  if (draft.endpoint.kind === 'ssh-config' ? !draft.endpoint.alias : !draft.endpoint.host) {
    return translate('auto.components.serverFiles.profile.needHost', 'Choose a host')
  }
  if (
    draft.endpoint.kind === 'manual' &&
    (draft.endpoint.port < 1 || draft.endpoint.port > 65_535)
  ) {
    return translate(
      'auto.components.serverFiles.profile.badPort',
      'The port must be between 1 and 65535'
    )
  }
  const remotePaths = [
    ...draft.protectedPaths.filter((path) => path.trim()),
    ...draft.projects
      .flatMap((project) => [project.projectPath, project.backupPath])
      .filter(Boolean),
    ...(draft.startPath ? [draft.startPath] : [])
  ]
  if (remotePaths.some((path) => normalizeRemotePath(path.trim()) === null)) {
    return translate(
      'auto.components.serverFiles.profile.absolutePaths',
      'Server paths must start with /'
    )
  }
  if (draft.projects.some((project) => !project.name.trim())) {
    return translate(
      'auto.components.serverFiles.profile.needProjectName',
      'Every project needs a name'
    )
  }
  if (
    draft.commandTemplates.some((template) => !template.label.trim() || !template.command.trim())
  ) {
    return translate(
      'auto.components.serverFiles.profile.needTemplate',
      'Every command needs a name and a command'
    )
  }
  return null
}

type ProfileDialogProps = {
  onClose: () => void
  onSaved: (profile: ServerProfileSummary) => void
  onDeleted: (serverId: string) => void
}

/** Remounted per request (keyed), so a draft never leaks from one connection into another. */
function ProfileBody(
  props: ProfileDialogProps & { request: ProfileDialogRequest }
): React.JSX.Element {
  const { request, onClose } = props
  const prompts = useServerFilesPrompts()
  const [draft, setDraft] = useState<ServerProfile>(() =>
    request.profile ? toProfile(request.profile) : newServerProfile()
  )
  const [password, setPassword] = useState<PasswordDraft>({ value: '', touched: false })
  const [tab, setTab] = useState<ProfileTab>(request.tab)
  const [canSavePasswords, setCanSavePasswords] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    void window.api.serverFiles
      .canSavePasswords()
      .then((result) => setCanSavePasswords(result.ok && result.value))
  }, [])

  const error = validationError(draft)
  const save = async (): Promise<void> => {
    if (error) {
      return
    }
    setSaving(true)
    const profile: ServerProfile = {
      ...draft,
      label: draft.label.trim(),
      protectedPaths: draft.protectedPaths.map((path) => path.trim()).filter(Boolean)
    }
    const result = await window.api.serverFiles.saveProfile({
      profile,
      ...(password.touched ? { password: password.value || null } : {})
    })
    setSaving(false)
    if (!result.ok) {
      toast.error(errorSummary(result.error))
      return
    }
    props.onSaved(result.value)
    onClose()
  }
  const remove = async (): Promise<void> => {
    if (!request.profile) {
      return
    }
    const confirmed = await prompts.confirmPaths({
      title: translate(
        'auto.components.serverFiles.profile.deleteTitle',
        'Delete the connection “{{value0}}”?',
        {
          value0: request.profile.label
        }
      ),
      message: translate(
        'auto.components.serverFiles.profile.deleteMessage',
        'Only this saved connection and its password are removed. Nothing on the server changes.'
      ),
      paths: [],
      confirmLabel: translate('auto.components.serverFiles.profile.delete', 'Delete connection'),
      destructive: true
    })
    if (!confirmed) {
      return
    }
    const result = await window.api.serverFiles.deleteProfile({ serverId: request.profile.id })
    if (!result.ok) {
      toast.error(errorSummary(result.error))
      return
    }
    props.onDeleted(request.profile.id)
    onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {request.profile
            ? translate('auto.components.serverFiles.profile.editTitle', 'Connection settings')
            : translate('auto.components.serverFiles.profile.newTitle', 'New connection')}
        </DialogTitle>
      </DialogHeader>
      <Tabs
        value={tab}
        onValueChange={(value) =>
          setTab(
            value === 'protected' || value === 'projects' || value === 'templates'
              ? value
              : 'connection'
          )
        }
      >
        <TabsList>
          <TabsTrigger value="connection">
            {translate('auto.components.serverFiles.profile.tabConnection', 'Connection')}
          </TabsTrigger>
          <TabsTrigger value="protected">
            {translate('auto.components.serverFiles.profile.tabProtected', 'Protected paths')}
          </TabsTrigger>
          <TabsTrigger value="projects">
            {translate('auto.components.serverFiles.profile.tabProjects', 'Projects')}
          </TabsTrigger>
          <TabsTrigger value="templates">
            {translate('auto.components.serverFiles.profile.tabTemplates', 'Commands')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="connection">
          <ServerProfileConnectionFields
            draft={draft}
            onChange={setDraft}
            password={password}
            onPasswordChange={setPassword}
            hasSavedPassword={request.profile?.hasSavedPassword ?? false}
            canSavePasswords={canSavePasswords}
          />
        </TabsContent>
        <TabsContent value="protected">
          <ProtectedPathsFields draft={draft} onChange={setDraft} />
        </TabsContent>
        <TabsContent value="projects">
          <ProjectsFields draft={draft} onChange={setDraft} />
        </TabsContent>
        <TabsContent value="templates">
          <TemplatesFields draft={draft} onChange={setDraft} />
        </TabsContent>
      </Tabs>
      <DialogFooter className="items-center sm:justify-between">
        {request.profile ? (
          <Button variant="ghost" onClick={() => void remove()}>
            {translate('auto.components.serverFiles.profile.delete', 'Delete connection')}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {error ? <span className="text-xs text-muted-foreground">{error}</span> : null}
          <Button variant="ghost" onClick={onClose}>
            {translate('auto.components.serverFiles.dialog.cancel', 'Cancel')}
          </Button>
          <Button disabled={error !== null || saving} onClick={() => void save()}>
            {translate('auto.components.serverFiles.profile.save', 'Save')}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

export function ServerProfileDialog(
  props: ProfileDialogProps & { request: ProfileDialogRequest | null }
): React.JSX.Element {
  const { request, ...handlers } = props
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && handlers.onClose()}>
      <DialogContent className="sm:max-w-2xl" scrollable>
        {request ? (
          <ProfileBody key={request.profile?.id ?? 'new'} request={request} {...handlers} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
