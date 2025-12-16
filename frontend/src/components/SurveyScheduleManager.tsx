"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Plus,
  Trash2,
  Calendar,
  Clock,
  AlertCircle,
  Loader2,
  CheckCircle
} from "lucide-react"
import { toast } from "sonner"

interface SurveySchedule {
  id?: number
  is_active: boolean
  time_utc: string
  timezone: string
  frequency_type: 'daily' | 'weekday' | 'weekly' | 'biweekly' | 'monthly'
  day_of_week?: number
  day_of_month?: number
  created_at?: string
}

interface SurveyScheduleManagerProps {
  organizationId?: number
}

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekday', label: 'Weekdays (Mon-Fri)' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' }
]

const DAYS_OF_WEEK = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' }
]

export function SurveyScheduleManager({ organizationId }: SurveyScheduleManagerProps) {
  const [schedules, setSchedules] = useState<SurveySchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  // New schedule form state
  const [newSchedule, setNewSchedule] = useState<Partial<SurveySchedule>>({
    is_active: true,
    time_utc: '09:00',
    timezone: 'America/New_York',
    frequency_type: 'weekly',
    day_of_week: 4 // Friday
  })

  useEffect(() => {
    loadSchedules()
  }, [])

  const loadSchedules = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/surveys/schedules`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      )

      if (!response.ok) throw new Error('Failed to load schedules')

      const data = await response.json()
      setSchedules(data.schedules || [])
    } catch (error) {
      console.error('Error loading schedules:', error)
      toast.error('Failed to load survey schedules')
    } finally {
      setLoading(false)
    }
  }

  const createSchedule = async () => {
    // Validate required fields
    if (!newSchedule.time_utc || !newSchedule.frequency_type) {
      toast.error('Please fill in all required fields')
      return
    }

    if ((newSchedule.frequency_type === 'weekly' || newSchedule.frequency_type === 'biweekly')
        && newSchedule.day_of_week === undefined) {
      toast.error('Please select a day of the week')
      return
    }

    if (newSchedule.frequency_type === 'monthly' && !newSchedule.day_of_month) {
      toast.error('Please select a day of the month')
      return
    }

    try {
      setSaving(true)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/surveys/schedules`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(newSchedule)
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to create schedule')
      }

      toast.success('Survey schedule created successfully')
      setShowAddForm(false)
      setNewSchedule({
        is_active: true,
        time_utc: '09:00',
        timezone: 'America/New_York',
        frequency_type: 'weekly',
        day_of_week: 4
      })
      loadSchedules()
    } catch (error) {
      console.error('Error creating schedule:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create schedule')
    } finally {
      setSaving(false)
    }
  }

  const deleteSchedule = async (scheduleId: number) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/surveys/schedules/${scheduleId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      )

      if (!response.ok) throw new Error('Failed to delete schedule')

      toast.success('Schedule deleted successfully')
      loadSchedules()
    } catch (error) {
      console.error('Error deleting schedule:', error)
      toast.error('Failed to delete schedule')
    }
  }

  const formatScheduleDescription = (schedule: SurveySchedule) => {
    const freqLabel = FREQUENCY_OPTIONS.find(f => f.value === schedule.frequency_type)?.label

    let dayInfo = ''
    if (schedule.frequency_type === 'weekly' || schedule.frequency_type === 'biweekly') {
      const dayLabel = DAYS_OF_WEEK.find(d => d.value === schedule.day_of_week)?.label
      dayInfo = ` on ${dayLabel}`
    } else if (schedule.frequency_type === 'monthly') {
      dayInfo = ` on day ${schedule.day_of_month}`
    }

    return `${freqLabel}${dayInfo} at ${schedule.time_utc} UTC`
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Survey Schedules
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Configure when team members receive burnout check-in surveys
            </p>
          </div>
          {schedules.length < 3 && !showAddForm && (
            <Button
              onClick={() => setShowAddForm(true)}
              size="sm"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Schedule
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {schedules.length === 0 && !showAddForm && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No survey schedules configured. Add a schedule to start sending automated check-ins.
            </AlertDescription>
          </Alert>
        )}

        {/* Existing schedules */}
        {schedules.map((schedule) => (
          <div
            key={schedule.id}
            className="flex items-center justify-between p-4 border rounded-lg"
          >
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="font-medium">{formatScheduleDescription(schedule)}</span>
                </div>
                {schedule.is_active ? (
                  <Badge variant="default" className="mt-2 w-fit">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="mt-2 w-fit">
                    Inactive
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => schedule.id && deleteSchedule(schedule.id)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {/* Add new schedule form */}
        {showAddForm && (
          <div className="border rounded-lg p-4 space-y-4 bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">New Schedule</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Frequency selector */}
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={newSchedule.frequency_type}
                  onValueChange={(value: any) =>
                    setNewSchedule({ ...newSchedule, frequency_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Time selector */}
              <div className="space-y-2">
                <Label>Time (UTC)</Label>
                <Input
                  type="time"
                  value={newSchedule.time_utc}
                  onChange={(e) =>
                    setNewSchedule({ ...newSchedule, time_utc: e.target.value })
                  }
                />
              </div>

              {/* Day of week selector (for weekly/biweekly) */}
              {(newSchedule.frequency_type === 'weekly' ||
                newSchedule.frequency_type === 'biweekly') && (
                <div className="space-y-2 col-span-2">
                  <Label>Day of Week</Label>
                  <Select
                    value={newSchedule.day_of_week?.toString()}
                    onValueChange={(value) =>
                      setNewSchedule({ ...newSchedule, day_of_week: parseInt(value) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((day) => (
                        <SelectItem key={day.value} value={day.value.toString()}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Day of month selector (for monthly) */}
              {newSchedule.frequency_type === 'monthly' && (
                <div className="space-y-2 col-span-2">
                  <Label>Day of Month</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={newSchedule.day_of_month || ''}
                    onChange={(e) =>
                      setNewSchedule({ ...newSchedule, day_of_month: parseInt(e.target.value) })
                    }
                  />
                </div>
              )}
            </div>

            <Button
              onClick={createSchedule}
              disabled={saving}
              className="w-full"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Schedule'
              )}
            </Button>
          </div>
        )}

        {schedules.length >= 3 && !showAddForm && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Maximum of 3 schedules reached. Delete a schedule to add a new one.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
