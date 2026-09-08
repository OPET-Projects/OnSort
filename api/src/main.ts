import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono().get('/api/health', (c) => c.json({ status: 'ok' }))

export type AppType = typeof app

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port })
