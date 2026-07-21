import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { MediaLightbox, type MediaLightboxItem } from '@/components/ui/MediaLightbox';
import { useVoceChatGallery } from '@/hooks/useVoceChatGallery';
import { vocechatService } from '@/services/vocechat';
import { albumMediaFileUrl, createAlbum, loadAlbums, loadGalleryAlbumMedia } from '@/services/albums';
import type { AlbumMedia, AlbumSummary } from '@/types';
import styles from './Gallery.module.css';

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15A9 9 0 1 1 23 10" />
    </svg>
  );
}

interface StreamItem {
  key: string;
  createdAt: number;
  type: 'image' | 'video';
  thumbUrl: string;
  fullUrl: string;
  downloadUrl?: string;
}

export function Gallery() {
  const navigate = useNavigate();
  const { files, loading: filesLoading, error: filesError, refresh } = useVoceChatGallery();
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [albumMedia, setAlbumMedia] = useState<AlbumMedia[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [savingAlbum, setSavingAlbum] = useState(false);

  const loadAlbumData = useCallback(async () => {
    setAlbumsLoading(true);
    try {
      const [albumList, media] = await Promise.all([loadAlbums(), loadGalleryAlbumMedia()]);
      setAlbums(albumList);
      setAlbumMedia(media);
    } catch {
      // Album backend may be unavailable; keep the VoceChat stream working.
    } finally {
      setAlbumsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAlbumData();
  }, [loadAlbumData]);

  const stream = useMemo<StreamItem[]>(() => {
    const fromVoceChat: StreamItem[] = files.map((file) => ({
      key: `vc-${file.mid}`,
      createdAt: file.created_at,
      type: 'image',
      thumbUrl: vocechatService.resourceFileUrl(file.thumbnail || file.content),
      fullUrl: vocechatService.resourceFileUrl(file.content),
      downloadUrl: vocechatService.resourceFileUrl(file.content, { download: true }),
    }));
    const fromAlbums: StreamItem[] = albumMedia.map((media) => ({
      key: `am-${media.id}`,
      createdAt: media.createdAt,
      type: media.type,
      thumbUrl: albumMediaFileUrl(media.id, { thumbnail: true }),
      fullUrl: albumMediaFileUrl(media.id),
      downloadUrl: albumMediaFileUrl(media.id, { download: true }),
    }));
    return [...fromVoceChat, ...fromAlbums].sort((a, b) => b.createdAt - a.createdAt);
  }, [files, albumMedia]);

  const lightboxItems = useMemo<MediaLightboxItem[]>(
    () => stream.map((item) => ({
      key: item.key,
      type: item.type,
      src: item.fullUrl,
      alt: 'Galleri',
      downloadUrl: item.downloadUrl,
    })),
    [stream],
  );

  const loading = filesLoading || albumsLoading;
  const countLabel = stream.length === 1 ? '1 element' : `${stream.length} elementer`;

  async function handleCreateAlbum() {
    const title = newTitle.trim();
    if (!title || savingAlbum) return;
    setSavingAlbum(true);
    try {
      const album = await createAlbum({ title, description: newDescription.trim() || undefined });
      setCreating(false);
      setNewTitle('');
      setNewDescription('');
      navigate(`/galleri/album/${album.id}`);
    } finally {
      setSavingAlbum(false);
    }
  }

  return (
    <section className={styles.gallery}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>Galleri</h2>
          <span className={styles.count}>{countLabel}</span>
        </div>
        <div className={styles.headerActions}>
          <Button size="sm" onClick={() => setCreating(true)}>+ Nytt album</Button>
          <button className={styles.refreshBtn} onClick={() => { refresh(); void loadAlbumData(); }} title="Oppdater galleri" aria-label="Oppdater galleri">
            <RefreshIcon />
          </button>
        </div>
      </header>

      <div className={styles.body}>
        {albums.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Album</h3>
            <div className={styles.albumGrid}>
              {albums.map((album) => (
                <button
                  key={album.id}
                  type="button"
                  className={styles.albumCard}
                  onClick={() => navigate(`/galleri/album/${album.id}`)}
                >
                  <AlbumCover album={album} />
                  <span className={styles.albumTitle}>{album.title}</span>
                  <span className={styles.albumMeta}>
                    {album.mediaCount === 1 ? '1 element' : `${album.mediaCount} elementer`}
                    {album.eventId ? ' · arrangement' : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles.section}>
          {albums.length > 0 && <h3 className={styles.sectionTitle}>Alle bilder</h3>}

          {loading && (
            <div className={styles.state}>
              <LoadingSpinner size="sm" />
              <span>Henter bilder…</span>
            </div>
          )}

          {!loading && filesError && stream.length === 0 && <div className={styles.state}>{filesError}</div>}

          {!loading && stream.length === 0 && !filesError && <div className={styles.state}>Ingen bilder funnet.</div>}

          {stream.length > 0 && (
            <div className={styles.grid}>
              {stream.map((item, i) => (
                <button
                  key={item.key}
                  className={styles.item}
                  onClick={() => setLightboxIndex(i)}
                  aria-label="Åpne media"
                >
                  <img className={styles.thumb} src={item.thumbUrl} alt="" loading="lazy" />
                  {item.type === 'video' && <span className={styles.playBadge}>▶</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {lightboxIndex !== null && (
        <MediaLightbox
          items={lightboxItems}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {creating && (
        <div className={styles.modalOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setCreating(false); }}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Nytt album">
            <h2 className={styles.modalTitle}>Nytt album</h2>
            <label className={styles.field}>
              <span>Tittel</span>
              <input className={styles.input} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={120} autoFocus />
            </label>
            <label className={styles.field}>
              <span>Beskrivelse (valgfritt)</span>
              <textarea className={styles.textarea} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={3} maxLength={500} />
            </label>
            <div className={styles.modalActions}>
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Avbryt</Button>
              <Button size="sm" onClick={() => void handleCreateAlbum()} disabled={!newTitle.trim()} loading={savingAlbum}>Opprett</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AlbumCover({ album }: { album: AlbumSummary }) {
  const ids = album.coverMediaIds.slice(0, 4);
  if (ids.length === 0) {
    return <div className={`${styles.albumCover} ${styles.albumCoverEmpty}`}>Tomt</div>;
  }
  if (ids.length === 1) {
    return <img className={styles.albumCover} src={albumMediaFileUrl(ids[0], { thumbnail: true })} alt="" loading="lazy" />;
  }
  return (
    <div className={`${styles.albumCover} ${styles.albumCollage}`}>
      {ids.map((id) => (
        <img key={id} src={albumMediaFileUrl(id, { thumbnail: true })} alt="" loading="lazy" />
      ))}
    </div>
  );
}
