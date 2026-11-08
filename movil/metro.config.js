const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const sharedSource = path.resolve(__dirname, '../shared');
const webI18nSource = path.resolve(__dirname, '../fe/src/i18n');

config.watchFolders = [...(config.watchFolders || []), sharedSource, webI18nSource];

module.exports = config;
