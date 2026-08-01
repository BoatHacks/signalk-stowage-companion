const express = require('express')

const pluginFactory = require('../plugin/index.js')

// Boots a real instance of the plugin (same registerWithRouter() path the
// actual Signal K server uses) and returns helpers for making real HTTP
// requests against it. Mirrors signalk-stowage-mgmt's test-helpers/server.js.
async function startTestServer (opts) {
  opts = opts || {}
  const fakeApp = {
    debug: () => {},
    error: () => {}
  }

  const plugin = pluginFactory(fakeApp)
  plugin.start(opts.options || {})

  const app = express()
  const router = express.Router()
  plugin.registerWithRouter(router)
  app.use('/plugins/signalk-stowage-companion', router)

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const port = server.address().port
  const baseUrl = `http://127.0.0.1:${port}/plugins/signalk-stowage-companion`

  async function get (p) { return fetch(baseUrl + p) }
  async function post (p, body) {
    return fetch(baseUrl + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    })
  }

  // plugin.start() kicks off the signalk-stowage-mgmt reachability check
  // without awaiting it (the plugin lifecycle's start() isn't expected to
  // block on another plugin's HTTP round trip) — poll /status until that
  // first check has actually settled, so tests aren't racing it.
  const deadline = Date.now() + 10000
  let initialStatus = await (await get('/status')).json()
  while (initialStatus.available === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    initialStatus = await (await get('/status')).json()
  }

  return {
    baseUrl,
    plugin,
    get,
    post,
    async stop () {
      plugin.stop()
      await new Promise((resolve) => server.close(resolve))
    }
  }
}

module.exports = { startTestServer }
