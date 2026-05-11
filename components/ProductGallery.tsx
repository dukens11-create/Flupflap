'use client';

import { useState } from 'react';
import Image from 'next/image';

interface ProductGalleryProps {
  images: string[];
  title: string;
  videoUrl?: string | null;
}

/**
 * Product gallery shown on the product detail page.
 * – Thumbnails at the bottom to navigate between images
 * – Left/right arrow buttons to step through images
 * – Optional video rendered below the gallery
 */
export default function ProductGallery({ images, title, videoUrl }: ProductGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!images.length) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  return (
    <div className="flex flex-col gap-3">
      {/* Main image */}
      <div className="relative w-full aspect-square bg-slate-100 rounded-xl overflow-hidden">
        <Image
          src={images[currentIndex]}
          alt={`${title} — image ${currentIndex + 1} of ${images.length}`}
          fill
          className="object-cover"
          priority={currentIndex === 0}
        />

        {/* Prev / Next arrows */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
              disabled={!hasPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-9 h-9 flex items-center justify-center shadow transition disabled:opacity-30"
              aria-label="Previous image"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setCurrentIndex(i => Math.min(images.length - 1, i + 1))}
              disabled={!hasNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-9 h-9 flex items-center justify-center shadow transition disabled:opacity-30"
              aria-label="Next image"
            >
              ›
            </button>
          </>
        )}

        {/* Counter badge */}
        {images.length > 1 && (
          <span className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
            {currentIndex + 1} / {images.length}
          </span>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setCurrentIndex(i)}
              className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition ${
                i === currentIndex ? 'border-blue-600' : 'border-slate-200 hover:border-slate-400'
              }`}
              aria-label={`View image ${i + 1}`}
            >
              <Image src={url} alt={`${title} thumbnail ${i + 1}`} fill className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Video */}
      {videoUrl && (
        <div className="mt-2">
          <p className="text-sm font-medium text-slate-600 mb-1">Product video</p>
          <video
            src={videoUrl}
            controls
            playsInline
            className="w-full rounded-xl border border-slate-200 max-h-80 object-cover"
          />
        </div>
      )}
    </div>
  );
}
