import { appApi } from '@/services/appApi';
import type { DevData, GitHubIssue, GitHubComment, IssueDetail } from '@/types';

export async function loadDevData(): Promise<DevData> {
  return appApi.get<DevData>('/dev');
}

export async function createIssue(data: {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  projectId?: string;
}): Promise<GitHubIssue> {
  return appApi.post<GitHubIssue>('/dev/issues', data);
}

export async function getIssueDetail(number: number): Promise<IssueDetail> {
  return appApi.get<IssueDetail>(`/dev/issues/${number}`);
}

export async function addComment(number: number, body: string): Promise<GitHubComment> {
  return appApi.post<GitHubComment>(`/dev/issues/${number}/comments`, { body });
}

export async function patchIssue(
  number: number,
  data: { assignees?: string[]; labels?: string[]; state?: 'open' | 'closed' },
): Promise<GitHubIssue> {
  return appApi.put<GitHubIssue>(`/dev/issues/${number}`, data);
}

export async function moveProjectItem(
  itemId: string,
  projectId: string,
  fieldId: string,
  optionId: string,
): Promise<void> {
  await appApi.put(`/dev/project/items/${encodeURIComponent(itemId)}`, {
    projectId,
    fieldId,
    optionId,
  });
}
