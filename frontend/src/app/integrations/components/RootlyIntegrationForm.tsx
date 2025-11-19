import { useState, useEffect } from "react"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { HelpCircle, ChevronDown, CheckCircle, AlertCircle, Shield, Plus, Loader2, Eye, EyeOff, Copy, Check, Edit3 } from "lucide-react"
import { UseFormReturn } from "react-hook-form"
import { RootlyFormData, PreviewData } from "../types"

interface RootlyIntegrationFormProps {
  form: UseFormReturn<RootlyFormData>
  onTest: (platform: 'rootly', token: string) => Promise<void>
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

export function RootlyIntegrationForm({
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
}: RootlyIntegrationFormProps) {
  const [showInstructions, setShowInstructions] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [lastTestedToken, setLastTestedToken] = useState<string>('')
  const [editingInline, setEditingInline] = useState(false)

  const tokenValue = form.watch('rootlyToken')

  // Auto-validate token when it's fully entered and valid format
  useEffect(() => {
    if (tokenValue && isValidToken(tokenValue) && tokenValue !== lastTestedToken) {
      setLastTestedToken(tokenValue)
      onTest('rootly', tokenValue)
    }
  }, [tokenValue, lastTestedToken, isValidToken, onTest])

  // Auto-populate name field when preview data is available
  useEffect(() => {
    if (previewData?.suggested_name && connectionStatus === 'success') {
      const currentName = form.getValues('nickname')
      // Only auto-fill if the field is empty
      if (!currentName) {
        form.setValue('nickname', previewData.suggested_name)
      }
    }
  }, [previewData, connectionStatus, form])

  return (
    <Card className="border-purple-200 max-w-2xl mx-auto">
      <CardHeader className="p-8">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Image src="/images/rootly-logo-branded.png" alt="Rootly" width={24} height={24} />
          </div>
          <div>
            <CardTitle>Add Rootly Integration</CardTitle>
            <CardDescription>Connect your Rootly account to analyze incident data</CardDescription>
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
            <span>How to get your Rootly API token</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showInstructions ? 'rotate-180' : ''}`} />
          </button>
          {showInstructions && (
            <div className="mt-4">
              <Alert className="border-purple-200 bg-purple-50">
                <AlertDescription>
                  <ol className="space-y-2 text-sm">
                    <li><strong>1.</strong> Log in to your Rootly account</li>
                    <li><strong>2.</strong> Navigate to <code className="bg-purple-100 px-1 rounded">Settings → API Keys</code></li>
                    <li><strong>3.</strong> Click <strong>Generate New API Key</strong></li>
                    <li><strong>4.</strong> Select <strong>Global API key</strong> or <strong>Team API Key</strong></li>
                    <li><strong>5.</strong> For <strong>Global API key</strong>, pick <strong>Observer</strong> as Role</li>
                    <li><strong>6.</strong> Click <strong>Create</strong> and copy the generated token (starts with <strong>"rootly_"</strong>)</li>
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
              name="rootlyToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rootly API Token</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showToken ? "text" : "password"}
                        placeholder="rootly_********************************"
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
                  <FormDescription>
                    Token should start with "rootly_" followed by 64 hex characters
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Validating Status */}
            {isTestingConnection && (
              <Alert className="border-purple-200 bg-purple-50">
                <Loader2 className="h-4 w-4 text-purple-600 animate-spin" />
                <AlertDescription className="text-purple-800">
                  Validating token and checking permissions...
                </AlertDescription>
              </Alert>
            )}

            {/* Connection Status */}
            {connectionStatus === 'success' && previewData && (
              <>
                {previewData.permissions?.users?.access && previewData.permissions?.incidents?.access ? (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      <p className="font-semibold">✅ Token validated! Permissions verified.</p>
                      <div className="text-sm mt-1 flex items-center gap-2 flex-wrap">
                        <span>Connected to</span>
                        {editingInline ? (
                          <Input
                            value={form.watch('nickname') || previewData.organization_name}
                            onChange={(e) => form.setValue('nickname', e.target.value)}
                            className="h-6 w-64 inline-flex"
                            autoFocus
                            onBlur={() => setEditingInline(false)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setEditingInline(false)
                              }
                            }}
                          />
                        ) : (
                          <>
                            <span className="font-medium">{form.watch('nickname') || previewData.organization_name}</span>
                            {previewData.can_add && (
                              <button
                                type="button"
                                onClick={() => setEditingInline(true)}
                                className="text-gray-500 hover:text-gray-700"
                                title="Edit integration name"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                          </>
                        )}
                        <span>({previewData.total_users} users)</span>
                      </div>
                      {form.watch('nickname') && form.watch('nickname') !== previewData.organization_name && (
                        <p className="text-xs text-green-700 mt-1">Custom name: {form.watch('nickname')}</p>
                      )}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-semibold mb-2">❌ Missing required permissions</p>
                      <p className="text-sm mb-2">This token does not have the required permissions to analyze burnout data.</p>
                      <div className="mt-2 text-sm space-y-1">
                        <p className="font-medium">Required permissions:</p>
                        {!previewData.permissions?.users?.access && (
                          <p>• <strong>Users:</strong> {previewData.permissions?.users?.error || "Read access required"}</p>
                        )}
                        {!previewData.permissions?.incidents?.access && (
                          <p>• <strong>Incidents:</strong> {previewData.permissions?.incidents?.error || "Read access required"}</p>
                        )}
                      </div>
                      <p className="text-sm mt-2">Please create a new API token with the required permissions and try again.</p>
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {connectionStatus === 'error' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  ❌ Invalid API token. Please verify your Rootly token and try again.
                </AlertDescription>
              </Alert>
            )}

            {connectionStatus === 'duplicate' && duplicateInfo && (
              <Alert className="border-yellow-200 bg-yellow-50">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  This Rootly account is already connected as "{duplicateInfo.existing_integration?.name || 'Unknown'}".
                </AlertDescription>
              </Alert>
            )}

            {connectionStatus === 'success' && previewData?.can_add && previewData.permissions?.users?.access && previewData.permissions?.incidents?.access && (
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
