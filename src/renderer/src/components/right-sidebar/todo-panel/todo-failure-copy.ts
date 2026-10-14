import { translate } from '@/i18n/i18n'
import type { MicrosoftTodoFailure } from '../../../../../shared/microsoft-todo-types'

export function describeTodoFailure(failure: MicrosoftTodoFailure): string {
  switch (failure.kind) {
    case 'not-configured':
      return failure.message === 'invalid-client-id'
        ? translate(
            'auto.components.todoPanel.failure.invalidClientId',
            'That does not look like an application ID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).'
          )
        : translate(
            'auto.components.todoPanel.failure.notConfigured',
            'Microsoft rejected the app registration: {{value0}}',
            { value0: failure.message }
          )
    case 'signed-out':
      return translate(
        'auto.components.todoPanel.failure.signedOut',
        'Your Microsoft sign-in expired. Sign in again.'
      )
    case 'credential-unreadable':
      return translate(
        'auto.components.todoPanel.failure.credentialUnreadable',
        'This Orca can’t read the saved Microsoft sign-in (for example, it was saved by a development build). Sign in again.'
      )
    case 'cancelled':
      return translate('auto.components.todoPanel.failure.cancelled', 'Sign-in was cancelled.')
    case 'rate-limited':
      return translate(
        'auto.components.todoPanel.failure.rateLimited',
        'Microsoft is limiting requests. Try again in a minute.'
      )
    case 'network':
      return translate(
        'auto.components.todoPanel.failure.network',
        'Could not reach Microsoft. Check your network connection.'
      )
    case 'api':
      return translate(
        'auto.components.todoPanel.failure.api',
        'Microsoft returned an error: {{value0}}',
        {
          value0: failure.message
        }
      )
  }
}
