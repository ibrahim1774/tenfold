// Local StoreKit testing: copies Tenfold.storekit (repo root) into the generated ios/ folder and sets it as
// the StoreKit configuration of the app scheme's Run action. Scheme run options apply when the app is run
// from Xcode (`xed ios`, then Run): purchases then use the six Tenfold subscriptions from the local file
// instead of the App Store sandbox. Re-applied on every prebuild, so `prebuild --clean` no longer loses it
// (Superwall's testing guide warns about that). Archives and EAS builds don't use scheme run options.
const fs = require('fs');
const path = require('path');
const { withXcodeProject } = require('expo/config-plugins');

const FILE = 'Tenfold.storekit';

/**
 * Adds (or updates) <StoreKitConfigurationFileReference identifier = "..."> inside <LaunchAction>.
 * `identifier` is relative to the .xcodeproj, as Xcode writes it. Idempotent.
 */
function addStoreKitReference(xml, identifier) {
  const existing = /(<StoreKitConfigurationFileReference\s+identifier\s*=\s*")[^"]*(")/;
  if (existing.test(xml)) return xml.replace(existing, `$1${identifier}$2`);
  if (!/<LaunchAction[\s>]/.test(xml) || !xml.includes('</LaunchAction>')) return xml;
  const ref = `      <StoreKitConfigurationFileReference\n         identifier = "${identifier}">\n      </StoreKitConfigurationFileReference>\n`;
  return xml.replace(/(\n?)([ \t]*)<\/LaunchAction>/, (_m, nl, indent) => `${nl}${ref}${indent}</LaunchAction>`);
}

const withStoreKitConfig = (config) =>
  withXcodeProject(config, (cfg) => {
    const { projectRoot, platformProjectRoot, projectName } = cfg.modRequest;
    const source = path.join(projectRoot, FILE);
    if (!fs.existsSync(source) || !projectName) return cfg;

    fs.copyFileSync(source, path.join(platformProjectRoot, FILE));

    const scheme = path.join(platformProjectRoot, `${projectName}.xcodeproj`, 'xcshareddata', 'xcschemes', `${projectName}.xcscheme`);
    if (fs.existsSync(scheme)) {
      const xml = fs.readFileSync(scheme, 'utf8');
      const next = addStoreKitReference(xml, `../${FILE}`);
      if (next !== xml) fs.writeFileSync(scheme, next);
    }
    return cfg;
  });

module.exports = withStoreKitConfig;
module.exports.addStoreKitReference = addStoreKitReference;
