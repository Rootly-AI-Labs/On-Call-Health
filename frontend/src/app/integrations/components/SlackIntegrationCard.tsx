import { useState } from "react"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { HelpCircle, ChevronDown, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react"

interface SlackIntegrationCardProps {
  onConnect: (webhookUrl: string, botToken: string) => Promise<void>
  isConnecting: boolean
}

export function SlackIntegrationCard({ onConnect, isConnecting }: SlackIntegrationCardProps) {
  const [showInstructions, setShowInstructions] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [botToken, setBotToken] = useState("")
  const [showWebhook, setShowWebhook] = useState(false)
  const [showToken, setShowToken] = useState(false)

  return (
    <Card className="border-purple-200 max-w-2xl mx-auto">
      <CardHeader className="p-8">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center">
            <Image
              src="/images/slack-logo.png"
              alt="Slack"
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
          </div>
          <div>
            <CardTitle>Add Slack Integration</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-8 pt-0">
        {/* Instructions */}
        <div>
          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center space-x-2 text-sm text-purple-600 hover:text-purple-700"
          >
            <HelpCircle className="w-4 h-4" />
            <span>How to get your Slack credentials</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showInstructions ? 'rotate-180' : ''}`} />
          </button>
          {showInstructions && (
            <div className="mt-4">
              <Alert className="border-purple-200 bg-purple-50">
                <AlertDescription>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-purple-900 mb-2"><strong>Step 1:</strong> Create a Slack App</h4>
                      <p className="text-sm text-purple-800 mb-2">
                        Go to the <strong>Slack API website</strong> and create a new app:
                      </p>
                      <a
                        href="https://api.slack.com/apps"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm text-blue-600 hover:underline"
                      >
                        Create Slack App <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                      <p className="text-sm text-purple-800 mt-2">Click "Create New App" → "From scratch" → Enter app name and select your workspace</p>
                    </div>

                    <div>
                      <h4 className="font-medium text-purple-900 mb-2">Step 2: Configure Incoming Webhooks</h4>
                      <p className="text-sm text-purple-800 mb-2">In your app settings:</p>
                      <ul className="text-sm text-purple-800 space-y-1 ml-4">
                        <li>• Go to "Incoming Webhooks" in the sidebar</li>
                        <li>• Toggle "Activate Incoming Webhooks" to <strong>On</strong></li>
                        <li>• Click "Add New Webhook to Workspace"</li>
                        <li>• Select a channel and click "Allow"</li>
                        <li>• Copy the webhook URL (starts with <code className="bg-purple-200 px-1 rounded">https://hooks.slack.com/</code>)</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium text-purple-900 mb-2">Step 3: Add Bot Token Scopes</h4>
                      <p className="text-sm text-purple-800 mb-2">In "OAuth & Permissions" → "Scopes" → "Bot Token Scopes", add these <strong>3 required scopes</strong>:</p>
                      <ul className="text-sm text-purple-800 space-y-1 ml-4">
                        <li>• <code className="bg-purple-200 px-1 rounded">channels:read</code> - View basic channel information</li>
                        <li>• <code className="bg-purple-200 px-1 rounded">channels:history</code> - Read public channel messages</li>
                        <li>• <code className="bg-purple-200 px-1 rounded">users:read</code> - View user information</li>
                      </ul>
                      <div className="mt-2 p-2 bg-amber-100 border border-amber-300 rounded text-xs text-amber-800">
                        <strong>Important:</strong> After adding scopes, you MUST reinstall the app to your workspace for changes to take effect.
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-purple-900 mb-2">Step 4: Install App and Get Bot Token</h4>
                      <ul className="text-sm text-purple-800 space-y-1 ml-4">
                        <li>• Click "Install to Workspace" at the top of OAuth & Permissions</li>
                        <li>• Review permissions and click "Allow"</li>
                        <li>• Copy the "Bot User OAuth Token" (starts with <code className="bg-purple-200 px-1 rounded">xoxb-</code>)</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium text-purple-900 mb-2">Step 5: Add Bot to Channels</h4>
                      <p className="text-sm text-purple-800 mb-2">After setup, add the bot to relevant channels:</p>
                      <ul className="text-sm text-purple-800 space-y-1 ml-4">
                        <li>• Go to each channel you want analyzed in Slack</li>
                        <li>• Type <code className="bg-purple-200 px-1 rounded">@Burnout Detector</code> and invite the bot</li>
                        <li>• The bot must be in channels to read message history</li>
                      </ul>
                      <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-xs text-red-800">
                        <strong>Required:</strong> Bot permissions will show "Bot not in channels" until you add it to at least one channel.
                      </div>
                    </div>

                    <div className="bg-purple-100 border border-purple-300 rounded p-3">
                      <p className="text-sm text-purple-800">
                        <strong>Note:</strong> You'll need both the webhook URL and bot token. The webhook is for sending notifications,
                        and the bot token is for reading messages and user data.
                      </p>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="slack-webhook" className="text-sm font-medium">Slack Webhook URL</label>
          <div className="relative">
            <Input
              id="slack-webhook"
              type={showWebhook ? "text" : "password"}
              placeholder="https://hooks.slack.com/services/..."
              className="pr-10"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowWebhook(!showWebhook)}
            >
              {showWebhook ? (
                <EyeOff className="h-4 w-4 text-gray-400" />
              ) : (
                <Eye className="h-4 w-4 text-gray-400" />
              )}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="slack-token" className="text-sm font-medium">Slack Bot Token</label>
          <div className="relative">
            <Input
              id="slack-token"
              type={showToken ? "text" : "password"}
              placeholder="xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx"
              className="pr-10"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? (
                <EyeOff className="h-4 w-4 text-gray-400" />
              ) : (
                <Eye className="h-4 w-4 text-gray-400" />
              )}
            </Button>
          </div>
        </div>
        <Button
          className="bg-purple-600 hover:bg-purple-700 text-white"
          onClick={() => webhookUrl && botToken && onConnect(webhookUrl, botToken)}
          disabled={!webhookUrl || !botToken || isConnecting}
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Connecting...
            </>
          ) : (
            'Connect Slack'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
