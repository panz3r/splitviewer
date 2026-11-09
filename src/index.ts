import { Hono } from 'hono'
import { auth } from './auth'

const app = new Hono().basePath('/')

app.route('/', auth)

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

export default app
