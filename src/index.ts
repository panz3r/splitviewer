import { Hono } from 'hono'
import { auth } from './auth'
import { shares } from './shares'
import { dashboard } from './dashboard'

const app = new Hono().basePath('/')

app.route('/', auth)
app.route('/', shares)
app.route('/', dashboard)

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

export default app
