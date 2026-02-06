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
  ctChestModelDir: process.env.CT_CHEST_MODEL_DIR,
  // Segmentation configuration
  segmentationEnabled: process.env.SEGMENTATION_ENABLED === 'true',
  xraySegModelDir: process.env.XRAY_SEG_MODEL_DIR,
  mriBrainSegModelDir: process.env.MRI_BRAIN_SEG_MODEL_DIR,
  ctChestSegModelDir: process.env.CT_CHEST_SEG_MODEL_DIR,
  mriSpineSegModelDir: process.env.MRI_SPINE_SEG_MODEL_DIR,
  mriKneeSegModelDir: process.env.MRI_KNEE_SEG_MODEL_DIR,
  skinSegModelDir: process.env.SKIN_SEG_MODEL_DIR,
  // Explainability configuration
  explainEnabled: process.env.EXPLAIN_ENABLED === 'true',
  defaultCamLayerName: process.env.DEFAULT_CAM_LAYER_NAME
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




