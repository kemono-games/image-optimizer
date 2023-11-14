import axios from 'axios'

import pkg from '../../../package.json'

const http = axios.create({
  headers: {
    'User-Agent': `Image Optimizer/${pkg.version}}`,
    'Accept-Encoding': 'br;q=1.0, gzip;q=0.8, *;q=0.1',
  },
  responseType: 'arraybuffer',
  timeout: 10000,
})

export default http
