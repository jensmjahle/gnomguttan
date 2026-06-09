import { create } from 'zustand';
import type { GitHubProject, GitHubPR, GitHubRelease, GitHubWorkflowRun, ProjectItem } from '@/types';

interface DevState {
  project: GitHubProject | null;
  pullRequests: GitHubPR[];
  releases: GitHubRelease[];
  workflowRuns: GitHubWorkflowRun[];
  loading: boolean;
  error: string | null;
  setData: (data: { project: GitHubProject | null; pullRequests: GitHubPR[]; releases: GitHubRelease[]; workflowRuns: GitHubWorkflowRun[] }) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateProjectItem: (itemId: string, partial: Partial<ProjectItem>) => void;
  prependProjectItem: (item: ProjectItem) => void;
}

export const useDevStore = create<DevState>((set) => ({
  project: null,
  pullRequests: [],
  releases: [],
  workflowRuns: [],
  loading: false,
  error: null,
  setData: ({ project, pullRequests, releases, workflowRuns }) =>
    set({ project, pullRequests, releases, workflowRuns }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  updateProjectItem: (itemId, partial) =>
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          items: state.project.items.map((i) =>
            i.id === itemId ? { ...i, ...partial } : i
          ),
        },
      };
    }),
  prependProjectItem: (item) =>
    set((state) => {
      if (!state.project) return state;
      return {
        project: { ...state.project, items: [item, ...state.project.items] },
      };
    }),
}));
