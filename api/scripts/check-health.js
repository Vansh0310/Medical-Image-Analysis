import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import fs from 'fs'

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') })

console.log('=== MediScan AI Health Check ===\n')

// Check environment variables
console.log('1. Checking environment variables...')
const requiredVars = ['PORT', 'MONGO_URI', 'JWT_SECRET', 'MODEL_DIR']
const missing = requiredVars.filter((k) => !process.env[k] || String(process.env[k]).trim() === '')
if (missing.length > 0) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`)
  process.exit(1)
} else {
  console.log('✅ All required environment variables are set')
  console.log(`   PORT: ${process.env.PORT}`)
  console.log(`   MONGO_URI: ${process.env.MONGO_URI ? 'Set' : 'Missing'}`)
  console.log(`   JWT_SECRET: ${process.env.JWT_SECRET ? 'Set' : 'Missing'}`)
  console.log(`   MODEL_DIR: ${process.env.MODEL_DIR}`)
}

// Check if .env file exists
console.log('\n2. Checking .env file...')
const envPath = path.resolve(__dirname, '../.env')
if (fs.existsSync(envPath)) {
  console.log('✅ .env file exists')
} else {
  console.error('❌ .env file not found at:', envPath)
  process.exit(1)
}

// Check if model directory exists
console.log('\n3. Checking model directory...')
const modelDir = process.env.MODEL_DIR
if (modelDir && fs.existsSync(modelDir)) {
  console.log(`✅ Model directory exists: ${modelDir}`)
} else {
  console.warn(`⚠️  Model directory not found: ${modelDir}`)
  console.warn('   This might cause issues when loading models')
}

// Check if required directories exist
console.log('\n4. Checking required directories...')
const dirs = [
  path.resolve('uploads'),
  path.resolve('api', 'outputs'),
  path.resolve('api', 'outputs', 'masks'),
  path.resolve('api', 'outputs', 'overlays'),
  path.resolve('api', 'outputs', 'cam')
]

dirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`✅ ${dir}`)
  } else {
    console.log(`⚠️  ${dir} (will be created on startup)`)
  }
})

// Check if key files exist
console.log('\n5. Checking key files...')
const keyFiles = [
  'src/server.js',
  'src/routes/auth.js',
  'src/routes/exams.js',
  'src/models/User.js',
  'src/models/Exam.js',
  'src/config/env.js',
  'src/db/mongo.js'
]

keyFiles.forEach(file => {
  const filePath = path.resolve(__dirname, '..', file)
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`)
  } else {
    console.error(`❌ ${file} - MISSING!`)
  }
})

// Check for syntax errors in main files
console.log('\n6. Checking for syntax errors...')
try {
  await import('../src/config/env.js')
  console.log('✅ env.js - OK')
} catch (err) {
  console.error('❌ env.js - Syntax error:', err.message)
}

try {
  await import('../src/db/mongo.js')
  console.log('✅ mongo.js - OK')
} catch (err) {
  console.error('❌ mongo.js - Syntax error:', err.message)
}

try {
  await import('../src/routes/auth.js')
  console.log('✅ auth.js - OK')
} catch (err) {
  console.error('❌ auth.js - Syntax error:', err.message)
}

try {
  await import('../src/routes/exams.js')
  console.log('✅ exams.js - OK')
} catch (err) {
  console.error('❌ exams.js - Syntax error:', err.message)
  console.error('   Error details:', err.stack)
}

console.log('\n=== Health Check Complete ===')
console.log('\nIf all checks passed, try starting the server:')
console.log('  npm run dev')
