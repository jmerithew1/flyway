// Tiny capture sink: the game POSTs a dataURL frame here; we save it as shots/latest.jpg
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('shots');
fs.mkdirSync(DIR, { recursive: true });

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const m = body.match(/^data:image\/(\w+);base64,(.+)$/s);
    if (!m) { res.writeHead(400); res.end('bad dataURL'); return; }
    const file = path.join(DIR, `latest.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
    fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
    res.writeHead(200); res.end('saved ' + file);
  });
}).listen(5177, () => console.log('shot-server on :5177'));
