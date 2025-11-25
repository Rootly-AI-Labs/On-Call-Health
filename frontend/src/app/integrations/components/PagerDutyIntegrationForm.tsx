import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { HelpCircle, ChevronDown, CheckCircle, AlertCircle, Shield, Plus, Loader2, Eye, EyeOff, Copy, Check } from "lucide-react"
import { UseFormReturn } from "react-hook-form"
import { PagerDutyFormData, PreviewData } from "../types"

interface PagerDutyIntegrationFormProps {
  form: UseFormReturn<PagerDutyFormData>
  onTest: (platform: 'pagerduty', token: string) => Promise<void>
  onAdd: () => void
  connectionStatus: 'idle' | 'success' | 'error' | 'duplicate'
  previewData: PreviewData | null
  duplicateInfo: any
  isTestingConnection: boolean
  isAdding: boolean
  isValidToken: (token: string) => boolean
  onCopyToken: (token: string) => void
  copied: boolean
}

export function PagerDutyIntegrationForm({
  form,
  onTest,
  onAdd,
  connectionStatus,
  previewData,
  duplicateInfo,
  isTestingConnection,
  isAdding,
  isValidToken,
  onCopyToken,
  copied
}: PagerDutyIntegrationFormProps) {
  const [showInstructions, setShowInstructions] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [lastTestedToken, setLastTestedToken] = useState<string>('')

  const tokenValue = form.watch('pagerdutyToken')

  // Auto-validate token when it's fully entered and valid format
  useEffect(() => {
    if (tokenValue && isValidToken(tokenValue) && tokenValue !== lastTestedToken) {
      setLastTestedToken(tokenValue)
      onTest('pagerduty', tokenValue)
    }
  }, [tokenValue, lastTestedToken, isValidToken, onTest])

  return (
    <Card className="border-green-200 max-w-2xl mx-auto">
      <CardHeader className="p-8">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <span className="text-green-600 font-bold">PD</span>
          </div>
          <div>
            <CardTitle>Add PagerDuty Integration</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-8 pt-0">
        {/* Instructions */}
        <div>
          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center space-x-2 text-sm text-green-600 hover:text-green-700"
          >
            <HelpCircle className="w-4 h-4" />
            <span>How to get your PagerDuty API token</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showInstructions ? 'rotate-180' : ''}`} />
          </button>
          {showInstructions && (
            <div className="mt-4">
              <Alert className="border-green-200 bg-green-50">
                <AlertDescription>
                  <ol className="space-y-2 text-sm">
                    <li><strong>1.</strong> In your PagerDuty account, click on <strong>Integrations</strong> in the top navigation</li>
                    <li><strong>2.</strong> Look for <strong>API Access Keys</strong> in the dropdown menu</li>
                    <li><strong>3.</strong> Click <code className="bg-green-100 px-1 rounded">Create API User Token</code> (NOT "Create API Key" - must be user-level)</li>
                    <li><strong>4.</strong> Give it a description (e.g., <strong>"Burnout Detector"</strong>) and click <strong>Create</strong></li>
                    <li><strong>5.</strong> Copy the generated token (starts with letters/numbers like <strong>"u+..."</strong>)</li>
                  </ol>
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        {/* Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(() => {})} className="space-y-4">
            <FormField
              control={form.control}
              name="pagerdutyToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PagerDuty API Token</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showToken ? "text" : "password"}
                        placeholder="Enter your PagerDuty API token"
                        className="pr-20"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center space-x-1 pr-3">
                        {field.value && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => onCopyToken(field.value)}
                          >
                            {copied ? (
                              <Check className="h-3 w-3 text-green-600" />
                            ) : (
                              <Copy className="h-3 w-3 text-slate-400" />
                            )}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setShowToken(!showToken)}
                        >
                          {showToken ? (
                            <EyeOff className="h-3 w-3 text-slate-400" />
                          ) : (
                            <Eye className="h-3 w-3 text-slate-400" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Validating Status */}
            {isTestingConnection && (
              <Alert className="border-green-200 bg-green-50">
                <Loader2 className="h-4 w-4 text-green-600 animate-spin" />
                <AlertDescription className="text-green-800">
                  Validating token and checking permissions...
                </AlertDescription>
              </Alert>
            )}

            {/* Connection Status */}
            {connectionStatus === 'success' && previewData && (
              <>
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    <div className="space-y-2">
                      <p className="font-semibold">✅ Token validated!</p>
                      <div className="space-y-1 text-sm">
                        <p><span className="font-medium">Organization:</span> {previewData.organization_name}</p>
                        <p><span className="font-medium">Users:</span> {previewData.total_users}</p>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>

                {previewData.can_add && (
                  <FormField
                    control={form.control}
                    name="nickname"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Integration Name (optional)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={previewData.suggested_name || previewData.organization_name}
                          />
                        </FormControl>
                        <FormDescription>
                          Give this integration a custom name
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                )}
              </>
            )}

            {connectionStatus === 'error' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  ❌ Invalid API token. Please verify your PagerDuty token and try again.
                </AlertDescription>
              </Alert>
            )}

            {connectionStatus === 'duplicate' && duplicateInfo && (
              <Alert className="border-yellow-200 bg-yellow-50">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  This PagerDuty account is already connected as "{duplicateInfo.existing_integration?.name || 'Unknown'}".
                </AlertDescription>
              </Alert>
            )}

            {connectionStatus === 'success' && previewData?.can_add && (
              <Button
                type="button"
                onClick={onAdd}
                disabled={isAdding}
                className="bg-green-600 hover:bg-green-700 w-full"
              >
                {isAdding ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding Integration...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Integration
                  </>
                )}
              </Button>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
