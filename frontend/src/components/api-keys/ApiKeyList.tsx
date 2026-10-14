"use client"

import { formatDistanceToNow, format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2 } from "lucide-react"
import { ApiKey } from "@/types/apiKey"

interface ApiKeyListProps {
  keys: ApiKey[]
  onRevokeClick: (key: ApiKey) => void
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "Never"
  const date = new Date(dateString)
  return format(date, "MMM d, yyyy")
}

function formatLastUsed(dateString: string | null): string {
  if (!dateString) return "Never"
  const date = new Date(dateString)
  return formatDistanceToNow(date, { addSuffix: true })
}

function getExpirationStatus(expiresAt: string | null): { text: string; variant: "default" | "secondary" | "destructive" | "outline-solid" } {
  if (!expiresAt) {
    return { text: "Never expires", variant: "secondary" }
  }
  const expDate = new Date(expiresAt)
  const now = new Date()
  const daysUntilExpiry = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry < 0) {
    return { text: "Expired", variant: "destructive" }
  } else if (daysUntilExpiry <= 7) {
    return { text: `Expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`, variant: "destructive" }
  } else if (daysUntilExpiry <= 30) {
    return { text: `Expires in ${daysUntilExpiry} days`, variant: "outline" }
  } else {
    return { text: formatDate(expiresAt), variant: "secondary" }
  }
}

export function ApiKeyList({ keys, onRevokeClick }: ApiKeyListProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header Row */}
      <div className="bg-neutral-100 px-4 py-3 border-b">
        <div className="grid grid-cols-12 gap-4 text-sm font-medium text-neutral-700">
          <div className="col-span-3">Name</div>
          <div className="col-span-2">Key</div>
          <div className="col-span-2">Created</div>
          <div className="col-span-2">Last Used</div>
          <div className="col-span-2">Expires</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
      </div>

      {/* Data Rows */}
      <div className="max-h-96 overflow-y-auto">
        {keys.map((key) => {
          const expStatus = getExpirationStatus(key.expires_at)
          return (
            <div
              key={key.id}
              className="px-4 py-3 border-b last:border-b-0 hover:bg-neutral-50 transition-colors"
            >
              <div className="grid grid-cols-12 gap-4 text-sm items-center">
                {/* Name */}
                <div className="col-span-3 font-medium text-neutral-900 truncate" title={key.name}>
                  {key.name}
                </div>

                {/* Masked Key */}
                <div className="col-span-2">
                  <code className="font-mono text-xs bg-neutral-100 px-2 py-1 rounded text-neutral-700">
                    {key.masked_key}
                  </code>
                </div>

                {/* Created */}
                <div className="col-span-2 text-neutral-600">
                  {formatDate(key.created_at)}
                </div>

                {/* Last Used */}
                <div className="col-span-2 text-neutral-600">
                  {formatLastUsed(key.last_used_at)}
                </div>

                {/* Expires */}
                <div className="col-span-2">
                  <Badge variant={expStatus.variant} className="text-xs">
                    {expStatus.text}
                  </Badge>
                </div>

                {/* Actions */}
                <div className="col-span-1 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRevokeClick(key)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="sr-only">Revoke {key.name}</span>
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
