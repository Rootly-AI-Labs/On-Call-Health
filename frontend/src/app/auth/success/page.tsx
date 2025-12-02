'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function AuthSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [error, setError] = useState<string | null>(null)
  const hasAttemptedAuth = useRef(false)

  useEffect(() => {
    // Prevent double execution in React Strict Mode
    if (hasAttemptedAuth.current) return
    hasAttemptedAuth.current = true

    // ✅ ENTERPRISE PATTERN: 2-Step Server-Side Token Exchange
    const authenticateUser = async () => {
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
        
        
        // Step 1: Extract authorization code from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get('code');
        
        
        if (!authCode) {
          throw new Error('No authorization code received from OAuth callback');
        }
        
        // Step 2: Exchange authorization code for JWT token
        const tokenResponse = await fetch(`${API_BASE}/auth/exchange-token?code=${authCode}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          throw new Error(`Token exchange failed: ${errorText}`);
        }
        
        const tokenData = await tokenResponse.json();
        const jwtToken = tokenData.access_token;
        
        
        // Step 3: Clear any existing user data and store new JWT token
        // Clear all user-specific cached data to prevent cross-user data leakage
        const keysToRemove = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (
            key.includes('integrations') ||
            key.includes('selected_organization') ||
            key.includes('analyses') ||
            key.includes('user_') ||
            key.includes('github_') ||
            key.includes('slack_') ||
            key.includes('rootly_') ||
            key.includes('pagerduty_') ||
            key.endsWith('_cache') ||
            key.endsWith('_timestamp') ||
            key.endsWith('_data')
          )) {
            keysToRemove.push(key)
          }
        }
        
        // Remove all cached user data
        keysToRemove.forEach(key => localStorage.removeItem(key))
        
        // Additional explicit clearing of potential problematic keys
        const explicitKeysToRemove = [
          'user_name', 'user_email', 'user_avatar', 'user_id',
          'current_user', 'userInfo', 'userData', 'user_profile',
          'last_integrations_refresh' // Force fresh integration load on next page
        ]
        explicitKeysToRemove.forEach(key => {
          if (localStorage.getItem(key)) {
            localStorage.removeItem(key)
          }
        })
        
        // Store the new JWT token
        localStorage.setItem('auth_token', jwtToken);
        
        // Clean up URL (remove auth code)
        window.history.replaceState(null, '', window.location.pathname);
        
        // Step 4: Verify authentication with the JWT token
        const verifyResponse = await fetch(`${API_BASE}/auth/user/me`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`
          }
        })
        
        if (!verifyResponse.ok) {
          throw new Error('Authentication verification failed')
        }
        
        const userData = await verifyResponse.json()
        
        // Store fresh user data immediately to prevent cross-user contamination
        if (userData.name && userData.email) {
          localStorage.setItem('user_name', userData.name)
          localStorage.setItem('user_email', userData.email)
          localStorage.setItem('user_role', userData.role || 'member')
          if (userData.avatar) {
            localStorage.setItem('user_avatar', userData.avatar)
          }
          if (userData.id) {
            localStorage.setItem('user_id', userData.id.toString())
          }
          if (userData.organization_id) {
            localStorage.setItem('user_organization_id', userData.organization_id.toString())
          }
        }
        
        // Set success status
        setStatus('success')

        // Redirect to dashboard after a brief delay
        setTimeout(() => {
          router.push('/dashboard')
        }, 1500)
        
      } catch (err) {
        console.error('🔍 Frontend Debug: Authentication failed:', err)
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Authentication failed. Please try logging in again.')
      }
    }
    
    authenticateUser()
  }, [router])

  if (status === 'processing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Completing authentication...
          </h2>
          <p className="text-gray-600">
            Please wait while we finish setting up your account.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto">
          <div className="bg-red-100 rounded-full p-3 mx-auto mb-4 w-16 h-16 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Authentication Failed
          </h2>
          <p className="text-gray-600 mb-6">
            {error || 'An error occurred during authentication.'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Return to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="bg-green-100 rounded-full p-3 mx-auto mb-4 w-16 h-16 flex items-center justify-center">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Authentication Successful!
        </h2>
        <p className="text-gray-600">
          Redirecting to dashboard...
        </p>
      </div>
    </div>
  )
}