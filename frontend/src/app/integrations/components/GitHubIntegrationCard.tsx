import { useState } from "react"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { HelpCircle, ChevronDown, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react"

interface GitHubIntegrationCardProps {
  onConnect: (token: string) => Promise<void>
  isConnecting: boolean
}

export function GitHubIntegrationCard({ onConnect, isConnecting }: GitHubIntegrationCardProps) {
  const [showInstructions, setShowInstructions] = useState(false)
  const [token, setToken] = useState("")
  const [showToken, setShowToken] = useState(false)

  return (
    <Card className="border-neutral-200 max-w-2xl mx-auto">
      <CardHeader className="p-8">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center">
            <Image
              src="/images/github-logo.png"
              alt="GitHub"
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
          </div>
          <div>
            <CardTitle>Add GitHub Integration</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-8 pt-0">
        {/* Instructions */}
        <div>
          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center space-x-2 text-sm text-neutral-700 hover:text-neutral-700"
          >
            <HelpCircle className="w-4 h-4" />
            <span>How to get your GitHub Personal Access Token</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showInstructions ? 'rotate-180' : ''}`} />
          </button>
          {showInstructions && (
            <div className="mt-4">
              <Alert className="border-neutral-200 bg-neutral-100">
                <AlertDescription>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-neutral-900 mb-2"><strong>Step 1:</strong> Go to GitHub Settings</h4>
                      <p className="text-sm text-neutral-700 mb-2">
                        Navigate to <strong>GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)</strong>
                      </p>
                      <a
                        href="https://github.com/settings/tokens"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm text-blue-600 hover:underline"
                      >
                        Open GitHub Settings <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </div>

                    <div>
                      <h4 className="font-medium text-neutral-900 mb-2"><strong>Step 2:</strong> Generate New Token</h4>
                      <p className="text-sm text-neutral-700 mb-2">Click <strong>"Generate new token (classic)"</strong> and configure:</p>
                      <ul className="text-sm text-neutral-700 space-y-1 ml-4">
                        <li>• <strong>Note:</strong> Give it a descriptive name (e.g., "Burnout Detector")</li>
                        <li>• <strong>Expiration:</strong> Set an appropriate expiration date</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium text-neutral-900 mb-2"><strong>Step 3:</strong> Select Required Scopes</h4>
                      <p className="text-sm text-neutral-700 mb-2">Select these <strong>permissions:</strong></p>
                      <ul className="text-sm text-neutral-700 space-y-1 ml-4">
                        <li>• <code className="bg-neutral-300 px-1 rounded">repo</code> - Full repository access</li>
                        <li>• <code className="bg-neutral-300 px-1 rounded">read:user</code> - Read user profile information</li>
                        <li>• <code className="bg-neutral-300 px-1 rounded">read:org</code> - Read organization membership</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium text-neutral-900 mb-2"><strong>Step 4:</strong> Generate and Copy Token</h4>
                      <p className="text-sm text-neutral-700">
                        Click <strong>"Generate token"</strong> and immediately copy the token (starts with <code className="bg-neutral-300 px-1 rounded">ghp_</code>).
                        <strong>You won't be able to see it again!</strong>
                      </p>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="github-token" className="text-sm font-medium">GitHub Personal Access Token</label>
          <div className="relative">
            <Input
              id="github-token"
              type={showToken ? "text" : "password"}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="pr-10"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? (
                <EyeOff className="h-4 w-4 text-neutral-500" />
              ) : (
                <Eye className="h-4 w-4 text-neutral-500" />
              )}
            </Button>
          </div>
        </div>
        <Button
          className="bg-neutral-900 hover:bg-neutral-800 text-white"
          onClick={() => token && onConnect(token)}
          disabled={!token || isConnecting}
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Connecting...
            </>
          ) : (
            'Connect GitHub'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
