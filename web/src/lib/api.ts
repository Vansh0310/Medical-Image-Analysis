import { config } from '../config/env'

const API_BASE_URL = config.API_BASE_URL

class ApiClient {
  private baseURL: string

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
      const response = await fetch(url, config)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      return await response.json()
    } catch (error) {
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

  // Report endpoints
  async getReport(id: string) {
    return this.request<{
      report: {
        id: string
        examId: string
        json: {
          detectedModality: string
          top1: { label: string; score: number }
          topK: Array<{ label: string; score: number }>
          rules: { diagnosis: string; confidence: number; reason: string }
          ts: string
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
}

export const api = new ApiClient()
export default api
