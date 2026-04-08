import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

interface Exam {
  id: string
  date: string
  modality: string
  diagnosis: string | null
}

export default function History() {
  const [exams, setExams] = useState<Exam[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  
  const { user } = useAuth()

  useEffect(() => {
    if (user) {
      fetchExams()
    }
  }, [user])

  const fetchExams = async () => {
    try {
      const data = await api.getExams()
      setExams(data.exams)
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to load exams')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getModalityIcon = (modality: string) => {
    switch (modality) {
      case 'XRAY':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )
      case 'SKIN':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        )
      case 'MRI':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        )
      default:
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )
    }
  }

  const getModalityColor = (modality: string) => {
    switch (modality) {
      case 'XRAY':
        return 'bg-blue-100 text-blue-800'
      case 'SKIN':
        return 'bg-pink-100 text-pink-800'
      case 'MRI':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Exam History
        </h1>
        <p className="text-xl text-gray-600">
          View your medical imaging analysis history
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-8">
          {error}
        </div>
      )}

      {exams.length === 0 ? (
        <div className="glass-card glass-card-hover rounded-xl p-12 text-center animate-fade-in">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-4">No exams yet</h3>
          <p className="text-gray-600 mb-6">
            Upload your first medical image to get started with AI analysis.
          </p>
          <Link to="/upload" className="btn-primary">
            Upload Image
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map((exam, index) => (
            <div 
              key={exam.id} 
              className="glass-card glass-card-hover rounded-xl p-6 animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getModalityColor(exam.modality)}`}>
                  <span className="mr-2">{getModalityIcon(exam.modality)}</span>
                  {exam.modality}
                </div>
                <span className="text-sm text-gray-500">
                  {formatDate(exam.date)}
                </span>
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Exam #{exam.id.slice(-8)}
              </h3>
              
              {exam.diagnosis ? (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-1">Diagnosis:</p>
                  <p className="text-gray-900 font-semibold bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                    {exam.diagnosis}
                  </p>
                </div>
              ) : (
                <div className="mb-4">
                  <p className="text-gray-500 italic">
                    No analysis completed yet
                  </p>
                </div>
              )}
              
              <div className="space-y-2">
                <Link
                  to={`/exam/${exam.id}`}
                  className="btn-secondary w-full text-center block"
                >
                  View Exam Details
                </Link>
                {exam.diagnosis && (
                  <button className="w-full text-blue-600 hover:text-blue-700 font-medium text-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg py-2">
                    View Report
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
