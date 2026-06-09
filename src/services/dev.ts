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
  projectId?: string;
}): Promise<GitHubIssue> {
  return appApi.post<GitHubIssue>('/dev/issues', data);
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
