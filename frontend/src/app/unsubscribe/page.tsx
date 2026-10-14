"use client"

import { useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface Reason {
  id: string
  label: string
  description: string
  followUp?: {
    placeholder: string
  }
}

const REASONS: Reason[] = [
  {
    id: "too_frequent",
    label: "Too many emails",
    description: "The digest arrives more often than I'd like.",
    followUp: { placeholder: "What email frequency works better?" },
  },
  {
    id: "not_useful",
    label: "Not useful for me",
    description: "The content doesn't help me in my role.",
    followUp: { placeholder: "What would make it more useful to you?" },
  },
  {
    id: "no_oncall",
    label: "I don't manage on-call anymore",
    description: "My responsibilities have changed.",
  },
  {
    id: "other",
    label: "Other",
    description: "Something else is going on.",
    followUp: { placeholder: "Tell us more…" },
  },
]

function UnsubscribePage() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [followUpText, setFollowUpText] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const buildReason = (): string => {
    const parts: string[] = []
    for (const r of REASONS) {
      if (!selected.has(r.id)) continue
      const extra = followUpText[r.id]?.trim()
      parts.push(extra ? `${r.label}: ${extra}` : r.label)
    }
    return parts.join(" | ")
  }

  const handleConfirm = async () => {
    setStatus("loading")
    try {
      const res = await fetch(`${API_URL}/api/digests/weekly/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason: buildReason() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data.detail || "Something went wrong. Please try again.")
        setStatus("error")
        return
      }
      setStatus("success")
    } catch {
      setErrorMsg("Network error. Please try again.")
      setStatus("error")
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <p className="text-gray-500 text-sm">Invalid or missing unsubscribe link.</p>
      </div>
    )
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-xs border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Unsubscribed</h1>
          <p className="text-gray-500 text-sm mb-6">
            You've been removed from weekly digest emails. You can re-enable them at any time from{" "}
            <strong>Account Settings → Weekly Digest</strong>.
          </p>
          <Link
            href="/"
            className="inline-block bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            Return to On-Call Health
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-xs border border-gray-200 p-8">
        {/* Header */}
        <div className="mb-6">
          <span className="text-sm text-gray-400 font-medium">On-Call Health</span>
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-1">Unsubscribe from weekly digests?</h1>
        <p className="text-sm text-gray-500 mb-6">
          You'll stop receiving weekly summary emails. You can re-enable this any time from your account settings.
        </p>

        {/* Checkbox list */}
        <div className="space-y-0.5 mb-5">
          {REASONS.map((r) => {
            const isChecked = selected.has(r.id)
            return (
              <div key={r.id}>
                <button
                  type="button"
                  onClick={() => toggle(r.id)}
                  className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg border text-left transition-colors ${
                    isChecked
                      ? "border-transparent bg-violet-50"
                      : "border-transparent bg-white hover:bg-gray-50"
                  }`}
                >
                  {/* Custom checkbox */}
                  <span
                    className={`mt-0.5 shrink-0 w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                      isChecked
                        ? "bg-violet-600 border-violet-600"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    {isChecked && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 5l2.5 2.5 4.5-4.5" />
                      </svg>
                    )}
                  </span>
                  <p className="text-sm font-medium text-gray-900 leading-tight">{r.label}</p>
                </button>

                {/* Contextual follow-up */}
                {isChecked && r.followUp && (
                  <div className="mt-1.5 mb-1 pl-3">
                    <textarea
                      value={followUpText[r.id] ?? ""}
                      onChange={(e) =>
                        setFollowUpText((prev) => ({ ...prev, [r.id]: e.target.value }))
                      }
                      placeholder={r.followUp.placeholder}
                      rows={2}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-hidden focus:ring-2 focus:ring-violet-400 focus:border-transparent placeholder:text-gray-400"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {status === "error" && (
          <p className="text-sm text-red-600 mb-4">{errorMsg}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={status === "loading"}
            className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            {status === "loading" ? "Unsubscribing…" : "Confirm Unsubscribe"}
          </button>
          <Link
            href="/"
            className="flex-1 text-center bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            Keep me subscribed
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function UnsubscribePageWrapper() {
  return (
    <Suspense>
      <UnsubscribePage />
    </Suspense>
  )
}
