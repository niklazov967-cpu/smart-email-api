#!/usr/bin/env node

/**
 * Generate version info from git
 * Creates public/version.json with current commit info
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getGitInfo() {
  try {
    const commit = execSync('git rev-parse HEAD').toString().trim();
    const commitShort = execSync('git rev-parse --short HEAD').toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const tag = execSync('git describe --tags --always').toString().trim();
    const commitDate = execSync('git log -1 --format=%ai').toString().trim();
    const commitMessage = execSync('git log -1 --format=%s').toString().trim();
    const author = execSync('git log -1 --format=%an').toString().trim();
    
    return {
      commit,
      commitShort,
      branch,
      tag,
      commitDate,
      commitMessage,
      author,
      buildDate: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting git info:', error.message);
    return {
      commit: 'unknown',
      commitShort: 'unknown',
      branch: 'unknown',
      tag: 'unknown',
      commitDate: new Date().toISOString(),
      commitMessage: 'No git info available',
      author: 'unknown',
      buildDate: new Date().toISOString()
    };
  }
}

// Generate version info
const versionInfo = getGitInfo();

// Write to public/version.json
const publicDir = path.join(__dirname, '../public');
const versionFile = path.join(publicDir, 'version.json');

fs.writeFileSync(versionFile, JSON.stringify(versionInfo, null, 2));

console.log('✅ Generated version.json');
console.log(`   Commit: ${versionInfo.commitShort}`);
console.log(`   Branch: ${versionInfo.branch}`);
console.log(`   Tag: ${versionInfo.tag}`);
console.log(`   Date: ${versionInfo.commitDate}`);

// Also create a runtime version endpoint
const versionJs = `// Auto-generated version info
window.APP_VERSION = ${JSON.stringify(versionInfo, null, 2)};
`;

fs.writeFileSync(path.join(publicDir, 'version.js'), versionJs);
console.log('✅ Generated version.js');
