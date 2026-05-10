import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { appApi } from '@/services/appApi';
import { vocechatService } from '@/services/vocechat';
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
    case 'image':
      return 'BILDE';
    case 'audio':
      return 'LYD';
    case 'video':
      return 'VIDEO';
    case 'pdf':
      return 'PDF';
    case 'doc':
      return 'DOC';
    default:
      return 'FIL';
  }
}

function FileKindBadge({ kind }: { kind: string }) {
  switch (kind) {
    case 'image':
      return <ImageIcon />;
    case 'audio':
      return <AudioIcon />;
    case 'video':
      return <VideoIcon />;
    case 'pdf':
      return <PdfIcon />;
    case 'doc':
      return <FileIcon />;
    default:
      return <FileIcon />;
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

export function ArchivePage() {
  const [draftFilters, setDraftFilters] = useState<DraftFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<DraftFilters>(DEFAULT_FILTERS);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [files, setFiles] = useState<VoceChatFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    void Promise.allSettled([
      appApi.get<UserOption[]>('/users'),
      vocechatService.getGroups(),
    ]).then(([usersResult, groupsResult]) => {
      if (cancelled) {
        return;
      }

      if (usersResult.status === 'fulfilled') {
        setUsers(
          [...usersResult.value]
            .filter((user) => user.name.trim())
            .sort(
              (left, right) =>
                left.name.localeCompare(right.name, 'nb', { sensitivity: 'base' }) || left.uid - right.uid
            )
        );
      } else {
        setUsers([]);
      }

      if (groupsResult.status === 'fulfilled') {
        setGroups(
          [...groupsResult.value]
            .filter((group) => group.name.trim())
            .sort(
              (left, right) =>
                left.name.localeCompare(right.name, 'nb', { sensitivity: 'base' }) || left.gid - right.gid
            )
        );
      } else {
        setGroups([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const query = useMemo(() => {
    const params: GetFilesQuery = { page_size: PAGE_SIZE };
    const uid = draftOrAppliedToNumber(appliedFilters.uid);
    const gid = draftOrAppliedToNumber(appliedFilters.gid);

    if (uid !== undefined) params.uid = uid;
    if (gid !== undefined) params.gid = gid;
    if (appliedFilters.fileType) params.file_type = appliedFilters.fileType;
    if (appliedFilters.creationTimeType) params.creation_time_type = appliedFilters.creationTimeType;

    return params;
  }, [appliedFilters]);

  const userNameById = useMemo(() => new Map(users.map((user) => [user.uid, user.name.trim()] as const)), [users]);
  const groupNameById = useMemo(
    () => new Map(groups.map((group) => [group.gid, group.name.trim()] as const)),
    [groups]
  );

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const seen = new Set<number>();
      const collected: VoceChatFile[] = [];

      const appendFiles = (batch: VoceChatFile[]) => {
        for (const file of batch) {
          if (file.expired || seen.has(file.mid)) continue;
          seen.add(file.mid);
          collected.push(file);
        }
      };

      const firstBatch = await vocechatService.getSystemFiles(query);
      if (requestId !== requestIdRef.current) return;

      appendFiles(firstBatch);

      if (firstBatch.length >= PAGE_SIZE) {
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const batch = await vocechatService.getSystemFiles({
            ...query,
            page,
          });

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
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(formatError('Failed to load Arkiv', err));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fileCountLabel = files.length === 1 ? '1 fil' : `${files.length} filer`;
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
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, uid: event.target.value }))}
              >
                <option value="">Alle personer</option>
                {selectedUserId !== undefined && !users.some((user) => user.uid === selectedUserId) && (
                  <option value={draftFilters.uid}>Ukjent person (#{draftFilters.uid})</option>
                )}
                {users.map((user) => (
                  <option key={user.uid} value={String(user.uid)}>
                    {formatUserLabel(user)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Gruppe</span>
              <select
                className={styles.input}
                value={draftFilters.gid}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, gid: event.target.value }))}
              >
                <option value="">Alle grupper</option>
                {selectedGroupId !== undefined && !groups.some((group) => group.gid === selectedGroupId) && (
                  <option value={draftFilters.gid}>Ukjent gruppe (#{draftFilters.gid})</option>
                )}
                {groups.map((group) => (
                  <option key={group.gid} value={String(group.gid)}>
                    {formatGroupLabel(group)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Type</span>
              <select
                className={styles.input}
                value={draftFilters.fileType}
                onChange={(event) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    fileType: event.target.value as DraftFilters['fileType'],
                  }))
                }
              >
                {FILE_TYPE_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Dato</span>
              <select
                className={styles.input}
                value={draftFilters.creationTimeType}
                onChange={(event) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    creationTimeType: event.target.value as DraftFilters['creationTimeType'],
                  }))
                }
              >
                {DATE_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
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
                <span>Henter filer fra VoceChat...</span>
              </div>
            )}

            {!loading && error && <div className={styles.state}>{error}</div>}

            {!loading && !error && files.length === 0 && <div className={styles.state}>Ingen filer funnet.</div>}

            {!loading &&
              !error &&
              files.map((file) => {
                const meta = parseProperties(file.properties);
                const mime = meta.content_type ?? file.content_type ?? '';
                const kind = getFileKind(mime, file.ext);
                const fileName = meta.name?.trim() || file.content || `Fil ${file.mid}`;
                const sizeLabel = formatBytes(meta.size);
                const dateLabel = format(file.created_at, 'dd.MM.yyyy HH:mm');
                const previewPath = file.thumbnail || file.content;
                const previewUrl = vocechatService.resourceFileUrl(previewPath);
                const fullUrl = vocechatService.resourceFileUrl(file.content);
                const sourceLabel = file.gid
                  ? groupNameById.get(file.gid) || `Gruppe #${file.gid}`
                  : userNameById.get(file.from_uid) || `Person #${file.from_uid}`;

                return (
                  <a
                    key={file.mid}
                    className={styles.row}
                    href={fullUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={`Åpne ${fileName}`}
                  >
                    <div className={styles.preview}>
                      {kind === 'image' ? (
                        <img className={styles.previewImage} src={previewUrl} alt={fileName} loading="lazy" />
                      ) : (
                        <div className={styles.previewBadge} data-kind={kind}>
                          <FileKindBadge kind={kind} />
                          <span>{getFileKindLabel(kind)}</span>
                        </div>
                      )}
                    </div>

                    <div className={styles.details}>
                      <div className={styles.nameRow}>
                        <span className={styles.name}>{fileName}</span>
                        <span className={styles.kind}>{mime || 'ukjent type'}</span>
                      </div>
                      <div className={styles.metaRow}>
                        <span>{sourceLabel}</span>
                        <span>{sizeLabel}</span>
                      </div>
                    </div>

                    <div className={styles.rightMeta}>
                      <span className={styles.date}>{dateLabel}</span>
                      <span className={styles.path}>{file.content}</span>
                    </div>
                  </a>
                );
              })}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function draftOrAppliedToNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
