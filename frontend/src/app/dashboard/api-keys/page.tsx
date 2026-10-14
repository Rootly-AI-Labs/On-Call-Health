"use client"

import { useState } from "react"
import Image from "next/image"
import { Key, Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useApiKeys } from "@/hooks/useApiKeys"
import { CreateKeyDialog } from "@/components/api-keys/CreateKeyDialog"
import { KeyCreatedDialog } from "@/components/api-keys/KeyCreatedDialog"
import { ApiKeyList } from "@/components/api-keys/ApiKeyList"
import { RevokeKeyDialog } from "@/components/api-keys/RevokeKeyDialog"
import { ApiKey, CreateApiKeyResponse } from "@/types/apiKey"
import { TopPanel } from "@/components/TopPanel"

export default function ApiKeysPage() {
  const { keys, loading, error, createKey, revokeKey } = useApiKeys()

  // Create flow state
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(null)

  // Revoke flow state
  const [showRevokeDialog, setShowRevokeDialog] = useState(false)
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKey | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)

  // Create handlers
  const handleKeyCreated = (response: CreateApiKeyResponse) => {
    setCreatedKey(response)
    setShowSuccessDialog(true)
  }

  const handleSuccessDialogClose = () => {
    setShowSuccessDialog(false)
    setCreatedKey(null)
  }

  // Revoke handlers
  const handleRevokeClick = (key: ApiKey) => {
    setKeyToRevoke(key)
    setShowRevokeDialog(true)
  }

  const handleRevokeCancel = () => {
    setShowRevokeDialog(false)
    setKeyToRevoke(null)
  }

  const handleConfirmRevoke = async () => {
    if (!keyToRevoke) return

    setIsRevoking(true)
    try {
      const success = await revokeKey(keyToRevoke.id)
      if (success) {
        setShowRevokeDialog(false)
        setKeyToRevoke(null)
      }
    } finally {
      setIsRevoking(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <TopPanel />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
                <Key className="w-6 h-6" />
                API Keys
              </h1>
              <p className="text-sm text-neutral-600 mt-1">
                Manage API keys for programmatic access to the REST API
              </p>
            </div>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-purple-700 hover:bg-purple-800"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create API Key
            </Button>
          </div>

          {/* Content */}
          <div className="bg-white rounded-lg border border-neutral-200 shadow-xs">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                <span className="ml-3 text-neutral-600">Loading API keys...</span>
              </div>
            ) : error ? (
              <div className="text-center py-16">
                <p className="text-red-600">{error}</p>
              </div>
            ) : keys.length === 0 ? (
              <div className="text-center py-16">
                <Key className="w-12 h-12 mx-auto mb-4 text-neutral-400" />
                <h3 className="text-lg font-medium text-neutral-900 mb-2">No API keys yet</h3>
                <p className="text-neutral-600 mb-4">
                  Create your first API key to access the API programmatically.
                </p>
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  className="bg-purple-700 hover:bg-purple-800"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create API Key
                </Button>
              </div>
            ) : (
              <ApiKeyList keys={keys} onRevokeClick={handleRevokeClick} />
            )}
          </div>

          {/* Security note */}
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              <strong>Security note:</strong> API keys provide full access to your MCP endpoints.
              Keep them secure and never share them publicly.
            </p>
          </div>
        </div>

        {/* Powered by Rootly AI Footer */}
        <div className="mt-12 pt-8 border-t border-neutral-200 text-center">
          <a
            href="https://rootly.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-col items-center space-y-1 hover:opacity-80 transition-opacity"
          >
            <span className="text-lg text-neutral-700">powered by</span>
            <Image
              src="/images/rootly-ai-logo.png"
              alt="Rootly AI"
              width={200}
              height={80}
              className="h-12 w-auto"
            />
          </a>
        </div>
      </main>

      {/* Create Key Dialog */}
      <CreateKeyDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreateKey={createKey}
        onKeyCreated={handleKeyCreated}
      />

      {/* Key Created Success Dialog */}
      <KeyCreatedDialog
        open={showSuccessDialog}
        onOpenChange={handleSuccessDialogClose}
        createdKey={createdKey}
      />

      {/* Revoke Confirmation Dialog */}
      <RevokeKeyDialog
        open={showRevokeDialog}
        onOpenChange={(open) => {
          if (!open && !isRevoking) {
            handleRevokeCancel()
          }
        }}
        keyToRevoke={keyToRevoke}
        isRevoking={isRevoking}
        onConfirmRevoke={handleConfirmRevoke}
        onCancel={handleRevokeCancel}
      />
    </div>
  )
}
