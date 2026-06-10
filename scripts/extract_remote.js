var Client = require('ssh2').Client;
var conn = new Client();

conn.on('ready', function() {
  console.log('[i] SSH connected');
  console.log('[i] Creating extract script...');

  var pythonScript = [
    'import zipfile',
    'zipfile.ZipFile("/root/BTI_v3.4.1.zip").extractall("/var/www/html/bti/")',
    'print("Extract done")'
  ].join('\n');

  var commands = [
    'printf \'%s\' \'' + pythonScript.replace(/'/g, "'\"'\"'") + '\' > /tmp/extract.py',
    'python3 /tmp/extract.py',
    'ls -la /var/www/html/bti/index.html',
    'rm -f /root/BTI_v3.4.1.zip /tmp/extract.py',
    'echo "URL: http://www.wangwangtt.top/bti/"'
  ].join(' && ');

  conn.exec(commands, function(err, stream) {
    if (err) {
      console.log('[x] ERR:', err.message);
      conn.end();
      return;
    }
    stream.on('close', function(code) {
      if (code === 0) {
        console.log('[+] Deploy success!');
        console.log('[+] URL: http://www.wangwangtt.top/bti/');
      } else {
        console.log('[x] Exit code:', code);
      }
      conn.end();
    });
    stream.on('data', function(data) {
      console.log('  ' + data.toString().trim());
    });
    stream.stderr.on('data', function(data) {
      console.log('  [err] ' + data.toString().trim());
    });
  });
});

conn.on('error', function(err) {
  console.log('[x] Connection error:', err.message);
});

conn.connect({
  host: '8.148.82.169',
  port: 22,
  username: 'root',
  password: 'Pb52013145',
  readyTimeout: 20000
});
