import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { CredentialDecryptionError } from '../integration-credential-file'
import { toMicrosoftTodoFailure } from './microsoft-todo'

describe('toMicrosoftTodoFailure', () => {
  it('reports a sign-in this install cannot decrypt so the panel can offer to sign in again', () => {
    expect(toMicrosoftTodoFailure(new CredentialDecryptionError('Microsoft To Do'))).toEqual({
      ok: false,
      kind: 'credential-unreadable',
      message: expect.stringContaining('Could not decrypt saved Microsoft To Do credential')
    })
  })

  it('keeps other failures as generic API errors', () => {
    expect(toMicrosoftTodoFailure(new Error('boom'))).toEqual({
      ok: false,
      kind: 'api',
      message: 'boom'
    })
  })
})
