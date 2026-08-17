/**
 * Lambda@Edge (viewer-request) — exige cookie JWT de Cognito en todas las rutas
 * excepto assets estáticos mínimos y el callback OAuth de la SPA.
 *
 * Cookie: len_id_token (ID token de Cognito, firmado RS256)
 * Env (inyectadas al empaquetar): USER_POOL_ID, CLIENT_ID, REGION
 */
import crypto from 'node:crypto'
import https from 'node:https'

const USER_POOL_ID = process.env.USER_POOL_ID || '{{USER_POOL_ID}}'
const CLIENT_ID = process.env.CLIENT_ID || '{{CLIENT_ID}}'
const REGION = process.env.REGION || '{{REGION}}'
const COOKIE_NAME = 'len_id_token'
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`

/** @type {Map<string, {keys: object, fetchedAt: number}>} */
const jwksCache = new Map()

function getCookie(headers, name) {
  const raw = headers.cookie?.[0]?.value
  if (!raw) return null
  const parts = raw.split(';')
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

function getBearerToken(headers) {
  const auth = headers.authorization?.[0]?.value
  if (!auth) return null
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

function getIdToken(headers) {
  return getCookie(headers, COOKIE_NAME) || getBearerToken(headers)
}

function b64urlJson(segment) {
  const padded = segment + '='.repeat((4 - (segment.length % 4)) % 4)
  const json = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  return JSON.parse(json)
}

function fetchJwks() {
  const cached = jwksCache.get(ISSUER)
  if (cached && Date.now() - cached.fetchedAt < 3600_000) {
    return Promise.resolve(cached.keys)
  }
  const url = `${ISSUER}/.well-known/jwks.json`
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          try {
            const keys = JSON.parse(data)
            jwksCache.set(ISSUER, { keys, fetchedAt: Date.now() })
            resolve(keys)
          } catch (err) {
            reject(err)
          }
        })
      })
      .on('error', reject)
  })
}

function jwkToPem(jwk) {
  return crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' })
}

async function verifyIdToken(token) {
  const [headerB64, payloadB64, signatureB64] = token.split('.')
  if (!headerB64 || !payloadB64 || !signatureB64) throw new Error('malformed')

  const header = b64urlJson(headerB64)
  const payload = b64urlJson(payloadB64)

  if (payload.iss !== ISSUER) throw new Error('iss')
  const aud = payload.aud
  const audOk = Array.isArray(aud) ? aud.includes(CLIENT_ID) : aud === CLIENT_ID
  if (!audOk && payload.client_id !== CLIENT_ID) throw new Error('aud')
  if (payload.token_use && payload.token_use !== 'id') throw new Error('token_use')
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) throw new Error('exp')

  const jwks = await fetchJwks()
  const jwk = (jwks.keys || []).find((k) => k.kid === header.kid)
  if (!jwk) throw new Error('kid')

  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(`${headerB64}.${payloadB64}`)
  verifier.end()
  const signature = Buffer.from(signatureB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const ok = verifier.verify(jwkToPem(jwk), signature)
  if (!ok) throw new Error('sig')
  return payload
}

function isPublicPath(uri) {
  if (uri === '/auth/callback' || uri.startsWith('/auth/callback?')) return true
  // Permitir cargar la SPA y el JS/CSS necesarios para el login (AuthGate)
  if (uri === '/' || uri === '/index.html') return true
  if (uri.startsWith('/assets/')) return true
  if (uri === '/len-logo.png' || uri === '/favicon.ico') return true
  return false
}

function unauthorized(request) {
  // Para /imgs y API-like: 401. Para HTML navegación: dejar pasar solo paths públicos.
  return {
    status: '401',
    statusDescription: 'Unauthorized',
    headers: {
      'content-type': [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      'cache-control': [{ key: 'Cache-Control', value: 'no-store' }],
      'www-authenticate': [{ key: 'WWW-Authenticate', value: 'Bearer realm="len-validation"' }],
    },
    body: 'Unauthorized - inicia sesion en la consola LEN.',
  }
}

export async function handler(event) {
  const request = event.Records[0].cf.request
  const uri = request.uri || '/'

  if (isPublicPath(uri)) {
    return request
  }

  const token = getIdToken(request.headers)
  if (!token) {
    return unauthorized(request)
  }

  try {
    await verifyIdToken(token)
    return request
  } catch {
    return unauthorized(request)
  }
}
