import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Brain, Sparkles, Trash2, Loader2, ExternalLink, CheckCircle2 } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"

interface AIInsightsCardProps {
  llmConfig: { has_token: boolean; provider?: string; token_suffix?: string; token_source?: string } | null
  onConnect: (token: string, provider: string, useSystemToken: boolean, switchToCustom?: boolean) => Promise<void>
  onDisconnect: () => Promise<void>
  isConnecting: boolean
}

export function AIInsightsCard({
  llmConfig,
  onConnect,
  onDisconnect,
  isConnecting
}: AIInsightsCardProps) {
  const [useCustomToken, setUseCustomToken] = useState(false)
  const [customToken, setCustomToken] = useState('')
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic')
  const [isSwitching, setIsSwitching] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Track if toggle change is user-initiated to prevent toast spam
  const isUserInitiatedRef = useRef(false)
  const isInitialMount = useRef(true)

  // Update toggle state based on connected token source (bidirectional sync)
  useEffect(() => {
    if (llmConfig?.has_token) {
      // Sync toggle with actual token source from backend
      const shouldUseCustom = llmConfig.token_source === 'custom'
      setUseCustomToken(shouldUseCustom)
    } else {
      // Not connected - default to system token
      setUseCustomToken(false)
    }
  }, [llmConfig])

  const handleTokenSourceChange = async (source: 'system' | 'custom') => {
    const checked = source === 'custom'

    isUserInitiatedRef.current = true
    const wasConnected = llmConfig?.has_token
    const wasCustom = llmConfig?.token_source === 'custom'

    // Case 1: Switching from custom to system while connected
    if (wasConnected && wasCustom && !checked) {
      setIsSwitching(true)
      try {
        // Add 1 second delay
        await new Promise(resolve => setTimeout(resolve, 1000))
        await onConnect('', 'anthropic', true, false)
        setUseCustomToken(false)
        toast.success("Switched to system token")
      } catch (error) {
        toast.error("Failed to switch to system token")
        setUseCustomToken(true) // Revert on error
      } finally {
        setIsSwitching(false)
      }
      return
    }

    // Case 2: Switching from system to custom while connected - try to activate stored token
    if (wasConnected && !wasCustom && checked) {
      setIsSwitching(true)

      try {
        // Add 1 second delay
        await new Promise(resolve => setTimeout(resolve, 1000))
        // Try to switch to stored custom token
        await onConnect('', provider, false, true)
        setUseCustomToken(true)
        toast.success("Switched to custom token")
      } catch (error: any) {
        // If no stored token exists, that's ok - just show the form
        const errorMsg = error?.message || String(error)
        if (errorMsg.includes('No custom token found') || errorMsg.includes('404')) {
          setUseCustomToken(true)
          toast.info("Enter your custom API token below to get started")
        } else {
          // Real error - show it
          console.error('Switch error:', error)
          toast.error("Failed to switch. Please try again.")
        }
      } finally {
        setIsSwitching(false)
      }
      return
    }

    // Case 3: Not connected - toggle UI and persist preference
    const previousState = useCustomToken
    setUseCustomToken(checked)

    // Persist the preference to backend
    const preferenceSource = checked ? 'custom' : 'system'
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/llm/token/preference`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ token_source: preferenceSource })
      })

      if (!response.ok) {
        console.error('Failed to save token preference')
        // Revert to previous state
        setUseCustomToken(previousState)
        toast.error("Failed to save preference. Please try again.")
        return
      }
    } catch (error) {
      console.error('Error saving preference:', error)
      // Revert to previous state
      setUseCustomToken(previousState)
      toast.error("Failed to save preference. Please try again.")
      return
    }

    if (!isInitialMount.current) {
      if (checked) {
        toast.info("Enter your custom API token below")
      } else {
        toast.info("Use our provided Anthropic API")
      }
    }
    isInitialMount.current = false
  }

  const handleConnect = async () => {
    try {
      if (useCustomToken) {
        // Use custom token
        await onConnect(customToken, provider, false)
        setCustomToken('') // Clear input after successful connection
      } else {
        // Use system token - send empty string as token
        await onConnect('', 'anthropic', true)
      }
    } catch (error) {
      // Error handling is done in the handler
    }
  }

  const handleDelete = async () => {
    try {
      await onDisconnect()
      setShowDeleteDialog(false)
      toast.success("Custom token deleted successfully", {
        className: "bg-green-50 text-green-900 border-green-200"
      })
    } catch (error) {
      toast.error("Failed to delete token")
    }
  }

  const isConnected = llmConfig?.has_token

  return (
    <Card className="max-w-2xl mx-auto border-purple-200 bg-purple-50/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              AI Insights
              {isConnected && <CheckCircle2 className="w-5 h-5 text-green-600" />}
            </CardTitle>
            <CardDescription className="text-slate-600">
              AI-powered insights that highlight patterns and key concerns
            </CardDescription>
          </div>
          {/* Segmented Control for Token Selection */}
          <div className="flex items-center gap-2">
            {/* Loader to the left of toggle */}
            {isSwitching && (
              <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
            )}
            <div
              role="radiogroup"
              aria-label="Token source selection"
              className="inline-flex rounded-md border border-slate-300 p-0.5 bg-slate-100"
            >
              {/* System Token Button */}
              <button
                type="button"
                role="radio"
                aria-checked={!useCustomToken}
                onClick={() => handleTokenSourceChange('system')}
                disabled={isSwitching}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-all duration-150 ${
                  !useCustomToken
                    ? 'bg-white text-slate-900 shadow-md border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                } ${isSwitching ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                System
              </button>

              {/* Custom Token Button */}
              <button
                type="button"
                role="radio"
                aria-checked={useCustomToken}
                onClick={() => handleTokenSourceChange('custom')}
                disabled={isSwitching}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-all duration-150 ${
                  useCustomToken
                    ? 'bg-white text-slate-900 shadow-md border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                } ${isSwitching ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Custom
              </button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Show current connection status if connected with system token */}
        {isConnected && !useCustomToken && (
          <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-green-900 text-lg">AI Insights Enabled</span>
                </div>
                <div className="text-sm text-green-800">
                  <div className="flex items-center gap-2">
                    <span>Using system-provided Anthropic Claude API</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                      Free
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Show custom token connected state */}
        {isConnected && useCustomToken && llmConfig.token_source === 'custom' && (
          <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-green-900 text-lg">AI Insights Enabled</span>
                </div>
                <div className="text-sm text-green-800">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Provider:</span>
                      <span>{llmConfig.provider === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI (GPT)'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Token:</span>
                      <code className="font-mono text-xs bg-green-100 px-2 py-0.5 rounded border border-green-300">
                        {llmConfig.token_suffix}
                      </code>
                    </div>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-100"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Show system token info when toggle is OFF and not connected */}
        {!isConnected && !useCustomToken && (
          <div className="p-5 bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <Sparkles className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-slate-900">System Token</h4>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                    PROVIDED
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  Provided AI insights powered by our Anthropic Claude API. No setup required.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Show custom token input form when toggle is ON */}
        {useCustomToken && (!isConnected || llmConfig.token_source !== 'custom') && (
          <div className="space-y-4 p-5 bg-white border-2 border-slate-200 rounded-xl">
            <div className="pb-3 border-b border-slate-200">
              <h4 className="font-semibold text-slate-900 mb-1">Custom Token</h4>
              <p className="text-xs text-slate-500">
                Use your own API key • Your billing applies • Advanced users
              </p>
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700 mb-3 block">Choose Your Provider</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setProvider('anthropic')}
                  className={`px-4 py-2 rounded-md border transition-all text-center ${
                    provider === 'anthropic'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-900 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  <div className="font-medium text-sm">Anthropic</div>
                  <div className="text-xs mt-0.5 opacity-75">Claude AI</div>
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('openai')}
                  className={`px-4 py-2 rounded-md border transition-all text-center ${
                    provider === 'openai'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-900 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  <div className="font-medium text-sm">OpenAI</div>
                  <div className="text-xs mt-0.5 opacity-75">GPT Models</div>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-token" className="text-sm font-semibold text-slate-700">
                API Token
              </Label>
              <Input
                id="api-token"
                type="password"
                placeholder={provider === 'anthropic' ? 'sk-ant-api03-...' : 'sk-proj-...'}
                value={customToken}
                onChange={(e) => setCustomToken(e.target.value)}
                className="font-mono text-sm h-11 border-slate-300"
              />
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span>
                  {provider === 'anthropic'
                    ? 'Get your API key from console.anthropic.com'
                    : 'Get your API key from platform.openai.com'}
                </span>
                <a
                  href={provider === 'anthropic' ? 'https://console.anthropic.com' : 'https://platform.openai.com'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-purple-600 hover:text-purple-700 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Show Connect button when not connected or switching to custom token */}
        {(!isConnected || (useCustomToken && llmConfig.token_source !== 'custom')) && (
          <Button
            onClick={handleConnect}
            disabled={isConnecting || isSwitching || (useCustomToken && !customToken.trim())}
            className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-md h-11 text-base font-semibold"
          >
            {isConnecting || isSwitching ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Connect
              </>
            )}
          </Button>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Custom Token?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete your custom API token? This action cannot be undone.
              You will automatically switch back to the system-provided token.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete Token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
