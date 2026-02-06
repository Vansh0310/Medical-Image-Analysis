import { useState, useEffect } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import AnnotationCanvas from '../components/AnnotationCanvas'

interface SegmentationData {
  maskPath: string
  overlayPath: string
  coverage: number
  ts?: string
}

interface ExplainabilityData {
  classUsed: string
  heatmapPath: string
  overlayPath: string
  method: string
  layerName: string | null
  ts?: string
}

interface ReportData {
  id: string
  examId: string
  json: {
    detectedModality?: string
    top1?: { label: string; score: number }
    topK?: Array<{ label: string; score: number }>
    rules?: {
      diagnosis: string
      confidence: number
      reason: string
    }
    ts?: string
    segmentation?: SegmentationData
    explainability?: ExplainabilityData
  }
  createdAt: string
}

// Get default labels for a modality
function getDefaultLabels(modality: string): string[] {
  const defaultLabels: Record<string, string[]> = {
    'XRAY_CHEST': ['Normal', 'Pneumonia', 'Consolidation'],
    'MRI_BRAIN': ['Normal', 'Glioma', 'Meningioma', 'Pituitary Tumor', 'Metastasis'],
    'MRI_SPINE': ['Normal', 'Disc Herniation', 'Spinal Stenosis', 'Spondylolisthesis'],
    'MRI_KNEE': ['Normal', 'Meniscal Tear', 'ACL Tear', 'Cartilage Defect'],
    'SKIN_DERMOSCOPY': ['Benign', 'Melanoma', 'Basal Cell Carcinoma', 'Squamous Cell Carcinoma'],
    'CT_CHEST': ['Normal', 'Pneumonia', 'Pleural Effusion', 'Pneumothorax']
  }
  return defaultLabels[modality] || ['Normal', 'Abnormal']
}

export default function Report() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const [report, setReport] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'prediction' | 'segmentation' | 'explainability' | 'review'>('prediction')
  const [isSegmenting, setIsSegmenting] = useState(false)
  const [segmentationError, setSegmentationError] = useState('')
  // Keep segmentation enabled by default - only disable if explicitly told feature is not available
  const [segmentationEnabled, setSegmentationEnabled] = useState(true)
  const [isExplaining, setIsExplaining] = useState(false)
  const [explainabilityError, setExplainabilityError] = useState('')
  // Keep explainability enabled by default - only disable if explicitly told feature is not available
  const [explainabilityEnabled, setExplainabilityEnabled] = useState(true)
  const [selectedClass, setSelectedClass] = useState<string>('')
  
  // Doctor Review state
  const [isDoctorMode, setIsDoctorMode] = useState(false)
  const [feedback, setFeedback] = useState<any[]>([])
  const [annotations, setAnnotations] = useState<any[]>([])
  const [feedbackForm, setFeedbackForm] = useState({
    finalLabel: '',
    correctness: 'correct' as 'correct' | 'incorrect',
    notes: '',
    consentForTraining: false
  })
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false)
  const [isLoadingAnnotations, setIsLoadingAnnotations] = useState(false)
  const [examImageUrl, setExamImageUrl] = useState('')
  
  const { user } = useAuth()

  useEffect(() => {
    // Check if doctor mode is enabled via query param
    const role = searchParams.get('role')
    setIsDoctorMode(role === 'doctor')
    
    if (id && user) {
      fetchReport(id)
      if (role === 'doctor') {
        fetchFeedback(id)
        fetchAnnotations(id)
        fetchExamImage(id)
      }
    }
  }, [id, user, searchParams])

  const fetchReport = async (id: string) => {
    try {
      // Try to get report by ID first (could be report ID or exam ID)
      let data
      try {
        // First try as report ID
        data = await api.getReport(id)
      } catch (err) {
        // If that fails with 404, silently try as exam ID (this is expected behavior)
        if (err instanceof Error && (err.message.includes('404') || err.message.includes('not found'))) {
          console.log('[FETCH REPORT] Report ID not found, trying as exam ID...')
          try {
            data = await api.getReportByExamId(id)
            console.log('[FETCH REPORT] Successfully fetched by exam ID')
          } catch (examErr) {
            // If both fail, throw the original error
            throw err
          }
        } else {
          // For other errors, throw immediately
          throw err
        }
      }
      
      setReport(data.report)
      console.log('[FETCH REPORT] Report data:', data.report)
      console.log('[FETCH REPORT] Report JSON:', data.report.json)
      console.log('[FETCH REPORT] Segmentation data:', data.report.json?.segmentation)
      console.log('[FETCH REPORT] Explainability data:', data.report.json?.explainability)
      
      // Check if segmentation is available in the report
      // Only update if data exists, don't disable if it doesn't
      if (data.report.json?.segmentation) {
        console.log('[FETCH REPORT] Segmentation found, enabling feature')
        setSegmentationEnabled(true)
      } else {
        console.log('[FETCH REPORT] No segmentation data in report')
      }
      // Check if explainability is available in the report
      // Only update if data exists, don't disable if it doesn't
      if (data.report.json?.explainability) {
        console.log('[FETCH REPORT] Explainability found, enabling feature')
        setExplainabilityEnabled(true)
      } else {
        console.log('[FETCH REPORT] No explainability data in report')
      }
      // Set default selected class to top1 if available
      if (data.report.json?.top1) {
        setSelectedClass(data.report.json.top1.label)
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to load report')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSegment = async () => {
    if (!report) {
      console.error('[SEGMENTATION] No report available')
      setSegmentationError('No report available')
      return
    }
    
    if (!report.examId) {
      console.error('[SEGMENTATION] No examId in report:', report)
      setSegmentationError('No exam ID found in report')
      return
    }
    
    console.log('[SEGMENTATION] Starting segmentation for exam:', report.examId)
    setIsSegmenting(true)
    setSegmentationError('')
    
    try {
      console.log('[SEGMENTATION] Calling API...')
      const result = await api.segmentExam(report.examId)
      console.log('[SEGMENTATION] API response:', result)
      
      // Wait a bit for backend to save the data
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Refresh report to get updated data
      console.log('[SEGMENTATION] Refreshing report...')
      await fetchReport(id!)
      
      // Switch to segmentation tab
      setActiveTab('segmentation')
      console.log('[SEGMENTATION] Completed successfully')
    } catch (err) {
      console.error('[SEGMENTATION] Error:', err)
      if (err instanceof Error) {
        const errorMsg = err.message
        console.error('[SEGMENTATION] Error message:', errorMsg)
        // Only disable if feature is truly not enabled, otherwise keep showing the section
        if (errorMsg.includes('not enabled') || errorMsg.includes('SEGMENTATION_ENABLED')) {
          setSegmentationEnabled(false)
        }
        // Show error but keep the section visible
        setSegmentationError(errorMsg)
      } else {
        console.error('[SEGMENTATION] Unknown error:', err)
        setSegmentationError('Failed to run segmentation')
      }
    } finally {
      setIsSegmenting(false)
    }
  }

  const downloadMask = () => {
    if (!report?.json.segmentation?.maskPath) return
    
    const maskUrl = `${api.baseURL || 'http://localhost:8080'}/${report.json.segmentation.maskPath}`
    const link = document.createElement('a')
    link.href = maskUrl
    link.download = `mask-${report.examId}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getImageUrl = (imagePath: string) => {
    if (!imagePath) return ''
    // Handle both absolute and relative paths
    if (imagePath.startsWith('http')) {
      return imagePath
    }
    const baseUrl = api.baseURL || 'http://localhost:8080'
    // Paths from backend are like "masks/file.png", "overlays/file.png", "cam/file.png"
    // Server serves static files from /api/outputs, so construct URL accordingly
    if (imagePath.startsWith('masks/') || imagePath.startsWith('overlays/') || imagePath.startsWith('cam/')) {
      return `${baseUrl}/api/outputs/${imagePath}`
    }
    // Fallback for other paths
    return `${baseUrl}/${imagePath}`
  }

  const handleExplain = async () => {
    if (!report) {
      console.error('[EXPLAINABILITY] No report available')
      setExplainabilityError('No report available')
      return
    }
    
    if (!report.examId) {
      console.error('[EXPLAINABILITY] No examId in report:', report)
      setExplainabilityError('No exam ID found in report')
      return
    }
    
    console.log('[EXPLAINABILITY] Starting explainability for exam:', report.examId)
    console.log('[EXPLAINABILITY] Selected class:', selectedClass)
    setIsExplaining(true)
    setExplainabilityError('')
    
    try {
      console.log('[EXPLAINABILITY] Calling API...')
      const result = await api.explainExam(report.examId, {
        label: selectedClass || undefined
      })
      console.log('[EXPLAINABILITY] API response:', result)
      
      // Wait a bit for backend to save the data
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Refresh report to get updated data
      console.log('[EXPLAINABILITY] Refreshing report...')
      await fetchReport(id!)
      
      // Switch to explainability tab
      setActiveTab('explainability')
      console.log('[EXPLAINABILITY] Completed successfully')
    } catch (err) {
      console.error('[EXPLAINABILITY] Error:', err)
      if (err instanceof Error) {
        const errorMsg = err.message
        console.error('[EXPLAINABILITY] Error message:', errorMsg)
        // Only disable if feature is truly not enabled, otherwise keep showing the section
        if (errorMsg.includes('not enabled') || errorMsg.includes('EXPLAIN_ENABLED')) {
          setExplainabilityEnabled(false)
        }
        // Show error but keep the section visible
        setExplainabilityError(errorMsg)
      } else {
        console.error('[EXPLAINABILITY] Unknown error:', err)
        setExplainabilityError('Failed to run explainability analysis')
      }
    } finally {
      setIsExplaining(false)
    }
  }

  const fetchFeedback = async (examId: string) => {
    setIsLoadingFeedback(true)
    try {
      const data = await api.getFeedback(examId)
      setFeedback(data.feedback)
    } catch (err) {
      console.error('Failed to fetch feedback:', err)
    } finally {
      setIsLoadingFeedback(false)
    }
  }

  const fetchAnnotations = async (examId: string) => {
    setIsLoadingAnnotations(true)
    try {
      const data = await api.getAnnotations(examId)
      setAnnotations(data.annotations.map((ann: any, index: number) => ({
        ...ann,
        color: COLORS[index % COLORS.length]
      })))
    } catch (err) {
      console.error('Failed to fetch annotations:', err)
    } finally {
      setIsLoadingAnnotations(false)
    }
  }

  const fetchExamImage = async (examId: string) => {
    try {
      const examData = await api.getExam(examId)
      // Construct image URL from exam imagePath
      if (examData.exam) {
        const baseUrl = api.baseURL || 'http://localhost:8080'
        let imagePath = examData.exam.imagePath || ''
        
        console.log('[FETCH EXAM IMAGE] Original imagePath:', imagePath)
        
        // Handle absolute Windows paths (C:/path/to/file.jpg)
        if (imagePath.includes(':\\') || imagePath.startsWith('C:/') || imagePath.startsWith('D:/') || (imagePath.startsWith('/') && !imagePath.startsWith('http'))) {
          // Extract just the filename or relative path
          // If it contains 'uploads/', extract everything after 'uploads/'
          const uploadsIndex = imagePath.indexOf('uploads/')
          if (uploadsIndex !== -1) {
            imagePath = imagePath.substring(uploadsIndex)
          } else {
            // Otherwise, just get the filename
            const pathParts = imagePath.split(/[/\\]/)
            const filename = pathParts[pathParts.length - 1]
            imagePath = 'uploads/' + filename
          }
          console.log('[FETCH EXAM IMAGE] Converted to relative path:', imagePath)
        }
        
        // Handle relative paths
        if (imagePath.startsWith('http')) {
          setExamImageUrl(imagePath)
        } else if (imagePath.startsWith('uploads/')) {
          // Serve from /uploads endpoint (server serves static files from /uploads)
          setExamImageUrl(`${baseUrl}/${imagePath}`)
        } else if (imagePath) {
          // If it's already a relative path without 'uploads/', add it
          if (!imagePath.includes('/')) {
            setExamImageUrl(`${baseUrl}/uploads/${imagePath}`)
          } else {
            setExamImageUrl(`${baseUrl}/${imagePath}`)
          }
        }
        
        console.log('[FETCH EXAM IMAGE] Final image URL:', examImageUrl || 'setting...')
      }
    } catch (err) {
      console.error('[FETCH EXAM IMAGE] Failed to fetch exam image:', err)
    }
  }

  const handleSubmitFeedback = async () => {
    if (!report || !feedbackForm.finalLabel) {
      alert('Please select a final label')
      return
    }

    setIsSubmittingFeedback(true)
    try {
      await api.submitFeedback(report.examId, feedbackForm)
      await fetchFeedback(report.examId)
      setFeedbackForm({
        finalLabel: '',
        correctness: 'correct',
        notes: '',
        consentForTraining: false
      })
      alert('Feedback submitted successfully!')
    } catch (err) {
      if (err instanceof Error) {
        alert(`Failed to submit feedback: ${err.message}`)
      } else {
        alert('Failed to submit feedback')
      }
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

  const handleAnnotationComplete = async (annotation: any) => {
    if (!report) return

    try {
      await api.createAnnotation(report.examId, annotation)
      await fetchAnnotations(report.examId)
    } catch (err) {
      if (err instanceof Error) {
        alert(`Failed to save annotation: ${err.message}`)
      } else {
        alert('Failed to save annotation')
      }
    }
  }

  const handleAnnotationDelete = async (annotationId: string) => {
    if (!report) return

    try {
      await api.deleteAnnotation(report.examId, annotationId)
      await fetchAnnotations(report.examId)
    } catch (err) {
      if (err instanceof Error) {
        alert(`Failed to delete annotation: ${err.message}`)
      } else {
        alert('Failed to delete annotation')
      }
    }
  }

  const COLORS = [
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
    '#FFA500', '#800080', '#FFC0CB', '#A52A2A', '#808080', '#000000'
  ]

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-100'
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  const getScoreLabel = (score: number) => {
    if (score >= 0.8) return 'High'
    if (score >= 0.6) return 'Medium'
    return 'Low'
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="glass-card glass-card-hover rounded-xl p-12 text-center animate-fade-in">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Report not found</h3>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link to="/history" className="btn-primary">
            Back to History
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Detailed Analysis Report
            </h1>
            <p className="text-xl text-gray-600">
              Generated on {formatDate(report.createdAt)}
            </p>
          </div>
          <Link to="/history" className="btn-secondary">
            Back to History
          </Link>
        </div>
      </div>

      {/* Tabs */}
      {/* Always show tabs if we have a report - tabs control visibility, not feature availability */}
      {report && (
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('prediction')}
              className={`${
                activeTab === 'prediction'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Prediction
            </button>
            {/* Always show segmentation tab - let the content handle feature availability */}
            <button
              onClick={() => setActiveTab('segmentation')}
              className={`${
                activeTab === 'segmentation'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Segmentation
            </button>
            {/* Always show explainability tab - let the content handle feature availability */}
            <button
              onClick={() => setActiveTab('explainability')}
              className={`${
                activeTab === 'explainability'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Explainability
            </button>
            {isDoctorMode && (
              <button
                onClick={() => {
                  setActiveTab('review')
                  if (report) {
                    fetchFeedback(report.examId)
                    fetchAnnotations(report.examId)
                  }
                }}
                className={`${
                  activeTab === 'review'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Doctor Review
              </button>
            )}
          </nav>
        </div>
      )}
      
      {/* Doctor Mode Toggle (for demo) */}
      {!isDoctorMode && (
        <div className="mb-4">
          <button
            onClick={() => {
              setIsDoctorMode(true)
              setActiveTab('review')
              if (report) {
                fetchFeedback(report.examId)
                fetchAnnotations(report.examId)
                fetchExamImage(report.examId)
              }
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Enable Doctor Mode
          </button>
        </div>
      )}

      <div className="space-y-8">
        {/* Prediction Tab Content */}
        {activeTab === 'prediction' && (
          <>
            {/* Primary Diagnosis */}
            <div className="glass-card glass-card-hover rounded-xl p-8 animate-fade-in">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Medical Analysis Report</h2>
          </div>
          
          {/* Detected Modality */}
          {report.json.detectedModality && (
            <div className="bg-green-50 rounded-xl p-8 border-2 border-green-200 mb-6">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-green-900 mb-2">Detected Modality</h3>
                <p className="text-3xl font-bold text-green-800">
                  {report.json.detectedModality.replace('_', ' ')}
                </p>
                <p className="text-green-600 mt-2">Automatically identified by AI</p>
              </div>
            </div>
          )}

          {/* Disease Assessment */}
          {report.json.rules && (
            <div className="bg-blue-50 rounded-xl p-8 border-2 border-blue-200 mb-6">
              <div className="text-center">
                <h3 className="text-3xl font-bold text-blue-900 mb-4">
                  {report.json.rules.diagnosis}
                </h3>
                <div className="flex items-center justify-center space-x-4 mb-4">
                  <div className={`inline-flex items-center px-4 py-2 rounded-full text-lg font-semibold ${getScoreColor(report.json.rules.confidence)}`}>
                    {(report.json.rules.confidence * 100).toFixed(1)}%
                  </div>
                  <span className="text-sm text-gray-600">
                    ({getScoreLabel(report.json.rules.confidence)})
                  </span>
                </div>
                <p className="text-blue-700 text-lg leading-relaxed">
                  {report.json.rules.reason}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* AI Predictions */}
        {report.json.top1 && report.json.topK && (
          <div className="glass-card glass-card-hover rounded-xl p-8 animate-fade-in">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">AI Model Predictions</h2>
            
            <div className="space-y-6">
              {/* Top 1 Highlighted */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Primary Prediction</h3>
                <div className="bg-blue-50 rounded-xl p-6 border-2 border-blue-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xl font-bold text-blue-900">
                      {report.json.top1.label}
                    </span>
                    <span className="text-2xl font-bold text-blue-600">
                      {(report.json.top1.score * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* All Predictions */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Complete Prediction Set</h3>
                <div className="space-y-3">
                  {report.json.topK.map((prediction, index) => (
                    <div key={index} className={`flex justify-between items-center p-4 rounded-lg transition-colors duration-200 ${
                      index === 0 
                        ? 'bg-blue-50 border border-blue-200' 
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}>
                      <span className={`font-medium ${
                        index === 0 ? 'text-blue-900' : 'text-gray-900'
                      }`}>
                        {index + 1}. {prediction.label}
                      </span>
                      <span className={`font-semibold ${
                        index === 0 ? 'text-blue-600' : 'text-gray-600'
                      }`}>
                        {(prediction.score * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Report Details */}
        <div className="glass-card glass-card-hover rounded-xl p-8 animate-fade-in">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Report Details</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Report ID</h3>
              <p className="text-gray-600 font-mono text-sm bg-gray-50 p-2 rounded">{report.id}</p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Exam ID</h3>
              <p className="text-gray-600 font-mono text-sm bg-gray-50 p-2 rounded">{report.examId}</p>
            </div>
            
            {report.json.ts && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Analysis Timestamp</h3>
                <p className="text-gray-600">{formatDate(report.json.ts)}</p>
              </div>
            )}
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Analysis Method</h3>
              <p className="text-gray-600">AI + Clinical Rules Engine</p>
            </div>
          </div>
        </div>

            {/* Disclaimer */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 animate-fade-in">
              <div className="flex items-start">
                <svg className="w-6 h-6 text-yellow-600 mt-0.5 mr-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="text-lg font-semibold text-yellow-800 mb-2">Important Disclaimer</h3>
                  <p className="text-yellow-800 leading-relaxed">
                    <strong>This is an educational and assistive tool only.</strong> The analysis provided should not be used as a medical diagnosis. 
                    This report is intended to support healthcare professionals and should be interpreted in conjunction with clinical judgment, 
                    patient history, and additional diagnostic procedures as appropriate. Please consult with a qualified healthcare professional 
                    for proper medical evaluation and treatment decisions.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Segmentation Tab Content */}
        {activeTab === 'segmentation' && (
          <div className="space-y-8">
            <div className="glass-card glass-card-hover rounded-xl p-8 animate-fade-in">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Image Segmentation</h2>
                <p className="text-gray-600">AI-powered organ and lesion segmentation</p>
              </div>

              {report.json.segmentation ? (
                <div className="space-y-6">
                  {/* Coverage Info */}
                  <div className="bg-purple-50 rounded-xl p-6 border-2 border-purple-200">
                    <div className="text-center">
                      <h3 className="text-lg font-semibold text-purple-900 mb-2">Segmentation Coverage</h3>
                      <p className="text-3xl font-bold text-purple-800">
                        {report.json.segmentation.coverage.toFixed(2)}%
                      </p>
                      <p className="text-purple-600 mt-2">of image area segmented</p>
                    </div>
                  </div>

                  {/* Overlay Image */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Segmentation Overlay</h3>
                    <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-200">
                      <img
                        src={getImageUrl(report.json.segmentation.overlayPath)}
                        alt="Segmentation Overlay"
                        className="w-full h-auto rounded-lg"
                        onError={(e) => {
                          console.error('Failed to load overlay image')
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    </div>
                  </div>

                  {/* Download Mask Button */}
                  <div className="flex justify-center">
                    <button
                      onClick={downloadMask}
                      className="btn-primary flex items-center space-x-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Download Mask PNG</span>
                    </button>
                  </div>

                  {report.json.segmentation.ts && (
                    <div className="text-center text-sm text-gray-500">
                      Segmented on {formatDate(report.json.segmentation.ts)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">No Segmentation Available</h3>
                  <p className="text-gray-600 mb-6">
                    Run segmentation to generate organ or lesion masks for this image.
                  </p>
                  <button
                    onClick={handleSegment}
                    disabled={isSegmenting}
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSegmenting ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Segmenting...
                      </div>
                    ) : (
                      'Run Segmentation'
                    )}
                  </button>
                  {segmentationError && (
                    <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                      {segmentationError}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Explainability Tab Content */}
        {activeTab === 'explainability' && (
          <div className="space-y-8">
            <div className="glass-card glass-card-hover rounded-xl p-8 animate-fade-in">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">AI Explainability</h2>
                <p className="text-gray-600">Visualize which regions influence the model's prediction</p>
              </div>

              {report.json.explainability ? (
                <div className="space-y-6">
                  {/* Class and Method Info */}
                  <div className="bg-orange-50 rounded-xl p-6 border-2 border-orange-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-sm font-medium text-orange-900 mb-1">Class Analyzed</h3>
                        <p className="text-lg font-bold text-orange-800">
                          {report.json.explainability.classUsed}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-orange-900 mb-1">Method</h3>
                        <p className="text-lg font-bold text-orange-800 capitalize">
                          {report.json.explainability.method}
                        </p>
                        {report.json.explainability.layerName && (
                          <p className="text-sm text-orange-600 mt-1">
                            Layer: {report.json.explainability.layerName}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Heatmap Overlay */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Heatmap Overlay</h3>
                    <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-200">
                      <img
                        src={getImageUrl(report.json.explainability.overlayPath)}
                        alt="Explainability Overlay"
                        className="w-full h-auto rounded-lg"
                        onError={(e) => {
                          console.error('Failed to load overlay image')
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    </div>
                  </div>

                  {/* Heatmap Only */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Heatmap</h3>
                    <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-200">
                      <img
                        src={getImageUrl(report.json.explainability.heatmapPath)}
                        alt="Explainability Heatmap"
                        className="w-full h-auto rounded-lg"
                        onError={(e) => {
                          console.error('Failed to load heatmap image')
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    </div>
                  </div>

                  {report.json.explainability.ts && (
                    <div className="text-center text-sm text-gray-500">
                      Analyzed on {formatDate(report.json.explainability.ts)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">No Explainability Analysis Available</h3>
                  <p className="text-gray-600 mb-6">
                    Run explainability analysis to visualize which regions of the image influence the model's prediction.
                  </p>
                  
                  {/* Class Selection */}
                  {report.json.topK && report.json.topK.length > 0 && (
                    <div className="mb-6 max-w-md mx-auto">
                      <label htmlFor="classSelect" className="block text-sm font-medium text-gray-700 mb-2">
                        Select Class to Explain
                      </label>
                      <select
                        id="classSelect"
                        value={selectedClass}
                        onChange={(e) => setSelectedClass(e.target.value)}
                        className="input-field w-full"
                      >
                        {report.json.topK.map((pred, index) => (
                          <option key={index} value={pred.label}>
                            {pred.label} ({(pred.score * 100).toFixed(1)}%)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  <button
                    onClick={handleExplain}
                    disabled={isExplaining || !selectedClass}
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExplaining ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Analyzing...
                      </div>
                    ) : (
                      'Run Explainability Analysis'
                    )}
                  </button>
                  {explainabilityError && (
                    <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                      {explainabilityError}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Doctor Review Tab Content */}
        {activeTab === 'review' && isDoctorMode && report && (
          <div className="space-y-8">
            {/* Feedback Section */}
            <div className="glass-card glass-card-hover rounded-xl p-8 animate-fade-in">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Doctor Feedback</h2>
              
              <div className="space-y-6">
                {/* Feedback Form */}
                <div className="bg-blue-50 rounded-xl p-6 border-2 border-blue-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Submit Feedback</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Correctness
                      </label>
                      <select
                        value={feedbackForm.correctness}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, correctness: e.target.value as 'correct' | 'incorrect' })}
                        className="input-field w-full"
                      >
                        <option value="correct">Correct</option>
                        <option value="incorrect">Incorrect</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Final Label
                      </label>
                      <select
                        value={feedbackForm.finalLabel}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, finalLabel: e.target.value })}
                        className="input-field w-full"
                        required
                      >
                        <option value="">Select a label</option>
                        {(() => {
                          const modality = report.json.detectedModality || 'XRAY_CHEST'
                          const labels = getDefaultLabels(modality)
                          // Also include labels from topK if available
                          const topKLabels = report.json.topK?.map(p => p.label) || []
                          const allLabels = [...new Set([...labels, ...topKLabels])]
                          return allLabels.map(label => (
                            <option key={label} value={label}>{label}</option>
                          ))
                        })()}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Notes (optional)
                      </label>
                      <textarea
                        value={feedbackForm.notes}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, notes: e.target.value })}
                        className="input-field w-full"
                        rows={3}
                        placeholder="Add any additional notes..."
                      />
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="consentForTraining"
                        checked={feedbackForm.consentForTraining}
                        onChange={(e) => setFeedbackForm({ ...feedbackForm, consentForTraining: e.target.checked })}
                        className="mr-2"
                      />
                      <label htmlFor="consentForTraining" className="text-sm text-gray-700">
                        Consent for training dataset (anonymized)
                      </label>
                    </div>

                    <button
                      onClick={handleSubmitFeedback}
                      disabled={isSubmittingFeedback || !feedbackForm.finalLabel}
                      className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                    </button>
                  </div>
                </div>

                {/* Previous Feedback */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Previous Feedback</h3>
                  {isLoadingFeedback ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    </div>
                  ) : feedback.length === 0 ? (
                    <p className="text-gray-500 italic">No feedback submitted yet</p>
                  ) : (
                    <div className="space-y-3">
                      {feedback.map((fb) => (
                        <div key={fb.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${
                                fb.correctness === 'correct' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {fb.correctness === 'correct' ? '✓ Correct' : '✗ Incorrect'}
                              </span>
                              <span className="ml-2 font-semibold text-gray-900">{fb.finalLabel}</span>
                            </div>
                            <span className="text-xs text-gray-500">{formatDate(fb.createdAt)}</span>
                          </div>
                          {fb.notes && (
                            <p className="text-sm text-gray-700 mt-2">{fb.notes}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-2">By: {fb.reviewerName}</p>
                          {fb.consentForTraining && (
                            <span className="inline-block mt-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              Consent for training
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Annotation Section */}
            <div className="glass-card glass-card-hover rounded-xl p-8 animate-fade-in">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Image Annotations</h2>
              
              {isLoadingAnnotations ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : examImageUrl ? (
                <AnnotationCanvas
                  imageUrl={examImageUrl}
                  annotations={annotations}
                  onAnnotationComplete={handleAnnotationComplete}
                  onAnnotationDelete={handleAnnotationDelete}
                  currentUserId={user?.id}
                />
              ) : (
                <p className="text-gray-500">Loading image...</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
