/**
 * Generate a self-signed dev TLS cert into ./certs using the system `openssl`
 * (pre-installed on macOS/Linux — no npm packages, no mkcert, no plugins).
 *
 * This exists so `npm run dev-secure` can serve the Vite dev server over HTTPS,
 * which makes the browser a *secure context* — `crypto.randomUUID`, the
 * Clipboard API, etc. work when testing from a phone over the LAN (plain http
 * at a LAN IP is NOT a secure context). The cert is self-signed, so the browser
 * shows a one-time "not private" warning you click through; once you proceed,
 * `isSecureContext` is true. PWA *install* needs a *trusted* cert (mkcert) and
 * is intentionally out of scope here.
 *
 * No-ops if the cert already exists. Delete ./certs to regenerate (e.g. after
 * your LAN IP changes). The cert is git-ignored — it must never be committed.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'

const CERT = 'certs/localhost.pem'
const KEY = 'certs/localhost-key.pem'

if (existsSync(CERT) && existsSync(KEY)) {
  console.log(`✓ dev cert already present (${CERT}). Delete ./certs to regen.`)
  process.exit(0)
}

// Every non-internal IPv4 address, so the cert's SAN matches whatever URL Vite
// prints — localhost on the laptop, 192.168.x.x on the phone.
const ips = ['127.0.0.1', '::1']
for (const list of Object.values(networkInterfaces())) {
  for (const ni of list ?? []) {
    if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address)
  }
}

const altNames = [
  'DNS.1 = localhost',
  ...ips.map((ip, i) => `IP.${i + 1} = ${ip}`),
].join('\n')

// A self-contained OpenSSL config — portable across OpenSSL and the LibreSSL
// that ships on macOS (avoids the `-addext` flag, which older LibreSSL lacks).
const conf = `[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = localhost
[v3]
subjectAltName = @alt
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
[alt]
${altNames}
`

mkdirSync('certs', { recursive: true })
const confPath = 'certs/.openssl.cnf'
writeFileSync(confPath, conf)
try {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      KEY,
      '-out',
      CERT,
      '-days',
      '825',
      '-config',
      confPath,
    ],
    { stdio: 'inherit' },
  )
} catch (err) {
  rmSync(confPath, { force: true })
  console.error(
    '\n✗ Failed to run `openssl`. It ships with macOS/Linux; if missing, ' +
      'install it (e.g. `brew install openssl`) or use plain `npm run dev`.',
  )
  throw err
}
rmSync(confPath, { force: true })
console.log(`✓ self-signed dev cert written to ${CERT}`)
console.log(`  valid for: ${['localhost', ...ips].join(', ')}`)
console.log('  (git-ignored; the browser warns once — click through to proceed)')
