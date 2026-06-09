import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useDevStore } from '@/store/devStore';
import { loadDevData, createIssue, getIssueDetail, addComment, patchIssue, uploadDevImage } from '@/services/dev';
import type { GitHubPR, GitHubRelease, GitHubWorkflowRun, GitHubIssue, ProjectItem, ProjectStatusOption, IssueColumnId, IssueDetail, GitHubComment, GitHubLabel } from '@/types';
import styles from './DevPage.module.css';

// ── Status model — derived from issue state + the "in-progress" label ───────

const IN_PROGRESS_LABEL = 'in-progress';

const COLUMNS: ProjectStatusOption[] = [
  { id: 'todo', name: 'Todo' },
  { id: 'in-progress', name: 'In Progress' },
  { id: 'done', name: 'Done' },
];

function getIssueColumn(issue: GitHubIssue): IssueColumnId {
  if (issue.state === 'closed') return 'done';
  if (issue.labels.some((l) => l.name.toLowerCase() === IN_PROGRESS_LABEL)) return 'in-progress';
  return 'todo';
}

function issueToItem(issue: GitHubIssue): ProjectItem {
  const col = getIssueColumn(issue);
  return {
    id: String(issue.number),
    statusOptionId: col,
    status: COLUMNS.find((c) => c.id === col)?.name ?? null,
    issue,
  };
}

// Compute the GitHub patch needed to move an issue into a target column.
function patchForColumn(issue: GitHubIssue, target: IssueColumnId): { state?: 'open' | 'closed'; labels: string[] } {
  const without = issue.labels.map((l) => l.name).filter((n) => n.toLowerCase() !== IN_PROGRESS_LABEL);
  if (target === 'in-progress') return { state: 'open', labels: [...without, IN_PROGRESS_LABEL] };
  if (target === 'todo') return { state: 'open', labels: without };
  return { state: 'closed', labels: without };
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IssueOpenIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>
    </svg>
  );
}

function IssueClosedIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"/>
      <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z"/>
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={spinning ? { animation: 'spin 0.7s linear infinite' } : undefined} aria-hidden="true">
      <path d="M21 12a9 9 0 0 1-15.5 6.36"/>
      <polyline points="21 8 21 12 17 12"/>
      <path d="M3 12a9 9 0 0 1 15.5-6.36"/>
      <polyline points="3 16 3 12 7 12"/>
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

// ── Label picker (toggleable chips) ─────────────────────────────────────────

function LabelPicker({ available, selected, onToggle }: {
  available: GitHubLabel[];
  selected: string[];
  onToggle: (name: string) => void;
}) {
  if (!available || available.length === 0) {
    return <span className={styles.labelPickerEmpty}>Ingen labels i repoet</span>;
  }
  return (
    <div className={styles.labelPicker}>
      {available.map((l) => {
        const on = selected.includes(l.name);
        return (
          <button
            type="button"
            key={l.id}
            className={`${styles.labelToggle} ${on ? '' : styles.labelToggleOff}`}
            style={on ? { background: `#${l.color}22`, color: `#${l.color}`, borderColor: `#${l.color}55` } : undefined}
            onClick={() => onToggle(l.name)}
            title={l.description || l.name}
          >
            {l.name}
          </button>
        );
      })}
    </div>
  );
}

function ImageIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="6" height="18" rx="1"/>
      <rect x="10" y="3" width="6" height="12" rx="1"/>
      <rect x="17" y="3" width="4" height="8" rx="1"/>
    </svg>
  );
}

function TableIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="1"/>
      <line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>
      <line x1="9" y1="3" x2="9" y2="21"/>
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function BugIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/>
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/>
      <path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/>
    </svg>
  );
}

// ── Body editor with image upload / paste ───────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function BodyEditor({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [focus, setFocus] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { valueRef.current = value; }, [value]);

  async function handleUpload(file: File) {
    if (!file || !file.type.startsWith('image/')) return;
    const ta = taRef.current;
    const pos = ta?.selectionStart ?? valueRef.current.length;
    setUploading(true);
    setError('');
    try {
      const dataUrl = await fileToDataUrl(file);
      const { url } = await uploadDevImage(dataUrl);
      const md = `![image](${url})`;
      const cur = valueRef.current;
      const prefix = cur.slice(0, pos);
      const needsNl = prefix.length > 0 && !prefix.endsWith('\n') ? '\n' : '';
      onChange(prefix + needsNl + md + '\n' + cur.slice(pos));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Klarte ikke laste opp bilde');
    } finally {
      setUploading(false);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) { e.preventDefault(); void handleUpload(file); return; }
      }
    }
  }

  return (
    <div className={`${styles.bodyEditor} ${dragging ? styles.bodyEditorDragging : focus ? styles.bodyEditorFocus : ''}`}>
      <textarea
        ref={taRef}
        className={styles.bodyEditorTextarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onPaste={onPaste}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          const file = e.dataTransfer?.files?.[0];
          if (file) void handleUpload(file);
        }}
        placeholder={placeholder}
      />
      <div className={styles.bodyEditorToolbar}>
        <button type="button" className={styles.bodyEditorUploadBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>
          <ImageIcon /> Last opp bilde
        </button>
        {uploading
          ? <span className={styles.bodyEditorUploading}><span className={styles.spinner} style={{ width: 12, height: 12, borderWidth: 2 }} /> Laster opp…</span>
          : error
            ? <span className={styles.commentError} style={{ flex: 'none' }}>{error}</span>
            : <span className={styles.bodyEditorHint}>Lim inn eller dra inn bilder</span>
        }
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t`;
  return `${Math.floor(h / 24)}d`;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Left sidebar panels ───────────────────────────────────────────────────────

function PullRequestsPanel({ prs }: { prs: GitHubPR[] }) {
  return (
    <div className={styles.sidePanel}>
      <div className={styles.sidePanelHeader}><span className={styles.sidePanelTitle}>Pull Requests</span></div>
      <div className={styles.sidePanelBody}>
        {prs.length === 0
          ? <div className={styles.empty}>Ingen åpne PRs</div>
          : prs.map((pr) => (
            <a key={pr.number} href={pr.html_url} target="_blank" rel="noreferrer" className={styles.row}>
              <div className={styles.rowTitleLine}>
                <span className={styles.rowTitle}>{pr.title}</span>
                {pr.draft && <span className={styles.draftBadge}>Draft</span>}
              </div>
              <div className={styles.rowMeta}>
                <span>#{pr.number} · {pr.user.login}</span>
                <span className={styles.branchChip}>{pr.head.ref}</span>
                <span>{relativeTime(pr.updated_at)}</span>
              </div>
            </a>
          ))}
      </div>
    </div>
  );
}

function ReleasesPanel({ releases }: { releases: GitHubRelease[] }) {
  return (
    <div className={styles.sidePanel}>
      <div className={styles.sidePanelHeader}><span className={styles.sidePanelTitle}>Releases</span></div>
      <div className={styles.sidePanelBody}>
        {releases.length === 0
          ? <div className={styles.empty}>Ingen releases</div>
          : releases.map((r) => (
            <a key={r.id} href={r.html_url} target="_blank" rel="noreferrer" className={styles.row}>
              <div className={styles.rowTitleLine}>
                <span className={styles.releaseTag}>{r.tag_name}</span>
                {r.prerelease && <span className={styles.preBadge}>Pre</span>}
              </div>
              {r.name && r.name !== r.tag_name && (
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{r.name}</span>
              )}
              <span className={styles.rowMeta as string}>{shortDate(r.published_at)}</span>
            </a>
          ))}
      </div>
    </div>
  );
}

function dotClass(run: GitHubWorkflowRun) {
  if (run.status !== 'completed') return styles.dotRunning;
  if (run.conclusion === 'success') return styles.dotSuccess;
  if (run.conclusion === 'failure') return styles.dotFailure;
  return styles.dotNeutral;
}

function runLabel(run: GitHubWorkflowRun) {
  if (run.status === 'queued') return 'Venter';
  if (run.status === 'in_progress') return 'Kjører';
  if (run.conclusion === 'success') return 'OK';
  if (run.conclusion === 'failure') return 'Feilet';
  if (run.conclusion === 'cancelled') return 'Avbrutt';
  return run.conclusion ?? '—';
}

function ActionsPanel({ runs }: { runs: GitHubWorkflowRun[] }) {
  return (
    <div className={styles.sidePanel}>
      <div className={styles.sidePanelHeader}><span className={styles.sidePanelTitle}>Actions</span></div>
      <div className={styles.sidePanelBody}>
        {runs.length === 0
          ? <div className={styles.empty}>Ingen kjøringer</div>
          : runs.map((run) => (
            <a key={run.id} href={run.html_url} target="_blank" rel="noreferrer" className={styles.workflowRow}>
              <span className={`${styles.dot} ${dotClass(run)}`} />
              <div className={styles.workflowInfo}>
                <div className={styles.workflowName}>{run.name}</div>
                <div className={styles.workflowMeta}>{runLabel(run)} · {run.head_branch} · {relativeTime(run.updated_at)}</div>
              </div>
            </a>
          ))}
      </div>
    </div>
  );
}

// ── Issue Detail Modal ────────────────────────────────────────────────────────

function IssueDetailModal({
  item,
  availableLabels,
  onClose,
  onIssueUpdated,
}: {
  item: ProjectItem;
  availableLabels: GitHubLabel[];
  onClose: () => void;
  onIssueUpdated: (number: number, partial: Partial<typeof item.issue>) => void;
}) {
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [comments, setComments] = useState<GitHubComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [addAssigneeInput, setAddAssigneeInput] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [savingAssignees, setSavingAssignees] = useState(false);
  const [issueLabels, setIssueLabels] = useState<string[]>([]);
  const [savingLabels, setSavingLabels] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const { issue } = item;

  useEffect(() => {
    let cancelled = false;
    setLoadingDetail(true);
    setLoadError('');
    getIssueDetail(issue.number)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setComments(d.comments);
        setAssignees(d.issue.assignees.map((a) => a.login));
        setIssueLabels(d.issue.labels.map((l) => l.name));
        setEditTitle(d.issue.title);
        setEditBody(d.issue.body ?? '');
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Klarte ikke laste issue');
      })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
  }, [issue.number]);

  async function handleToggleLabel(name: string) {
    const next = issueLabels.includes(name) ? issueLabels.filter((l) => l !== name) : [...issueLabels, name];
    const prev = issueLabels;
    setIssueLabels(next);
    setSavingLabels(true);
    try {
      const updated = await patchIssue(issue.number, { labels: next });
      onIssueUpdated(issue.number, { labels: updated.labels });
      setDetail((d) => d ? { ...d, issue: { ...d.issue, labels: updated.labels } } : d);
    } catch { setIssueLabels(prev); }
    finally { setSavingLabels(false); }
  }

  async function handleSaveEdit() {
    const title = editTitle.trim();
    if (!title) return;
    setSavingEdit(true);
    setEditError('');
    try {
      const updated = await patchIssue(issue.number, { title, body: editBody });
      onIssueUpdated(issue.number, { title: updated.title, body: updated.body });
      setDetail((d) => d ? { ...d, issue: { ...d.issue, title: updated.title, body: updated.body } } : d);
      setEditing(false);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Klarte ikke lagre endringer');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    const body = commentText.trim();
    if (!body) return;
    setSubmittingComment(true);
    setCommentError('');
    try {
      const c = await addComment(issue.number, body);
      setComments((prev) => [...prev, c]);
      setCommentText('');
    } catch (err: unknown) {
      setCommentError(err instanceof Error ? err.message : 'Klarte ikke poste kommentar');
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleRemoveAssignee(login: string) {
    const next = assignees.filter((a) => a !== login);
    setAssignees(next);
    setSavingAssignees(true);
    try {
      const updated = await patchIssue(issue.number, { assignees: next });
      onIssueUpdated(issue.number, { assignees: updated.assignees });
    } catch { setAssignees(assignees); }
    finally { setSavingAssignees(false); }
  }

  async function handleAddAssignee() {
    const login = addAssigneeInput.trim();
    if (!login || assignees.includes(login)) { setAddAssigneeInput(''); return; }
    const next = [...assignees, login];
    setAssignees(next);
    setAddAssigneeInput('');
    setSavingAssignees(true);
    try {
      const updated = await patchIssue(issue.number, { assignees: next });
      onIssueUpdated(issue.number, { assignees: updated.assignees });
    } catch { setAssignees(assignees); }
    finally { setSavingAssignees(false); }
  }

  const assignableUsers = detail?.assignableUsers ?? [];
  const displayIssue = detail?.issue ?? issue;
  const isClosed = displayIssue.state === 'closed';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.issueModal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.issueModalHeader}>
          <span className={styles.issueModalStateIcon} style={{ color: isClosed ? 'var(--success)' : 'var(--accent)' }}>
            {isClosed ? <IssueClosedIcon size={16} /> : <IssueOpenIcon size={16} />}
          </span>
          <div className={styles.issueModalTitleWrap}>
            <div className={styles.issueModalNum}>#{issue.number}</div>
            <div className={styles.issueModalTitle}>{displayIssue.title}</div>
          </div>
          <div className={styles.issueModalHeaderBtns}>
            {!editing && !loadingDetail && (
              <button className={styles.iconLinkBtn} onClick={() => setEditing(true)} title="Rediger">
                <EditIcon />
              </button>
            )}
            <a href={issue.html_url} target="_blank" rel="noreferrer" className={styles.iconLinkBtn} title="Åpne på GitHub">
              <ExternalLinkIcon />
            </a>
            <button className={styles.closeBtn} onClick={onClose}>×</button>
          </div>
        </div>

        {/* Body */}
        <div className={styles.issueModalBody}>
          {loadingDetail && (
            <div className={styles.centerState} style={{ padding: 40 }}>
              <div className={styles.spinner} />
            </div>
          )}

          {loadError && (
            <div className={styles.centerState} style={{ padding: 40 }}>
              <span className={styles.errorText}>{loadError}</span>
            </div>
          )}

          {!loadingDetail && !loadError && (
            <>
              {/* Description — editable */}
              {editing ? (
                <div className={styles.issueModalSection}>
                  <div>
                    <label className={styles.fieldLabel}>Tittel</label>
                    <input className={styles.editTitleInput} value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)} placeholder="Tittel..." />
                  </div>
                  <div>
                    <label className={styles.fieldLabel}>Beskrivelse</label>
                    <BodyEditor value={editBody} onChange={setEditBody} placeholder="Beskrivelse..." />
                  </div>
                  {editError && <span className={styles.commentError}>{editError}</span>}
                  <div className={styles.editActions}>
                    <button className={styles.editCancelBtn} onClick={() => {
                      setEditing(false);
                      setEditTitle(displayIssue.title);
                      setEditBody(displayIssue.body ?? '');
                      setEditError('');
                    }}>Avbryt</button>
                    <button className={styles.editSaveBtn} onClick={() => void handleSaveEdit()} disabled={!editTitle.trim() || savingEdit}>
                      {savingEdit ? 'Lagrer...' : 'Lagre'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.issueModalSection}>
                  {displayIssue.body?.trim()
                    ? <p className={styles.issueBodyText}>{displayIssue.body}</p>
                    : <p className={styles.issueBodyText} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Ingen beskrivelse.</p>
                  }
                </div>
              )}

              {/* Meta */}
              <div className={styles.issueModalSection}>
                <div className={styles.issueMeta2}>
                  {displayIssue.user?.login && (
                    <span className={styles.issueMetaItem}>
                      {displayIssue.user.avatar_url && (
                        <img src={displayIssue.user.avatar_url} alt="" className={styles.issueMetaAvatar} />
                      )}
                      {displayIssue.user.login}
                    </span>
                  )}
                  <span className={styles.issueMetaItem}>Opprettet {shortDate(displayIssue.created_at)}</span>
                  {displayIssue.updated_at !== displayIssue.created_at && (
                    <span className={styles.issueMetaItem}>Oppdatert {relativeTime(displayIssue.updated_at)} siden</span>
                  )}
                </div>
              </div>

              {/* Labels — editable */}
              <div className={styles.issueModalSection}>
                <span className={styles.fieldLabel} style={{ marginBottom: 0 }}>
                  Labels{savingLabels ? ' (lagrer...)' : ''}
                </span>
                <LabelPicker available={availableLabels} selected={issueLabels} onToggle={(name) => void handleToggleLabel(name)} />
              </div>

              {/* Assignees */}
              <div className={styles.issueModalSection}>
                <span className={styles.fieldLabel} style={{ marginBottom: 0 }}>Assignees</span>
                <div className={styles.assigneeList}>
                  {assignees.map((login) => {
                    const user = [...(displayIssue.assignees ?? []), ...(assignableUsers ?? [])]
                      .find((u) => u.login === login);
                    return (
                      <span key={login} className={styles.assigneeChip}>
                        {user?.avatar_url && <img src={user.avatar_url} alt="" className={styles.assigneeChipAvatar} />}
                        {login}
                        <button className={styles.assigneeRemoveBtn} onClick={() => void handleRemoveAssignee(login)} disabled={savingAssignees}>×</button>
                      </span>
                    );
                  })}
                  {assignees.length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ingen assignees</span>
                  )}
                </div>
                <div className={styles.addAssigneeRow}>
                  <input
                    className={styles.addAssigneeInput}
                    value={addAssigneeInput}
                    onChange={(e) => setAddAssigneeInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void handleAddAssignee()}
                    placeholder="GitHub brukernavn..."
                    list="assignable-users"
                  />
                  {assignableUsers.length > 0 && (
                    <datalist id="assignable-users">
                      {assignableUsers.map((u) => <option key={u.login} value={u.login} />)}
                    </datalist>
                  )}
                  <button className={styles.iconBtn} onClick={() => void handleAddAssignee()} disabled={!addAssigneeInput.trim() || savingAssignees}>
                    + Legg til
                  </button>
                </div>
              </div>

              {/* Comments */}
              <div className={styles.issueModalSection}>
                <span className={styles.fieldLabel} style={{ marginBottom: 0 }}>
                  {comments.length === 0 ? 'Ingen kommentarer' : `${comments.length} kommentar${comments.length !== 1 ? 'er' : ''}`}
                </span>
                {comments.length > 0 && (
                  <div className={styles.commentList}>
                    {comments.map((c) => (
                      <div key={c.id} className={styles.comment}>
                        <img src={c.user.avatar_url} alt={c.user.login} className={styles.commentAvatar} />
                        <div className={styles.commentBubble}>
                          <div className={styles.commentBubbleHeader}>
                            <span className={styles.commentAuthor}>{c.user.login}</span>
                            <span className={styles.commentTime}>{relativeTime(c.created_at)}</span>
                          </div>
                          <div className={styles.commentBubbleBody}>{c.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer — add comment */}
        <div className={styles.issueModalFooter}>
          <form onSubmit={handleSubmitComment} style={{ display: 'contents' }}>
            <textarea
              ref={commentRef}
              className={styles.commentTextarea}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Legg til en kommentar..."
            />
            <div className={styles.commentFooterRow}>
              {commentError && <span className={styles.commentError}>{commentError}</span>}
              <button type="button" className={styles.cancelBtn} onClick={onClose}>Lukk</button>
              <button type="submit" className={styles.submitBtn} disabled={!commentText.trim() || submittingComment}>
                {submittingComment ? 'Sender...' : 'Kommenter'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}

// ── Issue Card ────────────────────────────────────────────────────────────────

function IssueCard({ item, onDragStart, dragging, onClick }: {
  item: ProjectItem;
  onDragStart: (id: string) => void;
  dragging: boolean;
  onClick: (item: ProjectItem) => void;
}) {
  const { issue } = item;
  return (
    <div
      className={`${styles.card} ${dragging ? styles.cardDragging : ''}`}
      draggable
      onDragStart={(e) => { e.stopPropagation(); onDragStart(item.id); }}
      onClick={() => onClick(item)}
    >
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon} style={{ color: issue.state === 'closed' ? 'var(--success)' : 'var(--accent)' }}>
          {issue.state === 'closed' ? <IssueClosedIcon /> : <IssueOpenIcon />}
        </span>
        <span className={styles.cardNum}>#{issue.number}</span>
        {issue.assignees.length > 0 && (
          <div className={styles.cardAssignees}>
            {issue.assignees.slice(0, 3).map((a) => (
              <img key={a.login} src={a.avatar_url} alt={a.login} className={styles.avatar} title={a.login} />
            ))}
          </div>
        )}
      </div>
      <div className={styles.cardBody}>
        <span className={styles.cardTitle}>{issue.title}</span>
        {issue.labels.length > 0 && (
          <div className={styles.cardLabels}>
            {issue.labels.map((l) => (
              <span key={l.id} className={styles.labelChip} style={{
                background: `#${l.color}22`, color: `#${l.color}`, borderColor: `#${l.color}55`,
              }}>{l.name}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────

function KanbanCol({ option, items, draggingId, onDragStart, onDrop, onCardClick }: {
  option: ProjectStatusOption;
  items: ProjectItem[];
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDrop: (optionId: string) => void;
  onCardClick: (item: ProjectItem) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`${styles.col} ${over ? styles.colDragOver : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(option.id); }}
    >
      <div className={styles.colHeader}>
        <span className={styles.colLabel}>{option.name}</span>
        <span className={styles.colCount}>{items.length}</span>
      </div>
      <div className={styles.colBody}>
        {items.length === 0
          ? <div className={styles.colEmpty}>Tom</div>
          : items.map((item) => (
            <IssueCard
              key={item.id}
              item={item}
              dragging={draggingId === item.id}
              onDragStart={onDragStart}
              onClick={onCardClick}
            />
          ))
        }
      </div>
    </div>
  );
}

// ── Status dropdown (table view) ───────────────────────────────────────────────

function StatusDropdown({ item, options, onChange }: {
  item: ProjectItem;
  options: ProjectStatusOption[];
  onChange: (itemId: string, optionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const current = options.find((o) => o.id === item.statusOptionId);

  return (
    <div className={styles.statusDropdown} ref={ref}>
      <button
        className={styles.statusDropdownTrigger}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <span className={styles.statusDot} />
        {current?.name ?? 'Ingen status'}
        <ChevronIcon />
      </button>
      {open && (
        <div className={styles.statusMenu}>
          {options.map((o) => (
            <button
              key={o.id}
              className={`${styles.statusMenuItem} ${o.id === item.statusOptionId ? styles.statusMenuItemActive : ''}`}
              onClick={(e) => { e.stopPropagation(); setOpen(false); onChange(item.id, o.id); }}
            >
              <span className={styles.statusDot} />
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Issue Table (GitHub Projects-style table view) ──────────────────────────────

function IssueTable({ items, options, onCardClick, onChangeStatus }: {
  items: ProjectItem[];
  options: ProjectStatusOption[];
  onCardClick: (item: ProjectItem) => void;
  onChangeStatus: (itemId: string, optionId: string) => void;
}) {
  // Group by status option, in the project's option order; unset last
  const groups = options.map((o) => ({
    option: o,
    items: items.filter((i) => i.statusOptionId === o.id),
  }));
  const noStatus = items.filter((i) => !i.statusOptionId);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.thTitle}>Title</th>
            <th className={styles.thStatus}>Status</th>
            <th className={styles.thAssignees}>Assignees</th>
            <th className={styles.thLabels}>Labels</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ option, items: groupItems }) => (
            <Fragment key={option.id}>
              <tr className={styles.groupRow}>
                <td colSpan={4}>
                  <span className={styles.statusDot} /> {option.name}
                  <span className={styles.groupCount}>{groupItems.length}</span>
                </td>
              </tr>
              {groupItems.map((item) => (
                <IssueTableRow key={item.id} item={item} options={options} onCardClick={onCardClick} onChangeStatus={onChangeStatus} />
              ))}
            </Fragment>
          ))}
          {noStatus.length > 0 && (
            <Fragment>
              <tr className={styles.groupRow}>
                <td colSpan={4}>Ingen status <span className={styles.groupCount}>{noStatus.length}</span></td>
              </tr>
              {noStatus.map((item) => (
                <IssueTableRow key={item.id} item={item} options={options} onCardClick={onCardClick} onChangeStatus={onChangeStatus} />
              ))}
            </Fragment>
          )}
        </tbody>
      </table>
    </div>
  );
}

function IssueTableRow({ item, options, onCardClick, onChangeStatus }: {
  item: ProjectItem;
  options: ProjectStatusOption[];
  onCardClick: (item: ProjectItem) => void;
  onChangeStatus: (itemId: string, optionId: string) => void;
}) {
  const { issue } = item;
  return (
    <tr className={styles.tableRow} onClick={() => onCardClick(item)}>
      <td className={styles.tdTitle}>
        <span className={styles.tableIcon} style={{ color: issue.state === 'closed' ? 'var(--success)' : 'var(--accent)' }}>
          {issue.state === 'closed' ? <IssueClosedIcon /> : <IssueOpenIcon />}
        </span>
        <span className={styles.tableTitleText}>{issue.title}</span>
        <span className={styles.tableNum}>#{issue.number}</span>
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <StatusDropdown item={item} options={options} onChange={onChangeStatus} />
      </td>
      <td>
        {issue.assignees.length > 0 ? (
          <div className={styles.tableAssignees}>
            {issue.assignees.slice(0, 4).map((a) => (
              <img key={a.login} src={a.avatar_url} alt={a.login} title={a.login} className={styles.avatar} />
            ))}
          </div>
        ) : <span className={styles.tableEmpty}>—</span>}
      </td>
      <td>
        {issue.labels.length > 0 ? (
          <div className={styles.cardLabels}>
            {issue.labels.map((l) => (
              <span key={l.id} className={styles.labelChip} style={{
                background: `#${l.color}22`, color: `#${l.color}`, borderColor: `#${l.color}55`,
              }}>{l.name}</span>
            ))}
          </div>
        ) : <span className={styles.tableEmpty}>—</span>}
      </td>
    </tr>
  );
}

// ── Create Issue Modal ────────────────────────────────────────────────────────

const BUG_BODY_TEMPLATE = `## Hva skjedde?
Beskriv hva som gikk galt.

## Hva forventet du skulle skje?


## Steg for å reprodusere
1.
2.
3.

## Skjermbilde
Lim inn eller dra inn et skjermbilde her (anbefales sterkt!).

## Annet
Nettleser, enhet, eller annen relevant info.`;

function CreateIssueModal({ availableLabels, isBug, onClose, onCreated }: {
  availableLabels: GitHubLabel[];
  isBug: boolean;
  onClose: () => void;
  onCreated: (issue: GitHubIssue) => void;
}) {
  // Match the repo's "bug" label case-insensitively if it exists
  const bugLabel = availableLabels.find((l) => l.name.toLowerCase() === 'bug')?.name ?? 'bug';
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(isBug ? BUG_BODY_TEMPLATE : '');
  const [labels, setLabels] = useState<string[]>(isBug ? [bugLabel] : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);

  function toggleLabel(name: string) {
    setLabels((prev) => prev.includes(name) ? prev.filter((l) => l !== name) : [...prev, name]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true); setError('');
    try {
      const issue = await createIssue({
        title: title.trim(),
        body: body.trim() || undefined,
        labels: labels.length > 0 ? labels : undefined,
      });
      onCreated(issue);
    } catch { setError('Klarte ikke opprette issue. Prøv igjen.'); setSaving(false); }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle} style={isBug ? { color: 'var(--warning)' } : undefined}>
            {isBug ? '🐛 Rapporter bug' : 'Ny Issue'}
          </span>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className={styles.modalForm}>
            <div>
              <label className={styles.fieldLabel}>Tittel</label>
              <input ref={titleRef} className={styles.fieldInput} value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isBug ? 'Hva er galt?' : 'Kort beskrivelse...'} required />
            </div>
            <div>
              <label className={styles.fieldLabel}>Beskrivelse</label>
              <BodyEditor value={body} onChange={setBody}
                placeholder={isBug
                  ? 'Beskriv buggen — hva skjedde, hva forventet du, og legg gjerne ved et skjermbilde.'
                  : 'Mer detaljer... (valgfritt)'} />
            </div>
            <div>
              <label className={styles.fieldLabel}>Labels</label>
              <LabelPicker available={availableLabels} selected={labels} onToggle={toggleLabel} />
            </div>
            {error && <div className={styles.modalError}>{error}</div>}
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Avbryt</button>
            <button type="submit" className={styles.submitBtn} disabled={!title.trim() || saving}>
              {saving ? 'Oppretter...' : isBug ? 'Rapporter bug' : 'Opprett issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function DevPage() {
  const {
    issues, pullRequests, releases, workflowRuns, labels,
    loading, error,
    setData, setLoading, setError,
    updateIssue, prependIssue,
  } = useDevStore();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<'issue' | 'bug' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'board' | 'table'>(
    () => (localStorage.getItem('gnomguttan-dev-view') === 'table' ? 'table' : 'board')
  );
  const [moveError, setMoveError] = useState<string | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const draggingRef = useRef<string | null>(null);

  useEffect(() => { localStorage.setItem('gnomguttan-dev-view', viewMode); }, [viewMode]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    setError(null);
    try { setData(await loadDevData()); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Klarte ikke laste data fra GitHub.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [setLoading, setError, setData]);

  useEffect(() => { void load(); }, [load]);

  function handleDragStart(id: string) {
    draggingRef.current = id; setDraggingId(id); setMoveError(null);
  }

  const changeStatus = useCallback(async (itemId: string, targetColumnId: string) => {
    const number = Number(itemId);
    const issue = issues.find((i) => i.number === number);
    if (!issue || getIssueColumn(issue) === targetColumnId) return;
    const patch = patchForColumn(issue, targetColumnId as IssueColumnId);
    // Optimistic: apply label + state locally
    const optimisticLabels = patch.labels.map((name) =>
      issue.labels.find((l) => l.name === name) ?? { id: 0, name, color: '8957e5', description: '' }
    );
    const prev = { labels: issue.labels, state: issue.state };
    updateIssue(number, { labels: optimisticLabels, state: patch.state ?? issue.state });
    try {
      const updated = await patchIssue(number, { labels: patch.labels, state: patch.state });
      updateIssue(number, { labels: updated.labels, state: updated.state });
    } catch (err: unknown) {
      updateIssue(number, prev);
      setMoveError(err instanceof Error ? err.message : 'Klarte ikke endre status');
    }
  }, [issues, updateIssue]);

  async function handleDrop(targetColumnId: string) {
    const itemId = draggingRef.current;
    setDraggingId(null); draggingRef.current = null;
    if (itemId) await changeStatus(itemId, targetColumnId);
  }

  function handleIssueUpdated(number: number, partial: Partial<GitHubIssue>) {
    updateIssue(number, partial);
  }

  const items = issues.map(issueToItem);
  const selectedItem = selectedNumber != null
    ? items.find((i) => i.issue.number === selectedNumber) ?? null
    : null;

  return (
    <AppLayout>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <span className={styles.title}>Dev</span>
          <div className={styles.headerActions}>
            <button className={styles.iconBtn} onClick={() => void load(true)} disabled={loading || refreshing}>
              <RefreshIcon spinning={refreshing} /> Oppdater
            </button>
            <button className={styles.bugBtn} onClick={() => setCreateMode('bug')}>
              <BugIcon /> Bug
            </button>
            <button className={styles.createBtn} onClick={() => setCreateMode('issue')}>+ Ny Issue</button>
          </div>
        </div>

        {loading && <div className={styles.centerState} style={{ flex: 1 }}><div className={styles.spinner} />Laster fra GitHub…</div>}
        {!loading && error && <div className={styles.centerState}><span className={styles.errorText}>{error}</span><button className={styles.iconBtn} onClick={() => void load()}>Prøv igjen</button></div>}

        {!loading && !error && (
          <div className={styles.body}>
            <div className={styles.sidebar}>
              <PullRequestsPanel prs={pullRequests} />
              <ReleasesPanel releases={releases} />
              <ActionsPanel runs={workflowRuns} />
            </div>

            <div className={styles.kanbanArea}>
              <div className={styles.kanbanHeader}>
                <span className={styles.kanbanTitle}>Issues</span>
                <div className={styles.viewToggle}>
                  <button
                    className={`${styles.viewToggleBtn} ${viewMode === 'board' ? styles.viewToggleBtnActive : ''}`}
                    onClick={() => setViewMode('board')}
                  >
                    <BoardIcon /> Board
                  </button>
                  <button
                    className={`${styles.viewToggleBtn} ${viewMode === 'table' ? styles.viewToggleBtnActive : ''}`}
                    onClick={() => setViewMode('table')}
                  >
                    <TableIcon /> Table
                  </button>
                </div>
              </div>
              {moveError && (
                <div className={styles.moveFailed}>
                  <span>{moveError}</span>
                  <button onClick={() => setMoveError(null)}>×</button>
                </div>
              )}
              {viewMode === 'table' && (
                <IssueTable
                  items={items}
                  options={COLUMNS}
                  onCardClick={(item) => setSelectedNumber(item.issue.number)}
                  onChangeStatus={changeStatus}
                />
              )}
              {viewMode === 'board' && (
                <div className={styles.kanban}>
                  {COLUMNS.map((option) => (
                    <KanbanCol
                      key={option.id}
                      option={option}
                      items={items.filter((i) => i.statusOptionId === option.id)}
                      draggingId={draggingId}
                      onDragStart={handleDragStart}
                      onDrop={handleDrop}
                      onCardClick={(item) => setSelectedNumber(item.issue.number)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {createMode && (
        <CreateIssueModal
          availableLabels={labels}
          isBug={createMode === 'bug'}
          onClose={() => setCreateMode(null)}
          onCreated={(issue) => { prependIssue(issue); setCreateMode(null); }}
        />
      )}

      {selectedItem && (
        <IssueDetailModal
          item={selectedItem}
          availableLabels={labels}
          onClose={() => setSelectedNumber(null)}
          onIssueUpdated={handleIssueUpdated}
        />
      )}
    </AppLayout>
  );
}
