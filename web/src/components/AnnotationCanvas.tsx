import React, { useRef, useEffect, useState } from 'react'

interface Point {
  x: number
  y: number
}

interface Annotation {
  id: string
  type: 'polygon' | 'box'
  points?: Point[]
  x?: number
  y?: number
  w?: number
  h?: number
  label: string
  color?: string
}

interface AnnotationCanvasProps {
  imageUrl: string
  annotations: Annotation[]
  onAnnotationComplete: (annotation: Omit<Annotation, 'id' | 'color'>) => void
  onAnnotationDelete?: (id: string) => void
  currentUserId?: string
}

const COLORS = [
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#FFA500', '#800080', '#FFC0CB', '#A52A2A', '#808080', '#000000'
]

export default function AnnotationCanvas({
  imageUrl,
  annotations,
  onAnnotationComplete,
  onAnnotationDelete,
  currentUserId
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [drawingMode, setDrawingMode] = useState<'box' | 'polygon' | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentPoints, setCurrentPoints] = useState<Point[]>([])
  const [startPoint, setStartPoint] = useState<Point | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [labelInput, setLabelInput] = useState('')
  const [showLabelInput, setShowLabelInput] = useState(false)

  useEffect(() => {
    console.log('[ANNOTATION CANVAS] Loading image:', imageUrl)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      console.log('[ANNOTATION CANVAS] Image loaded successfully, dimensions:', img.width, 'x', img.height)
      const canvas = canvasRef.current
      if (canvas) {
        // Set canvas size to match image, but scale down if too large
        const maxWidth = 800
        const maxHeight = 600
        let width = img.width
        let height = img.height
        
        if (width > maxWidth || height > maxHeight) {
          const scale = Math.min(maxWidth / width, maxHeight / height)
          width = width * scale
          height = height * scale
        }
        
        canvas.width = width
        canvas.height = height
        console.log('[ANNOTATION CANVAS] Canvas size set to:', width, 'x', height)
      }
      setImageSize({ width: img.width, height: img.height })
      setImageLoaded(true)
      drawCanvas()
    }
    img.onerror = (err) => {
      console.error('[ANNOTATION CANVAS] Failed to load image:', imageUrl, err)
      setImageLoaded(false)
    }
    img.src = imageUrl
    imageRef.current = img
  }, [imageUrl])

  useEffect(() => {
    if (imageLoaded) {
      drawCanvas()
    }
  }, [imageLoaded, annotations, currentPoints, startPoint, isDrawing])

  const drawCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas || !imageRef.current) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw image
    ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height)

    // Draw existing annotations
    annotations.forEach((ann, index) => {
      const color = ann.color || COLORS[index % COLORS.length]
      ctx.strokeStyle = color
      ctx.fillStyle = color + '40' // Add transparency
      ctx.lineWidth = 2

      if (ann.type === 'box' && ann.x !== undefined && ann.y !== undefined && ann.w !== undefined && ann.h !== undefined) {
        const scaleX = canvas.width / imageSize.width
        const scaleY = canvas.height / imageSize.height
        const x = ann.x * scaleX
        const y = ann.y * scaleY
        const w = ann.w * scaleX
        const h = ann.h * scaleY

        ctx.fillRect(x, y, w, h)
        ctx.strokeRect(x, y, w, h)

        // Draw label
        ctx.fillStyle = color
        ctx.font = '14px Arial'
        ctx.fillText(ann.label, x, Math.max(14, y - 5))
      } else if (ann.type === 'polygon' && ann.points && ann.points.length > 0) {
        const scaleX = canvas.width / imageSize.width
        const scaleY = canvas.height / imageSize.height

        ctx.beginPath()
        ann.points.forEach((point, i) => {
          const x = point.x * scaleX
          const y = point.y * scaleY
          if (i === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        })
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        // Draw label at first point
        if (ann.points.length > 0) {
          ctx.fillStyle = color
          ctx.font = '14px Arial'
          ctx.fillText(ann.label, ann.points[0].x * scaleX, Math.max(14, ann.points[0].y * scaleY - 5))
        }
      }
    })

    // Draw current drawing
    if (isDrawing && drawingMode) {
      ctx.strokeStyle = '#FF0000'
      ctx.fillStyle = '#FF000040'
      ctx.lineWidth = 2

      if (drawingMode === 'box' && startPoint && currentPoints.length > 0) {
        const scaleX = canvas.width / imageSize.width
        const scaleY = canvas.height / imageSize.height
        
        // Convert canvas coordinates to image coordinates, then scale to canvas
        const startX = startPoint.x * scaleX
        const startY = startPoint.y * scaleY
        const endX = currentPoints[0].x * scaleX
        const endY = currentPoints[0].y * scaleY

        const x = Math.min(startX, endX)
        const y = Math.min(startY, endY)
        const w = Math.abs(endX - startX)
        const h = Math.abs(endY - startY)

        ctx.fillRect(x, y, w, h)
        ctx.strokeRect(x, y, w, h)
      } else if (drawingMode === 'polygon' && currentPoints.length > 0) {
        const scaleX = canvas.width / imageSize.width
        const scaleY = canvas.height / imageSize.height

        ctx.beginPath()
        currentPoints.forEach((point, i) => {
          const x = point.x * scaleX
          const y = point.y * scaleY
          if (i === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        })
        if (currentPoints.length > 2) {
          ctx.closePath()
          ctx.fill()
        }
        ctx.stroke()
      }
    }
  }

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    console.log('[ANNOTATION CANVAS] Mouse down, drawingMode:', drawingMode)
    if (!drawingMode) {
      console.log('[ANNOTATION CANVAS] No drawing mode set, ignoring')
      return
    }

    const point = getCanvasCoordinates(e)
    console.log('[ANNOTATION CANVAS] Canvas coordinates:', point)

    if (drawingMode === 'box') {
      console.log('[ANNOTATION CANVAS] Starting box drawing')
      setIsDrawing(true)
      setStartPoint(point)
      setCurrentPoints([point])
    } else if (drawingMode === 'polygon') {
      console.log('[ANNOTATION CANVAS] Adding polygon point')
      setIsDrawing(true)
      setCurrentPoints([...currentPoints, point])
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawingMode) return

    const point = getCanvasCoordinates(e)

    if (drawingMode === 'box' && startPoint) {
      setCurrentPoints([point])
    } else if (drawingMode === 'polygon') {
      // Update last point for preview
      const newPoints = [...currentPoints]
      if (newPoints.length > 0) {
        newPoints[newPoints.length - 1] = point
        setCurrentPoints(newPoints)
      }
    }
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawingMode) return

    const canvas = canvasRef.current
    if (!canvas) return

    const scaleX = imageSize.width / canvas.width
    const scaleY = imageSize.height / canvas.height

    if (drawingMode === 'box' && startPoint && currentPoints.length > 0) {
      // Complete box - convert canvas coords to image coords
      const startX = startPoint.x * scaleX
      const startY = startPoint.y * scaleY
      const endX = currentPoints[0].x * scaleX
      const endY = currentPoints[0].y * scaleY

      const x = Math.min(startX, endX)
      const y = Math.min(startY, endY)
      const w = Math.abs(endX - startX)
      const h = Math.abs(endY - startY)

      if (w > 10 && h > 10) { // Minimum size
        setShowLabelInput(true)
        // Store annotation data temporarily in image coordinates
        ;(window as any).__tempAnnotation = { type: 'box', x, y, w, h }
      }
    } else if (drawingMode === 'polygon' && currentPoints.length >= 3) {
      // Complete polygon - convert canvas coords to image coords
      const points = currentPoints.map(p => ({
        x: p.x * scaleX,
        y: p.y * scaleY
      }))

      setShowLabelInput(true)
      ;(window as any).__tempAnnotation = { type: 'polygon', points }
    }

    setIsDrawing(false)
  }

  const handleDoubleClick = () => {
    if (drawingMode === 'polygon' && currentPoints.length >= 3) {
      handleMouseUp({} as React.MouseEvent<HTMLCanvasElement>)
    }
  }

  const handleLabelSubmit = () => {
    if (!labelInput.trim()) {
      setShowLabelInput(false)
      setCurrentPoints([])
      setStartPoint(null)
      return
    }

    const tempAnn = (window as any).__tempAnnotation
    if (tempAnn) {
      onAnnotationComplete({
        ...tempAnn,
        label: labelInput.trim()
      })
      delete (window as any).__tempAnnotation
    }

    setLabelInput('')
    setShowLabelInput(false)
    setCurrentPoints([])
    setStartPoint(null)
    setDrawingMode(null)
  }

  const handleCancel = () => {
    setLabelInput('')
    setShowLabelInput(false)
    setCurrentPoints([])
    setStartPoint(null)
    setDrawingMode(null)
    setIsDrawing(false)
    delete (window as any).__tempAnnotation
  }

  return (
    <div className="relative">
      <div className="mb-4 flex space-x-2">
        <button
          onClick={() => {
            console.log('[ANNOTATION CANVAS] Draw Box button clicked')
            setDrawingMode('box')
            setCurrentPoints([])
            setStartPoint(null)
          }}
          className={`px-4 py-2 rounded-lg ${
            drawingMode === 'box' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
          }`}
        >
          Draw Box
        </button>
        <button
          onClick={() => {
            setDrawingMode('polygon')
            setCurrentPoints([])
            setStartPoint(null)
          }}
          className={`px-4 py-2 rounded-lg ${
            drawingMode === 'polygon' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
          }`}
        >
          Draw Polygon
        </button>
        {drawingMode && (
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg bg-red-200 text-red-700"
          >
            Cancel
          </button>
        )}
        {drawingMode === 'polygon' && (
          <p className="text-sm text-gray-600 self-center">
            Click to add points, double-click to finish
          </p>
        )}
      </div>

      <div className="relative border-2 border-gray-300 rounded-lg overflow-hidden inline-block">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          className="cursor-crosshair max-w-full h-auto"
          style={{ 
            display: imageLoaded ? 'block' : 'none'
          }}
        />
        {!imageLoaded && (
          <div className="w-full h-64 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Loading image...</p>
              {imageUrl && (
                <p className="text-xs text-gray-500 mt-1">URL: {imageUrl.substring(0, 50)}...</p>
              )}
            </div>
          </div>
        )}
        {imageLoaded && !drawingMode && (
          <div className="absolute top-2 left-2 bg-yellow-100 border border-yellow-300 rounded px-2 py-1 text-xs text-yellow-800">
            Click "Draw Box" or "Draw Polygon" to start annotating
          </div>
        )}
        {imageLoaded && drawingMode && (
          <div className="absolute top-2 left-2 bg-blue-100 border border-blue-300 rounded px-2 py-1 text-xs text-blue-800">
            {drawingMode === 'box' ? 'Click and drag to draw a box' : 'Click to add points, double-click to finish'}
          </div>
        )}
      </div>

      {showLabelInput && (
        <div className="mt-4 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Enter label for annotation:
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLabelSubmit()}
              className="flex-1 input-field"
              placeholder="e.g., Lesion, Tumor, etc."
              autoFocus
            />
            <button onClick={handleLabelSubmit} className="btn-primary">
              Save
            </button>
            <button onClick={handleCancel} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}

      {annotations.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Annotations:</h4>
          <div className="space-y-2">
            {annotations.map((ann, index) => (
              <div
                key={ann.id}
                className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center space-x-2">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: ann.color || COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm font-medium">{ann.label}</span>
                  <span className="text-xs text-gray-500">({ann.type})</span>
                </div>
                {onAnnotationDelete && (
                  <button
                    onClick={() => onAnnotationDelete(ann.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
