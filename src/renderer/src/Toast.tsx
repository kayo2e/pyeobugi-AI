import { useEffect } from 'react'

const TOAST_MS = 5000

export const Toast = ({ message, onDone }: { message: string; onDone: () => void }) => {
  useEffect(() => {
    const timer = window.setTimeout(onDone, TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [message, onDone])

  return (
    <div className="toast" role="alert">
      ! {message}
    </div>
  )
}
