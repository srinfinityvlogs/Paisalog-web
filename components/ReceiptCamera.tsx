'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  onCapture: (blob: Blob, previewUrl: string) => void;
};

export default function ReceiptCamera({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Camera zoom is an experimental, non-standard constraint
  // (MediaStreamTrack.applyConstraints({ advanced: [{ zoom }] })).
  // Support varies a lot by browser/device — notably, Safari on iOS does
  // not support it at all as of this writing. We detect actual support at
  // runtime via getCapabilities() and only show zoom controls when the
  // current device/browser genuinely offers it, rather than showing
  // buttons that silently do nothing.
  const [zoomLevels, setZoomLevels] = useState<number[] | null>(null);
  const [activeZoom, setActiveZoom] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not supported in this browser.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
        setupZoom(track);
      } catch (err) {
        setError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access, or use the file picker below.'
            : 'Could not start the camera. Use the file picker below instead.'
        );
      }
    }

    function setupZoom(track: MediaStreamTrack) {
      // getCapabilities() and the "zoom" constraint aren't in the standard
      // TS lib types yet (still experimental), hence the `any` casts.
      const capabilities = (track.getCapabilities?.() as any) || {};
      if (typeof capabilities.zoom?.min !== 'number' || typeof capabilities.zoom?.max !== 'number') {
        return; // not supported on this device/browser — leave zoomLevels null, controls stay hidden
      }
      const { min, max } = capabilities.zoom;
      // Offer up to 3 sensible stops within the device's actual supported
      // range, rather than hardcoding 1x/2x/3x which might exceed what the
      // hardware can do.
      const candidates = [min, min + (max - min) * 0.5, max];
      const levels = Array.from(new Set(candidates.map((v) => Math.round(v * 10) / 10)));
      setZoomLevels(levels);
      setActiveZoom(min);
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function setZoom(level: number) {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: level } as any] });
      setActiveZoom(level);
    } catch {
      // Some devices report zoom capability but reject the constraint at
      // apply-time — fail quietly rather than surface a scary error for a
      // non-essential feature.
    }
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const previewUrl = URL.createObjectURL(blob);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCapture(blob, previewUrl);
      },
      'image/jpeg',
      0.9
    );
  }

  function handleFileFallback(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    onCapture(file, previewUrl);
  }

  return (
    <div className="camera-wrap">
      {!error && (
        <>
          <video ref={videoRef} className="camera-video" playsInline muted />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {zoomLevels && zoomLevels.length > 1 && (
            <div className="zoom-controls">
              {zoomLevels.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`zoom-btn ${activeZoom === level ? 'active' : ''}`}
                  onClick={() => setZoom(level)}
                >
                  {level}×
                </button>
              ))}
            </div>
          )}

          <div className="camera-controls">
            <button type="button" className="btn-capture" onClick={capture} disabled={!ready} aria-label="Capture photo" />
          </div>
        </>
      )}

      {error && (
        <div className="camera-error">
          <p>{error}</p>
          <label className="btn-secondary" style={{ display: 'inline-block', cursor: 'pointer' }}>
            Choose a photo instead
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileFallback}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

