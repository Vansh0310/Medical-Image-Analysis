import { Router } from 'express'
import { Report } from '../models/Report.js'
import { Exam } from '../models/Exam.js'
import { auth } from '../auth/index.js'

const router = Router()

// All routes require authentication
router.use(auth())

// Get report by exam ID
router.get('/exam/:examId', async (req, res) => {
  try {
    const { examId } = req.params

    // Find exam and verify ownership
    const exam = await Exam.findOne({ _id: examId, patientId: req.user.id })
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' })
    }

    // Find report for this exam
    const report = await Report.findOne({ examId: exam._id })
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found for this exam' })
    }

    res.json({ 
      report: {
        id: report._id.toString(),
        examId: exam._id.toString(),
        json: report.json,
        createdAt: report.createdAt
      }
    })

  } catch (err) {
    console.error('Get report by exam error:', err)
    res.status(500).json({ error: 'Failed to get report' })
  }
})

// Get specific report by report ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    // Find report and verify ownership through exam
    const report = await Report.findById(id).populate({
      path: 'examId',
      select: 'patientId'
    })

    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    // Check if user owns the exam
    if (report.examId.patientId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' })
    }

    res.json({ 
      report: {
        id: report._id.toString(),
        examId: report.examId._id.toString(),
        json: report.json,
        createdAt: report.createdAt
      }
    })

  } catch (err) {
    console.error('Get report error:', err)
    res.status(500).json({ error: 'Failed to get report' })
  }
})

// List user's reports (through their exams)
router.get('/', async (req, res) => {
  try {
    // Find all exams for user, then get their reports
    const userExams = await Exam.find({ patientId: req.user.id }).select('_id')
    const examIds = userExams.map(exam => exam._id)

    const reports = await Report.find({ examId: { $in: examIds } })
      .populate('examId', 'modality createdAt')
      .sort({ createdAt: -1 })
      .select('_id examId json createdAt')

    const summary = reports.map(report => ({
      id: report._id.toString(),
      examId: report.examId._id.toString(),
      modality: report.examId.modality,
      diagnosis: report.json.rules?.diagnosis || null,
      createdAt: report.createdAt
    }))

    res.json({ reports: summary })

  } catch (err) {
    console.error('List reports error:', err)
    res.status(500).json({ error: 'Failed to list reports' })
  }
})

export default router
