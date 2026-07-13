if (!('serial' in navigator)) {
    document.getElementById('browser-warning').classList.remove('hidden');
} else {
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    if (/mac/i.test(platform)) {
        document.getElementById('driver-notice').classList.remove('hidden');
    }
}
