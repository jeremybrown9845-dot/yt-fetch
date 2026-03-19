/**
 * downloader.js
 * Auto-detects whether running locally or on Render.
 * No configuration needed — just works.
 */

// If hosted on Render, use the same origin. Locally, use localhost:3131.
const SERVER = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3131'
  : window.location.origin;

const urlInput   = document.getElementById('urlInput');
const pasteBtn   = document.getElementById('pasteBtn');
const formatSel  = document.getElementById('formatSelect');
const qualitySel = document.getElementById('qualitySelect');
const downloadBtn= document.getElementById('downloadBtn');
const statusEl   = document.getElementById('status');

// ── Status ─────────────────────────────────────────────────────────────────────
function setStatus(msg, type = '') {
  statusEl.className = `status ${type}`;
  statusEl.innerHTML = type === 'running'
    ? `<span class="dot"></span>${msg}`
    : msg;
}

// ── Paste button ───────────────────────────────────────────────────────────────
pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    urlInput.value = text.trim();
  } catch {
    setStatus('⚠ Clipboard access denied — paste manually.', 'error');
  }
});

// ── Validate URL ───────────────────────────────────────────────────────────────
function isValidYouTubeUrl(url) {
  try {
    const u = new URL(url);
    return (
      u.hostname.includes('youtube.com') ||
      u.hostname === 'youtu.be'
    );
  } catch {
    return false;
  }
}

// ── Download ───────────────────────────────────────────────────────────────────
downloadBtn.addEventListener('click', async () => {
  const url     = urlInput.value.trim();
  const format  = formatSel.value;
  const quality = qualitySel.value;

  if (!url) {
    setStatus('⚠ Please enter a YouTube URL.', 'error');
    return;
  }
  if (!isValidYouTubeUrl(url)) {
    setStatus('⚠ That doesn\'t look like a valid YouTube URL.', 'error');
    return;
  }

  downloadBtn.disabled = true;
  setStatus('Sending to server…', 'running');

  try {
    const res = await fetch(`${SERVER}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format, quality }),
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

    setStatus('✓ Download started! Check your Render logs for progress.', 'success');
  } catch (err) {
    if (err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('failed')) {
      setStatus('✗ Could not reach the server. Is it running?', 'error');
    } else {
      setStatus(`✗ ${err.message}`, 'error');
    }
  } finally {
    downloadBtn.disabled = false;
  }
});

// ── Ping server on load ────────────────────────────────────────────────────────
(async () => {
  try {
    const res = await fetch(`${SERVER}/ping`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    if (data.ok) setStatus('✓ Server connected and ready.', 'success');
  } catch {
    setStatus('⚠ Server not reachable. Make sure it is running.', 'error');
  }
})();
