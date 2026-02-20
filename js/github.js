/**
 * GitHub API Module
 * Handles interactions with GitHub API for fetching releases and assets
 */

const GitHub = {
    API_BASE: 'https://api.github.com',

    /**
     * Parse GitHub repository string
     * @param {string} repo - Repository string in format "owner/repo"
     * @returns {Object} Object with owner and repo properties
     */
    parseRepo(repo) {
        const parts = repo.trim().split('/');
        if (parts.length !== 2) {
            throw new Error('Invalid repository format. Use: owner/repo');
        }
        return {
            owner: parts[0],
            repo: parts[1]
        };
    },

    /**
     * Fetch all releases from a GitHub repository
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @returns {Promise<Array>} Array of release objects
     */
    async fetchReleases(owner, repo) {
        try {
            const url = `${this.API_BASE}/repos/${owner}/${repo}/releases`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Repository not found');
                }
                if (response.status === 403) {
                    throw new Error('API rate limit exceeded. Please try again later.');
                }
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const releases = await response.json();

            if (releases.length === 0) {
                throw new Error('No releases found in this repository');
            }

            return releases;
        } catch (error) {
            if (error instanceof TypeError) {
                throw new Error('Network error. Please check your connection.');
            }
            throw error;
        }
    },

    /**
     * Fetch release assets for a specific release
     * @param {string} owner - Repository owner
     * @param {string} repo - Repository name
     * @param {number} releaseId - Release ID
     * @returns {Promise<Array>} Array of asset objects
     */
    async fetchReleaseAssets(owner, repo, releaseId) {
        try {
            const url = `${this.API_BASE}/repos/${owner}/${repo}/releases/${releaseId}`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch release assets: ${response.status}`);
            }

            const release = await response.json();
            return release.assets;
        } catch (error) {
            throw new Error(`Failed to fetch release assets: ${error.message}`);
        }
    },

    // CORS proxies for downloading GitHub release assets (which don't support CORS natively)
    CORS_PROXIES: [
        (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
        (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    ],

    /**
     * Download an asset from GitHub via CORS proxy
     * @param {string} downloadUrl - Asset browser_download_url
     * @param {Function} progressCallback - Optional callback for progress updates
     * @returns {Promise<ArrayBuffer>} Asset data as ArrayBuffer
     */
    async downloadAsset(downloadUrl, progressCallback = null) {
        const errors = [];

        for (const proxyFn of this.CORS_PROXIES) {
            const proxyUrl = proxyFn(downloadUrl);
            console.log('Trying download via:', proxyUrl);

            try {
                const response = await fetch(proxyUrl);

                if (!response.ok) {
                    errors.push(`Proxy returned ${response.status}`);
                    continue;
                }

                const contentLength = response.headers.get('content-length');
                const total = parseInt(contentLength, 10);
                let loaded = 0;

                const reader = response.body.getReader();
                const chunks = [];

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    chunks.push(value);
                    loaded += value.length;

                    if (progressCallback && total) {
                        progressCallback(loaded, total);
                    } else if (progressCallback) {
                        progressCallback(loaded, loaded);
                    }
                }

                const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                const result = new Uint8Array(totalLength);
                let offset = 0;

                for (const chunk of chunks) {
                    result.set(chunk, offset);
                    offset += chunk.length;
                }

                console.log(`Download complete: ${totalLength} bytes`);
                return result.buffer;
            } catch (error) {
                console.warn(`Proxy failed: ${error.message}`);
                errors.push(error.message);
                continue;
            }
        }

        throw new Error(`Failed to download asset (all proxies failed: ${errors.join('; ')}). Please upload the zip file directly instead.`);
    },

    /**
     * Find and download firmware zip from release assets
     * @param {Array} assets - Array of release assets
     * @param {Function} progressCallback - Optional callback for progress updates
     * @returns {Promise<ArrayBuffer>} Firmware zip data
     */
    async downloadFirmwareZip(assets, progressCallback = null) {
        // Look for zip files in assets
        const zipAssets = assets.filter(asset =>
            asset.name.toLowerCase().endsWith('.zip')
        );

        if (zipAssets.length === 0) {
            throw new Error('No zip files found in release assets');
        }

        // Prefer files with 'firmware' in the name
        let selectedAsset = zipAssets.find(asset =>
            asset.name.toLowerCase().includes('firmware') ||
            asset.name.toLowerCase().includes('fw')
        );

        // Otherwise, use the first zip file
        if (!selectedAsset) {
            selectedAsset = zipAssets[0];
        }

        console.log(`Downloading: ${selectedAsset.name}`);
        return this.downloadAsset(selectedAsset.browser_download_url, progressCallback);
    }
};
