import React from 'react'
import { X, Check, ExternalLink, Trash2, Building2, ClipboardList, Link, TrendingUp, Clock, Sparkles, Calendar, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Notification, NotificationActions } from '@/types/notifications'

interface NotificationItemProps extends NotificationActions {
  notification: Notification
}

export function NotificationItem({
  notification,
  onRead,
  onDismiss,
  onAction
}: NotificationItemProps) {
  const isUnread = notification.is_unread
  const isExpired = notification.is_expired

  // Map notification type to clean, minimal Lucide icon
  const getNotificationIcon = (type: string, title: string) => {
    // Check title for specific notification types to use unique icons
    if (title.includes('Survey delivery sent')) {
      return <Send className="h-5 w-5 text-neutral-700" />
    }
    if (title.includes('Scheduled surveys sent')) {
      return <Calendar className="h-5 w-5 text-neutral-700" />
    }

    // Default type-based icons
    const iconMap: Record<string, React.ReactNode> = {
      invitation: <Building2 className="h-5 w-5 text-neutral-700" />,
      survey: <ClipboardList className="h-5 w-5 text-neutral-700" />,
      integration: <Link className="h-5 w-5 text-neutral-700" />,
      analysis: <TrendingUp className="h-5 w-5 text-neutral-700" />,
      reminder: <Clock className="h-5 w-5 text-neutral-700" />,
      welcome: <Sparkles className="h-5 w-5 text-neutral-700" />
    }
    return iconMap[type] || <ClipboardList className="h-5 w-5 text-neutral-700" />
  }

  return (
    <div
      className={cn(
        "group relative px-6 py-4 transition-colors hover:bg-accent/50",
        isUnread && "bg-accent/30",
        isExpired && "opacity-60"
      )}
    >
      <div className="flex gap-4">
        {/* Icon */}
        <div className="flex-shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-200">
            {getNotificationIcon(notification.type, notification.title)}
          </div>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-base font-semibold text-foreground">{notification.title}</h3>
            {isUnread && <div className="h-2 w-2 flex-shrink-0 rounded-full bg-black" />}
          </div>
          <p className="text-sm leading-relaxed text-neutral-700">{notification.message}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {notification.organization_name && (
              <>
                <span>{notification.organization_name}</span>
                <span>•</span>
              </>
            )}
            <span>
              {new Date(notification.created_at).toLocaleDateString()} at{' '}
              {new Date(notification.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>

          {/* Actions */}
          {!isExpired && (
            <div className="flex items-center gap-2 pt-0.5">
              {notification.action_url && notification.action_text && (
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 px-4 text-sm font-medium bg-black hover:bg-neutral-800 text-white rounded-lg"
                  onClick={() => onAction(notification)}
                >
                  {notification.action_text}
                  {notification.action_url.startsWith('http') && (
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  )}
                </Button>
              )}
              {isUnread && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRead(notification.id)}
                  className="h-8 gap-1.5 text-sm font-normal text-neutral-700 hover:text-neutral-900 hover:bg-transparent"
                >
                  <Check className="h-3.5 w-3.5" />
                  Mark Read
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDismiss(notification.id)}
                className="h-8 gap-1.5 text-sm font-normal text-neutral-500 hover:text-neutral-700 hover:bg-transparent"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Dismiss
              </Button>
            </div>
          )}

          {/* Expired notice */}
          {isExpired && (
            <p className="text-xs text-muted-foreground italic">
              This notification has expired
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default NotificationItem