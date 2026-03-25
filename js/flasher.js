/**
 * ESP32 Flasher Module
 * Handles ESP32 device connection and flashing using esptool-js
 */

const Flasher = {
    device: null,
    transport: null,
    chip: null,
    esploader: null,
    connected: false,

    /**
     * Connect to ESP32 device via Web Serial API
     * @returns {Promise<Object>} Device information
     */
    async connectDevice() {
        try {
            // Check if Web Serial API is available
            if (!('serial' in navigator)) {
                throw new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.');
            }

            // Request serial port (no filters - show all devices)
            const port = await navigator.serial.requestPort();

            // Wait for esptool-js to load
            if (!window.esptooljs) {
                throw new Error('esptool-js library not loaded yet. Please wait and try again.');
            }

            // Wait a bit for any previous connections to fully close
            await new Promise(resolve => setTimeout(resolve, 100));

            // Create transport
            this.transport = new window.esptooljs.Transport(port, true);
            this.device = port;

            // Create ESPLoader instance
            const loaderOptions = {
                transport: this.transport,
                baudrate: 921600,  // High speed for fast flashing
                terminal: {
                    clean: () => {},
                    writeLine: (data) => console.log(data),
                    write: (data) => console.log(data)
                }
            };

            this.esploader = new window.esptooljs.ESPLoader(loaderOptions);

            // Connect and detect chip
            const chipDescription = await this.esploader.main();

            // Get chip info (methods are on this.esploader.chip and take loader as parameter)
            const chipInfo = {
                type: chipDescription,  // main() already returns the chip description
                macAddress: await this.esploader.chip.readMac(this.esploader),
                features: await this.esploader.chip.getChipFeatures(this.esploader)
            };

            this.connected = true;
            this.chip = this.esploader.chip;
            return chipInfo;
        } catch (error) {
            this.connected = false;
            throw new Error(`Failed to connect: ${error.message}`);
        }
    },

    /**
     * Disconnect from device
     */
    async disconnectDevice() {
        try {
            if (this.transport) {
                await this.transport.disconnect();
                await this.transport.waitForUnlock(1500);
            }
            this.device = null;
            this.transport = null;
            this.chip = null;
            this.esploader = null;
            this.connected = false;
        } catch (error) {
            console.error('Error during disconnect:', error);
            // Force reset connection state even if disconnect fails
            this.device = null;
            this.transport = null;
            this.chip = null;
            this.esploader = null;
            this.connected = false;
        }
    },

    /**
     * Get flash configuration based on chip type
     * @returns {Object} Flash configuration
     */
    getFlashConfig() {
        return {
            flashSize: 'keep', // Auto-detect
            flashMode: 'dio',
            flashFreq: '80m'  // 80MHz for ESP32-S3 (matches PlatformIO default)
        };
    },

    /**
     * Flash firmware to ESP32
     * @param {Array} files - Array of {filename, offset, data} objects
     * @param {Function} progressCallback - Callback for progress updates
     * @param {Function} logCallback - Callback for log messages
     * @returns {Promise<void>}
     */
    async flashFirmware(files, progressCallback = null, logCallback = null, { eraseAll = false } = {}) {
        if (!this.connected || !this.esploader) {
            throw new Error('Device not connected');
        }

        const log = (message, type = 'info') => {
            console.log(message);
            if (logCallback) {
                logCallback(message, type);
            }
        };

        try {
            log('Preparing to flash firmware...', 'info');

            // Helper function to convert ArrayBuffer to binary string
            const arrayBufferToBinaryString = (buffer) => {
                const bytes = new Uint8Array(buffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                return binary;
            };

            // Prepare file data for esptool-js format (expects binary strings)
            const fileArray = files.map(file => ({
                data: arrayBufferToBinaryString(file.data),
                address: file.offset
            }));

            log(`Flashing ${files.length} file(s)...`, 'info');
            files.forEach(file => {
                log(`  - ${file.filename} @ 0x${file.offset.toString(16).toUpperCase()}`, 'info');
            });

            // Get flash config
            const flashConfig = this.getFlashConfig();
            log(`Flash mode: ${flashConfig.flashMode}, Frequency: ${flashConfig.flashFreq}`, 'info');

            // Write files to flash
            let totalSize = 0;
            let writtenSize = 0;

            // Calculate total size
            for (const file of fileArray) {
                totalSize += file.data.length;
            }

            // Flash each file
            for (let i = 0; i < fileArray.length; i++) {
                const file = fileArray[i];
                const fileInfo = files[i];

                log(`Flashing ${fileInfo.filename} (${file.data.length} bytes)...`, 'info');

                try {
                    await this.esploader.writeFlash({
                        fileArray: [file],
                        flashSize: flashConfig.flashSize,
                        flashMode: flashConfig.flashMode,
                        flashFreq: flashConfig.flashFreq,
                        eraseAll: eraseAll,
                        compress: true,
                        reportProgress: (fileIndex, written, total) => {
                            const fileProgress = (written / total) * 100;
                            const overallWritten = writtenSize + written;
                            const overallProgress = (overallWritten / totalSize) * 100;

                            if (progressCallback) {
                                progressCallback(overallProgress, {
                                    currentFile: i + 1,
                                    totalFiles: files.length,
                                    currentFileName: fileInfo.filename,
                                    fileProgress
                                });
                            }
                        }
                    });

                    writtenSize += file.data.length;
                    log(`Successfully flashed ${fileInfo.filename}`, 'success');
                } catch (error) {
                    log(`Failed to flash ${fileInfo.filename}: ${error.message}`, 'error');
                    throw error;
                }
            }

            log('Firmware flashed successfully!', 'success');

            // Small delay to ensure all operations complete
            await new Promise(resolve => setTimeout(resolve, 100));

            log('Resetting device...', 'info');

            // Hard reset the device to boot new firmware
            try {
                await this.esploader.hardReset();
                log('Device reset complete!', 'success');
            } catch (error) {
                log('Reset initiated (device should reboot now)', 'warning');
            }

            log('Firmware update finished! Device should now boot with new firmware.', 'success');

            if (progressCallback) {
                progressCallback(100);
            }
        } catch (error) {
            log(`Flashing failed: ${error.message}`, 'error');
            throw error;
        }
    },

    /**
     * Verify device is connected
     * @returns {boolean} Connection status
     */
    isConnected() {
        return this.connected;
    }
};
