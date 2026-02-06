import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import dotenv from 'dotenv'
import mongoose from 'mongoose'

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') })

// Import models
const { Exam } = await import('../src/models/Exam.js')
const { Feedback } = await import('../src/models/Feedback.js')
const { Annotation } = await import('../src/models/Annotation.js')

/**
 * Export feedback dataset to CSV
 */
async function exportFeedbackDataset() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI
    if (!mongoUri) {
      throw new Error('MONGO_URI not found in environment variables')
    }

    await mongoose.connect(mongoUri)
    console.log('Connected to MongoDB')

    // Find exams with feedback where consentForTraining is true
    const feedbacks = await Feedback.find({ consentForTraining: true })
      .populate('examId')
      .sort({ createdAt: -1 })

    console.log(`Found ${feedbacks.length} feedback entries with consent for training`)

    if (feedbacks.length === 0) {
      console.log('No feedback entries found with consent for training')
      await mongoose.disconnect()
      return
    }

    // Get unique exam IDs
    const examIds = [...new Set(feedbacks.map(fb => fb.examId._id.toString()))]
    const exams = await Exam.find({ _id: { $in: examIds } })

    console.log(`Found ${exams.length} unique exams`)

    // Prepare CSV data
    const csvRows = []
    const headers = [
      'examId',
      'imagePath',
      'finalLabel',
      'correctness',
      'age',
      'fever',
      'cough',
      'duration_days',
      'modality',
      'detectedModality',
      'notes',
      'reviewerName',
      'createdAt'
    ]
    csvRows.push(headers.join(','))

    // Process each exam
    for (const exam of exams) {
      // Get the latest feedback for this exam
      const examFeedbacks = feedbacks.filter(fb => fb.examId._id.toString() === exam._id.toString())
      const latestFeedback = examFeedbacks[0] // Already sorted by createdAt desc

      if (!latestFeedback) continue

      const row = [
        exam._id.toString(),
        exam.imagePath || '',
        latestFeedback.finalLabel || '',
        latestFeedback.correctness || '',
        exam.questionnaire?.age?.toString() || '',
        exam.questionnaire?.fever?.toString() || '',
        exam.questionnaire?.cough?.toString() || '',
        exam.questionnaire?.duration_days?.toString() || '',
        exam.modality || '',
        exam.detectedModality || '',
        (latestFeedback.notes || '').replace(/,/g, ';').replace(/\n/g, ' '), // Escape commas and newlines
        latestFeedback.reviewerName || '',
        latestFeedback.createdAt.toISOString()
      ]

      // Escape CSV values
      const escapedRow = row.map(val => {
        const str = String(val)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      })

      csvRows.push(escapedRow.join(','))
    }

    // Write CSV file
    const outputDir = path.resolve(__dirname, '../outputs')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const csvPath = path.join(outputDir, `feedback-dataset-${Date.now()}.csv`)
    fs.writeFileSync(csvPath, csvRows.join('\n'))
    console.log(`CSV exported to: ${csvPath}`)

    // Optionally export annotations as JSON
    const exportAnnotations = process.argv.includes('--with-annotations')
    if (exportAnnotations) {
      const annotationsData = {}

      for (const examId of examIds) {
        const annotations = await Annotation.find({ examId })
        if (annotations.length > 0) {
          annotationsData[examId] = annotations.map(ann => ({
            type: ann.type,
            points: ann.points,
            x: ann.x,
            y: ann.y,
            w: ann.w,
            h: ann.h,
            label: ann.label
          }))
        }
      }

      const annotationsPath = path.join(outputDir, `annotations-${Date.now()}.json`)
      fs.writeFileSync(annotationsPath, JSON.stringify(annotationsData, null, 2))
      console.log(`Annotations exported to: ${annotationsPath}`)
    }

    // Optionally export masks
    const exportMasks = process.argv.includes('--with-masks')
    if (exportMasks) {
      const masksDir = path.resolve(__dirname, '../outputs/masks-export')
      if (!fs.existsSync(masksDir)) {
        fs.mkdirSync(masksDir, { recursive: true })
      }

      let masksExported = 0
      for (const exam of exams) {
        if (exam.segmentation?.maskPath) {
          const sourcePath = path.resolve(exam.segmentation.maskPath)
          if (fs.existsSync(sourcePath)) {
            const destPath = path.join(masksDir, `${exam._id.toString()}.png`)
            fs.copyFileSync(sourcePath, destPath)
            masksExported++
          }
        }
      }
      console.log(`Exported ${masksExported} mask files to: ${masksDir}`)
    }

    console.log('Export completed successfully')
    await mongoose.disconnect()

  } catch (error) {
    console.error('Export error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

// Run export
exportFeedbackDataset()
