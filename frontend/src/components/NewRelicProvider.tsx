'use client'

/**
 * New Relic Browser Agent Provider
 *
 * Client component that initializes New Relic on mount.
 * Only runs in the browser, not during SSR.
 */

import { useEffect } from 'react'
import { initNewRelic } from '@/lib/newrelic'

export default function NewRelicProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize New Relic on client-side mount
    initNewRelic()
  }, [])

  return <>{children}</>
}
