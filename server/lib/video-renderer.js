const { renderTemplate, renderHTML } = require('./renderer');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Render slides to an MP4 video with optional audio.
 *
 * @param {Array} slides - [{template, data, duration}] or [{html, css, duration}]
 * @param {Object} options
 * @param {string} [options.audio_path] - Path to audio file
 * @param {string} [options.audio_url] - URL to download audio from
 * @param {number} [options.width=1080]
 * @param {number} [options.height=1920]
 * @param {number} [options.fps=30]
 * @param {string} [options.transition='fade'] - 'fade' or 'none'
 * @param {number} [options.transition_duration=0.5]
 * @param {number} [options.scale=2]
 * @returns {Promise<Buffer>} MP4 buffer
 */
async function renderVideo(slides, options = {}) {
  if (!slides || slides.length === 0) {
    throw new Error('Mindestens ein Slide erforderlich');
  }

  // Check ffmpeg availability
  try {
    await execFilePromise('ffmpeg', ['-version']);
  } catch {
    throw new Error('ffmpeg nicht installiert. Bitte Dockerfile aktualisieren.');
  }

  const {
    width = 1080,
    height = 1920,
    fps = 30,
    transition = 'fade',
    transition_duration = 0.5,
    scale = 2,
  } = options;

  const tmpDir = path.join('/tmp', `video-render-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 1. Render each slide as PNG
    const slidePaths = [];
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      let png;
      if (slide.template) {
        // Template-based slide
        png = await renderTemplate(slide.template, slide.data || {}, { width, height, scale });
      } else if (slide.html) {
        // Raw HTML/CSS slide
        png = await renderHTML(slide.html, slide.css || '', width, height, scale);
      } else {
        throw new Error(`Slide ${i}: template oder html erforderlich`);
      }
      const slidePath = path.join(tmpDir, `slide-${String(i + 1).padStart(3, '0')}.png`);
      fs.writeFileSync(slidePath, png);
      slidePaths.push({ path: slidePath, duration: slide.duration || 5 });
    }

    // 2. Handle audio
    let audioPath = options.audio_path || null;
    if (!audioPath && options.audio_url) {
      const fetch = require('node-fetch');
      const res = await fetch(options.audio_url);
      if (!res.ok) throw new Error(`Audio-Download fehlgeschlagen: ${res.status}`);
      audioPath = path.join(tmpDir, 'audio' + getExtFromUrl(options.audio_url));
      const buf = await res.buffer();
      fs.writeFileSync(audioPath, buf);
    }

    // 3. Build ffmpeg command
    const outputPath = path.join(tmpDir, 'output.mp4');

    if (slides.length === 1) {
      await renderSingleSlide(slidePaths[0], audioPath, outputPath, fps, width, height);
    } else if (transition === 'none' || transition_duration <= 0) {
      await renderConcat(slidePaths, audioPath, outputPath, fps, tmpDir, width, height);
    } else {
      await renderWithXfade(slidePaths, audioPath, outputPath, fps, transition, transition_duration, width, height);
    }

    return fs.readFileSync(outputPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function renderSingleSlide(slide, audioPath, outputPath, fps, width, height) {
  const args = [
    '-loop', '1',
    '-i', slide.path,
    '-t', String(slide.duration),
  ];
  if (audioPath) {
    args.push('-i', audioPath);
  }
  args.push(
    '-vf', `scale=${width}:${height}`,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
  );
  if (audioPath) {
    args.push('-c:a', 'aac', '-shortest');
  }
  args.push('-y', outputPath);
  await execFilePromise('ffmpeg', args);
}

async function renderConcat(slidePaths, audioPath, outputPath, fps, tmpDir, width, height) {
  const concatFile = path.join(tmpDir, 'concat.txt');
  const lines = slidePaths.map(s =>
    `file '${s.path}'\nduration ${s.duration}`
  ).join('\n');
  fs.writeFileSync(concatFile, lines + '\n');

  const args = [
    '-f', 'concat', '-safe', '0',
    '-i', concatFile,
  ];
  if (audioPath) {
    args.push('-i', audioPath);
  }
  args.push(
    '-vf', `scale=${width}:${height},format=yuv420p`,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
  );
  if (audioPath) {
    args.push('-c:a', 'aac', '-shortest');
  }
  args.push('-y', outputPath);
  await execFilePromise('ffmpeg', args);
}

async function renderWithXfade(slidePaths, audioPath, outputPath, fps, transition, transitionDuration, width, height) {
  const inputs = [];
  for (const slide of slidePaths) {
    inputs.push('-loop', '1', '-t', String(slide.duration), '-i', slide.path);
  }
  if (audioPath) {
    inputs.push('-i', audioPath);
  }

  const n = slidePaths.length;
  const td = transitionDuration;
  let filterParts = [];

  for (let i = 0; i < n - 1; i++) {
    const outLabel = (i < n - 2) ? `[v${i}]` : '[vout]';
    const nextInput = `[${i + 1}:v]`;
    const leftLabel = (i === 0) ? '[0:v]' : `[v${i - 1}]`;

    // Duration of the left stream at this point
    let leftDuration;
    if (i === 0) {
      leftDuration = slidePaths[0].duration;
    } else {
      leftDuration = 0;
      for (let j = 0; j <= i; j++) leftDuration += slidePaths[j].duration;
      leftDuration -= i * td;
    }
    const offset = leftDuration - td;

    filterParts.push(
      `${leftLabel}${nextInput}xfade=transition=${transition}:duration=${td}:offset=${offset}${outLabel}`
    );
  }

  const filterComplex = filterParts.join(';');

  const args = [
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
  ];
  if (audioPath) {
    args.push('-map', `${n}:a`, '-c:a', 'aac', '-shortest');
  }
  args.push(
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-y', outputPath,
  );
  await execFilePromise('ffmpeg', args);
}

function getExtFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    return ext || '.mp3';
  } catch {
    return '.mp3';
  }
}

function execFilePromise(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 50 * 1024 * 1024, timeout: 300000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`ffmpeg error: ${error.message}\nstderr: ${stderr}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

module.exports = { renderVideo };
