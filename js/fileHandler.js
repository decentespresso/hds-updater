const FirmwareProfile = Object.freeze({
    'bootloader.bin': Object.freeze({ offset: 0x000000, maximum: 0x008000 }),
    'partitions.bin': Object.freeze({ offset: 0x008000, maximum: 0x001000 }),
    'firmware.bin': Object.freeze({ offset: 0x010000, maximum: 0x330000 }),
    'littlefs.bin': Object.freeze({ offset: 0x670000, maximum: 0x180000 })
});

const FileHandler = {
    maximumArchiveSize: 6 * 1024 * 1024,
    maximumTotalSize: 0x4B9000,

    async extractZipFile(file) {
        const archiveSize = file?.size ?? file?.byteLength;
        if (!Number.isInteger(archiveSize) || archiveSize <= 0 || archiveSize > this.maximumArchiveSize) {
            throw new Error('Firmware archive must be between 1 byte and 6 MiB');
        }

        const blob = file instanceof Blob ? file : new Blob([file]);
        const reader = new zipjs.ZipReader(new zipjs.BlobReader(blob));

        try {
            const entries = await reader.getEntries();
            this.validateEntries(entries);
            const files = {};

            for (const entry of entries) {
                const data = await entry.getData(new zipjs.Uint8ArrayWriter());
                if (data.byteLength !== entry.uncompressedSize) {
                    throw new Error(`${entry.filename} extracted size does not match its ZIP metadata`);
                }
                files[entry.filename] = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            }

            return Object.freeze(files);
        } catch (error) {
            throw new Error(`Invalid firmware archive: ${error.message}`);
        } finally {
            await reader.close();
        }
    },

    validateEntries(entries) {
        if (!Array.isArray(entries) || entries.length !== 4) {
            throw new Error('archive must contain exactly four files');
        }

        const names = new Set();
        let totalSize = 0;

        for (const entry of entries) {
            const name = entry.filename;
            const normalized = typeof name === 'string' ? name.normalize('NFC').toLowerCase() : '';
            const unixType = (entry.externalFileAttributes >>> 16) & 0xF000;

            if (!name || /[\\/\x00-\x1F\x7F]|\s/.test(name) || name !== name.normalize('NFC')) {
                throw new Error('filenames must be normalized root names without paths, controls, or whitespace');
            }
            if (names.has(normalized)) {
                throw new Error(`duplicate or normalized filename collision: ${name}`);
            }
            if (!Object.hasOwn(FirmwareProfile, name)) {
                throw new Error(`unexpected file: ${name}`);
            }
            if (entry.directory || entry.encrypted || (unixType !== 0 && unixType !== 0x8000)) {
                throw new Error(`${name} must be an unencrypted regular file`);
            }
            if (!Number.isInteger(entry.uncompressedSize) || entry.uncompressedSize <= 0) {
                throw new Error(`${name} must not be empty`);
            }
            if (!Number.isInteger(entry.compressedSize) || entry.compressedSize <= 0 ||
                entry.uncompressedSize / entry.compressedSize > 100) {
                throw new Error(`${name} exceeds the 100:1 compression ratio limit`);
            }
            if (entry.uncompressedSize > FirmwareProfile[name].maximum) {
                throw new Error(`${name} exceeds its size limit`);
            }

            names.add(normalized);
            totalSize += entry.uncompressedSize;
            if (totalSize > this.maximumTotalSize) {
                throw new Error('archive exceeds the cumulative uncompressed size limit');
            }
        }
    },

    validateFirmwareFiles(files) {
        const names = Object.keys(files);
        const valid = names.length === 4 && Object.keys(FirmwareProfile).every(name => Object.hasOwn(files, name));
        return {
            isValid: valid,
            message: valid ? 'Validated the four required HDS firmware files' : 'Firmware package is incomplete'
        };
    },

    prepareFirmwareFiles(files) {
        return Object.entries(FirmwareProfile).map(([filename, profile]) => Object.freeze({
            filename,
            offset: profile.offset,
            data: files[filename]
        }));
    },

    prepareFirmwareFilesWithCustomOffsets(files) {
        return this.prepareFirmwareFiles(files);
    }
};
