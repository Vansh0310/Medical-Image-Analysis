import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const requiredVars = ['PORT', 'MONGO_URI', 'JWT_SECRET', 'MODEL_DIR']
const missing = requiredVars.filter((k) => !process.env[k] || String(process.env[k]).trim() === '')
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
}

const config = {
  port: parseInt(process.env.PORT, 10) || 8080,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  modelDir: process.env.MODEL_DIR,
  // Model directory overrides
  xrayChestModelDir: process.env.XRAY_CHEST_MODEL_DIR,
  mriBrainModelDir: process.env.MRI_BRAIN_MODEL_DIR,
  mriSpineModelDir: process.env.MRI_SPINE_MODEL_DIR,
  mriKneeModelDir: process.env.MRI_KNEE_MODEL_DIR,
  skinModelDir: process.env.SKIN_MODEL_DIR,
  ctChestModelDir: process.env.CT_CHEST_MODEL_DIR
}

// Ensure required directories exist
const ensureDir = (dirPath) => {
  const resolved = path.resolve(dirPath)
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true })
  }
  return resolved
}

export const env = {
  ...config,
  ensureDir
}




