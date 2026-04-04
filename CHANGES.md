# Curtin - Changes

This document tracks the modifications made to Curtin to create a more private and stripped-down version.

## [2026-04-03]

### Privacy & Tracking
- **Removed Google Analytics**: Completely removed `ga4-mp` dependency and all associated tracking logic from `src/electron.js`. 
- **Disabled Analytics by Default**: Updated `defaultSettings` to ensure analytics is disabled.

### Updates & Network Connectivity
- **Removed Update Logic**: Deleted the `checkForUpdates`, `getLatestUpdate`, and `runUpdate` functions from `src/electron.js`.
- **Cleaned Settings UI**: 
    - Removed the "Updates" section from the Settings sidebar.
    - Removed the "Updates" settings page and the "Check for Updates" button.
    - Removed update-related event listeners and on-mount update checks.
- **Disabled Update Checks by Default**: Updated `defaultSettings` to ensure update checking is disabled.
- **Build Configuration**: Verified build settings to remove automatic publishing triggers.

### Cleanup
- **Dependency Removal**: Removed `ga4-mp` from `package.json`.
