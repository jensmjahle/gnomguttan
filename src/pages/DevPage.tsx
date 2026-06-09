import { useState, useEffect, useRef, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useDevStore } from '@/store/devStore';
import { loadDevData, createIssue, moveProjectItem, getIssueDetail, addComment, patchIssue } from '@/services/dev';
import type { GitHubPR, GitHubRelease, GitHubWorkflowRun, ProjectItem, ProjectStatusOption, IssueDetail, GitHubComment } from '@/types';
import styles from './DevPage.module.css';

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
  onClose,
  onIssueUpdated,
}: {
  item: ProjectItem;
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
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Klarte ikke laste issue');
      })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
  }, [issue.number]);

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
            <div className={styles.issueModalTitle}>{issue.title}</div>
          </div>
          <div className={styles.issueModalHeaderBtns}>
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
              {/* Description */}
              <div className={styles.issueModalSection}>
                {displayIssue.body?.trim()
                  ? <p className={styles.issueBodyText}>{displayIssue.body}</p>
                  : <p className={styles.issueBodyText} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Ingen beskrivelse.</p>
                }
              </div>

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
                {displayIssue.labels.length > 0 && (
                  <div className={styles.cardLabels}>
                    {displayIssue.labels.map((l) => (
                      <span key={l.id} className={styles.labelChip} style={{
                        background: `#${l.color}22`, color: `#${l.color}`, borderColor: `#${l.color}55`,
                      }}>
                        {l.name}
                      </span>
                    ))}
                  </div>
                )}
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

// ── Create Issue Modal ────────────────────────────────────────────────────────

function CreateIssueModal({ projectId, onClose, onCreated }: {
  projectId: string | null;
  onClose: () => void;
  onCreated: (item: ProjectItem) => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true); setError('');
    try {
      const issue = await createIssue({ title: title.trim(), body: body.trim() || undefined, projectId: projectId ?? undefined });
      onCreated({ id: `temp-${issue.number}`, status: null, statusOptionId: null, issue });
    } catch { setError('Klarte ikke opprette issue. Prøv igjen.'); setSaving(false); }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Ny Issue</span>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className={styles.modalForm}>
            <div>
              <label className={styles.fieldLabel}>Tittel</label>
              <input ref={titleRef} className={styles.fieldInput} value={title}
                onChange={(e) => setTitle(e.target.value)} placeholder="Kort beskrivelse..." required />
            </div>
            <div>
              <label className={styles.fieldLabel}>Beskrivelse</label>
              <textarea className={styles.fieldTextarea} value={body}
                onChange={(e) => setBody(e.target.value)} placeholder="Mer detaljer... (valgfritt)" />
            </div>
            {error && <div className={styles.modalError}>{error}</div>}
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Avbryt</button>
            <button type="submit" className={styles.submitBtn} disabled={!title.trim() || saving}>
              {saving ? 'Oppretter...' : 'Opprett issue'}
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
    project, pullRequests, releases, workflowRuns,
    loading, error,
    setData, setLoading, setError,
    updateProjectItem, prependProjectItem,
  } = useDevStore();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ProjectItem | null>(null);
  const draggingRef = useRef<string | null>(null);

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

  async function handleDrop(targetOptionId: string) {
    const itemId = draggingRef.current;
    setDraggingId(null); draggingRef.current = null;
    if (!itemId || !project?.statusField) return;
    const item = project.items.find((i) => i.id === itemId);
    if (!item || item.statusOptionId === targetOptionId) return;
    const targetOption = project.statusField.options.find((o) => o.id === targetOptionId);
    if (!targetOption) return;
    updateProjectItem(itemId, { statusOptionId: targetOptionId, status: targetOption.name });
    try {
      await moveProjectItem(itemId, project.id, project.statusField.id, targetOptionId);
    } catch (err: unknown) {
      updateProjectItem(itemId, { statusOptionId: item.statusOptionId, status: item.status });
      setMoveError(err instanceof Error ? err.message : 'Klarte ikke flytte issue');
    }
  }

  function handleIssueUpdated(number: number, partial: Partial<ProjectItem['issue']>) {
    const item = project?.items.find((i) => i.issue.number === number);
    if (item) updateProjectItem(item.id, { issue: { ...item.issue, ...partial } });
    if (selectedItem?.issue.number === number) {
      setSelectedItem((prev) => prev ? { ...prev, issue: { ...prev.issue, ...partial } } : prev);
    }
  }

  const columns = project?.statusField?.options ?? [];

  return (
    <AppLayout>
      <div className={styles.page}>
        <div className={styles.header}>
          <span className={styles.title}>Dev</span>
          <div className={styles.headerActions}>
            <button className={styles.iconBtn} onClick={() => void load(true)} disabled={loading || refreshing}>
              <RefreshIcon spinning={refreshing} /> Oppdater
            </button>
            <button className={styles.createBtn} onClick={() => setShowCreate(true)}>+ Ny Issue</button>
          </div>
        </div>

        {loading && <div className={styles.centerState}><div className={styles.spinner} />Laster fra GitHub…</div>}
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
                <span className={styles.kanbanTitle}>{project?.title ?? 'Issues'}</span>
              </div>
              {moveError && (
                <div className={styles.moveFailed}>
                  <span>{moveError}</span>
                  <button onClick={() => setMoveError(null)}>×</button>
                </div>
              )}
              {!project && <div className={styles.centerState}>Sett <code>GITHUB_PROJECT_NUMBER</code> i .env for å aktivere Kanban-bordet.</div>}
              {project && !project.statusField && <div className={styles.centerState}>Prosjektet mangler et «Status»-felt.</div>}
              {project?.statusField && (
                <div className={styles.kanban}>
                  {columns.map((option) => (
                    <KanbanCol
                      key={option.id}
                      option={option}
                      items={project.items.filter((i) => i.statusOptionId === option.id)}
                      draggingId={draggingId}
                      onDragStart={handleDragStart}
                      onDrop={handleDrop}
                      onCardClick={setSelectedItem}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateIssueModal
          projectId={project?.id ?? null}
          onClose={() => setShowCreate(false)}
          onCreated={(item) => { prependProjectItem(item); setShowCreate(false); }}
        />
      )}

      {selectedItem && (
        <IssueDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onIssueUpdated={handleIssueUpdated}
        />
      )}
    </AppLayout>
  );
}
