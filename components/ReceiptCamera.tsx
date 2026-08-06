'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  onCapture: (blob: Blob, previewUrl: string) => void;
};

export default function ReceiptCamera({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch (err) {
        setError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access, or use the file picker below.'
            : 'Could not start the camera. Use the file picker below instead.'
        );
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
