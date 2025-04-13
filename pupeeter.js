const browser = await puppeteer.launch();
const page = await browser.newPage();

// Clear cache
const client = await page.target().createCDPSession();
await client.send('Network.clearBrowserCache');

// Clear cookies
await client.send('Network.clearBrowserCookies');

// Now navigate to the URL
await page.goto('https://harpriya.org/blog', { waitUntil: 'networkidle2' });
