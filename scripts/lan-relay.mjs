/**
 * Relay the dev server to the LAN when it runs inside a container.
 *
 * When Vite runs in a sandboxed container (e.g. Claude Code), Docker forwards
 * its port to the host as 127.0.0.1:5173 ONLY — reachable from the laptop,
 * invisible to phones on the same Wi-Fi. This script runs natively on the
 * laptop, listens on the LAN IP at the same port (distinct address, so no
 * conflict with the localhost listener), and pipes raw TCP to 127.0.0.1:5173.
 * Pure passthrough: HTTPS and the HMR websocket work unchanged.
 *
 * Usage (on the laptop, not in the container):  node scripts/lan-relay.mjs
 * Stop with Ctrl-C. Not needed when the dev server runs natively.
 */

import net from 'node:net'
import { networkInterfaces } from 'node:os'

const PORT = 5173
const TARGET = '127.0.0.1'

const lanIp = Object.values(networkInterfaces())
  .flatMap((list) => list ?? [])
  .find((ni) => ni.family === 'IPv4' && !ni.internal)?.address

if (!lanIp) {
  console.error('No LAN IPv4 interface found — are you on Wi-Fi?')
  process.exit(1)
}

const server = net.createServer((client) => {
  const upstream = net.connect(PORT, TARGET)
  client.pipe(upstream)
  upstream.pipe(client)
  client.on('error', () => upstream.destroy())
  upstream.on('error', () => client.destroy())
})

server.on('error', (err) => {
  console.error(`Relay failed: ${err.message}`)
  process.exit(1)
})

server.listen(PORT, lanIp, () => {
  console.log(`✓ relaying https://${lanIp}:${PORT}/ -> https://${TARGET}:${PORT}/`)
  console.log('  Open the first URL on your phone (same Wi-Fi). Ctrl-C to stop.')
})
