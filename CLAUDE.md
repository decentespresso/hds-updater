# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a browser-based ESP32 firmware updater for the Half Decent Scale. It uses the Web Serial API to flash firmware directly from the browser without requiring Python, esptool, or drivers to be installed. The application is a static site designed to be hosted on GitHub Pages.

## Development Commands

### Starting Local Development Server

The application MUST be served via HTTP (not file://):

```bash
./start-server.sh
# OR
python3 -m http.server 8000
```

Access at: http://localhost:8000

**Important**: Web Serial API will not work with file:// protocol.

### Testing

- `test-serial.html` - Verify Web Serial API is working
- Other test-*.html files - Various integration tests for esptool-js

## Architecture

### Module Structure

The application follows a modular JavaScript architecture with separate concerns:

**js/main.js**
- Application initialization and state management
- UI event handling and DOM manipulation
- Coordinates between other modules
- Entry point: `App.init()` called when DOM loads AND esptool-js is ready

**js/flasher.js**
- ESP32 device connection via Web Serial API
- Wraps esptool-js library for flashing operations
- Manages connection state and device communication
- Flash configuration: DIO mode, 80MHz, 921600 baud

**js/fileHandler.js**
- Zip file extraction using JSZip
- Firmware file validation
- Flash offset mapping for ESP32-S3 standard layout:
  - Bootloader: 0x0000 (ESP32-S3, not 0x1000)
  - Partitions: 0x8000
  - Boot app: 0xe000
  - Firmware: 0x10000
  - Filesystem: 0x290000

**js/github.js**
- GitHub API integration for release fetching (JSON API supports CORS)
- User downloads assets via native browser download (no CORS proxy needed)
- Rate limited to 60 requests/hour (unauthenticated)

### Data Flow

1. User selects version from dropdown, downloads zip via browser, then uploads it
2. FileHandler extracts and validates .bin files
3. User connects to ESP32 device via Web Serial API
4. Flasher detects chip type and establishes connection
5. FileHandler prepares files (assigns offsets, sorts by address)
6. Flasher writes each file to flash memory sequentially
7. Device is hard reset to boot new firmware

### External Dependencies

Loaded via CDN:
- **esptool-js** (v0.4.0): ESP32 flashing protocol
- **JSZip** (v3.10.1): Zip file handling
- **Decent Espresso CSS**: UI styling

### Browser Requirements

- Chrome v89+ (✅)
- Edge v89+ (✅)
- Opera v75+ (✅)
- Firefox (❌ - no Web Serial API)
- Safari (❌ - no Web Serial API)

## ESP32-S3 Flash Layout

Standard offsets (matches PlatformIO defaults):

| File Type | Offset | Detection Pattern |
|-----------|--------|-------------------|
| Bootloader | 0x0000 | *bootloader*.bin |
| Partitions | 0x8000 | *partition*.bin |
| Boot App | 0xe000 | *boot_app*.bin |
| Firmware | 0x10000 | *firmware*.bin, *app*.bin |
| Filesystem | 0x290000 | *littlefs*.bin, *spiffs*.bin, *fs*.bin |

**Note**: ESP32-S3 bootloader is at 0x0000, not 0x1000 (which is for ESP32 classic).

## Common Gotchas

### esptool-js Integration

- Must wait for `window.esptooljs` to be available before initializing app
- esptool-js expects binary strings, not ArrayBuffers (conversion required)
- Transport must be disconnected and unlocked properly to avoid stale connections
- Chip methods like `readMac()` and `getChipFeatures()` take the loader as parameter

### Web Serial API

- Only works over HTTP/HTTPS (not file://)
- User must grant permission via browser picker
- Port must be fully released before reconnecting
- Check for port conflicts with Arduino IDE, PlatformIO, etc.

### File Processing

- Firmware zip may contain files in subdirectories - extract filename only
- Filter out macOS metadata files (`__MACOSX`)
- Case-insensitive filename matching for offset detection
- Files must be flashed in offset order (bootloader first)

## Deployment

### GitHub Pages

1. Push to main branch
2. Enable Pages in repository Settings → Pages
3. Source: Deploy from branch `main`, folder `/ (root)`
4. Access at: `https://username.github.io/repo-name/`

No build step required - static HTML/CSS/JS served directly.

## Target Hardware

Half Decent Scale (ESP32-S3 based)
- Official firmware: https://github.com/decentespresso/openscale/releases
- ESP32-S3 chip with standard partition layout
- USB serial connection required for flashing
