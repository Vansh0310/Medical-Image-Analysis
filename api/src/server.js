import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { env } from './config/env.js'
import { connectToMongo } from './db/mongo.js'
import authRoutes from './routes/auth.js'
import uploadRoutes from './routes/upload.js'
import mlRoutes from './routes/ml.js'
import examRoutes from './routes/exams.js'
import reportRoutes from './routes/reports.js'

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Ensure folders exist on boot
// Determine if running from api/ directory or project root
const isRunningFromApiDir = __dirname.includes('api' + path.sep + 'src') || process.cwd().endsWith('api') || process.cwd().endsWith('api\\')
const baseDir = isRunningFromApiDir ? process.cwd() : path.resolve(process.cwd(), 'api')

const uploadsDir = path.resolve(baseDir, 'uploads')
const outputsDir = path.resolve(baseDir, 'outputs')
const masksDir = path.resolve(baseDir, 'outputs', 'masks')
const overlaysDir = path.resolve(baseDir, 'outputs', 'overlays')
const camDir = path.resolve(baseDir, 'outputs', 'cam')
env.ensureDir(uploadsDir)
env.ensureDir(env.modelDir)
env.ensureDir(outputsDir)
env.ensureDir(masksDir)
env.ensureDir(overlaysDir)
env.ensureDir(camDir)

const app = express()

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))
app.use(express.json())
app.use(morgan('dev'))

// Serve static files for outputs (masks and overlays)
app.use('/api/outputs', express.static(outputsDir))

// Serve static files for uploads (uploaded images)
app.use('/uploads', express.static(uploadsDir))

app.get('/healthz', (req, res) => {
  res.json({ ok: true })
})

// Test endpoint
app.post('/test', (req, res) => {
  console.log('Test endpoint called')
  res.json({ success: true, message: 'Test endpoint working' })
})

// Test predict endpoint without auth
app.post('/test-predict', async (req, res) => {
  try {
    console.log('Test predict endpoint called')
    
    // Test model loading
    const { loadModel } = await import('./ml/model.js')
    console.log('Loading model...')
    await loadModel()
    console.log('Model loaded successfully')
    
    res.json({ success: true, message: 'Test predict working' })
  } catch (error) {
    console.error('Test predict error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Routes
app.use('/auth', authRoutes)
app.use('/upload', uploadRoutes)
app.use('/ml', mlRoutes)
app.use('/exams', examRoutes)
app.use('/reports', reportRoutes)

// 404 handler (after routes)
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' })
})

async function start() {
  await connectToMongo()
  app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`)
  })
}

start().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})


