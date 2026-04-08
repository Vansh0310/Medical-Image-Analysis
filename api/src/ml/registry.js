import path from 'path'
import { env } from '../config/env.js'

/**
 * Model Registry - Maps detected modalities to their corresponding disease classifier models
 */
export const MODEL_REGISTRY = {
  'XRAY_CHEST': {
    dir: env.xrayChestModelDir || path.resolve(env.modelDir, 'xray_pneumonia_v1'),
    inputSize: 224,
    description: 'Pneumonia detection from chest X-ray'
  },
  'MRI_BRAIN': {
    dir: env.mriBrainModelDir || path.resolve(env.modelDir, 'brain_tumor_v1'),
    inputSize: 224,
    description: 'Brain tumor detection from MRI'
  },
  'MRI_SPINE': {
    dir: env.mriSpineModelDir || path.resolve(env.modelDir, 'spine_v1'),
    inputSize: 224,
    description: 'Spine abnormality detection from MRI'
  },
  'MRI_KNEE': {
    dir: env.mriKneeModelDir || path.resolve(env.modelDir, 'knee_v1'),
    inputSize: 224,
    description: 'Knee abnormality detection from MRI'
  },
  'SKIN_DERMOSCOPY': {
    dir: env.skinModelDir || path.resolve(env.modelDir, 'skin_v1'),
    inputSize: 224,
    description: 'Skin lesion classification from dermoscopy'
  },
  'CT_CHEST': {
    dir: env.ctChestModelDir || path.resolve(env.modelDir, 'ct_chest_v1'),
    inputSize: 224,
    description: 'Chest abnormality detection from CT'
  }
}

/**
 * Get model configuration for a specific modality
 */
export function getModelConfig(modality) {
  const config = MODEL_REGISTRY[modality]
  if (!config) {
    throw new Error(`No model configured for modality: ${modality}`)
  }
  return config
}

/**
 * Get all available modalities
 */
export function getAvailableModalities() {
  return Object.keys(MODEL_REGISTRY)
}

/**
 * Check if a modality is supported
 */
export function isModalitySupported(modality) {
  return modality in MODEL_REGISTRY
}
