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

    validateDownloadUrl(value) {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
            throw new Error('Release download URL is not trusted');
        }
        return url.href;
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
    }
};
