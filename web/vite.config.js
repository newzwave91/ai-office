import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerOfficeApi } from '../server/office-api.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// dev 서버에 오피스 API를 붙인다. prod(Electron 독립 서버)와 동일한 registerOfficeApi를 공유.
function officeApi() {
  return {
    name: 'office-api',
    configureServer(server) {
      registerOfficeApi(server.middlewares, ROOT)
    }
  }
}

export default defineConfig({
  plugins: [react(), officeApi()],
  server: { host: '127.0.0.1', allowedHosts: ['.ts.net'] }
})
