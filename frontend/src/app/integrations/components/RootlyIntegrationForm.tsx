import { useState, useEffect } from "react"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HelpCircle, ChevronDown, CheckCircle, AlertCircle, Shield, Plus, Loader2, Eye, EyeOff, Copy, Check, Edit3, Users, ChevronUp } from "lucide-react"
import { UseFormReturn } from "react-hook-form"
import { RootlyFormData, PreviewData, RootlyTeam, API_BASE } from "../types"

interface RootlyIntegrationFormProps {
  form: UseFormReturn<RootlyFormData>
  onTest: (platform: 'rootly', token: string) => Promise<void>
  onAdd: () => void
  onTeamSelect: (teamNames: string[], selectedTeams: RootlyTeam[]) => void
  connectionStatus: 'idle' | 'success' | 'error' | 'duplicate'
  previewData: PreviewData | null
  duplicateInfo: any
  isTestingConnection: boolean
  isAdding: boolean
  isValidToken: (token: string) => boolean
  onCopyToken: (token: string) => void
  copied: boolean
  onMinimize?: () => void
  errorDetails?: { user_message: string; user_guidance: string; error_code: string } | null
}

export function RootlyIntegrationForm({
  form,
  onTest,
  onAdd,
  onTeamSelect,
  connectionStatus,
  previewData,
  duplicateInfo,
  isTestingConnection,
  isAdding,
  isValidToken,
  onCopyToken,
  copied,
  onMinimize,
  errorDetails
}: RootlyIntegrationFormProps) {
  const [showInstructions, setShowInstructions] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [lastTestedToken, setLastTestedToken] = useState<string>('')
  const [editingInline, setEditingInline] = useState(false)
  const [teams, setTeams] = useState<RootlyTeam[]>([])
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [selectedTeamNames, setSelectedTeamNames] = useState<string[]>([])
  const [allTeamsScope, setAllTeamsScope] = useState<{ already_added: boolean; existing_integration_name?: string | null }>({
    already_added: false,
    existing_integration_name: null,
  })

  const tokenValue = form.watch('rootlyToken')
  const alreadyAddedTeams = teams.filter((team) => team.already_added)
  const selectedTeams = teams.filter((team) => selectedTeamNames.includes(team.name))
  const selectedTeamLabel = selectedTeamNames.length === 0
    ? "All teams (entire org)"
    : selectedTeamNames.length === 1
      ? selectedTeamNames[0]
      : `${selectedTeamNames.length} teams selected`

  const updateSelectedTeams = (teamNames: string[]) => {
    setSelectedTeamNames(teamNames)
    const selectedTeamObjects = teams.filter((team) => teamNames.includes(team.name))
    onTeamSelect(teamNames, selectedTeamObjects)
  }

  const toggleTeamSelection = (teamName: string, checked: boolean) => {
    if (checked) {
      if (selectedTeamNames.includes(teamName)) return
      updateSelectedTeams([...selectedTeamNames, teamName])
      return
    }
    updateSelectedTeams(selectedTeamNames.filter((name) => name !== teamName))
  }

  // Auto-validate token when it's fully entered and valid format
  useEffect(() => {
    let cancelled = false

    const validateToken = async () => {
      try {
        if (!tokenValue || !isValidToken(tokenValue) || tokenValue === lastTestedToken) {
          return
        }

        setLastTestedToken(tokenValue)

        if (!cancelled) {
          await onTest('rootly', tokenValue)
        }
      } catch (error) {
        console.error('Token validation error:', error)
        // Error is handled by the onTest function
      }
    }

    validateToken()

    return () => {
      cancelled = true  // Cancel on unmount or dependency change
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

  // Fetch teams when a global key connects successfully
  useEffect(() => {
    if (connectionStatus !== 'success' || previewData?.key_type !== 'global') {
      setTeams([])
      setSelectedTeamNames([])
      setAllTeamsScope({ already_added: false, existing_integration_name: null })
      return
    }
    const token = form.getValues('rootlyToken')
    if (!token) return

    let cancelled = false
    setLoadingTeams(true)
    const authToken = localStorage.getItem('auth_token')
    if (!authToken) { setLoadingTeams(false); return }
    fetch(`${API_BASE}/rootly/token/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ token })
    })
      .then(r => r.json())
      .then(data => {
        if (!cancelled) {
          setTeams(data.teams || [])
          setAllTeamsScope({
            already_added: Boolean(data.all_teams_scope?.already_added),
            existing_integration_name: data.all_teams_scope?.existing_integration_name ?? null,
          })
          setSelectedTeamNames([])
          onTeamSelect([], [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTeams([])
          setAllTeamsScope({ already_added: false, existing_integration_name: null })
        }
      })
      .finally(() => { if (!cancelled) setLoadingTeams(false) })

    return () => { cancelled = true }
  }, [connectionStatus, previewData?.key_type])

  return (
    <Card className="border-purple-200 max-w-2xl mx-auto">
      <CardHeader className="p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Image src="/images/rootly-logo-icon.jpg" alt="Rootly" width={24} height={24} />
            </div>
            <div>
              <CardTitle>Add Rootly Integration</CardTitle>
            </div>
          </div>
          {onMinimize && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-neutral-500 hover:text-neutral-700"
              onClick={onMinimize}
              disabled={isAdding}
              aria-label="Minimize add integration card"
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
          )}
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
              <Alert className="border-purple-200 bg-purple-200">
                <AlertDescription>
                  <ol className="space-y-2 text-sm">
                    <li><strong>1.</strong> Log in to your Rootly account</li>
                    <li><strong>2.</strong> Navigate to <code className="bg-purple-100 px-1 rounded">Settings → API Keys</code></li>
                    <li><strong>3.</strong> Click <strong>Generate New API Key</strong></li>
                    <li><strong>4.</strong> Select <strong>Global API key</strong> or <strong>Personal API Key</strong></li>
                    <li><strong>5a.</strong> For <strong>Global API key</strong>: pick <strong>Admin</strong> or <strong>Owner</strong> as Role (required to read all team members)</li>
                    <li><strong>5b.</strong> For <strong>Personal API key</strong>: pick <strong>User</strong> permission or higher</li>
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
                  <FormLabel>Rootly API Token (Global or Personal type)</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showToken ? "text" : "password"}
                        placeholder="rootly_********************************"
                        className="pr-20"
                        onChange={(e) => field.onChange(e.target.value.trim())}
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
              <Alert className="border-purple-200 bg-purple-200">
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
                      <p className="font-semibold">
                        ✅ Token validated! Permissions verified.
                        {previewData.key_type === 'team' && previewData.team_name && (
                          <span className="ml-2 text-sm font-normal text-green-700">(Team-scoped: {previewData.team_name})</span>
                        )}
                      </p>
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
                                className="text-neutral-500 hover:text-neutral-700"
                                title="Edit integration name"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                          </>
                        )}
                        <span>({previewData.total_users} users)</span>
                      </div>
                      {previewData.key_type === 'team' && previewData.team_name && (
                        <p className="text-xs text-green-700 mt-1">
                          Note: Analysis will include only incidents within the team <strong>{previewData.team_name}</strong>.
                        </p>
                      )}
                      {form.watch('nickname') && form.watch('nickname') !== previewData.organization_name && (
                        <p className="text-xs text-green-700 mt-1">Custom name: {form.watch('nickname')}</p>
                      )}
                      {previewData.key_type === 'global' && (
                        <div className="mt-3 pt-3 border-t border-green-200">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Users className="w-3.5 h-3.5 text-green-700" />
                            <span className="text-xs font-medium text-green-800">Scope analysis to a team (optional)</span>
                          </div>
                          {loadingTeams ? (
                            <div className="flex items-center gap-2 text-xs text-green-700">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Loading teams...
                            </div>
                          ) : teams.length > 0 ? (
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 w-full justify-between text-xs bg-white border-green-300 text-green-900"
                                >
                                  <span className="truncate">{selectedTeamLabel}</span>
                                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="start"
                                className="w-(--radix-dropdown-menu-trigger-width) max-h-72 overflow-y-auto"
                              >
                                <DropdownMenuCheckboxItem
                                  checked={selectedTeamNames.length === 0}
                                  onSelect={(event) => event.preventDefault()}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      updateSelectedTeams([])
                                    }
                                  }}
                                  className={allTeamsScope.already_added ? "text-amber-700" : undefined}
                                >
                                  {`All teams (entire org)${
                                    allTeamsScope.already_added ? " (already added)" : ""
                                  }${
                                    allTeamsScope.already_added && allTeamsScope.existing_integration_name
                                      ? ` - ${allTeamsScope.existing_integration_name}`
                                      : ""
                                  }`}
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuSeparator />
                                {teams.map((team) => (
                                  <DropdownMenuCheckboxItem
                                    key={team.id}
                                    checked={selectedTeamNames.includes(team.name)}
                                    onSelect={(event) => event.preventDefault()}
                                    onCheckedChange={(checked) => toggleTeamSelection(team.name, checked === true)}
                                    className={team.already_added ? "text-amber-700" : undefined}
                                  >
                                    {`${team.name}${team.already_added ? " (already added)" : ""}${
                                      ` (${team.member_count ?? 0} members)`
                                    }${
                                      team.already_added && team.existing_integration_name
                                        ? ` - ${team.existing_integration_name}`
                                        : ""
                                    }`}
                                  </DropdownMenuCheckboxItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <p className="text-xs text-green-700">No teams found — analysis will cover the entire org.</p>
                          )}
                          {!loadingTeams && (
                            <p className={`text-xs mt-1 ${allTeamsScope.already_added || alreadyAddedTeams.length > 0 ? "text-amber-700" : "text-green-700"}`}>
                              {allTeamsScope.already_added || alreadyAddedTeams.length > 0
                                ? `Already added with this token:${allTeamsScope.already_added ? " all teams" : ""}${allTeamsScope.already_added && alreadyAddedTeams.length > 0 ? "," : ""}${alreadyAddedTeams.length > 0 ? ` ${alreadyAddedTeams.map((team) => team.name).join(", ")}` : ""}`
                                : "No scopes added with this token yet."}
                            </p>
                          )}
                          {selectedTeamNames.length > 0 && (
                            <p className="text-xs text-green-700 mt-1">
                              {selectedTeamNames.length === 1
                                ? <>Analysis will be scoped to incidents and members of <strong>{selectedTeamNames[0]}</strong>.</>
                                : <>Analysis will create scoped integrations for <strong>{selectedTeamNames.length}</strong> teams.</>}
                            </p>
                          )}
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-semibold mb-2">❌ Missing required permissions</p>
                      <p className="text-sm mb-2">This token does not have the required permissions to analyze health data.</p>
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
                  {errorDetails ? (
                    <div className="space-y-2">
                      <p className="font-semibold">❌ {errorDetails.user_message}</p>
                      <div className="text-sm whitespace-pre-line">{errorDetails.user_guidance}</div>
                      {errorDetails.error_code && (
                        <p className="text-xs text-red-700 mt-2">Error Code: {errorDetails.error_code}</p>
                      )}
                    </div>
                  ) : (
                    <p>❌ Invalid API token. Please verify your Rootly token and try again.</p>
                  )}
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
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    {selectedTeamNames.length > 1 ? `Save ${selectedTeamNames.length} Integrations` : "Save Integration"}
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
