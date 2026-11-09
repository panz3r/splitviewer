import { Hono } from 'hono'
import { auth } from './auth'
import { shares } from './shares'
import { dashboard } from './dashboard'
import { publicView } from './public'
import { getSessionUserId } from './lib/session'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

app.route('/', auth)
app.route('/', shares)
app.route('/', dashboard)
app.route('/', publicView)

app.get('/', async (c) => {
  const userId = await getSessionUserId(c)
  if (userId) {
    // Authenticated users should never see the landing page again.
    return c.redirect('/dashboard', 302)
  }
  return c.html(
    <html>
      <head>
        <title>SplitViewer</title>
        <style>{`body { font-family: system-ui, sans-serif; max-width: 30rem; margin: 6rem auto; padding: 0 1rem; color: #1a1a1a; }
          h1 { font-size: 1.6rem; } a.btn { display: inline-block; background: #1a5c25; color: #fff; padding: .55rem 1rem; border-radius: 6px; text-decoration: none; }`}</style>
      </head>
      <body>
        <h1>SplitViewer</h1>
        <p>Shareable public dashboards for your Splitwise groups.</p>
        <p><a class="btn" href="/auth/login">Continue with Splitwise</a></p>
      </body>
    </html>,
  )
})

export default app
