import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale/nb';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { MediaLightbox, type MediaLightboxItem } from '@/components/ui/MediaLightbox';
import { UploadProgress } from '@/components/album/UploadProgress';
import { useAuthStore } from '@/store/authStore';
import {
  albumDownloadUrl,
  albumMediaFileUrl,
  deleteAlbum,
  deleteAlbumMedia,
  loadAlbum,
  updateAlbum,
  uploadAlbumMediaFiles,
  type AlbumUploadProgress,
} from '@/services/albums';
import type { Album, AlbumMedia } from '@/types';
import styles from './AlbumPage.module.css';

export function AlbumPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [slideshow, setSlideshow] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<AlbumUploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!albumId) return;
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadAlbum(albumId);
      setAlbum(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke laste albumet.');
    } finally {
      setLoading(false);
    }
  }, [albumId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canManage = Boolean(album && user && (user.isAdmin || album.createdBy.uid === user.uid));

  const lightboxItems = useMemo<MediaLightboxItem[]>(() => {
    if (!album) return [];
    return album.media.map((media) => ({
      key: media.id,
      type: media.type,
      src: albumMediaFileUrl(media.id),
      alt: album.title,
      downloadUrl: albumMediaFileUrl(media.id, { download: true }),
      canDelete: canManage || media.uploadedBy.uid === user?.uid,
    }));
  }, [album, canManage, user?.uid]);

  async function handleFiles(files: FileList | null) {
    if (!album || !files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    setUploadProgress({ done: 0, total: files.length, currentFraction: 0 });
    try {
      await uploadAlbumMediaFiles(album.id, Array.from(files), setUploadProgress);
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Kunne ikke laste opp.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function handleDeleteMedia(media: AlbumMedia) {
    if (!album) return;
    if (!window.confirm('Slette dette bildet/videoen?')) return;
    await deleteAlbumMedia(album.id, media.id);
    setLightboxIndex(null);
    await load();
  }

  async function handleDeleteAlbum() {
    if (!album) return;
    if (!window.confirm(`Slette hele albumet «${album.title}»? Dette kan ikke angres.`)) return;
    await deleteAlbum(album.id);
    navigate('/galleri');
  }

  function openEdit() {
    if (!album) return;
    setEditTitle(album.title);
    setEditDescription(album.description ?? '');
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!album) return;
    const title = editTitle.trim();
    if (!title) return;
    const updated = await updateAlbum(album.id, { title, description: editDescription.trim() });
    setAlbum(updated);
    setEditing(false);
  }

  return (
    <AppLayout>
      <div className={styles.page}>
        {loading && (
          <div className={styles.state}><LoadingSpinner size="sm" /><span>Laster album…</span></div>
        )}
        {!loading && error && <div className={styles.state}>{error}</div>}

        {!loading && !error && album && (
          <>
            <div className={styles.topBar}>
              <Link to="/galleri" className={styles.backLink}>← Galleri</Link>
            </div>

            <header className={styles.header}>
              <div className={styles.headerInfo}>
                <h1 className={styles.title}>{album.title}</h1>
                {album.description && <p className={styles.description}>{album.description}</p>}
                <div className={styles.meta}>
                  <span>{format(album.createdAt, 'd. MMMM yyyy', { locale: nb })}</span>
                  <span>·</span>
                  <span>{album.mediaCount === 1 ? '1 element' : `${album.mediaCount} elementer`}</span>
                  {album.eventId && (
                    <>
                      <span>·</span>
                      <Link className={styles.eventLink} to={`/arrangementer/${album.eventId}`}>Til arrangementet</Link>
                    </>
                  )}
                </div>
              </div>

              <div className={styles.actions}>
                <Button size="sm" onClick={() => fileInputRef.current?.click()} loading={uploading}>
                  Legg til bilder
                </Button>
                {album.media.length > 0 && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => { setSlideshow(true); setLightboxIndex(0); }}
                    >
                      Lysbildefremvisning
                    </Button>
                    <a className={styles.downloadBtn} href={albumDownloadUrl(album.id)} download>
                      Last ned album
                    </a>
                  </>
                )}
                {canManage && (
                  <>
                    <Button size="sm" variant="ghost" onClick={openEdit}>Rediger</Button>
                    <Button size="sm" variant="danger" onClick={() => void handleDeleteAlbum()}>Slett</Button>
                  </>
                )}
              </div>
            </header>

            {uploadProgress && <UploadProgress progress={uploadProgress} />}

            {uploadError && <p className={styles.uploadError}>{uploadError}</p>}

            {album.media.length === 0 ? (
              <div className={styles.empty}>
                <p>Ingen bilder eller videoer enda.</p>
                <Button size="sm" onClick={() => fileInputRef.current?.click()} loading={uploading}>
                  Legg til de første bildene
                </Button>
              </div>
            ) : (
              <div className={styles.grid}>
                {album.media.map((media, i) => (
                  <button
                    key={media.id}
                    type="button"
                    className={styles.item}
                    onClick={() => { setSlideshow(false); setLightboxIndex(i); }}
                    title={format(media.createdAt, 'dd.MM.yyyy')}
                  >
                    <img
                      className={styles.thumb}
                      src={albumMediaFileUrl(media.id, { thumbnail: true })}
                      alt={album.title}
                      loading="lazy"
                    />
                    {media.type === 'video' && <span className={styles.playBadge}>▶</span>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.heic,.heif"
          multiple
          className={styles.fileInput}
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
        />

        {lightboxIndex !== null && album && (
          <MediaLightbox
            items={lightboxItems}
            index={lightboxIndex}
            onIndexChange={setLightboxIndex}
            onClose={() => { setLightboxIndex(null); setSlideshow(false); }}
            onDelete={(_item, i) => void handleDeleteMedia(album.media[i])}
            startSlideshow={slideshow}
          />
        )}

        {editing && album && (
          <div className={styles.modalOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(false); }}>
            <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Rediger album">
              <h2 className={styles.modalTitle}>Rediger album</h2>
              <label className={styles.field}>
                <span>Tittel</span>
                <input className={styles.input} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={120} />
              </label>
              <label className={styles.field}>
                <span>Beskrivelse</span>
                <textarea className={styles.textarea} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} maxLength={500} />
              </label>
              <div className={styles.modalActions}>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Avbryt</Button>
                <Button size="sm" onClick={() => void handleSaveEdit()} disabled={!editTitle.trim()}>Lagre</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
