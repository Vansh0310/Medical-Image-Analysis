import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import mongoose from 'mongoose'

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') })

// Import models
const { User } = await import('../src/models/User.js')
const { Exam } = await import('../src/models/Exam.js')
const { Report } = await import('../src/models/Report.js')
const { Feedback } = await import('../src/models/Feedback.js')
const { Annotation } = await import('../src/models/Annotation.js')

/**
 * Clear all user data from MongoDB
 */
async function clearUserData() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI
    if (!mongoUri) {
      throw new Error('MONGO_URI not found in environment variables')
    }

    console.log('Connecting to MongoDB...')
    await mongoose.connect(mongoUri)
    console.log('Connected to MongoDB')

    // Get counts before deletion
    const userCount = await User.countDocuments()
    const examCount = await Exam.countDocuments()
    const reportCount = await Report.countDocuments()
    const feedbackCount = await Feedback.countDocuments()
    const annotationCount = await Annotation.countDocuments()

    console.log('\nCurrent data counts:')
    console.log(`  Users: ${userCount}`)
    console.log(`  Exams: ${examCount}`)
    console.log(`  Reports: ${reportCount}`)
    console.log(`  Feedback: ${feedbackCount}`)
    console.log(`  Annotations: ${annotationCount}`)

    if (userCount === 0 && examCount === 0 && reportCount === 0 && feedbackCount === 0 && annotationCount === 0) {
      console.log('\nNo data to delete. Database is already empty.')
      await mongoose.disconnect()
      return
    }

    // Delete all data
    console.log('\nDeleting all user data...')
    
    // Delete in order (respecting foreign key relationships)
    const annotationResult = await Annotation.deleteMany({})
    console.log(`  Deleted ${annotationResult.deletedCount} annotations`)
    
    const feedbackResult = await Feedback.deleteMany({})
    console.log(`  Deleted ${feedbackResult.deletedCount} feedback entries`)
    
    const reportResult = await Report.deleteMany({})
    console.log(`  Deleted ${reportResult.deletedCount} reports`)
    
    const examResult = await Exam.deleteMany({})
    console.log(`  Deleted ${examResult.deletedCount} exams`)
    
    const userResult = await User.deleteMany({})
    console.log(`  Deleted ${userResult.deletedCount} users`)

    console.log('\n✅ All user data cleared successfully!')
    console.log('\nNote: Uploaded images and output files (masks, overlays, CAM) are NOT deleted.')
    console.log('To remove those, manually delete files from:')
    console.log('  - api/uploads/')
    console.log('  - api/outputs/masks/')
    console.log('  - api/outputs/overlays/')
    console.log('  - api/outputs/cam/')

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')

  } catch (error) {
    console.error('Error clearing user data:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

// Run the script
clearUserData()
