"use client"

import { RefreshCw, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { NotificationDrawer } from "@/components/notifications"

interface IntegrationsHeaderProps {
  userInfo: {name: string, email: string, avatar?: string} | null
  isRefreshing: boolean
  onRefresh: () => void
}

export function IntegrationsHeader({ 
  userInfo, 
  isRefreshing, 
  onRefresh 
}: IntegrationsHeaderProps) {
  return (
    <div className="bg-white border-b border-neutral-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side - Title */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-lg">
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-neutral-900">
                Manage Integrations
              </h1>
              <p className="text-sm text-neutral-500">
                Connect your tools to track team burnout
              </p>
            </div>
          </div>

          {/* Right side - User info and refresh */}
          <div className="flex items-center space-x-4">
            {/* Refresh indicator */}
            {isRefreshing && (
              <div className="flex items-center space-x-2 text-blue-600">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm">Refreshing...</span>
              </div>
            )}

            {/* Refresh button */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>

            {/* Notifications */}
            <NotificationDrawer />

            {/* User avatar */}
            {userInfo && (
              <div className="flex items-center space-x-3">
                <Avatar className="w-8 h-8">
                  <AvatarImage
                    src={userInfo.avatar}
                    alt={userInfo.name}
                  />
                  <AvatarFallback>
                    {userInfo.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-neutral-900">{userInfo.name}</p>
                  <p className="text-xs text-neutral-500">{userInfo.email}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}