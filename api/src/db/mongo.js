import mongoose from 'mongoose'
import { env } from '../config/env.js'

const DEFAULT_OPTIONS = {
  autoIndex: true,
  maxPoolSize: 10
}

export async function connectToMongo({ uri = env.mongoUri, options = {} } = {}) {
  let attempt = 0
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options }
  // Exponential backoff with cap
  // Keep retrying until successful
  // Logs success and errors
  for (;;) {
    attempt += 1
    try {
      await mongoose.connect(uri, mergedOptions)
      console.log(`MongoDB connected (attempt ${attempt})`)
      mongoose.connection.on('error', (err) => console.error('MongoDB error:', err))
      mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'))
      return mongoose.connection
    } catch (err) {
      const delayMs = Math.min(1000 * 2 ** Math.min(attempt, 5), 15000)
      console.error(`MongoDB connection failed (attempt ${attempt}):`, err.message)
      console.log(`Retrying in ${Math.round(delayMs / 1000)}s...`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}


