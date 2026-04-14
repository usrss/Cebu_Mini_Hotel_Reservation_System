// src/features/rooms/Room360Viewer.jsx
// Logic: unchanged — pannellum integration exactly as before.
// Visual: Editorial Light theme via new Room360Viewer.css.
import { useEffect, useRef, useState } from 'react';
import { X, Maximize2, RotateCw } from 'lucide-react';
import './Room360Viewer.css';

export default function Room360Viewer({ imageUrl, roomName, onClose }) {
  const viewerRef      = useRef(null);
  const pannellumRef   = useRef(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    loadPannellum();
    return () => {
      document.body.style.overflow = '';
      if (pannellumRef.current) {
        try { pannellumRef.current.destroy(); } catch {}
      }
    };
  }, []);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const loadPannellum = async () => {
    try {
      if (window.pannellum) { initViewer(); return; }

      const link  = document.createElement('link');
      link.rel    = 'stylesheet';
      link.href   = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css';
      document.head.appendChild(link);

      const script   = document.createElement('script');
      script.src     = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';
      script.onload  = initViewer;
      script.onerror = () => setError('Failed to load 360° viewer');
      document.head.appendChild(script);
    } catch {
      setError('Failed to initialize viewer');
    }
  };

  const initViewer = () => {
    if (!viewerRef.current || !window.pannellum) return;
    try {
      pannellumRef.current = window.pannellum.viewer(viewerRef.current, {
        type:         'equirectangular',
        panorama:     imageUrl,
        autoLoad:     true,
        showControls: false,
        mouseZoom:    true,
        doubleClickZoom: false,
        draggable:    true,
        keyboardZoom: true,
        friction:     0.15,
        hfov:         100,
        minHfov:      50,
        maxHfov:      120,
        pitch:        0,
        yaw:          0,
      });
      pannellumRef.current.on('load',  () => setLoading(false));
      pannellumRef.current.on('error', () => {
        setError('Failed to load panorama image');
        setLoading(false);
      });
    } catch {
      setError('Failed to initialize viewer');
      setLoading(false);
    }
  };

  const toggleFullscreen = async () => {
    if (!viewerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await viewerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  };

  const resetView = () => {
    if (pannellumRef.current) {
      pannellumRef.current.setPitch(0);
      pannellumRef.current.setYaw(0);
      pannellumRef.current.setHfov(100);
    }
  };

  return (
    <div className="room-360-modal" onClick={onClose}>
      <div className="room-360-overlay" />

      <div className="room-360-container" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="room-360-header">
          <div className="room-360-title">
            {/* Continuously rotating globe icon */}
            <RotateCw size={16} className="rotate-icon" />
            <div className="room-360-title-sep" />
            <div>
              <span className="room-360-title-eyebrow">Virtual Tour</span>
              <p className="room-360-title-name">{roomName || 'Room'} · 360°</p>
            </div>
          </div>

          <div className="room-360-actions">
            <button
              onClick={resetView}
              className="room-360-btn"
              title="Reset view"
              disabled={loading}
            >
              <RotateCw size={15} />
            </button>
            <button
              onClick={toggleFullscreen}
              className="room-360-btn"
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              disabled={loading}
            >
              <Maximize2 size={15} />
            </button>
            <button onClick={onClose} className="room-360-btn close" title="Close">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Viewer ── */}
        <div className="room-360-viewer-wrapper">
          <div ref={viewerRef} className="room-360-viewer" />

          {loading && (
            <div className="room-360-loading">
              <div className="r360-spinner" />
              <p>Loading panorama</p>
            </div>
          )}

          {error && (
            <div className="room-360-error">
              <p>{error}</p>
              <button onClick={onClose} className="error-close-btn">Close</button>
            </div>
          )}

          {!loading && !error && (
            <div className="room-360-instructions">
              <p>Drag to rotate · Scroll to zoom · Click fullscreen for immersive view</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}