const GITHUB_API = 'https://api.github.com';
const GRAPHQL_URL = 'https://api.github.com/graphql';

export function createGitHubClient({ token, repo }) {
  if (!token || !repo) return null;

  const owner = repo.split('/')[0];

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

  async function gql(query, variables = {}) {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub GraphQL HTTP ${res.status}: ${text}`);
    }
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);
    return json.data;
  }

  function normalizeIssue(issue) {
    if (!issue) return null;
    return {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      state: (issue.state ?? '').toLowerCase(),
      html_url: issue.url ?? issue.html_url,
      labels: (issue.labels?.nodes ?? issue.labels ?? []).map((l) => ({
        id: l.id ?? 0,
        name: l.name,
        color: l.color,
        description: l.description ?? '',
      })),
      assignees: (issue.assignees?.nodes ?? issue.assignees ?? []).map((a) => ({
        login: a.login,
        avatar_url: a.avatarUrl ?? a.avatar_url,
        html_url: a.url ?? a.html_url,
      })),
      user: {
        login: issue.author?.login ?? issue.user?.login ?? '',
        avatar_url: issue.author?.avatarUrl ?? issue.user?.avatar_url ?? '',
        html_url: issue.author?.url ?? issue.user?.html_url ?? '',
      },
      created_at: issue.createdAt ?? issue.created_at ?? '',
      updated_at: issue.updatedAt ?? issue.updated_at ?? '',
      comments: issue.comments?.totalCount ?? issue.comments ?? 0,
      node_id: issue.id ?? issue.node_id,
    };
  }

  return {
    async getProjectData(projectNumber) {
      const data = await gql(`
        query($owner: String!, $number: Int!) {
          user(login: $owner) {
            projectV2(number: $number) {
              id
              title
              fields(first: 20) {
                nodes {
                  ... on ProjectV2SingleSelectField {
                    id
                    name
                    options { id name }
                  }
                }
              }
              items(first: 100) {
                nodes {
                  id
                  fieldValues(first: 10) {
                    nodes {
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        optionId
                        name
                        field { ... on ProjectV2SingleSelectField { name } }
                      }
                    }
                  }
                  content {
                    ... on Issue {
                      id number title body state url
                      author { login avatarUrl url }
                      labels(first: 10) { nodes { id name color description } }
                      assignees(first: 5) { nodes { login avatarUrl url } }
                      createdAt updatedAt
                      comments { totalCount }
                    }
                  }
                }
              }
            }
          }
        }
      `, { owner, number: projectNumber });

      const project = data?.user?.projectV2;
      if (!project) throw new Error(`GitHub Project #${projectNumber} not found under user "${owner}"`);

      const statusField = project.fields.nodes.find(
        (f) => f.id && f.name?.toLowerCase() === 'status'
      ) ?? null;

      const items = (project.items.nodes ?? [])
        .filter((item) => item.content?.number)
        .map((item) => {
          const sv = item.fieldValues.nodes.find(
            (v) => v.field?.name?.toLowerCase() === 'status'
          );
          return {
            id: item.id,
            status: sv?.name ?? null,
            statusOptionId: sv?.optionId ?? null,
            issue: normalizeIssue(item.content),
          };
        });

      return {
        id: project.id,
        title: project.title,
        statusField: statusField
          ? { id: statusField.id, options: statusField.options }
          : null,
        items,
      };
    },

    async moveProjectItem(projectId, itemId, fieldId, optionId) {
      await gql(`
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { singleSelectOptionId: $optionId }
          }) {
            projectV2Item { id }
          }
        }
      `, { projectId, itemId, fieldId, optionId });
    },

    async addIssueToProject(projectId, issueNodeId) {
      const result = await gql(`
        mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
            item { id }
          }
        }
      `, { projectId, contentId: issueNodeId });
      return result?.addProjectV2ItemById?.item?.id ?? null;
    },

    async getIssueDetail(number) {
      const [issue, comments, assignableUsers] = await Promise.all([
        ghFetch('GET', `/issues/${number}`),
        ghFetch('GET', `/issues/${number}/comments?per_page=50`),
        ghFetch('GET', `/assignees?per_page=100`).catch(() => []),
      ]);
      return {
        issue: normalizeIssue(issue),
        comments: (comments ?? []).map((c) => ({
          id: c.id,
          body: c.body ?? '',
          user: { login: c.user?.login ?? '', avatar_url: c.user?.avatar_url ?? '', html_url: c.user?.html_url ?? '' },
          created_at: c.created_at,
          updated_at: c.updated_at,
          html_url: c.html_url,
        })),
        assignableUsers: (assignableUsers ?? []).map((u) => ({
          login: u.login,
          avatar_url: u.avatar_url,
          html_url: u.html_url,
        })),
      };
    },

    async addComment(number, body) {
      return ghFetch('POST', `/issues/${number}/comments`, { body });
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
        if (!byWorkflow.has(run.workflow_id)) byWorkflow.set(run.workflow_id, run);
      }
      return Array.from(byWorkflow.values());
    },
  };
}
