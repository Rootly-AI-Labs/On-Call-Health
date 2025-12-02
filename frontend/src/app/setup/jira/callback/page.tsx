'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function JiraCallbackPage() {
  const searchParams = useSearchParams()
  const ranRef = useRef(false)

  useEffect(() => {
    // StrictMode double-invokes effects in dev — guard it
    if (ranRef.current) return
    ranRef.current = true

    const lockKey = 'jira_oauth_processing'
    if (sessionStorage.getItem(lockKey)) return
    sessionStorage.setItem(lockKey, '1')

    const run = async () => {
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const err = searchParams.get('error')
      const errDesc = searchParams.get('error_description') || ''

      if (err) {
        window.location.href = `/integrations?jira_error=${encodeURIComponent(
          `${err}${errDesc ? `: ${errDesc}` : ''}`
        )}`
        sessionStorage.removeItem(lockKey)
        return
      }

      if (!code || !state) {
        window.location.href = `/integrations?jira_error=${encodeURIComponent(
          'Invalid callback parameters'
        )}`
        sessionStorage.removeItem(lockKey)
        return
      }

      // State hint only (backend does real verify)
      const stored = sessionStorage.getItem('jira_oauth_state')
      if (stored && stored !== state) {
        console.warn('[Jira OAuth] State mismatch (backend will validate).')
      }
      sessionStorage.removeItem('jira_oauth_state')

      try {
        const authToken = typeof window !== 'undefined'
          ? localStorage.getItem('auth_token')
          : null

        const resp = await fetch(`${API_BASE}/integrations/jira/callback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ code, state }),
          credentials: 'include',
        })

        if (resp.redirected) {
          window.location.href = resp.url
          return
        }

        const text = await resp.text()
        let data: any = {}
        try { data = text ? JSON.parse(text) : {} } catch {}

        if (resp.ok) {
          const redirect = data.redirect_url || '/integrations?jira_connected=1'
          window.location.href = redirect
        } else {
          const msg = (data && (data.detail || data.message)) || text || 'Failed to complete OAuth flow'
          window.location.href = `/integrations?jira_error=${encodeURIComponent(msg)}`
        }
      } catch (e: any) {
        window.location.href = `/integrations?jira_error=${encodeURIComponent(
          e?.message || 'Network error completing OAuth flow'
        )}`
      } finally {
        sessionStorage.removeItem(lockKey)
      }
    }

    run()
  }, [searchParams])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <h1 className="text-xl font-semibold">Connecting Jira...</h1>
        <p className="text-sm text-muted-foreground">
          Please wait while we complete the integration.
        </p>
      </div>
    </div>
  )
}
