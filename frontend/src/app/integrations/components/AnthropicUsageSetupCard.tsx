import { useState } from "react"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { HelpCircle, ChevronDown, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react"

interface AnthropicUsageSetupCardProps {
  onConnect: (apiKey: string) => Promise<void>
  isConnecting: boolean
}

export function AnthropicUsageSetupCard({ onConnect, isConnecting }: AnthropicUsageSetupCardProps) {
  const [showInstructions, setShowInstructions] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)

  return (
    <Card className="border-neutral-200 max-w-2xl mx-auto">
      <CardHeader className="p-8">
        <div className="flex items-center space-x-3">
          <Image src="/images/anthropic-logo.svg" alt="Anthropic" width={24} height={24} className="w-6 h-6" />
          <CardTitle>Add Anthropic Usage Tracking</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-8 pt-0">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Image src="/images/anthropic-logo.svg" alt="Anthropic" width={16} height={16} className="w-4 h-4" />
            <label className="text-sm font-medium text-neutral-900">Anthropic Admin API Key</label>
          </div>

          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center space-x-2 text-sm text-neutral-600 hover:text-neutral-900"
          >
            <HelpCircle className="w-4 h-4" />
            <span>How to get your Anthropic Admin API key</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showInstructions ? "rotate-180" : ""}`} />
          </button>

          {showInstructions && (
            <Alert className="border-neutral-200 bg-neutral-100">
              <AlertDescription>
                <div className="space-y-3">
                  <p className="text-sm text-neutral-600">
                    The Anthropic usage report API requires an <strong>Admin API key</strong>. Only workspace admins can create these.
                  </p>
                  <div>
                    <h5 className="text-sm font-medium text-neutral-900 mb-1"><strong>Step 1:</strong> Go to API Keys in the Console</h5>
                    <p className="text-sm text-neutral-700 mb-1">Navigate to <strong>Anthropic Console → Settings → API Keys</strong></p>
                    <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-sm text-blue-600 hover:underline">
                      Open Anthropic Console <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-neutral-900 mb-1"><strong>Step 2:</strong> Create a key with Admin permissions</h5>
                    <p className="text-sm text-neutral-700">
                      Click <strong>"Create Key"</strong> and ensure it has <strong>Admin</strong> role — not Developer. The key starts with <code className="bg-neutral-300 px-1 rounded text-xs">sk-ant-admin-</code>.
                    </p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              placeholder="sk-ant-admin-..."
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
            "Connect Anthropic Usage"
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
