/**
 * File Handler Module
 * Handles zip file extraction and firmware file processing
 */

const FileHandler = {
    /**
     * Extract zip file and return firmware files
     * @param {File|ArrayBuffer} file - Zip file or ArrayBuffer to extract
     * @returns {Promise<Object>} Object containing firmware files
     */
    async extractZipFile(file) {
        try {
            const zip = await JSZip.loadAsync(file);
            const files = {};

            // Extract all .bin files
            const binFiles = Object.keys(zip.files).filter(name =>
                name.endsWith('.bin') && !name.includes('__MACOSX')
            );

            for (const filename of binFiles) {
                const data = await zip.files[filename].async('arraybuffer');
                const name = filename.split('/').pop(); // Get filename without path
                files[name] = data;
            }

            return files;
        } catch (error) {
            throw new Error(`Failed to extract zip file: ${error.message}`);
        }
    },

    /**
     * Validate firmware files
     * @param {Object} files - Object containing firmware files
     * @returns {Object} Validation result with isValid flag and message
     */
    validateFirmwareFiles(files) {
        const fileNames = Object.keys(files);

        if (fileNames.length === 0) {
            return {
                isValid: false,
                message: 'No .bin files found in zip archive'
            };
        }

        // Check for at least one of the common firmware files
        const hasFirmware = fileNames.some(name =>
            name.toLowerCase().includes('firmware') ||
            name.toLowerCase().includes('app')
        );

        if (!hasFirmware) {
            return {
                isValid: false,
                message: 'No firmware.bin or app binary found in zip archive'
            };
        }

        return {
            isValid: true,
            message: `Found ${fileNames.length} firmware file(s): ${fileNames.join(', ')}`,
            files: fileNames
        };
    },

    /**
     * Convert File to ArrayBuffer
     * @param {File} file - File to convert
     * @returns {Promise<ArrayBuffer>} File contents as ArrayBuffer
     */
    async getBinaryBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Determine flash offset for a given file
     * @param {string} filename - Name of the firmware file
     * @returns {number} Flash offset address
     */
    getFlashOffset(filename) {
        const name = filename.toLowerCase();

        // ESP32-S3 standard offset mappings (matching PlatformIO)
        if (name.includes('bootloader')) {
            return 0x0000;  // ESP32-S3 bootloader at 0x0
        }
        if (name.includes('partition')) {
            return 0x8000;  // Partition table
        }
        if (name.includes('boot_app0')) {
            return 0xe000;  // Boot app partition selector
        }
        if (name.includes('firmware') || name.includes('app')) {
            return 0x10000;  // Main application
        }
        if (name.includes('littlefs') || name.includes('spiffs') || name.includes('fs')) {
            // Filesystem offset for default_8MB.csv partition table (ESP32-S3 with 8MB flash)
            // Matches arduino-esp32 tools/partitions/default_8MB.csv: spiffs at 0x670000
            return 0x670000;
        }

        // Default offset for unknown files
        console.warn(`Unknown file type: ${filename}, using default offset 0x10000`);
        return 0x10000;
    },

    /**
     * Prepare firmware files for flashing
     * @param {Object} files - Object containing firmware files {filename: ArrayBuffer}
     * @returns {Array} Array of {filename, offset, data} objects sorted by offset
     */
    prepareFirmwareFiles(files) {
        const prepared = [];

        for (const [filename, data] of Object.entries(files)) {
            prepared.push({
                filename,
                offset: this.getFlashOffset(filename),
                data
            });
        }

        // Sort by offset to flash in correct order
        prepared.sort((a, b) => a.offset - b.offset);

        return prepared;
    },

    /**
     * Prepare firmware files for flashing with custom offsets
     * @param {Object} files - Object containing firmware files {filename: ArrayBuffer}
     * @param {Object} customOffsets - Object containing custom offsets {filename: offset}
     * @returns {Array} Array of {filename, offset, data} objects sorted by offset
     */
    prepareFirmwareFilesWithCustomOffsets(files, customOffsets) {
        const prepared = [];

        for (const [filename, data] of Object.entries(files)) {
            // Use custom offset if available, otherwise auto-detect
            const offset = customOffsets[filename] !== undefined ?
                customOffsets[filename] :
                this.getFlashOffset(filename);

            prepared.push({ filename, offset, data });
        }

        // Sort by offset (bootloader first)
        prepared.sort((a, b) => a.offset - b.offset);

        return prepared;
    }
};
