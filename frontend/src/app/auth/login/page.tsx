"use client"

import AuthRedirectGate from "@/components/AuthRedirectGate"
import { Card, CardContent } from "@/components/ui/card"
import Image from "next/image"
import { AuthProviderButtons } from "@/components/auth-provider-buttons"

export default function LoginPage() {
  return (
    <AuthRedirectGate>
      <div className="min-h-screen bg-[url(/images/landing/rootly-bg-hq.webp)] bg-cover bg-position-[50%_15%] lg:bg-size-[210%] lg:bg-position-[-1200px_-300px] p-4 sm:p-6 lg:p-8">
        <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl items-center justify-center">
          <Card className="w-full max-w-lg border border-white/20 bg-transparent text-white shadow-2xl backdrop-blur-xl">
            <CardContent className="p-6 sm:p-8">
              <div className="mb-8 flex flex-col items-center text-center">
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1.5">
                    <span className="text-2xl font-normal text-white">On-Call Health</span>
                    <Image
                      src="/images/on-call-health-logo.svg"
                      alt="On-Call Health"
                      width={32}
                      height={32}
                      className="h-8 w-8 brightness-0 invert"
                    />
                  </div>
                  <div className="-mt-0.5 flex items-center gap-1.5">
                    <span className="text-xs font-light text-white/80">Powered by</span>
                    <Image
                      src="/images/rootly-ai-logo-white.png"
                      alt="Rootly"
                      width={321}
                      height={129}
                      className="w-[70px]"
                    />
                  </div>
                </div>
                <h1 className="mt-8 text-3xl font-semibold tracking-tight text-white">
                  Sign in to On-Call Health
                </h1>
                <p className="mt-3 max-w-md text-sm text-white/80 sm:text-base">
                  Continue with your work identity provider or developer account.
                </p>
              </div>

              <AuthProviderButtons
                variant="card"
                className="mx-auto max-w-94"
                title="Choose a provider"
                description="Google and GitHub work well for individual access. Okta is available for enterprise sign-in."
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthRedirectGate>
  )
}
