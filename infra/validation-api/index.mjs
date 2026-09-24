import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

const TABLE_NAME = process.env.TABLE_NAME
const USER_POOL_ID = process.env.USER_POOL_ID ?? ''
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const cognito = new CognitoIdentityProviderClient({})

const ROLES = ['administrador', 'mantenedor', 'validador']
const RANK = { administrador: 3, mantenedor: 2, validador: 1 }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: body === '' ? '' : JSON.stringify(body),
  }
}

function claimsOf(event) {
  return event.requestContext?.authorizer?.jwt?.claims ?? {}
}

function userSub(event) {
  const sub = claimsOf(event).sub
  return typeof sub === 'string' && sub ? sub : null
}

function callerEmail(event) {
  const claims = claimsOf(event)
  const email = claims.email
  if (typeof email === 'string' && email.includes('@')) return email.toLowerCase()
  const username = claims['cognito:username']
  if (typeof username === 'string' && username.includes('@')) return username.toLowerCase()
  return null
}

function normalizeGroups(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw !== 'string') return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      /* el claim a veces llega como texto plano */
    }
  }
  return trimmed.split(/[,\s]+/).filter(Boolean)
}

function highestRole(groups) {
  let best = 'validador'
  for (const raw of normalizeGroups(groups)) {
    const group = raw === 'invitado' ? 'validador' : raw
    if (!ROLES.includes(group)) continue
    if (RANK[group] > RANK[best]) best = group
  }
  return best
}

function roleFromEvent(event) {
  return highestRole(claimsOf(event)['cognito:groups'])
}

const BOOTSTRAP_ADMINS = (process.env.BOOTSTRAP_ADMINS || 'lleonv@uni.pe')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

function isAdmin(event) {
  if (roleFromEvent(event) === 'administrador') return true
  const email = callerEmail(event)
  return email !== null && BOOTSTRAP_ADMINS.includes(email)
}

function decodeParam(value) {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseBody(event) {
  const raw = event.body ?? '{}'
  const text = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw
  return JSON.parse(text)
}

function userKey(sub, eventId) {
  return { pk: `USER#${sub}`, sk: `EVENT#${eventId}` }
}

function canonicalKey(eventId) {
  return { pk: 'CANONICAL', sk: `EVENT#${eventId}` }
}

const SNAPSHOT_BYTE_LIMIT = 300000
const SHARD_BYTE_LIMIT = 240000

function eventSortKey(eventId) {
  return `EVENT#${eventId}`
}

async function getItem(pk, sk) {
  const result = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk, sk } }))
  return result.Item ?? null
}

export function assembleShardSnapshot(eventId, items) {
  const mainSk = eventSortKey(eventId)
  const main = items.find((item) => item.sk === mainSk)
  if (!main?.sessionEpoch || main.snapshot) return null
  const decisions = {}
  const shards = items
    .filter((item) => typeof item.sk === 'string' && item.sk.startsWith(`${mainSk}#D#`))
    .sort((a, b) => a.sk.localeCompare(b.sk))
  for (const item of shards) {
    if (item.decisions && typeof item.decisions === 'object') Object.assign(decisions, item.decisions)
  }
  const catalogItem = items.find((item) => item.sk === `${mainSk}#catalog`)
  const uiItem = items.find((item) => item.sk === `${mainSk}#ui`)
  return {
    schemaVersion: '1.0',
    eventId,
    sessionEpoch: main.sessionEpoch,
    catalog: catalogItem?.catalog && typeof catalogItem.catalog === 'object' ? catalogItem.catalog : {},
    decisions,
    ui: uiItem ? (uiItem.ui ?? null) : null,
    published: main.published === true,
    detailIndex: Number.isFinite(Number(main.detailIndex)) ? Number(main.detailIndex) : 0,
    savedAt: main.savedAt || main.updatedAt || new Date().toISOString(),
  }
}

async function readStoredSession(pk, eventId) {
  const sk = eventSortKey(eventId)
  const main = await getItem(pk, sk)
  if (!main) return null
  if (main.snapshot && typeof main.snapshot === 'object') return main.snapshot
  if (!main.sessionEpoch) return null
  const count = Number.isFinite(Number(main.decisionShardCount)) ? Number(main.decisionShardCount) : 0
  const items = [main]
  const shards = await Promise.all(
    Array.from({ length: count }, (_, index) => getItem(pk, `${sk}#D#${String(index).padStart(4, '0')}`)),
  )
  items.push(...shards.filter(Boolean))
  const [catalogItem, uiItem] = await Promise.all([getItem(pk, `${sk}#catalog`), getItem(pk, `${sk}#ui`)])
  if (catalogItem) items.push(catalogItem)
  if (uiItem) items.push(uiItem)
  return assembleShardSnapshot(eventId, items)
}

export function splitDecisionShards(decisions) {
  const shards = []
  let current = {}
  let bytes = 2
  for (const [id, delta] of Object.entries(decisions ?? {})) {
    const piece = Buffer.byteLength(JSON.stringify({ [id]: delta })) + 1
    if (bytes + piece > SHARD_BYTE_LIMIT && Object.keys(current).length > 0) {
      shards.push(current)
      current = {}
      bytes = 2
    }
    current[id] = delta
    bytes += piece
  }
  shards.push(current)
  return shards
}

async function writeStoredSession(pk, eventId, snapshot, extra = {}) {
  const sk = eventSortKey(eventId)
  const now = snapshot.savedAt
  const previous = await getItem(pk, sk)
  const previousCount = Number.isFinite(Number(previous?.decisionShardCount)) ? Number(previous.decisionShardCount) : 0
  if (Buffer.byteLength(JSON.stringify(snapshot)) <= SNAPSHOT_BYTE_LIMIT) {
    await doc.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { pk, sk, snapshot, updatedAt: now, ...extra },
      }),
    )
    return
  }

  const shards = splitDecisionShards(snapshot.decisions)
  await doc.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk,
        sk,
        schemaVersion: '1.0',
        eventId,
        sessionEpoch: snapshot.sessionEpoch,
        published: snapshot.published === true,
        detailIndex: snapshot.detailIndex ?? 0,
        savedAt: now,
        storageVersion: 2,
        decisionShardCount: shards.length,
        updatedAt: now,
        ...extra,
      },
    }),
  )
  for (let i = 0; i < shards.length; i += 1) {
    const index = String(i).padStart(4, '0')
    await doc.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { pk, sk: `${sk}#D#${index}`, decisions: shards[i], updatedAt: now },
      }),
    )
  }
  await doc.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { pk, sk: `${sk}#catalog`, catalog: snapshot.catalog ?? {}, updatedAt: now },
    }),
  )
  if (snapshot.ui) {
    await doc.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { pk, sk: `${sk}#ui`, ui: snapshot.ui, updatedAt: now },
      }),
    )
  } else {
    await doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { pk, sk: `${sk}#ui` } }))
  }
  for (let index = shards.length; index < previousCount; index += 1) {
    await doc.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { pk, sk: `${sk}#D#${String(index).padStart(4, '0')}` },
      }),
    )
  }
}

function isRole(value) {
  return ROLES.includes(value)
}

function attr(user, name) {
  return user.Attributes?.find((item) => item.Name === name)?.Value ?? ''
}

async function roleOfUsername(username) {
  const listed = await cognito.send(
    new AdminListGroupsForUserCommand({ UserPoolId: USER_POOL_ID, Username: username }),
  )
  return highestRole((listed.Groups ?? []).map((group) => group.GroupName))
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      out[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return out
}

function publicUser(user, role) {
  const email = attr(user, 'email') || user.Username
  return {
    username: user.Username,
    email,
    role,
    enabled: user.Enabled !== false,
    status: user.UserStatus ?? 'UNKNOWN',
  }
}

async function listUsers() {
  const users = []
  let token
  do {
    const page = await cognito.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Limit: 60,
        PaginationToken: token,
      }),
    )
    users.push(...(page.Users ?? []))
    token = page.PaginationToken
  } while (token && users.length < 300)

  return mapPool(users, 8, async (user) => publicUser(user, await roleOfUsername(user.Username)))
}

async function setUserRole(username, role) {
  for (const group of ROLES) {
    if (group === role) continue
    try {
      await cognito.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          GroupName: group,
        }),
      )
    } catch (err) {
      const name = err?.name ?? ''
      if (name !== 'ResourceNotFoundException' && name !== 'InvalidParameterException') throw err
    }
  }
  await cognito.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      GroupName: role,
    }),
  )
}

function cognitoError(err) {
  if (err?.name === 'UsernameExistsException') {
    return response(409, { error: 'Esa cuenta ya existe' })
  }
  if (err?.name === 'UserNotFoundException') {
    return response(404, { error: 'No se encontró la cuenta' })
  }
  if (err?.name === 'ResourceNotFoundException') {
    return response(503, { error: 'Los niveles todavía no existen en Cognito. Vuelve a desplegar la infraestructura.' })
  }
  if (err?.name === 'InvalidParameterException') {
    return response(400, { error: err.message || 'Datos inválidos' })
  }
  console.error(err)
  return response(500, { error: 'No se pudo completar la operación de cuentas' })
}

async function handleAdmin(event, method) {
  if (!USER_POOL_ID) return response(503, { error: 'User Pool no configurado' })
  if (!isAdmin(event)) return response(403, { error: 'Solo un administrador puede gestionar cuentas' })

  const path = event.rawPath ?? event.path ?? ''
  const username = decodeParam(event.pathParameters?.username || '')
  const isCollection = path === '/admin/users' || /\/admin\/users\/?$/.test(path)

  try {
    if (method === 'GET' && isCollection) {
      const users = await listUsers()
      users.sort((a, b) => a.email.localeCompare(b.email))
      return response(200, { users })
    }

    if (method === 'POST' && isCollection) {
      const body = parseBody(event)
      const email = String(body.email ?? '').trim().toLowerCase()
      const role = body.role ?? 'validador'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return response(400, { error: 'Correo inválido' })
      }
      if (!isRole(role)) return response(400, { error: 'Nivel inválido' })

      await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
          DesiredDeliveryMediums: ['EMAIL'],
        }),
      )
      await setUserRole(email, role)
      return response(201, { ok: true, email, role })
    }

    if (method === 'PATCH' && username) {
      const body = parseBody(event)
      const self = callerEmail(event)
      const touchesSelf = self !== null && username.toLowerCase() === self
      if (body.role !== undefined) {
        if (!isRole(body.role)) return response(400, { error: 'Nivel inválido' })
        if (touchesSelf && body.role !== 'administrador') {
          return response(400, { error: 'No puedes cambiar tu propio nivel' })
        }
        await setUserRole(username, body.role)
      }
      if (body.enabled !== undefined) {
        if (typeof body.enabled !== 'boolean') return response(400, { error: 'Estado inválido' })
        if (touchesSelf && body.enabled === false) {
          return response(400, { error: 'No puedes desactivar tu propia cuenta' })
        }
        const command = body.enabled
          ? new AdminEnableUserCommand({ UserPoolId: USER_POOL_ID, Username: username })
          : new AdminDisableUserCommand({ UserPoolId: USER_POOL_ID, Username: username })
        await cognito.send(command)
      }
      if (body.role === undefined && body.enabled === undefined) {
        return response(400, { error: 'Nada que actualizar' })
      }
      return response(200, { ok: true })
    }

    return response(404, { error: 'Not found' })
  } catch (err) {
    return cognitoError(err)
  }
}

async function handleCanonical(event, method, eventId) {
  if (method !== 'GET') return response(405, { error: 'Method not allowed' })
  const snapshot = await readStoredSession('CANONICAL', eventId)
  if (!snapshot || snapshot.published !== true) return response(404, { error: 'Session not found' })
  return response(200, snapshot)
}

async function syncCanonical(eventId, sub, snapshot, wasPublished, wantsPublish) {
  const key = canonicalKey(eventId)
  if (wantsPublish && !wasPublished) {
    await writeStoredSession('CANONICAL', eventId, snapshot, { publishedBy: sub })
    return
  }

  const current = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: key }))
  const owner = current.Item?.publishedBy
  const owns = !owner || owner === sub
  if (!owns) return

  if (wantsPublish && wasPublished) {
    await writeStoredSession('CANONICAL', eventId, snapshot, { publishedBy: owner || sub })
    return
  }

  if (!wantsPublish && wasPublished && current.Item?.snapshot) {
    const hidden = { ...current.Item.snapshot, published: false, savedAt: snapshot.savedAt }
    await doc.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...key, snapshot: hidden, updatedAt: snapshot.savedAt, publishedBy: owner || sub },
      }),
    )
    return
  }

  if (!wantsPublish && wasPublished && current.Item) {
    await doc.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...current.Item,
          published: false,
          savedAt: snapshot.savedAt,
          updatedAt: snapshot.savedAt,
        },
      }),
    )
  }
}

async function handleSession(event, method, eventId, sub) {
  const key = userKey(sub, eventId)

  if (method === 'GET') {
    const snapshot = await readStoredSession(key.pk, eventId)
    if (!snapshot?.sessionEpoch) return response(404, { error: 'Session not found' })
    return response(200, snapshot)
  }

  if (method === 'PUT') {
    const snapshot = parseBody(event)
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return response(400, { error: 'Invalid snapshot' })
    }
    if (snapshot.eventId && snapshot.eventId !== eventId) {
      return response(400, { error: 'eventId mismatch' })
    }
    const wantsPublish = snapshot.published === true
    if (wantsPublish && !isAdmin(event)) {
      return response(403, { error: 'Solo un administrador puede publicar' })
    }

    const previous = await readStoredSession(key.pk, eventId)
    const wasPublished = previous?.published === true

    snapshot.eventId = eventId
    snapshot.published = wantsPublish
    snapshot.savedAt = new Date().toISOString()
    if (wantsPublish) {
      const email = callerEmail(event)
      if (email) snapshot.publishedBy = email
    }

    await writeStoredSession(key.pk, eventId, snapshot, { userSub: sub })

    if (isAdmin(event)) {
      await syncCanonical(eventId, sub, snapshot, wasPublished, wantsPublish)
    }

    return response(200, { ok: true, savedAt: snapshot.savedAt })
  }

  if (method === 'DELETE') {
    const main = await getItem(key.pk, key.sk)
    const count = Number.isFinite(Number(main?.decisionShardCount)) ? Number(main.decisionShardCount) : 0
    const keys = [key.sk, `${key.sk}#catalog`, `${key.sk}#ui`]
    for (let index = 0; index < count; index += 1) {
      keys.push(`${key.sk}#D#${String(index).padStart(4, '0')}`)
    }
    for (const sk of keys) {
      await doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: key.pk, sk } }))
    }
    return response(200, { ok: true })
  }

  return response(405, { error: 'Method not allowed' })
}

export async function handler(event) {
  const method = event.requestContext?.http?.method ?? event.httpMethod
  if (method === 'OPTIONS') return response(204, '')

  const sub = userSub(event)
  if (!sub) return response(401, { error: 'Unauthorized' })

  const path = event.rawPath ?? event.path ?? ''
  if (path.startsWith('/admin/')) return handleAdmin(event, method)

  const eventId = decodeParam(event.pathParameters?.eventId || '')
  if (!eventId) return response(404, { error: 'Not found' })

  try {
    if (path.endsWith('/canonical')) return await handleCanonical(event, method, eventId)
    return await handleSession(event, method, eventId, sub)
  } catch (err) {
    console.error(err)
    return response(500, { error: 'Internal server error' })
  }
}
