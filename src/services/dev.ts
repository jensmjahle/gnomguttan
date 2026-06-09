import { appApi } from '@/services/appApi';
import type { DevData, GitHubIssue } from '@/types';

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

export async function updateIssue(
  number: number,
  data: {
    labels?: string[];
    assignees?: string[];
    state?: 'open' | 'closed';
    title?: string;
    body?: string;
  }
): Promise<GitHubIssue> {
  return appApi.put<GitHubIssue>(`/dev/issues/${number}`, data);
}
