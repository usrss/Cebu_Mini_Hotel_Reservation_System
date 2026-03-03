import { useEffect, useRef, useState } from 'react';
import { X, Maximize2, RotateCw, Loader2 } from 'lucide-react';
import './Room360Viewer.css';

/**
 * 360° Panorama Viewer Component
 *
 * Uses Pannellum library for equirectangular panorama display
 * Lazy loads only when modal opens
 * Supports mouse drag, touch swipe, zoom, and fullscreen
 */
export default function Room360Viewer({ imageUrl, roomName, onClose }) {
  const viewerRef = useRef(null);
  const pannellumRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    // Load Pannellum library dynamically
    loadPannellum();

    // Cleanup
    return () => {
      document.body.style.overflow = '';
      if (pannellumRef.current) {
        try {
          pannellumRef.current.destroy();
        } catch (e) {
          console.error('Error destroying viewer:', e);
        }
      }
    };
  }, []);

  // Handle ESC key to close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const loadPannellum = async () => {
    try {
      // Check if already loaded
      if (window.pannellum) {
        initViewer();
        return;
      }

      // Load CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css';
      document.head.appendChild(link);

      // Load JS
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';
      script.onload = initViewer;
      script.onerror = () => setError('Failed to load 360° viewer');
      document.head.appendChild(script);
    } catch (err) {
      setError('Failed to initialize viewer');
      console.error(err);
    }
  };

  const initViewer = () => {
    if (!viewerRef.current || !window.pannellum) return;

    try {
      pannellumRef.current = window.pannellum.viewer(viewerRef.current, {
        type: 'equirectangular',
        panorama: imageUrl,
        autoLoad: true,
        showControls: false, // We'll use custom controls
        mouseZoom: true,
        doubleClickZoom: false,
        draggable: true,
        keyboardZoom: true,
        friction: 0.15,
        hfov: 100, // Horizontal field of view
        minHfov: 50,
        maxHfov: 120,
        pitch: 0,
        yaw: 0,
      });

      // Handle load complete
      pannellumRef.current.on('load', () => {
        setLoading(false);
      });

      // Handle errors
      pannellumRef.current.on('error', () => {
        setError('Failed to load panorama image');
        setLoading(false);
      });
    } catch (err) {
      setError('Failed to initialize viewer');
      setLoading(false);
      console.error(err);
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
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
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

      {/* Viewer Container */}
      <div className="room-360-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="room-360-header">
          <div className="room-360-title">
            <RotateCw size={20} className="rotate-icon" />
            <span>{roomName || 'Room'} - 360° Virtual Tour</span>
          </div>
          <div className="room-360-actions">
            <button
              onClick={resetView}
              className="room-360-btn"
              title="Reset view"
              disabled={loading}
            >
              <RotateCw size={18} />
            </button>
            <button
              onClick={toggleFullscreen}
              className="room-360-btn"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              disabled={loading}
            >
              <Maximize2 size={18} />
            </button>
            <button onClick={onClose} className="room-360-btn close" title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Viewer */}
        <div className="room-360-viewer-wrapper">
          <div ref={viewerRef} className="room-360-viewer" />

          {/* Loading State */}
          {loading && (
            <div className="room-360-loading">
              <Loader2 size={40} className="spin-icon" />
              <p>Loading 360° view...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="room-360-error">
              <p>{error}</p>
              <button onClick={onClose} className="error-close-btn">
                Close
              </button>
            </div>
          )}

          {/* Instructions */}
          {!loading && !error && (
            <div className="room-360-instructions">
              <p>💡 Drag to rotate • Scroll to zoom • Click fullscreen for immersive view</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}