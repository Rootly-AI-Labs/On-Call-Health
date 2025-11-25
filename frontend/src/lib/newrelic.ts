/**
 * New Relic Browser Agent Configuration
 *
 * This initializes New Relic Browser monitoring for the frontend.
 * Configured via environment variables for security.
 *
 * Uses dynamic import to avoid SSR issues.
 */

// Only initialize in browser (not during SSR)
export async function initNewRelic() {
  // Skip if not in browser
  if (typeof window === 'undefined') {
    return null
  }

  // Get configuration from environment variables
  const accountId = process.env.NEXT_PUBLIC_NEW_RELIC_ACCOUNT_ID
  const trustKey = process.env.NEXT_PUBLIC_NEW_RELIC_TRUST_KEY
  const agentId = process.env.NEXT_PUBLIC_NEW_RELIC_AGENT_ID
  const licenseKey = process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY
  const applicationId = process.env.NEXT_PUBLIC_NEW_RELIC_APPLICATION_ID

  // Only initialize if all required config is present
  if (!accountId || !trustKey || !agentId || !licenseKey || !applicationId) {
    return null
  }

  try {
    // Dynamically import to avoid SSR issues
    // Use string-based import that Next.js can't statically analyze
    // This prevents build-time errors if the package is missing
    const packageName = '@newrelic/browser-agent'
    let newRelicModule: any
    try {
      // Use Function constructor to create a dynamic import that webpack can't analyze
      newRelicModule = await new Function('packageName', 'return import(packageName)')(packageName)
    } catch (importError) {
      // Package not available - this is fine, New Relic is optional
      return null
    }

    const BrowserAgent = newRelicModule?.BrowserAgent || newRelicModule?.default?.BrowserAgent

    if (!BrowserAgent) {
      return null
    }

    // Initialize the browser agent
    const agent = new BrowserAgent({
      init: {
        distributed_tracing: { enabled: true },
        privacy: { cookies_enabled: true },
        ajax: { deny_list: [] }
      },
      info: {
        beacon: 'bam.nr-data.net',
        errorBeacon: 'bam.nr-data.net',
        licenseKey: licenseKey,
        applicationID: applicationId,
        sa: 1
      },
      loader_config: {
        accountID: accountId,
        trustKey: trustKey,
        agentID: agentId,
        licenseKey: licenseKey,
        applicationID: applicationId
      }
    })

    return agent
  } catch (error) {
    // Silently fail - monitoring is optional
    // This catch will handle both import errors and initialization errors
    return null
  }
}
