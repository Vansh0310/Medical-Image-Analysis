import { Router } from 'express'
import { Exam } from '../models/Exam.js'
import { Report } from '../models/Report.js'
import { Feedback } from '../models/Feedback.js'
import { Annotation } from '../models/Annotation.js'
import { predictFromFile, loadModelForModality } from '../ml/model.js'
import { detectModalityFromFile } from '../ml/modalityDetector.js'
import { applyRules } from '../rules/engine.js'
import { auth } from '../auth/index.js'
import { uploadSingle, handleUploadError } from '../middleware/upload.js'
import { isModalitySupported, MODEL_REGISTRY } from '../ml/registry.js'
import { runSegmentationFromFile, isSegmentationEnabled, isModalitySupportedForSegmentation } from '../ml/segmentation/unetSegmenter.js'
import { gradCAMFromFile, isExplainabilityEnabled } from '../ml/explainability/gradcam.js'
import fs from 'fs'
import path from 'path'

const router = Router()

// Log all requests to exams routes
router.use((req, res, next) => {
  console.log(`[EXAMS ROUTER] ${req.method} ${req.path}`)
  console.log(`[EXAMS ROUTER] Params:`, req.params)
  console.log(`[EXAMS ROUTER] Query:`, req.query)
  next()
})

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
      console.log('Detected modality:', detectedModality, 'score:', modalityDetection.top1.score)
      
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

    // Create report - include existing segmentation and explainability if available
    const reportJson = {
      detectedModality: detectedModality,
      top1: prediction.top1,
      topK: prediction.topK,
      rules: rulesResult,
      ts: new Date().toISOString()
    }

    // Include segmentation if it exists
    if (exam.segmentation) {
      reportJson.segmentation = {
        maskPath: exam.segmentation.maskPath,
        overlayPath: exam.segmentation.overlayPath,
        coverage: exam.segmentation.coverage
      }
    }

    // Include explainability if it exists
    if (exam.explainability) {
      reportJson.explainability = {
        classUsed: exam.explainability.classUsed,
        heatmapPath: exam.explainability.heatmapPath,
        overlayPath: exam.explainability.overlayPath,
        method: exam.explainability.method,
        layerName: exam.explainability.layerName
      }
    }

    const report = await Report.create({
      examId: exam._id,
      json: reportJson
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
      imagePath: exam.imagePath,
      questionnaire: exam.questionnaire,
      cnn: exam.cnn,
      rules: exam.rules,
      segmentation: exam.segmentation,
      explainability: exam.explainability,
      createdAt: exam.createdAt
    }

    res.json({ exam: safeExam })

  } catch (err) {
    console.error('Get exam error:', err)
    res.status(500).json({ error: 'Failed to get exam' })
  }
})

// Run explainability analysis on exam
router.post('/:id/explain', async (req, res) => {
  try {
    const { id } = req.params
    const { label, classIndex, layerName } = req.body

    // Check if explainability is enabled
    if (!isExplainabilityEnabled()) {
      return res.status(400).json({ error: 'Explainability is not enabled. Set EXPLAIN_ENABLED=true in .env' })
    }

    // Find exam owned by user
    const exam = await Exam.findOne({ _id: id, patientId: req.user.id })
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' })
    }

    if (!exam.imagePath) {
      return res.status(400).json({ error: 'No image found for this exam' })
    }

    // Determine modality
    const modality = exam.detectedModality || exam.modality
    
    if (!modality || modality === 'AUTO') {
      return res.status(400).json({ error: 'Modality must be detected or specified before explainability analysis' })
    }

    // Determine class to explain
    let classToExplain = label || classIndex
    
    // If not provided, use top1 from prediction
    if (!classToExplain && exam.cnn && exam.cnn.top1) {
      classToExplain = exam.cnn.top1.label
    } else if (!classToExplain) {
      return res.status(400).json({ error: 'No prediction found. Run prediction first or specify label/classIndex in request body' })
    }

    console.log(`Running explainability for exam ${id}, modality: ${modality}, class: ${classToExplain}`)
    
    // Run GradCAM
    const explainResult = await gradCAMFromFile(
      exam.imagePath,
      modality,
      classToExplain,
      { layerName },
      exam._id.toString()
    )

    // Update exam with explainability results
    exam.explainability = {
      classUsed: explainResult.classUsed,
      heatmapPath: explainResult.heatmapPath,
      overlayPath: explainResult.overlayPath,
      method: explainResult.method,
      layerName: explainResult.layerName
    }
    await exam.save()

    // Update report if it exists, preserving existing data
    let report = await Report.findOne({ examId: exam._id })
    if (report) {
      // Update existing report, preserve other fields
      report.json.explainability = {
        classUsed: explainResult.classUsed,
        heatmapPath: explainResult.heatmapPath,
        overlayPath: explainResult.overlayPath,
        method: explainResult.method,
        layerName: explainResult.layerName,
        ts: new Date().toISOString()
      }
      // Mark json field as modified for Mongoose to detect the change
      report.markModified('json')
      await report.save()
    } else {
      // Create new report snapshot - include prediction data if available
      const reportJson = {
        explainability: {
          classUsed: explainResult.classUsed,
          heatmapPath: explainResult.heatmapPath,
          overlayPath: explainResult.overlayPath,
          method: explainResult.method,
          layerName: explainResult.layerName,
          ts: new Date().toISOString()
        }
      }
      
      // Include prediction data if it exists
      if (exam.cnn && exam.rules) {
        reportJson.detectedModality = exam.detectedModality
        reportJson.top1 = exam.cnn.top1
        reportJson.topK = exam.cnn.topK
        reportJson.rules = exam.rules
        reportJson.ts = new Date().toISOString()
      }
      
      // Include segmentation if it exists
      if (exam.segmentation) {
        reportJson.segmentation = {
          maskPath: exam.segmentation.maskPath,
          overlayPath: exam.segmentation.overlayPath,
          coverage: exam.segmentation.coverage
        }
      }
      
      report = await Report.create({
        examId: exam._id,
        json: reportJson
      })
    }

    res.json({
      classUsed: explainResult.classUsed,
      heatmapPath: explainResult.heatmapPath,
      overlayPath: explainResult.overlayPath,
      method: explainResult.method,
      layerName: explainResult.layerName
    })

  } catch (err) {
    console.error('Explainability error:', err)
    console.error('Error stack:', err.stack)
    res.status(500).json({ error: err.message || 'Failed to run explainability analysis' })
  }
})

// Run segmentation on exam
router.post('/:id/segment', async (req, res) => {
  console.log(`[SEGMENTATION ROUTE] POST /exams/:id/segment called`)
  console.log(`[SEGMENTATION ROUTE] Request params:`, req.params)
  console.log(`[SEGMENTATION ROUTE] User ID:`, req.user?.id)
  
  try {
    const { id } = req.params
    console.log(`[SEGMENTATION ROUTE] Processing exam ID: ${id}`)

    // Check if segmentation is enabled
    console.log(`[SEGMENTATION ROUTE] Checking if segmentation is enabled...`)
    if (!isSegmentationEnabled()) {
      console.log(`[SEGMENTATION ROUTE] Segmentation is NOT enabled`)
      return res.status(400).json({ error: 'Segmentation is not enabled. Set SEGMENTATION_ENABLED=true in .env' })
    }
    console.log(`[SEGMENTATION ROUTE] Segmentation is enabled`)

    // Find exam owned by user
    const exam = await Exam.findOne({ _id: id, patientId: req.user.id })
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' })
    }

    if (!exam.imagePath) {
      return res.status(400).json({ error: 'No image found for this exam' })
    }

    // Determine modality (use detectedModality if available, otherwise use modality)
    const modality = exam.detectedModality || exam.modality
    
    if (!modality || modality === 'AUTO') {
      return res.status(400).json({ error: 'Modality must be detected or specified before segmentation' })
    }

    // Check if modality supports segmentation
    if (!isModalitySupportedForSegmentation(modality)) {
      return res.status(400).json({ 
        error: `Segmentation not supported for modality: ${modality}. Supported modalities: XRAY_CHEST, MRI_BRAIN` 
      })
    }

    console.log(`[ROUTE] Running segmentation for exam ${id}, modality: ${modality}`)
    console.log(`[ROUTE] Image path: ${exam.imagePath}`)
    
    // Run segmentation with timeout
    console.log(`[ROUTE] Calling runSegmentationFromFile...`)
    const segmentationResult = await Promise.race([
      runSegmentationFromFile(
        exam.imagePath, 
        modality, 
        exam._id.toString()
      ),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Segmentation timeout after 60 seconds')), 60000)
      )
    ])
    console.log(`[ROUTE] Segmentation completed successfully`)

    // Update exam with segmentation results
    exam.segmentation = {
      maskPath: segmentationResult.maskPath,
      overlayPath: segmentationResult.overlayPath,
      coverage: segmentationResult.coverage
    }
    await exam.save()

    // Update report if it exists, preserving existing data
    let report = await Report.findOne({ examId: exam._id })
    if (report) {
      // Update existing report, preserve other fields
      report.json.segmentation = {
        maskPath: segmentationResult.maskPath,
        overlayPath: segmentationResult.overlayPath,
        coverage: segmentationResult.coverage,
        ts: new Date().toISOString()
      }
      // Mark json field as modified for Mongoose to detect the change
      report.markModified('json')
      await report.save()
      console.log('[ROUTE] Report updated with segmentation:', JSON.stringify(report.json.segmentation))
      
      // Verify the save worked by re-fetching
      const verifyReport = await Report.findOne({ examId: exam._id })
      console.log('[ROUTE] Verified report after save - segmentation:', verifyReport?.json?.segmentation ? 'EXISTS' : 'MISSING')
    } else {
      // Create new report snapshot - include prediction data if available
      const reportJson = {
        segmentation: {
          maskPath: segmentationResult.maskPath,
          overlayPath: segmentationResult.overlayPath,
          coverage: segmentationResult.coverage,
          ts: new Date().toISOString()
        }
      }
      
      // Include prediction data if it exists
      if (exam.cnn && exam.rules) {
        reportJson.detectedModality = exam.detectedModality
        reportJson.top1 = exam.cnn.top1
        reportJson.topK = exam.cnn.topK
        reportJson.rules = exam.rules
        reportJson.ts = new Date().toISOString()
      }
      
      // Include explainability if it exists
      if (exam.explainability) {
        reportJson.explainability = {
          classUsed: exam.explainability.classUsed,
          heatmapPath: exam.explainability.heatmapPath,
          overlayPath: exam.explainability.overlayPath,
          method: exam.explainability.method,
          layerName: exam.explainability.layerName
        }
      }
      
      report = await Report.create({
        examId: exam._id,
        json: reportJson
      })
      console.log('[ROUTE] New report created with segmentation:', JSON.stringify(report.json.segmentation))
      console.log('[ROUTE] Report ID:', report._id.toString())
      console.log('[ROUTE] Exam ID:', exam._id.toString())
    }

    res.json({
      maskPath: segmentationResult.maskPath,
      overlayPath: segmentationResult.overlayPath,
      coverage: segmentationResult.coverage
    })

  } catch (err) {
    console.error('Segmentation error:', err)
    console.error('Error message:', err.message)
    console.error('Error stack:', err.stack)
    const errorMessage = err.message || 'Failed to run segmentation'
    res.status(500).json({ error: errorMessage })
  }
})

// Submit feedback for an exam
router.post('/:id/feedback', async (req, res) => {
  try {
    const { id } = req.params
    const { finalLabel, correctness, notes, consentForTraining } = req.body

    // Validate required fields
    if (!finalLabel || !correctness) {
      return res.status(400).json({ error: 'finalLabel and correctness are required' })
    }

    if (correctness !== 'correct' && correctness !== 'incorrect') {
      return res.status(400).json({ error: 'correctness must be "correct" or "incorrect"' })
    }

    // Find exam (allow access if user owns it or is a doctor)
    const exam = await Exam.findById(id)
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' })
    }

    // Check ownership (for now, allow if user owns exam or if role is doctor)
    // In production, add proper role-based access control
    const isOwner = exam.patientId.toString() === req.user.id
    if (!isOwner) {
      // For demo, allow feedback from any authenticated user
      // In production, check for doctor role
    }

    // Create feedback
    const feedback = await Feedback.create({
      examId: exam._id,
      reviewerId: req.user.id,
      reviewerName: req.user.email, // Use email as name for now
      finalLabel,
      correctness,
      notes: notes || undefined,
      consentForTraining: consentForTraining === true
    })

    // Update exam feedback summary
    exam.feedbackSummary = {
      latestFinalLabel: finalLabel,
      latestCorrectness: correctness
    }
    if (consentForTraining !== undefined) {
      exam.consentForTraining = consentForTraining
    }
    await exam.save()

    res.status(201).json({
      id: feedback._id.toString(),
      examId: feedback.examId.toString(),
      reviewerId: feedback.reviewerId?.toString(),
      reviewerName: feedback.reviewerName,
      finalLabel: feedback.finalLabel,
      correctness: feedback.correctness,
      notes: feedback.notes,
      consentForTraining: feedback.consentForTraining,
      createdAt: feedback.createdAt
    })

  } catch (err) {
    console.error('Feedback error:', err)
    res.status(500).json({ error: 'Failed to submit feedback' })
  }
})

// Get feedback for an exam
router.get('/:id/feedback', async (req, res) => {
  try {
    const { id } = req.params

    // Find exam
    const exam = await Exam.findById(id)
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' })
    }

    // Get all feedback for this exam
    const feedbackList = await Feedback.find({ examId: exam._id })
      .sort({ createdAt: -1 })
      .select('_id reviewerId reviewerName finalLabel correctness notes consentForTraining createdAt')

    const feedback = feedbackList.map(fb => ({
      id: fb._id.toString(),
      reviewerId: fb.reviewerId?.toString(),
      reviewerName: fb.reviewerName,
      finalLabel: fb.finalLabel,
      correctness: fb.correctness,
      notes: fb.notes,
      consentForTraining: fb.consentForTraining,
      createdAt: fb.createdAt
    }))

    res.json({ feedback })

  } catch (err) {
    console.error('Get feedback error:', err)
    res.status(500).json({ error: 'Failed to get feedback' })
  }
})

// Create annotation for an exam
router.post('/:id/annotations', async (req, res) => {
  try {
    const { id } = req.params
    const { type, points, x, y, w, h, label } = req.body

    // Validate required fields
    if (!type || !label) {
      return res.status(400).json({ error: 'type and label are required' })
    }

    if (type !== 'polygon' && type !== 'box') {
      return res.status(400).json({ error: 'type must be "polygon" or "box"' })
    }

    // Validate polygon
    if (type === 'polygon') {
      if (!points || !Array.isArray(points) || points.length < 3) {
        return res.status(400).json({ error: 'polygon requires points array with at least 3 points' })
      }
    }

    // Validate box
    if (type === 'box') {
      if (x === undefined || y === undefined || w === undefined || h === undefined) {
        return res.status(400).json({ error: 'box requires x, y, w, h' })
      }
    }

    // Find exam
    const exam = await Exam.findById(id)
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' })
    }

    // Create annotation
    const annotation = await Annotation.create({
      examId: exam._id,
      reviewerId: req.user.id,
      reviewerName: req.user.email,
      type,
      points: type === 'polygon' ? points : undefined,
      x: type === 'box' ? x : undefined,
      y: type === 'box' ? y : undefined,
      w: type === 'box' ? w : undefined,
      h: type === 'box' ? h : undefined,
      label
    })

    res.status(201).json({
      id: annotation._id.toString(),
      examId: annotation.examId.toString(),
      reviewerId: annotation.reviewerId?.toString(),
      reviewerName: annotation.reviewerName,
      type: annotation.type,
      points: annotation.points,
      x: annotation.x,
      y: annotation.y,
      w: annotation.w,
      h: annotation.h,
      label: annotation.label,
      createdAt: annotation.createdAt
    })

  } catch (err) {
    console.error('Annotation error:', err)
    res.status(500).json({ error: 'Failed to create annotation' })
  }
})

// Get annotations for an exam
router.get('/:id/annotations', async (req, res) => {
  try {
    const { id } = req.params

    // Find exam
    const exam = await Exam.findById(id)
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' })
    }

    // Get all annotations for this exam
    const annotationList = await Annotation.find({ examId: exam._id })
      .sort({ createdAt: -1 })
      .select('_id reviewerId reviewerName type points x y w h label createdAt')

    const annotations = annotationList.map(ann => ({
      id: ann._id.toString(),
      reviewerId: ann.reviewerId?.toString(),
      reviewerName: ann.reviewerName,
      type: ann.type,
      points: ann.points,
      x: ann.x,
      y: ann.y,
      w: ann.w,
      h: ann.h,
      label: ann.label,
      createdAt: ann.createdAt
    }))

    res.json({ annotations })

  } catch (err) {
    console.error('Get annotations error:', err)
    res.status(500).json({ error: 'Failed to get annotations' })
  }
})

// Delete annotation
router.delete('/:id/annotations/:annotationId', async (req, res) => {
  try {
    const { id, annotationId } = req.params

    // Find annotation
    const annotation = await Annotation.findById(annotationId)
    if (!annotation) {
      return res.status(404).json({ error: 'Annotation not found' })
    }

    // Verify it belongs to the exam
    if (annotation.examId.toString() !== id) {
      return res.status(400).json({ error: 'Annotation does not belong to this exam' })
    }

    // Allow deletion if user created it (for demo)
    // In production, add proper authorization
    if (annotation.reviewerId && annotation.reviewerId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this annotation' })
    }

    await annotation.deleteOne()

    res.json({ success: true })

  } catch (err) {
    console.error('Delete annotation error:', err)
    res.status(500).json({ error: 'Failed to delete annotation' })
  }
})

export default router
