import * as tf from '@tensorflow/tfjs'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { env } from '../config/env.js'
import { MODEL_REGISTRY, getModelConfig, isModalitySupported } from './registry.js'

let models = {}

/**
 * Get default labels for each modality
 */
function getDefaultLabels(modality) {
  const defaultLabels = {
    'XRAY_CHEST': ['Normal', 'Pneumonia', 'Consolidation'],
    'MRI_BRAIN': ['Normal', 'Glioma', 'Meningioma', 'Pituitary Tumor', 'Metastasis'],
    'MRI_SPINE': ['Normal', 'Disc Herniation', 'Spinal Stenosis', 'Spondylolisthesis'],
    'MRI_KNEE': ['Normal', 'Meniscal Tear', 'ACL Tear', 'Cartilage Defect'],
    'SKIN_DERMOSCOPY': ['Benign', 'Melanoma', 'Basal Cell Carcinoma', 'Squamous Cell Carcinoma'],
    'CT_CHEST': ['Normal', 'Pneumonia', 'Pleural Effusion', 'Pneumothorax']
  }
  return defaultLabels[modality] || ['Normal', 'Abnormal']
}

/**
 * Create a proper in-memory demo model with random weights
 */
function createDemoModel(modality, numClasses) {
  console.log(`Creating in-memory demo model for ${modality} with ${numClasses} classes`)
  
  // Create a simple sequential model
  const demoModel = tf.sequential({
    layers: [
      // Global average pooling to reduce dimensions
      tf.layers.globalAveragePooling2d({
        inputShape: [224, 224, 3]
      }),
      // Dense layer with random weights
      tf.layers.dense({
        units: 128,
        activation: 'relu'
      }),
      // Output layer with softmax
      tf.layers.dense({
        units: numClasses,
        activation: 'softmax'
      })
    ]
  })
  
  // Initialize with random weights
  demoModel.compile({
    optimizer: 'adam',
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  })
  
  console.log(`Demo model for ${modality} created successfully`)
  return demoModel
}

/**
 * Create a mock model for testing when real model is not available
 */
function createMockModel() {
  return {
    predict: async (input) => {
      try {
        console.log('Mock model predict called with input shape:', input.shape)
        
        // Mock prediction that returns random logits (before softmax)
        const batchSize = input.shape ? input.shape[0] : 1
        const numClasses = 2
        
        console.log('Creating mock predictions for batch size:', batchSize)
        
        // Create random logits
        const logits = []
        for (let i = 0; i < batchSize; i++) {
          const logit1 = Math.random() * 10 - 5 // Random between -5 and 5
          const logit2 = Math.random() * 10 - 5
          logits.push([logit1, logit2])
        }
        
        console.log('Mock logits created:', logits)
        const result = tf.tensor2d(logits)
        console.log('Mock tensor created with shape:', result.shape)
        
        return result
      } catch (error) {
        console.error('Mock model prediction error:', error)
        throw error
      }
    }
  }
}

/**
 * Validate model directory and files
 */
function validateModelFiles(modelDir) {
  const modelPath = path.join(modelDir, 'model.json')
  const labelsPath = path.join(modelDir, 'labels.json')
  
  console.log('Validating model directory:', modelDir)
  
  // Check model.json exists
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model not found at ${pathToFileURL(modelPath).href}`)
  }
  
  // Check labels.json exists
  if (!fs.existsSync(labelsPath)) {
    throw new Error(`Missing labels.json in ${modelDir}`)
  }
  
  // Parse and validate labels.json
  let labelsData
  try {
    const labelsContent = fs.readFileSync(labelsPath, 'utf8')
    labelsData = JSON.parse(labelsContent)
    if (!Array.isArray(labelsData) || labelsData.length === 0) {
      throw new Error('labels.json must be a non-empty array')
    }
  } catch (error) {
    throw new Error(`Invalid labels.json: ${error.message}`)
  }
  
  // Parse model.json and validate weight files
  try {
    const modelContent = fs.readFileSync(modelPath, 'utf8')
    const modelData = JSON.parse(modelContent)
    
    if (modelData.weightsManifest) {
      for (const manifest of modelData.weightsManifest) {
        for (const weight of manifest.weights) {
          const weightPath = path.join(modelDir, weight.name)
          if (!fs.existsSync(weightPath)) {
            throw new Error(`Weight file missing: ${weight.name} in ${modelDir}`)
          }
        }
      }
    }
  } catch (error) {
    throw new Error(`Invalid model.json or weights missing: ${error.message}`)
  }
  
  console.log('Model validation passed:', labelsData.length, 'classes')
  return labelsData
}

/**
 * Load TensorFlow.js model and labels for a specific modality
 * Uses singleton pattern to cache loaded models
 */
export async function loadModelForModality(modality) {
  if (models[modality] && models[modality].model && models[modality].labels) {
    return models[modality]
  }

  const useDemoModel = process.env.USE_DEMO_MODEL === 'true'

  try {
    // Get model configuration from registry
    const config = getModelConfig(modality)
    const modelDir = path.resolve(config.dir)
    
    // Validate model files
    const labelsData = validateModelFiles(modelDir)
    
    const modelPath = path.join(modelDir, 'model.json')
    const modelUrl = pathToFileURL(modelPath).href
    
    console.log(`Loading ${modality} model from ${modelUrl}`)
    const loadedModel = await tf.loadLayersModel(modelUrl)
    
    // Verify labels length matches model output size
    if (loadedModel && loadedModel.outputs && loadedModel.outputs.length > 0) {
      const expectedOutputSize = loadedModel.outputs[0].shape[loadedModel.outputs[0].shape.length - 1]
      if (labelsData.length !== expectedOutputSize) {
        throw new Error(`${modality} labels length (${labelsData.length}) does not match model output (${expectedOutputSize})`)
      }
    }
    
    // Cache the model
    models[modality] = {
      model: loadedModel,
      labels: labelsData,
      inputSize: config.inputSize,
      isDemo: false
    }
    
    console.log(`Loaded TFJS ${modality} model from ${modelUrl} (classes: ${labelsData.length})`)
    return models[modality]
    
  } catch (error) {
    if (useDemoModel) {
      console.warn(`WARN: Using DEMO ${modality} model (randomly-initialized) — results are not clinical`)
      console.warn(`Real ${modality} model error:`, error.message)
      
      // Create demo model with modality-specific labels
      const defaultLabels = getDefaultLabels(modality)
      const demoModel = createDemoModel(modality, defaultLabels.length)
      
      // Cache the demo model
      models[modality] = {
        model: demoModel,
        labels: defaultLabels,
        inputSize: 224,
        isDemo: true
      }
      
      console.log(`${modality} demo model loaded successfully`)
      return models[modality]
    } else {
      // Re-throw with clear error message
      throw new Error(`Failed to load ${modality} model: ${error.message}`)
    }
  }
}

/**
 * Preprocess image buffer for model prediction
 * Resizes to 224x224, normalizes to 0-1, adds batch dimension
 */
async function preprocessImage(buffer) {
  try {
    // Use sharp to resize and normalize image
    const processedBuffer = await sharp(buffer)
      .resize(224, 224, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer()

    // Convert to tensor and normalize
    const tensor = tf.tensor3d(new Uint8Array(processedBuffer), [224, 224, 3])
    const normalized = tensor.div(255.0) // Normalize to 0-1
    const batched = normalized.expandDims(0) // Add batch dimension [1, 224, 224, 3]

    // Clean up intermediate tensors
    tensor.dispose()
    normalized.dispose()

    return batched
  } catch (error) {
    throw new Error(`Image preprocessing failed: ${error.message}`)
  }
}

/**
 * Run softmax on prediction logits and map to labels
 */
function processPredictions(predictions, labels, topK = 5) {
  // Apply softmax to get probabilities
  const probabilities = tf.softmax(predictions)
  const probArray = probabilities.dataSync()
  
  // Create label-score pairs
  const results = labels.map((label, index) => ({
    label,
    score: parseFloat(probArray[index].toFixed(4))
  }))

  // Sort by score (descending)
  results.sort((a, b) => b.score - a.score)

  // Clean up tensors
  probabilities.dispose()

  return {
    top1: results[0],
    topK: results.slice(0, topK)
  }
}

/**
 * Preprocess image for specific input size
 */
async function preprocessImageForSize(buffer, inputSize) {
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
 * Predict from image file for a specific modality
 * @param {string} filePath - Path to image file
 * @param {string} modality - Detected modality (e.g., XRAY_CHEST, MRI_BRAIN)
 * @returns {Object} - { top1: {label, score}, topK: [{label, score}] }
 */
export async function predictFromFile(filePath, modality) {
  try {
    console.log(`predictFromFile called for ${modality} from:`, filePath)
    
    // Check if modality is supported
    if (!isModalitySupported(modality)) {
      throw new Error(`Unsupported modality: ${modality}`)
    }
    
    // Load model for this modality
    const { model, labels, inputSize } = await loadModelForModality(modality)
    
    // Read image file
    const imageBuffer = fs.readFileSync(filePath)
    console.log(`Image buffer size: ${imageBuffer.length}`)

    // Preprocess image with correct input size
    const preprocessedImage = await preprocessImageForSize(imageBuffer, inputSize)
    console.log('Image preprocessing completed, shape:', preprocessedImage.shape)

    // Run prediction
    console.log(`Running ${modality} model prediction...`)
    const predictions = await model.predict(preprocessedImage)
    console.log(`${modality} model prediction completed, shape:`, predictions.shape)
    
    // Process results
    const results = processPredictions(predictions, labels)
    console.log(`${modality} predictions processed:`, results)

    // Clean up tensors
    preprocessedImage.dispose()
    predictions.dispose()

    console.log(`${modality} prediction completed. Top result: ${results.top1.label} (${results.top1.score})`)
    return results

  } catch (error) {
    console.error(`${modality} prediction error:`, error.message)
    console.error('Error stack:', error.stack)
    throw error
  }
}

/**
 * Predict from image buffer for a specific modality (legacy support)
 * @param {Buffer} buffer - Image file buffer
 * @param {string} modality - Modality (XRAY, SKIN, MRI)
 * @returns {Object} - { top1: {label, score}, topK: [{label, score}] }
 */
export async function predictFromBuffer(buffer, modality = 'XRAY') {
  try {
    console.log(`predictFromBuffer called for ${modality} with buffer size:`, buffer.length)
    
    // Check if modality is supported
    if (!isModalitySupported(modality)) {
      throw new Error(`Unsupported modality: ${modality}`)
    }
    
    // Load model for this modality
    const { model, labels, inputSize } = await loadModelForModality(modality)

    console.log('Starting image preprocessing...')
    // Preprocess image with correct input size
    const preprocessedImage = await preprocessImageForSize(buffer, inputSize)
    console.log('Image preprocessing completed, shape:', preprocessedImage.shape)

    // Run prediction
    console.log(`Running ${modality} model prediction...`)
    const predictions = await model.predict(preprocessedImage)
    console.log(`${modality} model prediction completed, shape:`, predictions.shape)
    
    // Process results
    console.log('Processing predictions...')
    const results = processPredictions(predictions, labels)
    console.log(`${modality} predictions processed:`, results)

    // Clean up tensors
    preprocessedImage.dispose()
    predictions.dispose()

    console.log(`${modality} prediction completed. Top result: ${results.top1.label} (${results.top1.score})`)
    return results

  } catch (error) {
    console.error(`${modality} prediction error:`, error.message)
    console.error('Error stack:', error.stack)
    throw error
  }
}

/**
 * Get model info for all modalities
 */
export function getModelInfo() {
  const info = {
    loaded: false,
    modelDir: path.resolve(env.modelDir),
    modalities: {}
  }
  
  // Check all registered modalities
  for (const modality of Object.keys(MODEL_REGISTRY)) {
    const modelData = models[modality]
    const config = MODEL_REGISTRY[modality]
    
    info.modalities[modality] = {
      loaded: modelData && modelData.model !== null,
      usingDemoModel: modelData ? modelData.isDemo : false,
      labels: modelData ? modelData.labels : [],
      inputSize: modelData ? modelData.inputSize : config.inputSize,
      inputShape: modelData && modelData.model && modelData.model.inputs ? modelData.model.inputs[0].shape : [config.inputSize, config.inputSize, 3],
      outputShape: modelData && modelData.model && modelData.model.outputs ? modelData.model.outputs[0].shape : [1, modelData ? modelData.labels.length : 2],
      labelCount: modelData ? modelData.labels.length : 0,
      description: config.description
    }
    
    if (modelData && modelData.model) {
      info.loaded = true
    }
  }
  
  return info
}
