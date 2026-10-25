import { useEffect, useRef } from 'react'

const TOAST_MS = 5000

export const Toast = ({ message, onDone }: { message: string; onDone: () => void }) => {
  // Parents pass inline callbacks; keeping the latest in a ref stops re-renders from restarting the 5 s timer
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const timer = window.setTimeout(() => onDoneRef.current(), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [message])

  return (
    <div className="toast" role="alert">
      ! {message}
    </div>
  )
}
