import { quotePosixShell } from '../../shared/shell-argument-quoting'
import {
  buildShellCommandFromArgv,
  type AgentStartupShell
} from '../../shared/tui-agent-startup-shell'
import type { ServerProfile } from '../../shared/server-files-types'
import { wrapRemoteCommandForPosixShell } from '../ssh/ssh-posix-command-wrapper'

const POSIX_LOGIN_SHELLS = new Set(['bash', 'zsh', 'sh', 'dash', 'ksh', 'mksh', 'ash', 'yash'])

// No double quotes anywhere below: Windows PowerShell 5.1 drops them from native arguments.
const LOGIN_SHELL = 'exec ${SHELL:-/bin/sh} -l'

/** IFS= and set -f keep `$line` one unexpanded word, so eval re-parses exactly what was confirmed. */
export const RUN_CONFIRMED_LINE = 'IFS=; set -f; eval set +f\\; unset IFS\\; $line'

export type TerminalPrefill = { command: string; hint: string }

/** `ssh -t` options and destination; aliases and hosts were validated never to start with `-`. */
export function sshDestinationArgs(profile: ServerProfile): string[] {
  const args = ['-t']
  if (profile.auth === 'key' && profile.identityFile) {
    args.push('-i', profile.identityFile)
  }
  if (profile.endpoint.kind === 'ssh-config') {
    args.push('--', profile.endpoint.alias)
    return args
  }
  args.push('-p', String(profile.endpoint.port))
  if (profile.endpoint.username) {
    args.push('-l', profile.endpoint.username)
  }
  args.push('--', profile.endpoint.host)
  return args
}

/**
 * Lands in `cwd`. With a prefill, bash's readline puts the command on an editable line and runs it
 * only when the user presses Enter; Ctrl+C drops to the normal shell. Without bash, the command is
 * printed for copying instead.
 */
export function remoteTerminalScript(cwd: string, prefill?: TerminalPrefill): string {
  const enter = `cd -- ${quotePosixShell(cwd)}`
  if (!prefill) {
    return `${enter} && ${LOGIN_SHELL}`
  }
  const command = quotePosixShell(prefill.command)
  // `read -i` needs bash 4+; older bash prints the command for copying instead.
  const editLine = [
    `printf '%s\\n' ${quotePosixShell(prefill.hint)}`,
    'trap : INT',
    `if [ \${BASH_VERSINFO:-0} -ge 4 ]; then IFS= read -r -e -i ${command} -p '$ ' line && { ${RUN_CONFIRMED_LINE}; }; else printf '%s\\n' ${command}; fi`,
    'trap - INT',
    LOGIN_SHELL
  ].join('; ')
  const printed = `printf '%s\\n' ${command}`
  return `${enter} && { command -v bash >/dev/null 2>&1 && exec bash -c ${quotePosixShell(editLine)}; ${printed}; ${LOGIN_SHELL}; }`
}

export function buildServerTerminalCommand(args: {
  profile: ServerProfile
  cwd: string
  loginShell: string | null
  localShell: AgentStartupShell
  prefill?: TerminalPrefill
}): string {
  const script = remoteTerminalScript(args.cwd, args.prefill)
  // fish and csh parse quotes differently; the wrapper hands the script to /bin/sh untouched.
  const remote =
    args.loginShell === null || POSIX_LOGIN_SHELLS.has(args.loginShell)
      ? script
      : wrapRemoteCommandForPosixShell(script, { compress: false })
  return buildShellCommandFromArgv(
    ['ssh', ...sshDestinationArgs(args.profile), remote],
    args.localShell
  )
}
