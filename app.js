const express = require('express');
const fileUpload = require('express-fileupload');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const archiver = require('archiver');
const app = express();

const fs = require('fs');
const cacheDir = process.env.PUPPETEER_CACHE_DIR || '/tmp/puppeteer-cache';
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}


// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Add this line to parse JSON requests
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1y', // Cache for 1 year
  immutable: true
}));

// Temporary directory
const tempDir = path.join(__dirname, 'temp');

// Initialize temp directory
function initTempDir() {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });
}
initTempDir();

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.post('/process', async (req, res) => {
  try {
    let urls = [];
    
    if (req.body.urls) {
      urls = req.body.urls.split(/[\n,]+/).map(url => url.trim()).filter(url => url);
    }
    
    if (req.files && req.files.csvFile) {
      await new Promise((resolve, reject) => {
        req.files.csvFile.data
          .pipe(csv())
          .on('data', (row) => {
            Object.values(row).forEach(value => {
              if (value && isValidUrl(value)) urls.push(value.trim());
            });
          })
          .on('end', resolve)
          .on('error', reject);
      });
    }
    
    urls = [...new Set(urls.filter(url => isValidUrl(url)))];
    
    if (!urls.length) return res.status(400).json({ error: 'No valid URLs provided' });
    
    res.json({ count: urls.length, urls });
  } catch (error) {
    console.error('Process error:', error);
    res.status(500).json({ error: 'Error processing URLs' });
  }
});

app.post('/capture', async (req, res) => {
  let browser;
  try {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'No URLs provided' });
    }

    const sessionId = Date.now();
    const sessionDir = path.join(tempDir, sessionId.toString());
    fs.mkdirSync(sessionDir);

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ],
      timeout: 60000
    });

    const results = await Promise.all(urls.map(async (url) => {
      let page;
      try {
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setDefaultNavigationTimeout(60000);

        const targetUrl = url.startsWith('http') ? url : `https://${url}`;
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        const filename = `${normalizeUrl(url)}.png`;
        const filepath = path.join(sessionDir, filename);
        
        // Removed the quality option since PNG doesn't support it
        await page.screenshot({ path: filepath, fullPage: true });

        return { url, filename, success: true };
      } catch (error) {
        console.error(`Error capturing ${url}:`, error);
        return { url, error: error.message, success: false };
      } finally {
        if (page) await page.close();
      }
    }));

    res.json({ success: true, results, sessionId });
  } catch (error) {
    console.error('Capture error:', error);
    res.status(500).json({ error: 'Failed to capture screenshots' });
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/download/:sessionId', (req, res) => {
  const sessionDir = path.join(tempDir, req.params.sessionId);
  if (!fs.existsSync(sessionDir)) return res.status(404).send('Session not found');

  const archive = archiver('zip', { zlib: { level: 9 } });
  res.attachment(`screenshots-${req.params.sessionId}.zip`);
  archive.pipe(res);
  archive.directory(sessionDir, false);
  archive.finalize();

  res.on('finish', () => {
    try {
      fs.rmSync(sessionDir, { recursive: true });
    } catch (err) {
      console.error('Cleanup error:', err);
    }
  });
});

// Helpers
function isValidUrl(string) {
  try {
    new URL(string.startsWith('http') ? string : `https://${string}`);
    return true;
  } catch (_) {
    return false;
  }
}

function normalizeUrl(url) {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    let clean = urlObj.hostname.replace(/^www\./, '');
    clean = clean.replace(/[^\w-]/g, '-');
    if (urlObj.pathname !== '/') {
      clean += urlObj.pathname.replace(/[^\w-]/g, '-');
    }
    return clean.replace(/-+/g, '-').replace(/^-|-$/g, '');
  } catch (e) {
    return url.replace(/^https?:\/\/(www\.)?/, '')
      .replace(/[^\w-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));