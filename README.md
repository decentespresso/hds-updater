# Half Decent Scale Updater

A simple web-based tool for updating Half Decent Scale firmware directly from your browser using the Web Serial API. No installation required - just open the page in a supported browser and start updating your scale!

## Features

- **Browser-Based**: No need to install Python, esptool, or drivers
- **Automatic Chip Detection**: Supports ESP32-S3 with automatic detection
- **Simple Upload**: Just download the firmware zip and upload it
- **Clean Interface**: Decent Espresso-branded UI for easy firmware updating
- **Real-Time Progress**: Live progress updates and detailed console logging
- **Fast**: 921600 baud rate for quick firmware updates

## Browser Requirements

This tool requires a browser with Web Serial API support:
- ✅ Google Chrome (v89+)
- ✅ Microsoft Edge (v89+)
- ✅ Opera (v75+)
- ❌ Firefox (not supported)
- ❌ Safari (not supported)

## Usage

### Quick Start

### Option 1: Use GitHub Pages (Recommended)

Visit the hosted version at: **[Your GitHub Pages URL]**

### Option 2: Run Locally

**IMPORTANT**: You must serve the files via HTTP, not open them directly with `file://` protocol.

**Using the startup script:**
```bash
./start-server.sh
```

**Or using Python:**
```bash
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

## Deploying to GitHub Pages

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Deploy Decent Firmware Updater"
   git push origin main
   ```

2. **Enable GitHub Pages**:
   - Go to your repository on GitHub
   - Settings → Pages
   - Source: Deploy from branch `main`
   - Folder: `/ (root)`
   - Save

3. **Access your updater** at: `https://yourusername.github.io/hds-update/`

No CORS issues when hosted on GitHub Pages!

### Using the Updater:

1. Make sure your browser is Chrome, Edge, or Opera (Web Serial API required)
2. **Download firmware**: Get the latest Half Decent Scale firmware zip from [GitHub Releases](https://github.com/decentespresso/openscale/releases)
3. **Upload firmware**: Click "Choose File" and select the downloaded zip file
4. **Connect scale**: Connect your Half Decent Scale via USB, then click "Connect Device" and select it from the serial port picker
5. **Flash**: Click "Flash Firmware" to begin updating
6. Wait for the process to complete - the scale will reset automatically with new firmware

### Firmware Zip File Structure

Your firmware zip file should contain `.bin` files with standard naming conventions:

```
firmware.zip
├── bootloader.bin    # Flashed at 0x1000
├── partitions.bin    # Flashed at 0x8000
├── boot_app0.bin     # Flashed at 0xe000 (optional)
├── firmware.bin      # Flashed at 0x10000 (main application)
└── littlefs.bin      # Flashed at 0x670000 (filesystem, optional)
```

**Supported file names** (case-insensitive):
- Bootloader: `*bootloader*.bin`
- Partitions: `*partition*.bin`
- Boot app: `*boot_app*.bin`
- Firmware: `*firmware*.bin`, `*app*.bin`
- Filesystem: `*littlefs*.bin`, `*spiffs*.bin`, `*fs*.bin`

### GitHub Repository Setup

To flash firmware from GitHub Releases:

1. Your repository must have releases with attached zip files
2. The zip file should follow the structure above
3. Preferably name the zip file with "firmware" in it (e.g., `esp32-firmware.zip`)
4. Enter the repository in format: `owner/repo` (e.g., `espressif/arduino-esp32`)

### Flash Memory Offsets

The tool automatically assigns flash offsets based on file names (ESP32-S3 standard layout, `default_8MB.csv` partition table):

| File Type | Default Offset | Notes |
|-----------|----------------|-------|
| Bootloader | 0x0000 | First stage bootloader (ESP32-S3) |
| Partitions | 0x8000 | Partition table |
| Boot App | 0xe000 | Boot app partition selector |
| Firmware | 0x10000 | Main application |
| Filesystem | 0x670000 | SPIFFS/LittleFS data |

**Flash Settings**: DIO mode, 80MHz frequency, auto-detect size

**Note**: Filesystem offset corresponds to the `default_8MB.csv` partition table from arduino-esp32. The filesystem (spiffs) partition is at 0x670000 with size 0x180000. If using a different partition scheme, verify your partition layout.

## Troubleshooting

### "Web Serial API is not supported" or Serial Port Picker Not Showing
- **Most Common Issue**: You must serve files via HTTP (use `./start-server.sh` or `python3 -m http.server 8000`), NOT by opening `index.html` directly
- Use Chrome, Edge, or Opera browser (v89 or newer) - NOT Firefox or Safari
- Make sure you're accessing via `http://localhost:8000`, not `file://`
- Use the test file `test-serial.html` to verify Web Serial API is working

### "Failed to connect to device"
- Check USB cable connection to your Half Decent Scale
- Make sure no other program is using the serial port (close Arduino IDE, PlatformIO, etc.)
- Try a different USB port or cable
- Ensure the scale is powered on
- Some boards may require holding the BOOT button during connection

### "No releases found" or GitHub API errors
- Verify the repository name is correct (format: `owner/repo`)
- Check that the repository has releases
- GitHub API has rate limits (60 requests/hour for unauthenticated users)

### Flashing fails partway through
- Try reconnecting the device
- Ensure the firmware files are compatible with your ESP32 chip variant
- Check USB cable quality (some cables are charge-only)
- Hold the BOOT button during flashing if your board requires it

### Scale doesn't boot after flashing
- Verify all required files were included (bootloader, partitions, firmware)
- Check that you downloaded the correct firmware version for the Half Decent Scale
- Ensure flash offsets match your partition table
- Contact Decent Espresso support if issues persist

## Development

### File Structure

```
/
├── index.html          # Main UI and HTML structure
├── js/
│   ├── main.js        # Application initialization and UI event handling
│   ├── github.js      # GitHub API integration
│   ├── flasher.js     # ESP32 flashing logic (esptool-js wrapper)
│   └── fileHandler.js # Zip file extraction and processing
└── README.md          # This file
```

### External Dependencies

The following libraries are loaded via CDN:
- **esptool-js** (v0.4.0): ESP32 flashing protocol implementation
- **JSZip** (v3.10.1): Zip file handling

### How It Works

1. **Firmware Selection**: User selects firmware source (GitHub or local upload)
2. **File Processing**: Zip file is extracted and `.bin` files are identified
3. **Device Connection**: Web Serial API establishes connection to ESP32
4. **Chip Detection**: esptool-js detects chip type, MAC address, and features
5. **File Preparation**: Binary files are sorted by flash offset
6. **Flashing**: Each file is written to flash memory at its assigned offset
7. **Reset**: Device is hard reset to boot the new firmware

## Security & Privacy

- All operations happen **locally in your browser** - no data is sent to external servers
- GitHub API calls are made directly from your browser (rate-limited to 60/hour)
- Downloaded firmware is processed in memory and never stored permanently
- No tracking, analytics, or telemetry

## License

This project is provided as-is for educational and development purposes.

## Credits

Built for the [Half Decent Scale](https://github.com/decentespresso/openscale) by [Decent Espresso](https://decentespresso.com) with:
- [esptool-js](https://github.com/espressif/esptool-js) by Espressif Systems
- [JSZip](https://stuk.github.io/jszip/) by Stuart Knightley
- UI styling from [Decent Espresso](https://decentespresso.com)

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## Disclaimer

Firmware updates can potentially cause issues if done incorrectly. Always:
- Verify firmware compatibility with your Half Decent Scale
- Only use official Half Decent Scale firmware releases from [GitHub](https://github.com/decentespresso/openscale/releases)
- Use quality USB cables and ensure the scale is powered during the update
- Do not interrupt the update process

This tool is provided as-is. For official support, please contact Decent Espresso.
