/**
 * src/features/staff/checkin/QRScannerModal.jsx
 *
 * Camera QR code scanner modal.
 * UI redesigned to match Dashboard editorial light theme.
 *
 * All scanning logic unchanged — only visual layer updated:
 *  - White/warm-bg modal instead of navy
 *  - Dark text accents (Montserrat + Playfair Display)
 *  - Subtle border styling matching CheckIn.css
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import './CheckIn.css';

// ── Load jsQR from CDN ─────────────────────────────────────────────────────────
function loadJsQR() {
  return new Promise((resolve, reject) => {
    if (typeof window.jsQR === 'function') {
      resolve(window.jsQR);
      return;
    }
    const old = document.getElementById('jsqr-script');
    if (old) old.remove();

    const script = document.createElement('script');
    script.id    = 'jsqr-script';
    script.src   = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    script.async = true;
    script.onload = () => {
      if (typeof window.jsQR === 'function') {
        resolve(window.jsQR);
      } else {
        reject(new Error('jsQR loaded but window.jsQR is not a function.'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load jsQR from CDN.'));
    document.head.appendChild(script);
  });
}

// ── Extract reference number from raw QR data ──────────────────────────────────
function extractReference(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.trim();
  const match = clean.match(/([A-Z0-9]{2,}-[A-Z0-9]{2,}-[A-Z0-9]{2,})/i)
             || clean.match(/([A-Z0-9]{2,}-[A-Z0-9]{4,})/i);
  if (match) return match[1].toUpperCase();
  if (/^[A-Z0-9]{6,20}$/i.test(clean)) return clean.toUpperCase();
  return null;
}

export default function QRScannerModal({ onScan, onClose }) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const rafRef      = useRef(null);
  const jsQRRef     = useRef(null);
  const detectedRef = useRef(false);

  const [status,   setStatus]   = useState('Starting camera…');
  const [error,    setError]    = useState(null);
  const [detected, setDetected] = useState(false);

  // ── Stop camera + scan loop ────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    if (rafRef.current)    { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  // ── Scan loop ──────────────────────────────────────────────────────────────
  const startScanLoop = useCallback(() => {
    const tick = () => {
      if (detectedRef.current) return;

      const video  = videoRef.current;
      const canvas = canvasRef.current;
      const jsQR   = jsQRRef.current;

      if (!video || !canvas || !jsQR) { rafRef.current = requestAnimationFrame(tick); return; }

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }

      canvas.width  = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, w, h);

      let imageData;
      try {
        imageData = ctx.getImageData(0, 0, w, h);
      } catch {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (!imageData || !imageData.width || !imageData.height) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      let code = null;
      try {
        code =
          jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' }) ||
          jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'onlyInvert'  });
      } catch {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (code?.data) {
        const ref = extractReference(code.data);
        if (ref) {
          detectedRef.current = true;
          setDetected(true);
          setStatus(`Detected: ${ref}`);
          stopAll();
          setTimeout(() => onScan(ref), 400);
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [onScan, stopAll]);

  // ── Mount: load jsQR + start camera ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const lib = await loadJsQR();
        if (cancelled) return;
        jsQRRef.current = lib;
      } catch (err) {
        if (!cancelled) setError(`QR library error: ${err.message}`);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;

        video.onloadeddata = () => {
          if (cancelled) return;
          setStatus('Point camera at QR code');
          startScanLoop();
        };

        setTimeout(() => {
          if (!cancelled && !detectedRef.current) {
            setStatus('Point camera at QR code');
            startScanLoop();
          }
        }, 2000);

        await video.play();
      } catch (err) {
        if (cancelled) return;
        if (err.name === 'NotAllowedError') {
          setError('Camera permission denied. Please allow camera access in your browser and try again.');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found. Please connect a camera and try again.');
        } else {
          setError(`Camera error: ${err.message}`);
        }
      }
    }

    init();
    return () => { cancelled = true; stopAll(); };
  }, [startScanLoop, stopAll]);

  function handleClose() { stopAll(); onClose(); }

  return (
    <div
      className="ci-qr-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="ci-qr-modal">

        {/* Header */}
        <div className="ci-qr-modal-header">
          <div>
            <span style={{
              fontSize: 8, fontWeight: 900, letterSpacing: '0.28em',
              textTransform: 'uppercase', color: '#909090', display: 'block', marginBottom: 4,
            }}>
              Front Desk · Check-In
            </span>
            <h2 className="ci-qr-modal-title">Scan QR Code</h2>
          </div>
          <button className="ci-qr-modal-close" onClick={handleClose}>×</button>
        </div>

        <div className="ci-qr-modal-body">

          {error ? (
            <div className="ci-notice ci-notice-error">
              <span className="ci-notice-icon">⚠</span>
              <div>
                <strong style={{ display: 'block', marginBottom: 3 }}>Scanner Error</strong>
                <p style={{ margin: 0, fontSize: 12 }}>{error}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Viewfinder */}
              <div className="ci-scanner-viewport" style={{ borderRadius: 0 }}>
                {detected ? (
                  <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: 12,
                    background: 'rgba(5,150,105,0.10)',
                    fontSize: 64,
                  }}>
                    <span style={{ fontSize: 64 }}>✓</span>
                    <span style={{
                      fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
                      textTransform: 'uppercase', color: '#059669',
                    }}>
                      QR Detected
                    </span>
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                )}

                {!detected && (
                  <div className="ci-scanner-corners">
                    <div className="ci-scanner-corner tl" />
                    <div className="ci-scanner-corner tr" />
                    <div className="ci-scanner-corner bl" />
                    <div className="ci-scanner-corner br" />
                    <div className="ci-scanner-line" />
                  </div>
                )}
              </div>

              <canvas ref={canvasRef} style={{ display: 'none' }} />

              <div className="ci-scanner-status">{status}</div>

              <p style={{
                fontSize: 11, color: '#909090', textAlign: 'center',
                marginTop: 8, fontWeight: 500,
              }}>
                Hold the QR code steady · Ensure good lighting · Fill the frame
              </p>
            </>
          )}

          <p style={{
            fontSize: 11, color: '#909090', textAlign: 'center',
            marginTop: 12, fontWeight: 500,
          }}>
            Not working?{' '}
            <strong style={{ color: '#01000D' }}>Use Manual Entry instead.</strong>
          </p>

          <button
            className="ci-btn ci-btn-full"
            style={{ marginTop: 12 }}
            onClick={handleClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}