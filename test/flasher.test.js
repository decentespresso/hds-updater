const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync('js/flasher.js', 'utf8');

const loadFlasher = () => {
    const context = vm.createContext({
        console: { log() {}, error() {} },
        navigator: { serial: { requestPort: async () => ({}) } },
        setTimeout: (callback) => callback(),
        Uint8Array,
        window: {
            esptooljs: {
                Transport: class {},
                ESPLoader: class {}
            }
        }
    });
    vm.runInContext(source, context);
    return vm.runInContext('Flasher', context);
};

const firmwareFiles = () => [
    { filename: 'littlefs.bin', offset: 0x670000, data: new Uint8Array(40).buffer },
    { filename: 'firmware.bin', offset: 0x10000, data: new Uint8Array(30).buffer },
    { filename: 'bootloader.bin', offset: 0x0, data: new Uint8Array(10).buffer },
    { filename: 'partitions.bin', offset: 0x8000, data: new Uint8Array(20).buffer }
];

const mockConnectedFlasher = ({ fail = false, progress = false } = {}) => {
    const flasher = loadFlasher();
    const calls = [];
    let resets = 0;
    flasher.connected = true;
    flasher.esploader = {
        chip: { CHIP_NAME: 'ESP32-S3' },
        async getFlashSize() { return 0x800000; },
        async writeFlash(options) {
            calls.push(options);
            if (progress) {
                options.fileArray.forEach((file, index) => {
                    options.reportProgress(index, file.data.length / 2, file.data.length);
                    options.reportProgress(index, file.data.length, file.data.length);
                });
            }
            if (fail) {
                throw new Error('write failed');
            }
        },
        async hardReset() {
            resets += 1;
        }
    };
    return { flasher, calls, resetCount: () => resets };
};

test('flashes four ordered images in one full-erase transaction and reports aggregate progress', async () => {
    const { flasher, calls, resetCount } = mockConnectedFlasher({ progress: true });
    const progress = [];

    await flasher.flashFirmware(
        firmwareFiles(),
        (percent, info) => progress.push({ percent, info }),
        null,
        { eraseAll: true }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].eraseAll, true);
    assert.deepEqual(
        Array.from(calls[0].fileArray, file => file.address),
        [0x0, 0x8000, 0x10000, 0x670000]
    );
    assert.equal(calls[0].fileArray.length, 4);
    assert.equal(resetCount(), 1);
    assert.deepEqual(
        progress.slice(0, 8).map(item => item.percent),
        [5, 10, 20, 30, 45, 60, 80, 100]
    );
    assert.equal(progress[6].info.currentFile, 4);
    assert.equal(progress[6].info.totalFiles, 4);
    assert.equal(progress[6].info.currentFileName, 'littlefs.bin');
    assert.equal(progress[6].info.fileProgress, 50);
    assert.equal(progress.at(-1).percent, 100);
});

test('passes disabled full erase once', async () => {
    const { flasher, calls } = mockConnectedFlasher();

    await flasher.flashFirmware(firmwareFiles(), null, null, { eraseAll: false });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].eraseAll, false);
});

test('does not reset after write or verification failure', async () => {
    const { flasher, calls, resetCount } = mockConnectedFlasher({ fail: true });

    await assert.rejects(
        flasher.flashFirmware(firmwareFiles(), null, null, { eraseAll: true }),
        /write failed/
    );

    assert.equal(calls.length, 1);
    assert.equal(resetCount(), 0);
});

test('rejects an empty image array before calling esptool-js', async () => {
    const { flasher, calls, resetCount } = mockConnectedFlasher();

    await assert.rejects(flasher.flashFirmware([]), /No firmware files to flash/);

    assert.equal(calls.length, 0);
    assert.equal(resetCount(), 0);
});

test('rejects unsupported chips and flash capacity before writing', async () => {
    const { flasher, calls } = mockConnectedFlasher();
    flasher.esploader.chip.CHIP_NAME = 'ESP32';
    await assert.rejects(flasher.flashFirmware(firmwareFiles()), /ESP32-S3/);
    flasher.esploader.chip.CHIP_NAME = 'ESP32-S3';
    flasher.esploader.getFlashSize = async () => 0x400000;
    await assert.rejects(flasher.flashFirmware(firmwareFiles()), /8 MiB/);
    assert.equal(calls.length, 0);
});

test('fails closed when target capacity cannot be identified', async () => {
    const { flasher, calls } = mockConnectedFlasher();
    flasher.esploader.getFlashSize = async () => undefined;
    await assert.rejects(flasher.flashFirmware(firmwareFiles()), /8 MiB/);
    assert.equal(calls.length, 0);
});

test('accepts esptool-js KiB results at 8 MiB and 16 MiB', async () => {
    for (const capacity of [8192, 16384]) {
        const { flasher, calls } = mockConnectedFlasher();
        flasher.esploader.getFlashSize = async () => capacity;
        await flasher.flashFirmware(firmwareFiles());
        assert.equal(calls.length, 1);
    }
});
