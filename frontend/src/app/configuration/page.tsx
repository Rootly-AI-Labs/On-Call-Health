"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { getConfiguration, updateConfiguration, exportConfiguration, importConfiguration } from "@/lib/configuration-api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Heart,
  Shield,
  BarChart3,
  Database,
  BookOpen,
  Settings,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Info,
  AlertCircle,
  CheckCircle2,
  Code,
  Download,
  Upload,
  Copy,
  Zap,
  ArrowLeft
} from "lucide-react"

export default function ConfigurationPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Loading states
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  // State for CBI dimension weights
  const [cbiWeights, setCbiWeights] = useState({
    personal: 50,
    work: 50
  })

  // State for active preset
  const [activePreset, setActivePreset] = useState("default")

  // State for expanded sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    personalBurnout: false,
    workBurnout: false,
    riskFactors: false
  })

  // State for integration impacts
  const [integrationImpacts, setIntegrationImpacts] = useState({
    teamHealth: { rootly: 60, github: 20, slack: 20 },
    atRisk: { rootly: 90, github: 10, slack: 0 },
    workload: { rootly: 100, github: 0, slack: 0 },
    afterHours: { rootly: 60, github: 25, slack: 15 },
    weekendWork: { rootly: 65, github: 25, slack: 10 },
    responseTime: { rootly: 100, github: 0, slack: 0 },
    incidentLoad: { rootly: 100, github: 0, slack: 0 }
  })

  // Calculate if weights sum to 100%
  const weightsSum = cbiWeights.personal + cbiWeights.work
  const weightsValid = weightsSum === 100

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const applyPreset = (presetName: string) => {
    setActivePreset(presetName)

    if (presetName === "default") {
      setCbiWeights({ personal: 50, work: 50 })
      setIntegrationImpacts({
        teamHealth: { rootly: 60, github: 20, slack: 20 },
        atRisk: { rootly: 90, github: 10, slack: 0 },
        workload: { rootly: 100, github: 0, slack: 0 },
        afterHours: { rootly: 60, github: 25, slack: 15 },
        weekendWork: { rootly: 65, github: 25, slack: 10 },
        responseTime: { rootly: 100, github: 0, slack: 0 },
        incidentLoad: { rootly: 100, github: 0, slack: 0 }
      })
    } else if (presetName === "incident-focused") {
      setCbiWeights({ personal: 40, work: 60 })
      setIntegrationImpacts({
        teamHealth: { rootly: 80, github: 10, slack: 10 },
        atRisk: { rootly: 95, github: 5, slack: 0 },
        workload: { rootly: 100, github: 0, slack: 0 },
        afterHours: { rootly: 80, github: 15, slack: 5 },
        weekendWork: { rootly: 85, github: 10, slack: 5 },
        responseTime: { rootly: 100, github: 0, slack: 0 },
        incidentLoad: { rootly: 100, github: 0, slack: 0 }
      })
    } else if (presetName === "development") {
      setCbiWeights({ personal: 60, work: 40 })
      setIntegrationImpacts({
        teamHealth: { rootly: 40, github: 45, slack: 15 },
        atRisk: { rootly: 70, github: 25, slack: 5 },
        workload: { rootly: 60, github: 35, slack: 5 },
        afterHours: { rootly: 40, github: 45, slack: 15 },
        weekendWork: { rootly: 40, github: 50, slack: 10 },
        responseTime: { rootly: 70, github: 20, slack: 10 },
        incidentLoad: { rootly: 80, github: 15, slack: 5 }
      })
    } else if (presetName === "communication") {
      setCbiWeights({ personal: 55, work: 45 })
      setIntegrationImpacts({
        teamHealth: { rootly: 35, github: 25, slack: 40 },
        atRisk: { rootly: 60, github: 15, slack: 25 },
        workload: { rootly: 70, github: 10, slack: 20 },
        afterHours: { rootly: 40, github: 20, slack: 40 },
        weekendWork: { rootly: 50, github: 15, slack: 35 },
        responseTime: { rootly: 60, github: 15, slack: 25 },
        incidentLoad: { rootly: 80, github: 10, slack: 10 }
      })
    }
  }

  const getImpactColor = (percentage: number) => {
    if (percentage >= 50) return "bg-red-500"
    if (percentage >= 20) return "bg-orange-500"
    if (percentage >= 10) return "bg-yellow-500"
    return "bg-green-500"
  }

  const getImpactLabel = (percentage: number) => {
    if (percentage >= 50) return "Primary"
    if (percentage >= 20) return "Significant"
    if (percentage >= 10) return "Minor"
    return "None"
  }

  // Load configuration on mount
  useEffect(() => {
    loadConfiguration()
  }, [])

  const loadConfiguration = async () => {
    try {
      setLoading(true)
      const config = await getConfiguration()

      setCbiWeights(config.cbiWeights)
      setIntegrationImpacts(config.integrationImpacts)
      setActivePreset(config.activePreset)

      toast.success("Configuration loaded")
    } catch (error: any) {
      console.error("Error loading configuration:", error)
      toast.error(error.message || "Failed to load configuration")
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!weightsValid) {
      toast.error("CBI weights must sum to 100% before saving")
      return
    }

    try {
      setSaving(true)
      await updateConfiguration({
        cbiWeights,
        integrationImpacts,
        activePreset
      })

      toast.success("Configuration saved successfully")
    } catch (error: any) {
      console.error("Error saving configuration:", error)
      toast.error(error.message || "Failed to save configuration")
    } finally {
      setSaving(false)
    }
  }

  const handleExport = async () => {
    try {
      setExporting(true)
      const blob = await exportConfiguration()

      // Create download link
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `burnout-config-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success("Configuration exported successfully")
    } catch (error: any) {
      console.error("Error exporting configuration:", error)
      toast.error(error.message || "Failed to export configuration")
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setImporting(true)
      const config = await importConfiguration(file)

      setCbiWeights(config.cbiWeights)
      setIntegrationImpacts(config.integrationImpacts)
      setActivePreset(config.activePreset)

      toast.success("Configuration imported successfully")
    } catch (error: any) {
      console.error("Error importing configuration:", error)
      toast.error(error.message || "Failed to import configuration")
    } finally {
      setImporting(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading configuration...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          {/* Back Button */}
          <Button
            variant="ghost"
            onClick={() => router.push('/dashboard')}
            className="mb-4 flex items-center space-x-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center space-x-3">
                <BookOpen className="w-8 h-8 text-purple-600" />
                <span>Configuration & Documentation</span>
              </h1>
              <p className="text-gray-600">
                Understand metrics, adjust calculation weights, and customize burnout analysis
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                className="flex items-center space-x-2"
                onClick={handleExport}
                disabled={exporting}
              >
                <Download className="w-4 h-4" />
                <span>{exporting ? "Exporting..." : "Export Config"}</span>
              </Button>
              <Button
                variant="outline"
                className="flex items-center space-x-2"
                onClick={triggerFileInput}
                disabled={importing}
              >
                <Upload className="w-4 h-4" />
                <span>{importing ? "Importing..." : "Import Config"}</span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
              <Button
                className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700"
                onClick={handleSave}
                disabled={saving || !weightsValid}
              >
                <Save className="w-4 h-4" />
                <span>{saving ? "Saving..." : "Save Changes"}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Validation Alert */}
        {!weightsValid && (
          <Alert className="mb-6 border-orange-300 bg-orange-50">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              CBI dimension weights must sum to 100%. Current total: {weightsSum}%
            </AlertDescription>
          </Alert>
        )}

        {/* Main Tabs */}
        <Tabs defaultValue="metrics" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 h-auto p-1">
            <TabsTrigger value="metrics" className="flex items-center space-x-2 py-3">
              <BarChart3 className="w-4 h-4" />
              <span>Metrics Docs</span>
            </TabsTrigger>
            <TabsTrigger value="weights" className="flex items-center space-x-2 py-3">
              <Settings className="w-4 h-4" />
              <span>Weight Config</span>
            </TabsTrigger>
            <TabsTrigger value="integrations" className="flex items-center space-x-2 py-3">
              <Database className="w-4 h-4" />
              <span>Integration Impact</span>
            </TabsTrigger>
            <TabsTrigger value="presets" className="flex items-center space-x-2 py-3">
              <Zap className="w-4 h-4" />
              <span>Presets</span>
            </TabsTrigger>
            <TabsTrigger value="calculations" className="flex items-center space-x-2 py-3">
              <Code className="w-4 h-4" />
              <span>Calculations</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Metrics Documentation */}
          <TabsContent value="metrics" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Heart className="w-5 h-5 text-purple-600" />
                  <span>Team Health Score</span>
                </CardTitle>
                <CardDescription>Copenhagen Burnout Inventory (CBI) - Average Team Score</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">What It Measures</h4>
                    <p className="text-sm text-gray-600">
                      Average Copenhagen Burnout Inventory score across all on-call team members.
                      CBI is a scientifically validated methodology for measuring burnout across three dimensions.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Calculation</h4>
                    <div className="bg-gray-50 rounded p-3 font-mono text-xs text-gray-700">
                      team_health = Σ(member.cbi_score) / total_members
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Data Sources</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-purple-900">Rootly/PagerDuty</span>
                        <Badge className="bg-red-500">60%</Badge>
                      </div>
                      <p className="text-xs text-purple-700">Incident frequency, response times, on-call burden</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900">GitHub</span>
                        <Badge className="bg-orange-500">20%</Badge>
                      </div>
                      <p className="text-xs text-gray-700">Commit patterns, PR velocity, after-hours coding</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-purple-900">Slack</span>
                        <Badge className="bg-orange-500">20%</Badge>
                      </div>
                      <p className="text-xs text-purple-700">Message volume, communication patterns, sentiment</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Risk Thresholds</h4>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-700">0-24</div>
                      <div className="text-xs font-medium text-green-600 mt-1">🟢 Healthy</div>
                      <div className="text-xs text-green-600 mt-1">Low burnout risk</div>
                    </div>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-yellow-700">25-49</div>
                      <div className="text-xs font-medium text-yellow-600 mt-1">🟡 Fair</div>
                      <div className="text-xs text-yellow-600 mt-1">Mild symptoms</div>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-orange-700">50-74</div>
                      <div className="text-xs font-medium text-orange-600 mt-1">🟠 Poor</div>
                      <div className="text-xs text-orange-600 mt-1">Intervention needed</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-red-700">75-100</div>
                      <div className="text-xs font-medium text-red-600 mt-1">🔴 Critical</div>
                      <div className="text-xs text-red-600 mt-1">Urgent action</div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Backend Implementation</h4>
                    <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-1">
                      <div className="text-xs text-blue-900 font-mono">unified_burnout_analyzer.py</div>
                      <div className="text-xs text-blue-700">Method: _calculate_burnout_score()</div>
                      <div className="text-xs text-blue-700">Lines: 2560-2598</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Frontend Display</h4>
                    <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-1">
                      <div className="text-xs text-blue-900 font-mono">TeamHealthOverview.tsx</div>
                      <div className="text-xs text-blue-700">Lines: 113-415</div>
                      <div className="text-xs text-blue-700">Calculation: Simple average</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* At Risk Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="w-5 h-5 text-purple-600" />
                  <span>At Risk Distribution</span>
                </CardTitle>
                <CardDescription>Number of team members in each risk category</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">What It Measures</h4>
                    <p className="text-sm text-gray-600">
                      Counts team members in each CBI risk category (Critical, High, Medium, Low)
                      based on their individual burnout scores.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Calculation</h4>
                    <div className="bg-gray-50 rounded p-3 font-mono text-xs text-gray-700 space-y-1">
                      <div>critical = count(cbi_score ≥ 75)</div>
                      <div>high = count(cbi_score ≥ 50)</div>
                      <div>medium = count(cbi_score ≥ 25)</div>
                      <div>low = count(cbi_score &lt; 25)</div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Data Sources</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-purple-900">Rootly/PagerDuty</span>
                        <Badge className="bg-red-500">90%</Badge>
                      </div>
                      <p className="text-xs text-purple-700">Primary source for risk categorization</p>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900">GitHub</span>
                        <Badge className="bg-yellow-500">10%</Badge>
                      </div>
                      <p className="text-xs text-gray-700">Supporting code activity metrics</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-purple-900">Slack</span>
                        <Badge className="bg-green-500">0%</Badge>
                      </div>
                      <p className="text-xs text-purple-700">Not used for risk distribution</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Incidents Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BarChart3 className="w-5 h-5 text-purple-600" />
                  <span>Total Incidents</span>
                </CardTitle>
                <CardDescription>Incident count and severity breakdown</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">What It Measures</h4>
                    <p className="text-sm text-gray-600">
                      Total number of incidents handled by the team during the analysis period,
                      broken down by severity level (SEV0-SEV4).
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Calculation</h4>
                    <div className="bg-gray-50 rounded p-3 font-mono text-xs text-gray-700">
                      total_incidents = metadata.total_incidents
                      <br />
                      severity_breakdown = metadata.severity_breakdown
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Data Source</h4>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-purple-900">Rootly/PagerDuty</span>
                      <Badge className="bg-red-500">100%</Badge>
                    </div>
                    <p className="text-xs text-purple-700">
                      Exclusively from incident management platform. No GitHub or Slack contribution.
                    </p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Severity Weights</h4>
                  <div className="grid grid-cols-5 gap-2">
                    <div className="bg-purple-50 border border-purple-200 rounded p-2 text-center">
                      <div className="text-xs font-semibold text-purple-700">SEV0</div>
                      <div className="text-lg font-bold text-purple-600">15.0x</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded p-2 text-center">
                      <div className="text-xs font-semibold text-red-700">SEV1</div>
                      <div className="text-lg font-bold text-red-600">12.0x</div>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded p-2 text-center">
                      <div className="text-xs font-semibold text-orange-700">SEV2</div>
                      <div className="text-lg font-bold text-orange-600">6.0x</div>
                    </div>
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-center">
                      <div className="text-xs font-semibold text-yellow-700">SEV3</div>
                      <div className="text-lg font-bold text-yellow-600">3.0x</div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded p-2 text-center">
                      <div className="text-xs font-semibold text-green-700">SEV4</div>
                      <div className="text-lg font-bold text-green-600">1.5x</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Weight Configuration */}
          <TabsContent value="weights" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>CBI Dimension Weights</CardTitle>
                <CardDescription>
                  Adjust the weight of each Copenhagen Burnout Inventory dimension (must sum to 100%)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Personal Burnout */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span className="font-semibold text-gray-900">Personal Burnout</span>
                      <Info className="w-4 h-4 text-gray-400 cursor-help" />
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl font-bold text-blue-600">{cbiWeights.personal}%</span>
                      {cbiWeights.personal === 50 && (
                        <Badge variant="outline" className="text-xs">Default</Badge>
                      )}
                    </div>
                  </div>
                  <Slider
                    value={[cbiWeights.personal]}
                    onValueChange={(value) => setCbiWeights({ ...cbiWeights, personal: value[0] })}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-600">
                    Physical and psychological fatigue, exhaustion from work demands
                  </p>
                </div>

                <Separator />

                {/* Work-Related Burnout */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                      <span className="font-semibold text-gray-900">Work-Related Burnout</span>
                      <Info className="w-4 h-4 text-gray-400 cursor-help" />
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl font-bold text-orange-600">{cbiWeights.work}%</span>
                      {cbiWeights.work === 50 && (
                        <Badge variant="outline" className="text-xs">Default</Badge>
                      )}
                    </div>
                  </div>
                  <Slider
                    value={[cbiWeights.work]}
                    onValueChange={(value) => setCbiWeights({ ...cbiWeights, work: value[0] })}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-600">
                    Work-specific exhaustion, cynicism, and frustration with job demands
                  </p>
                </div>

                <Separator />

                {/* Total */}
                <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                  <span className="font-semibold text-gray-900">Total</span>
                  <div className="flex items-center space-x-3">
                    <span className={`text-2xl font-bold ${weightsValid ? 'text-green-600' : 'text-red-600'}`}>
                      {weightsSum}%
                    </span>
                    {weightsValid ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Personal Burnout Factors */}
            <Card>
              <CardHeader>
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleSection('personalBurnout')}
                >
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      {expandedSections.personalBurnout ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                      <span>Personal Burnout Factors (11 factors)</span>
                    </CardTitle>
                    <CardDescription>
                      Detailed weights for personal burnout dimension components
                    </CardDescription>
                  </div>
                  <Badge>{cbiWeights.personal}% of CBI Score</Badge>
                </div>
              </CardHeader>
              {expandedSections.personalBurnout && (
                <CardContent className="space-y-4">
                  <Alert className="bg-blue-50 border-blue-200">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800 text-sm">
                      These factors combine to create the Personal Burnout dimension. Weights must sum to 100%.
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Work Hours Trend</span>
                        <Badge>70%</Badge>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: '70%' }}></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Weekend Work</span>
                        <Badge>10%</Badge>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: '10%' }}></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">After-Hours Activity</span>
                        <Badge>8%</Badge>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: '8%' }}></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Vacation Usage</span>
                        <Badge>4%</Badge>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: '4%' }}></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Sleep Quality Proxy</span>
                        <Badge>8%</Badge>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: '8%' }}></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Work-Related Burnout Factors */}
            <Card>
              <CardHeader>
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleSection('workBurnout')}
                >
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      {expandedSections.workBurnout ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                      <span>Work-Related Burnout Factors (6 factors)</span>
                    </CardTitle>
                    <CardDescription>
                      Detailed weights for work-related burnout dimension components
                    </CardDescription>
                  </div>
                  <Badge>{cbiWeights.work}% of CBI Score</Badge>
                </div>
              </CardHeader>
              {expandedSections.workBurnout && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Sprint Completion</span>
                        <Badge>20%</Badge>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-orange-600 h-2 rounded-full" style={{ width: '20%' }}></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Code Review Speed</span>
                        <Badge>15%</Badge>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-orange-600 h-2 rounded-full" style={{ width: '15%' }}></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">PR Frequency</span>
                        <Badge>15%</Badge>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-orange-600 h-2 rounded-full" style={{ width: '15%' }}></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Deployment Frequency</span>
                        <Badge>10%</Badge>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-orange-600 h-2 rounded-full" style={{ width: '10%' }}></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Meeting Load</span>
                        <Badge>20%</Badge>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-orange-600 h-2 rounded-full" style={{ width: '20%' }}></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">On-Call Burden</span>
                        <Badge>20%</Badge>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-orange-600 h-2 rounded-full" style={{ width: '20%' }}></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </TabsContent>

          {/* Tab 3: Integration Impact Matrix */}
          <TabsContent value="integrations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Integration Impact Matrix</CardTitle>
                <CardDescription>
                  Configure how much each integration (Rootly, GitHub, Slack) contributes to each metric
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Metric</th>
                        <th className="text-center py-3 px-4 font-semibold text-purple-700">Rootly/PagerDuty</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-900">GitHub</th>
                        <th className="text-center py-3 px-4 font-semibold text-purple-700">Slack</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-700">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Team Health */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium">Team Health (CBI)</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.teamHealth.rootly)}>
                              {integrationImpacts.teamHealth.rootly}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.teamHealth.rootly)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.teamHealth.github)}>
                              {integrationImpacts.teamHealth.github}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.teamHealth.github)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.teamHealth.slack)}>
                              {integrationImpacts.teamHealth.slack}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.teamHealth.slack)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-semibold">
                          {integrationImpacts.teamHealth.rootly + integrationImpacts.teamHealth.github + integrationImpacts.teamHealth.slack}%
                        </td>
                      </tr>

                      {/* At Risk */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium">At Risk Count</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.atRisk.rootly)}>
                              {integrationImpacts.atRisk.rootly}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.atRisk.rootly)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.atRisk.github)}>
                              {integrationImpacts.atRisk.github}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.atRisk.github)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.atRisk.slack)}>
                              {integrationImpacts.atRisk.slack}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.atRisk.slack)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-semibold">
                          {integrationImpacts.atRisk.rootly + integrationImpacts.atRisk.github + integrationImpacts.atRisk.slack}%
                        </td>
                      </tr>

                      {/* Separator for Risk Factors */}
                      <tr className="bg-gray-100">
                        <td colSpan={5} className="py-2 px-4 font-semibold text-gray-700 text-sm">
                          Risk Factors (Radar Chart)
                        </td>
                      </tr>

                      {/* Workload */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium pl-8">└─ Workload Intensity</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.workload.rootly)}>
                              {integrationImpacts.workload.rootly}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.workload.rootly)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.workload.github)}>
                              {integrationImpacts.workload.github}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.workload.github)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.workload.slack)}>
                              {integrationImpacts.workload.slack}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.workload.slack)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-semibold">
                          {integrationImpacts.workload.rootly + integrationImpacts.workload.github + integrationImpacts.workload.slack}%
                        </td>
                      </tr>

                      {/* After Hours */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium pl-8">└─ After Hours Activity</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.afterHours.rootly)}>
                              {integrationImpacts.afterHours.rootly}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.afterHours.rootly)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.afterHours.github)}>
                              {integrationImpacts.afterHours.github}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.afterHours.github)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.afterHours.slack)}>
                              {integrationImpacts.afterHours.slack}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.afterHours.slack)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-semibold">
                          {integrationImpacts.afterHours.rootly + integrationImpacts.afterHours.github + integrationImpacts.afterHours.slack}%
                        </td>
                      </tr>

                      {/* Weekend Work */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium pl-8">└─ Weekend Work</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.weekendWork.rootly)}>
                              {integrationImpacts.weekendWork.rootly}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.weekendWork.rootly)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.weekendWork.github)}>
                              {integrationImpacts.weekendWork.github}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.weekendWork.github)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.weekendWork.slack)}>
                              {integrationImpacts.weekendWork.slack}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.weekendWork.slack)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-semibold">
                          {integrationImpacts.weekendWork.rootly + integrationImpacts.weekendWork.github + integrationImpacts.weekendWork.slack}%
                        </td>
                      </tr>

                      {/* Response Time */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium pl-8">└─ Response Time</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.responseTime.rootly)}>
                              {integrationImpacts.responseTime.rootly}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.responseTime.rootly)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.responseTime.github)}>
                              {integrationImpacts.responseTime.github}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.responseTime.github)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.responseTime.slack)}>
                              {integrationImpacts.responseTime.slack}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.responseTime.slack)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-semibold">
                          {integrationImpacts.responseTime.rootly + integrationImpacts.responseTime.github + integrationImpacts.responseTime.slack}%
                        </td>
                      </tr>

                      {/* Incident Load */}
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium pl-8">└─ Incident Load</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.incidentLoad.rootly)}>
                              {integrationImpacts.incidentLoad.rootly}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.incidentLoad.rootly)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.incidentLoad.github)}>
                              {integrationImpacts.incidentLoad.github}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.incidentLoad.github)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center space-y-2">
                            <Badge className={getImpactColor(integrationImpacts.incidentLoad.slack)}>
                              {integrationImpacts.incidentLoad.slack}%
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {getImpactLabel(integrationImpacts.incidentLoad.slack)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-semibold">
                          {integrationImpacts.incidentLoad.rootly + integrationImpacts.incidentLoad.github + integrationImpacts.incidentLoad.slack}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 flex items-center space-x-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <p className="text-sm text-blue-800">
                    <strong>Legend:</strong> 🔴 Primary (&gt;50%) · 🟠 Significant (20-50%) · 🟡 Minor (10-20%) · 🟢 None (0-10%)
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 4: Presets */}
          <TabsContent value="presets" className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              {/* Default Preset */}
              <Card className={activePreset === "default" ? "border-2 border-purple-500" : ""}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>🎯 Default Configuration</span>
                    {activePreset === "default" && (
                      <Badge className="bg-purple-600">Active</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Scientifically Validated (Recommended)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">CBI Dimensions</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-blue-50 rounded p-2 text-center">
                        <div className="text-lg font-bold text-blue-600">50%</div>
                        <div className="text-xs text-blue-600">Personal</div>
                      </div>
                      <div className="bg-orange-50 rounded p-2 text-center">
                        <div className="text-lg font-bold text-orange-600">50%</div>
                        <div className="text-xs text-orange-600">Work-Related</div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Integration Balance</div>
                    <div className="space-y-1 text-xs">
                      <div>• Incident Data: Primary (60-100%)</div>
                      <div>• GitHub Activity: Supporting (20-40%)</div>
                      <div>• Slack Communication: Supporting (20-40%)</div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Best For</div>
                    <p className="text-sm text-gray-600">
                      Balanced burnout assessment for teams with mixed on-call and development work
                    </p>
                  </div>

                  {activePreset !== "default" && (
                    <Button
                      className="w-full"
                      onClick={() => applyPreset("default")}
                    >
                      Apply Preset
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Incident-Focused Preset */}
              <Card className={activePreset === "incident-focused" ? "border-2 border-purple-500" : ""}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>🚨 Incident-Focused</span>
                    {activePreset === "incident-focused" && (
                      <Badge className="bg-purple-600">Active</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Maximum Incident Weight</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">CBI Dimensions</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-blue-50 rounded p-2 text-center">
                        <div className="text-lg font-bold text-blue-600">40%</div>
                        <div className="text-xs text-blue-600">Personal</div>
                      </div>
                      <div className="bg-orange-50 rounded p-2 text-center">
                        <div className="text-lg font-bold text-orange-600">60%</div>
                        <div className="text-xs text-orange-600">Work-Related</div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Integration Balance</div>
                    <div className="space-y-1 text-xs">
                      <div>• Incident Data: Dominant (80-100%)</div>
                      <div>• GitHub Activity: Minimal (0-15%)</div>
                      <div>• Slack Communication: Minimal (0-10%)</div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Best For</div>
                    <p className="text-sm text-gray-600">
                      On-call heavy teams, SRE roles, incident response teams
                    </p>
                  </div>

                  {activePreset !== "incident-focused" && (
                    <Button
                      className="w-full"
                      onClick={() => applyPreset("incident-focused")}
                    >
                      Apply Preset
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Development-Focused Preset */}
              <Card className={activePreset === "development" ? "border-2 border-purple-500" : ""}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>💻 Development-Focused</span>
                    {activePreset === "development" && (
                      <Badge className="bg-purple-600">Active</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Emphasize Code Activity</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">CBI Dimensions</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-blue-50 rounded p-2 text-center">
                        <div className="text-lg font-bold text-blue-600">60%</div>
                        <div className="text-xs text-blue-600">Personal</div>
                      </div>
                      <div className="bg-orange-50 rounded p-2 text-center">
                        <div className="text-lg font-bold text-orange-600">40%</div>
                        <div className="text-xs text-orange-600">Work-Related</div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Integration Balance</div>
                    <div className="space-y-1 text-xs">
                      <div>• Incident Data: Moderate (40-70%)</div>
                      <div>• GitHub Activity: High (35-50%)</div>
                      <div>• Slack Communication: Moderate (10-20%)</div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Best For</div>
                    <p className="text-sm text-gray-600">
                      Engineering teams, sprint-based development, high-velocity teams
                    </p>
                  </div>

                  {activePreset !== "development" && (
                    <Button
                      className="w-full"
                      onClick={() => applyPreset("development")}
                    >
                      Apply Preset
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Communication-Heavy Preset */}
              <Card className={activePreset === "communication" ? "border-2 border-purple-500" : ""}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>🗣️ Communication-Heavy</span>
                    {activePreset === "communication" && (
                      <Badge className="bg-purple-600">Active</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Emphasize Collaboration Metrics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">CBI Dimensions</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-blue-50 rounded p-2 text-center">
                        <div className="text-lg font-bold text-blue-600">55%</div>
                        <div className="text-xs text-blue-600">Personal</div>
                      </div>
                      <div className="bg-orange-50 rounded p-2 text-center">
                        <div className="text-lg font-bold text-orange-600">45%</div>
                        <div className="text-xs text-orange-600">Work-Related</div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Integration Balance</div>
                    <div className="space-y-1 text-xs">
                      <div>• Incident Data: Moderate (35-60%)</div>
                      <div>• GitHub Activity: Low (15-25%)</div>
                      <div>• Slack Communication: High (25-40%)</div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Best For</div>
                    <p className="text-sm text-gray-600">
                      Support teams, customer success, managers, collaboration-heavy roles
                    </p>
                  </div>

                  {activePreset !== "communication" && (
                    <Button
                      className="w-full"
                      onClick={() => applyPreset("communication")}
                    >
                      Apply Preset
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab 5: Calculation Details */}
          <TabsContent value="calculations" className="space-y-6">
            <Card>
              <CardHeader>
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleSection('riskFactors')}
                >
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      {expandedSections.riskFactors ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                      <span>Risk Factors Calculation Details</span>
                    </CardTitle>
                    <CardDescription>
                      Mathematical formulas for each burnout risk factor (5 factors)
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              {expandedSections.riskFactors && (
                <CardContent className="space-y-6">
                  {/* Workload Intensity */}
                  <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900">1. Workload Intensity</h4>
                      <Badge>Scale: 0-10</Badge>
                    </div>
                    <div className="bg-gray-50 rounded p-3 font-mono text-xs space-y-1">
                      <div>if incidents_per_week ≤ 2:</div>
                      <div className="pl-4">workload = incidents_per_week × 1.5</div>
                      <div>elif incidents_per_week ≤ 5:</div>
                      <div className="pl-4">workload = 3 + ((incidents_per_week - 2) / 3) × 4</div>
                      <div>elif incidents_per_week ≤ 8:</div>
                      <div className="pl-4">workload = 7 + ((incidents_per_week - 5) / 3) × 3</div>
                      <div>else:</div>
                      <div className="pl-4">workload = 10</div>
                    </div>
                    <div className="text-xs text-gray-600">
                      <strong>Backend:</strong> unified_burnout_analyzer.py:2381-2390
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="outline" className="flex items-center space-x-1">
                        <Code className="w-3 h-3" />
                        <span>View Code</span>
                      </Button>
                      <Button size="sm" variant="outline" className="flex items-center space-x-1">
                        <Copy className="w-3 h-3" />
                        <span>Copy Formula</span>
                      </Button>
                    </div>
                  </div>

                  {/* After Hours */}
                  <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900">2. After Hours Activity</h4>
                      <Badge>Scale: 0-10</Badge>
                    </div>
                    <div className="bg-gray-50 rounded p-3 font-mono text-xs">
                      after_hours = min(10, after_hours_percentage × 20)
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div><strong>Where:</strong> after_hours_percentage = incidents after-hours / total incidents</div>
                      <div><strong>After-hours:</strong> Before 9 AM or after 6 PM (timezone-aware)</div>
                      <div><strong>Backend:</strong> unified_burnout_analyzer.py:2392-2395</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="outline" className="flex items-center space-x-1">
                        <Code className="w-3 h-3" />
                        <span>View Code</span>
                      </Button>
                      <Button size="sm" variant="outline" className="flex items-center space-x-1">
                        <Copy className="w-3 h-3" />
                        <span>Copy Formula</span>
                      </Button>
                    </div>
                  </div>

                  {/* Weekend Work */}
                  <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900">3. Weekend Work</h4>
                      <Badge>Scale: 0-10</Badge>
                    </div>
                    <div className="bg-gray-50 rounded p-3 font-mono text-xs">
                      weekend_work = min(10, weekend_percentage × 25)
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div><strong>Where:</strong> weekend_percentage = weekend incidents / total incidents</div>
                      <div><strong>Weekend:</strong> Saturday or Sunday (timezone-aware)</div>
                      <div><strong>Backend:</strong> unified_burnout_analyzer.py:2397-2400</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="outline" className="flex items-center space-x-1">
                        <Code className="w-3 h-3" />
                        <span>View Code</span>
                      </Button>
                      <Button size="sm" variant="outline" className="flex items-center space-x-1">
                        <Copy className="w-3 h-3" />
                        <span>Copy Formula</span>
                      </Button>
                    </div>
                  </div>

                  {/* Response Time */}
                  <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900">4. Response Time</h4>
                      <Badge>Scale: 0-10</Badge>
                    </div>
                    <div className="bg-gray-50 rounded p-3 font-mono text-xs">
                      response_time = min(10, avg_response_time_minutes / 6)
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div><strong>Where:</strong> avg_response_time = average time from created to acknowledged</div>
                      <div><strong>Example:</strong> 30 min avg → 5.0 score, 60 min avg → 10.0 score</div>
                      <div><strong>Backend:</strong> unified_burnout_analyzer.py:2405-2408</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="outline" className="flex items-center space-x-1">
                        <Code className="w-3 h-3" />
                        <span>View Code</span>
                      </Button>
                      <Button size="sm" variant="outline" className="flex items-center space-x-1">
                        <Copy className="w-3 h-3" />
                        <span>Copy Formula</span>
                      </Button>
                    </div>
                  </div>

                  {/* Incident Load */}
                  <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900">5. Incident Load</h4>
                      <Badge>Scale: 0-10</Badge>
                    </div>
                    <div className="bg-gray-50 rounded p-3 font-mono text-xs space-y-1">
                      <div>if severity_weighted_per_week &gt; 0:</div>
                      <div className="pl-4">incident_load = min(10, severity_weighted_per_week × 0.6)</div>
                      <div>else:</div>
                      <div className="pl-4">incident_load = min(10, incidents_per_week × 1.8)</div>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div><strong>Severity Weights:</strong> SEV0=15.0, SEV1=12.0, SEV2=6.0, SEV3=3.0, SEV4=1.5</div>
                      <div><strong>Backend:</strong> unified_burnout_analyzer.py:2410-2418</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="outline" className="flex items-center space-x-1">
                        <Code className="w-3 h-3" />
                        <span>View Code</span>
                      </Button>
                      <Button size="sm" variant="outline" className="flex items-center space-x-1">
                        <Copy className="w-3 h-3" />
                        <span>Copy Formula</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* CBI Composite Score Calculation */}
            <Card>
              <CardHeader>
                <CardTitle>Copenhagen Burnout Inventory (CBI) Composite Score</CardTitle>
                <CardDescription>Final burnout score calculation from two dimensions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm">
                  <div className="mb-2 text-gray-700">composite_cbi_score =</div>
                  <div className="pl-4 space-y-1">
                    <div>(personal_burnout × {(cbiWeights.personal / 100).toFixed(2)}) +</div>
                    <div>(work_related_burnout × {(cbiWeights.work / 100).toFixed(2)})</div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Scale & Range</h4>
                  <p className="text-sm text-gray-600">
                    Final score: 0-100 (higher = more burnout risk)
                  </p>
                </div>

                <Separator />

                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Backend Implementation</h4>
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-1">
                    <div className="text-xs text-blue-900 font-mono">File: unified_burnout_analyzer.py</div>
                    <div className="text-xs text-blue-700">Method: _calculate_burnout_score()</div>
                    <div className="text-xs text-blue-700">Lines: 2560-2598</div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button variant="outline" className="flex items-center space-x-1">
                    <Code className="w-4 h-4" />
                    <span>View Full Implementation</span>
                  </Button>
                  <Button variant="outline" className="flex items-center space-x-1">
                    <Download className="w-4 h-4" />
                    <span>Export Calculation Logic</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
