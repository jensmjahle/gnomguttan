const GITHUB_API = 'https://api.github.com';
const IN_PROGRESS_LABEL = 'status: in-progress';

export function createGitHubClient({ token, repo }) {
  if (!token || !repo) return null;

  const baseHeaders = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  async function ghFetch(method, path, body) {
    const res = await fetch(`${GITHUB_API}/repos/${repo}${path}`, {
      method,
      headers: {
        ...baseHeaders,
        ...(body != null ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub ${method} ${path} → ${res.status}: ${text}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function ensureLabel(name, color, description) {
    try {
      await ghFetch('GET', `/labels/${encodeURIComponent(name)}`);
    } catch {
      try {
        await ghFetch('POST', '/labels', { name, color, description });
        console.log(`[GitHub] Created label "${name}"`);
      } catch (err) {
        console.warn(`[GitHub] Could not create label "${name}": ${err.message}`);
      }
    }
  }

  return {
    async ensureLabels() {
      await ensureLabel(IN_PROGRESS_LABEL, '0075ca', 'Currently being worked on');
    },

    async getIssues() {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [open, closed] = await Promise.all([
        ghFetch('GET', '/issues?state=open&per_page=100&sort=created&direction=desc'),
        ghFetch('GET', `/issues?state=closed&per_page=50&sort=updated&direction=desc&since=${since}`),
      ]);
      return [
        ...open.filter((i) => !i.pull_request),
        ...closed.filter((i) => !i.pull_request),
      ];
    },

    async createIssue({ title, body, labels, assignees }) {
      return ghFetch('POST', '/issues', { title, body, labels, assignees });
    },

    async updateIssue(number, { labels, assignees, state, title, body }) {
      const patch = {};
      if (labels !== undefined) patch.labels = labels;
      if (assignees !== undefined) patch.assignees = assignees;
      if (state !== undefined) patch.state = state;
      if (title !== undefined) patch.title = title;
      if (body !== undefined) patch.body = body;
      return ghFetch('PATCH', `/issues/${number}`, patch);
    },

    async getPullRequests() {
      return ghFetch('GET', '/pulls?state=open&per_page=20&sort=updated&direction=desc');
    },

    async getReleases() {
      return ghFetch('GET', '/releases?per_page=10');
    },

    async getWorkflowRuns() {
      const data = await ghFetch('GET', '/actions/runs?per_page=30');
      const byWorkflow = new Map();
      for (const run of (data?.workflow_runs ?? [])) {
        if (!byWorkflow.has(run.workflow_id)) {
          byWorkflow.set(run.workflow_id, run);
        }
      }
      return Array.from(byWorkflow.values());
    },

    async getCollaborators() {
      try {
        return await ghFetch('GET', '/collaborators?per_page=100');
      } catch {
        return [];
      }
    },
  };
}
