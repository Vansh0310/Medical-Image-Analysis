import * as tf from '@tensorflow/tfjs'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { env } from '../config/env.js'

let detectorModel = null
let detectorLabels = null

/**
 * Get default labels for modality detector
 */
function getDetectorLabels() {
  return [
    'XRAY_CHEST',
    'MRI_BRAIN', 
    'MRI_SPINE',
    'MRI_KNEE',
    'SKIN_DERMOSCOPY',
    'CT_CHEST',
    'OTHER_UNKNOWN'
  ]
}

/**
 * Load the modality detector model
 */
export async function loadModalityDetector() {
  if (detectorModel && detectorLabels) {
    return { model: detectorModel, labels: detectorLabels }
  }

  const detectorDir = path.resolve(env.modelDir, 'modality_detector_v1')
  const useDemoModel = process.env.USE_DEMO_MODEL === 'true'

  try {
    // Try to load real detector model
    const modelPath = path.join(detectorDir, 'model.json')
    const labelsPath = path.join(detectorDir, 'labels.json')
    
    if (!fs.existsSync(modelPath) || !fs.existsSync(labelsPath)) {
      throw new Error(`Modality detector model not found at ${detectorDir}`)
    }

    // Load model
    const modelUrl = pathToFileURL(modelPath).href
    console.log(`Loading modality detector from ${modelUrl}`)
    detectorModel = await tf.loadLayersModel(modelUrl)
    
    // Load labels
    const labelsContent = fs.readFileSync(labelsPath, 'utf8')
    detectorLabels = JSON.parse(labelsContent)
    
    // Validate labels
    if (!Array.isArray(detectorLabels) || detectorLabels.length === 0) {
      throw new Error('Invalid detector labels.json')
    }
    
    console.log(`Loaded modality detector with ${detectorLabels.length} categories`)
    return { model: detectorModel, labels: detectorLabels }
    
  } catch (error) {
    if (useDemoModel) {
      console.warn('WARN: Using DEMO modality detector — results are not clinical')
      console.warn('Real detector error:', error.message)
      
      // Create demo detector model
      const defaultLabels = getDetectorLabels()
      detectorModel = createDemoDetectorModel(defaultLabels.length)
      detectorLabels = defaultLabels
      
      console.log('Demo modality detector loaded successfully')
      return { model: detectorModel, labels: detectorLabels }
    } else {
      throw new Error(`Modality detector error: ${error.message}`)
    }
  }
}

/**
 * Create a demo modality detector model
 */
function createDemoDetectorModel(numClasses) {
  console.log('Creating in-memory demo modality detector with', numClasses, 'classes')
  
  const demoModel = tf.sequential({
    layers: [
      tf.layers.globalAveragePooling2d({
        inputShape: [224, 224, 3]
      }),
      tf.layers.dense({
        units: 128,
        activation: 'relu'
      }),
      tf.layers.dense({
        units: numClasses,
        activation: 'softmax'
      })
    ]
  })
  
  demoModel.compile({
    optimizer: 'adam',
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  })
  
  console.log('Demo modality detector created successfully')
  return demoModel
}

/**
 * Preprocess image for modality detection
 */
async function preprocessImageForDetection(buffer, inputSize = 224) {
  try {
    const processedBuffer = await sharp(buffer)
      .resize(inputSize, inputSize, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer()

    const tensor = tf.tensor3d(new Uint8Array(processedBuffer), [inputSize, inputSize, 3])
    const normalized = tensor.div(255.0)
    const batched = normalized.expandDims(0)

    tensor.dispose()
    normalized.dispose()

    return batched
  } catch (error) {
    throw new Error(`Image preprocessing failed: ${error.message}`)
  }
}

/**
 * Process detector predictions
 */
function processDetectorPredictions(predictions, labels, topK = 3) {
  const probabilities = tf.softmax(predictions)
  const probArray = probabilities.dataSync()
  
  const results = labels.map((label, index) => ({
    label,
    score: parseFloat(probArray[index].toFixed(4))
  }))

  results.sort((a, b) => b.score - a.score)

  probabilities.dispose()

  return {
    top1: results[0],
    topK: results.slice(0, topK)
  }
}

/**
 * Detect modality from image file
 */
export async function detectModalityFromFile(filePath) {
  try {
    console.log(`Detecting modality from file: ${filePath}`)
    
    // Ensure detector is loaded
    if (!detectorModel || !detectorLabels) {
      console.log('Modality detector not loaded, loading now...')
      await loadModalityDetector()
      console.log('Modality detector loaded successfully')
    }

    // Read image file
    const imageBuffer = fs.readFileSync(filePath)
    console.log(`Image buffer size: ${imageBuffer.length}`)

    // Preprocess image
    const preprocessedImage = await preprocessImageForDetection(imageBuffer)
    console.log('Image preprocessing completed, shape:', preprocessedImage.shape)

    // Run detection
    console.log('Running modality detection...')
    const predictions = await detectorModel.predict(preprocessedImage)
    console.log('Modality detection completed, shape:', predictions.shape)
    
    // Process results
    const results = processDetectorPredictions(predictions, detectorLabels)
    console.log('Modality detection results:', results)

    // Clean up tensors
    preprocessedImage.dispose()
    predictions.dispose()

    console.log(`Modality detection completed. Detected: ${results.top1.label} (${results.top1.score})`)
    return results

  } catch (error) {
    console.error('Modality detection error:', error.message)
    console.error('Error stack:', error.stack)
    throw error
  }
}
