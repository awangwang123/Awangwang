const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const HOST = '8.148.82.169';
const PORT = 22;
const USER = 'root';
const PASS = 'Pb52013145';
const ZIP_FILE = path.join(__dirname, '..', 'BTI_v3.4.1.zip');
const REMOTE_ZIP = '/root/BTI_v3.4.1.zip';
const REMOTE_DIR = '/var/www/html/bti';
const BACKUP_DIR = '/var/www/html/bti_backup_' + Date.now();

const conn = new Client();

function log(msg, level) {
  level = level || 'INFO';
  var prefix = { INFO: '[i]', OK: '[+]', WARN: '[!]', ERR: '[x]', CHK: '[*]' };
  console.log((prefix[level] || '[?]') + ' ' + msg);
}

conn.on('ready', function() {
  log('SSH connected');
  log('Uploading file...');

  conn.sftp(function(err, sftp) {
    if (err) {
      log('SFTP failed: ' + err.message, 'ERR');
      conn.end();
      return;
    }

    var readStream = fs.createReadStream(ZIP_FILE);
    var writeStream = sftp.createWriteStream(REMOTE_ZIP);

    var uploaded = 0;
    var total = fs.statSync(ZIP_FILE).size;

    readStream.on('data', function(chunk) {
      uploaded += chunk.length;
      var pct = Math.round((uploaded / total) * 100);
      process.stdout.write('\r[i] Upload: ' + pct + '% (' + (uploaded/1024/1024).toFixed(1) + 'MB / ' + (total/1024/1024).toFixed(1) + 'MB)');
    });

    writeStream.on('close', function() {
      process.stdout.write('\n');
      log('Upload complete', 'OK');

      var commands = [
        'echo "=== Backup current version ==="',
        'cp -r ' + REMOTE_DIR + ' ' + BACKUP_DIR,
        'echo "Backup done: ' + BACKUP_DIR + '"',
        'echo "=== Extract new version ==="',
        'rm -rf ' + REMOTE_DIR + '/*',
        'unzip -o ' + REMOTE_ZIP + ' -d ' + REMOTE_DIR + '/',
        'echo "Extract done"',
        'echo "=== Check index.html ==="',
        'ls -la ' + REMOTE_DIR + '/index.html',
        'echo "=== Cleanup ==="',
        'rm -f ' + REMOTE_ZIP,
        'echo "=== Deploy done ==="',
        'echo "URL: http://www.wangwangtt.top/bti/"'
      ].join(' && ');

      log('Running deploy commands...');
      conn.exec(commands, function(err, stream) {
        if (err) {
          log('Command failed: ' + err.message, 'ERR');
          conn.end();
          return;
        }

        stream.on('close', function(code, signal) {
          if (code === 0) {
            log('Deploy success!', 'OK');
            log('URL: http://www.wangwangtt.top/bti/', 'OK');
          } else {
            log('Exit code: ' + code, 'ERR');
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

    readStream.pipe(writeStream);
  });
});

conn.on('error', function(err) {
  log('Connection error: ' + err.message, 'ERR');
});

log('Connecting to server...');
conn.connect({
  host: HOST,
  port: PORT,
  username: USER,
  password: PASS,
  readyTimeout: 20000
});
