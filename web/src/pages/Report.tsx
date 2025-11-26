import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

interface ReportData {
  id: string
  examId: string
  json: {
    detectedModality: string
    top1: { label: string; score: number }
    topK: Array<{ label: string; score: number }>
    rules: {
      diagnosis: string
      confidence: number
      reason: string
    }
    ts: string
  }
  createdAt: string
}

export default function Report() {
  const { id } = useParams<{ id: string }>()
  const [report, setReport] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  
  const { user } = useAuth()

  useEffect(() => {
    if (id && user) {
      fetchReport(id)
    }
  }, [id, user])

  const fetchReport = async (reportId: string) => {
    try {
      const data = await api.getReport(reportId)
      setReport(data.report)
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-100'
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High'
    if (confidence >= 0.6) return 'Medium'
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

      <div className="space-y-8">
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
          <div className="bg-green-50 rounded-xl p-8 border-2 border-green-200 mb-6">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-green-900 mb-2">Detected Modality</h3>
              <p className="text-3xl font-bold text-green-800">
                {report.json.detectedModality.replace('_', ' ')}
              </p>
              <p className="text-green-600 mt-2">Automatically identified by AI</p>
            </div>
          </div>

          {/* Disease Assessment */}
          <div className="bg-blue-50 rounded-xl p-8 border-2 border-blue-200 mb-6">
            <div className="text-center">
              <h3 className="text-3xl font-bold text-blue-900 mb-4">
                {report.json.rules.diagnosis}
              </h3>
              <div className="flex items-center justify-center space-x-4 mb-4">
                <div className={`inline-flex items-center px-4 py-2 rounded-full text-lg font-semibold ${getConfidenceColor(report.json.rules.confidence)}`}>
                  {(report.json.rules.confidence * 100).toFixed(1)}% Confidence
                </div>
                <span className="text-sm text-gray-600">
                  ({getConfidenceLabel(report.json.rules.confidence)})
                </span>
              </div>
              <p className="text-blue-700 text-lg leading-relaxed">
                {report.json.rules.reason}
              </p>
            </div>
          </div>
        </div>

        {/* AI Predictions */}
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
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Analysis Timestamp</h3>
              <p className="text-gray-600">{formatDate(report.json.ts)}</p>
            </div>
            
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
      </div>
    </div>
  )
}
