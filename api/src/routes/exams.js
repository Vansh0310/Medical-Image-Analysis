import { Router } from 'express'
import { Exam } from '../models/Exam.js'
import { Report } from '../models/Report.js'
import { predictFromFile, loadModelForModality } from '../ml/model.js'
import { detectModalityFromFile } from '../ml/modalityDetector.js'
import { applyRules } from '../rules/engine.js'
import { auth } from '../auth/index.js'
import { uploadSingle, handleUploadError } from '../middleware/upload.js'
import { isModalitySupported, MODEL_REGISTRY } from '../ml/registry.js'
import fs from 'fs'
import path from 'path'

const router = Router()

// All routes require authentication
router.use(auth())

// Create new exam with image upload
router.post('/', uploadSingle, handleUploadError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded. Use "image" as the field name.' })
    }

    const { modality } = req.body
    if (!modality) {
      return res.status(400).json({ error: 'Modality is required' })
    }

    const supportedModalities = Object.keys(MODEL_REGISTRY)
    const isValidModality = modality === 'AUTO' || isModalitySupported(modality)
    if (!isValidModality) {
      return res.status(400).json({ 
        error: `Unsupported modality: ${modality}. Use 'AUTO' or one of: ${supportedModalities.join(', ')}` 
      })
    }

    // Create exam record
    const exam = await Exam.create({
      patientId: req.user.id,
      modality,
      imagePath: req.file.path
    })

    res.status(201).json({ examId: exam._id.toString() })

  } catch (err) {
    console.error('Create exam error:', err)
    res.status(500).json({ error: 'Failed to create exam' })
  }
})

// Add questionnaire to exam
router.post('/:id/questionnaire', async (req, res) => {
  try {
    const { id } = req.params
    const { fever, cough, duration_days, age, history } = req.body

    // Validate required fields
    if (fever === undefined || cough === undefined || duration_days === undefined) {
      return res.status(400).json({ error: 'fever, cough, and duration_days are required' })
    }

    // Find exam owned by user
    const exam = await Exam.findOne({ _id: id, patientId: req.user.id })
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' })
    }

    // Update questionnaire
    exam.questionnaire = {
      fever: fever === 'yes' || fever === true,
      cough: cough === 'yes' || cough === true,
      duration_days: parseInt(duration_days),
      age: age ? parseInt(age) : undefined,
      history: history || undefined
    }

    await exam.save()

    res.json({ success: true, questionnaire: exam.questionnaire })

  } catch (err) {
    console.error('Questionnaire error:', err)
    res.status(500).json({ error: 'Failed to save questionnaire' })
  }
})

// Run prediction on exam
router.post('/:id/predict', async (req, res) => {
  try {
    const { id } = req.params

    // Find exam owned by user
    console.log('Looking for exam with ID:', id, 'and patientId:', req.user.id)
    const exam = await Exam.findOne({ _id: id, patientId: req.user.id })
    if (!exam) {
      console.log('Exam not found')
      return res.status(404).json({ error: 'Exam not found' })
    }

    console.log('Exam found:', exam)
    console.log('Exam imagePath:', exam.imagePath)
    console.log('Exam modality:', exam.modality)

    if (!exam.imagePath) {
      console.log('No image path found for exam')
      return res.status(400).json({ error: 'No image found for this exam' })
    }

    let detectedModality

    // Stage 1: Detect modality if not specified or set to AUTO
    if (!exam.modality || exam.modality === 'AUTO') {
      console.log('Stage 1: Detecting modality...')
      const modalityDetection = await detectModalityFromFile(exam.imagePath)
      detectedModality = modalityDetection.top1.label
      console.log('Detected modality:', detectedModality, 'confidence:', modalityDetection.top1.score)
      
      // Update exam with detected modality
      exam.detectedModality = detectedModality
      await exam.save()
    } else {
      // Use manually specified modality
      detectedModality = exam.modality
      console.log('Using manually specified modality:', detectedModality)
    }

    // Check if detected modality is supported
    if (!isModalitySupported(detectedModality)) {
      const errorMsg = `Unsupported modality detected: ${detectedModality}. Supported modalities: ${Object.keys(MODEL_REGISTRY).join(', ')}`
      console.error(errorMsg)
      return res.status(400).json({ error: errorMsg })
    }

    // Stage 2: Run disease classifier for the detected modality
    console.log('Stage 2: Running disease classification for', detectedModality)
    const prediction = await predictFromFile(exam.imagePath, detectedModality)
    console.log('Disease prediction completed:', prediction)

    // Apply rules engine
    const rulesResult = applyRules({ 
      top1: prediction.top1, 
      q: exam.questionnaire,
      modality: detectedModality
    })

    // Update exam with results
    exam.cnn = {
      model: { name: `${detectedModality.toLowerCase()}_v1`, version: '1.0' },
      top1: prediction.top1,
      topK: prediction.topK
    }
    exam.rules = rulesResult
    exam.detectedModality = detectedModality
    await exam.save()

    // Create report
    const report = await Report.create({
      examId: exam._id,
      json: {
        detectedModality: detectedModality,
        top1: prediction.top1,
        topK: prediction.topK,
        rules: rulesResult,
        ts: new Date().toISOString()
      }
    })

    res.json({
      detectedModality: detectedModality,
      top1: prediction.top1,
      topK: prediction.topK,
      rules: rulesResult,
      reportId: report._id.toString()
    })

  } catch (err) {
    console.error('Prediction error:', err)
    console.error('Error stack:', err.stack)
    res.status(500).json({ error: err.message || 'Failed to run prediction' })
  }
})

// List user's exams
router.get('/', async (req, res) => {
  try {
    const exams = await Exam.find({ patientId: req.user.id })
      .sort({ createdAt: -1 })
      .select('_id createdAt modality cnn.rules.diagnosis')

    const summary = exams.map(exam => ({
      id: exam._id.toString(),
      date: exam.createdAt,
      modality: exam.modality,
      diagnosis: exam.cnn?.rules?.diagnosis || null
    }))

    res.json({ exams: summary })

  } catch (err) {
    console.error('List exams error:', err)
    res.status(500).json({ error: 'Failed to list exams' })
  }
})

// Get specific exam
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const exam = await Exam.findOne({ _id: id, patientId: req.user.id })
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' })
    }

    // Convert to safe format (exclude sensitive data)
    const safeExam = {
      id: exam._id.toString(),
      modality: exam.modality,
      questionnaire: exam.questionnaire,
      cnn: exam.cnn,
      rules: exam.rules,
      createdAt: exam.createdAt
    }

    res.json({ exam: safeExam })

  } catch (err) {
    console.error('Get exam error:', err)
    res.status(500).json({ error: 'Failed to get exam' })
  }
})

export default router
