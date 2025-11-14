import React, { useState, useRef, useEffect } from 'react'
import { Bell, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useNotifications } from '@/hooks/useNotifications'
import NotificationItem from './NotificationItem'

export function NotificationDrawer() {
  const [isOpen, setIsOpen] = useState(false)
  const {
    notifications,
    unreadCount,
    isLoading,
    hasMore,
    loadMoreNotifications,
    markAsRead,
    dismiss,
    markAllAsRead,
    clearAll,
    handleAction
  } = useNotifications()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Handle notification action and close panel
  const onAction = async (notification: any) => {
    await handleAction(notification)
    setIsOpen(false)
  }

  // Handle scroll for infinite loading
  const handleScroll = () => {
    if (!scrollRef.current || isLoading || !hasMore) return

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current

    // Load more when scrolled to within 100px of bottom
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      loadMoreNotifications()
    }
  }

  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return

    scrollElement.addEventListener('scroll', handleScroll)
    return () => scrollElement.removeEventListener('scroll', handleScroll)
  }, [isLoading, hasMore])

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative p-2 h-9 w-9"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-[400px] sm:w-[600px] p-0 flex flex-col h-full">
        <SheetHeader className="border-b border-gray-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
                <Bell className="h-5 w-5 text-gray-700" />
              </div>
              <div>
                <SheetTitle className="text-xl font-bold">Notifications</SheetTitle>
                <p className="text-sm text-gray-500">
                  {unreadCount} {unreadCount === 1 ? "unread notification" : "unread notifications"}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mr-8">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Mark all read
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Clear all
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Notifications List */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          <div className="divide-y divide-gray-200">
            {isLoading && notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-gray-200">
                  <Bell className="h-8 w-8 text-gray-500" />
                </div>
                <p className="text-sm font-medium">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-gray-200">
                  <Bell className="h-8 w-8 text-gray-500" />
                </div>
                <p className="text-sm font-medium">No notifications</p>
                <p className="text-sm text-gray-600">You're all caught up!</p>
              </div>
            ) : (
              <>
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onRead={markAsRead}
                    onDismiss={dismiss}
                    onAction={onAction}
                  />
                ))}
                {/* Loading indicator for infinite scroll */}
                {isLoading && (
                  <div className="flex justify-center items-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    <span className="ml-2 text-sm text-gray-500">Loading more...</span>
                  </div>
                )}
                {/* End of list indicator */}
                {!hasMore && notifications.length > 0 && (
                  <div className="border-t border-gray-200 px-6 py-4 text-center">
                    <p className="text-sm text-gray-500">No more notifications</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default NotificationDrawer