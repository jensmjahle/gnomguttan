module.exports = function (api) {
  api.cache(true);
  return {
    // import.meta (used by zustand's middleware) is transformed so the web preview also runs.
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
          },
        },
      ],
    ],
  };
};
