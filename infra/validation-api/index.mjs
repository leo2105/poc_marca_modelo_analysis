import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

const TABLE_NAME = process.env.TABLE_NAME
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  }
}

function userSub(event) {
  return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null
}

function eventIdFromPath(path) {
  const match = path.match(/^\/sessions\/([^/]+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

function keys(sub, eventId) {
  return { pk: `USER#${sub}`, sk: `EVENT#${eventId}` }
}

export async function handler(event) {
  const method = event.requestContext?.http?.method ?? event.httpMethod
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  const sub = userSub(event)
  if (!sub) return response(401, { error: 'Unauthorized' })

  const path = event.rawPath ?? event.path ?? ''
  const eventId = eventIdFromPath(path)
  if (!eventId) return response(404, { error: 'Not found' })

  const key = keys(sub, eventId)

  try {
    if (method === 'GET') {
      const item = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: key }))
      if (!item.Item?.snapshot) return response(404, { error: 'Session not found' })
      return response(200, item.Item.snapshot)
    }

    if (method === 'PUT') {
      const raw = event.body ?? '{}'
      const snapshot = JSON.parse(event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw)
      if (!snapshot || typeof snapshot !== 'object') {
        return response(400, { error: 'Invalid snapshot' })
      }
      if (snapshot.eventId && snapshot.eventId !== eventId) {
        return response(400, { error: 'eventId mismatch' })
      }
      snapshot.eventId = eventId
      snapshot.savedAt = new Date().toISOString()

      await doc.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            ...key,
            snapshot,
            updatedAt: snapshot.savedAt,
            userSub: sub,
          },
        }),
      )
      return response(200, { ok: true, savedAt: snapshot.savedAt })
    }

    if (method === 'DELETE') {
      await doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: key }))
      return response(200, { ok: true })
    }

    return response(405, { error: 'Method not allowed' })
  } catch (err) {
    console.error(err)
    return response(500, { error: 'Internal server error' })
  }
}
