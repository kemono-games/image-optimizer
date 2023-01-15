require('dotenv').config()
import http from 'node:http'

// Create a local server to receive data from
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      data: 'Hello World!',
    }),
  )
})

server.listen(process.env.PORT || '3100')
