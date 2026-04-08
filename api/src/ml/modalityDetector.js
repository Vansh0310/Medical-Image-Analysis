import * as tf from '@tensorflow/tfjs'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { env } from '../config/env.js'

let detectorModel = null
let detectorLabels = null
let isDemoModel = false

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
    isDemoModel = false
    return { model: detectorModel, labels: detectorLabels }
    
  } catch (error) {
    if (useDemoModel) {
      console.warn('WARN: Using DEMO modality detector — results are not clinical')
      console.warn('Real detector error:', error.message)
      
      // Create demo detector model
      const defaultLabels = getDetectorLabels()
      detectorModel = createDemoDetectorModel(defaultLabels.length)
      detectorLabels = defaultLabels
      isDemoModel = true
      
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
 * Analyze image characteristics for heuristic-based modality detection
 */
async function analyzeImageCharacteristics(imageBuffer) {
  try {
    const metadata = await sharp(imageBuffer).metadata()
    const { width, height, channels } = metadata
    
    // Calculate aspect ratio
    const aspectRatio = width / height
    
    // Get image statistics
    const stats = await sharp(imageBuffer)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true })
    
    const pixelData = new Uint8Array(stats.data)
    let sum = 0
    let darkPixels = 0
    let brightPixels = 0
    
    for (let i = 0; i < pixelData.length; i++) {
      const value = pixelData[i]
      sum += value
      if (value < 50) darkPixels++
      if (value > 200) brightPixels++
    }
    
    const avgIntensity = sum / pixelData.length
    const darkRatio = darkPixels / pixelData.length
    const brightRatio = brightPixels / pixelData.length
    
    return {
      width,
      height,
      aspectRatio,
      avgIntensity,
      darkRatio,
      brightRatio,
      channels
    }
  } catch (error) {
    console.warn('Image analysis failed:', error.message)
    return null
  }
}

/**
 * Apply heuristics to improve modality detection
 */
function applyDetectionHeuristics(modelResults, imageStats) {
  if (!imageStats) return modelResults
  
  const { aspectRatio, avgIntensity, darkRatio, brightRatio } = imageStats
  const results = { ...modelResults }
  
  // Heuristic adjustments based on image characteristics
  const adjustments = {}
  
  // IMPORTANT: Check knee MRI FIRST (more specific characteristics)
  // Knee MRI heuristics:
  // - Can be square OR wider than tall (aspect ratio 0.8 to 1.5)
  // - Shows bone/cartilage structures (high contrast regions)
  // - Often has bright bone areas (high bright ratio)
  // - Moderate intensity (bone shows up bright, soft tissue darker)
  // - Typically has more uniform distribution of bright/dark areas (joint structures)
  const isLikelyKnee = (
    (aspectRatio >= 0.8 && aspectRatio <= 1.5) && // Flexible aspect ratio
    brightRatio > 0.12 && // Has bright bone structures
    avgIntensity > 60 && avgIntensity < 150 && // Moderate intensity range
    (brightRatio + darkRatio) > 0.4 // Good contrast (both bright and dark areas)
  )
  
  if (isLikelyKnee) {
    const kneeIndex = results.topK.findIndex(r => r.label === 'MRI_KNEE')
    if (kneeIndex >= 0) {
      adjustments['MRI_KNEE'] = 0.4 // Strong boost for knee MRI
      console.log('Knee MRI characteristics detected - applying boost')
    }
  }
  
  // Brain MRI heuristics (only if NOT likely knee):
  // - Typically more square/circular (aspect ratio close to 1)
  // - Often has dark background (high dark ratio)
  // - Moderate to high average intensity
  // - More uniform appearance (less structural contrast than knee)
  if (!isLikelyKnee && Math.abs(aspectRatio - 1.0) < 0.25 && darkRatio > 0.35 && avgIntensity > 90 && avgIntensity < 170) {
    const brainIndex = results.topK.findIndex(r => r.label === 'MRI_BRAIN')
    if (brainIndex >= 0) {
      adjustments['MRI_BRAIN'] = 0.25 // Moderate boost for brain MRI
    }
  }
  
  // Chest X-ray heuristics:
  // - Usually wider than tall (landscape)
  // - High contrast between lungs and bones
  if (aspectRatio > 1.3 && brightRatio > 0.1 && darkRatio > 0.2) {
    const xrayIndex = results.topK.findIndex(r => r.label === 'XRAY_CHEST')
    if (xrayIndex >= 0) {
      adjustments['XRAY_CHEST'] = 0.25
    }
  }
  
  // Apply adjustments
  if (Object.keys(adjustments).length > 0) {
    console.log('Applying heuristic adjustments:', adjustments)
    
    // If knee MRI is boosted, reduce brain MRI score to avoid confusion
    if (adjustments['MRI_KNEE']) {
      const brainIndex = results.topK.findIndex(r => r.label === 'MRI_BRAIN')
      if (brainIndex >= 0) {
        results.topK[brainIndex].score = Math.max(0.05, results.topK[brainIndex].score * 0.4)
        console.log('Reduced brain MRI score to favor knee MRI')
      }
    }
    
    // If brain MRI is boosted, reduce knee MRI score
    if (adjustments['MRI_BRAIN'] && !adjustments['MRI_KNEE']) {
      const kneeIndex = results.topK.findIndex(r => r.label === 'MRI_KNEE')
      if (kneeIndex >= 0) {
        results.topK[kneeIndex].score = Math.max(0.05, results.topK[kneeIndex].score * 0.4)
        console.log('Reduced knee MRI score to favor brain MRI')
      }
    }
    
    // Update scores with adjustments
    results.topK = results.topK.map(result => {
      if (adjustments[result.label]) {
        return {
          ...result,
          score: Math.min(1.0, result.score + adjustments[result.label])
        }
      }
      return result
    })
    
    // Renormalize scores
    const totalScore = results.topK.reduce((sum, r) => sum + r.score, 0)
    results.topK = results.topK.map(result => ({
      ...result,
      score: result.score / totalScore
    }))
    
    // Re-sort and update top1
    results.topK.sort((a, b) => b.score - a.score)
    results.top1 = results.topK[0]
    
    console.log('Heuristic-adjusted results:', results)
  }
  
  return results
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

    // Analyze image characteristics for heuristics
    const imageStats = await analyzeImageCharacteristics(imageBuffer)
    if (imageStats) {
      console.log('Image characteristics:', {
        aspectRatio: imageStats.aspectRatio.toFixed(2),
        avgIntensity: imageStats.avgIntensity.toFixed(1),
        darkRatio: (imageStats.darkRatio * 100).toFixed(1) + '%',
        brightRatio: (imageStats.brightRatio * 100).toFixed(1) + '%'
      })
    }

    // Preprocess image
    const preprocessedImage = await preprocessImageForDetection(imageBuffer)
    console.log('Image preprocessing completed, shape:', preprocessedImage.shape)

    // Run detection
    console.log('Running modality detection...')
    const predictions = await detectorModel.predict(preprocessedImage)
    console.log('Modality detection completed, shape:', predictions.shape)
    
    // Process results
    let results = processDetectorPredictions(predictions, detectorLabels)
    console.log('Initial modality detection results:', results)
    
    // Apply heuristics to improve detection (especially for demo models)
    // Use stronger heuristics if using demo model
    if (isDemoModel && imageStats) {
      console.log('Using demo model - applying enhanced heuristics')
      results = applyDetectionHeuristics(results, imageStats)
      
      // If heuristics didn't significantly change the result, try more aggressive adjustments
      if (results.top1.score < 0.4) {
        console.log('Low score from demo model, applying stronger heuristics')
        
        // Check for knee MRI characteristics FIRST (priority)
        const isLikelyKnee = (
          (imageStats.aspectRatio >= 0.8 && imageStats.aspectRatio <= 1.5) &&
          imageStats.brightRatio > 0.12 &&
          imageStats.avgIntensity > 60 && imageStats.avgIntensity < 150
        )
        
        if (isLikelyKnee) {
          // Very likely knee MRI
          const kneeIndex = results.topK.findIndex(r => r.label === 'MRI_KNEE')
          if (kneeIndex >= 0) {
            results.topK[kneeIndex].score = 0.65
            // Reduce other MRI scores, especially brain
            results.topK.forEach((r, i) => {
              if (r.label.startsWith('MRI_') && r.label !== 'MRI_KNEE') {
                results.topK[i].score = Math.max(0.05, r.score * 0.25)
              }
            })
            // Renormalize
            const total = results.topK.reduce((sum, r) => sum + r.score, 0)
            results.topK = results.topK.map(r => ({ ...r, score: r.score / total }))
            results.topK.sort((a, b) => b.score - a.score)
            results.top1 = results.topK[0]
            console.log('Applied strong knee MRI heuristic')
          }
        } else if (Math.abs(imageStats.aspectRatio - 1.0) < 0.25 && imageStats.darkRatio > 0.3) {
          // Very likely brain MRI (only if NOT knee)
          const brainIndex = results.topK.findIndex(r => r.label === 'MRI_BRAIN')
          if (brainIndex >= 0) {
            results.topK[brainIndex].score = 0.6
            // Reduce other MRI scores
            results.topK.forEach((r, i) => {
              if (r.label.startsWith('MRI_') && r.label !== 'MRI_BRAIN') {
                results.topK[i].score = Math.max(0.05, r.score * 0.3)
              }
            })
            // Renormalize
            const total = results.topK.reduce((sum, r) => sum + r.score, 0)
            results.topK = results.topK.map(r => ({ ...r, score: r.score / total }))
            results.topK.sort((a, b) => b.score - a.score)
            results.top1 = results.topK[0]
            console.log('Applied strong brain MRI heuristic')
          }
        }
      }
    } else {
      results = applyDetectionHeuristics(results, imageStats)
    }

    // Clean up tensors
    preprocessedImage.dispose()
    predictions.dispose()

    console.log(`Modality detection completed. Detected: ${results.top1.label} (${(results.top1.score * 100).toFixed(1)}%)`)
    return results

  } catch (error) {
    console.error('Modality detection error:', error.message)
    console.error('Error stack:', error.stack)
    throw error
  }
}
