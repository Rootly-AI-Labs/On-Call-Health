"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { siGithub, siGooglechrome } from "simple-icons"
import type { SimpleIcon } from "simple-icons"

import { Button } from "@/components/ui/button"
import { BrandIcon } from "@/components/ui/brand-icon"
import { cn } from "@/lib/utils"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

type AuthProvider = "google" | "github" | "okta"
type Variant = "hero" | "card"

type ProviderConfig = {
  id: AuthProvider
  label: string
  compactLabel: string
  loadingLabel: string
  compactLoadingLabel: string
  path: string
  brandIcon?: SimpleIcon
  imageSrc?: string
  imageAlt?: string
  imageClassName?: string
  className: string
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "google",
    label: "Sign in with Google",
    compactLabel: "Google",
    loadingLabel: "Connecting to Google...",
    compactLoadingLabel: "Connecting...",
    path: "/auth/google",
    brandIcon: siGooglechrome,
    className:
      "bg-[#E4E5EB] text-(--color-blue-15,#1E1A33) hover:bg-[#d7d8de]",
  },
  {
    id: "github",
    label: "Sign in with GitHub",
    compactLabel: "GitHub",
    loadingLabel: "Connecting to GitHub...",
    compactLoadingLabel: "Connecting...",
    path: "/auth/github",
    brandIcon: siGithub,
    className:
      "bg-[#100F12] text-(--text-text-contrast,#FFFFFF) hover:bg-[#1b1a1e]",
  },
  {
    id: "okta",
    label: "Sign in with Okta",
    compactLabel: "Okta",
    loadingLabel: "Connecting to Okta...",
    compactLoadingLabel: "Connecting...",
    path: "/auth/okta",
    imageSrc: "/images/okta-icon.png",
    imageAlt: "Okta",
    imageClassName: "h-5 w-5",
    className: "bg-[#00297A] text-white hover:bg-[#001f5c]",
  },
]

async function getAuthorizationUrl(path: string): Promise<string> {
  const currentOrigin = window.location.origin
  const response = await fetch(
    `${API_BASE}${path}?redirect_origin=${encodeURIComponent(currentOrigin)}`
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `Authentication failed: ${response.status}`)
  }

  const contentType = response.headers.get("content-type")
  if (!contentType || !contentType.includes("application/json")) {
    const responseText = await response.text()
    throw new Error(responseText || "Invalid response format from authentication server")
  }

  const data = await response.json()
  if (!data.authorization_url) {
    throw new Error("Invalid authentication response")
  }

  return data.authorization_url
}

interface AuthProviderButtonsProps {
  variant?: Variant
  className?: string
  title?: string
  description?: string
}

export function AuthProviderButtons({
  variant = "hero",
  className,
  title,
  description,
}: AuthProviderButtonsProps) {
  const [isLoading, setIsLoading] = useState<AuthProvider | null>(null)

  const handleLogin = async (provider: ProviderConfig) => {
    try {
      setIsLoading(provider.id)
      const authorizationUrl = await getAuthorizationUrl(provider.path)
      window.location.href = authorizationUrl
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start authentication."
      console.error(`${provider.id} login error:`, error)
      toast.error(message)
      setIsLoading(null)
    }
  }

  return (
    <div className={cn("w-full", className)}>
      {(title || description) && (
        <div className="mb-3 text-white">
          {title && (
            <p
              className={cn(
                "font-semibold",
                variant === "hero"
                  ? "text-base lg:text-lg"
                  : "text-sm uppercase tracking-[0.18em] text-white/75"
              )}
            >
              {title}
            </p>
          )}
          {description && (
            <p
              className={cn(
                "mt-1.5 text-sm",
                variant === "hero" ? "text-white/80 lg:text-base" : "text-white/85"
              )}
            >
              {description}
            </p>
          )}
        </div>
      )}

      <div
        className={cn(
          "grid gap-3",
          "grid-cols-1"
        )}
      >
        {PROVIDERS.map((provider) => {
          const isActive = isLoading === provider.id
          const buttonLabel = provider.label
          const loadingLabel = provider.loadingLabel

          return (
            <Button
              key={provider.id}
              size="lg"
              onClick={() => void handleLogin(provider)}
              disabled={isLoading !== null}
              className={cn(
                "w-full rounded-[22px] px-4 py-2.5 font-display font-bold flex items-center justify-center",
                variant === "hero"
                  ? "min-h-[58px] text-base md:text-lg lg:px-5"
                  : "text-base justify-start px-6 sm:px-7",
                provider.className
              )}
              aria-label={provider.label}
            >
              <span
                className={cn(
                  "flex min-w-0 items-center translate-y-px",
                  variant === "hero"
                    ? "justify-center gap-2.5 text-center"
                    : "w-full justify-start gap-3.5 text-left"
                )}
              >
                {isActive ? (
                  <>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    </span>
                    <span>{loadingLabel}</span>
                  </>
                ) : (
                  <>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      {provider.imageSrc ? (
                        <img
                          src={provider.imageSrc}
                          alt={provider.imageAlt || provider.compactLabel}
                          className={cn("object-contain", provider.imageClassName)}
                        />
                      ) : provider.brandIcon ? (
                        <BrandIcon icon={provider.brandIcon} className="h-5 w-5 -translate-y-0.5" />
                      ) : null}
                    </span>
                    <span>{buttonLabel}</span>
                  </>
                )}
              </span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}
