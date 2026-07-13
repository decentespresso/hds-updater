# Half Decent Scale Updater

The updater flashes official Half Decent Scale firmware from Chrome or Edge through Web Serial. Firmware processing stays in the browser.

Use the hosted updater at [https://decentespresso.github.io/hds-updater/](https://decentespresso.github.io/hds-updater/).

## Requirements

- Chrome 89 or newer, or Edge 89 or newer
- An ESP32-S3 Half Decent Scale with at least 8 MiB flash
- A data-capable USB cable
- An official four-file HDS firmware ZIP

## Update A Scale

1. Select and download an OpenScale release.
2. Load the downloaded ZIP into the updater.
3. Connect the scale and select its serial port.
4. Optionally enable full-flash erase.
5. Flash the firmware without disconnecting power or USB.

The updater checks the chip and flash capacity again immediately before writing, then disconnects after every flash attempt.
The console records `Full flash erase: enabled` or `Full flash erase: disabled` for every attempt.

## Accepted Firmware Package

The ZIP must be at most 6 MiB and contain exactly these case-sensitive files at its root:

| File | Flash address | Maximum size |
|------|---------------|--------------|
| `bootloader.bin` | `0x000000` | `0x008000` |
| `partitions.bin` | `0x008000` | `0x001000` |
| `firmware.bin` | `0x010000` | `0x330000` |
| `littlefs.bin` | `0x670000` | `0x180000` |

Paths, directories, additional files, empty files, encryption, duplicate or normalized names, special files, and compression ratios above 100:1 are rejected before extraction. Cumulative uncompressed data is limited to `0x4B9000`. Flash addresses are fixed and cannot be edited.

The package validator checks Espressif image magic, segment counts and metadata, truncation, the ESP32-S3 chip ID, partition ranges and overlap, and optional partition-table MD5 data. It requires the HDS 8 MiB partition layout:

| Role | Type/subtype | Address | Size |
|------|--------------|---------|------|
| NVS | data/NVS | `0x009000` | `0x005000` |
| OTA data | data/OTA | `0x00E000` | `0x002000` |
| OTA 0 | app/OTA 0 | `0x010000` | `0x330000` |
| OTA 1 | app/OTA 1 | `0x340000` | `0x330000` |
| LittleFS | data/SPIFFS | `0x670000` | `0x180000` |
| Core dump | data/coredump | `0x7F0000` | `0x010000` |

The browser writes `firmware.bin` only to OTA 0 and leaves OTA 1 untouched. Espressif format references: [firmware image format](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/firmware-image-format.html) and [partition tables](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-guides/partition-tables.html).

## Development

Use Node `22.17.0` and install exact locked dependencies:

```bash
npm ci
npx playwright install chromium
npm run check
```

`npm run check` runs syntax checks, native regression tests, the production build, and a Chromium smoke test. Serve the tested build from `dist/`:

```bash
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. Web Serial does not work from `file://`.

## Deployment

The Pages workflow runs only through `workflow_dispatch`. It installs locked dependencies, runs `npm run check`, and uploads only `dist/`.

Before production use, configure the repository's `github-pages` environment with required reviewers. A reviewer must manually approve the deployment job after the build passes.

## Manual Release Checks

1. Run `npm ci`, `npm run check`, and `git diff --check`.
2. Confirm the built page loads without CSP, network, or JavaScript errors in Chromium.
3. Confirm an unsupported chip, unknown flash capacity, and flash below 8 MiB are rejected.
4. On a physical HDS, flash an official package with full erase disabled and confirm boot plus LittleFS data.
5. Repeat with full erase enabled and confirm boot plus LittleFS data.
6. Confirm disconnect, reconnect, failure, port removal, and a flash attempt leave the updater disconnected.
7. Manually approve the protected `github-pages` deployment.

Mocked and browser checks are not physical hardware validation.

## Security

The production build self-hosts its exact browser dependencies and enforces a restrictive Content Security Policy. CSP `connect-src` permits only `https://api.github.com`, and firmware downloads open only validated HTTPS `github.com` URLs. There is no analytics or telemetry.

Signing, release-digest verification, OTA downloads, and automatic production deployment are outside the current hardening scope.
