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
}): Promise<GitHubIssue> {
  return appApi.post<GitHubIssue>('/dev/issues', data);
}

export async function getIssueDetail(number: number): Promise<IssueDetail> {
  return appApi.post<IssueDetail>('/dev/issue-detail', { number });
}

export async function addComment(number: number, body: string): Promise<GitHubComment> {
  return appApi.post<GitHubComment>('/dev/issue-comment', { number, body });
}

export async function patchIssue(
  number: number,
  data: { assignees?: string[]; labels?: string[]; state?: 'open' | 'closed'; title?: string; body?: string },
): Promise<GitHubIssue> {
  return appApi.post<GitHubIssue>('/dev/issue-patch', { number, ...data });
}

export async function uploadDevImage(imageDataUrl: string): Promise<{ url: string }> {
  return appApi.post<{ url: string }>('/dev/upload-image', { imageDataUrl });
}
