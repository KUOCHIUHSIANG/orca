import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import type { MicrosoftTodoFailure } from '../../../../../shared/microsoft-todo-types'
import { describeTodoFailure } from './todo-failure-copy'

/** Inline panel error; an unreadable saved sign-in gets a direct way to sign in again. */
export function TodoFailureBanner(props: {
  failure: MicrosoftTodoFailure
  onSignIn: () => Promise<MicrosoftTodoFailure | null>
  onFailure: (failure: MicrosoftTodoFailure) => void
}): React.JSX.Element {
  const mountedRef = useMountedRef()
  const [signingIn, setSigningIn] = useState(false)
  return (
    <div role="alert" className="space-y-2 border-b border-border px-4 py-2 text-xs">
      <p className="text-destructive">{describeTodoFailure(props.failure)}</p>
      {props.failure.kind === 'credential-unreadable' ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={signingIn}
          onClick={() => {
            setSigningIn(true)
            void props.onSignIn().then((failure) => {
              if (failure) {
                props.onFailure(failure)
              }
              if (mountedRef.current) {
                setSigningIn(false)
              }
            })
          }}
        >
          {signingIn ? <LoaderCircle className="animate-spin" /> : null}
          {signingIn
            ? translate(
                'auto.components.todoPanel.connect.waiting',
                'Finish signing in in your browser…'
              )
            : translate('auto.components.todoPanel.connect.signIn', 'Sign in with Microsoft')}
        </Button>
      ) : null}
    </div>
  )
}
