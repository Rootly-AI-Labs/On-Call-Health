"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { getValidToken } from "@/lib/auth"

interface AuthRedirectGateProps {
  children: React.ReactNode
  redirectTo?: string
}

export default function AuthRedirectGate({
  children,
  redirectTo = "/dashboard",
}: AuthRedirectGateProps) {
  const router = useRouter()
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  useEffect(() => {
    const token = getValidToken()

    if (token) {
      router.replace(redirectTo)
      return
    }

    setIsCheckingAuth(false)
  }, [redirectTo, router])

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100">
        <div className="flex items-center gap-3 rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-600 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-purple-700" />
          Redirecting to your workspace...
        </div>
      </div>
    )
  }

  return <>{children}</>
}
