/**
 * Simple rules engine that combines AI predictions with questionnaire data
 * @param {Object} params - { top1: {label, score}, q: questionnaire, modality: string }
 * @returns {Object} - { diagnosis, confidence, reason }
 */
export function applyRules({ top1, q, modality = 'XRAY' }) {
  // Default fallback
  const defaultResult = {
    diagnosis: top1.label,
    confidence: top1.score,
    reason: "Diagnosis based on model prediction"
  }

  // Ensure we have questionnaire data
  if (!q) {
    return defaultResult
  }

  // Normalize label to lowercase for comparison
  const label = top1.label.toLowerCase()

  // Modality-specific rules
  if (modality === 'XRAY_CHEST') {
    // Rule 1: Pneumonia with clinical symptoms
    if (
      (label === 'pneumonia' || label === 'consolidation') &&
      q.fever === 'yes' &&
      q.cough === 'yes' &&
      q.duration_days >= 2
    ) {
      return {
        diagnosis: "Pneumonia likely",
        confidence: Math.min(1, top1.score + 0.10),
        reason: "Fever + cough ≥2 days with imaging pattern"
      }
    }

    // Rule 2: Normal with concerning symptoms (lower confidence)
    if (
      label === 'normal' &&
      q.fever === 'yes' &&
      q.duration_days >= 5
    ) {
      return {
        diagnosis: "Normal (clinical review recommended)",
        confidence: Math.max(0, top1.score - 0.15),
        reason: "Normal imaging but persistent fever ≥5 days"
      }
    }

    // Rule 3: Pneumonia without typical symptoms (lower confidence)
    if (
      (label === 'pneumonia' || label === 'consolidation') &&
      q.fever !== 'yes' &&
      q.cough !== 'yes'
    ) {
      return {
        diagnosis: "Possible pneumonia",
        confidence: Math.max(0, top1.score - 0.20),
        reason: "Imaging suggests pneumonia but lacks typical symptoms"
      }
    }
  } else if (modality === 'SKIN_DERMOSCOPY') {
    // Rule 1: Melanoma with concerning history
    if (
      (label === 'melanoma' || label === 'basal cell carcinoma' || label === 'squamous cell carcinoma') &&
      q.history && q.history.toLowerCase().includes('sun')
    ) {
      return {
        diagnosis: `${top1.label} (sun exposure history)`,
        confidence: Math.min(1, top1.score + 0.05),
        reason: "Skin lesion with sun exposure history"
      }
    }

    // Rule 2: Benign with concerning characteristics
    if (
      label === 'benign' &&
      q.history && q.history.toLowerCase().includes('change')
    ) {
      return {
        diagnosis: "Benign (monitoring recommended)",
        confidence: Math.max(0, top1.score - 0.10),
        reason: "Benign appearance but patient reports changes"
      }
    }
  } else if (modality === 'MRI_BRAIN' || modality === 'MRI_SPINE' || modality === 'MRI_KNEE') {
    // Rule 1: Tumor with neurological symptoms
    if (
      (label === 'tumor' || label === 'stroke' || label === 'multiple sclerosis') &&
      q.history && (q.history.toLowerCase().includes('headache') || q.history.toLowerCase().includes('dizzy'))
    ) {
      return {
        diagnosis: `${top1.label} (neurological symptoms)`,
        confidence: Math.min(1, top1.score + 0.08),
        reason: "Brain abnormality with neurological symptoms"
      }
    }

    // Rule 2: Normal with concerning symptoms
    if (
      label === 'normal' &&
      q.history && (q.history.toLowerCase().includes('seizure') || q.history.toLowerCase().includes('stroke'))
    ) {
      return {
        diagnosis: "Normal (neurological evaluation recommended)",
        confidence: Math.max(0, top1.score - 0.12),
        reason: "Normal MRI but concerning neurological history"
      }
    }
  } else if (modality === 'CT_CHEST') {
    // Rule 1: Pneumonia with clinical symptoms (similar to XRAY_CHEST)
    if (
      (label === 'pneumonia' || label === 'consolidation') &&
      q.fever === 'yes' &&
      q.cough === 'yes' &&
      q.duration_days >= 2
    ) {
      return {
        diagnosis: "Pneumonia likely (CT confirmed)",
        confidence: Math.min(1, top1.score + 0.08),
        reason: "Fever + cough ≥2 days with CT imaging pattern"
      }
    }

    // Rule 2: Normal with concerning symptoms
    if (
      label === 'normal' &&
      q.fever === 'yes' &&
      q.duration_days >= 5
    ) {
      return {
        diagnosis: "Normal (clinical review recommended)",
        confidence: Math.max(0, top1.score - 0.12),
        reason: "Normal CT but persistent fever ≥5 days"
      }
    }
  }

  // Default fallback if no rules match
  return defaultResult
}
