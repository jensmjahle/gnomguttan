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
      { id: 'forest',  label: 'Forest',  description: 'Green & natural'  },
      { id: 'sky',     label: 'Sky',     description: 'Blue & open'      },
      { id: 'light',   label: 'Light',   description: 'Clean & bright'   },
      { id: 'dark',    label: 'Dark',    description: 'Easy on the eyes' },
      { id: 'yotsuba',      label: 'Yotsuba',      description: 'Warm & cheerful' },
      { id: 'yotsuba-blue', label: 'Yotsuba Blue', description: 'Cool & calm'    },
      { id: 'monokai',    label: 'Monokai',    description: 'Dark & vivid'   },
      { id: 'commodore',  label: 'Commodore',  description: 'Retro & bold'   },
      { id: 'vice',      label: 'Vice',      description: 'Mellow gradient' },
      { id: 'studious',  label: 'Studious',  description: 'Dark & focused'   },
      { id: 'geno',      label: 'Geno',      description: 'Lush and Mysterious' },
    ],
  },
];

export const ALL_THEMES: ThemeConfig[] = THEME_GROUPS.flatMap(g => g.themes);

export type Theme = string;
