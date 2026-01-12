"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, Settings, Trash2, TestTube } from "lucide-react"
import { Integration } from "./api-service"
import { getPlatformIcon, getPlatformColor, getIntegrationStatusBadge } from "./validation"

interface IntegrationsCardsProps {
  integrations: Integration[]
  loading: {
    rootly: boolean
    pagerDuty: boolean
    github: boolean
    slack: boolean
  }
  activeTab: "rootly" | "pagerduty" | null
  onTabChange: (tab: "rootly" | "pagerduty" | null) => void
  onEdit: (id: number, name: string) => void
  onDelete: (integration: Integration) => void
  onAdd: (platform: "rootly" | "pagerduty") => void
}

export function IntegrationsCards({
  integrations,
  loading,
  activeTab,
  onTabChange,
  onEdit,
  onDelete,
  onAdd
}: IntegrationsCardsProps) {
  const rootlyIntegrations = integrations.filter(i => i.platform === 'rootly')
  const pagerdutyIntegrations = integrations.filter(i => i.platform === 'pagerduty')

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const IntegrationCard = ({ integration }: { integration: Integration }) => {
    const statusBadge = getIntegrationStatusBadge(integration.status)
    
    return (
      <Card className={`${getPlatformColor(integration.platform)} hover:shadow-md transition-shadow`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-lg">{getPlatformIcon(integration.platform)}</span>
              <div>
                <CardTitle className="text-lg">{integration.name}</CardTitle>
                <p className="text-sm text-neutral-500 capitalize">{integration.platform}</p>
              </div>
            </div>
            <Badge variant="secondary" className={statusBadge.color}>
              {statusBadge.text}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-4">
            <div className="text-sm text-neutral-700">
              <div className="flex justify-between">
                <span>Created:</span>
                <span>{formatDate(integration.created_at)}</span>
              </div>
              {integration.last_sync && (
                <div className="flex justify-between mt-1">
                  <span>Last sync:</span>
                  <span>{formatDate(integration.last_sync)}</span>
                </div>
              )}
            </div>
            
            {integration.error_message && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{integration.error_message}</p>
              </div>
            )}
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(integration.id, integration.name)}
                className="flex items-center space-x-1"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="flex items-center space-x-1"
              >
                <TestTube className="w-4 h-4" />
                <span>Test</span>
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(integration)}
                className="flex items-center space-x-1 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const LoadingSkeleton = () => (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-neutral-300 rounded"></div>
          <div>
            <div className="w-32 h-5 bg-neutral-300 rounded mb-1"></div>
            <div className="w-20 h-4 bg-neutral-300 rounded"></div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="w-full h-4 bg-neutral-300 rounded"></div>
          <div className="w-3/4 h-4 bg-neutral-300 rounded"></div>
          <div className="flex space-x-2 mt-4">
            <div className="w-20 h-8 bg-neutral-300 rounded"></div>
            <div className="w-16 h-8 bg-neutral-300 rounded"></div>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const EmptyState = ({ platform }: { platform: string }) => (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <div className="text-4xl mb-4">{getPlatformIcon(platform)}</div>
        <h3 className="text-lg font-medium text-neutral-900 mb-2">
          No {platform} integrations
        </h3>
        <p className="text-neutral-500 text-center mb-6">
          Connect your {platform} account to start tracking incidents and team health
        </p>
        <Button
          onClick={() => onAdd(platform as "rootly" | "pagerduty")}
          className="flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add {platform} Integration</span>
        </Button>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-8">
      {/* Rootly Integrations */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 flex items-center space-x-2">
              <span>🔥</span>
              <span>Rootly Integrations</span>
            </h2>
            <p className="text-neutral-500">Incident management and response tracking</p>
          </div>
          {rootlyIntegrations.length > 0 && (
            <Button
              variant="outline"
              onClick={() => onAdd("rootly")}
              className="flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Rootly</span>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading.rootly ? (
            <>
              <LoadingSkeleton />
              <LoadingSkeleton />
            </>
          ) : rootlyIntegrations.length > 0 ? (
            rootlyIntegrations.map(integration => (
              <IntegrationCard key={integration.id} integration={integration} />
            ))
          ) : (
            <div className="md:col-span-2 lg:col-span-3">
              <EmptyState platform="rootly" />
            </div>
          )}
        </div>
      </div>

      {/* PagerDuty Integrations */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 flex items-center space-x-2">
              <span>📟</span>
              <span>PagerDuty Integrations</span>
            </h2>
            <p className="text-neutral-500">Incident response and alert management</p>
          </div>
          {pagerdutyIntegrations.length > 0 && (
            <Button
              variant="outline"
              onClick={() => onAdd("pagerduty")}
              className="flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add PagerDuty</span>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading.pagerDuty ? (
            <>
              <LoadingSkeleton />
              <LoadingSkeleton />
            </>
          ) : pagerdutyIntegrations.length > 0 ? (
            pagerdutyIntegrations.map(integration => (
              <IntegrationCard key={integration.id} integration={integration} />
            ))
          ) : (
            <div className="md:col-span-2 lg:col-span-3">
              <EmptyState platform="pagerduty" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}