export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. होमपेज या स्टैटिक फाइलें (इमेजेज आदि) सर्व करें
    if (path === '/' || path.includes('.')) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Assets binding missing", { status: 500 });
    }

    // 2. स्लग के लिए प्रोडक्ट पेज जनरेट करें
    const slug = path.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!slug) return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });

    try {
      const product = await getProductBySlug(slug);
      if (!product) return notFound(slug);
      
      return new Response(renderProductPage(product), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    } catch (e) {
      return new Response(`<h1>Error</h1><p>${e.message}</p>`, { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
  }
};

// ====== Firestore से डेटा लाना ======
async function getProductBySlug(slug) {
  const projectId = 'trendoye-app';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'products' }],
        where: { fieldFilter: { field: { fieldPath: 'slug' }, op: 'EQUAL', value: { stringValue: slug } } },
        limit: 1
      }
    })
  });

  if (!res.ok) throw new Error('Firestore API error: ' + res.status);
  const data = await res.json();
  const doc = data[0]?.document;
  if (!doc) return null;
  return parseFirestoreDoc(doc);
}

function parseFirestoreDoc(doc) {
  const obj = { id: doc.name?.split('/').pop() };
  const fields = doc.fields || {};
  for (const [key, value] of Object.entries(fields)) {
    if ('stringValue' in value) obj[key] = value.stringValue;
    else if ('integerValue' in value) obj[key] = Number(value.integerValue);
    else if ('doubleValue' in value) obj[key] = Number(value.doubleValue);
    else if ('booleanValue' in value) obj[key] = value.booleanValue;
    else if ('timestampValue' in value) obj[key] = value.timestampValue;
    else if ('arrayValue' in value) {
      obj[key] = (value.arrayValue.values || []).map(v => v.stringValue ?? v.integerValue ?? v.doubleValue).filter(v => v != null);
    }
  }
  return obj;
}

// ====== HTML पेज जनरेट करना (हेडर और फुटर के साथ) ======
function renderProductPage(p) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const money = n => '₹ ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const images = [p.image, ...(Array.isArray(p.images) ? p.images : [])].filter(Boolean);
  const mainImg = images[0] || 'https://trendoye.aamir68599.workers.dev/trendy%201.webp'; // Fallback image
  const price = Number(p.price) || 0;
  const mrp   = Number(p.mrp) || 0;
  const off   = mrp > price ? Math.round((1 - price / mrp) * 100) : 0;
  const stock = Number(p.stock) || 0;
  const lowAt = Number(p.lowStockAt) || 5;
  const stTxt = stock <= 0 ? 'Out of Stock' : stock <= lowAt ? `Only ${stock} left` : 'In Stock';
  const stCls = stock <= 0 ? 'out' : (stock <= lowAt ? 'low' : 'in');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.name)} · TrendOye</title>
<style>
  /* --- आपके index.html वाले वेरिएबल्स --- */
  :root{--primary-pink:#d81b60;--gold-border:#c9a84c;--text-color:#1a1a1a;--border-color:#e0e0e0;--bg-white:#ffffff;--bg-announcement:#d81b60;--font-family:'Inter',sans-serif;--max-width:1280px}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:var(--font-family);color:var(--text-color);line-height:1.5;background:#fff}
  a{text-decoration:none;color:inherit} ul{list-style:none} img{max-width:100%;display:block}
  .container{max-width:var(--max-width);margin:0 auto;padding:0 24px}

  /* --- हेडर और नेविगेशन CSS --- */
  .announcement-bar{background:var(--bg-announcement);height:28px;display:flex;align-items:center;justify-content:center}
  .announcement-bar span{color:#fff;font-size:10px;font-weight:500;letter-spacing:1.8px;text-transform:uppercase}
  .main-header{height:80px;display:flex;align-items:center;border-bottom:1px solid var(--border-color)}
  .main-header .container{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;width:100%}
  .header-center{display:flex;justify-content:center}
  .header-center img{height:64px;object-fit:contain}
  .nav-menu{border-bottom:1px solid var(--border-color);height:52px;display:flex;align-items:center;justify-content:center}
  .nav-menu ul{display:flex;gap:40px}
  .nav-menu ul li a{font-size:11px;font-weight:500;letter-spacing:1.6px;text-transform:uppercase;transition:0.25s}
  .nav-menu ul li a:hover{color:var(--primary-pink)}

  /* --- प्रोडक्ट पेज का CSS --- */
  .crumb{padding:20px 0;font-size:11px;color:#777;text-transform:uppercase;letter-spacing:1px}
  .crumb a:hover{color:var(--primary-pink)}
  .product{display:grid;grid-template-columns:1fr 1fr;gap:48px;padding:10px 0 60px}
  .gallery .main{border:1px solid var(--border-color);background:#faf7f2;aspect-ratio:3/4;overflow:hidden}
  .gallery .main img{width:100%;height:100%;object-fit:cover}
  .thumbs{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
  .thumbs img{width:72px;height:90px;object-fit:cover;border:1px solid var(--border-color);cursor:pointer}
  .badge{display:inline-block;background:var(--primary-pink);color:#fff;font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:4px 10px;margin-bottom:12px}
  .info h1{font-size:clamp(20px,2.5vw,28px);font-weight:500;line-height:1.35}
  .price{margin-top:16px;font-size:20px;font-weight:700;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .price .mrp{font-size:14px;color:#777;text-decoration:line-through;font-weight:400}
  .price .off{font-size:13px;color:var(--primary-pink);font-weight:600}
  .stock{display:inline-flex;align-items:center;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;margin-top:18px}
  .stock.in{background:#ecfdf5;color:#059669}.stock.low{background:#fef3c7;color:#b45309}.stock.out{background:#fee2e2;color:#dc2626}
  .meta{margin-top:18px;font-size:13px;color:#444;display:grid;gap:6px}
  .qty{display:flex;align-items:center;margin-top:22px;width:fit-content;border:1px solid var(--border-color)}
  .qty button{width:40px;height:42px;background:#fff;border:none;font-size:16px;cursor:pointer}
  .qty input{width:50px;height:42px;text-align:center;border:none;border-left:1px solid var(--border-color);border-right:1px solid var(--border-color);font-size:14px}
  .actions{display:flex;gap:12px;margin-top:24px;flex-wrap:wrap}
  .btn{padding:15px 32px;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;cursor:pointer;border:none;display:inline-block;text-align:center}
  .btn.primary{background:var(--primary-pink);color:#fff}
  .btn.wa{background:#25D366;color:#fff}
  .desc{margin-top:28px;padding-top:24px;border-top:1px solid var(--border-color)}
  .desc h3{font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px}
  .desc p{font-size:14px;color:#444;white-space:pre-line}
  .back-link{display:inline-block;margin:18px 0 0;font-size:12px;color:#777;letter-spacing:1px;text-transform:uppercase}
  .back-link:hover{color:var(--primary-pink)}

  /* --- फुटर का CSS --- */
  .trendoye-footer{background:#f8c8d8;padding:50px 0 20px;margin-top:40px}
  .footer-bottom{text-align:center;font-size:11px;color:#666;padding-top:20px;border-top:1px solid rgba(0,0,0,0.1)}
  .footer-tags{display:flex;justify-content:center;gap:10px;margin-bottom:20px;flex-wrap:wrap}
  .footer-tags a{text-decoration:underline;font-size:12px;color:#1a1a1a}

  @media(max-width:768px){
    .product{grid-template-columns:1fr;gap:24px}
    .nav-menu{display:none} /* मोबाइल पर नेविगेशन छिपा दें */
  }
</style>
</head>
<body>

  <!-- ===== हेडर (index.html से कॉपी किया गया) ===== -->
  <div class="announcement-bar"><span>💛 Stunning Designer Wedding & Celebration Sarees</span></div>
  <header class="main-header">
    <div class="container">
      <div></div>
      <div class="header-center">
        <a href="/"><img src="https://trendoye.aamir68599.workers.dev/trendoye%20logo.avif" alt="TrendOye Logo"></a>
      </div>
      <div></div>
    </div>
  </header>
  <nav class="nav-menu">
    <ul>
      <li><a href="/">New Arrivals</a></li>
      <li><a href="/">Sarees</a></li>
      <li><a href="/">Lehengas</a></li>
      <li><a href="/">Occasions</a></li>
      <li><a href="/">Track Your Order</a></li>
    </ul>
  </nav>

  <!-- ===== मुख्य प्रोडक्ट सेक्शन ===== -->
  <main class="container">
    <nav class="crumb"><a href="/">Home</a> / ${esc(p.category || 'Sarees')} / ${esc(p.name || '')}</nav>
    <div class="product">
      <div class="gallery">
        <div class="main"><img id="mainImg" src="${esc(mainImg)}" alt="${esc(p.name || '')}"></div>
        ${images.length > 1 ? `<div class="thumbs">${images.map((g, i) => `<img class="${i === 0 ? 'active' : ''}" src="${esc(g)}" data-src="${esc(g)}" alt="">`).join('')}</div>` : ''}
      </div>
      <div class="info">
        ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
        <h1>${esc(p.name || '')}</h1>
        <div class="price">${money(price)}
          ${mrp > price ? `<span class="mrp">${money(mrp)}</span><span class="off">${off}% OFF</span>` : ''}
        </div>
        <div class="stock ${stCls}">● ${stTxt}</div>
        <div class="meta">
          ${p.color ? `<div><b>Color:</b> ${esc(p.color)}</div>` : ''}
          ${p.category ? `<div><b>Category:</b> ${esc(p.category)}</div>` : ''}
          ${p.sku ? `<div><b>SKU:</b> ${esc(p.sku)}</div>` : ''}
        </div>
        <div class="qty">
          <button onclick="document.getElementById('qty').value=Math.max(1,(parseInt(document.getElementById('qty').value)||1)-1)">−</button>
          <input id="qty" type="number" min="1" value="1">
          <button onclick="document.getElementById('qty').value=(parseInt(document.getElementById('qty').value)||1)+1">+</button>
        </div>
        <div class="actions">
          <button class="btn primary" ${stock <= 0 ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>Add to Cart</button>
          <a class="btn wa" href="https://wa.me/918169352474?text=${encodeURIComponent('Hi! I want to order: ' + (p.name || '') + ' (Link: https://trendoye.aamir68599.workers.dev/' + p.slug + ')')}" target="_blank">Order on WhatsApp</a>
        </div>
        ${p.description ? `<div class="desc"><h3>Description</h3><p>${esc(p.description)}</p></div>` : ''}
        <a class="back-link" href="/">← Back to home</a>
      </div>
    </div>
  </main>

  <!-- ===== फुटर (index.html से कॉपी किया गया) ===== -->
  <footer class="trendoye-footer">
    <div class="container">
      <div class="footer-bottom">
        <h3 style="font-size:15px;margin-bottom:12px;">Popular Searches</h3>
        <div class="footer-tags">
          <a href="#">Wedding Sarees</a><a href="#">Party Saree</a><a href="#">Banarasi Sarees</a><a href="#">Kanjivaram Sarees</a><a href="#">Designer Sarees</a>
        </div>
        <div class="copyright">© 2026 - TrendOye</div>
      </div>
    </div>
  </footer>

  <script>
    document.querySelectorAll('.thumbs img').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.thumbs img').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.getElementById('mainImg').src = t.dataset.src;
      };
    });
  </script>
</body>
</html>`;
}

function notFound(slug) {
  return new Response(`<h1>Product not found</h1><p>Slug: ${slug}</p><a href="/">Home</a>`, { status: 404, headers: { 'Content-Type': 'text/html' } });
}
