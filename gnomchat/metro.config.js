const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.resolveRequest = (context, name, platform) => {
  if (name === 'punycode') return { filePath: require.resolve('./src/utils/punycode.cjs'), type: 'sourceFile' };
  return context.resolveRequest(context, name, platform);
};
module.exports = config;
