import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Upload, Trash2, Star, Image, Camera } from 'lucide-react';
import { adminUploadRoomImages, adminDeleteRoomImage, adminGetRoom, adminPatchRoom } from '../../services/roomService';
import './RoomImageModal.css';

export default function RoomImageModal({ room, onUpload, onClose, onRoomUpdate }) {
  const [images,        setImages]        = useState([]);
  const [panorama,      setPanorama]      = useState(null);
  const [fetching,      setFetching]      = useState(true);
  const [uploading,     setUploading]     = useState(false);
  const [uploadingPano, setUploadingPano] = useState(false);
  const [deletingId,    setDeletingId]    = useState(null);
  const [preview,       setPreview]       = useState([]);
  const [panoPreview,   setPanoPreview]   = useState(null);
  const [error,         setError]         = useState(null);
  const [tab,           setTab]           = useState('photos');

  const fileRef = useRef();
  const panoRef = useRef();

  // ── Initial load — always fetch fresh from server ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    setFetching(true);
    adminGetRoom(room.id)
      .then(res => {
        if (cancelled) return;
        setImages(res.data.images ?? []);
        setPanorama(res.data.panorama_image ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          // Fallback to props if fetch fails
          setImages(room.images ?? []);
          setPanorama(room.panorama_image ?? null);
        }
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => { cancelled = true; };
  }, [room.id]);

  // ── Room photos ────────────────────────────────────────────────────────────
  const handleFiles = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setPreview(files.map(f => ({ file: f, url: URL.createObjectURL(f) })));
    // Reset so same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleUpload = useCallback(async () => {
    if (!preview.length) return;
    setUploading(true);
    setError(null);
    try {
      const files  = preview.map(p => p.file);
      const result = await onUpload(room.id, files);

      if (result.success) {
        // Re-fetch the room to get server-assigned IDs and image_url values
        const res = await adminGetRoom(room.id);
        const freshImages = res.data.images ?? [];
        setImages(freshImages);
        // Revoke blob URLs
        preview.forEach(p => URL.revokeObjectURL(p.url));
        setPreview([]);
        onRoomUpdate?.({ ...room, images: freshImages });
      } else {
        setError('Upload failed. Please try again.');
      }
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [preview, room, onUpload, onRoomUpdate]);

  const handleDelete = useCallback(async (imageId) => {
    if (!window.confirm('Delete this image?')) return;
    setDeletingId(imageId);
    setError(null);
    try {
      await adminDeleteRoomImage(room.id, imageId);
      // Update state directly — no need to re-fetch for a delete
      setImages(prev => {
        const updated = prev.filter(img => img.id !== imageId);
        onRoomUpdate?.({ ...room, images: updated });
        return updated;
      });
    } catch {
      setError('Failed to delete image. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }, [room, onRoomUpdate]);

  const removeQueued = (index) => {
    setPreview(prev => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  // ── Panorama ───────────────────────────────────────────────────────────────
  const handlePanoFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPanoPreview({ file, url: URL.createObjectURL(file) });
    if (panoRef.current) panoRef.current.value = '';
  };

  const handlePanoUpload = useCallback(async () => {
    if (!panoPreview) return;
    setUploadingPano(true);
    setError(null);
    try {
      const res = await adminPatchRoom(room.id, { panorama_image: panoPreview.file });
      const newPano = res.data.panorama_image ?? null;
      setPanorama(newPano);
      URL.revokeObjectURL(panoPreview.url);
      setPanoPreview(null);
      onRoomUpdate?.({ ...room, panorama_image: newPano });
    } catch {
      setError('Panorama upload failed. Please try again.');
    } finally {
      setUploadingPano(false);
    }
  }, [panoPreview, room, onRoomUpdate]);

  const handlePanoDelete = useCallback(async () => {
    if (!window.confirm('Remove panoramic image?')) return;
    setUploadingPano(true);
    setError(null);
    try {
      await adminPatchRoom(room.id, { panorama_image: '' });
      setPanorama(null);
      onRoomUpdate?.({ ...room, panorama_image: null });
    } catch {
      setError('Failed to remove panorama. Please try again.');
    } finally {
      setUploadingPano(false);
    }
  }, [room, onRoomUpdate]);

  const cancelPanoPreview = () => {
    if (panoPreview) URL.revokeObjectURL(panoPreview.url);
    setPanoPreview(null);
    if (panoRef.current) panoRef.current.value = '';
  };

  return (
    <div className="rim-overlay">
      <div className="rim-modal">

        {/* Header */}
        <div className="rim-header">
          <div>
            <h2 className="rim-title">Room Images — #{room.room_number}</h2>
            <p className="rim-subtitle">
              {fetching
                ? 'Loading…'
                : `${images.length} photo${images.length !== 1 ? 's' : ''} · ${panorama ? '360° view set' : 'No panorama'}`}
            </p>
          </div>
          <button className="rim-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="rim-tabs">
          <button
            className={`rim-tab${tab === 'photos' ? ' rim-tab--active' : ''}`}
            onClick={() => setTab('photos')}
          >
            <Image size={13} /> Photos
          </button>
          <button
            className={`rim-tab${tab === 'panorama' ? ' rim-tab--active' : ''}`}
            onClick={() => setTab('panorama')}
          >
            <Camera size={13} /> 360° Panorama
          </button>
        </div>

        <div className="rim-body">

          {/* Global error */}
          {error && <div className="rim-error">{error}</div>}

          {/* Loading state */}
          {fetching && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: '#7A7987', fontSize: 13 }}>
              <div className="rim-spinner" style={{ borderTopColor: '#01000D', borderColor: '#E4E6ED' }} />
              Loading images…
            </div>
          )}

          {/* ── PHOTOS TAB ── */}
          {!fetching && tab === 'photos' && (
            <>
              {/* Upload zone */}
              <div className="rim-upload-zone" onClick={() => fileRef.current?.click()}>
                <Upload size={24} className="rim-upload-icon" />
                <p className="rim-upload-title">Click to select images</p>
                <p className="rim-upload-sub">JPG, PNG, WebP · Multiple files supported</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFiles}
              />

              {/* Preview queue */}
              {preview.length > 0 && (
                <div className="rim-preview-section">
                  <div className="rim-preview-header">
                    <span className="rim-section-label">
                      {preview.length} file{preview.length !== 1 ? 's' : ''} ready
                    </span>
                    <button className="rim-upload-btn" onClick={handleUpload} disabled={uploading}>
                      {uploading
                        ? <><div className="rim-spinner" /> Uploading…</>
                        : <><Upload size={12} /> Upload All</>
                      }
                    </button>
                  </div>
                  <div className="rim-preview-grid">
                    {preview.map((p, i) => (
                      <div key={i} className="rim-preview-item">
                        <img src={p.url} alt="" className="rim-preview-img" />
                        <button
                          className="rim-preview-remove"
                          onClick={() => removeQueued(i)}
                          type="button"
                        >
                          <X size={10} />
                        </button>
                        <p className="rim-preview-name">{p.file.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Existing photos */}
              <div>
                <p className="rim-section-label">Current Photos</p>
                {images.length === 0 ? (
                  <div className="rim-empty">No photos yet. Upload some above.</div>
                ) : (
                  <div className="rim-images-grid">
                    {images.map(img => (
                      <div key={img.id} className="rim-image-card">
                        <img
                          src={img.image_url ?? img.image}
                          alt={img.caption || 'Room photo'}
                          className="rim-image-img"
                        />
                        {img.is_primary && (
                          <span className="rim-primary-badge">
                            <Star size={9} /> Primary
                          </span>
                        )}
                        {img.caption && (
                          <div className="rim-caption">{img.caption}</div>
                        )}
                        <button
                          className="rim-delete-btn"
                          onClick={() => handleDelete(img.id)}
                          disabled={deletingId === img.id}
                          title="Delete image"
                          type="button"
                        >
                          {deletingId === img.id
                            ? <div className="rim-spinner" />
                            : <Trash2 size={12} />
                          }
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── PANORAMA TAB ── */}
          {!fetching && tab === 'panorama' && (
            <div className="rim-pano-section">
              <div className="rim-pano-info">
                <Camera size={14} />
                <span>
                  Upload an equirectangular panoramic image (2:1 ratio, e.g. 4096×2048px)
                  to enable the 360° room viewer.
                </span>
              </div>

              {/* Current panorama — show when set and not in replace preview */}
              {panorama && !panoPreview && (
                <div className="rim-pano-current">
                  <p className="rim-section-label">Current Panorama</p>
                  <div className="rim-pano-wrap">
                    <img src={panorama} alt="Panorama" className="rim-pano-img" />
                    <div className="rim-pano-actions">
                      <button
                        className="rim-pano-replace-btn"
                        onClick={() => panoRef.current?.click()}
                        type="button"
                      >
                        <Upload size={12} /> Replace
                      </button>
                      <button
                        className="rim-pano-delete-btn"
                        onClick={handlePanoDelete}
                        disabled={uploadingPano}
                        type="button"
                      >
                        {uploadingPano
                          ? <><div className="rim-spinner" /> Removing…</>
                          : <><Trash2 size={12} /> Remove</>
                        }
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload zone — show when no panorama */}
              {!panorama && !panoPreview && (
                <div className="rim-upload-zone" onClick={() => panoRef.current?.click()}>
                  <Camera size={24} className="rim-upload-icon" />
                  <p className="rim-upload-title">Click to select panoramic image</p>
                  <p className="rim-upload-sub">Equirectangular format · 2:1 ratio recommended</p>
                </div>
              )}

              {/* Panorama preview — show when file selected */}
              {panoPreview && (
                <div className="rim-pano-preview-section">
                  <div className="rim-preview-header">
                    <span className="rim-section-label">Panorama ready to upload</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="rim-outline-btn"
                        onClick={cancelPanoPreview}
                        type="button"
                      >
                        Cancel
                      </button>
                      <button
                        className="rim-upload-btn"
                        onClick={handlePanoUpload}
                        disabled={uploadingPano}
                        type="button"
                      >
                        {uploadingPano
                          ? <><div className="rim-spinner" /> Uploading…</>
                          : <><Upload size={12} /> Upload Panorama</>
                        }
                      </button>
                    </div>
                  </div>
                  <div className="rim-pano-wrap">
                    <img src={panoPreview.url} alt="Panorama preview" className="rim-pano-img" />
                  </div>
                  <p className="rim-preview-name">{panoPreview.file.name}</p>
                </div>
              )}

              <input
                ref={panoRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePanoFile}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="rim-footer">
          <button className="rim-btn-done" onClick={onClose} type="button">Done</button>
        </div>
      </div>
    </div>
  );
}