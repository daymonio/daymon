import { useEffect, useRef, useCallback, useState } from 'react'

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number = 5000
): { data: T | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const doFetch = useCallback(() => {
    fetcherRef.current().then(setData).catch(() => {})
  }, [])

  useEffect(() => {
    doFetch()
    timerRef.current = setInterval(doFetch, intervalMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [doFetch, intervalMs])

  return { data, refresh: doFetch }
}
