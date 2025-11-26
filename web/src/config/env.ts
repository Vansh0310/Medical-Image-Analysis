// Environment configuration
export const config = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
}

// Log configuration in development
if (import.meta.env.DEV) {
  console.log('Environment config:', config)
}
