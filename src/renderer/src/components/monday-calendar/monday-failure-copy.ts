import { translate } from '@/i18n/i18n'
import type { MondayFailure } from '../../../../shared/monday-calendar-types'

export function describeMondayFailure(failure: MondayFailure): string {
  switch (failure.kind) {
    case 'not-connected':
      return translate(
        'auto.components.mondayCalendar.failure.notConnected',
        'Enter a monday.com API token.'
      )
    case 'unauthorized':
      return translate(
        'auto.components.mondayCalendar.failure.unauthorized',
        'monday.com rejected the API token. Check that it is still valid.'
      )
    case 'rate-limited':
      return translate(
        'auto.components.mondayCalendar.failure.rateLimited',
        'The monday.com API limit was reached. Try again later.'
      )
    case 'board-not-found':
      return failure.message
        ? translate(
            'auto.components.mondayCalendar.failure.boardNotFound',
            'Board {{value0}} was not found, or this token cannot access it.',
            { value0: failure.message }
          )
        : translate(
            'auto.components.mondayCalendar.failure.boardMissing',
            'Enter at least one board or doc URL.'
          )
    case 'doc-not-found':
      return translate(
        'auto.components.mondayCalendar.failure.docNotFound',
        'Doc {{value0}} was not found, or this token cannot access it.',
        { value0: failure.message }
      )
    case 'network':
      return translate(
        'auto.components.mondayCalendar.failure.network',
        'Could not reach monday.com. Check your network connection.'
      )
    case 'api':
      return translate(
        'auto.components.mondayCalendar.failure.api',
        'monday.com returned an error: {{value0}}',
        { value0: failure.message }
      )
  }
}
