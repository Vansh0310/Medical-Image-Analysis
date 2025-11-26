import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import FileDropzone from '../components/FileDropzone'
import Toast from '../components/Toast'

interface ToastMessage {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

interface PredictionResult {
  detectedModality: string
  top1: { label: string; score: number }
  topK: Array<{ label: string; score: number }>
  rules: {
    diagnosis: string
    confidence: number
    reason: string
  }
  reportId: string
}

export default function Upload() {
  const [currentStep, setCurrentStep] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [modality, setModality] = useState('AUTO')
  const [examId, setExamId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  
  // Step 2 form data
  const [questionnaire, setQuestionnaire] = useState({
    fever: '',
    cough: '',
    duration_days: '',
    age: '',
    history: ''
  })
  
  // Step 3 results
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null)
  
  const { user } = useAuth()

  const addToast = (message: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, message, type }])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const handleFileSelect = (selectedFile: File) => {
    // Validate file type
    if (!selectedFile.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG)')
      return
    }
    // Validate file size (10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB')
      return
    }
    setFile(selectedFile)
    setError('')
  }

  const handleStep1Submit = async () => {
    if (!file || !user) return

    setIsLoading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('modality', modality)
      formData.append('image', file)

      const result = await api.createExam(formData)
      setExamId(result.examId)
      setCurrentStep(2)
      addToast('Image uploaded successfully!', 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed. Please try again.'
      setError(message)
      addToast(message, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleStep2Submit = async () => {
    if (!examId) return

    // Validate required fields
    if (!questionnaire.fever || !questionnaire.cough || !questionnaire.duration_days) {
      addToast('Please fill in all required fields', 'error')
      return
    }

    setIsLoading(true)

    try {
      await api.addQuestionnaire(examId, {
        fever: questionnaire.fever === 'yes',
        cough: questionnaire.cough === 'yes',
        duration_days: parseInt(questionnaire.duration_days),
        age: questionnaire.age ? parseInt(questionnaire.age) : undefined,
        history: questionnaire.history || undefined
      })
      
      setCurrentStep(3)
      addToast('Questionnaire submitted successfully!', 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit questionnaire'
      addToast(message, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAnalyze = async () => {
    if (!examId) return

    setIsLoading(true)

    try {
      const result = await api.predictExam(examId)
      setPredictionResult(result)
      addToast('Analysis completed!', 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed'
      addToast(message, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const resetFlow = () => {
    setCurrentStep(1)
    setFile(null)
    setExamId(null)
    setPredictionResult(null)
    setQuestionnaire({
      fever: '',
      cough: '',
      duration_days: '',
      age: '',
      history: ''
    })
    setError('')
  }

  return (
    <>
      {/* Toast notifications */}
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Medical Image Analysis
          </h1>
          <p className="text-xl text-gray-600">
            Upload your image and get AI-powered analysis
          </p>
        </div>

        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center space-x-8">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                  currentStep >= step
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {step}
                </div>
                {step < 3 && (
                  <div className={`w-16 h-1 mx-4 ${
                    currentStep > step ? 'bg-blue-600' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-center space-x-24 mt-4">
            <span className={`text-sm font-medium ${
              currentStep >= 1 ? 'text-blue-600' : 'text-gray-500'
            }`}>
              Upload Image
            </span>
            <span className={`text-sm font-medium ${
              currentStep >= 2 ? 'text-blue-600' : 'text-gray-500'
            }`}>
              Symptoms
            </span>
            <span className={`text-sm font-medium ${
              currentStep >= 3 ? 'text-blue-600' : 'text-gray-500'
            }`}>
              Analysis
            </span>
          </div>
        </div>

        {/* Step 1: Upload */}
        {currentStep === 1 && (
          <div className="glass-card glass-card-hover rounded-xl p-8 animate-fade-in">
            <div className="space-y-6">
              <div>
                <label htmlFor="modality" className="block text-base font-medium text-gray-700 mb-3">
                  Image Type
                </label>
                <select
                  id="modality"
                  value={modality}
                  onChange={(e) => setModality(e.target.value)}
                  className="input-field"
                >
                  <option value="AUTO">Auto Detect</option>
                  <option value="XRAY_CHEST">Chest X-Ray</option>
                  <option value="MRI_BRAIN">Brain MRI</option>
                  <option value="MRI_SPINE">Spine MRI</option>
                  <option value="MRI_KNEE">Knee MRI</option>
                  <option value="SKIN_DERMOSCOPY">Skin Dermoscopy</option>
                  <option value="CT_CHEST">Chest CT</option>
                </select>
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 mb-3">
                  Medical Image
                </label>
                <FileDropzone
                  onFileSelect={handleFileSelect}
                  selectedFile={file}
                  error={error}
                />
              </div>

              <button
                onClick={handleStep1Submit}
                disabled={!file || isLoading}
                className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Uploading...
                  </div>
                ) : (
                  'Continue to Symptoms'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Questionnaire */}
        {currentStep === 2 && (
          <div className="glass-card glass-card-hover rounded-xl p-8 animate-fade-in">
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Symptom Assessment</h2>
                <p className="text-gray-600">Please provide information about the patient's symptoms</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    Fever <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={questionnaire.fever}
                    onChange={(e) => setQuestionnaire(prev => ({ ...prev, fever: e.target.value }))}
                    className="input-field"
                  >
                    <option value="">Select...</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    Cough <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={questionnaire.cough}
                    onChange={(e) => setQuestionnaire(prev => ({ ...prev, cough: e.target.value }))}
                    className="input-field"
                  >
                    <option value="">Select...</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    Duration (days) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={questionnaire.duration_days}
                    onChange={(e) => setQuestionnaire(prev => ({ ...prev, duration_days: e.target.value }))}
                    className="input-field"
                    placeholder="e.g., 3"
                  />
                </div>

                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">
                    Age
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={questionnaire.age}
                    onChange={(e) => setQuestionnaire(prev => ({ ...prev, age: e.target.value }))}
                    className="input-field"
                    placeholder="e.g., 45"
                  />
                </div>
              </div>

              <div>
                <label className="block text-base font-medium text-gray-700 mb-2">
                  Medical History
                </label>
                <textarea
                  value={questionnaire.history}
                  onChange={(e) => setQuestionnaire(prev => ({ ...prev, history: e.target.value }))}
                  className="input-field min-h-24 resize-none"
                  placeholder="Any relevant medical history, medications, or additional information..."
                />
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="btn-secondary flex-1"
                >
                  Back
                </button>
                <button
                  onClick={handleStep2Submit}
                  disabled={isLoading}
                  className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Submitting...
                    </div>
                  ) : (
                    'Continue to Analysis'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Analysis */}
        {currentStep === 3 && (
          <div className="space-y-8 animate-fade-in">
            {!predictionResult ? (
              <div className="glass-card glass-card-hover rounded-xl p-8 text-center">
                <div className="space-y-6">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Ready for Analysis</h2>
                    <p className="text-gray-600">Click the button below to analyze your medical image with AI</p>
                  </div>
                  <div className="flex space-x-4">
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="btn-secondary flex-1"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleAnalyze}
                      disabled={isLoading}
                      className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                          Analyzing...
                        </div>
                      ) : (
                        'Analyze Image'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Results */}
                <div className="glass-card glass-card-hover rounded-xl p-8">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Analysis Complete</h2>
                    <p className="text-gray-600">Results generated on {new Date().toLocaleString()}</p>
                  </div>

                  {/* Top 1 Result */}
                  {/* Detected Modality */}
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Detected Modality</h3>
                    <div className="bg-green-50 rounded-xl p-6 border-2 border-green-200">
                      <div className="flex justify-between items-center">
                        <span className="text-xl font-bold text-green-900">
                          {predictionResult.detectedModality.replace('_', ' ')}
                        </span>
                        <span className="text-lg font-semibold text-green-600">
                          Auto-Detected
                        </span>
                      </div>
                      <p className="text-green-700 mt-2 text-sm">
                        Image type automatically identified by AI
                      </p>
                    </div>
                  </div>

                  {/* Disease Assessment */}
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Disease Assessment</h3>
                    <div className="bg-blue-50 rounded-xl p-6 border-2 border-blue-200">
                      <div className="flex justify-between items-center">
                        <span className="text-xl font-bold text-blue-900">
                          {predictionResult.rules.diagnosis}
                        </span>
                        <span className="text-lg font-semibold text-blue-600">
                          {(predictionResult.rules.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-blue-700 mt-2 text-sm">
                        {predictionResult.rules.reason}
                      </p>
                    </div>
                  </div>

                  {/* Top K Results */}
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">All Predictions</h3>
                    <div className="space-y-3">
                      {predictionResult.topK.map((prediction, index) => (
                        <div key={index} className={`flex justify-between items-center p-4 rounded-lg ${
                          index === 0 ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
                        }`}>
                          <span className={`font-medium ${
                            index === 0 ? 'text-blue-900' : 'text-gray-900'
                          }`}>
                            {prediction.label}
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

                  {/* Disclaimer */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
                    <div className="flex items-start">
                      <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <p className="text-yellow-800 text-sm">
                        <strong>Disclaimer:</strong> This is an educational/assistive tool and should not be used as a medical diagnosis. 
                        Please consult with a qualified healthcare professional for proper medical evaluation.
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-4">
                    <Link
                      to={`/report/${predictionResult.reportId}`}
                      className="btn-primary flex-1 text-center"
                    >
                      View Detailed Report
                    </Link>
                    <Link
                      to="/history"
                      className="btn-secondary flex-1 text-center"
                    >
                      Go to History
                    </Link>
                  </div>
                </div>

                {/* Start New Analysis */}
                <div className="text-center">
                  <button
                    onClick={resetFlow}
                    className="text-blue-600 hover:text-blue-700 font-medium focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg px-4 py-2"
                  >
                    Start New Analysis
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
