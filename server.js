const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const urlMod  = require('url');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const FILE = path.join(__dirname, 'mvf-music-app.html');
const STATIC_DIR = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// Allowed upstream hosts for the radio proxy
const ALLOWED = [
  'streamtheworld.com',
  'tritondigital.com',
  'jb.fm',
  'zeno.fm',
  'fabricahost.com.br',
  'brasilstream.com.br',
  'audiostream.com.br',
  'logicahost.com.br',
  'crossradio.com.br',
  'inweb.com.br',
  'cmaudioevideo.com',
  'transmissaodigital.com',
  'voxcast.com.br',
  'brascast.com',
  'brlogic.com',
  'svrdedicado.org',
  'brcast.com.br',
  'radiobras.net',
  'azuracast.com',
  'surfernetwork.com',
];

function hostAllowed(hostname) {
  return ALLOWED.some(h => hostname === h || hostname.endsWith('.' + h));
}

function proxyRadio(targetUrl, clientRes, depth) {
  if (depth > 5) { clientRes.writeHead(508); clientRes.end('Too many redirects'); return; }
  var parsed;
  try { parsed = new URL(targetUrl); } catch(e) { clientRes.writeHead(400); clientRes.end('Bad URL'); return; }

  if (!hostAllowed(parsed.hostname)) {
    clientRes.writeHead(403); clientRes.end('Host not allowed: ' + parsed.hostname); return;
  }

  var lib = parsed.protocol === 'https:' ? https : http;

  var upReq = lib.get({
    hostname : parsed.hostname,
    port     : parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path     : parsed.pathname + (parsed.search || ''),
    headers  : {
      'User-Agent'      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept'          : '*/*',
      'Accept-Language' : 'pt-BR,pt;q=0.9',
      'Connection'      : 'keep-alive',
      'Referer'         : 'https://www.streamtheworld.com/',
      'Origin'          : 'https://www.streamtheworld.com',
    },
    timeout : 15000,
  }, function(upRes) {
    if (upRes.statusCode === 301 || upRes.statusCode === 302 || upRes.statusCode === 307) {
      upRes.destroy();
      proxyRadio(upRes.headers.location, clientRes, depth + 1);
      return;
    }
    if (!clientRes.headersSent) {
      clientRes.writeHead(upRes.statusCode === 200 ? 200 : upRes.statusCode, {
        'Content-Type'                : upRes.headers['content-type'] || 'audio/mpeg',
        'Cache-Control'               : 'no-cache, no-store',
        'Access-Control-Allow-Origin' : '*',
        'Transfer-Encoding'           : 'chunked',
      });
    }
    upRes.pipe(clientRes);
    clientRes.on('close', function() { upRes.destroy(); });
  });

  upReq.on('timeout', function() {
    upReq.destroy();
    if (!clientRes.headersSent) { clientRes.writeHead(504); clientRes.end('Proxy timeout'); }
  });
  upReq.on('error', function(err) {
    if (!clientRes.headersSent) { clientRes.writeHead(502); clientRes.end('Proxy error: ' + err.message); }
  });
}

const server = http.createServer(function(req, res) {
  var parsed = urlMod.parse(req.url, true);

  if (parsed.pathname === '/debug-host') {
    var testUrl = parsed.query.url || '';
    var h = '';
    try { h = new URL(testUrl).hostname; } catch(e) { h = 'bad-url'; }
    res.writeHead(200, {'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*'});
    res.end('hostname=' + h + ' allowed=' + hostAllowed(h) + ' allowed_list=' + ALLOWED.join(','));
    return;
  }

  if (parsed.pathname === '/radio-stream') {
    var target = parsed.query.url;
    if (!target) { res.writeHead(400); res.end('Missing url'); return; }
    proxyRadio(target, res, 0);
    return;
  }

  var filePath;
  if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
    filePath = FILE;
  } else {
    var rel = decodeURIComponent(parsed.pathname).replace(/\.\./g, '');
    filePath = path.join(STATIC_DIR, rel);
  }

  var ext = path.extname(filePath);
  var mime = MIME[ext] || 'application/octet-stream';
  var isHtml = filePath === FILE;
  var isSW   = parsed.pathname === '/sw.js';

  fs.readFile(filePath, function(err, data) {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    var headers = {
      'Content-Type' : mime,
      'Cache-Control': (isHtml || isSW) ? 'no-store' : 'public, max-age=86400',
    };
    if (isSW) headers['Service-Worker-Allowed'] = '/';
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', function() {
  console.log('========================================');
  console.log('  MVF Music rodando em:');
  console.log('  http://localhost:' + PORT);
  console.log('  Feche esta janela para encerrar.');
  console.log('========================================');
  if (process.env.NODE_ENV !== 'production') exec('start http://localhost:' + PORT);
});
