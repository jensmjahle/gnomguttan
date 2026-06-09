import { useState, useEffect, useRef, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useDevStore } from '@/store/devStore';
import { loadDevData, createIssue, updateIssue } from '@/services/dev';
import type { GitHubIssue, GitHubPR, GitHubRelease, GitHubWorkflowRun, KanbanColumn } from '@/types';
import styles from './DevPage.module.css';

const IN_PROGRESS_LABEL = 'status: in-progress';

// ── Icons ─────────────────────────────────────────────────────────────────────

function IssueOpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>
    </svg>
  );
}

function IssueClosedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"/>
      <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={spinning ? { animation: 'spin 0.7s linear infinite' } : undefined}
    >
      <path d="M21 12a9 9 0 0 1-15.5 6.36"/>
      <polyline points="21 8 21 12 17 12"/>
      <path d="M3 12a9 9 0 0 1 15.5-6.36"/>
      <polyline points="3 16 3 12 7 12"/>
    </svg>
  );
}

function PRIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/>
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>
    </svg>
  );
}

function WorkflowIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
      <path d="M14.064 0h.186C15.216 0 16 .784 16 1.75v.186a8.752 8.752 0 0 1-2.564 6.186l-.458.459c-.314.314-.641.616-.979.904v3.207c0 .608-.315 1.172-.833 1.49l-2.774 1.707a.75.75 0 0 1-1.11-.418l-.49-1.766a1.999 1.999 0 0 0-1.159-1.338l-1.46-.584a.75.75 0 0 1-.418-1.11l1.707-2.774c.318-.518.882-.833 1.49-.833h3.207a13.575 13.575 0 0 0 .904-.979l.459-.458A8.752 8.752 0 0 1 14.064 0Z"/>
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getIssueColumn(issue: GitHubIssue): KanbanColumn {
  if (issue.state === 'closed') return 'completed';
  const hasInProgress = issue.labels.some((l) => l.name === IN_PROGRESS_LABEL);
  return hasInProgress ? 'in-progress' : 'backlog';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m siden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}t siden`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d siden`;
  return formatDate(iso);
}

// ── Create Issue Modal ────────────────────────────────────────────────────────

function CreateIssueModal({ onClose, onCreated }: { onClose: () => void; onCreated: (issue: GitHubIssue) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const issue = await createIssue({ title: title.trim(), body: body.trim() || undefined });
      onCreated(issue);
    } catch {
      setError('Klarte ikke opprette issue. Prøv igjen.');
      setSaving(false);
    }
  }

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalTitle}>Ny Issue</div>
        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Tittel *</label>
            <input
              ref={titleRef}
              className={styles.formInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Kort beskrivelse av problemet eller funksjonen..."
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Beskrivelse</label>
            <textarea
              className={styles.formTextarea}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Mer detaljer... (valgfritt)"
            />
          </div>
          {error && <div style={{ fontSize: 13, color: 'var(--error)' }}>{error}</div>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>Avbryt</button>
            <button type="submit" className={styles.btnPrimary} disabled={!title.trim() || saving}>
              {saving ? 'Oppretter...' : 'Opprett Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Issue Card ────────────────────────────────────────────────────────────────

function IssueCard({
  issue,
  onDragStart,
  dragging,
}: {
  issue: GitHubIssue;
  onDragStart: (number: number) => void;
  dragging: boolean;
}) {
  const visibleLabels = issue.labels.filter((l) => l.name !== IN_PROGRESS_LABEL);

  return (
    <div
      className={`${styles.issueCard} ${dragging ? styles.issueCardDragging : ''}`}
      draggable
      onDragStart={() => onDragStart(issue.number)}
    >
      <div className={styles.issueTop}>
        <span className={styles.issueIcon} style={{ color: issue.state === 'closed' ? 'var(--success)' : 'var(--accent)' }}>
          {issue.state === 'closed' ? <IssueClosedIcon /> : <IssueOpenIcon />}
        </span>
        <span className={styles.issueTitle}>
          <a href={issue.html_url} target="_blank" rel="noreferrer">{issue.title}</a>
        </span>
      </div>
      <div className={styles.issueMeta}>
        <span className={styles.issueNum}>#{issue.number}</span>
        {visibleLabels.length > 0 && (
          <div className={styles.issueLabels}>
            {visibleLabels.map((l) => (
              <span
                key={l.id}
                className={styles.labelChip}
                style={{
                  background: `#${l.color}22`,
                  color: `#${l.color}`,
                  borderColor: `#${l.color}55`,
                }}
              >
                {l.name}
              </span>
            ))}
          </div>
        )}
        {issue.assignees.length > 0 && (
          <div className={styles.issueAssignees}>
            {issue.assignees.slice(0, 3).map((a) => (
              <img key={a.login} src={a.avatar_url} alt={a.login} className={styles.assigneeAvatar} title={a.login} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────

function KanbanCol({
  column,
  label,
  issues,
  draggingNumber,
  onDragStart,
  onDrop,
}: {
  column: KanbanColumn;
  label: string;
  issues: GitHubIssue[];
  draggingNumber: number | null;
  onDragStart: (number: number) => void;
  onDrop: (column: KanbanColumn) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`${styles.column} ${dragOver ? styles.columnDragOver : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop(column); }}
    >
      <div className={styles.columnHeader}>
        <span className={styles.columnLabel}>{label}</span>
        <span className={styles.columnCount}>{issues.length}</span>
      </div>
      <div className={styles.columnBody}>
        {issues.length === 0 ? (
          <div className={styles.emptyCol}>Ingen issues her</div>
        ) : (
          issues.map((issue) => (
            <IssueCard
              key={issue.number}
              issue={issue}
              dragging={draggingNumber === issue.number}
              onDragStart={onDragStart}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Pull Requests ─────────────────────────────────────────────────────────────

function PullRequestsPanel({ prs }: { prs: GitHubPR[] }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Pull Requests</span>
        <PRIcon />
      </div>
      <div className={styles.panelList}>
        {prs.length === 0 ? (
          <div className={styles.panelEmpty}>Ingen åpne pull requests</div>
        ) : (
          prs.map((pr) => (
            <a key={pr.number} href={pr.html_url} target="_blank" rel="noreferrer" className={styles.prRow}>
              <div className={styles.prTitleRow}>
                <span className={styles.prTitle}>{pr.title}</span>
                {pr.draft && <span className={styles.prDraft}>Draft</span>}
              </div>
              <div className={styles.prMeta}>
                <span>#{pr.number} av {pr.user.login}</span>
                <span className={styles.prBranch}>{pr.head.ref} → {pr.base.ref}</span>
                <span>{formatRelative(pr.updated_at)}</span>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

// ── Releases ──────────────────────────────────────────────────────────────────

function ReleasesPanel({ releases }: { releases: GitHubRelease[] }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Releases</span>
        <TagIcon />
      </div>
      <div className={styles.panelList}>
        {releases.length === 0 ? (
          <div className={styles.panelEmpty}>Ingen releases ennå</div>
        ) : (
          releases.map((r) => (
            <a key={r.id} href={r.html_url} target="_blank" rel="noreferrer" className={styles.releaseRow}>
              <div className={styles.releaseTitleRow}>
                <span className={styles.releaseTag}>{r.tag_name}</span>
                {r.prerelease && <span className={styles.releasePrerelease}>Pre-release</span>}
              </div>
              {r.name && r.name !== r.tag_name && <span className={styles.releaseName}>{r.name}</span>}
              <span className={styles.releaseDate}>{formatDate(r.published_at)}</span>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

// ── Workflow Runs ─────────────────────────────────────────────────────────────

function workflowStatusClass(run: GitHubWorkflowRun): string {
  if (run.status !== 'completed') return styles.statusRunning;
  switch (run.conclusion) {
    case 'success': return styles.statusSuccess;
    case 'failure': return styles.statusFailure;
    default: return styles.statusNeutral;
  }
}

function workflowStatusLabel(run: GitHubWorkflowRun): string {
  if (run.status === 'queued') return 'Venter';
  if (run.status === 'in_progress') return 'Kjører';
  switch (run.conclusion) {
    case 'success': return 'OK';
    case 'failure': return 'Feilet';
    case 'cancelled': return 'Avbrutt';
    case 'skipped': return 'Hoppet over';
    default: return run.conclusion ?? 'Ukjent';
  }
}

function WorkflowPanel({ runs }: { runs: GitHubWorkflowRun[] }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>GitHub Actions</span>
        <WorkflowIcon />
      </div>
      <div className={styles.panelList}>
        {runs.length === 0 ? (
          <div className={styles.panelEmpty}>Ingen workflow-kjøringer</div>
        ) : (
          runs.map((run) => (
            <a key={run.id} href={run.html_url} target="_blank" rel="noreferrer" className={styles.workflowRow}>
              <span className={`${styles.workflowStatus} ${workflowStatusClass(run)}`} />
              <div className={styles.workflowInfo}>
                <div className={styles.workflowName}>{run.name}</div>
                <div className={styles.workflowMeta}>
                  {workflowStatusLabel(run)} · {run.head_branch} · {formatRelative(run.updated_at)}
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function DevPage() {
  const { issues, pullRequests, releases, workflowRuns, loading, error, setData, setLoading, setError, updateIssue: storeUpdateIssue, prependIssue } = useDevStore();
  const [draggingNumber, setDraggingNumber] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const draggingRef = useRef<number | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const data = await loadDevData();
      setData(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Klarte ikke laste data fra GitHub.';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setLoading, setError, setData]);

  useEffect(() => { void load(); }, [load]);

  function handleDragStart(number: number) {
    draggingRef.current = number;
    setDraggingNumber(number);
  }

  async function handleDrop(targetColumn: KanbanColumn) {
    const number = draggingRef.current;
    setDraggingNumber(null);
    draggingRef.current = null;
    if (number == null) return;

    const issue = issues.find((i) => i.number === number);
    if (!issue) return;

    const currentColumn = getIssueColumn(issue);
    if (currentColumn === targetColumn) return;

    const existingLabels = issue.labels.map((l) => l.name);
    let newLabels = existingLabels.filter((l) => l !== IN_PROGRESS_LABEL);
    let newState: 'open' | 'closed' | undefined;

    if (targetColumn === 'in-progress') {
      newLabels = [...newLabels, IN_PROGRESS_LABEL];
      newState = 'open';
    } else if (targetColumn === 'backlog') {
      newState = 'open';
    } else {
      newState = 'closed';
    }

    storeUpdateIssue(number, {
      labels: newLabels.map((name) => ({ id: 0, name, color: '', description: '' })),
      state: newState,
    });

    try {
      const updated = await updateIssue(number, { labels: newLabels, state: newState });
      storeUpdateIssue(number, updated);
    } catch {
      storeUpdateIssue(number, issue);
    }
  }

  function handleCreated(issue: GitHubIssue) {
    prependIssue(issue);
    setShowCreateModal(false);
  }

  const backlog = issues.filter((i) => getIssueColumn(i) === 'backlog');
  const inProgress = issues.filter((i) => getIssueColumn(i) === 'in-progress');
  const completed = issues.filter((i) => getIssueColumn(i) === 'completed');

  return (
    <AppLayout>
      <div className={styles.page}>
        <div className={styles.inner}>

          <div className={styles.header}>
            <h1 className={styles.title}>Dev</h1>
            <div className={styles.headerActions}>
              <button
                className={styles.btnSecondary}
                onClick={() => void load(true)}
                disabled={loading || refreshing}
                title="Oppdater"
              >
                <RefreshIcon spinning={refreshing} />
                Oppdater
              </button>
              <button className={styles.btnPrimary} onClick={() => setShowCreateModal(true)}>
                <PlusIcon />
                Ny Issue
              </button>
            </div>
          </div>

          {loading && (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              Laster data fra GitHub...
            </div>
          )}

          {error && !loading && (
            <div className={styles.errorState}>
              <div>{error}</div>
              <button className={styles.btnSecondary} onClick={() => void load()}>Prøv igjen</button>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Issues</div>
                <div className={styles.kanban}>
                  <KanbanCol
                    column="backlog"
                    label="Backlog"
                    issues={backlog}
                    draggingNumber={draggingNumber}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                  />
                  <KanbanCol
                    column="in-progress"
                    label="In Progress"
                    issues={inProgress}
                    draggingNumber={draggingNumber}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                  />
                  <KanbanCol
                    column="completed"
                    label="Completed"
                    issues={completed}
                    draggingNumber={draggingNumber}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                  />
                </div>
              </div>

              <div className={styles.bottomGrid}>
                <PullRequestsPanel prs={pullRequests} />
                <ReleasesPanel releases={releases} />
                <WorkflowPanel runs={workflowRuns} />
              </div>
            </>
          )}

        </div>
      </div>

      {showCreateModal && (
        <CreateIssueModal onClose={() => setShowCreateModal(false)} onCreated={handleCreated} />
      )}
    </AppLayout>
  );
}
