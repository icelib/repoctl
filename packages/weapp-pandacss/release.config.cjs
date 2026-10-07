/** @type {import('semantic-release').Options} */
const options = {
  branches: [
    'master',
    'main',
    '+([0-9])?(.{+([0-9]),x}).x',
    'master',
    'next',
    { name: 'beta', prerelease: true },
    { name: 'alpha', prerelease: true },
  ],
}
module.exports = options
