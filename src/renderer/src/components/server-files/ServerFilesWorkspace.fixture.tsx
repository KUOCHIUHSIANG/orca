import { defineFixture } from '../../component-fixtures/component-fixture'
import type {
  RemoteDirectoryState,
  RemoteEntry,
  ServerProfileSummary
} from '../../../../shared/server-files-types'
import { ServerFilesPromptsProvider } from './ServerFilesPrompts'
import { useServerJobsStore } from './server-files-jobs-store'
import { useServerFilesStore } from './server-files-store'
import { ServerListPanel } from './ServerListPanel'
import { TemplatesFields } from './ServerProfileListFields'
import { toProfile } from './server-files-store'
import { ServerWorkspace } from './ServerWorkspace'

const NOW = Date.UTC(2026, 9, 30, 6, 20)

const profile: ServerProfileSummary = {
  id: 'prod',
  label: 'prod-api',
  endpoint: { kind: 'ssh-config', alias: 'prod-api' },
  auth: 'auto',
  identityFile: '',
  startPath: '/var/www/myshop',
  downloadDir: '',
  protectedPaths: ['/var/www/myshop'],
  projects: [
    {
      id: 'myshop',
      name: 'myshop',
      projectPath: '/var/www/myshop',
      backupPath: '/home/deploy/project',
      serviceName: 'kestrel-myshop.service',
      databaseName: 'myshop_db'
    }
  ],
  commandTemplates: [
    { id: 't1', label: 'Restart service', command: 'sudo systemctl restart {服務}' }
  ],
  hasSavedPassword: false
}

function entry(path: string, overrides: Partial<RemoteEntry>): RemoteEntry {
  return {
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    kind: 'file',
    targetIsDirectory: false,
    size: 1_234_567,
    modifiedMs: NOW,
    mode: 0o100664,
    uid: 1001,
    gid: 33,
    owner: 'deploy',
    group: 'www-data',
    ...overrides
  }
}

const project: RemoteDirectoryState = {
  path: '/var/www/myshop',
  node: { mode: 0o40755, uid: 0, gid: 0, owner: 'root', group: 'root' },
  writable: false,
  readOnlyFilesystem: false,
  freeBytes: 12_400_000_000,
  entries: [
    entry('/var/www/myshop/wwwroot', { kind: 'directory', mode: 0o40775, size: 4096 }),
    entry('/var/www/myshop/myshop.dll', {}),
    entry('/var/www/myshop/myshop.pdb', { size: 301_000 }),
    entry('/var/www/myshop/appsettings.json', {
      size: 4_100,
      mode: 0o100640,
      owner: 'root',
      uid: 0,
      modifiedMs: NOW - 60 * 86_400_000
    })
  ]
}

const backup: RemoteDirectoryState = {
  path: '/home/deploy/project',
  node: { mode: 0o40755, uid: 1001, gid: 1001, owner: 'deploy', group: 'deploy' },
  writable: true,
  readOnlyFilesystem: false,
  freeBytes: 12_400_000_000,
  entries: [
    entry('/home/deploy/project/myshop.dll', { group: 'deploy', gid: 1001 }),
    entry('/home/deploy/project/myshop.pdb', { group: 'deploy', gid: 1001, size: 301_000 })
  ]
}

function pane(listing: RemoteDirectoryState, selected: string[] = [], highlighted: string[] = []) {
  return {
    path: listing.path,
    listing,
    loading: false,
    error: null,
    selected,
    anchor: selected[0] ?? null,
    highlighted
  }
}

export const workspace = defineFixture({
  width: 1280,
  setup: () => {
    useServerFilesStore.setState({
      profiles: [profile],
      selectedServerId: 'prod',
      sessions: {
        prod: {
          status: 'connected',
          info: {
            identity: {
              uid: 1001,
              gids: [1001, 33],
              userName: 'deploy',
              groupNames: ['deploy', 'www-data']
            },
            homePath: '/home/deploy',
            loginShell: 'bash',
            protectedRoots: ['/var/www/myshop']
          }
        }
      },
      workspaces: {
        prod: {
          panes: [
            pane(project, ['/var/www/myshop/myshop.dll']),
            pane(backup, [], ['/home/deploy/project/myshop.dll'])
          ],
          split: true,
          activePane: 0
        }
      }
    })
    useServerJobsStore.setState({
      jobs: [
        {
          jobId: 'a',
          serverId: 'prod',
          kind: 'upload',
          title: 'Upload to /var/www/myshop',
          status: 'running',
          progress: {
            jobId: 'a',
            transferredBytes: 31_000_000,
            totalBytes: 44_000_000,
            completedFiles: 37,
            totalFiles: 52,
            currentPath: '/var/www/myshop/Microsoft.Data.SqlClient.dll'
          },
          outcome: null,
          error: null,
          startedAt: NOW - 15_000,
          updatedAt: NOW
        },
        {
          jobId: 'b',
          serverId: 'prod',
          kind: 'remove',
          title: 'Delete 1 items',
          status: 'failed',
          progress: null,
          outcome: null,
          error: {
            code: 'permission-denied',
            message: 'Permission denied',
            path: '/var/www/old/app.dll',
            detail: 'Permission denied: /var/www/old/app.dll'
          },
          startedAt: NOW,
          updatedAt: NOW
        }
      ]
    })
  },
  render: () => (
    <ServerFilesPromptsProvider>
      <div className="flex h-[640px] border border-border">
        <ServerListPanel onSelect={() => {}} onAdd={() => {}} />
        <ServerWorkspace profile={profile} onEditProfile={() => {}} />
      </div>
    </ServerFilesPromptsProvider>
  )
})

export const templates = defineFixture({
  width: 720,
  render: () => (
    <TemplatesFields
      draft={{
        ...toProfile(profile),
        commandTemplates: [
          { id: 'a', label: 'Restart service', command: 'sudo systemctl restart {服務}' },
          { id: 'b', label: 'List databases', command: 'sudo mysql -u root -e "SHOW DATABASES;"' },
          {
            id: 'c',
            label: 'Check project db',
            command: 'sudo mysql -u root -p -e "SHOW DATABASES LIKE \'%{專案}%\';"'
          }
        ]
      }}
      onChange={() => {}}
    />
  )
})
