export type ThemeConfig = {
  id: string;
  label: string;
  description: string;
};

export type ThemeGroup = {
  label: string;
  themes: ThemeConfig[];
};

export const THEME_GROUPS: ThemeGroup[] = [
  {
    label: 'Official',
    themes: [
      { id: 'forest', label: 'Forest', description: 'Green & natural'  },
      { id: 'sky',    label: 'Sky',    description: 'Blue & open'      },
      { id: 'light',  label: 'Light',  description: 'Clean & bright'   },
      { id: 'dark',   label: 'Dark',   description: 'Easy on the eyes' },
    ],
  },
];

export const ALL_THEMES: ThemeConfig[] = THEME_GROUPS.flatMap(g => g.themes);

export type Theme = string;
