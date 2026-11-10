import { Hono } from 'hono'
import { auth } from './auth'
import { homeRoutes } from './home'
import { shares } from './shares'
import { dashboard } from './dashboard'
import { publicView } from './public'
import { ogImage } from './og'
import { getSessionUserId } from './lib/session'
import { ipRateLimit } from './lib/ratelimit'
import { supportRoutes } from './support'
import { exampleCard } from './example-card'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

// Public-route hardening must be registered BEFORE the route handlers
// (Hono composes in registration order; later uses are dead code).
app.use('/p/*', ipRateLimit('public-page', 60))
app.use('/p/*/og.png', ipRateLimit('og-image', 30))

app.route('/', auth)
app.route('/', homeRoutes)
app.route('/', shares)
app.route('/', dashboard)
app.route('/', publicView)
app.route('/', ogImage)
app.route('/', exampleCard)
app.route('/', supportRoutes)

// Crawler hygiene: public dashboards are the feature; everything else off-limits.
app.get('/robots.txt', (c) => {
  return c.text(
    [
      'User-agent: *',
      'Allow: /p/',
      'Disallow: /auth',
      'Disallow: /dashboard',
      'Disallow: /api',
      '',
    ].join('\n'),
  )
})

export default app
