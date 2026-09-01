# 横向 A4 PDF 导出方法说明（FourCuts Studio）

> 用途：把 HTML 的每个「区块」导出成一张横向 A4（297×210mm）PDF。
> 效果：屏幕上排版**完全不变**，只在打印/导出时按区块分页、按页高等比缩放。
> 复用：把下面的 CSS 块和 JS 块原样复制到任何 HTML 里，按第 0 节改几个选择器即可。

---

## 0. 原理一句话

1. **打印 CSS**：给每个区块设 `width:297mm; height:210mm; overflow:hidden`，用 `break-before:page` 强制每个区块另起一页；区块本身是 **flex 行方向居中**（`align-items:center; justify-content:center`）。
2. **打印 JS**：区块内容可能比一页高，用 `transform: scale()` **只做视觉等比缩小**，围绕区块中心缩放，矮的页保持原样。
3. **导出工具**：用无头 Edge（Puppeteer 连接）模拟打印，直接 `page.pdf()` 输出。

> ⚠️ 本项目实测踩过的坑：
> - **不要在 JS 里加 `translateY(...) scale(...)`。** 区块内内容超出页高时，flex 居中会把布局盒的顶部顶到页外（负坐标）；`translateY(-contentH*(1-scale)/2)` 会把它再往上推，结果**标题被裁掉**。本项目第 3、7 页曾因此"标题消失"。正确做法是**纯 `scale()`**，配合区块 flex 居中，缩放后视觉盒正好落在页内。
> - **不要给 `.print-fit` 单独限宽/居中**（如 `width:auto;max-width:...;margin:0 auto`）。区块本身 flex 行方向居中已处理居中，再加约束会带来"多余的额外改动"（本项目第 9 页曾因此出现）。真正需要的是 `.print-fit .section-inner{max-width:none}`，把屏幕上的限宽容器放开来铺满。
> - 区块自带的 `margin`/`border` 会顶破页面边界，导致多出 1 页。打印 CSS 里要**覆盖所有区块的 margin**（本项目 footer 有 `margin-top:20px`，特意加了一行 `footer.section{margin-top:0}`）。
> - 屏幕上的 `min-height` 也要覆盖为 `0`，否则会顶破固定 `height:210mm`，造成区块超高、内容被裁或分页错乱。
> - **`@media print` 里的布局规则要带 `!important`，否则会被分页重排触发的宽度断点反杀。** `page.pdf()` 分页时会在一个内部窄宽度下重新排布页面，此时 `@media(max-width:820px)` 这类宽度断点会生效，把「双列 grid + `aspect-ratio` + 绝对定位图」这类布局塌成单列——实测症状是整页只剩一张铺满的大图、该页文本全丢。修复：在 `@media print` 里用 `!important` 把想要的打印布局压死（本项目滤镜页：`#fx .fx-wrap{grid-template-columns:340px 1fr !important}`）。

---

## 1. 你的 HTML 需要满足的前提

导出脚本识别「区块」的方式是选择器 `.hero, .section`。所以你的页面结构应是：

```html
<header class="hero"> ...第 1 页内容... </header>
<section class="section"> ...第 2 页内容... </section>
<section class="section"> ...第 3 页内容... </section>
<footer class="section"> ...最后一页内容... </footer>
```

- 每个区块 = 一页，区块之间不共享容器。
- 若某个区块外面套了 `.section-inner` 之类的居中容器，也**没关系**——JS 会把区块内所有子元素整体包进 `.print-fit`。

---

## 2. 打印 CSS（放在 `</style>` 前）

```css
/* ============================================================
   打印导出 —— 每个区块 = 一张横向 A4（297×210mm）
   ============================================================ */
@page{size:A4 landscape;margin:0}
@media print{
  body{background:#fff}

  /* ① 把屏幕上的滚动/动画效果关掉，避免导出时停在随机帧或出现空白 */
  .reveal{opacity:1 !important;transform:none !important;transition:none !important}
  /* 若页面有无限循环动画（轮播/书写/飘雪等），必须在导出时冻结成静态帧，
     否则 page.pdf() 会等不到渲染稳定而超时。见第 4 节。 */
  /* .xxx-animation{animation:none} */

  /* ② 每个区块 = 一页横向 A4。flex 行方向 + 居中：
       缩放围绕区块中心进行，内容永远不会被顶到页外 */
  .hero,.section{
    width:297mm;
    height:210mm;
    min-height:0;             /* 必须：覆盖屏幕上的 min-height */
    max-width:none;
    margin:0;                 /* 必须：覆盖区块自带的 margin */
    padding:0;                /* 边距统一交给 .print-fit 承担 */
    box-sizing:border-box;
    overflow:hidden;          /* 必须：裁掉溢出，保证恰好一页 */
    display:flex;
    align-items:center;       /* 垂直居中 */
    justify-content:center;   /* 水平居中 */
  }
  .section{break-before:page}   /* 从第 2 个区块起每块另起一页 */
  /* 若某个区块在屏幕上有非 0 的 margin-top（本项目 footer 有 20px），
     要专门覆盖，否则会把末页顶出边界多出 1 页 */
  footer.section{border-top:none;margin-top:0}

  /* ③ 内容容器：铺满页宽、自带边距，供 JS 以 transform:scale 围绕中心缩放。
     不要在它上面压 height 或加 overflow —— 那只做视觉缩放的载体 */
  .print-fit{
    width:100%;
    padding:16mm 14mm;        /* 页边距；上下的 16mm*2 会在 JS 里从缩放目标高度里扣 */
    box-sizing:border-box;
    transform-origin:center center;
  }
  /* 屏幕上的限宽容器（section-inner / hero-inner）要放开来铺满，否则居中失效 */
  .print-fit .section-inner{max-width:none;margin:0;padding:0}
  .print-fit .hero-inner{margin:0 auto}
}
```

**需要按你的页面改的**：
- `.hero, .section` → 你实际用的区块类名。
- `.reveal` → 你的滚动渐显类名；没有就删掉那行。
- `footer.section` → 你页面里**有 margin 的区块**，逐个补一行 `xxx{margin:0}`。
- `padding:16mm 14mm` → 页边距大小，可调。上下 padding 会从页高里扣掉，需与 JS 里的缩放目标（208mm）配平。

---

## 3. 打印 JS（放在 `</body>` 前）

```html
<script>
(function(){
  var MM = 96 / 25.4; // mm -> px
  function fitPages(){
    document.querySelectorAll('.hero, .section').forEach(function(sec){
      var inner = sec.querySelector('.print-fit');
      if(!inner){
        inner = document.createElement('div');
        inner.className = 'print-fit';
        while(sec.firstChild) inner.appendChild(sec.firstChild);
        sec.appendChild(inner);
      }
      inner.style.transform = '';
      /* @media print 布局下、未缩放的实际高度（含 .print-fit 的 16mm 上下 padding）。
         用 getBoundingClientRect 而非 scrollHeight，避免被溢出元素（如绝对定位的
         星点/光点）虚高 */
      var natural = inner.getBoundingClientRect().height;
      /* 只缩小不放大：过高的页缩到 208mm（210mm 减 16mm*2，留 1mm 余量），
         矮的页保持原样居中。scale() 围绕 center 中心缩放，配合区块 flex
         居中，内容不会跑到页外 —— 不要加 translateY */
      var s = Math.min(1, (208 * MM) / natural);
      inner.style.transform = s < 1 ? 'scale(' + s + ')' : '';
    });
  }
  window.__fitPages = fitPages;                 // 供外部（无头浏览器）调用
  window.addEventListener('beforeprint', fitPages);   // 浏览器手动打印也生效
  window.addEventListener('afterprint', function(){
    document.querySelectorAll('.print-fit').forEach(function(inner){ inner.style.transform = ''; });
  });
})();
</script>
```

**需要按你的页面改的**：`.hero, .section` 选择器、缩放目标 `208`（若改了 CSS padding）。

**为什么只 `transform` 就够了**：保证"每区块恰好一页"靠的是打印 CSS 里区块本身 `height:210mm; overflow:hidden`（固定了布局高度）。JS 里的 `scale()` 只做**视觉**缩小，把超高的内容缩进页内；因为是围绕中心缩放、区块又是 flex 居中，视觉盒上下天然对称，不需要 `translateY` 再去"居中"（加了反而会裁掉顶部）。

---

## 4. 冻结动画（导出前必做）

页面里只要有 **CSS 无限循环动画**（轮播、打字书写、飘雪、眨眼、呼吸光晕等），`page.pdf()` 就会**一直等渲染稳定而超时**。解决：导出时用 `animation:none` 彻底停掉（不要用 `animation-play-state:paused`，那种停在当前帧，可能停到一半的位置）。

在 `_pdf.js` 里通过 `page.addStyleTag` 注入：

```js
await page.addStyleTag({ content: '选择器{animation:none}…' });
```

若你想让动画**定格在某一帧**（本项目：轮播停在第 1 张「L」、书写停在「写一半」），分两步：
1. 上面 `addStyleTag` 里 `animation:none` 把动画停住；
2. 再在打印 CSS 里用静态样式覆盖，指定定格帧。本项目例子：

```css
/* 轮播：只显示第 1 张（L），其余隐藏 */
.export-carousel .fogcell{opacity:0 !important}
.export-carousel .fogcell:nth-child(1){opacity:1 !important}
/* 书写：每个字母裁掉右半，即"写到一半" */
.export-writing .fogcell .letter{
  opacity:1 !important;
  clip-path:inset(0 50% 0 0) !important;
}
/* "哈气起雾"这类动画：如果想定格在最终完整帧，就把 clip-path 拨回 inset(0)，
   并显式 animation:none + opacity:1（本项目：第 6 页 LOVE 完整显示、雾半透明） */
.fog-stage .love{
  animation:none !important;
  clip-path:inset(0 0 0 0) !important;
  opacity:1 !important;
}
.fog-stage .mist{opacity:.55 !important}
.fog-stage .finger{animation:none !important;opacity:1 !important}
```

---

## 5. 导出脚本（Puppeteer + 无头 Edge）

> 本机直接用 Puppeteer `launch()` 启动 Edge 会失败（报 Code: 0），
> 解决方案是**先手动起 Edge（带 `--remote-debugging-port`），再用 `puppeteer.connect` 连接**。
> 这套方案在 Windows + Edge 下已验证可用。`_pdf.js` 就是完整可运行的例子。

```js
const { spawn } = require('child_process');
const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');

const HTML = 'file://' + path.resolve(__dirname, '你的.html').replace(/\\/g, '/');
const OUT = path.join(__dirname, '输出.pdf');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9229;                 // 固定调试端口
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // ① 手动启动无头 Edge
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
  if (!ready) { console.error('Edge 未就绪'); edge.kill('SIGKILL'); process.exit(1); }

  // ② 连接而不是 launch
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 900 });
  await page.goto(HTML, { waitUntil: 'load', timeout: 60000 });

  // ③ 模拟打印媒体 + 运行页面里的 fitPages 缩放
  await page.emulateMediaType('print');
  await page.evaluate(() => { if (window.__fitPages) window.__fitPages(); });

  // ④ 冻结动画（见第 4 节）
  await page.addStyleTag({ content: '动画选择器{animation:none}' });

  // ⑤ 导出 PDF（必须用 preferCSSPageSize 才能读 @page 的 A4 横向尺寸）
  await page.pdf({ path: OUT, preferCSSPageSize: true, printBackground: true });

  await browser.disconnect();
  edge.kill('SIGKILL');
  console.log('WROTE', OUT);
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
```

**需要按你的环境改的**：
- `EDGE` 路径 → 你机器上的 Edge/Chrome 可执行文件路径。
- `PORT` → 换成别的端口也行，但**手动 spawn 的端口必须和 connect 的端口一致**。
- 若是 Chrome，去掉 `--edge-skip-compat-layer-relaunch` 这个 Edge 专用参数。

---

## 6. 页数自检（重要）

导出后务必数一下 PDF 页数，应该 = 区块数。校验方法：

```js
const fs = require('fs');
function countPages(buf) {
  const s = Buffer.from(buf).toString('latin1');
  return (s.match(/\/Type\s*\/Page\b/g) || []).length;
}
const n = countPages(fs.readFileSync(OUT));
console.log('pages:', n);   // 应该等于 .hero + .section 的个数
```

**如果页数 > 区块数**，按顺序排查：
1. 某个区块在打印 CSS 里没吃到固定 `height:210mm`（选择器没覆盖到 / 被更高特异性的 `min-height` 覆盖）→ 检查 `.hero,.section{height:210mm;min-height:0;overflow:hidden}` 是否生效（见第 0 节坑 1）。
2. 某区块自带 `margin-top` → 在打印 CSS 里补一行 `xxx{margin:0}`（见第 0 节坑 2，本项目就是 footer 的 20px）。
3. 页面里存在 `.hero, .section` 之外、不该参与分页的流内元素（如没隐藏的 `position:static` 的元素）→ 在打印 CSS 里 `display:none` 或归入某个区块。

---

## 7. 本项目（portfolio/index.html）的现状

- 区块：`.hero` + 8 个 `.section`（about / templates / generators / layouts / interaction / fx / export / contact），共 **9 页**。
- 已实现的定制：
  - 模板 gallery 固定 **4 列 2 行**（上下各 4）。
  - 3×3 宫格的倾斜（`transform: rotate(-3deg)`）已**扶正**为 `none`。
  - 导出页轮播**定格第 1 张（L）**；书写动画**定格"写一半"**（`clip-path:inset(0 50% 0 0)`）。
  - footer 的 20px margin 已在打印 CSS 中覆盖（否则会多出 1 页）。
  - 区块采用 **flex 行方向居中**，缩放只做 `scale()`，**没有 translateY**——这是凌晨版「完美 PDF」的布局，保证超页高内容（模板页、滤镜页）标题不被裁掉。
  - 交互页（第 6 页）「哈气起雾」LOVE **完整显示**（`clip-path:inset(0)`，动画冻结）。
  - 滤镜页（第 7 页）`.fx-wrap` 在打印 CSS 里**强制横向双列**（`#fx .fx-wrap{grid-template-columns:340px 1fr !important}`）——page.pdf() 分页重排时内部宽度收窄，会让 `@media(max-width:820px)` 把双列 grid 塌成单列、只剩一张铺满的大图且该页文本全丢；`!important` 双列规则压住它，保证导出为横向排版（stage 在左、controls 在右，与凌晨版一致）。
  - **不要**给 hero / contact 的 `.print-fit` 单独限宽居中——flex 居中已处理，加了就是多余改动。
- 已验证：导出 PDF **9 页**，9 页标题均在页内（模板页标题 top=50、滤镜页 top=64）。

---

## 8. 常用备忘

| 想实现 | 改哪里 |
|---|---|
| 改页边距 | CSS `.print-fit` 的 `padding` + JS 缩放目标 `208` 同步 |
| 改纸张方向/尺寸 | `@page{size:A4 landscape}` → `portrait` 或 `A3` |
| 某区块不想分页 | 从 `.section` 选择器里排除它，或去掉它的 `break-before:page` |
| 想让某区块强制新页 | 保留 `break-before:page` |
| 手动浏览器打印 | 页面 JS 已挂 `beforeprint`，直接 Ctrl+P 也能得到同样效果 |
| 动画定格到指定帧 | 打印 CSS 里用静态样式覆盖 + `_pdf.js` 注入 `animation:none` |
| 页面内容超高被裁 | 检查 JS 是否误加了 `translateY`；应只保留 `scale()`，让 flex 居中兜底 |

---

## 9. 快速上手：把陌生 HTML 接进来（10 步）

目标：把一个已能正常浏览的 HTML 页面，按区块（`<section>` 等）切成多张横向 A4 导出。**先保证屏幕上的排版 OK，再接入导出**——导出不改屏幕样式，只加打印层。

1. **确认区块结构**：每个"一页"应是一个独立的根级块（`.hero` / `.section`），块之间不共用容器。导出脚本按选择器 `.hero, .section` 识别区块；块外面套了 `.section-inner` 之类的居中容器没关系，JS 会把块内所有子元素整体包进 `.print-fit`。
2. **贴入打印 CSS**（`</style>` 前）：照第 2 节复制，改三处——`.hero,.section` → 你的区块选择器；`.reveal` → 你的滚动渐显类（没有就删掉那行）；`footer.section{margin-top:0}` → 你页面里带 margin 的区块，逐个补一行 `xxx{margin:0}`。
3. **贴入打印 JS**（`</body>` 前）：照第 3 节复制，通常零改动即用（它只识别 `.hero,.section` 与 `.print-fit`）。
4. **配平缩放目标**：`.print-fit` 的 `padding:16mm 14mm` 与 JS 的缩放目标 `208`（= 210 − 16×2）必须配平；改了 padding 就同步改 JS。
5. **镇压屏幕 min-height**：打印 CSS 已统一 `min-height:0`，但如果某区块的屏幕 `min-height` 带 `!important` 或超高特异性，会顶破 `height:210mm` 造成分页错乱——单独补一行覆盖。
6. **冻结动画**：`_pdf.js` 里 `addStyleTag` 注入 `选择器{animation:none}`；想定格在某一帧，在打印 CSS 里用静态样式覆盖（见第 4 节）。
7. **写导出脚本**：复制 `_pdf.js`，只需改 `HTML`、`OUT`、`EDGE` 三个路径。
8. **跑一遍看拟合**：`node _pdf.js`。看输出 `per-section fit`——每块 `renderedH` 应 ≤ ~794px（210mm）；`tf=scale(...)` 表示该页被等比缩小过（正常）。
9. **验页数**：输出末尾 `pages:` 应等于区块数。多了就按第 6 节排查：margin、min-height、漏网的流内元素。
10. **查特殊布局**：若某页含「多列 grid + 固定宽高比 + 绝对定位」结构，导出后打开 PDF 确认该页排版正常；若被塌成一列，按第 0 节最后一条在 `@media print` 里加 `!important` 双列规则。
