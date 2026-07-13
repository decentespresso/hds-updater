const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync('js/firmwareValidator.js', 'utf8');
const context = vm.createContext({
    Array,
    DataView,
    Object,
    SparkMD5: { ArrayBuffer: { hash: buffer => crypto.createHash('md5').update(new Uint8Array(buffer)).digest('hex') } },
    Uint8Array
});
vm.runInContext(source, context);
const validator = vm.runInContext('FirmwareValidator', context);

const image = ({ chipId = 9, segmentLength = 8 } = {}) => {
    const bytes = new Uint8Array(24 + 8 + segmentLength + 1);
    const view = new DataView(bytes.buffer);
    bytes[0] = 0xE9;
    bytes[1] = 1;
    view.setUint16(12, chipId, true);
    view.setUint32(28, segmentLength, true);
    return bytes.buffer;
};

const partitionTable = ({ overlap = false, md5 = true } = {}) => {
    const definitions = [
        [1, 2, 0x9000, 0x5000],
        [1, 0, 0xE000, 0x2000],
        [0, 0x10, 0x10000, 0x330000],
        [0, 0x11, overlap ? 0x330000 : 0x340000, 0x330000],
        [1, 0x82, 0x670000, 0x180000],
        [1, 3, 0x7F0000, 0x10000]
    ];
    const bytes = new Uint8Array(0x1000).fill(0xFF);
    const view = new DataView(bytes.buffer);
    definitions.forEach(([type, subtype, offset, size], index) => {
        const position = index * 32;
        view.setUint16(position, 0x50AA, true);
        bytes[position + 2] = type;
        bytes[position + 3] = subtype;
        view.setUint32(position + 4, offset, true);
        view.setUint32(position + 8, size, true);
    });
    if (md5) {
        const position = definitions.length * 32;
        view.setUint16(position, 0xEBEB, true);
        const digest = crypto.createHash('md5').update(bytes.slice(0, position)).digest();
        bytes.set(digest, position + 16);
    }
    return bytes.buffer;
};

test('validates ESP32-S3 images and the exact HDS partition layout', () => {
    const result = validator.validate({
        'bootloader.bin': image(),
        'firmware.bin': image(),
        'partitions.bin': partitionTable(),
        'littlefs.bin': new ArrayBuffer(1)
    });
    assert.equal(result.firmwareMaximum, 0x330000);
    assert.equal(result.partitions.length, 6);
    assert.equal(result.partitions[0].md5Verified, true);
});

test('rejects wrong chips, truncated segments, layout overlap, and bad MD5', () => {
    assert.throws(() => validator.validateImage('firmware.bin', image({ chipId: 0 })), /not an ESP32-S3/);
    const truncated = image();
    new DataView(truncated).setUint32(28, 100, true);
    assert.throws(() => validator.validateImage('firmware.bin', truncated), /truncated/);
    assert.throws(() => validator.parsePartitionTable(partitionTable({ overlap: true })), /overlap/);
    const badMd5 = partitionTable();
    new Uint8Array(badMd5)[16] ^= 1;
    assert.throws(() => validator.parsePartitionTable(badMd5), /MD5/);
});
