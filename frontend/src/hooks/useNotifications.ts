'use client'

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import type { Notification, NotificationResponse } from '@/types/notifications'

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const { toast } = useToast()

  const LIMIT = 20

  // Fetch notifications from API
  const fetchNotifications = useCallback(async (loadMore = false) => {
    try {
      setIsLoading(true)
      const currentOffset = loadMore ? offset : 0
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_BASE}/api/notifications/?limit=${LIMIT}&offset=${currentOffset}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.ok) {
        const data: NotificationResponse = await response.json()
        if (loadMore) {
          setNotifications(prev => [...prev, ...data.notifications])
        } else {
          setNotifications(data.notifications)
          setOffset(0)
        }
        setUnreadCount(data.unread_count)
        setHasMore(data.has_more || false)
        setOffset(currentOffset + data.notifications.length)
      } else {
        // Silently fail - notifications are not critical
      }
    } catch (error) {
      // Silently fail - notifications are not critical
    } finally {
      setIsLoading(false)
    }
  }, [offset])

  // Load more notifications for infinite scroll
  const loadMoreNotifications = async () => {
    if (!isLoading && hasMore) {
      await fetchNotifications(true)
    }
  }

  // Mark notification as read
  const markAsRead = async (notificationId: number) => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_BASE}/api/notifications/${notificationId}/read`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.ok) {
        await fetchNotifications() // Refresh notifications
        toast({
          title: "Notification marked as read",
          description: "The notification has been marked as read."
        })
      }
    } catch (error) {
      console.error('Error marking notification as read:', error)
      toast({
        title: "Error",
        description: "Failed to mark notification as read.",
        variant: "destructive"
      })
    }
  }

  // Dismiss notification
  const dismiss = async (notificationId: number) => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_BASE}/api/notifications/${notificationId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.ok) {
        await fetchNotifications() // Refresh notifications
        toast({
          title: "Notification dismissed",
          description: "The notification has been dismissed."
        })
      }
    } catch (error) {
      console.error('Error dismissing notification:', error)
      toast({
        title: "Error",
        description: "Failed to dismiss notification.",
        variant: "destructive"
      })
    }
  }

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_BASE}/api/notifications/mark-all-read`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.ok) {
        await fetchNotifications() // Refresh notifications
        toast({
          title: "All notifications marked as read",
          description: "All notifications have been marked as read."
        })
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
      toast({
        title: "Error",
        description: "Failed to mark all notifications as read.",
        variant: "destructive"
      })
    }
  }

  // Clear all notifications
  const clearAll = async () => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${API_BASE}/api/notifications/clear-all`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })

      if (response.ok) {
        await fetchNotifications() // Refresh notifications
        toast({
          title: "All notifications cleared",
          description: "All notifications have been dismissed."
        })
      }
    } catch (error) {
      console.error('Error clearing all notifications:', error)
      toast({
        title: "Error",
        description: "Failed to clear all notifications.",
        variant: "destructive"
      })
    }
  }

  // Handle notification action (Accept invitation, View results, etc.)
  const handleAction = async (notification: Notification) => {
    if (!notification.action_url) return

    // If external URL, open in new tab
    if (notification.action_url.startsWith('http')) {
      window.open(notification.action_url, '_blank')
    } else {
      // Internal URL, navigate
      window.location.href = notification.action_url
    }

    // Mark as read when action is taken
    await markAsRead(notification.id)
  }

  // Auto-refresh notifications every 30 seconds
  useEffect(() => {
    fetchNotifications()

    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  return {
    notifications,
    unreadCount,
    isLoading,
    hasMore,
    fetchNotifications,
    loadMoreNotifications,
    markAsRead,
    dismiss,
    markAllAsRead,
    clearAll,
    handleAction
  }
}