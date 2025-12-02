"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

// Hooks
import { usePerformanceMonitor } from "@/hooks/use-performance-monitor"
import { useIntegrationsState } from "@/hooks/use-integrations-state"

// Services
import { IntegrationsAPIService } from "./api-service"

// Components
import { IntegrationsHeader } from "./integrations-header"
import { IntegrationsCards } from "./integrations-cards"
import { EnhancementCards } from "./enhancement-cards"
import { MappingDrawer } from "@/components/mapping-drawer"

function IntegrationsLayoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { startTiming, endTiming, trackCacheHit } = usePerformanceMonitor()
  const state = useIntegrationsState()
  
  // Start performance monitoring
  useEffect(() => {
    startTiming('page_load')
  }, [startTiming])

  // Load user info on mount
  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        const userInfo = await IntegrationsAPIService.loadUserInfo()
        state.setUserInfo(userInfo)
      } catch (error) {
        console.error('Failed to load user info:', error)
      }
    }
    
    loadUserInfo()
  }, [state.setUserInfo])

  // Handle URL parameters
  useEffect(() => {
    const platform = searchParams.get('add')
    const backUrl = searchParams.get('back')
    
    if (platform === 'rootly' || platform === 'pagerduty') {
      state.setUI({ activeTab: platform })
    }
    
    if (backUrl) {
      state.setUI({ backUrl: decodeURIComponent(backUrl) })
    }
  }, [searchParams, state.setUI])

  // Optimized data loading with performance tracking
  const loadIntegrationsOptimized = async (forceRefresh = false) => {
    
    
    try {
      startTiming('cache_load')
      
      // Step 1: Check cache first
      if (!forceRefresh && IntegrationsAPIService.loadFromCacheSync()) {
        
        trackCacheHit()
        endTiming('cache_load')
        
        // Load cached data into state
        const cachedIntegrations = JSON.parse(localStorage.getItem('all_integrations') || '[]')
        const cachedGithub = JSON.parse(localStorage.getItem('github_integration') || 'null')
        const cachedSlack = JSON.parse(localStorage.getItem('slack_integration') || 'null')
        
        state.setIntegrations(cachedIntegrations)
        state.setGithubIntegration(cachedGithub?.connected ? cachedGithub.integration : null)
        state.setSlackIntegration(cachedSlack?.integration)
        state.setLoading({ rootly: false, pagerDuty: false, github: false, slack: false })
        
        // Background refresh if cache is stale
        if (IntegrationsAPIService.isCacheStale()) {
          
          state.setStatus({ refreshingInBackground: true })
          setTimeout(async () => {
            try {
              await IntegrationsAPIService.backgroundRefresh()
              // Reload data from updated cache
              await loadIntegrationsOptimized(true)
            } catch (error) {
              console.error('Background refresh failed:', error)
            } finally {
              state.setStatus({ refreshingInBackground: false })
            }
          }, 100)
        }
        return
      }
      
      endTiming('cache_load')
      
      // Step 2: Load from API
      startTiming('api_call')
      
      
      const data = await IntegrationsAPIService.loadAllIntegrations()
      
      state.setIntegrations(data.integrations)
      state.setGithubIntegration(data.githubIntegration)
      state.setSlackIntegration(data.slackIntegration)
      state.setLoading({ rootly: false, pagerDuty: false, github: false, slack: false })
      
      endTiming('api_call')
      
      
    } catch (error) {
      console.error('❌ Failed to load integrations:', error)
      toast.error('Failed to load integrations')
      state.setLoading({ rootly: false, pagerDuty: false, github: false, slack: false })
    }
  }

  // Load data on mount
  useEffect(() => {
    loadIntegrationsOptimized()
  }, [])

  // Performance monitoring - end page load timing
  useEffect(() => {
    if (!state.loading.rootly && !state.loading.pagerDuty && 
        !state.loading.github && !state.loading.slack) {
      endTiming('page_load')
    }
  }, [state.loading, endTiming])

  // Event handlers
  const handleRefresh = async () => {
    state.setLoading({ rootly: true, pagerDuty: true, github: true, slack: true })
    await loadIntegrationsOptimized(true)
  }


  const handleOpenMappingDrawer = (platform: 'github' | 'slack') => {
    state.setDialogs({ 
      mappingDrawerOpen: true, 
      mappingDrawerPlatform: platform 
    })
  }

  const handleCloseMappingDrawer = () => {
    state.setDialogs({ mappingDrawerOpen: false })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <IntegrationsHeader
        userInfo={state.userInfo}
        isRefreshing={state.status.refreshingInBackground}
        onRefresh={handleRefresh}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Core Integrations */}
          <IntegrationsCards
            integrations={state.integrations}
            loading={state.loading}
            activeTab={state.ui.activeTab}
            onTabChange={(tab) => state.setUI({ activeTab: tab })}
            onEdit={(id, name) => {
              state.setUI({ editingIntegration: id, editingName: name })
            }}
            onDelete={(_integration) => {
              // Handle delete logic
            }}
            onAdd={(platform) => {
              state.setUI({ addingPlatform: platform })
            }}
          />

          {/* Enhancement Cards */}
          <EnhancementCards
            githubIntegration={state.githubIntegration}
            slackIntegration={state.slackIntegration}
            loading={{ github: state.loading.github, slack: state.loading.slack }}
            onOpenMappings={handleOpenMappingDrawer}
            onConnect={(_platform) => {
              // Handle connection logic
            }}
            onDisconnect={(_platform) => {
              // Handle disconnection logic
            }}
          />
        </div>
      </div>

      {/* Mapping Drawer */}
      <MappingDrawer
        isOpen={state.dialogs.mappingDrawerOpen}
        onClose={handleCloseMappingDrawer}
        platform={state.dialogs.mappingDrawerPlatform}
      />
    </div>
  )
}

export default function IntegrationsLayout() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading integrations...</p>
        </div>
      </div>
    }>
      <IntegrationsLayoutContent />
    </Suspense>
  )
}