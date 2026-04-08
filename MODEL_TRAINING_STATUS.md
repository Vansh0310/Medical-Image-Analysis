# Model Training Status

## Summary

**No, the models have NOT been trained in this codebase.**

## Current Status

### 1. **Pre-trained Models Only**
- The application uses **pre-trained models** that are loaded from disk
- Models are stored in `api/models/` directory
- Currently available: `pneumonia_v1` model

### 2. **No Training Code**
- ❌ No training scripts exist
- ❌ No dataset loading/preparation code
- ❌ No training loops or optimization code
- ❌ No data feeding mechanisms for training

### 3. **Inference Only**
- ✅ The application only performs **inference** (predictions)
- ✅ Models are loaded and used for making predictions on new images
- ✅ No model training or fine-tuning happens

## How Models Work

### Model Loading Process:
1. Models are loaded from `api/models/{model_name}/` directory
2. Required files:
   - `model.json` - Model architecture (TensorFlow.js format)
   - `weights.bin` - Pre-trained weights
   - `labels.json` - Class labels (e.g., ["Normal", "Pneumonia"])

### Current Model:
- **Location**: `api/models/pneumonia_v1/`
- **Type**: Pre-trained TensorFlow.js model
- **Purpose**: Chest X-ray pneumonia detection
- **Labels**: Defined in `labels.json`

## Where Models Come From

Models are typically:
1. **Trained externally** (usually in Python with TensorFlow/Keras)
2. **Converted to TensorFlow.js format** using `tensorflowjs_converter`
3. **Placed in the models directory** for the application to use

## Demo Mode

If no real model is found, the application can use a **demo mode**:
- Creates a simple model with **random weights** (not trained)
- Used for UI testing only
- Results are **not clinical** and should not be used for real diagnosis

## Training Models (If Needed)

To train models, you would need to:

1. **Prepare training data**:
   - Collect labeled medical images
   - Organize into train/validation/test sets
   - Ensure proper data augmentation

2. **Train in Python** (recommended):
   ```python
   # Example training script (not in this codebase)
   import tensorflow as tf
   from tensorflow import keras
   
   # Load and preprocess data
   # Build model architecture
   # Compile with optimizer and loss
   # Train: model.fit(train_data, epochs=...)
   # Save model
   ```

3. **Convert to TensorFlow.js**:
   ```bash
   tensorflowjs_converter --input_format keras \
     model.h5 \
     output_directory/
   ```

4. **Place in models directory**:
   - Copy `model.json` and `weights.bin` to `api/models/{model_name}/`
   - Create `labels.json` with class names

## Data Collection for Future Training

The application **does collect data** that could be used for training:

1. **Doctor Feedback Module**:
   - Doctors can verify/correct predictions
   - Data includes: `finalLabel`, `correctness`, `notes`
   - Export script: `npm run export-feedback`

2. **Annotation Module**:
   - Doctors can annotate regions of interest
   - Annotations stored with exam IDs

3. **Export for Training**:
   ```bash
   cd api
   npm run export-feedback -- --with-annotations
   ```
   - Exports CSV with image paths and labels
   - Can be used to build training datasets

## Conclusion

- ✅ **Models are pre-trained** (trained elsewhere)
- ❌ **No training code** in this codebase
- ❌ **No data feeding for training** (only inference)
- ✅ **Data collection** for future training is available via feedback/annotations

The application is designed for **inference only** - using pre-trained models to make predictions on new medical images.
