import { useState } from "react"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { HelpCircle, ChevronDown, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react"

interface OpenAIUsageSetupCardProps {
  onConnect: (apiKey: string) => Promise<void>
  isConnecting: boolean
}

export function OpenAIUsageSetupCard({ onConnect, isConnecting }: OpenAIUsageSetupCardProps) {
  const [showInstructions, setShowInstructions] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)

  return (
    <Card className="border-neutral-200 max-w-2xl mx-auto">
      <CardHeader className="p-8">
        <div className="flex items-center space-x-3">
          <Image src="/images/openai-logo.svg" alt="OpenAI" width={24} height={24} className="w-6 h-6" />
          <CardTitle>Add OpenAI Usage Tracking</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-8 pt-0">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Image src="/images/openai-logo.svg" alt="OpenAI" width={16} height={16} className="w-4 h-4" />
            <label className="text-sm font-medium text-neutral-900">OpenAI Admin API Key</label>
          </div>

          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center space-x-2 text-sm text-neutral-600 hover:text-neutral-900"
          >
            <HelpCircle className="w-4 h-4" />
            <span>How to get your OpenAI Admin API key</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showInstructions ? "rotate-180" : ""}`} />
          </button>

          {showInstructions && (
            <Alert className="border-neutral-200 bg-neutral-100">
              <AlertDescription>
                <div className="space-y-3">
                  <p className="text-sm text-neutral-600">
                    The usage API requires an <strong>Admin API key</strong> — not a standard API key. Only Organization Owners can create Admin keys.
                  </p>
                  <div>
                    <h5 className="text-sm font-medium text-neutral-900 mb-1"><strong>Step 1:</strong> Go to Admin Keys settings</h5>
                    <p className="text-sm text-neutral-700 mb-1">Navigate to <strong>OpenAI Platform → Settings → Organization → Admin Keys</strong></p>
                    <a href="https://platform.openai.com/settings/organization/admin-keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-sm text-blue-600 hover:underline">
                      Open Admin Keys settings <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-neutral-900 mb-1"><strong>Step 2:</strong> Create a new Admin API key</h5>
                    <p className="text-sm text-neutral-700">Click <strong>"Create new key"</strong> and give it a name (e.g., "On-Call Health Usage").</p>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-neutral-900 mb-1"><strong>Step 3:</strong> Copy the key immediately</h5>
                    <p className="text-sm text-neutral-700">
                      Copy the key — it starts with <code className="bg-neutral-300 px-1 rounded text-xs">sk-admin-</code>. <strong>You won't be able to see it again.</strong>
                    </p>
                  </div>
                  <a href="https://platform.openai.com/docs/api-reference/usage/completions" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-sm text-blue-600 hover:underline">
                    View Usage API docs <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              placeholder="sk-admin-..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value.trim())}
              className="pr-10"
            />
            <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowKey(v => !v)}>
              {showKey ? <EyeOff className="h-4 w-4 text-neutral-500" /> : <Eye className="h-4 w-4 text-neutral-500" />}
            </Button>
          </div>
        </div>

        <Button
          className="bg-indigo-600 hover:bg-indigo-700 text-white w-full"
          onClick={() => onConnect(apiKey)}
          disabled={!apiKey.trim() || isConnecting}
        >
          {isConnecting ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting...</>
          ) : (
            "Connect OpenAI Usage"
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
