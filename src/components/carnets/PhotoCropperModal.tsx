'use client';
import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { ZoomIn, ZoomOut, RotateCcw, Check, X } from 'lucide-react';

/**
 * PhotoCropperModal — Modal de recorte de foto para carnets.
 * Muestra la imagen con un área de recorte circular para encuadrar la cara.
 * Permite zoom, paneo y rotación.
 * Genera una imagen cuadrada recortada (lista para mostrarse en círculo).
 */

interface PhotoCropperModalProps {
  /** Data URL de la imagen original a recortar */
  imageSrc: string;
  /** Callback con la imagen recortada en formato base64 (JPEG) */
  onCropComplete: (croppedBase64: string) => void;
  /** Callback para cancelar */
  onCancel: () => void;
  /** Tamaño de salida en px (default 400) */
  outputSize?: number;
}

export default function PhotoCropperModal({
  imageSrc,
  onCropComplete,
  onCancel,
  outputSize = 400,
}: PhotoCropperModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropChange = useCallback((newCrop: Point) => {
    setCrop(newCrop);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const handleCropComplete = useCallback((_croppedArea: Area, croppedAreaPx: Area) => {
    setCroppedAreaPixels(croppedAreaPx);
  }, []);

  const handleConfirm = useCallback(async () => {
    try {
      setProcessing(true);
      const result = await getCroppedImg(imageSrc, croppedAreaPixels!, rotation, outputSize);
      onCropComplete(result);
    } catch (err) {
      console.error('Error cropping image:', err);
    } finally {
      setProcessing(false);
    }
  }, [imageSrc, croppedAreaPixels, rotation, outputSize, onCropComplete]);

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center animate-fadeIn">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl w-[95vw] max-w-[520px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Encuadrar foto</h3>
          <button
            onClick={onCancel}
            className="w-7 h-7 rounded-lg hover:bg-[var(--af-bg3)] flex items-center justify-center cursor-pointer bg-transparent border-none"
          >
            <X size={16} className="text-[var(--muted-foreground)]" />
          </button>
        </div>

        {/* Cropper Area */}
        <div className="relative w-full bg-black" style={{ height: 380 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            cropShape="round"
            cropSize={{ width: 260, height: 260 }}
            showGrid={false}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={handleCropComplete}
            style={{
              containerStyle: { background: '#000' },
              cropAreaStyle: { border: '2px solid rgba(255,255,255,0.3)' },
            }}
          />
        </div>

        {/* Controls */}
        <div className="px-5 py-3 space-y-3">
          {/* Zoom slider */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setZoom(z => Math.max(1, z - 0.1))}
              className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg4)] transition-colors flex-shrink-0"
            >
              <ZoomOut size={14} className="text-[var(--muted-foreground)]" />
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="flex-1 accent-[var(--af-accent)]"
            />
            <button
              onClick={() => setZoom(z => Math.min(3, z + 0.1))}
              className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg4)] transition-colors flex-shrink-0"
            >
              <ZoomIn size={14} className="text-[var(--muted-foreground)]" />
            </button>
          </div>

          {/* Rotation */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setRotation(r => r - 90)}
              className="w-8 h-8 rounded-lg bg-[var(--af-bg3)] border border-[var(--border)] flex items-center justify-center cursor-pointer hover:bg-[var(--af-bg4)] transition-colors flex-shrink-0"
            >
              <RotateCcw size={14} className="text-[var(--muted-foreground)]" />
            </button>
            <div className="flex-1 text-[11px] text-[var(--muted-foreground)]">
              Arrastra la imagen para centrar la cara en el círculo. Usa el zoom para ajustar el tamaño.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
          <button
            onClick={onCancel}
            className="af-btn-secondary text-[12px] px-4 py-2 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={processing || !croppedAreaPixels}
            className="af-btn-primary flex items-center gap-2 text-[12px] px-4 py-2 disabled:opacity-50 cursor-pointer"
          >
            {processing ? (
              <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Procesando...</>
            ) : (
              <><Check size={14} /> Aplicar</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * getCroppedImg — Genera la imagen recortada usando canvas.
 * Basado en la documentación oficial de react-easy-crop.
 * pixelCrop ya viene en coordenadas de la imagen original (ajustadas por rotación).
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number = 0,
  outputSize: number = 400
): Promise<string> {
  const image = new Image();
  image.src = imageSrc;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to load image'));
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const rotRad = (rotation * Math.PI) / 180;

  // Calcular bounding box de la imagen rotada
  const { width: bBoxWidth, height: bBoxHeight } = getRotatedSize(
    image.width,
    image.height,
    rotation
  );

  // Canvas temporal del tamaño de la bounding box
  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  // Dibujar imagen rotada en canvas temporal
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, bBoxWidth, bBoxHeight);
  ctx.save();
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);
  ctx.restore();

  // Ahora recortar del canvas temporal
  // pixelCrop de react-easy-crop está en coordenadas de la imagen mostrada (rotada).
  // Escalar al tamaño real del canvas temporal vs el tamaño de la imagen natural
  const scaleX = bBoxWidth / image.naturalWidth;
  const scaleY = bBoxHeight / image.naturalHeight;

  const outputCanvas = document.createElement('canvas');
  const outputCtx = outputCanvas.getContext('2d')!;

  outputCanvas.width = outputSize;
  outputCanvas.height = outputSize;

  outputCtx.drawImage(
    canvas,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    pixelCrop.width * scaleX,
    pixelCrop.height * scaleY,
    0,
    0,
    outputSize,
    outputSize
  );

  return outputCanvas.toDataURL('image/jpeg', 0.9);
}

function getRotatedSize(width: number, height: number, rotation: number) {
  const rotRad = (rotation * Math.PI) / 180;
  return {
    width:
      Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height:
      Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}
