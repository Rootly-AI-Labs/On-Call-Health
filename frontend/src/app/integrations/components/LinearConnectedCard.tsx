import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AlertCircle, CheckCircle, Calendar, Key, Trash2, Zap, Loader2, ChevronDown, AlertTriangle, ArrowLeftRight } from "lucide-react"
import type { LinearIntegration, AuthMethod } from "../types"
import { StatusIndicator } from "./StatusIndicator"
import { AuthMethodBadge } from "./AuthMethodBadge"

interface LinearConnectedCardProps {
  integration: LinearIntegration
  onDisconnect: () => void
  onTest: () => void
  onSwitchAuth: () => void
  isLoading?: boolean
}

export function LinearConnectedCard({
  integration,
  onDisconnect,
  onTest,
  onSwitchAuth,
  isLoading = false
}: LinearConnectedCardProps) {
  // Check if token is invalid
  const hasTokenError = integration.token_valid === false

  return (
    <Card className={`border-2 ${hasTokenError ? 'border-red-200 bg-red-50/50' : 'border-green-200 bg-green-50/50'} max-w-2xl mx-auto`}>
      <CardHeader>
        <div className="flex items-center space-x-3">
          <Image src="/images/linear-logo.png" alt="Linear" width={40} height={40} quality={100} />
          <div>
            <CardTitle className="text-lg flex items-center space-x-2">
              <span>Linear</span>
              <AuthMethodBadge authMethod={integration.token_source as AuthMethod} />
              {hasTokenError ? (
                <StatusIndicator status="error" />
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="cursor-pointer">
                      <StatusIndicator
                        status="connected"
                        authMethod={integration.token_source as AuthMethod}
                        className="hover:bg-green-200 transition-colors"
                      />
                      <ChevronDown className="w-3 h-3 ml-1 inline" />
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={onTest} disabled={isLoading}>
                      {isLoading ? (
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      ) : (
                        <Zap className="w-3 h-3 mr-2" />
                      )}
                      Test Connection
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </CardTitle>
            <p className="text-sm text-slate-600">Project management and issue tracking</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Token Validation Error Alert */}
        {hasTokenError && integration.token_error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <AlertDescription className="text-red-800 text-sm">
              <strong>Authentication Error:</strong> {integration.token_error}
            </AlertDescription>
          </Alert>
        )}

        {/* Integration Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {integration.linear_display_name && (
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-slate-400" />
              <div>
                <div className="font-medium">User</div>
                <div className="text-slate-600">{integration.linear_display_name}</div>
              </div>
            </div>
          )}

          {integration.linear_email && (
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <div>
                <div className="font-medium">Email</div>
                <div className="text-slate-600">{integration.linear_email}</div>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <div>
              <div className="font-medium">Last Updated</div>
              <div className="text-slate-600">
                {new Date(integration.updated_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Token Expiry */}
        {integration.token_expires_at && (
          <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-3">
            <div className="flex items-start space-x-2 text-xs text-neutral-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Token Expiry</div>
                <div>{new Date(integration.token_expires_at).toLocaleString()}</div>
                {integration.supports_refresh && (
                  <div className="text-neutral-700 mt-1">Auto-refresh is enabled</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Info Note */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
          <div className="font-medium mb-1">Data Collection</div>
          <div>
            We collect issue assignments, priorities, due dates, and team membership data to analyze workload patterns and identify risk of overwork.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-2 pt-4 border-t">
          {!hasTokenError && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSwitchAuth}
              disabled={isLoading}
              className="text-blue-600 border-blue-300 hover:bg-blue-50"
            >
              <ArrowLeftRight className="w-4 h-4 mr-2" />
              Switch to {integration.token_source === 'oauth' ? 'API Token' : 'OAuth'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDisconnect}
            disabled={isLoading}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Disconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
