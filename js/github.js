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

    /**
     * Download an asset from GitHub using the API
     * @param {string} assetApiUrl - Asset API URL (from asset.url)
     * @param {Function} progressCallback - Optional callback for progress updates
     * @returns {Promise<ArrayBuffer>} Asset data as ArrayBuffer
     */
    async downloadAsset(assetApiUrl, progressCallback = null) {
        try {
            console.log('Downloading via GitHub API:', assetApiUrl);

            const response = await fetch(assetApiUrl, {
                headers: {
                    'Accept': 'application/octet-stream'
                }
            });

            if (!response.ok) {
                throw new Error(`Download failed with status ${response.status}.`);
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
                    // If no content-length, just report loaded bytes
                    progressCallback(loaded, loaded);
                }
            }

            // Combine chunks into single ArrayBuffer
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
            throw new Error(`Failed to download asset: ${error.message}. If the file is large, consider uploading the zip file directly instead.`);
        }
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
        // Use the API URL with Accept: application/octet-stream (supports CORS)
        return this.downloadAsset(selectedAsset.url, progressCallback);
    }
};
