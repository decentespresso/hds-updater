(() => {
    const storageKey = 'hds-custom-build-theme-v1';
    const root = document.documentElement;
    const systemTheme = matchMedia('(prefers-color-scheme: dark)');
    let preference = 'system';

    try {
        const stored = JSON.parse(localStorage.getItem(storageKey));
        if (stored?.version === 1 && ['system', 'light', 'dark'].includes(stored.preference)) {
            preference = stored.preference;
        }
    } catch {
    }

    const applyTheme = () => {
        const dark = preference === 'dark' || preference === 'system' && systemTheme.matches;
        root.dataset.themePreference = preference;
        root.dataset.theme = dark ? 'dark' : 'light';
        document.querySelector('#theme-color').content = dark ? '#111413' : '#0d6b4f';
        const toggle = document.querySelector('#theme-toggle');
        if (toggle) {
            const current = preference === 'system' ? 'System' : dark ? 'Dark' : 'Light';
            const label = `${current} theme; switch to ${dark ? 'light' : 'dark'} theme`;
            toggle.setAttribute('aria-pressed', String(dark));
            toggle.setAttribute('aria-label', label);
            toggle.title = label;
        }
    };

    applyTheme();
    systemTheme.addEventListener('change', () => {
        if (preference === 'system') applyTheme();
    });
    document.addEventListener('DOMContentLoaded', () => {
        applyTheme();
        document.querySelector('#theme-toggle').addEventListener('click', () => {
            preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
            applyTheme();
            try {
                localStorage.setItem(storageKey, JSON.stringify({ version: 1, preference }));
            } catch {
            }
        });
    });
})();
