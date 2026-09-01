// 用 Edge 无头模式把 作品/人生四格/肆格.html 按打印样式导出为横向 A4 PDF，并校验页数。
// 用法：node 导出-人生四格-作品集.js
// 说明：本机 Puppeteer 直接 launch Edge 会失败（Code: 0），
//       改为「手动起 Edge(固定调试端口) + puppeteer.connect」方案。
// 方案来源：./PDF导出方法说明.md
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');           // 总作品集 根目录
const HTML = 'file://' + path.resolve(ROOT, '作品', '人生四格', '肆格.html').replace(/\\/g, '/');
const OUT  = path.join(ROOT, '人生四格-作品集.pdf');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9229;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function countPages(buf) {
  const s = Buffer.from(buf).toString('latin1');
  const m = s.match(/\/Type\s*\/Page\b/g) || [];
  return m.length;
}

(async () => {
  // 1) 手动启动 Edge 无头 + 固定调试端口
  const edge = spawn(EDGE, [
    '--headless=new', '--no-sandbox', '--disable-setuid-sandbox',
    '--user-data-dir=' + path.join(os.tmpdir(), 'pdfout-' + Date.now()),
    '--remote-debugging-port=' + PORT,
    '--edge-skip-compat-layer-relaunch', 'about:blank'
  ], { stdio: 'ignore' });

  let ready = false;
  for (let i = 0; i < 25; i++) {
    try { if (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) { ready = true; break; } } catch (e) {}
    await sleep(400);
  }
  if (!ready) { console.error('FAILED: Edge DevTools not ready'); edge.kill('SIGKILL'); process.exit(1); }

  // 2) connect 而不是 launch
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 900 });
  await page.goto(HTML, { waitUntil: 'load', timeout: 60000 });
  await page.emulateMediaType('print');
  await page.evaluate(() => { if (window.__fitPages) window.__fitPages(); });
  // 冻结动画，避免 PDF 里轮播/书写停在随机帧
  await page.addStyleTag({ content: '.export-carousel .fogcell{animation:none}.export-writing .fogcell .letter{animation:none}' });

  // 校验每个区块的缩放系数与高度（应都 <= 页高，不溢出）
  const fit = await page.evaluate(() => {
    return [...document.querySelectorAll('.hero, .section')].map((sec, i) => {
      const inner = sec.querySelector('.print-fit');
      return {
        idx: i,
        id: sec.id || sec.className,
        tf: inner ? inner.style.transform : null,
        renderedH: inner ? Math.round(inner.getBoundingClientRect().height) : 0,
        secScrollH: sec.scrollHeight,
        secClientH: sec.clientHeight,
        top: Math.round(sec.offsetTop)
      };
    });
  });
  const bodyH = await page.evaluate(() => document.body.scrollHeight);
  console.log('body scrollHeight =', bodyH, '(9页应≈7146)');
  console.log('--- per-section fit (renderedH should be <= ~794px = 210mm) ---');
  fit.forEach(f => console.log(`#${f.idx} ${f.id}  tf=${f.tf}  renderedH=${f.renderedH}px  secScrollH=${f.secScrollH} secClientH=${f.secClientH} top=${f.top}`));

  const buf = await page.pdf({ path: OUT, preferCSSPageSize: true, printBackground: true });
  await browser.disconnect();
  edge.kill('SIGKILL');
  console.log('---');
  console.log('WROTE', OUT, (buf.length / 1024).toFixed(0) + ' KB');
  console.log('pages:', countPages(buf));
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
