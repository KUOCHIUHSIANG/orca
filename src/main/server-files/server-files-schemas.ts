import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { normalizeRemotePath } from '../../shared/server-files-paths'

const MAX_PATH = 4096

export const ServerIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)

export const RemotePathSchema = z
  .string()
  .min(1)
  .max(MAX_PATH)
  .refine((value) => normalizeRemotePath(value) !== null, 'Remote paths must be absolute')

const OptionalRemotePathSchema = z.union([z.literal(''), RemotePathSchema])

export const LocalPathSchema = z
  .string()
  .min(1)
  .max(MAX_PATH)
  .refine((value) => isAbsolute(value) && !value.includes('\0'), 'Local paths must be absolute')

const OptionalLocalPathSchema = z.union([z.literal(''), LocalPathSchema])

// Never a leading "-": these reach `ssh` argv and must not read as options.
const AliasSchema = z
  .string()
  .max(255)
  .regex(/^[A-Za-z0-9._@%+:][A-Za-z0-9._@%+:-]*$/)
const HostSchema = z
  .string()
  .max(255)
  .regex(/^[A-Za-z0-9._:%[\]][A-Za-z0-9._:%[\]-]*$/)
const UserSchema = z
  .string()
  .max(64)
  .regex(/^(?:[A-Za-z0-9._][A-Za-z0-9._-]*)?$/)

const IdentityFileSchema = z
  .string()
  .max(MAX_PATH)
  .refine(
    (value) => value === '' || value.startsWith('~/') || isAbsolute(value),
    'Key files must be absolute or start with ~/'
  )

export const ServerEndpointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ssh-config'), alias: AliasSchema }).strict(),
  z
    .object({
      kind: z.literal('manual'),
      host: HostSchema,
      port: z.number().int().min(1).max(65_535),
      username: UserSchema
    })
    .strict()
])

const ServerProjectSchema = z
  .object({
    id: ServerIdSchema,
    name: z.string().trim().min(1).max(100),
    projectPath: OptionalRemotePathSchema,
    backupPath: OptionalRemotePathSchema,
    serviceName: z.string().max(200),
    databaseName: z.string().max(200)
  })
  .strict()

const ServerCommandTemplateSchema = z
  .object({
    id: ServerIdSchema,
    label: z.string().trim().min(1).max(100),
    command: z.string().min(1).max(4000)
  })
  .strict()

export const ServerProfileSchema = z
  .object({
    id: ServerIdSchema,
    label: z.string().trim().min(1).max(100),
    endpoint: ServerEndpointSchema,
    auth: z.enum(['auto', 'key', 'password']),
    identityFile: IdentityFileSchema,
    startPath: OptionalRemotePathSchema,
    downloadDir: OptionalLocalPathSchema,
    protectedPaths: z.array(RemotePathSchema).max(100),
    projects: z.array(ServerProjectSchema).max(50),
    commandTemplates: z.array(ServerCommandTemplateSchema).max(100)
  })
  .strict()

export const ProfileSaveSchema = z
  .object({
    profile: ServerProfileSchema,
    password: z.string().max(1024).nullable().optional()
  })
  .strict()

export const ServerOnlySchema = z.object({ serverId: ServerIdSchema }).strict()

export const ListSchema = z.object({ serverId: ServerIdSchema, path: RemotePathSchema }).strict()

const Paths = (schema: typeof RemotePathSchema | typeof LocalPathSchema) =>
  z.array(schema).min(1).max(1000)

export const UploadPlanSchema = z
  .object({
    serverId: ServerIdSchema,
    sources: Paths(LocalPathSchema),
    destinationDir: RemotePathSchema,
    mode: z.enum(['items', 'contents'])
  })
  .strict()

export const DownloadPlanSchema = z
  .object({
    serverId: ServerIdSchema,
    sources: Paths(RemotePathSchema),
    destinationDir: LocalPathSchema
  })
  .strict()

export const TransferExecuteSchema = z
  .object({
    planId: z.uuid(),
    jobId: z.uuid(),
    policy: z.enum(['overwrite', 'skip', 'newer', 'each']),
    overwrite: z.array(z.string().max(MAX_PATH)).max(50_000),
    protectedConfirmed: z.boolean()
  })
  .strict()

export const RemovePlanSchema = z
  .object({ serverId: ServerIdSchema, paths: Paths(RemotePathSchema) })
  .strict()

export const PlanJobSchema = z.object({ planId: z.uuid(), jobId: z.uuid() }).strict()

export const CopyPlanSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('copy'),
      serverId: ServerIdSchema,
      sources: Paths(RemotePathSchema),
      destinationDir: RemotePathSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal('backup'),
      serverId: ServerIdSchema,
      projectId: ServerIdSchema,
      sources: Paths(RemotePathSchema)
    })
    .strict()
])

export const CopyExecuteSchema = z
  .object({
    planId: z.uuid(),
    jobId: z.uuid(),
    clearLeftovers: z.boolean(),
    overwriteExisting: z.boolean(),
    protectedConfirmed: z.boolean()
  })
  .strict()

export const EntryNameSchema = z.string().min(1).max(255)

export const MkdirSchema = z
  .object({ serverId: ServerIdSchema, parentDir: RemotePathSchema, name: EntryNameSchema })
  .strict()

export const RenameSchema = z
  .object({ serverId: ServerIdSchema, path: RemotePathSchema, newName: EntryNameSchema })
  .strict()

export const TerminalCommandSchema = z
  .object({
    serverId: ServerIdSchema,
    cwd: RemotePathSchema,
    localShell: z.enum(['posix', 'powershell', 'cmd']),
    prefill: z
      .object({ command: z.string().min(1).max(4000), hint: z.string().max(200) })
      .strict()
      .optional()
  })
  .strict()

export const JobIdSchema = z.object({ jobId: z.uuid() }).strict()

export const NoArgsSchema = z.undefined()

export const PlanOnlySchema = z.object({ planId: z.uuid() }).strict()

export const PickLocalSchema = z
  .object({
    kind: z.enum(['files', 'folders', 'folder']),
    defaultPath: z.union([z.literal(''), LocalPathSchema]).optional()
  })
  .strict()

export const LocalPathOnlySchema = z.object({ path: LocalPathSchema }).strict()
