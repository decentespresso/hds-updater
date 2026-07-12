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
    target: null,

    clearTarget() {
        this.target = null;
    },

    async assertSupportedTarget() {
        if (!this.esploader || this.esploader.chip?.CHIP_NAME !== 'ESP32-S3') {
            throw new Error('Unsupported target: an ESP32-S3 is required');
        }
        const reportedFlashSize = await this.esploader.getFlashSize();
        const flashSize = Number.isInteger(reportedFlashSize) && reportedFlashSize <= 0x10000 ?
            reportedFlashSize * 1024 : reportedFlashSize;
        if (!Number.isInteger(flashSize) || flashSize < 0x800000) {
            throw new Error('Unsupported target: at least 8 MiB of flash is required');
        }
        this.target = Object.freeze({ chipName: 'ESP32-S3', flashSize });
        return this.target;
    },

    /**
     * Connect to ESP32 device via Web Serial API
     * @returns {Promise<Object>} Device information
     */
    async connectDevice() {
        this.clearTarget();
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
            const target = await this.assertSupportedTarget();

            // Get chip info (methods are on this.esploader.chip and take loader as parameter)
            const chipInfo = {
                type: chipDescription,  // main() already returns the chip description
                macAddress: await this.esploader.chip.readMac(this.esploader),
                features: await this.esploader.chip.getChipFeatures(this.esploader),
                flashSize: target.flashSize,
                flashSizeLabel: `${target.flashSize / 1024 / 1024} MiB`
            };

            this.connected = true;
            this.chip = this.esploader.chip;
            return chipInfo;
        } catch (error) {
            await this.disconnectDevice();
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
            this.clearTarget();
        } catch (error) {
            console.error('Error during disconnect:', error);
            // Force reset connection state even if disconnect fails
            this.device = null;
            this.transport = null;
            this.chip = null;
            this.esploader = null;
            this.connected = false;
            this.clearTarget();
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
        if (!Array.isArray(files) || files.length === 0) {
            throw new Error('No firmware files to flash');
        }

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

            const sortedFiles = [...files].sort((a, b) => a.offset - b.offset);
            const fileArray = sortedFiles.map(file => ({
                data: arrayBufferToBinaryString(file.data),
                address: file.offset
            }));

            log(`Flashing ${sortedFiles.length} file(s)...`, 'info');
            sortedFiles.forEach(file => {
                log(`  - ${file.filename} @ 0x${file.offset.toString(16).toUpperCase()}`, 'info');
            });

            // Get flash config
            const flashConfig = this.getFlashConfig();
            log(`Flash mode: ${flashConfig.flashMode}, Frequency: ${flashConfig.flashFreq}`, 'info');

            const totalSize = fileArray.reduce((sum, file) => sum + file.data.length, 0);
            const completedSizes = fileArray.map((_, index) =>
                fileArray.slice(0, index).reduce((sum, file) => sum + file.data.length, 0)
            );

            await this.assertSupportedTarget();
            await this.esploader.writeFlash({
                fileArray,
                flashSize: flashConfig.flashSize,
                flashMode: flashConfig.flashMode,
                flashFreq: flashConfig.flashFreq,
                eraseAll,
                compress: true,
                reportProgress: (fileIndex, written, total) => {
                    const fileInfo = sortedFiles[fileIndex];
                    const fileProgress = total === 0 ? 0 : (written / total) * 100;
                    const overallWritten = completedSizes[fileIndex] +
                        (fileProgress / 100) * fileArray[fileIndex].data.length;

                    if (progressCallback) {
                        progressCallback((overallWritten / totalSize) * 100, {
                            currentFile: fileIndex + 1,
                            totalFiles: sortedFiles.length,
                            currentFileName: fileInfo.filename,
                            fileProgress
                        });
                    }
                }
            });

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
        } finally {
            this.clearTarget();
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
