import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CheckCircle, ChevronDown, Loader2, Trash2, Users, Zap } from "lucide-react"

interface OpenAIUsageConnectedCardProps {
  onTest: () => Promise<void>
  onDisconnect: () => Promise<void>
  onViewMappings?: () => void
  isLoading: boolean
}

export function OpenAIUsageConnectedCard({ onTest, onDisconnect, onViewMappings, isLoading }: OpenAIUsageConnectedCardProps) {
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      await onTest()
      setTestResult({ success: true, message: "Connection verified successfully" })
    } catch (e: any) {
      setTestResult({ success: false, message: e?.message ?? "Connection test failed" })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <Card className="border-2 border-green-200 bg-green-50/50 max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <Image src="/images/openai-logo.svg" alt="OpenAI" width={24} height={24} className="w-6 h-6" />
          <div>
            <CardTitle className="text-lg flex items-center space-x-2">
              <span>OpenAI Usage</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Badge variant="secondary" className="bg-green-100 text-green-700 cursor-pointer hover:bg-green-200 transition-colors">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Connected
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Badge>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleTest} disabled={isTesting || isLoading}>
                    {isTesting ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Zap className="w-3 h-3 mr-2" />}
                    Test Connection
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardTitle>
            <p className="text-sm text-slate-600">Daily token consumption from OpenAI APIs</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {testResult && (
          <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
            testResult.success ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
          }`}>
            {testResult.success ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <span className="shrink-0">✕</span>}
            {testResult.message}
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
          <div className="font-medium mb-1">Data Collection</div>
          <div>We collect daily token consumption and request counts from your OpenAI organization. Usage data is shown on the dashboard after each analysis run.</div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          {onViewMappings && (
            <Button variant="outline" size="sm" onClick={onViewMappings}>
              <Users className="w-4 h-4 mr-2" />
              View Mappings
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDisconnect}
            disabled={isLoading || isTesting}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto"
          >
            {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Disconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
