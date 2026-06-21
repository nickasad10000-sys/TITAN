const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const logsDir = 'logs';
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, 'upload.log');
  const log = (msg) => {
    const line = '[' + new Date().toISOString() + '] ' + msg;
    console.log(line);
    fs.appendFileSync(logFile, line + '\n');
  };

  log('TITAN AI - TikTok Auto Uploader');

  let cookies = [];
  try {
    if (fs.existsSync('cookies.json')) {
      const raw = fs.readFileSync('cookies.json', 'utf8').trim();
      if (raw) { cookies = JSON.parse(raw); log('Loaded ' + cookies.length + ' cookies'); }
    }
  } catch (e) { log('Error loading cookies: ' + e.message); }

  const videoPath = process.env.VIDEO_PATH || 'video.mp4';
  if (!fs.existsSync(videoPath)) { log('Video not found: ' + videoPath); process.exit(1); }
  log('Video: ' + videoPath + ' (' + fs.statSync(videoPath).size + ' bytes)');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', viewport: { width: 1920, height: 1080 } });

  if (cookies.length > 0) {
    const fixed = cookies.map(c => { const x = {...c}; if (x.sameSite==='no_restriction') x.sameSite='Lax'; if (!x.sameSite) x.sameSite='Lax'; return x; });
    await context.addCookies(fixed);
    log('Cookies added: ' + fixed.length);
  }

  const page = await context.newPage();
  log('Opening TikTok upload page...');
  try { await page.goto('https://www.tiktok.com/upload?lang=en', { waitUntil: 'networkidle', timeout: 30000 }); } catch(e) {}
  await page.waitForTimeout(3000);

  const title = await page.title();
  const url = page.url();
  log('Title: ' + title + ' | URL: ' + url);
  await page.screenshot({ path: path.join(logsDir,'step1.png') });

  if (url.includes('/login') || title.toLowerCase().includes('log in')) {
    log('Redirected to login - attempting auto-login...');
    const email = process.env.TIKTOK_EMAIL;
    const password = process.env.TIKTOK_PASSWORD;
    if (!email || !password) { log('No credentials in env'); await browser.close(); process.exit(1); }

    try {
      await page.waitForSelector('input[name="username"]', { timeout: 15000 });
      await page.fill('input[name="username"]', email);
      await page.waitForTimeout(800);
      await page.fill('input[type="password"]', password);
      await page.waitForTimeout(800);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(8000);

      const afterUrl = page.url();
      const afterTitle = await page.title();
      log('After login: ' + afterUrl + ' | ' + afterTitle);
      await page.screenshot({ path: path.join(logsDir,'step2-login.png') });

      if (afterUrl.includes('/login')) { log('Login failed - CAPTCHA or 2FA?'); await browser.close(); process.exit(1); }

      const newCookies = await context.cookies();
      fs.writeFileSync('cookies.json', JSON.stringify(newCookies, null, 2));
      log('Login OK, saved ' + newCookies.length + ' cookies');
      await page.goto('https://www.tiktok.com/upload?lang=en', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
    } catch(e) { log('Login error: ' + e.message); await browser.close(); process.exit(1); }
  }

  log('Uploading video...');
  try {
    await page.waitForSelector('input[type="file"]', { timeout: 15000 });
    await page.locator('input[type="file"]').first().setInputFiles(videoPath);
    log('Video selected');
    await page.waitForTimeout(5000);
  } catch(e) { log('Upload error: ' + e.message); await browser.close(); process.exit(1); }

  const desc = process.env.VIDEO_DESCRIPTION || 'Auto uploaded #titanai';
  try {
    await page.waitForSelector('[contenteditable="true"]', { timeout: 10000 });
    await page.locator('[contenteditable="true"]').first().fill(desc);
    log('Description: ' + desc);
    await page.waitForTimeout(2000);
  } catch(e) { log('Desc error: ' + e.message); }

  try {
    const btn = await page.locator('button:has-text("Post")').first();
    if (await btn.isVisible()) { await btn.click(); log('Clicked Post'); await page.waitForTimeout(10000); }
  } catch(e) { log('Post error: ' + e.message); }

  await page.screenshot({ path: path.join(logsDir,'step3-final.png'), fullPage: true });
  log('Done!');
  await browser.close();
})();
