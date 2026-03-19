/**
 * server.js — YT Fetch
 * - Streams yt-dlp progress back to browser via SSE
 * - Serves the finished file as a browser download automatically
 */

const http      = require('http');
const { spawn, execSync } = require('child_process');
const fs        = require('fs');
const path      = require('path');
const { URL }   = require('url');
const os        = require('os');

// Use cookies.txt from project folder if it exists
const COOKIE_FILE = path.join(__dirname, 'cookies.txt');
if (fs.existsSync(COOKIE_FILE)) {
  console.log('✓ cookies.txt found — YouTube bot detection bypassed');
} else {
  console.warn('⚠ No cookies.txt found — some videos may fail');
}


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

function buildArgs(outputPath, format, quality) {
  const args = ['--newline', '--no-playlist', '--extractor-args', 'youtube:player_client=tv_embedded,web'];

  // Use cookies.txt if present
  if (fs.existsSync(COOKIE_FILE)) {
    args.push('--cookies', COOKIE_FILE);
  }

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

  args.push('-o', outputPath);
  return args;
}

// Active jobs: jobId -> { done, error, file, progress }
const jobs = new Map();

function makeJobId() {
  return Math.random().toString(36).slice(2, 10);
}

const server = http.createServer((req, res) => {
  setCORS(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const reqUrl = new URL(req.url, `http://localhost`);

  // ── Health check ───────────────────────────────────────────────────────────
  if (req.method === 'GET' && reqUrl.pathname === '/ping') {
    json(res, 200, { ok: true });
    return;
  }

  // ── Start download job ─────────────────────────────────────────────────────
  if (req.method === 'POST' && reqUrl.pathname === '/download') {
    readBody(req)
      .then(({ url, format = 'bestvideo+bestaudio/best', quality = '' }) => {
        if (!url) { json(res, 400, { error: 'Missing URL' }); return; }

        const jobId    = makeJobId();
        const tmpDir   = os.tmpdir();
        const outPath  = path.join(tmpDir, `ytfetch_${jobId}_%(title)s.%(ext)s`);

        const job = { done: false, error: null, filePath: null, lines: [] };
        jobs.set(jobId, job);

        const args = buildArgs(outPath, format, quality);
        args.push(url);

        console.log(`[${jobId}] yt-dlp`, args.join(' '));

        const proc = spawn('yt-dlp', args);

        proc.stdout.on('data', chunk => {
          const lines = chunk.toString().split('\n').filter(Boolean);
          lines.forEach(line => {
            console.log(`[${jobId}]`, line);
            job.lines.push(line);
          });
        });

        proc.stderr.on('data', chunk => {
          const lines = chunk.toString().split('\n').filter(Boolean);
          lines.forEach(line => {
            console.error(`[${jobId}] ERR:`, line);
            job.lines.push('ERR: ' + line);
          });
        });

        proc.on('close', code => {
          if (code === 0) {
            // Find the output file (yt-dlp resolves the template)
            try {
              const files = fs.readdirSync(tmpDir)
                .filter(f => f.startsWith(`ytfetch_${jobId}_`))
                .map(f => path.join(tmpDir, f));
              job.filePath = files[0] || null;
            } catch {}
            job.done  = true;
            console.log(`[${jobId}] ✓ Done:`, job.filePath);
          } else {
            job.done  = true;
            job.error = `yt-dlp exited with code ${code}`;
            console.error(`[${jobId}] ✗ Failed`);
          }
        });

        proc.on('error', err => {
          job.done  = true;
          job.error = err.message;
        });

        json(res, 200, { ok: true, jobId });
      })
      .catch(err => json(res, 400, { error: err.message }));
    return;
  }

  // ── Poll job status ────────────────────────────────────────────────────────
  if (req.method === 'GET' && reqUrl.pathname === '/status') {
    const jobId = reqUrl.searchParams.get('jobId');
    const job   = jobs.get(jobId);
    if (!job) { json(res, 404, { error: 'Job not found' }); return; }

    const lastN  = parseInt(reqUrl.searchParams.get('from') || '0', 10);
    const newLines = job.lines.slice(lastN);

    json(res, 200, {
      done:     job.done,
      error:    job.error,
      hasFile:  !!job.filePath,
      lines:    newLines,
      total:    job.lines.length,
    });
    return;
  }

  // ── Serve finished file to browser ─────────────────────────────────────────
  if (req.method === 'GET' && reqUrl.pathname === '/file') {
    const jobId = reqUrl.searchParams.get('jobId');
    const job   = jobs.get(jobId);

    if (!job || !job.done) { json(res, 400, { error: 'Not ready' }); return; }
    if (job.error)         { json(res, 500, { error: job.error });    return; }
    if (!job.filePath)     { json(res, 404, { error: 'File not found' }); return; }

    const fileName = path.basename(job.filePath);
    const stat     = fs.statSync(job.filePath);
    const ext      = path.extname(fileName).toLowerCase();

    const mimeMap = {
      '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
      '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
    };
    const fileMime = mimeMap[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type':        fileMime,
      'Content-Length':      stat.size,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    });

    const stream = fs.createReadStream(job.filePath);
    stream.pipe(res);

    stream.on('close', () => {
      // Clean up tmp file after serving
      try { fs.unlinkSync(job.filePath); } catch {}
      jobs.delete(jobId);
    });
    return;
  }

  // ── Serve static files ─────────────────────────────────────────────────────
  const filePath = path.join(__dirname, reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname);
  serveStatic(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎬 YT Fetch running on port ${PORT}`);
});
