const App = {
    REPO_OWNER: 'decentespresso',
    REPO_NAME: 'openscale',
    state: {
        firmwareFiles: null,
        connected: false,
        flashing: false,
        targetConfirmed: false,
        releases: [],
        selectedRelease: null
    },

    init() {
        this.cacheElements();
        this.attachEventListeners();
        this.updateUI();
        this.loadReleases();
    },

    cacheElements() {
        const ids = [
            'version-select', 'asset-select', 'asset-group', 'download-btn', 'download-status', 'zip-upload',
            'connect-btn', 'disconnect-btn', 'device-info', 'chip-type', 'mac-address', 'flash-size',
            'target-confirmation-group', 'target-confirmation',
            'flash-btn', 'progress-container', 'progress-fill', 'console', 'erase-flash-checkbox'
        ];
        this.elements = Object.fromEntries(ids.map(id => [id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
            document.getElementById(id)]));
    },

    attachEventListeners() {
        this.elements.versionSelect.addEventListener('change', event => this.onVersionSelect(event));
        this.elements.downloadBtn.addEventListener('click', () => this.onDownloadFirmware());
        this.elements.zipUpload.addEventListener('change', event => this.onZipUpload(event));
        this.elements.connectBtn.addEventListener('click', () => this.onConnect());
        this.elements.disconnectBtn.addEventListener('click', () => this.onDisconnect());
        this.elements.flashBtn.addEventListener('click', () => this.onFlash());
        navigator.serial?.addEventListener('disconnect', () => this.handlePortDisconnect());
        this.elements.targetConfirmation.addEventListener('input', event => {
            this.state.targetConfirmed = event.target.value === 'FLASH HDS';
            this.updateUI();
        });
    },

    updateUI() {
        this.elements.connectBtn.disabled = this.state.connected;
        this.elements.disconnectBtn.disabled = !this.state.connected;
        this.elements.flashBtn.disabled = !this.state.connected || !this.state.targetConfirmed ||
            !this.state.firmwareFiles || this.state.flashing;
    },

    clearTargetConfirmation() {
        this.state.targetConfirmed = false;
        this.elements.targetConfirmation.value = '';
        this.elements.targetConfirmationGroup.classList.add('hidden');
    },

    handlePortDisconnect() {
        this.state.connected = false;
        this.clearTargetConfirmation();
        this.elements.deviceInfo.classList.add('hidden');
        this.updateUI();
    },

    option(value, label) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    },

    async loadReleases() {
        try {
            const releases = await GitHub.fetchReleases(this.REPO_OWNER, this.REPO_NAME);
            this.state.releases = releases.filter(release =>
                release.assets?.some(asset => asset.name.toLowerCase().endsWith('.zip')));
            this.populateVersionDropdown();
        } catch (error) {
            this.elements.versionSelect.replaceChildren(this.option('', 'Failed to load releases'));
            this.setDownloadStatus(error.message, 'error');
        }
    },

    populateVersionDropdown() {
        const options = [this.option('', '-- Select version --')];
        for (const release of this.state.releases) {
            const label = `${release.name || release.tag_name}${release.prerelease ? ' (pre-release)' : ''}`;
            options.push(this.option(String(release.id), label));
        }
        this.elements.versionSelect.replaceChildren(...options);
        this.elements.versionSelect.disabled = false;
    },

    onVersionSelect(event) {
        const releaseId = Number.parseInt(event.target.value, 10);
        this.state.selectedRelease = this.state.releases.find(release => release.id === releaseId) || null;
        this.setDownloadStatus('');

        if (!this.state.selectedRelease) {
            this.elements.assetGroup.hidden = true;
            this.elements.downloadBtn.disabled = true;
            return;
        }

        const assets = this.selectedZipAssets();
        this.elements.assetGroup.hidden = assets.length <= 1;
        this.elements.assetSelect.replaceChildren(...assets.map(asset =>
            this.option(asset.browser_download_url, asset.name)));
        this.elements.downloadBtn.disabled = false;
    },

    selectedZipAssets() {
        return this.state.selectedRelease?.assets.filter(asset => asset.name.toLowerCase().endsWith('.zip')) || [];
    },

    getSelectedAssetUrl() {
        const assets = this.selectedZipAssets();
        return assets.length > 1 ? this.elements.assetSelect.value : assets[0]?.browser_download_url || null;
    },

    onDownloadFirmware() {
        const url = this.getSelectedAssetUrl();
        if (!url) {
            return;
        }
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.click();
    },

    setDownloadStatus(message, type) {
        this.elements.downloadStatus.textContent = message;
        this.elements.downloadStatus.className = `download-status${type ? ` ${type}` : ''}`;
    },

    async onZipUpload(event) {
        const file = event.target.files[0];
        if (!file) {
            this.state.firmwareFiles = null;
            this.setDownloadStatus('');
            this.updateUI();
            return;
        }

        try {
            this.setDownloadStatus('Validating firmware...', '');
            const files = await FileHandler.extractZipFile(file);
            const validation = FileHandler.validateFirmwareFiles(files);
            if (!validation.isValid) {
                throw new Error(validation.message);
            }
            this.state.firmwareFiles = files;
            this.setDownloadStatus(validation.message, 'success');
        } catch (error) {
            this.state.firmwareFiles = null;
            this.setDownloadStatus(error.message, 'error');
        }
        this.updateUI();
    },

    async onConnect() {
        this.clearTargetConfirmation();
        this.clearConsole();
        this.showConsole();
        this.log('Connecting to device...');
        try {
            const deviceInfo = await Flasher.connectDevice();
            this.state.connected = true;
            this.elements.chipType.textContent = deviceInfo.type;
            this.elements.macAddress.textContent = deviceInfo.macAddress;
            this.elements.flashSize.textContent = deviceInfo.flashSizeLabel || 'Unknown';
            this.elements.deviceInfo.classList.remove('hidden');
            this.elements.targetConfirmationGroup.classList.remove('hidden');
            this.log(`Connected to ${deviceInfo.type}`, 'success');
            this.log(`MAC Address: ${deviceInfo.macAddress}`);
        } catch (error) {
            this.state.connected = false;
            this.clearTargetConfirmation();
            this.log(error.message, 'error');
        }
        this.updateUI();
    },

    async onDisconnect() {
        this.log('Disconnecting...');
        try {
            await Flasher.disconnectDevice();
            this.log('Disconnected', 'success');
        } catch (error) {
            this.log(error.message, 'error');
        }
        this.state.connected = false;
        this.clearTargetConfirmation();
        this.elements.deviceInfo.classList.add('hidden');
        this.updateUI();
    },

    async onFlash() {
        if (!this.state.firmwareFiles || !this.state.connected) {
            this.log('Firmware and a connected device are required', 'error');
            return;
        }

        this.state.flashing = true;
        this.updateUI();
        this.clearConsole();
        this.showConsole();
        this.showProgress();
        try {
            const files = FileHandler.prepareFirmwareFiles(this.state.firmwareFiles);
            const eraseAll = this.elements.eraseFlashCheckbox.checked;
            await Flasher.flashFirmware(
                files,
                (progress, info) => this.updateProgress(progress, info),
                (message, type) => this.log(message, type),
                { eraseAll }
            );
            this.log('Flashing completed successfully!', 'success');
        } catch (error) {
            this.log(`Flashing failed: ${error.message}`, 'error');
        } finally {
            this.state.flashing = false;
            await Flasher.disconnectDevice();
            this.state.connected = false;
            this.clearTargetConfirmation();
            this.elements.deviceInfo.classList.add('hidden');
            this.updateUI();
        }
    },

    updateProgress(percent, info) {
        const progress = Math.min(100, Math.max(0, percent));
        this.elements.progressFill.style.transform = `scaleX(${progress / 100})`;
        this.elements.progressFill.textContent = info?.currentFileName ?
            `${info.currentFile}/${info.totalFiles}: ${info.currentFileName} (${progress.toFixed(0)}%)` :
            `${progress.toFixed(0)}%`;
    },

    showProgress() {
        this.elements.progressContainer.classList.remove('hidden');
        this.updateProgress(0);
    },

    showConsole() {
        this.elements.console.classList.remove('hidden');
    },

    clearConsole() {
        this.elements.console.replaceChildren();
    },

    log(message, type = 'info') {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        this.elements.console.appendChild(line);
        this.elements.console.scrollTop = this.elements.console.scrollHeight;
    }
};

const initApp = () => {
    if (window.esptooljs && window.zipjs && window.SparkMD5) {
        App.init();
    } else {
        setTimeout(initApp, 100);
    }
};

document.addEventListener('DOMContentLoaded', initApp);
