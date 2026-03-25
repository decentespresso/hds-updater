/**
 * Main Application Module
 * Handles UI interactions and coordinates between modules
 */

const App = {
    // GitHub repo config
    REPO_OWNER: 'decentespresso',
    REPO_NAME: 'openscale',

    // Application state
    state: {
        firmwareFiles: null,
        connected: false,
        flashing: false,
        customOffsets: {},
        advancedMode: false,
        releases: [],
        selectedRelease: null
    },

    // Initialize application
    init() {
        this.cacheElements();
        this.attachEventListeners();
        this.updateUI();
        this.loadReleases();
    },

    // Cache DOM elements
    cacheElements() {
        this.elements = {
            // Firmware
            versionSelect: document.getElementById('version-select'),
            assetSelect: document.getElementById('asset-select'),
            assetGroup: document.getElementById('asset-group'),
            downloadBtn: document.getElementById('download-btn'),
            downloadStatus: document.getElementById('download-status'),

            // Upload element
            zipUpload: document.getElementById('zip-upload'),

            // Device connection
            connectBtn: document.getElementById('connect-btn'),
            disconnectBtn: document.getElementById('disconnect-btn'),
            deviceInfo: document.getElementById('device-info'),
            chipType: document.getElementById('chip-type'),
            macAddress: document.getElementById('mac-address'),
            flashSize: document.getElementById('flash-size'),

            // Flash controls
            flashBtn: document.getElementById('flash-btn'),
            progressContainer: document.getElementById('progress-container'),
            progressFill: document.getElementById('progress-fill'),
            console: document.getElementById('console'),

            // Advanced options
            eraseFlashCheckbox: document.getElementById('erase-flash-checkbox'),
            advancedModeCheckbox: document.getElementById('advanced-mode-checkbox'),
            offsetEditorPanel: document.getElementById('offset-editor-panel'),
            offsetTableContainer: document.getElementById('offset-table-container'),
            resetAllOffsetsBtn: document.getElementById('reset-all-offsets-btn')
        };
    },

    // Attach event listeners
    attachEventListeners() {
        // GitHub release selection
        this.elements.versionSelect.addEventListener('change', (e) => this.onVersionSelect(e));
        this.elements.downloadBtn.addEventListener('click', () => this.onDownloadFirmware());

        // Upload
        this.elements.zipUpload.addEventListener('change', (e) => this.onZipUpload(e));

        // Device connection
        this.elements.connectBtn.addEventListener('click', () => this.onConnect());
        this.elements.disconnectBtn.addEventListener('click', () => this.onDisconnect());

        // Flash
        this.elements.flashBtn.addEventListener('click', () => this.onFlash());

        // Advanced options
        this.elements.advancedModeCheckbox.addEventListener('change', (e) => this.onAdvancedModeToggle(e));
        this.elements.resetAllOffsetsBtn.addEventListener('click', () => this.onResetAllOffsets());
    },

    // Update UI based on state
    updateUI() {
        // Update connection buttons
        this.elements.connectBtn.disabled = this.state.connected;
        this.elements.disconnectBtn.disabled = !this.state.connected;

        // Update flash button
        this.elements.flashBtn.disabled = !this.state.connected ||
                                           !this.state.firmwareFiles ||
                                           this.state.flashing;
    },

    // Load releases from GitHub
    async loadReleases() {
        try {
            const releases = await GitHub.fetchReleases(this.REPO_OWNER, this.REPO_NAME);

            // Filter to releases that have at least one .zip asset
            this.state.releases = releases.filter(r =>
                r.assets && r.assets.some(a => a.name.toLowerCase().endsWith('.zip'))
            );

            this.populateVersionDropdown();
        } catch (error) {
            this.elements.versionSelect.innerHTML = '<option value="">Failed to load releases</option>';
            this.setDownloadStatus(error.message, 'error');
        }
    },

    // Populate the version dropdown
    populateVersionDropdown() {
        const select = this.elements.versionSelect;
        select.innerHTML = '<option value="">-- Select version --</option>';

        for (const release of this.state.releases) {
            const option = document.createElement('option');
            option.value = release.id;
            const label = release.name || release.tag_name;
            const badge = release.prerelease ? ' (pre-release)' : '';
            option.textContent = label + badge;
            select.appendChild(option);
        }

        select.disabled = false;
    },

    // Handle version selection
    onVersionSelect(e) {
        const releaseId = parseInt(e.target.value);
        this.state.selectedRelease = this.state.releases.find(r => r.id === releaseId) || null;
        this.setDownloadStatus('');

        if (!this.state.selectedRelease) {
            this.elements.assetGroup.style.display = 'none';
            this.elements.downloadBtn.disabled = true;
            return;
        }

        // Get zip assets for this release
        const zipAssets = this.state.selectedRelease.assets.filter(a =>
            a.name.toLowerCase().endsWith('.zip')
        );

        if (zipAssets.length > 1) {
            // Multiple zips (PCB variants) — show asset picker
            this.elements.assetGroup.style.display = '';
            const assetSelect = this.elements.assetSelect;
            assetSelect.innerHTML = '';
            for (const asset of zipAssets) {
                const option = document.createElement('option');
                option.value = asset.browser_download_url;
                // Make display name friendlier: extract PCB variant if present
                option.textContent = asset.name;
                assetSelect.appendChild(option);
            }
        } else {
            this.elements.assetGroup.style.display = 'none';
        }

        this.elements.downloadBtn.disabled = false;
    },

    // Get the selected asset download URL
    getSelectedAssetUrl() {
        if (!this.state.selectedRelease) return null;

        const zipAssets = this.state.selectedRelease.assets.filter(a =>
            a.name.toLowerCase().endsWith('.zip')
        );

        if (zipAssets.length > 1) {
            return this.elements.assetSelect.value;
        }

        return zipAssets[0]?.browser_download_url || null;
    },

    // Trigger a native browser download for the selected firmware asset
    onDownloadFirmware() {
        const url = this.getSelectedAssetUrl();
        if (!url) return;

        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.click();
    },

    // Set download status message
    setDownloadStatus(message, type) {
        const el = this.elements.downloadStatus;
        el.innerHTML = message;
        el.className = 'download-status' + (type ? ` ${type}` : '');
    },

    // Handle zip upload
    async onZipUpload(e) {
        const file = e.target.files[0];
        if (!file) {
            this.state.firmwareFiles = null;
            this.setDownloadStatus('');
            this.updateUI();
            return;
        }

        try {
            this.setDownloadStatus('Extracting firmware...', '');

            const files = await FileHandler.extractZipFile(file);
            const validation = FileHandler.validateFirmwareFiles(files);

            if (!validation.isValid) {
                throw new Error(validation.message);
            }

            this.state.firmwareFiles = files;
            this.setDownloadStatus(validation.message, 'success');
            this.updateUI();

            // Re-render offset table if advanced mode is active
            if (this.state.advancedMode) {
                this.renderOffsetTable();
            }
        } catch (error) {
            this.setDownloadStatus(error.message, 'error');
            this.state.firmwareFiles = null;
            this.updateUI();
        }
    },

    // Handle device connection
    async onConnect() {
        try {
            this.log('Connecting to device...', 'info');
            this.clearConsole();
            this.showConsole();

            const deviceInfo = await Flasher.connectDevice();

            this.state.connected = true;

            // Update device info display
            this.elements.chipType.textContent = deviceInfo.type;
            this.elements.macAddress.textContent = deviceInfo.macAddress;
            this.elements.flashSize.textContent = 'Auto-detect';
            this.elements.deviceInfo.classList.remove('hidden');

            this.log(`Connected to ${deviceInfo.type}`, 'success');
            this.log(`MAC Address: ${deviceInfo.macAddress}`, 'info');

            this.updateUI();
        } catch (error) {
            this.log(error.message, 'error');
            this.state.connected = false;
            this.updateUI();
        }
    },

    // Handle device disconnection
    async onDisconnect() {
        try {
            this.log('Disconnecting...', 'info');
            await Flasher.disconnectDevice();

            this.state.connected = false;
            this.elements.deviceInfo.classList.add('hidden');

            this.log('Disconnected', 'success');
            this.updateUI();
        } catch (error) {
            this.log(error.message, 'error');
        }
    },

    // Handle flash operation
    async onFlash() {
        if (!this.state.firmwareFiles) {
            this.log('No firmware files loaded', 'error');
            return;
        }

        if (!this.state.connected) {
            this.log('Device not connected', 'error');
            return;
        }

        // Validate custom offsets if advanced mode is enabled
        if (this.state.advancedMode && Object.keys(this.state.customOffsets).length > 0) {
            let hasErrors = false;
            for (const [filename, offset] of Object.entries(this.state.customOffsets)) {
                const validation = this.validateOffset(filename, `0x${offset.toString(16)}`);
                if (!validation.isValid) {
                    this.log(`Invalid custom offset for ${filename}: ${validation.message}`, 'error');
                    hasErrors = true;
                }
            }
            if (hasErrors) {
                return;
            }
        }

        try {
            this.state.flashing = true;
            this.updateUI();
            this.clearConsole();
            this.showConsole();
            this.showProgress();

            this.log('Preparing firmware files...', 'info');

            // Prepare files for flashing (with or without custom offsets)
            let preparedFiles;
            if (this.state.advancedMode && Object.keys(this.state.customOffsets).length > 0) {
                preparedFiles = FileHandler.prepareFirmwareFilesWithCustomOffsets(
                    this.state.firmwareFiles,
                    this.state.customOffsets
                );
                this.log('Using custom flash offsets', 'info');
            } else {
                preparedFiles = FileHandler.prepareFirmwareFiles(this.state.firmwareFiles);
            }

            this.log(`Prepared ${preparedFiles.length} file(s) for flashing`, 'info');

            // Flash firmware
            const eraseAll = this.elements.eraseFlashCheckbox.checked;
            if (eraseAll) {
                this.log('Erasing entire flash before writing...', 'info');
            }
            await Flasher.flashFirmware(
                preparedFiles,
                (progress, info) => this.updateProgress(progress, info),
                (message, type) => this.log(message, type),
                { eraseAll }
            );

            this.log('Flashing completed successfully!', 'success');
        } catch (error) {
            this.log(`Flashing failed: ${error.message}`, 'error');
        } finally {
            this.state.flashing = false;
            this.updateUI();
        }
    },

    // Update progress bar
    updateProgress(percent, info) {
        const progress = Math.min(100, Math.max(0, percent));
        this.elements.progressFill.style.transform = `scaleX(${progress / 100})`;
        this.elements.progressFill.textContent = `${progress.toFixed(0)}%`;

        if (info && info.currentFileName) {
            this.elements.progressFill.textContent =
                `${info.currentFile}/${info.totalFiles}: ${info.currentFileName} (${progress.toFixed(0)}%)`;
        }
    },

    // Show progress bar
    showProgress() {
        this.elements.progressContainer.classList.remove('hidden');
        this.updateProgress(0);
    },

    // Show console
    showConsole() {
        this.elements.console.classList.remove('hidden');
    },

    // Clear console
    clearConsole() {
        this.elements.console.innerHTML = '';
    },

    // Log message to console
    log(message, type = 'info') {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        this.elements.console.appendChild(line);
        this.elements.console.scrollTop = this.elements.console.scrollHeight;
    },

    // Handle advanced mode toggle
    onAdvancedModeToggle(e) {
        this.state.advancedMode = e.target.checked;

        if (this.state.advancedMode) {
            this.elements.offsetEditorPanel.classList.add('visible');
            this.renderOffsetTable();
        } else {
            this.elements.offsetEditorPanel.classList.remove('visible');
        }
    },

    // Render offset table
    renderOffsetTable() {
        const container = this.elements.offsetTableContainer;

        // No files loaded state
        if (!this.state.firmwareFiles || Object.keys(this.state.firmwareFiles).length === 0) {
            container.innerHTML = '<div class="no-files-message">No firmware files loaded. Upload a firmware zip file first.</div>';
            return;
        }

        // Generate table HTML
        let tableHTML = `
            <table class="offset-table">
                <thead>
                    <tr>
                        <th>Filename</th>
                        <th>Auto-Detected</th>
                        <th>Custom Offset</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const [filename, data] of Object.entries(this.state.firmwareFiles)) {
            const autoOffset = FileHandler.getFlashOffset(filename);
            const customOffset = this.state.customOffsets[filename];
            const displayValue = customOffset !== undefined ? `0x${customOffset.toString(16).toUpperCase()}` : '';

            tableHTML += `
                <tr>
                    <td>${filename}</td>
                    <td>0x${autoOffset.toString(16).toUpperCase()}</td>
                    <td>
                        <input
                            type="text"
                            class="offset-input"
                            data-filename="${filename}"
                            value="${displayValue}"
                            placeholder="0x${autoOffset.toString(16).toUpperCase()}"
                        />
                        <div class="validation-message" data-filename="${filename}"></div>
                    </td>
                    <td>
                        <button class="button secondary reset-btn" data-filename="${filename}">Reset</button>
                    </td>
                </tr>
            `;
        }

        tableHTML += `
                </tbody>
            </table>
        `;

        container.innerHTML = tableHTML;

        // Attach event listeners to inputs and reset buttons
        container.querySelectorAll('.offset-input').forEach(input => {
            input.addEventListener('input', (e) => this.onOffsetInput(e));
            input.addEventListener('blur', (e) => this.onOffsetBlur(e));
        });

        container.querySelectorAll('.reset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.onResetOffset(e));
        });
    },

    // Validate offset value
    validateOffset(filename, value) {
        // Empty value is valid (uses auto-detect)
        if (!value || value.trim() === '') {
            return { isValid: true, type: 'none', message: '' };
        }

        // Check format (must be hex with 0x prefix)
        const hexPattern = /^0x[0-9A-Fa-f]+$/;
        if (!hexPattern.test(value)) {
            return {
                isValid: false,
                type: 'error',
                message: 'Invalid format. Use hex with 0x prefix (e.g., 0x10000)'
            };
        }

        // Parse value
        const offset = parseInt(value, 16);

        // Check range (0x0 to 0x400000 = 4MB)
        if (offset < 0x0 || offset > 0x400000) {
            return {
                isValid: false,
                type: 'error',
                message: 'Offset out of range (0x0 to 0x400000)'
            };
        }

        // Check for duplicates
        for (const [fn, customOffset] of Object.entries(this.state.customOffsets)) {
            if (fn !== filename && customOffset === offset) {
                return {
                    isValid: false,
                    type: 'error',
                    message: `Duplicate offset (conflicts with ${fn})`
                };
            }
        }

        // Check alignment (warn if not 0x1000 aligned)
        if (offset % 0x1000 !== 0) {
            return {
                isValid: true,
                type: 'warning',
                message: 'Warning: Not aligned to 4KB sector (0x1000)'
            };
        }

        return { isValid: true, type: 'success', message: '' };
    },

    // Handle offset input (real-time validation)
    onOffsetInput(e) {
        const input = e.target;
        const filename = input.dataset.filename;
        const value = input.value.trim();
        const validation = this.validateOffset(filename, value);

        // Update input styling
        input.classList.remove('valid', 'error', 'warning');
        if (validation.type === 'success') {
            input.classList.add('valid');
        } else if (validation.type === 'error') {
            input.classList.add('error');
        } else if (validation.type === 'warning') {
            input.classList.add('warning');
        }

        // Update validation message
        const messageEl = document.querySelector(`.validation-message[data-filename="${filename}"]`);
        if (messageEl) {
            messageEl.textContent = validation.message;
            messageEl.className = `validation-message ${validation.type}`;
        }
    },

    // Handle offset blur (commit value)
    onOffsetBlur(e) {
        const input = e.target;
        const filename = input.dataset.filename;
        const value = input.value.trim();
        const validation = this.validateOffset(filename, value);

        if (value === '') {
            // Clear custom offset
            delete this.state.customOffsets[filename];
        } else if (validation.isValid) {
            // Commit valid value
            const offset = parseInt(value, 16);
            this.state.customOffsets[filename] = offset;
        }
    },

    // Handle reset offset button
    onResetOffset(e) {
        const filename = e.target.dataset.filename;
        delete this.state.customOffsets[filename];
        this.renderOffsetTable();
    },

    // Handle reset all offsets button
    onResetAllOffsets() {
        this.state.customOffsets = {};
        this.renderOffsetTable();
    }
};

// Initialize app when DOM is loaded AND esptool is ready
const initApp = () => {
    if (window.esptooljs) {
        console.log('Initializing app with esptool-js ready');
        App.init();
    } else {
        console.log('Waiting for esptool-js to load...');
        setTimeout(initApp, 100);
    }
};

document.addEventListener('DOMContentLoaded', initApp);
