// Expo's iOS template runs the React Native bundle script through an unquoted backtick
// substitution, which word-splits when the project lives in a path with spaces (this repo is
// in iCloud Drive: ".../Mobile Documents/..."). This plugin wraps that substitution in quotes so
// local `expo run:ios` builds work. Cloud (EAS) builds are unaffected either way.
const { withXcodeProject } = require('expo/config-plugins');

const PHASE = 'Bundle React Native code and images';

/** Quotes the backtick command that locates react-native-xcode.sh. Idempotent. */
function quoteBundleScript(script) {
  return script.replace(/`([^`]*react-native-xcode\.sh[^`]*)`/, (_m, inner) => `\\"$(${inner})\\"`);
}

const withQuotedBundleScript = (config) =>
  withXcodeProject(config, (cfg) => {
    const phases = cfg.modResults.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    for (const key of Object.keys(phases)) {
      const phase = phases[key];
      if (!phase || typeof phase !== 'object') continue;
      const name = String(phase.name ?? '').replace(/^"|"$/g, '');
      if (name !== PHASE || typeof phase.shellScript !== 'string') continue;
      phase.shellScript = quoteBundleScript(phase.shellScript);
    }
    return cfg;
  });

module.exports = withQuotedBundleScript;
module.exports.quoteBundleScript = quoteBundleScript;
