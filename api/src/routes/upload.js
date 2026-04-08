import { Router } from 'express'
import { uploadSingle, handleUploadError } from '../middleware/upload.js'
import { auth } from '../auth/index.js'

const router = Router()

// Test upload route (protected)
router.post('/test', auth(), uploadSingle, handleUploadError, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use "image" as the field name.' })
    }
    
    res.json({
      success: true,
      file: {
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    })
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' })
  }
})

export default router
