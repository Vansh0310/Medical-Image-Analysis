import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import dotenv from 'dotenv'

// Import TensorFlow.js - try Node backend first for better performance
let tf
try {
  const tfjsNode = await import('@tensorflow/tfjs-node')
  tf = tfjsNode.default || tfjsNode
  console.log('Using @tensorflow/tfjs-node (GPU acceleration available)')
} catch (error) {
  console.warn('@tensorflow/tfjs-node not found, using @tensorflow/tfjs (CPU only, slower)')
  console.warn('Install with: npm install @tensorflow/tfjs-node')
  const tfjs = await import('@tensorflow/tfjs')
  tf = tfjs.default || tfjs
}

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') })

/**
 * Training script for MediScan AI models
 * 
 * Usage:
 *   node scripts/train-model.js --modality XRAY_CHEST --data-dir ./datasets/pneumonia --epochs 50
 * 
 * Dataset structure:
 *   datasets/
 *     pneumonia/
 *       train/
 *         Normal/
 *           image1.jpg
 *           image2.jpg
 *         Pneumonia/
 *           image1.jpg
 *           image2.jpg
 *       validation/
 *         Normal/
 *           image1.jpg
 *         Pneumonia/
 *           image1.jpg
 */

// Default configuration
const DEFAULT_CONFIG = {
  inputSize: 224,
  batchSize: 32,
  epochs: 50,
  learningRate: 0.001,
  validationSplit: 0.2,
  imageChannels: 3
}

/**
 * Load and preprocess image from file
 */
async function loadImage(filePath, inputSize) {
  try {
    const buffer = await sharp(filePath)
      .resize(inputSize, inputSize, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer()
    
    const tensor = tf.tensor3d(new Uint8Array(buffer), [inputSize, inputSize, 3])
    const normalized = tensor.div(255.0) // Normalize to 0-1
    
    tensor.dispose()
    return normalized
  } catch (error) {
    console.error(`Error loading image ${filePath}:`, error.message)
    return null
  }
}

/**
 * Load dataset from directory structure
 * Expected structure: dataDir/train/class1/, dataDir/train/class2/, etc.
 */
async function loadDataset(dataDir, inputSize, split = 'train') {
  const splitDir = path.join(dataDir, split)
  
  if (!fs.existsSync(splitDir)) {
    throw new Error(`Dataset directory not found: ${splitDir}`)
  }
  
  // Get all class directories
  const classDirs = fs.readdirSync(splitDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
  
  if (classDirs.length === 0) {
    throw new Error(`No class directories found in ${splitDir}`)
  }
  
  console.log(`Found ${classDirs.length} classes: ${classDirs.join(', ')}`)
  
  const images = []
  const labels = []
  
  // Load images from each class directory
  for (let classIndex = 0; classIndex < classDirs.length; classIndex++) {
    const className = classDirs[classIndex]
    const classDir = path.join(splitDir, className)
    
    // Get all image files
    const imageFiles = fs.readdirSync(classDir)
      .filter(file => /\.(jpg|jpeg|png|bmp)$/i.test(file))
      .map(file => path.join(classDir, file))
    
    console.log(`  Loading ${imageFiles.length} images from class: ${className}`)
    
    for (const imageFile of imageFiles) {
      const imageTensor = await loadImage(imageFile, inputSize)
      if (imageTensor) {
        images.push(imageTensor)
        labels.push(classIndex)
      }
    }
  }
  
  if (images.length === 0) {
    throw new Error(`No images loaded from ${splitDir}`)
  }
  
  console.log(`Loaded ${images.length} images total`)
  
  // Convert to tensors
  const imageTensor = tf.stack(images)
  const labelTensor = tf.oneHot(tf.tensor1d(labels, 'int32'), classDirs.length)
  
  // Clean up individual tensors
  images.forEach(img => img.dispose())
  
  return {
    images: imageTensor,
    labels: labelTensor,
    classNames: classDirs
  }
}

/**
 * Create model architecture
 */
function createModel(inputSize, numClasses) {
  console.log(`Creating model: input=${inputSize}x${inputSize}, classes=${numClasses}`)
  
  const model = tf.sequential({
    layers: [
      // Note: Data augmentation layers may not be available in all TF.js versions
      // We'll apply augmentation during data loading instead if needed
      
      // First convolutional block
      tf.layers.conv2d({
        filters: 32,
        kernelSize: 3,
        activation: 'relu',
        inputShape: [inputSize, inputSize, 3],
        padding: 'same'
      }),
      tf.layers.maxPooling2d({ poolSize: 2 }),
      tf.layers.batchNormalization(),
      
      // Second convolutional block
      tf.layers.conv2d({
        filters: 64,
        kernelSize: 3,
        activation: 'relu',
        padding: 'same'
      }),
      tf.layers.maxPooling2d({ poolSize: 2 }),
      tf.layers.batchNormalization(),
      
      // Third convolutional block
      tf.layers.conv2d({
        filters: 128,
        kernelSize: 3,
        activation: 'relu',
        padding: 'same'
      }),
      tf.layers.maxPooling2d({ poolSize: 2 }),
      tf.layers.batchNormalization(),
      
      // Fourth convolutional block
      tf.layers.conv2d({
        filters: 256,
        kernelSize: 3,
        activation: 'relu',
        padding: 'same'
      }),
      tf.layers.maxPooling2d({ poolSize: 2 }),
      tf.layers.batchNormalization(),
      
      // Global average pooling
      tf.layers.globalAveragePooling2d({
        dataFormat: 'channelsLast'
      }),
      
      // Dense layers
      tf.layers.dense({
        units: 512,
        activation: 'relu'
      }),
      tf.layers.dropout({ rate: 0.5 }),
      tf.layers.dense({
        units: 256,
        activation: 'relu'
      }),
      tf.layers.dropout({ rate: 0.3 }),
      
      // Output layer
      tf.layers.dense({
        units: numClasses,
        activation: 'softmax'
      })
    ]
  })
  
  return model
}

/**
 * Train the model
 */
async function trainModel(model, trainData, valData, config) {
  console.log('\n=== Training Configuration ===')
  console.log(`Epochs: ${config.epochs}`)
  console.log(`Batch Size: ${config.batchSize}`)
  console.log(`Learning Rate: ${config.learningRate}`)
  console.log(`Training samples: ${trainData.images.shape[0]}`)
  console.log(`Validation samples: ${valData.images.shape[0]}`)
  console.log('=============================\n')
  
  // Compile model
  model.compile({
    optimizer: tf.train.adam(config.learningRate),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  })
  
  // Print model summary
  model.summary()
  
  // Training callbacks
  const callbacks = {
    onEpochEnd: (epoch, logs) => {
      console.log(`Epoch ${epoch + 1}/${config.epochs}`)
      console.log(`  Loss: ${logs.loss.toFixed(4)}, Accuracy: ${logs.acc.toFixed(4)}`)
      if (logs.val_loss) {
        console.log(`  Val Loss: ${logs.val_loss.toFixed(4)}, Val Accuracy: ${logs.val_acc.toFixed(4)}`)
      }
      console.log('')
    }
  }
  
  // Train the model
  console.log('Starting training...\n')
  const history = await model.fit(trainData.images, trainData.labels, {
    batchSize: config.batchSize,
    epochs: config.epochs,
    validationData: valData ? [valData.images, valData.labels] : undefined,
    callbacks: callbacks,
    shuffle: true
  })
  
  return history
}

/**
 * Save model in TensorFlow.js format
 */
async function saveModel(model, outputDir, classNames) {
  console.log(`\nSaving model to ${outputDir}...`)
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
  
  // Save model
  await model.save(`file://${outputDir}`)
  console.log(`Model saved to ${outputDir}`)
  
  // Save labels
  const labelsPath = path.join(outputDir, 'labels.json')
  fs.writeFileSync(labelsPath, JSON.stringify(classNames, null, 2))
  console.log(`Labels saved to ${labelsPath}`)
  
  // Save training info
  const infoPath = path.join(outputDir, 'training-info.json')
  const info = {
    classes: classNames,
    numClasses: classNames.length,
    inputSize: DEFAULT_CONFIG.inputSize,
    trainedAt: new Date().toISOString()
  }
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2))
  console.log(`Training info saved to ${infoPath}`)
}

/**
 * Main training function
 */
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2)
    const modality = args.find(arg => arg.startsWith('--modality='))?.split('=')[1] || 'XRAY_CHEST'
    const dataDir = args.find(arg => arg.startsWith('--data-dir='))?.split('=')[1]
    const epochs = parseInt(args.find(arg => arg.startsWith('--epochs='))?.split('=')[1] || '50')
    const batchSize = parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '32')
    const learningRate = parseFloat(args.find(arg => arg.startsWith('--learning-rate='))?.split('=')[1] || '0.001')
    const outputDir = args.find(arg => arg.startsWith('--output-dir='))?.split('=')[1]
    
    if (!dataDir) {
      console.error('Error: --data-dir is required')
      console.error('\nUsage:')
      console.error('  node scripts/train-model.js --modality=XRAY_CHEST --data-dir=./datasets/pneumonia [options]')
      console.error('\nOptions:')
      console.error('  --modality=MODALITY     Modality name (default: XRAY_CHEST)')
      console.error('  --data-dir=DIR         Path to dataset directory')
      console.error('  --epochs=N             Number of epochs (default: 50)')
      console.error('  --batch-size=N         Batch size (default: 32)')
      console.error('  --learning-rate=N      Learning rate (default: 0.001)')
      console.error('  --output-dir=DIR       Output directory (default: ./models/{modality}_trained)')
      console.error('\nDataset structure:')
      console.error('  data-dir/')
      console.error('    train/')
      console.error('      Class1/')
      console.error('        image1.jpg')
      console.error('        image2.jpg')
      console.error('      Class2/')
      console.error('        image1.jpg')
      console.error('    validation/')
      console.error('      Class1/')
      console.error('      Class2/')
      process.exit(1)
    }
    
    const config = {
      ...DEFAULT_CONFIG,
      epochs,
      batchSize,
      learningRate
    }
    
    const finalOutputDir = outputDir || path.resolve('api', 'models', `${modality.toLowerCase()}_trained`)
    
    console.log('=== MediScan AI Model Training ===\n')
    console.log(`Modality: ${modality}`)
    console.log(`Data Directory: ${dataDir}`)
    console.log(`Output Directory: ${finalOutputDir}`)
    console.log('')
    
    // Load training data
    console.log('Loading training data...')
    const trainData = await loadDataset(dataDir, config.inputSize, 'train')
    
    // Load validation data (if exists)
    let valData = null
    const valDir = path.join(dataDir, 'validation')
    if (fs.existsSync(valDir)) {
      console.log('\nLoading validation data...')
      valData = await loadDataset(dataDir, config.inputSize, 'validation')
    } else {
      console.log('\nNo validation directory found. Will use validation split from training data.')
    }
    
    // Create model
    console.log('\nCreating model architecture...')
    const model = createModel(config.inputSize, trainData.classNames.length)
    
    // Train model
    await trainModel(model, trainData, valData, config)
    
    // Save model
    await saveModel(model, finalOutputDir, trainData.classNames)
    
    // Clean up
    trainData.images.dispose()
    trainData.labels.dispose()
    if (valData) {
      valData.images.dispose()
      valData.labels.dispose()
    }
    
    console.log('\n✅ Training completed successfully!')
    console.log(`\nModel saved to: ${finalOutputDir}`)
    console.log('\nTo use this model, update your .env file:')
    console.log(`  MODEL_DIR=${finalOutputDir}`)
    console.log(`  Or set XRAY_CHEST_MODEL_DIR=${finalOutputDir}`)
    
  } catch (error) {
    console.error('\n❌ Training failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run training
main()
