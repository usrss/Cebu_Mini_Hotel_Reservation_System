import { useState, useRef, useEffect } from 'react';
import { X, Upload, Trash2, Star } from 'lucide-react';
import { adminUploadRoomImages, adminDeleteRoomImage, adminGetRoom } from '../../services/roomService';
import './RoomImageModal.css';

export default function RoomImageModal({ room, onUpload, onClose }) {
  const [images,     setImages]     = useState(room.images ?? []);
  const [uploading,  setUploading]  = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [preview,    setPreview]    = useState([]);
  const [error,      setError]      = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    adminGetRoom(room.id)
      .then(res => setImages(res.data.images ?? []))
      .catch(() => {});
  }, [room.id]);

  const handleFiles = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setPreview(files.map(f => ({ file: f, url: URL.createObjectURL(f) })));
  };

  const handleUpload = async () => {
    if (!preview.length) return;
    setUploading(true);
    setError(null);
    try {
      const files  = preview.map(p => p.file);
      const result = await onUpload(room.id, files);
      if (result.success) {
        const res = await adminGetRoom(room.id);
        setImages(res.data.images ?? []);
        setPreview([]);
        if (fileRef.current) fileRef.current.value = '';
      } else {
        setError('Upload failed. Please try again.');
      }
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (imageId) => {
    if (!window.confirm('Delete this image?')) return;
    setDeletingId(imageId);
    try {
      await adminDeleteRoomImage(room.id, imageId);
      setImages(prev => prev.filter(img => img.id !== imageId));
    } catch {
      setError('Failed to delete image.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rim-overlay">
      <div className="rim-modal">

        {/* Header */}
        <div className="rim-header">
          <div>
            <h2 className="rim-title">Room Images — #{room.room_number}</h2>
            <p className="rim-subtitle">{images.length} photo{images.length !== 1 ? 's' : ''}</p>
          </div>
          <button className="rim-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="rim-body">

          {/* Upload zone */}
          <div className="rim-upload-zone" onClick={() => fileRef.current?.click()}>
            <Upload size={26} className="rim-upload-icon" />
            <p className="rim-upload-title">Click to select images</p>
            <p className="rim-upload-sub">JPG, PNG, WebP — multiple files supported</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFiles}
          />

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <div className="rim-preview-header">
                <span className="rim-preview-label">
                  {preview.length} file{preview.length !== 1 ? 's' : ''} selected
                </span>
                <button
                  className="rim-upload-btn"
                  onClick={handleUpload}
                  disabled={uploading}
                >
                  {uploading
                    ? <><div className="rim-spinner" /> Uploading…</>
                    : <><Upload size={13} /> Upload All</>
                  }
                </button>
              </div>
              <div className="rim-preview-grid">
                {preview.map((p, i) => (
                  <div key={i} className="rim-preview-item">
                    <img src={p.url} alt="" className="rim-preview-img" />
                    <button
                      className="rim-preview-remove"
                      onClick={() => setPreview(prev => prev.filter((_, j) => j !== i))}
                    >
                      <X size={11} />
                    </button>
                    <p className="rim-preview-name">{p.file.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div className="rim-error">{error}</div>}

          {/* Existing images */}
          <div>
            <p className="rim-section-label">Current Photos</p>
            {images.length === 0 ? (
              <div className="rim-no-images">No photos yet. Upload some above.</div>
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
                        <Star size={10} /> Primary
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
                    >
                      {deletingId === img.id
                        ? <div className="rim-spinner" />
                        : <Trash2 size={13} />
                      }
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="rim-footer">
          <button className="rim-btn-done" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}