import { useEffect, useState } from 'react'
import { FolderOpen, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import type { SshConfigHostSummary } from '../../../../shared/ssh-types'
import type { ServerAuthMethod, ServerProfile } from '../../../../shared/server-files-types'

export type PasswordDraft = { value: string; touched: boolean }

const START_PATH_EXAMPLE = '/var/www'
const KEY_FILE_EXAMPLE = '~/.ssh/id_ed25519'

function Field(props: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      {props.children}
      {props.hint ? <p className="text-xs text-muted-foreground">{props.hint}</p> : null}
    </div>
  )
}

async function pickInto(kind: 'files' | 'folder', apply: (path: string) => void): Promise<void> {
  const result = await window.api.serverFiles.pickLocal({ kind })
  if (result.ok && result.value[0]) {
    apply(result.value[0])
  }
}

export function ServerProfileConnectionFields(props: {
  draft: ServerProfile
  onChange: (next: ServerProfile) => void
  password: PasswordDraft
  onPasswordChange: (next: PasswordDraft) => void
  hasSavedPassword: boolean
  canSavePasswords: boolean
}): React.JSX.Element {
  const { draft, onChange, password, onPasswordChange } = props
  const [hosts, setHosts] = useState<SshConfigHostSummary[]>([])
  useEffect(() => {
    void window.api.ssh
      .listConfigHosts({ refresh: true })
      .then((result) => setHosts(result.hosts))
      .catch(() => setHosts([]))
  }, [])
  const endpoint = draft.endpoint
  const chosenHost =
    endpoint.kind === 'ssh-config' ? hosts.find((host) => host.alias === endpoint.alias) : undefined
  const viaJump = Boolean(chosenHost?.jumpHost || chosenHost?.proxyCommand)
  const setAuth = (auth: ServerAuthMethod): void => onChange({ ...draft, auth })

  return (
    <div className="space-y-4">
      <Field
        id="server-files-label"
        label={translate('auto.components.serverFiles.profile.name', 'Name')}
      >
        <Input
          id="server-files-label"
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
        />
      </Field>
      <RadioGroup
        value={endpoint.kind}
        onValueChange={(kind) =>
          onChange({
            ...draft,
            endpoint:
              kind === 'manual'
                ? { kind: 'manual', host: '', port: 22, username: '' }
                : { kind: 'ssh-config', alias: hosts[0]?.alias ?? '' }
          })
        }
        className="flex flex-wrap"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="ssh-config" id="server-files-kind-config" />
          <Label htmlFor="server-files-kind-config">
            {translate('auto.components.serverFiles.profile.useConfig', 'Host from ~/.ssh/config')}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="manual" id="server-files-kind-manual" />
          <Label htmlFor="server-files-kind-manual">
            {translate('auto.components.serverFiles.profile.manual', 'Enter host and account')}
          </Label>
        </div>
      </RadioGroup>
      {endpoint.kind === 'ssh-config' ? (
        <Field
          id="server-files-alias"
          label={translate('auto.components.serverFiles.profile.alias', 'Host alias')}
        >
          <Select
            value={endpoint.alias}
            onValueChange={(alias) =>
              onChange({ ...draft, endpoint: { kind: 'ssh-config', alias } })
            }
          >
            <SelectTrigger id="server-files-alias" className="w-full">
              <SelectValue
                placeholder={translate(
                  'auto.components.serverFiles.profile.pickAlias',
                  'Pick a host'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {hosts.map((host) => (
                <SelectItem key={host.alias} value={host.alias}>
                  {host.alias}
                  <span className="text-muted-foreground">
                    {' '}
                    {host.username ? `${host.username}@` : ''}
                    {host.hostname}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {viaJump ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              {translate(
                'auto.components.serverFiles.profile.jumpWarning',
                'This host goes through ProxyJump or ProxyCommand. The terminal works; the file panel does not support it yet.'
              )}
            </p>
          ) : null}
        </Field>
      ) : (
        <div className="grid grid-cols-[1fr_6rem_10rem] gap-3">
          <Field
            id="server-files-host"
            label={translate('auto.components.serverFiles.profile.host', 'Host')}
          >
            <Input
              id="server-files-host"
              value={endpoint.host}

              onChange={(e) =>
                onChange({ ...draft, endpoint: { ...endpoint, host: e.target.value.trim() } })
              }
            />
          </Field>
          <Field
            id="server-files-port"
            label={translate('auto.components.serverFiles.profile.port', 'Port')}
          >
            <Input
              id="server-files-port"
              inputMode="numeric"
              value={String(endpoint.port)}
              onChange={(e) =>
                onChange({
                  ...draft,
                  endpoint: { ...endpoint, port: Number(e.target.value.replace(/\D/g, '')) || 0 }
                })
              }
            />
          </Field>
          <Field
            id="server-files-user"
            label={translate('auto.components.serverFiles.profile.user', 'Account')}
          >
            <Input
              id="server-files-user"
              value={endpoint.username}

              onChange={(e) =>
                onChange({ ...draft, endpoint: { ...endpoint, username: e.target.value.trim() } })
              }
            />
          </Field>
        </div>
      )}
      <div className="space-y-2">
        <Label>{translate('auto.components.serverFiles.profile.auth', 'Sign in with')}</Label>
        <RadioGroup
          value={draft.auth}
          onValueChange={(value) =>
            setAuth(value === 'key' ? 'key' : value === 'password' ? 'password' : 'auto')
          }
        >
          {(
            [
              [
                'auto',
                translate(
                  'auto.components.serverFiles.profile.authAuto',
                  'ssh-agent and the keys in ~/.ssh/config'
                )
              ],
              [
                'key',
                translate('auto.components.serverFiles.profile.authKey', 'A specific key file')
              ],
              [
                'password',
                translate('auto.components.serverFiles.profile.authPassword', 'Password')
              ]
            ] as const
          ).map(([value, label]) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem value={value} id={`server-files-auth-${value}`} />
              <Label htmlFor={`server-files-auth-${value}`}>{label}</Label>
            </div>
          ))}
        </RadioGroup>
        {draft.auth === 'key' ? (
          <div className="flex gap-2">
            <Input
              value={draft.identityFile}
              placeholder={KEY_FILE_EXAMPLE}

              onChange={(e) => onChange({ ...draft, identityFile: e.target.value })}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                void pickInto('files', (identityFile) => onChange({ ...draft, identityFile }))
              }
            >
              <FolderOpen />
            </Button>
          </div>
        ) : null}
        {draft.auth === 'password' ? (
          <div className="space-y-1">
            <Input
              type="password"
              autoComplete="off"
              disabled={!props.canSavePasswords}
              value={password.value}
              placeholder={
                props.hasSavedPassword && !password.touched
                  ? translate(
                      'auto.components.serverFiles.profile.passwordSaved',
                      'Saved; leave empty to keep it'
                    )
                  : ''
              }
              onChange={(e) => onPasswordChange({ value: e.target.value, touched: true })}
            />
            <p className="text-xs text-muted-foreground">
              {props.canSavePasswords
                ? translate(
                    'auto.components.serverFiles.profile.passwordNote',
                    'Encrypted with a key kept in the macOS Keychain; never written in plain text. Terminals still ask for it themselves.'
                  )
                : translate(
                    'auto.components.serverFiles.profile.passwordUnavailable',
                    'This computer cannot encrypt saved passwords, so none can be stored. You will be asked when connecting.'
                  )}
            </p>
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          id="server-files-start"
          label={translate('auto.components.serverFiles.profile.startPath', 'Open at (server)')}
          hint={translate(
            'auto.components.serverFiles.profile.startHint',
            'Empty opens your home folder'
          )}
        >
          <Input
            id="server-files-start"
            value={draft.startPath}
            placeholder={START_PATH_EXAMPLE}

            onChange={(e) => onChange({ ...draft, startPath: e.target.value.trim() })}
          />
        </Field>
        <Field
          id="server-files-download"
          label={translate(
            'auto.components.serverFiles.profile.downloadDir',
            'Download to (this computer)'
          )}
          hint={translate(
            'auto.components.serverFiles.profile.downloadHint',
            'Empty uses Downloads'
          )}
        >
          <div className="flex gap-2">
            <Input
              id="server-files-download"
              value={draft.downloadDir}

              onChange={(e) => onChange({ ...draft, downloadDir: e.target.value.trim() })}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                void pickInto('folder', (downloadDir) => onChange({ ...draft, downloadDir }))
              }
            >
              <FolderOpen />
            </Button>
          </div>
        </Field>
      </div>
    </div>
  )
}
