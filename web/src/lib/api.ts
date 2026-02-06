import { config } from '../config/env'

const API_BASE_URL = config.API_BASE_URL

class ApiClient {
  public baseURL: string

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('token')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    
    return headers
  }

  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    const headers = {
      ...this.getAuthHeaders(),
      ...options.headers
    }

    const config: RequestInit = {
      ...options,
      headers
    }

    try {
      console.log(`[API] ${options.method || 'GET'} ${url}`)
      const response = await fetch(url, config)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMsg = errorData.error || `HTTP ${response.status}`
        
        // Only log 404 errors at debug level (not as errors) since they're expected in fallback scenarios
        if (response.status === 404) {
          console.log(`[API] ${response.status}: ${errorMsg} (this may be expected if trying fallback)`)
        } else {
          console.error(`[API] Error ${response.status}:`, errorMsg)
        }
        throw new Error(errorMsg)
      }

      const data = await response.json()
      console.log(`[API] Response:`, data)
      return data
    } catch (error) {
      // Only log as error if it's not a 404 (404s are expected in fallback scenarios)
      if (error instanceof Error && !error.message.includes('404') && !error.message.includes('not found')) {
        console.error(`[API] Request failed:`, error)
      }
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Network error')
    }
  }

  // Auth endpoints
  async register(data: { name: string; email: string; password: string }) {
    return this.request<{ id: string; name: string; email: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  async login(data: { email: string; password: string }) {
    return this.request<{ token: string; user: { id: string; name: string; email: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  async getMe() {
    return this.request<{ user: { id: string; email: string } }>('/auth/me')
  }

  // Exam endpoints
  async createExam(formData: FormData) {
    const token = localStorage.getItem('token')
    const headers: Record<string, string> = {}
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`${this.baseURL}/exams`, {
      method: 'POST',
      headers,
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    return response.json()
  }

  async getExams() {
    return this.request<{ exams: Array<{ id: string; date: string; modality: string; diagnosis: string | null }> }>('/exams')
  }

  async getExam(id: string) {
    return this.request<{ exam: any }>(`/exams/${id}`)
  }

  async addQuestionnaire(examId: string, data: {
    fever: string | boolean
    cough: string | boolean
    duration_days: number
    age?: number
    history?: string
  }) {
    return this.request(`/exams/${examId}/questionnaire`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  async predictExam(examId: string) {
    return this.request<{
      detectedModality: string
      top1: { label: string; score: number }
      topK: Array<{ label: string; score: number }>
      rules: { diagnosis: string; confidence: number; reason: string }
      reportId: string
    }>(`/exams/${examId}/predict`, {
      method: 'POST'
    })
  }

  async segmentExam(examId: string) {
    return this.request<{
      maskPath: string
      overlayPath: string
      coverage: number
    }>(`/exams/${examId}/segment`, {
      method: 'POST'
    })
  }

  async explainExam(examId: string, options?: { label?: string; classIndex?: number; layerName?: string }) {
    return this.request<{
      classUsed: string
      heatmapPath: string
      overlayPath: string
      method: string
      layerName: string | null
    }>(`/exams/${examId}/explain`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(options || {})
    })
  }

  // Feedback endpoints
  async submitFeedback(examId: string, data: {
    finalLabel: string
    correctness: 'correct' | 'incorrect'
    notes?: string
    consentForTraining?: boolean
  }) {
    return this.request<{
      id: string
      examId: string
      reviewerId: string | null
      reviewerName: string
      finalLabel: string
      correctness: string
      notes: string | null
      consentForTraining: boolean
      createdAt: string
    }>(`/exams/${examId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  async getFeedback(examId: string) {
    return this.request<{
      feedback: Array<{
        id: string
        reviewerId: string | null
        reviewerName: string
        finalLabel: string
        correctness: string
        notes: string | null
        consentForTraining: boolean
        createdAt: string
      }>
    }>(`/exams/${examId}/feedback`)
  }

  // Annotation endpoints
  async createAnnotation(examId: string, data: {
    type: 'polygon' | 'box'
    points?: Array<{ x: number; y: number }>
    x?: number
    y?: number
    w?: number
    h?: number
    label: string
  }) {
    return this.request<{
      id: string
      examId: string
      reviewerId: string | null
      reviewerName: string
      type: string
      points: Array<{ x: number; y: number }> | null
      x: number | null
      y: number | null
      w: number | null
      h: number | null
      label: string
      createdAt: string
    }>(`/exams/${examId}/annotations`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  async getAnnotations(examId: string) {
    return this.request<{
      annotations: Array<{
        id: string
        reviewerId: string | null
        reviewerName: string
        type: string
        points: Array<{ x: number; y: number }> | null
        x: number | null
        y: number | null
        w: number | null
        h: number | null
        label: string
        createdAt: string
      }>
    }>(`/exams/${examId}/annotations`)
  }

  async deleteAnnotation(examId: string, annotationId: string) {
    return this.request<{ success: boolean }>(`/exams/${examId}/annotations/${annotationId}`, {
      method: 'DELETE'
    })
  }

  // Report endpoints
  async getReport(id: string) {
    return this.request<{
      report: {
        id: string
        examId: string
        json: {
          detectedModality?: string
          top1?: { label: string; score: number }
          topK?: Array<{ label: string; score: number }>
          rules?: { diagnosis: string; confidence: number; reason: string }
          ts?: string
          segmentation?: {
            maskPath: string
            overlayPath: string
            coverage: number
            ts?: string
          }
          explainability?: {
            classUsed: string
            heatmapPath: string
            overlayPath: string
            method: string
            layerName: string | null
            ts?: string
          }
        }
        createdAt: string
      }
    }>(`/reports/${id}`)
  }

  async getReports() {
    return this.request<{
      reports: Array<{
        id: string
        examId: string
        modality: string
        diagnosis: string | null
        createdAt: string
      }>
    }>('/reports')
  }

  // Get report by exam ID
  async getReportByExamId(examId: string) {
    return this.request<{
      report: {
        id: string
        examId: string
        json: {
          detectedModality?: string
          top1?: { label: string; score: number }
          topK?: Array<{ label: string; score: number }>
          rules?: { diagnosis: string; confidence: number; reason: string }
          ts?: string
          segmentation?: {
            maskPath: string
            overlayPath: string
            coverage: number
            ts?: string
          }
          explainability?: {
            classUsed: string
            heatmapPath: string
            overlayPath: string
            method: string
            layerName: string | null
            ts?: string
          }
        }
        createdAt: string
      }
    }>(`/reports/exam/${examId}`)
  }
}

export const api = new ApiClient()
export default api
