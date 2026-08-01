// Lets the webapp check signalk-stowage-mgmt reachability on load, instead
// of discovering it's missing partway through a capture flow (ARCHITECTURE.md
// §5's "fail fast" framing, applied at the UI level since a Signal K plugin
// can't abort its own server-side startup).
module.exports = function registerStatusRoutes (router, getDependencyStatus, refreshDependencyStatus) {
  router.get('/status', (req, res) => {
    res.json(getDependencyStatus())
  })

  router.post('/status/refresh', async (req, res) => {
    const status = await refreshDependencyStatus()
    res.json(status)
  })
}
