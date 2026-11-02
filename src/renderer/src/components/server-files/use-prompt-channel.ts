import { useCallback, useRef, useState } from 'react'

type Pending<Request, Answer> = { request: Request; resolve: (answer: Answer) => void }

/** One dialog at a time: later requests wait in order until the current one is answered. */
export function usePromptChannel<Request, Answer>(): {
  current: Request | null
  ask: (request: Request) => Promise<Answer>
  settle: (answer: Answer) => void
} {
  const queue = useRef<Pending<Request, Answer>[]>([])
  const [current, setCurrent] = useState<Request | null>(null)

  const ask = useCallback((request: Request) => {
    return new Promise<Answer>((resolve) => {
      queue.current.push({ request, resolve })
      if (queue.current.length === 1) {
        setCurrent(request)
      }
    })
  }, [])

  const settle = useCallback((answer: Answer) => {
    const head = queue.current.shift()
    head?.resolve(answer)
    setCurrent(queue.current[0]?.request ?? null)
  }, [])

  return { current, ask, settle }
}
