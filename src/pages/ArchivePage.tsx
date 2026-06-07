import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Lightbox } from '@/components/ui/Lightbox';
import { appApi } from '@/services/appApi';
import { vocechatService } from '@/services/vocechat';
import { statusrapportImageUrl } from '@/services/feed';
import { useAuthStore } from '@/store/authStore';
import type { FileFilterType, GetFilesQuery, Group, User, VoceChatFile } from '@/types';
import styles from './ArchivePage.module.css';

type UserOption = Pick<User, 'uid' | 'name'>;

type DraftFilters = {
  uid: string;
  gid: string;
  fileType: '' | FileFilterType;
  creationTimeType: '' | NonNullable<GetFilesQuery['creation_time_type']>;
};

type ParsedFileMeta = {
  name?: string;
  content_type?: string;
  size?: number;
};

type StatusrapportArchiveItem = {
  imageId: string;
  actorUid: number | null;
  actorName: string;
  createdAt: number;
  caption: string;
};

type NormalizedItem = {
  key: string;
  source: 'vocechat' | 'statusrapport';
  kind: 'image' | 'audio' | 'video' | 'pdf' | 'doc' | 'file';
  name: string;
  mimeType: string;
  previewUrl: string;
  fullUrl: string;
  sizeLabel: string;
  dateLabel: string;
  sourceLabel: string;
  pathLabel: string;
  actorUid: number | null;
  createdAt: number;
};

const DEFAULT_FILTERS: DraftFilters = {
  uid: '',
  gid: '',
  fileType: '',
  creationTimeType: '',
};

const PAGE_SIZE = 500;
const MAX_PAGES = 25;

const FILE_TYPE_OPTIONS: Array<{ value: DraftFilters['fileType']; label: string }> = [
  { value: '', label: 'Alle typer' },
  { value: 'Doc', label: 'Dokument' },
  { value: 'PDF', label: 'PDF' },
  { value: 'Image', label: 'Bilde' },
  { value: 'Audio', label: 'Lyd' },
  { value: 'Video', label: 'Video' },
];

const DATE_OPTIONS: Array<{ value: DraftFilters['creationTimeType']; label: string }> = [
  { value: '', label: 'Alle datoer' },
  { value: 'Day1', label: 'Siste 24 timer' },
  { value: 'Day7', label: 'Siste 7 dager' },
  { value: 'Day30', label: 'Siste 30 dager' },
  { value: 'Day90', label: 'Siste 3 måneder' },
  { value: 'Day180', label: 'Siste 6 måneder' },
];

const DATE_CUTOFF_MS: Partial<Record<NonNullable<GetFilesQuery['creation_time_type']>, number>> = {
  Day1:   1 *  24 * 60 * 60 * 1000,
  Day7:   7 *  24 * 60 * 60 * 1000,
  Day30:  30 * 24 * 60 * 60 * 1000,
  Day90:  90 * 24 * 60 * 60 * 1000,
  Day180: 180 * 24 * 60 * 60 * 1000,
};

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15A9 9 0 1 1 23 10" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function AudioIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19a7 7 0 0 0 7-7V5" />
      <path d="M5 12a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="15" height="12" rx="2" />
      <polygon points="23 7 16 12 23 17 23 7" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8" />
    </svg>
  );
}

function formatBytes(bytes?: number) {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return 'Ukjent størrelse';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function parseProperties(raw: string): ParsedFileMeta {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const meta = parsed as ParsedFileMeta;
    return {
      name: typeof meta.name === 'string' ? meta.name : undefined,
      content_type: typeof meta.content_type === 'string' ? meta.content_type : undefined,
      size: typeof meta.size === 'number' ? meta.size : undefined,
    };
  } catch {
    return {};
  }
}

function getFileKind(contentType?: string, ext?: string) {
  const normalizedType = (contentType || '').toLowerCase();
  const normalizedExt = (ext || '').toLowerCase().replace(/^\./, '');
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'];
  const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
  const videoExts = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'];
  const docExts = ['txt', 'md', 'rtf', 'doc', 'docx', 'odt'];

  if (normalizedType.startsWith('image/') || imageExts.includes(normalizedExt)) return 'image';
  if (normalizedType.startsWith('audio/') || audioExts.includes(normalizedExt)) return 'audio';
  if (normalizedType.startsWith('video/') || videoExts.includes(normalizedExt)) return 'video';
  if (normalizedType.includes('pdf') || normalizedExt === 'pdf') return 'pdf';
  if (
    normalizedType.includes('text') ||
    normalizedType.includes('document') ||
    normalizedType.includes('word') ||
    docExts.includes(normalizedExt)
  ) {
    return 'doc';
  }
  return 'file';
}

function getFileKindLabel(kind: string) {
  switch (kind) {
    case 'image': return 'BILDE';
    case 'audio': return 'LYD';
    case 'video': return 'VIDEO';
    case 'pdf':   return 'PDF';
    case 'doc':   return 'DOC';
    default:      return 'FIL';
  }
}

function FileKindBadge({ kind }: { kind: string }) {
  switch (kind) {
    case 'image': return <ImageIcon />;
    case 'audio': return <AudioIcon />;
    case 'video': return <VideoIcon />;
    case 'pdf':   return <PdfIcon />;
    default:      return <FileIcon />;
  }
}

function formatUserLabel(user: UserOption) {
  return `${user.name} (#${user.uid})`;
}

function formatGroupLabel(group: Group) {
  return `${group.name} (#${group.gid})`;
}

function formatError(prefix: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message ? `${prefix}: ${message}` : prefix;
}

function normalizeVoceChatFile(
  file: VoceChatFile,
  userNameById: Map<number, string>,
  groupNameById: Map<number, string>,
): NormalizedItem {
  const meta = parseProperties(file.properties);
  const mime = meta.content_type ?? file.content_type ?? '';
  const kind = getFileKind(mime, file.ext) as NormalizedItem['kind'];
  const name = meta.name?.trim() || file.content || `Fil ${file.mid}`;
  const previewPath = file.thumbnail || file.content;
  const sourceLabel = file.gid
    ? groupNameById.get(file.gid) || `Gruppe #${file.gid}`
    : userNameById.get(file.from_uid) || `Person #${file.from_uid}`;
  return {
    key: `vc-${file.mid}`,
    source: 'vocechat',
    kind,
    name,
    mimeType: mime,
    previewUrl: vocechatService.resourceFileUrl(previewPath),
    fullUrl: vocechatService.resourceFileUrl(file.content),
    sizeLabel: formatBytes(meta.size),
    dateLabel: format(file.created_at, 'dd.MM.yyyy HH:mm'),
    sourceLabel,
    pathLabel: file.content,
    actorUid: file.from_uid,
    createdAt: file.created_at,
  };
}

function normalizeStatusrapportItem(item: StatusrapportArchiveItem, token: string | null | undefined): NormalizedItem {
  const url = statusrapportImageUrl(item.imageId, token);
  const name = item.caption
    ? (item.caption.length > 60 ? `${item.caption.slice(0, 57)}…` : item.caption)
    : 'Statusrapport';
  return {
    key: `sr-${item.imageId}`,
    source: 'statusrapport',
    kind: 'image',
    name,
    mimeType: 'Statusrapport',
    previewUrl: url,
    fullUrl: url,
    sizeLabel: '',
    dateLabel: format(item.createdAt, 'dd.MM.yyyy HH:mm'),
    sourceLabel: item.actorName,
    pathLabel: 'Statusrapport',
    actorUid: item.actorUid,
    createdAt: item.createdAt,
  };
}

export function ArchivePage() {
  const token = useAuthStore((s) => s.token);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<DraftFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<DraftFilters>(DEFAULT_FILTERS);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [files, setFiles] = useState<VoceChatFile[]>([]);
  const [statusrapportItems, setStatusrapportItems] = useState<StatusrapportArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      appApi.get<UserOption[]>('/users'),
      vocechatService.getGroups(),
    ]).then(([usersResult, groupsResult]) => {
      if (cancelled) return;
      if (usersResult.status === 'fulfilled') {
        setUsers(
          [...usersResult.value]
            .filter((user) => user.name.trim())
            .sort((l, r) => l.name.localeCompare(r.name, 'nb', { sensitivity: 'base' }) || l.uid - r.uid)
        );
      }
      if (groupsResult.status === 'fulfilled') {
        setGroups(
          [...groupsResult.value]
            .filter((group) => group.name.trim())
            .sort((l, r) => l.name.localeCompare(r.name, 'nb', { sensitivity: 'base' }) || l.gid - r.gid)
        );
      }
    });
    return () => { cancelled = true; };
  }, []);

  const query = useMemo(() => {
    const params: GetFilesQuery = { page_size: PAGE_SIZE };
    const gid = draftOrAppliedToNumber(appliedFilters.gid);
    // uid is NOT passed to VoceChat — the API returns 500 for uid filtering.
    // We filter by actorUid client-side in normalizedItems instead.
    if (gid !== undefined) params.gid = gid;
    if (appliedFilters.fileType) params.file_type = appliedFilters.fileType;
    if (appliedFilters.creationTimeType) params.creation_time_type = appliedFilters.creationTimeType;
    return params;
  }, [appliedFilters]);

  const userNameById = useMemo(() => new Map(users.map((u) => [u.uid, u.name.trim()] as const)), [users]);
  const groupNameById = useMemo(() => new Map(groups.map((g) => [g.gid, g.name.trim()] as const)), [groups]);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    // Statusrapport fetch runs in parallel with VoceChat pagination
    const srPromise = appApi.get<StatusrapportArchiveItem[]>(`/statusrapport/images?limit=${PAGE_SIZE}`).catch(() => []);

    try {
      const seen = new Set<number>();
      const collected: VoceChatFile[] = [];

      const appendFiles = (batch: VoceChatFile[]) => {
        for (const file of batch) {
          if (seen.has(file.mid)) continue;
          seen.add(file.mid);
          if (file.expired || file.gid === -1) continue;
          collected.push(file);
        }
      };

      const firstBatch = await vocechatService.getSystemFiles(query);
      if (requestId !== requestIdRef.current) return;

      appendFiles(firstBatch);

      if (firstBatch.length >= PAGE_SIZE) {
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const batch = await vocechatService.getSystemFiles({ ...query, page });
          if (requestId !== requestIdRef.current) return;
          const beforeCount = collected.length;
          appendFiles(batch);
          if (batch.length === 0) break;
          if (page > 1 && collected.length === beforeCount) break;
          if (batch.length < PAGE_SIZE) break;
        }
      }

      collected.sort((a, b) => b.created_at - a.created_at || b.mid - a.mid);
      setFiles(collected);

      const srItems = await srPromise;
      if (requestId !== requestIdRef.current) return;
      setStatusrapportItems(srItems);
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(formatError('Kunne ikke laste arkiv', err));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [query]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Merge VoceChat files and statusrapport images into one sorted list
  const normalizedItems = useMemo(() => {
    const { uid, gid, fileType, creationTimeType } = appliedFilters;
    const uidNum = draftOrAppliedToNumber(uid);
    const gidNum = draftOrAppliedToNumber(gid);

    const vcItems = files
      .filter((f) => uidNum === undefined || f.from_uid === uidNum)
      .map((f) => normalizeVoceChatFile(f, userNameById, groupNameById));

    // Statusrapport images are always images — exclude when a non-image or group filter is active
    let srItems = statusrapportItems;
    if (gidNum !== undefined) srItems = [];
    if (fileType && fileType !== 'Image') srItems = [];
    if (uidNum !== undefined) srItems = srItems.filter((i) => i.actorUid === uidNum);
    if (creationTimeType) {
      const cutoff = DATE_CUTOFF_MS[creationTimeType];
      if (cutoff) {
        const threshold = Date.now() - cutoff;
        srItems = srItems.filter((i) => i.createdAt >= threshold);
      }
    }

    const srNormalized = srItems.map((i) => normalizeStatusrapportItem(i, token));

    return [...vcItems, ...srNormalized].sort((a, b) => b.createdAt - a.createdAt);
  }, [files, statusrapportItems, appliedFilters, userNameById, groupNameById, token]);

  const fileCountLabel = normalizedItems.length === 1 ? '1 fil' : `${normalizedItems.length} filer`;
  const hasDraftChanges = JSON.stringify(draftFilters) !== JSON.stringify(appliedFilters);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters(draftFilters);
  };

  const handleReset = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  };

  const selectedUserId = draftOrAppliedToNumber(draftFilters.uid);
  const selectedGroupId = draftOrAppliedToNumber(draftFilters.gid);

  return (
    <AppLayout>
      <div className={styles.page}>
        <section className={styles.shell}>
          <header className={styles.header}>
            <div className={styles.titleBlock}>
              <h1 className={styles.title}>Arkiv</h1>
              <span className={styles.subtitle}>{fileCountLabel}</span>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={refresh}
                title="Oppdater arkiv"
                aria-label="Oppdater arkiv"
                disabled={loading}
              >
                <RefreshIcon />
              </button>
            </div>
          </header>

          <form className={styles.toolbar} onSubmit={handleSubmit} onReset={handleReset}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Person</span>
              <select
                className={styles.input}
                value={draftFilters.uid}
                onChange={(e) => setDraftFilters((prev) => ({ ...prev, uid: e.target.value }))}
              >
                <option value="">Alle personer</option>
                {selectedUserId !== undefined && !users.some((u) => u.uid === selectedUserId) && (
                  <option value={draftFilters.uid}>Ukjent person (#{draftFilters.uid})</option>
                )}
                {users.map((user) => (
                  <option key={user.uid} value={String(user.uid)}>{formatUserLabel(user)}</option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Gruppe</span>
              <select
                className={styles.input}
                value={draftFilters.gid}
                onChange={(e) => setDraftFilters((prev) => ({ ...prev, gid: e.target.value }))}
              >
                <option value="">Alle grupper</option>
                {selectedGroupId !== undefined && !groups.some((g) => g.gid === selectedGroupId) && (
                  <option value={draftFilters.gid}>Ukjent gruppe (#{draftFilters.gid})</option>
                )}
                {groups.map((group) => (
                  <option key={group.gid} value={String(group.gid)}>{formatGroupLabel(group)}</option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Type</span>
              <select
                className={styles.input}
                value={draftFilters.fileType}
                onChange={(e) =>
                  setDraftFilters((prev) => ({ ...prev, fileType: e.target.value as DraftFilters['fileType'] }))
                }
              >
                {FILE_TYPE_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Dato</span>
              <select
                className={styles.input}
                value={draftFilters.creationTimeType}
                onChange={(e) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    creationTimeType: e.target.value as DraftFilters['creationTimeType'],
                  }))
                }
              >
                {DATE_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <div className={styles.formActions}>
              <button type="reset" className={styles.secondaryBtn}>
                <ResetIcon />
                Nullstill
              </button>
              <button type="submit" className={styles.primaryBtn} disabled={!hasDraftChanges}>
                Bruk filtre
              </button>
            </div>
          </form>

          <div className={styles.list}>
            {loading && (
              <div className={styles.state}>
                <LoadingSpinner size="sm" />
                <span>Henter filer...</span>
              </div>
            )}

            {!loading && error && <div className={styles.state}>{error}</div>}

            {!loading && !error && normalizedItems.length === 0 && (
              <div className={styles.state}>Ingen filer funnet.</div>
            )}

            {!loading && !error && normalizedItems.map((item) => {
              const isImage = item.kind === 'image';
              const rowProps = isImage
                ? { onClick: () => setLightboxSrc(item.fullUrl), role: 'button' as const, tabIndex: 0 }
                : { href: item.fullUrl, target: '_blank', rel: 'noreferrer' };
              const Tag = isImage ? 'div' : 'a';

              return (
                <Tag
                  key={item.key}
                  className={styles.row}
                  title={`Åpne ${item.name}`}
                  {...rowProps}
                >
                  <div className={styles.preview}>
                    {isImage ? (
                      <img className={styles.previewImage} src={item.previewUrl} alt={item.name} loading="lazy" />
                    ) : (
                      <div className={styles.previewBadge} data-kind={item.kind}>
                        <FileKindBadge kind={item.kind} />
                        <span>{getFileKindLabel(item.kind)}</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.details}>
                    <div className={styles.nameRow}>
                      <span className={styles.name}>{item.name}</span>
                      <span className={styles.kind}>{item.mimeType}</span>
                    </div>
                    <div className={styles.metaRow}>
                      <span>{item.sourceLabel}</span>
                      {item.sizeLabel && <span>{item.sizeLabel}</span>}
                    </div>
                  </div>

                  <div className={styles.rightMeta}>
                    <span className={styles.date}>{item.dateLabel}</span>
                    <span className={styles.path}>{item.pathLabel}</span>
                  </div>
                </Tag>
              );
            })}
          </div>
        </section>
      </div>

      {lightboxSrc && (
        <Lightbox src={lightboxSrc} alt="Arkivbilde" onClose={() => setLightboxSrc(null)} />
      )}
    </AppLayout>
  );
}

function draftOrAppliedToNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
