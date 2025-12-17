import React, { memo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  ChevronDown,
  ChevronUp,
  Building,
  Users,
  Zap,
  Key,
  Calendar,
  Clock,
  Loader2,
  Edit3,
  Check,
  RefreshCw,
  Trash2,
  Shield,
  AlertCircle,
  CheckCircle,
} from "lucide-react"
import type { Integration } from "../types"

interface IntegrationCardItemProps {
  integration: Integration
  isExpanded: boolean
  savingIntegrationId: number | null
  editingIntegration: number | null
  editingName: string
  refreshingPermissions: number | null
  onToggleExpand: (id: number) => void
  onEdit: (id: number, name: string) => void
  onSaveName: (integration: Integration, name: string) => void
  onCancelEdit: () => void
  onDelete: (integration: Integration) => void
  onRefreshPermissions: (id: number) => void
  setEditingName: (name: string) => void
}

/**
 * 🚀 PHASE 3 OPTIMIZATION: Memoized integration card component
 * Prevents unnecessary re-renders when other integrations update
 */
export const IntegrationCardItem = memo(function IntegrationCardItem({
  integration,
  isExpanded,
  savingIntegrationId,
  editingIntegration,
  editingName,
  refreshingPermissions,
  onToggleExpand,
  onEdit,
  onSaveName,
  onCancelEdit,
  onDelete,
  onRefreshPermissions,
  setEditingName,
}: IntegrationCardItemProps) {
  const isSaving = savingIntegrationId === integration.id
  const isRefreshing = refreshingPermissions === integration.id

  return (
    <div className={`
      rounded-lg border relative transition-all
      ${integration.platform === 'rootly' ? 'border-green-200 bg-green-50' : 'border-green-200 bg-green-50'}
      ${isSaving ? 'opacity-75' : ''}
      ${isExpanded ? 'p-4' : 'p-3'}
    `}>
      {/* Saving overlay */}
      {isSaving && (
        <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center rounded-lg z-10">
          <div className="flex items-center space-x-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Saving...</span>
          </div>
        </div>
      )}

      {/* Collapsed Header - Click anywhere to expand */}
      <div
        className="flex items-center cursor-pointer hover:bg-white/30 -m-3 p-3 rounded-lg transition-colors"
        onClick={() => !editingIntegration && onToggleExpand(integration.id)}
      >
        {/* Expand/Collapse Icon */}
        <div className="flex-shrink-0 w-6">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>

        {/* Name - flexible width */}
        {editingIntegration === integration.id ? (
          <div className="flex items-center space-x-2 flex-1 min-w-0 mr-3" onClick={(e) => e.stopPropagation()}>
            <Input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              className="h-8 w-48"
              disabled={isSaving}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isSaving) {
                  onSaveName(integration, editingName)
                  onCancelEdit()
                } else if (e.key === 'Escape') {
                  onCancelEdit()
                }
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={isSaving}
              onClick={() => {
                onSaveName(integration, editingName)
                onCancelEdit()
              }}
            >
              <Check className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <h3 className="font-semibold text-base truncate flex-1 min-w-0 mr-3">{integration.name}</h3>
        )}

        {/* Stats in collapsed view - fixed widths for alignment */}
        {!isExpanded && (
          <>
            <div className="flex items-center gap-1 text-sm text-gray-600 w-16 flex-shrink-0">
              <Users className="w-3 h-3" />
              <span>{integration.total_users}</span>
            </div>
            <div className="text-sm text-gray-500 w-28 flex-shrink-0">•••{integration.token_suffix}</div>
          </>
        )}

        {/* Badge - fixed width for alignment */}
        <Badge variant={integration.platform === 'rootly' ? 'default' : 'secondary'}
               className={`flex-shrink-0 w-24 justify-center ${integration.platform === 'rootly' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
          {integration.platform}
        </Badge>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start space-x-2">
              <Building className="w-4 h-4 mt-0.5 text-gray-400" />
              <div className="flex-1">
                <div className="font-bold text-gray-900 flex items-center gap-2">
                  Organization
                  {editingIntegration !== integration.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isSaving}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit(integration.id, integration.name)
                      }}
                      className="h-5 w-5 p-0"
                    >
                      <Edit3 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                <div className="text-gray-600">{integration.organization_name}</div>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <Users className="w-4 h-4 mt-0.5 text-gray-400" />
              <div>
                <div className="font-bold text-gray-900">Users</div>
                <div className="text-gray-600">{integration.total_users}</div>
              </div>
            </div>
            {integration.platform === 'pagerduty' && integration.total_services !== undefined && (
              <div className="flex items-start space-x-2">
                <Zap className="w-4 h-4 mt-0.5 text-gray-400" />
                <div>
                  <div className="font-bold text-gray-900">Services</div>
                  <div className="text-gray-600">{integration.total_services}</div>
                </div>
              </div>
            )}
            <div className="flex items-start space-x-2">
              <Key className="w-4 h-4 mt-0.5 text-gray-400" />
              <div>
                <div className="font-bold text-gray-900">Token</div>
                <div className="text-gray-600">•••{integration.token_suffix}</div>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <Calendar className="w-4 h-4 mt-0.5 text-gray-400" />
              <div>
                <div className="font-bold text-gray-900">Added</div>
                <div className="text-gray-600">{new Date(integration.created_at).toLocaleDateString()}</div>
              </div>
            </div>
            {integration.last_used_at && (
              <div className="flex items-start space-x-2">
                <Clock className="w-4 h-4 mt-0.5 text-gray-400" />
                <div>
                  <div className="font-bold text-gray-900">Last used</div>
                  <div className="text-gray-600">{new Date(integration.last_used_at).toLocaleDateString()}</div>
                </div>
              </div>
            )}
          </div>

          {/* Permissions Section */}
          {integration.permissions && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-gray-500" />
                  API Permissions
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRefreshPermissions(integration.id)
                  }}
                  disabled={isRefreshing}
                  className="h-7 text-xs"
                >
                  {isRefreshing ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Refresh
                    </>
                  )}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(integration.permissions).map(([key, value]: [string, any]) => {
                  const hasAccess = value.access === true
                  const hasError = value.error
                  const isChecking = value.checking === true

                  return (
                    <div key={key} className="flex items-start space-x-2 text-sm">
                      {isChecking ? (
                        <Loader2 className="w-4 h-4 mt-0.5 text-blue-500 animate-spin" />
                      ) : hasAccess ? (
                        <CheckCircle className="w-4 h-4 mt-0.5 text-green-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 mt-0.5 text-red-500" />
                      )}
                      <div className="flex-1">
                        <div className={`font-medium ${hasAccess ? 'text-green-700' : hasError ? 'text-red-700' : 'text-gray-600'}`}>
                          {key.charAt(0).toUpperCase() + key.slice(1)}
                        </div>
                        {hasError && (
                          <div className="text-xs text-red-600 mt-1">{value.error}</div>
                        )}
                        {isChecking && (
                          <div className="text-xs text-blue-600 mt-1">Checking permissions...</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-2 pt-3 border-t">
            <Button
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(integration)
              }}
              disabled={isSaving}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  )
})
