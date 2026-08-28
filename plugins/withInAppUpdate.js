const { AndroidConfig, createRunOncePlugin } = require('@expo/config-plugins');

const pkg = require('../package.json');

const withInAppUpdate = (config) => {
  return AndroidConfig.Permissions.withPermissions(config, ['android.permission.REQUEST_INSTALL_PACKAGES']);
};

module.exports = createRunOncePlugin(withInAppUpdate, pkg.name, pkg.version);
