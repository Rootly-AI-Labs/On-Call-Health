/**
 * New Relic agent configuration.
 *
 * This file is loaded via NODE_OPTIONS=-r ./newrelic.js
 */
'use strict'

/**
 * This array contains transaction names that should be ignored by New Relic.
 * Add patterns for transactions you want to exclude from monitoring.
 */
exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'OnCall-Burnout-Detector-Frontend'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: 'info'
  },
  allow_all_headers: true,
  distributed_tracing: {
    enabled: true
  }
}
