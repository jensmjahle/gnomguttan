import { appApi } from '@/services/appApi';
import type { DevData, GitHubComment, GitHubIssue, IssueColumnId, IssueDetail } from '@/types';

export const loadDevData = () => appApi.get<DevData>('/dev');
export const createIssue = (data: { title: string; body?: string; labels?: string[]; assignees?: string[] }) => appApi.post<GitHubIssue>('/dev/issues', data);
export const getIssueDetail = (number: number) => appApi.post<IssueDetail>('/dev/issue-detail', { number });
export const addIssueComment = (number: number, body: string) => appApi.post<GitHubComment>('/dev/issue-comment', { number, body });
export const patchIssue = (number: number, data: { assignees?: string[]; labels?: string[]; state?: 'open' | 'closed'; title?: string; body?: string }) =>
  appApi.post<GitHubIssue>('/dev/issue-patch', { number, ...data });
export const uploadDevImage = (imageDataUrl: string) => appApi.post<{ url: string }>('/dev/upload-image', { imageDataUrl });

// The board's columns come from the issue state and an "in-progress" label (as on the website).
const IN_PROGRESS = 'in-progress';
export const COLUMNS: Array<{ id: IssueColumnId; name: string }> = [
  { id: 'todo', name: 'Åpen' },
  { id: 'in-progress', name: 'Pågår' },
  { id: 'done', name: 'Lukket' },
];
export function issueColumn(issue: GitHubIssue): IssueColumnId {
  if (issue.state === 'closed') return 'done';
  return issue.labels.some((label) => label.name.toLowerCase() === IN_PROGRESS) ? 'in-progress' : 'todo';
}
export function patchForColumn(issue: GitHubIssue, target: IssueColumnId) {
  const without = issue.labels.map((label) => label.name).filter((name) => name.toLowerCase() !== IN_PROGRESS);
  if (target === 'in-progress') return { state: 'open' as const, labels: [...without, IN_PROGRESS] };
  if (target === 'todo') return { state: 'open' as const, labels: without };
  return { state: 'closed' as const, labels: without };
}
