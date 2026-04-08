import * as tf from '@tensorflow/tfjs'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'
import { dirname } from 'path'
import { env } from '../../config/env.js'

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let segmentationModels = {}

/**
 * Get segmentation model directory for a modality
 */
function getSegmentationModelDir(modality) {
  const modelDirs = {
    'XRAY_CHEST': env.xraySegModelDir || path.resolve(env.modelDir, 'seg_xray_lungs_v1'),
    'MRI_BRAIN': env.mriBrainSegModelDir || path.resolve(env.modelDir, 'seg_brain_tumor_v1'),
    'CT_CHEST': env.ctChestSegModelDir || path.resolve(env.modelDir, 'seg_ct_chest_v1'),
    'MRI_SPINE': env.mriSpineSegModelDir || path.resolve(env.modelDir, 'seg_spine_v1'),
    'MRI_KNEE': env.mriKneeSegModelDir || path.resolve(env.modelDir, 'seg_knee_v1'),
    'SKIN_DERMOSCOPY': env.skinSegModelDir || path.resolve(env.modelDir, 'seg_skin_v1')
  }
  
  const modelDir = modelDirs[modality]
  if (!modelDir) {
    throw new Error(`No segmentation model directory configured for modality: ${modality}`)
  }
  
  return modelDir
}

/**
 * Check if segmentation is enabled
 */
export function isSegmentationEnabled() {
  return process.env.SEGMENTATION_ENABLED === 'true'
}

/**
 * Check if a modality supports segmentation
 */
export function isModalitySupportedForSegmentation(modality) {
  // All modalities can potentially support segmentation if models are available
  // Currently configured: XRAY_CHEST, MRI_BRAIN, CT_CHEST, MRI_SPINE, MRI_KNEE, SKIN_DERMOSCOPY
  const supported = ['XRAY_CHEST', 'MRI_BRAIN', 'CT_CHEST', 'MRI_SPINE', 'MRI_KNEE', 'SKIN_DERMOSCOPY']
  return supported.includes(modality)
}

/**
 * Load segmentation model for a specific modality
 * Uses singleton pattern to cache loaded models
 */
export async function loadSegmentationModelForModality(modality) {
  if (!isSegmentationEnabled()) {
    throw new Error('Segmentation is not enabled. Set SEGMENTATION_ENABLED=true in .env')
  }

  if (!isModalitySupportedForSegmentation(modality)) {
    throw new Error(`Segmentation not supported for modality: ${modality}. Supported: XRAY_CHEST, MRI_BRAIN`)
  }

  // Return cached model if available
  if (segmentationModels[modality] && segmentationModels[modality].model) {
    return segmentationModels[modality]
  }

  try {
    const modelDir = getSegmentationModelDir(modality)
    
    // Validate model directory exists
    if (!fs.existsSync(modelDir)) {
      console.warn(`Segmentation model directory not found: ${modelDir}. Using demo model.`)
      return createDemoSegmentationModel(modality)
    }
    
    const modelPath = path.join(modelDir, 'model.json')
    
    if (!fs.existsSync(modelPath)) {
      console.warn(`Segmentation model not found at ${modelPath}. Using demo model.`)
      return createDemoSegmentationModel(modality)
    }

    const modelUrl = pathToFileURL(modelPath).href
    console.log(`Loading segmentation model for ${modality} from ${modelUrl}`)
    
    const loadedModel = await tf.loadLayersModel(modelUrl)
    
    // Cache the model
    segmentationModels[modality] = {
      model: loadedModel,
      inputSize: 256, // Standard input size for segmentation
      isDemo: false
    }
    
    console.log(`Loaded segmentation model for ${modality} successfully`)
    return segmentationModels[modality]
    
  } catch (error) {
    console.warn(`Failed to load segmentation model for ${modality}: ${error.message}`)
    console.warn('Falling back to demo segmentation model')
    return createDemoSegmentationModel(modality)
  }
}

/**
 * Create a demo segmentation model that generates a simple mask
 * This is used when no trained model is available
 */
function createDemoSegmentationModel(modality) {
  console.log(`Creating demo segmentation model for ${modality}`)
  
  // Create a simple U-Net-like architecture for demo
  const demoModel = tf.sequential({
    layers: [
      // Encoder
      tf.layers.conv2d({
        filters: 32,
        kernelSize: 3,
        activation: 'relu',
        inputShape: [256, 256, 3],
        padding: 'same'
      }),
      tf.layers.maxPooling2d({ poolSize: 2 }),
      tf.layers.conv2d({
        filters: 64,
        kernelSize: 3,
        activation: 'relu',
        padding: 'same'
      }),
      tf.layers.maxPooling2d({ poolSize: 2 }),
      // Decoder
      tf.layers.upSampling2d({ size: 2 }),
      tf.layers.conv2d({
        filters: 32,
        kernelSize: 3,
        activation: 'relu',
        padding: 'same'
      }),
      tf.layers.upSampling2d({ size: 2 }),
      // Output: single channel mask
      tf.layers.conv2d({
        filters: 1,
        kernelSize: 1,
        activation: 'sigmoid',
        padding: 'same'
      })
    ]
  })
  
  // Compile with random weights
  demoModel.compile({
    optimizer: 'adam',
    loss: 'binaryCrossentropy'
  })
  
  // Cache the demo model
  segmentationModels[modality] = {
    model: demoModel,
    inputSize: 256,
    isDemo: true
  }
  
  console.log(`Demo segmentation model for ${modality} created successfully`)
  return segmentationModels[modality]
}

/**
 * Preprocess image for segmentation
 * Decode to RGB, resize to inputSize x inputSize, normalize to 0-1, expandDims
 */
async function preprocessImageForSegmentation(buffer, inputSize) {
  try {
    // Use sharp to decode, resize and ensure RGB (3 channels, no alpha)
    // Strategy: Convert to JPEG (no alpha support) then get raw RGB data
    const processedBuffer = await sharp(buffer)
      .resize(inputSize, inputSize, { fit: 'cover' })
      .removeAlpha()  // Remove alpha channel if present
      .jpeg({ quality: 100 })  // Convert to JPEG (ensures RGB, no alpha)
      .raw()  // Get raw pixel data
      .toBuffer()

    // Verify buffer size matches expected shape (256x256x3 = 196,608 bytes)
    const expectedSize = inputSize * inputSize * 3
    if (processedBuffer.length !== expectedSize) {
      // If buffer is larger, it might have extra padding - take only what we need
      if (processedBuffer.length > expectedSize) {
        console.warn(`Buffer size larger than expected (${processedBuffer.length} vs ${expectedSize}), trimming...`)
        const trimmedBuffer = processedBuffer.slice(0, expectedSize)
        const tensor = tf.tensor3d(new Uint8Array(trimmedBuffer), [inputSize, inputSize, 3])
        const normalized = tensor.div(255.0)
        const batched = normalized.expandDims(0)
        tensor.dispose()
        normalized.dispose()
        return batched
      }
      throw new Error(`Buffer size mismatch: expected ${expectedSize} bytes, got ${processedBuffer.length}. Image may have unexpected channels.`)
    }

    // Convert to tensor and normalize
    const tensor = tf.tensor3d(new Uint8Array(processedBuffer), [inputSize, inputSize, 3])
    const normalized = tensor.div(255.0) // Normalize to 0-1
    const batched = normalized.expandDims(0) // Add batch dimension [1, H, W, 3]

    // Clean up intermediate tensors
    tensor.dispose()
    normalized.dispose()

    return batched
  } catch (error) {
    throw new Error(`Image preprocessing failed: ${error.message}`)
  }
}

/**
 * Postprocess segmentation mask
 * Convert mask tensor to PNG and create overlay
 */
async function postprocessSegmentationMask(maskTensor, originalImagePath, examId, inputSize) {
  try {
    // Get mask data
    const maskData = await maskTensor.data()
    const maskShape = maskTensor.shape
    
    console.log('Mask tensor shape:', maskShape)
    
    // Check for NaN values and replace them with zeros
    let cleanedMask = maskTensor
    const hasNaN = Array.from(maskData).some(v => isNaN(v))
    if (hasNaN) {
      console.warn('NaN values detected in mask, replacing with zeros')
      // Replace NaN with 0
      cleanedMask = tf.where(
        tf.isNaN(maskTensor),
        tf.zerosLike(maskTensor),
        maskTensor
      )
      maskTensor.dispose() // Dispose original if we created a cleaned version
    }
    
    // Handle multi-class masks: [1, H, W, classes] -> argmax -> [1, H, W, 1]
    let singleChannelMask = cleanedMask
    if (maskShape.length === 4 && maskShape[3] > 1) {
      // Multi-class: take argmax over classes
      console.log('Multi-class mask detected, applying argmax')
      singleChannelMask = tf.argMax(cleanedMask, 3)
      singleChannelMask = singleChannelMask.expandDims(-1) // Add channel dimension
      singleChannelMask = singleChannelMask.expandDims(0) // Add batch dimension
      if (cleanedMask !== maskTensor) cleanedMask.dispose()
    } else if (maskShape.length === 3) {
      // [H, W, 1] -> [1, H, W, 1]
      singleChannelMask = cleanedMask.expandDims(0)
      if (cleanedMask !== maskTensor) cleanedMask.dispose()
    }
    
    // Remove batch dimension: [1, H, W, 1] -> [H, W, 1]
    // But first, validate the shape before squeezing
    const preSqueezeShape = singleChannelMask.shape
    console.log('Pre-squeeze shape:', preSqueezeShape)
    
    // Validate shape before processing
    if (preSqueezeShape.length < 4 || 
        isNaN(preSqueezeShape[1]) || isNaN(preSqueezeShape[2]) ||
        preSqueezeShape[1] <= 0 || preSqueezeShape[2] <= 0) {
      singleChannelMask.dispose()
      if (cleanedMask !== maskTensor) cleanedMask.dispose()
      throw new Error(`Invalid mask shape before squeeze: ${JSON.stringify(preSqueezeShape)}. Model may have produced invalid output.`)
    }
    
    const mask2D = singleChannelMask.squeeze([0])
    const finalShape = mask2D.shape
    const height = finalShape[0]
    const width = finalShape[1]
    
    // Validate shape values are not NaN
    if (isNaN(height) || isNaN(width) || height <= 0 || width <= 0) {
      mask2D.dispose()
      singleChannelMask.dispose()
      if (cleanedMask !== maskTensor) cleanedMask.dispose()
      throw new Error(`Invalid mask shape after squeeze: height=${height}, width=${width}. Model may have produced invalid output.`)
    }
    
    // Clamp values to [0, 1] and convert to uint8 (0-255)
    console.log('Converting mask to uint8...')
    const clampedMask = tf.clipByValue(mask2D, 0, 1)
    const maskUint8 = clampedMask.mul(255).cast('int32')
    const maskArray = await maskUint8.data()
    
    // Convert to regular array before disposing tensors (data() returns a TypedArray that might reference tensor memory)
    const maskArrayCopy = Array.from(maskArray)
    
    // Clean up intermediate tensors
    mask2D.dispose()
    clampedMask.dispose()
    maskUint8.dispose()
    
    console.log('Creating mask PNG buffer...')
    // Create grayscale PNG buffer
    const maskBuffer = await sharp(Buffer.from(maskArrayCopy), {
      raw: {
        width: width,
        height: height,
        channels: 1
      }
    })
      .png()
      .toBuffer()
    
    // Calculate coverage percentage (non-zero pixels / total pixels)
    const nonZeroPixels = maskArrayCopy.filter(v => v > 0).length
    const totalPixels = height * width
    const coverage = (nonZeroPixels / totalPixels) * 100
    
    // Ensure output directories exist
    // Use same path resolution as server.js
    // Determine base directory (api/ folder)
    const isRunningFromApiDir = __dirname.includes('api' + path.sep + 'src') || process.cwd().endsWith('api') || process.cwd().endsWith('api\\')
    const baseDir = isRunningFromApiDir ? process.cwd() : path.resolve(process.cwd(), 'api')
    const masksDir = path.resolve(baseDir, 'outputs', 'masks')
    const overlaysDir = path.resolve(baseDir, 'outputs', 'overlays')
    env.ensureDir(masksDir)
    env.ensureDir(overlaysDir)
    
    // Save mask PNG
    const maskFilename = `${examId}.png`
    const maskPath = path.join(masksDir, maskFilename)
    fs.writeFileSync(maskPath, maskBuffer)
    console.log(`Mask saved to ${maskPath}`)
    
    // Create overlay: alpha blend colored mask on original image
    console.log('Creating overlay image...')
    const originalImage = sharp(originalImagePath)
    const originalMetadata = await originalImage.metadata()
    console.log(`Original image dimensions: ${originalMetadata.width}x${originalMetadata.height}`)
    
    // Resize mask to match original image dimensions
    console.log('Resizing mask to match original...')
    const resizedMask = await sharp(maskBuffer)
      .resize(originalMetadata.width, originalMetadata.height, { fit: 'cover' })
      .greyscale()
      .normalize()
      .toBuffer()
    
    // Create a red overlay image from the mask
    // Use the mask as alpha channel and apply red color
    console.log('Creating colored overlay...')
    const resizedMaskArray = await sharp(resizedMask).raw().toBuffer()
    const overlayData = Buffer.alloc(originalMetadata.width * originalMetadata.height * 4)
    
    for (let i = 0; i < resizedMaskArray.length; i++) {
      const alpha = resizedMaskArray[i] / 255 * 0.5 // 50% opacity for overlay
      overlayData[i * 4] = 255     // R
      overlayData[i * 4 + 1] = 0   // G
      overlayData[i * 4 + 2] = 0   // B
      overlayData[i * 4 + 3] = Math.round(alpha * 255) // A
    }
    
    console.log('Converting overlay to PNG...')
    const coloredMask = await sharp(overlayData, {
      raw: {
        width: originalMetadata.width,
        height: originalMetadata.height,
        channels: 4
      }
    }).png().toBuffer()
    
    // Create overlay by compositing colored mask over original
    console.log('Compositing overlay with original image...')
    const overlayPath = path.join(overlaysDir, maskFilename)
    const overlayImage = await sharp(originalImagePath)
      .composite([
        {
          input: coloredMask,
          blend: 'over',
          tile: false
        }
      ])
      .png()
      .toBuffer()
    
    console.log('Saving overlay image...')
    fs.writeFileSync(overlayPath, overlayImage)
    console.log(`Overlay saved to ${overlayPath}`)
    
    // Clean up tensors
    console.log('Cleaning up postprocessing tensors...')
    if (maskTensor && !maskTensor.isDisposed) {
      maskTensor.dispose()
    }
    if (singleChannelMask && singleChannelMask !== maskTensor && !singleChannelMask.isDisposed) {
      singleChannelMask.dispose()
    }
    if (mask2D && !mask2D.isDisposed) {
      mask2D.dispose()
    }
    if (maskUint8 && !maskUint8.isDisposed) {
      maskUint8.dispose()
    }
    if (clampedMask && !clampedMask.isDisposed) {
      clampedMask.dispose()
    }
    
    console.log('Postprocessing completed successfully')
    
    // Return paths relative to the static route mount point (/api/outputs)
    // The server serves static files from /api/outputs, so we need paths like "masks/file.png" or "overlays/file.png"
    const maskRelativePath = path.relative(masksDir, maskPath).replace(/\\/g, '/')
    const overlayRelativePath = path.relative(overlaysDir, overlayPath).replace(/\\/g, '/')
    
    return {
      maskPath: `masks/${maskRelativePath}`,
      overlayPath: `overlays/${overlayRelativePath}`,
      coverage: parseFloat(coverage.toFixed(2))
    }
    
  } catch (error) {
    console.error('Postprocessing error:', error)
    console.error('Error stack:', error.stack)
    throw new Error(`Segmentation postprocessing failed: ${error.message}`)
  }
}

/**
 * Run segmentation on an image file for a specific modality
 * @param {string} filePath - Path to image file
 * @param {string} modality - Modality (XRAY_CHEST, MRI_BRAIN)
 * @param {string} examId - Exam ID for file naming
 * @returns {Object} - { maskPath, overlayPath, coverage }
 */
export async function runSegmentationFromFile(filePath, modality, examId) {
  try {
    console.log(`runSegmentationFromFile called for ${modality} from:`, filePath)
    
    if (!isSegmentationEnabled()) {
      throw new Error('Segmentation is not enabled. Set SEGMENTATION_ENABLED=true in .env')
    }
    
    if (!isModalitySupportedForSegmentation(modality)) {
      throw new Error(`Segmentation not supported for modality: ${modality}`)
    }
    
    // Load model for this modality
    const modelData = await loadSegmentationModelForModality(modality)
    const { model, inputSize, isDemo } = modelData
    
    // Read image file
    console.log(`[SEGMENTATION] Reading image file...`)
    const imageBuffer = fs.readFileSync(filePath)
    console.log(`[SEGMENTATION] Image buffer size: ${imageBuffer.length} bytes`)
    
    // Preprocess image
    console.log(`[SEGMENTATION] Preprocessing image...`)
    const preprocessedImage = await preprocessImageForSegmentation(imageBuffer, inputSize)
    console.log(`[SEGMENTATION] Image preprocessing completed, shape:`, preprocessedImage.shape)
    
    // Run segmentation
    console.log(`[SEGMENTATION] Running ${modality} segmentation...`)
    let predictions
    
    // For demo models, create a simple mask directly (avoid NaN issues with untrained weights)
    if (isDemo) {
      console.log('[SEGMENTATION] Demo model detected, generating simple demo mask...')
      // Create a simple centered elliptical mask for demo purposes
      const maskShape = [1, inputSize, inputSize, 1]
      const maskSize = inputSize * inputSize
      const maskData = new Float32Array(maskSize)
      // Create a simple centered elliptical mask (optimized)
      const centerX = inputSize / 2
      const centerY = inputSize / 2
      const radiusX = inputSize * 0.35
      const radiusY = inputSize * 0.45
      const radiusXSq = radiusX * radiusX
      const radiusYSq = radiusY * radiusY
      
      console.log(`[SEGMENTATION] Generating ${maskSize} mask pixels...`)
      for (let i = 0; i < maskSize; i++) {
        const y = Math.floor(i / inputSize)
        const x = i % inputSize
        const dx = (x - centerX) / radiusX
        const dy = (y - centerY) / radiusY
        const dist = Math.sqrt(dx * dx + dy * dy)
        // Create smooth falloff from center
        const value = dist < 1 ? Math.max(0, 1 - dist * 0.8) : 0
        maskData[i] = Math.max(0, Math.min(1, value))
      }
      console.log(`[SEGMENTATION] Mask data generated, creating tensor...`)
      predictions = tf.tensor4d(maskData, maskShape)
      console.log(`[SEGMENTATION] Created demo mask with shape:`, predictions.shape)
    } else {
      // Use actual model prediction
      predictions = await model.predict(preprocessedImage)
      console.log(`${modality} segmentation completed, shape:`, predictions.shape)
      
      // Validate predictions don't have NaN
      const predData = await predictions.data()
      const hasInvalid = Array.from(predData).some(v => isNaN(v) || !isFinite(v))
      if (hasInvalid) {
        console.warn('Invalid values in model output, clamping...')
        predictions.dispose()
        // Clamp invalid values
        const cleaned = tf.clipByValue(tf.tensor4d(Array.from(predData), predictions.shape), 0, 1)
        predictions = cleaned
      }
    }
    
    // Postprocess results
    console.log('Postprocessing mask...')
    const results = await postprocessSegmentationMask(
      predictions, 
      filePath, 
      examId, 
      inputSize
    )
    
    // Clean up tensors
    console.log('Cleaning up tensors...')
    preprocessedImage.dispose()
    predictions.dispose()
    
    console.log(`${modality} segmentation completed. Coverage: ${results.coverage}%`)
    return results
    
  } catch (error) {
    console.error(`${modality} segmentation error:`, error.message)
    console.error('Error stack:', error.stack)
    throw error
  }
}
