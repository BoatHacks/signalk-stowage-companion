const { checkStowageMgmtAvailable, resolveMgmtBaseUrl } = require('./mgmtClient')
const { jsonBodyParser } = require('./jsonBody')
const registerStatusRoutes = require('./routes/status')
const registerIdentifyRoutes = require('./routes/identify')

module.exports = function (app) {
  const plugin = {}
  plugin.id = 'signalk-stowage-companion'
  plugin.name = 'Stowage Companion'
  plugin.description = 'Capture and identify items with your phone, then file them into Stowage Management.'

  let pluginOptions = {}
  let dependencyStatus = { available: null, error: null, checkedAt: null }

  async function refreshDependencyStatus () {
    const mgmtBaseUrl = resolveMgmtBaseUrl(pluginOptions)
    const result = await checkStowageMgmtAvailable(mgmtBaseUrl)
    dependencyStatus = { ...result, checkedAt: new Date().toISOString() }
    if (!result.available) {
      app.error(
        `signalk-stowage-companion: signalk-stowage-mgmt not reachable at ${mgmtBaseUrl} (${result.error}). ` +
        'The companion webapp will show an error until this is resolved — see ARCHITECTURE.md §5.'
      )
    } else {
      app.debug('signalk-stowage-companion: signalk-stowage-mgmt is reachable')
    }
    return dependencyStatus
  }

  plugin.start = function (options) {
    pluginOptions = options || {}
    dependencyStatus = { available: null, error: null, checkedAt: null }
    // Fire-and-forget: /status is already mounted by the time this
    // resolves, and the webapp polls it on load rather than blocking
    // plugin startup on an HTTP round trip to another plugin.
    refreshDependencyStatus().catch((err) => app.error(err))
  }

  plugin.stop = function () {}

  plugin.schema = {
    type: 'object',
    properties: {
      upcItemDbApiKey: {
        type: 'string',
        title: 'UPCItemDB API key',
        description:
          'Resolves a scanned barcode to a candidate item name/category/description. Free tier: 100 lookups/day. Get a key at upcitemdb.com.',
        default: ''
      },
      serpApiKey: {
        type: 'string',
        title: 'SerpApi API key',
        description:
          'Used for manual-PDF search on electric/electronic items. Free tier: 250 searches/month. Get a key at serpapi.com. Without a key, manual search is skipped (item creation still works).',
        default: ''
      },
      mgmtBaseUrl: {
        type: 'string',
        title: 'signalk-stowage-mgmt base URL override',
        description:
          'Absolute URL this plugin’s backend uses to reach signalk-stowage-mgmt for its startup reachability check (e.g. http://localhost:3000/plugins/signalk-stowage-mgmt). Only needed if the default guess (localhost + this server’s port) is wrong. Does not affect the webapp itself, which always calls signalk-stowage-mgmt same-origin from the browser.',
        default: ''
      }
    }
  }

  // The server mounts this router under /plugins/signalk-stowage-companion
  plugin.registerWithRouter = function (router) {
    router.use(jsonBodyParser())

    registerStatusRoutes(router, () => dependencyStatus, refreshDependencyStatus)
    registerIdentifyRoutes(router, () => pluginOptions)

    // eslint-disable-next-line no-unused-vars
    router.use((err, req, res, next) => {
      app.error(err)
      res.status(err.statusCode || 500).json({ error: err.message || 'internal error' })
    })
  }

  return plugin
}
