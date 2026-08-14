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

const mockConnectedFlasher = ({ fail = false, progress = false, eraseStatus = [0, 0] } = {}) => {
    const flasher = loadFlasher();
    const calls = [];
    const erases = [];
    let resets = 0;
    flasher.connected = true;
    flasher.esploader = {
        ESP_ERASE_REGION: 0xD1,
        chip: { CHIP_NAME: 'ESP32-S3' },
        async getFlashSize() { return 0x800000; },
        async command(command, data) {
            assert.equal(calls.length, 1);
            erases.push({ command, data: new Uint8Array(data) });
            return [0, new Uint8Array(eraseStatus)];
        },
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
    return { flasher, calls, erases, resetCount: () => resets };
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

test('erases only OTA data after a successful normal factory flash', async () => {
    const { flasher, calls, erases } = mockConnectedFlasher();
    const logs = [];

    await flasher.flashFirmware(firmwareFiles(), null, message => logs.push(message), { eraseAll: false });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].eraseAll, false);
    assert.equal(erases.length, 1);
    assert.equal(erases[0].command, 0xD1);
    assert.deepEqual(Array.from(erases[0].data), [0x00, 0xE0, 0x00, 0x00, 0x00, 0x20, 0x00, 0x00]);
    assert.ok(logs.includes('Full flash erase: disabled'));
    assert.ok(logs.includes('Resetting OTA boot selection...'));
});

test('rejects a failed OTA data erase without resetting', async () => {
    const { flasher, erases, resetCount } = mockConnectedFlasher({ eraseStatus: [1, 5] });

    await assert.rejects(flasher.flashFirmware(firmwareFiles()), /OTA data erase failed with status 1/);

    assert.equal(erases.length, 1);
    assert.equal(resetCount(), 0);
});

test('logs enabled full erase before passing it to esptool-js', async () => {
    const { flasher, calls, erases } = mockConnectedFlasher();
    const logs = [];

    await flasher.flashFirmware(firmwareFiles(), null, message => logs.push(message), { eraseAll: true });

    assert.equal(calls[0].eraseAll, true);
    assert.equal(erases.length, 0);
    assert.ok(logs.includes('Full flash erase: enabled'));
});

test('does not reset after write or verification failure', async () => {
    const { flasher, calls, erases, resetCount } = mockConnectedFlasher({ fail: true });

    await assert.rejects(
        flasher.flashFirmware(firmwareFiles(), null, null, { eraseAll: false }),
        /write failed/
    );

    assert.equal(calls.length, 1);
    assert.equal(erases.length, 0);
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
