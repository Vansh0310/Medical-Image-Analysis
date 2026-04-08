# Model Training Guide

## Overview

This guide explains how to train MediScan AI models with real medical image datasets.

## Prerequisites

1. **Node.js** with TensorFlow.js Node backend
2. **Medical image dataset** organized in the required structure
3. **Sufficient computational resources** (GPU recommended for faster training)

## Dataset Structure

Organize your dataset in the following structure:

```
datasets/
  pneumonia/                    # Your dataset name
    train/
      Normal/
        image001.jpg
        image002.jpg
        ...
      Pneumonia/
        image001.jpg
        image002.jpg
        ...
    validation/                  # Optional, but recommended
      Normal/
        image001.jpg
        ...
      Pneumonia/
        image001.jpg
        ...
```

### Requirements:
- **Class-based folders**: Each class should be in its own folder
- **Image formats**: JPG, JPEG, PNG, BMP
- **Balanced dataset**: Try to have similar number of images per class
- **Validation set**: Recommended for monitoring training progress

## Training Command

### Basic Usage

```bash
cd api
npm run train -- --modality=XRAY_CHEST --data-dir=./datasets/pneumonia
```

### Full Options

```bash
npm run train -- \
  --modality=XRAY_CHEST \
  --data-dir=./datasets/pneumonia \
  --epochs=50 \
  --batch-size=32 \
  --learning-rate=0.001 \
  --output-dir=./models/pneumonia_trained
```

### Parameters

- `--modality`: Modality name (e.g., XRAY_CHEST, MRI_BRAIN)
- `--data-dir`: Path to your dataset directory (required)
- `--epochs`: Number of training epochs (default: 50)
- `--batch-size`: Batch size for training (default: 32)
- `--learning-rate`: Learning rate (default: 0.001)
- `--output-dir`: Where to save the trained model (default: `./models/{modality}_trained`)

## Model Architecture

The training script creates a CNN with:

- **Input**: 224x224x3 RGB images
- **Architecture**:
  - 4 Convolutional blocks with Batch Normalization
  - Global Average Pooling
  - 2 Dense layers with Dropout
  - Softmax output layer
- **Data Augmentation**: Random horizontal flip and rotation

## Training Process

1. **Data Loading**: Images are loaded and preprocessed
2. **Preprocessing**: Resize to 224x224, normalize to 0-1
3. **Model Creation**: CNN architecture is built
4. **Training**: Model is trained with validation monitoring
5. **Saving**: Model saved in TensorFlow.js format

## Output

After training, you'll get:

```
models/
  pneumonia_trained/
    model.json          # Model architecture
    weights.bin         # Trained weights
    labels.json         # Class labels
    training-info.json   # Training metadata
```

## Using the Trained Model

1. **Update .env file**:
   ```env
   MODEL_DIR=./models/pneumonia_trained
   # Or for specific modality:
   XRAY_CHEST_MODEL_DIR=./models/pneumonia_trained
   ```

2. **Restart API server**:
   ```bash
   npm run dev
   ```

3. **Test the model**: Upload an image through the web interface

## Example Training Session

```bash
# Prepare your dataset
mkdir -p datasets/pneumonia/train/Normal
mkdir -p datasets/pneumonia/train/Pneumonia
mkdir -p datasets/pneumonia/validation/Normal
mkdir -p datasets/pneumonia/validation/Pneumonia

# Copy your images to appropriate folders
# ...

# Train the model
cd api
npm run train -- --modality=XRAY_CHEST --data-dir=../datasets/pneumonia --epochs=50

# Output:
# === MediScan AI Model Training ===
# Loading training data...
# Found 2 classes: Normal, Pneumonia
#   Loading 500 images from class: Normal
#   Loading 500 images from class: Pneumonia
# Loaded 1000 images total
# 
# Creating model architecture...
# Starting training...
# Epoch 1/50
#   Loss: 0.6931, Accuracy: 0.5000
#   Val Loss: 0.6928, Val Accuracy: 0.5100
# ...
# ✅ Training completed successfully!
```

## Tips for Better Training

1. **Dataset Size**: 
   - Minimum: 100-200 images per class
   - Recommended: 1000+ images per class
   - More data = better generalization

2. **Data Quality**:
   - Use high-quality, properly labeled images
   - Ensure images are relevant to the task
   - Remove duplicates and low-quality images

3. **Class Balance**:
   - Try to have similar number of images per class
   - If imbalanced, consider data augmentation or class weights

4. **Validation Set**:
   - Use 20-30% of data for validation
   - Helps monitor overfitting

5. **Training Parameters**:
   - Start with default parameters
   - Adjust learning rate if loss doesn't decrease
   - Increase epochs if validation accuracy is still improving
   - Reduce batch size if you run out of memory

6. **Hardware**:
   - GPU significantly speeds up training
   - CPU training works but is slower
   - Monitor memory usage

## Troubleshooting

### Out of Memory
- Reduce `--batch-size` (try 16 or 8)
- Reduce image size (modify `inputSize` in script)
- Use fewer images

### Poor Accuracy
- Check dataset quality and labels
- Increase dataset size
- Try different learning rates
- Train for more epochs

### Slow Training
- Use GPU if available
- Reduce batch size
- Reduce number of images

## Using Feedback Data for Training

You can also use the feedback data collected from doctors:

```bash
# Export feedback data
npm run export-feedback -- --with-annotations

# Organize exported data into training structure
# Then train with the organized dataset
npm run train -- --data-dir=./datasets/from-feedback
```

## Next Steps

After training:
1. Evaluate model performance on test set
2. Fine-tune hyperparameters if needed
3. Deploy the trained model
4. Monitor performance in production
5. Collect feedback for future training iterations

## Important Notes

⚠️ **Medical AI Disclaimer**:
- Models should be validated by medical professionals
- Training data should be properly curated and labeled
- Models are tools to assist, not replace, medical judgment
- Ensure compliance with medical regulations and data privacy laws
