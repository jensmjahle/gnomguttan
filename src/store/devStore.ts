import { create } from 'zustand';
import type { GitHubIssue, GitHubPR, GitHubRelease, GitHubWorkflowRun } from '@/types';

interface DevState {
  issues: GitHubIssue[];
  pullRequests: GitHubPR[];
  releases: GitHubRelease[];
  workflowRuns: GitHubWorkflowRun[];
  loading: boolean;
  error: string | null;
  setData: (data: { issues: GitHubIssue[]; pullRequests: GitHubPR[]; releases: GitHubRelease[]; workflowRuns: GitHubWorkflowRun[] }) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateIssue: (number: number, partial: Partial<GitHubIssue>) => void;
  prependIssue: (issue: GitHubIssue) => void;
}

export const useDevStore = create<DevState>((set) => ({
  issues: [],
  pullRequests: [],
  releases: [],
  workflowRuns: [],
  loading: false,
  error: null,
  setData: ({ issues, pullRequests, releases, workflowRuns }) =>
    set({ issues, pullRequests, releases, workflowRuns }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  updateIssue: (number, partial) =>
    set((state) => ({
      issues: state.issues.map((i) => (i.number === number ? { ...i, ...partial } : i)),
    })),
  prependIssue: (issue) =>
    set((state) => ({ issues: [issue, ...state.issues] })),
}));
