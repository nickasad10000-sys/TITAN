const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('🚀 TITAN AI - TikTok Auto Uploader');
  console.log('=====================================');
  
  // Check cookies
  if (!fs.existsSync('cookies.json')) {
    console.log('❌ cookies.json not found!');
    console.log('Please add your TikTok cookies to GitHub Secrets as TIKTOK_COOKIES');
    process.exit(1);
  }
  
  let cookies;
  try {
    const cookiesData = fs.readFileSync('cookies.json', 'utf8');
    cookies = JSON.parse(cookiesData);
    console.log(`✅ Loaded ${cookies.length} cookies`);
  } catch (e) {
    console.log('❌ Error parsing cookies:', e.message);
    process.exit(1);
  }
  
  // Check video
  const videoPath = 'video.mp4';
  if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size < 1000) {
    console.log('❌ Video file not found or too small');
    process.exit(1);
  }
  console.log(`✅ Video file: ${videoPath} (${fs.statSync(videoPath).size} bytes)`);
  
  // Launch browser
  console.log('🌐 Launching Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  // Validate and fix cookies for Playwright compatibility
  const validSameSite = ['Strict', 'Lax', 'None'];
  const allowedFields = ['name', 'value', 'domain', 'path', 'expires', 'httpOnly', 'secure', 'sameSite'];
  const fixedCookies = [];
  for (const c of cookies) {
    // Normalize sameSite (case-insensitive)
    let ss = c.sameSite;
    if (ss) {
      const ssLower = String(ss).toLowerCase();
      if (ssLower === 'strict') ss = 'Strict';
      else if (ssLower === 'lax') ss = 'Lax';
      else if (ssLower === 'none') ss = 'None';
      else {
        console.log(`⚠️ Fixing cookie "${c.name}": sameSite "${ss}" → "Lax"`);
        ss = 'Lax';
      }
    }
    // Strip invalid fields, only keep Playwright-compatible ones
    const clean = {};
    for (const f of allowedFields) {
      if (f === 'sameSite' && ss) { clean[f] = ss; continue; }
      if (f === 'sameSite') continue;
      if (c[f] !== undefined) clean[f] = c[f];
    }
    fixedCookies.push(clean);
  }
  
  // Add cookies
  await context.addCookies(fixedCookies);
  console.log(`🍪 Cookies added (${fixedCookies.length})`);
  
  const page = await context.newPage();
  
  // Go to TikTok upload page
  console.log('📱 Opening TikTok upload page...');
  try {
    await page.goto('https://www.tiktok.com/upload', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    console.log('✅ TikTok upload page opened');
    console.log('📝 Page title:', await page.title());
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'logs/tiktok-upload-page.png', fullPage: true });
    console.log('📸 Screenshot saved');
    
    // Wait for page to load
    await page.waitForTimeout(5000);
    
    // Check if we're on the upload page
    const url = page.url();
    console.log('🔗 Current URL:', url);
    
    if (url.includes('login') || url.includes('signup')) {
      console.log('⚠️ Redirected to login page - cookies may be expired');
      await page.screenshot({ path: 'logs/login-redirect.png' });
    } else {
      console.log('✅ Successfully on upload page!');
    }
    
  } catch (e) {
    console.log('❌ Error:', e.message);
    await page.screenshot({ path: 'logs/error.png' });
  }
  
  await browser.close();
  console.log('✅ Done!');
})();
