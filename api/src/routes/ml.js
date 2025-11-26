import { Router } from 'express'
import { predictFromBuffer, loadModelForModality, getModelInfo } from '../ml/model.js'
import { applyRules } from '../rules/engine.js'
import { auth } from '../auth/index.js'
import { uploadSingle, handleUploadError } from '../middleware/upload.js'

const router = Router()

// Get model status (public endpoint for debugging)
router.get('/status', (req, res) => {
  try {
    const info = getModelInfo()
    res.json(info)
  } catch (err) {
    res.status(500).json({ error: 'Failed to get model status' })
  }
})

// Get model info (protected endpoint)
router.get('/info', auth(), (req, res) => {
  try {
    const info = getModelInfo()
    res.json(info)
  } catch (err) {
    res.status(500).json({ error: 'Failed to get model info' })
  }
})

// Load model endpoint
router.post('/load', auth(), async (req, res) => {
  try {
    const { modality } = req.body
    if (!modality) {
      return res.status(400).json({ error: 'Modality is required' })
    }
    await loadModelForModality(modality)
    res.json({ success: true, message: `${modality} model loaded successfully` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Predict from uploaded image
router.post('/predict', auth(), uploadSingle, handleUploadError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded. Use "image" as the field name.' })
    }

    // Read file buffer
    const fs = await import('fs')
    const buffer = fs.readFileSync(req.file.path)

    // Run prediction
    const prediction = await predictFromBuffer(buffer)

    // Apply rules engine if questionnaire provided
    const questionnaire = req.body.questionnaire ? JSON.parse(req.body.questionnaire) : null
    const rulesResult = applyRules({ top1: prediction.top1, q: questionnaire })

    res.json({
      success: true,
      prediction: {
        top1: prediction.top1,
        topK: prediction.topK
      },
      rules: rulesResult,
      file: {
        originalName: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size
      }
    })

  } catch (err) {
    console.error('Prediction route error:', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
