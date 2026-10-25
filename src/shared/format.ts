export const formatUsage = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}
