/**
 * server.js — YT Fetch backend
 * Hosts the frontend AND handles yt-dlp downloads.
 * Deploy to Render — it auto-sets process.env.PORT
 */

const http      = require('http');
const { spawn } = require('child_process');
const fs        = require('fs');
const path      = require('path');

const PORT = process.env.PORT || 3131;

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
};

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, filePath) {
  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'text/plain';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

function buildArgs(url, format, quality) {
  const args = [];
  if (format === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else if (format === 'mp4') {
    const q = quality ? `[height<=${quality}]` : '';
    args.push('-f', `bestvideo${q}[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`);
    args.push('--merge-output-format', 'mp4');
  } else if (format === 'webm') {
    const q = quality ? `[height<=${quality}]` : '';
    args.push('-f', `bestvideo${q}[ext=webm]+bestaudio[ext=webm]/best`);
  } else if (format === 'bestaudio/best') {
    args.push('-f', 'bestaudio/best');
  } else if (format === 'bestvideo/best') {
    const q = quality ? `[height<=${quality}]` : '';
    args.push('-f', `bestvideo${q}`);
  } else {
    const q = quality ? `[height<=${quality}]` : '';
    args.push('-f', q ? `bestvideo${q}+bestaudio/best` : 'bestvideo+bestaudio/best');
  }
  args.push('--progress', '-o', '/tmp/%(title)s.%(ext)s', url);
  return args;
}

const server = http.createServer((req, res) => {
  setCORS(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/ping') {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/download') {
    readBody(req)
      .then(({ url, format = 'bestvideo+bestaudio/best', quality = '' }) => {
        if (!url) { json(res, 400, { error: 'Missing URL' }); return; }
        const args = buildArgs(url, format, quality);
        console.log('▶ yt-dlp', args.join(' '));
        const proc = spawn('yt-dlp', args, { stdio: 'inherit' });
        proc.on('error', e => console.error('Error:', e.message));
        proc.on('close', code => console.log(`Done (exit ${code})`));
        json(res, 200, { ok: true, message: 'Download started in server terminal.' });
      })
      .catch(err => json(res, 400, { error: err.message }));
    return;
  }

  // Serve static files
  const filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  serveStatic(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎬 YT Fetch running on port ${PORT}`);
});
