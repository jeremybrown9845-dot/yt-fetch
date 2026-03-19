/**
 * downloader.js
 * - Starts a download job on the server
 * - Polls for progress and shows a live progress bar + log
 * - When done, automatically triggers a file download to your device
 */

const SERVER = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3131'
  : window.location.origin;

const urlInput    = document.getElementById('urlInput');
const pasteBtn    = document.getElementById('pasteBtn');
const formatSel   = document.getElementById('formatSelect');
const qualitySel  = document.getElementById('qualitySelect');
const downloadBtn = document.getElementById('downloadBtn');
const statusEl    = document.getElementById('status');
const progressWrap= document.getElementById('progressWrap');
const progressFill= document.getElementById('progressFill');
const progressLbl = document.getElementById('progressLabel');
const logBox      = document.getElementById('logBox');

// ── Status ─────────────────────────────────────────────────────────────────────
function setStatus(msg, type = '') {
  statusEl.className = `status ${type}`;
  statusEl.innerHTML = type === 'running'
    ? `<span class="dot"></span>${msg}`
    : msg;
}

// ── Progress bar ───────────────────────────────────────────────────────────────
function showProgress(pct, label) {
  progressWrap.classList.add('visible');
  if (pct === null) {
    progressFill.classList.add('indeterminate');
  } else {
    progressFill.classList.remove('indeterminate');
    progressFill.style.width = pct + '%';
  }
  if (label) progressLbl.textContent = label;
}

function hideProgress() {
  progressWrap.classList.remove('visible');
  progressFill.style.width = '0%';
  progressFill.classList.remove('indeterminate');
}

// ── Log box ────────────────────────────────────────────────────────────────────
function appendLog(lines) {
  if (!lines.length) return;
  logBox.classList.add('visible');
  lines.forEach(line => {
    const div = document.createElement('div');
    if (line.startsWith('ERR')) {
      div.className = 'line-err';
    } else if (line.includes('%')) {
      div.className = 'line-pct';
    } else {
      div.className = 'line-ok';
    }
    div.textContent = line;
    logBox.appendChild(div);
  });
  logBox.scrollTop = logBox.scrollHeight;
}

function clearLog() {
  logBox.innerHTML = '';
  logBox.classList.remove('visible');
}

// ── Parse % from yt-dlp output ─────────────────────────────────────────────────
function parsePct(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/(\d+\.?\d*)%/);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

function parseLabel(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('%')) return lines[i].trim().replace(/\s+/g, ' ');
  }
  return null;
}

// ── Paste ──────────────────────────────────────────────────────────────────────
pasteBtn.addEventListener('click', async () => {
  try {
    urlInput.value = (await navigator.clipboard.readText()).trim();
  } catch {
    setStatus('⚠ Clipboard access denied — paste manually.', 'error');
  }
});

// ── Validate ───────────────────────────────────────────────────────────────────
function isValidYouTubeUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.includes('youtube.com') || u.hostname === 'youtu.be';
  } catch { return false; }
}

// ── Poll job until done, then trigger download ─────────────────────────────────
async function pollJob(jobId) {
  let seenLines = 0;

  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const res  = await fetch(`${SERVER}/status?jobId=${jobId}&from=${seenLines}`);
        const data = await res.json();

        if (data.lines && data.lines.length) {
          appendLog(data.lines);
          const allSeen = [...Array(seenLines).fill(''), ...data.lines];
          const pct   = parsePct(data.lines);
          const label = parseLabel(data.lines);
          if (pct !== null) showProgress(pct, label || `Downloading… ${pct}%`);
          seenLines += data.lines.length;
        }

        if (data.done) {
          clearInterval(interval);
          if (data.error) {
            reject(new Error(data.error));
          } else {
            resolve();
          }
        }
      } catch (err) {
        clearInterval(interval);
        reject(err);
      }
    }, 1000); // poll every second
  });
}

// ── Trigger browser file download ──────────────────────────────────────────────
function triggerFileDownload(jobId) {
  // Creates a hidden <a> and clicks it — browser saves to Downloads folder automatically
  const a = document.createElement('a');
  a.href = `${SERVER}/file?jobId=${jobId}`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Main download flow ─────────────────────────────────────────────────────────
downloadBtn.addEventListener('click', async () => {
  const url     = urlInput.value.trim();
  const format  = formatSel.value;
  const quality = qualitySel.value;

  if (!url) { setStatus('⚠ Please enter a YouTube URL.', 'error'); return; }
  if (!isValidYouTubeUrl(url)) { setStatus('⚠ Not a valid YouTube URL.', 'error'); return; }

  downloadBtn.disabled = true;
  clearLog();
  showProgress(null, 'Connecting to server…');
  setStatus('Starting download…', 'running');

  try {
    // 1. Start the job
    const startRes = await fetch(`${SERVER}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format, quality }),
    });
    const startData = await startRes.json();
    if (!startRes.ok) throw new Error(startData.error || 'Failed to start');

    const { jobId } = startData;
    setStatus('Downloading on server…', 'running');

    // 2. Poll for progress
    await pollJob(jobId);

    // 3. Done — trigger file to browser
    showProgress(100, '✓ Complete — saving to your Downloads folder…');
    setStatus('✓ Done! Your file is downloading now.', 'success');
    triggerFileDownload(jobId);

  } catch (err) {
    hideProgress();
    setStatus(`✗ ${err.message}`, 'error');
  } finally {
    downloadBtn.disabled = false;
  }
});

// ── Ping on load ───────────────────────────────────────────────────────────────
(async () => {
  try {
    const res = await fetch(`${SERVER}/ping`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    if (data.ok) setStatus('✓ Server ready.', 'success');
  } catch {
    setStatus('⚠ Server not reachable.', 'error');
  }
})();
