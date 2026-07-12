const FirmwareValidator = {
    flashSize: 0x800000,
    esp32S3ChipId: 9,
    requiredPartitions: Object.freeze([
        Object.freeze({ role: 'nvs', type: 1, subtype: 2, offset: 0x9000, size: 0x5000 }),
        Object.freeze({ role: 'otadata', type: 1, subtype: 0, offset: 0xE000, size: 0x2000 }),
        Object.freeze({ role: 'ota_0', type: 0, subtype: 0x10, offset: 0x10000, size: 0x330000 }),
        Object.freeze({ role: 'ota_1', type: 0, subtype: 0x11, offset: 0x340000, size: 0x330000 }),
        Object.freeze({ role: 'littlefs', type: 1, subtype: 0x82, offset: 0x670000, size: 0x180000 }),
        Object.freeze({ role: 'coredump', type: 1, subtype: 3, offset: 0x7F0000, size: 0x10000 })
    ]),

    validate(files) {
        this.validateImage('bootloader.bin', files['bootloader.bin']);
        this.validateImage('firmware.bin', files['firmware.bin']);
        const partitions = this.parsePartitionTable(files['partitions.bin']);
        const ota0 = partitions.find(partition => partition.type === 0 && partition.subtype === 0x10);
        const ota1 = partitions.find(partition => partition.type === 0 && partition.subtype === 0x11);
        if (files['firmware.bin'].byteLength > Math.min(ota0.size, ota1.size)) {
            throw new Error('firmware.bin exceeds the OTA slot size');
        }
        return Object.freeze({ partitions, firmwareMaximum: Math.min(ota0.size, ota1.size) });
    },

    validateImage(filename, buffer) {
        const bytes = new Uint8Array(buffer);
        if (bytes.byteLength < 25 || bytes[0] !== 0xE9) {
            throw new Error(`${filename} is not an Espressif image`);
        }

        const view = new DataView(buffer, bytes.byteOffset, bytes.byteLength);
        const segmentCount = bytes[1];
        const chipId = view.getUint16(12, true);
        if (segmentCount < 1 || segmentCount > 16) {
            throw new Error(`${filename} has an invalid segment count`);
        }
        if (chipId !== this.esp32S3ChipId) {
            throw new Error(`${filename} is not an ESP32-S3 image`);
        }

        let position = 24;
        for (let index = 0; index < segmentCount; index += 1) {
            if (position + 8 > bytes.byteLength) {
                throw new Error(`${filename} has a truncated segment header`);
            }
            const length = view.getUint32(position + 4, true);
            if (length === 0 || position + 8 + length > bytes.byteLength) {
                throw new Error(`${filename} has invalid or truncated segment data`);
            }
            position += 8 + length;
        }
        if (position >= bytes.byteLength) {
            throw new Error(`${filename} is missing its checksum byte`);
        }
    },

    parsePartitionTable(buffer) {
        const bytes = new Uint8Array(buffer);
        const view = new DataView(buffer, bytes.byteOffset, bytes.byteLength);
        const partitions = [];
        let md5Found = false;

        for (let position = 0; position + 32 <= bytes.byteLength; position += 32) {
            const magic = view.getUint16(position, true);
            if (magic === 0xFFFF) {
                break;
            }
            if (magic === 0xEBEB) {
                const actual = SparkMD5.ArrayBuffer.hash(buffer.slice(0, position));
                const expected = Array.from(bytes.slice(position + 16, position + 32), byte =>
                    byte.toString(16).padStart(2, '0')).join('');
                if (actual !== expected) {
                    throw new Error('partition table MD5 does not match');
                }
                md5Found = true;
                break;
            }
            if (magic !== 0x50AA) {
                throw new Error(`invalid partition entry at 0x${position.toString(16)}`);
            }

            const partition = Object.freeze({
                type: bytes[position + 2],
                subtype: bytes[position + 3],
                offset: view.getUint32(position + 4, true),
                size: view.getUint32(position + 8, true)
            });
            if (partition.size === 0 || partition.offset + partition.size > this.flashSize) {
                throw new Error('partition is empty or outside 8 MiB flash');
            }
            partitions.push(partition);
        }

        if (partitions.length === 0) {
            throw new Error('partition table is empty');
        }
        const sorted = [...partitions].sort((left, right) => left.offset - right.offset);
        for (let index = 1; index < sorted.length; index += 1) {
            if (sorted[index - 1].offset + sorted[index - 1].size > sorted[index].offset) {
                throw new Error('partition regions overlap');
            }
        }
        for (const required of this.requiredPartitions) {
            const found = partitions.find(partition => partition.type === required.type &&
                partition.subtype === required.subtype && partition.offset === required.offset &&
                partition.size === required.size);
            if (!found) {
                throw new Error(`required ${required.role} partition is missing or malformed`);
            }
        }

        return Object.freeze(partitions.map(partition => Object.freeze({ ...partition, md5Verified: md5Found })));
    }
};
