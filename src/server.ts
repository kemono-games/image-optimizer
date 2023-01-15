import http from 'node:http'

import { imageRouter } from './routes/image'

const server = http.createServer(async (req, res) => {
  const { method, url } = req

  if (method === 'HEAD' && url === '/health') {
    return res.end('OK')
  }

  if (method === 'GET' && url.startsWith('/image')) {
    imageRouter(req, res)
    return
  }

  res.writeHead(405)
  return res.end('Method not allowed')
})

server.listen(process.env.PORT || 3100)
