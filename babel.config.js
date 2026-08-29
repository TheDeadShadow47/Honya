module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo auto-adds react-native-worklets/plugin (Reanimated 4) when installed.
  return {
    presets: ['babel-preset-expo'],
  };
};
