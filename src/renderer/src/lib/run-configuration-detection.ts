import { basename, dirname, joinPath } from '@/lib/path'
import { relativePathInsideRoot } from '../../../shared/cross-platform-path'
import { parseDotnetLaunchProfiles } from './dotnet-launch-profiles'
import type {
  RunConfiguration,
  RunConfigurationType
} from '../../../shared/run-configuration-types'

function makeId(type: RunConfigurationType, projectPath: string, scriptName?: string): string {
  const base = `${type}:${projectPath}`
  return scriptName ? `${base}:${scriptName}` : base
}

function stripExtension(name: string, ext: string): string {
  return name.endsWith(ext) ? name.slice(0, -ext.length) : name
}

async function readDirSafe(dirPath: string): Promise<{ name: string; isDirectory: boolean }[]> {
  try {
    return await window.api.fs.readDir({ dirPath })
  } catch {
    return []
  }
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    const result = await window.api.fs.readFile({ filePath })
    if (result.isBinary) {
      return null
    }
    return result.content
  } catch {
    return null
  }
}

const SKIP_DIRS = new Set([
  'node_modules',
  'bin',
  'obj',
  'packages',
  'dist',
  'build',
  '.git',
  '.vs',
  '.idea',
  '.vscode',
  'TestResults',
  'coverage'
])

async function findFilesByName(
  rootPath: string,
  predicate: (name: string) => boolean,
  maxDepth: number,
  currentDepth = 0
): Promise<string[]> {
  if (currentDepth > maxDepth) {
    return []
  }
  const entries = await readDirSafe(rootPath)
  const results: string[] = []
  const subdirs: string[] = []

  for (const entry of entries) {
    const fullPath = joinPath(rootPath, entry.name)
    if (!entry.isDirectory && predicate(entry.name)) {
      results.push(fullPath)
    } else if (entry.isDirectory && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
      subdirs.push(fullPath)
    }
  }

  const nested = await Promise.all(
    subdirs.map((dir) => findFilesByName(dir, predicate, maxDepth, currentDepth + 1))
  )
  return results.concat(...nested)
}

function getRelativePath(rootPath: string, filePath: string): string {
  return relativePathInsideRoot(rootPath, filePath) ?? filePath
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const LEGACY_FRAMEWORK_RE = /^netcoreapp[23]\./

function extractTargetFramework(csprojContent: string): string | null {
  const match = /<TargetFramework>([\s\S]*?)<\/TargetFramework>/i.exec(csprojContent)
  return match ? match[1].trim() : null
}

function isLegacyFramework(framework: string | null): boolean {
  if (!framework) {
    return false
  }
  return LEGACY_FRAMEWORK_RE.test(framework)
}

function dotnetBinaryForFramework(framework: string | null): string {
  if (isLegacyFramework(framework)) {
    return '$HOME/.dotnet/x64/dotnet'
  }
  return '$HOME/.dotnet/dotnet'
}

function formatFrameworkLabel(framework: string | null): string {
  if (!framework) {
    return ''
  }
  if (framework.startsWith('netcoreapp')) {
    return ` (.NET Core ${framework.replace('netcoreapp', '')})`
  }
  if (framework.startsWith('net') && framework.includes('.')) {
    return ` (.NET ${framework.replace('net', '')})`
  }
  return ` (${framework})`
}

// Test projects run through `dotnet test`, not `dotnet run`.
const TEST_PROJECT_RE = /Microsoft\.NET\.Test\.Sdk|<IsTestProject>\s*true\s*<\/IsTestProject>/i

async function detectDotnetConfigs(repoPath: string): Promise<RunConfiguration[]> {
  const csprojFiles = await findFilesByName(repoPath, (name) => name.endsWith('.csproj'), 4)
  const configs: RunConfiguration[] = []

  for (const filePath of csprojFiles) {
    const content = await readFileSafe(filePath)
    if (content && TEST_PROJECT_RE.test(content)) {
      continue
    }
    const framework = content ? extractTargetFramework(content) : null
    const projectName = stripExtension(basename(filePath), '.csproj')
    const relativePath = getRelativePath(repoPath, filePath)
    const baseCommand = `${dotnetBinaryForFramework(framework)} run --project ${JSON.stringify(relativePath)}`
    const launchSettings = await readFileSafe(
      joinPath(joinPath(dirname(filePath), 'Properties'), 'launchSettings.json')
    )
    const profiles = launchSettings ? parseDotnetLaunchProfiles(launchSettings) : []
    const projectLabel = `${projectName}${formatFrameworkLabel(framework)}`

    if (profiles.length === 0) {
      configs.push({
        id: makeId('dotnet', filePath),
        type: 'dotnet' as const,
        label: projectLabel,
        command: baseCommand,
        projectPath: filePath,
        isAutoDetected: true
      })
      continue
    }

    for (const profile of profiles) {
      configs.push({
        id: makeId('dotnet', filePath, profile.name),
        type: 'dotnet' as const,
        label: `${projectName}: ${profile.name}`,
        command: `${baseCommand} --launch-profile ${JSON.stringify(profile.name)}`,
        detail: profile.applicationUrl ?? undefined,
        group: { label: projectLabel, itemLabel: profile.name },
        projectPath: filePath,
        isAutoDetected: true
      })
    }
  }

  return configs
}

const BUILD_SCRIPT_RE = /^build(:|$)/

// Only launchers belong in the run menu; `start` stands in for `dev` in CRA-style packages.
function selectRunnableScripts(scriptNames: string[]): string[] {
  const hasDev = scriptNames.includes('dev')
  return scriptNames.filter(
    (name) => name === 'dev' || BUILD_SCRIPT_RE.test(name) || (!hasDev && name === 'start')
  )
}

async function detectNpmConfigs(repoPath: string): Promise<RunConfiguration[]> {
  const packageJsonFiles = await findFilesByName(repoPath, (name) => name === 'package.json', 3)
  const configs: RunConfiguration[] = []

  for (const filePath of packageJsonFiles) {
    const content = await readFileSafe(filePath)
    if (!content) {
      continue
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      continue
    }

    if (!isRecord(parsed)) {
      continue
    }
    const scripts = parsed['scripts']
    if (!isRecord(scripts)) {
      continue
    }

    const dirPath = dirname(filePath)
    const isRoot = dirPath === repoPath
    const packageName = typeof parsed['name'] === 'string' ? parsed['name'] : basename(dirPath)

    const labelPrefix = isRoot ? '' : `${packageName}: `
    for (const scriptName of selectRunnableScripts(Object.keys(scripts))) {
      const prefix = isRoot ? '' : ` --prefix ${JSON.stringify(getRelativePath(repoPath, dirPath))}`
      configs.push({
        id: makeId('npm', filePath, scriptName),
        type: 'npm' as const,
        label: `${labelPrefix}${scriptName}`,
        command: `npm run ${scriptName}${prefix}`,
        group: BUILD_SCRIPT_RE.test(scriptName)
          ? { label: `${labelPrefix}build`, itemLabel: scriptName }
          : undefined,
        projectPath: filePath,
        isAutoDetected: true
      })
    }
  }

  return configs
}

export async function detectRunConfigurations(repoPath: string): Promise<RunConfiguration[]> {
  const [dotnet, npm] = await Promise.all([
    detectDotnetConfigs(repoPath),
    detectNpmConfigs(repoPath)
  ])
  return [...dotnet, ...npm]
}
