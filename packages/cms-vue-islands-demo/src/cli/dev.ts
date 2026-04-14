import { startPreviewServer } from '../preview/preview-server'

const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 4311
const server = startPreviewServer({ port })

console.log(`CMS Vue islands demo preview server running at ${server.url}`)
