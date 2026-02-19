// satori is ESM-only, we need dynamic import
let satori;
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

// Load fonts once
let fontRegular, fontBold;
try {
  // Try NotoSans first (more reliable)
  fontRegular = fs.readFileSync(path.join(__dirname, '../fonts/NotoSans-Regular.ttf'));
  fontBold = fs.readFileSync(path.join(__dirname, '../fonts/NotoSans-Bold.ttf'));
  console.log('Using NotoSans fonts');
} catch (error) {
  try {
    // Fallback to Inter if available
    fontRegular = fs.readFileSync(path.join(__dirname, '../fonts/Inter-Regular.ttf'));
    fontBold = fs.readFileSync(path.join(__dirname, '../fonts/Inter-Bold.ttf'));
    console.log('Using Inter fonts');
  } catch (error2) {
    console.warn('No custom fonts found');
    fontRegular = null;
    fontBold = null;
  }
}

// Template: Quote Card (satori-compatible)
function quote(data, width, height) {
  const { quote, author, brandColor = '#6366f1' } = data;
  
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        width: width,
        height: height,
        background: `linear-gradient(135deg, ${brandColor} 0%, #1a1a2e 100%)`,
        padding: '80px',
        position: 'relative',
        fontFamily: fontRegular ? 'CustomFont' : 'sans-serif',
        color: '#ffffff',
      },
      children: [
        // Quote text
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: '48px',
              fontWeight: 400,
              textAlign: 'center',
              lineHeight: '1.2',
              marginBottom: '40px',
            },
            children: [`"${quote}"`]
          }
        },
        // Author
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: '32px',
              fontWeight: 700,
              color: '#ffffff90',
              textAlign: 'center',
            },
            children: [`— ${author}`]
          }
        },
        // Logo watermark
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              position: 'absolute',
              bottom: '40px',
              right: '40px',
              fontSize: '24px',
              color: '#ffffff60',
              fontWeight: 600,
            },
            children: ['🐢 schildi.ai']
          }
        }
      ]
    }
  };
}

// Template: Simple Text (for testing)
function text(data, width, height) {
  const { title, body, brandColor = '#ef4444' } = data;
  
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        width: width,
        height: height,
        background: '#1a1a2e',
        padding: '80px',
        position: 'relative',
        fontFamily: fontRegular ? 'CustomFont' : 'sans-serif',
        color: '#ffffff',
      },
      children: [
        // Title
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: '64px',
              fontWeight: 700,
              color: brandColor,
              textAlign: 'center',
              marginBottom: '40px',
              lineHeight: '1.1',
            },
            children: [title]
          }
        },
        // Body
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: '36px',
              fontWeight: 400,
              textAlign: 'center',
              lineHeight: '1.4',
            },
            children: [body]
          }
        },
        // Logo watermark
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              position: 'absolute',
              bottom: '40px',
              right: '40px',
              fontSize: '24px',
              color: '#ffffff60',
              fontWeight: 600,
            },
            children: ['🐢 schildi.ai']
          }
        }
      ]
    }
  };
}

// Template definitions - start with working ones
const templates = { quote, text };

async function renderTemplate(templateName, data, width = 1080, height = 1080, scale = 2) {
  // Load satori dynamically (ESM module)
  if (!satori) {
    const satoriModule = await import('satori');
    satori = satoriModule.default;
  }
  
  const template = templates[templateName];
  if (!template) {
    throw new Error('Unknown template: ' + templateName);
  }
  
  const jsx = template(data, width, height);
  
  // Prepare fonts array - satori needs at least one font
  const fonts = [];
  if (fontRegular && fontBold) {
    fonts.push(
      { name: 'CustomFont', data: fontRegular, weight: 400, style: 'normal' },
      { name: 'CustomFont', data: fontBold, weight: 700, style: 'normal' }
    );
  } else {
    throw new Error('Fonts are required but not available. Please download fonts first.');
  }
  
  const svg = await satori(jsx, {
    width: width * scale,
    height: height * scale,
    fonts,
  });
  
  const resvg = new Resvg(svg, { 
    fitTo: { mode: 'width', value: width * scale } 
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

module.exports = { renderTemplate };