const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync('js/fileHandler.js', 'utf8');

const loadFileHandler = entries => {
    const context = vm.createContext({
        Blob,
        FirmwareValidator: { validate() {} },
        Object,
        zipjs: {
            BlobReader: class {},
            Uint8ArrayWriter: class {},
            ZipReader: class {
                async getEntries() { return entries; }
                async close() {}
            }
        }
    });
    vm.runInContext(source, context);
    return vm.runInContext('FileHandler', context);
};

const entry = (filename, size = 100, overrides = {}) => ({
    filename,
    compressedSize: Math.max(1, Math.ceil(size / 2)),
    uncompressedSize: size,
    directory: false,
    encrypted: false,
    externalFileAttributes: 0,
    async getData() { return new Uint8Array(size); },
    ...overrides
});

const validEntries = () => [
    entry('bootloader.bin'),
    entry('partitions.bin'),
    entry('firmware.bin'),
    entry('littlefs.bin')
];

test('extracts only the exact bounded HDS package and assigns trusted addresses', async () => {
    const handler = loadFileHandler(validEntries());
    const files = await handler.extractZipFile(new Uint8Array(100).buffer);
    assert.deepEqual(Object.keys(files), ['bootloader.bin', 'partitions.bin', 'firmware.bin', 'littlefs.bin']);
    assert.deepEqual(
        Array.from(handler.prepareFirmwareFiles(files), file => file.offset),
        [0x000000, 0x008000, 0x010000, 0x670000]
    );
});

test('rejects paths, unexpected names, encryption, empty data, oversize data, and ZIP bombs', async () => {
    const cases = [
        [entry('../bootloader.bin'), /filenames/],
        [entry('BOOTLOADER.bin'), /unexpected/],
        [entry('bootloader.bin', 100, { encrypted: true }), /unencrypted/],
        [entry('bootloader.bin', 0), /must not be empty/],
        [entry('bootloader.bin', 0x8001), /size limit/],
        [entry('bootloader.bin', 101, { compressedSize: 1 }), /compression ratio/]
    ];

    for (const [badEntry, expected] of cases) {
        const entries = validEntries();
        entries[0] = badEntry;
        await assert.rejects(loadFileHandler(entries).extractZipFile(new Uint8Array(100).buffer), expected);
    }
});

test('rejects archives outside the compressed size limit before opening them', async () => {
    const handler = loadFileHandler(validEntries());
    await assert.rejects(handler.extractZipFile(new Uint8Array(0).buffer), /between 1 byte and 6 MiB/);
    await assert.rejects(handler.extractZipFile({ byteLength: 6 * 1024 * 1024 + 1 }), /between 1 byte and 6 MiB/);
});
