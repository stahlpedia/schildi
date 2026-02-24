const db = require('../db');
const fs = require('fs');
const path = require('path');

let browser = null;

/**
 * Get or launch a shared Puppeteer browser instance.
 */
async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  const puppeteer = require('puppeteer');
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  return browser;
}

/**
 * Replace {{field}} and {{field|default}} placeholders in a string.
 */
function replacePlaceholders(str, data) {
  return str.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, (match, key, defaultVal) => {
    return data[key] !== undefined && data[key] !== '' ? data[key] : (defaultVal || '');
  });
}

/**
 * Load fonts as base64 data URIs for embedding in HTML.
 */
function getFontFaceCSS() {
  const fontsDir = path.join(__dirname, '../fonts');
  let css = '';
  try {
    const regular = fs.readFileSync(path.join(fontsDir, 'NotoSans-Regular.ttf'));
    const bold = fs.readFileSync(path.join(fontsDir, 'NotoSans-Bold.ttf'));
    css += `
      @font-face {
        font-family: 'Noto Sans';
        font-weight: 400;
        src: url(data:font/ttf;base64,${regular.toString('base64')}) format('truetype');
      }
      @font-face {
        font-family: 'Noto Sans';
        font-weight: 700;
        src: url(data:font/ttf;base64,${bold.toString('base64')}) format('truetype');
      }
    `;
  } catch {
    console.warn('Fonts not found, using system fonts');
  }
  return css;
}

const fontFaceCSS = getFontFaceCSS();

/**
 * Render a template by ID or name with given data.
 *
 * @param {number|string} templateIdOrName - Template ID or name
 * @param {Object} data - Field values
 * @param {Object} [options]
 * @param {number} [options.width] - Override template width
 * @param {number} [options.height] - Override template height
 * @param {number} [options.scale=2] - Device scale factor
 * @returns {Promise<Buffer>} PNG buffer
 */
async function renderTemplate(templateIdOrName, data, options = {}) {
  // Look up template
  let template;
  if (typeof templateIdOrName === 'number') {
    template = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateIdOrName);
  } else {
    template = db.prepare('SELECT * FROM templates WHERE name = ? OR id = ?').get(templateIdOrName, parseInt(templateIdOrName) || -1);
  }
  if (!template) {
    throw new Error(`Template nicht gefunden: ${templateIdOrName}`);
  }

  const width = options.width || template.width || 1080;
  const height = options.height || template.height || 1080;
  const scale = options.scale || 2;

  // Replace placeholders in HTML and CSS
  const html = replacePlaceholders(template.html, data);
  const css = replacePlaceholders(template.css, data);

  return renderHTML(html, css, width, height, scale);
}

/**
 * Render raw HTML/CSS to PNG.
 *
 * @param {string} html - HTML content
 * @param {string} css - CSS styles
 * @param {number} width
 * @param {number} height
 * @param {number} [scale=2]
 * @returns {Promise<Buffer>} PNG buffer
 */
async function renderHTML(html, css, width = 1080, height = 1080, scale = 2) {
  const fullHTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
${fontFaceCSS}
* { margin: 0; padding: 0; }
html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
${css}
</style></head><body>${html}</body></html>`;

  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    await page.setContent(fullHTML, { waitUntil: 'networkidle0' });
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
    return Buffer.from(png);
  } finally {
    await page.close();
  }
}

/**
 * Shutdown the shared browser instance (for graceful shutdown).
 */
async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = { renderTemplate, renderHTML, replacePlaceholders, closeBrowser };
