export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. अगर होमपेज (/) है या कोई फाइल (जैसे .webp, .avif, .css) मांगी गई है 
    // तो सीधा स्टैटिक एसेट्स (index.html, images) सर्व करो
    if (path === '/' || path.includes('.')) {
      // अगर ASSETS बाइंडिंग सेट नहीं है, तो एरर न आए इसलिए चेक किया जा रहा है
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return new Response("Assets binding not configured. Please add ASSETS binding in Worker settings.", { status: 500 });
    }

    // 2. अगर URL में कोई स्लग है (जैसे /red-silk-saree) तो प्रोडक्ट पेज जनरेट करो
    const slug = path.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!slug) {
        return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
    }

    try {
      const product = await getProductBySlug(slug);
      if (!product) return notFound(slug);
      
      // HTML पेज बनाकर रिटर्न करो
      return new Response(renderProductPage(product), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    } catch (e) {
      return new Response(`<h1>Error</h1><p>${e.message}</p>`, { status: 500, headers: { 'Content-Type': 'text/html' } });
    }
  }
};

// ====== Firestore से प्रोडक्ट डेटा लाने का फंक्शन ======
async function getProductBySlug(slug) {
  const projectId = 'trendoye-app'; // आपका फायरबेस प्रोजेक्ट आईडी
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'products' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'slug' },
            op: 'EQUAL',
            value: { stringValue: slug }
          }
        },
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

// ====== Firestore डेटा को पढ़ने लायक बनाना ======
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
      obj[key] = (value.arrayValue.values || [])
        .map(v => v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue)
        .filter(v => v != null);
    }
  }
  return obj;
}

// ====== प्रोडक्ट का HTML पेज बनाना ======
function renderProductPage(p) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const money = n => '₹ ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const images = [p.image, ...(Array.isArray(p.images) ? p.images : [])].filter(Boolean);
  const mainImg = images[0] || '';
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
<meta name="description" content="${esc((p.description || '').slice(0, 160))}">
<style>
  :root{--pink:#d81b60;--ink:#1a1a1a;--line:#e5e5e5;--muted:#777}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:var(--ink);line-height:1.6;background:#fff}
  img{display:block;max-width:100%} a{color:inherit;text-decoration:none}
  .container{max-width:1200px;margin:0 auto;padding:0 20px}
  .topbar{height:64px;display:flex;align-items:center;border-bottom:1px solid var(--line)}
  .logo{font-size:16px;font-weight:700;letter-spacing:3px;text-transform:uppercase}
  .logo span{color:var(--pink)}
  .crumb{padding:16px 0;font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase}
  .crumb a:hover{color:var(--pink)}
  .product{display:grid;grid-template-columns:1fr 1fr;gap:48px;padding:10px 0 60px}
  .gallery .main{border:1px solid var(--line);background:#faf7f2;aspect-ratio:3/4;overflow:hidden}
  .gallery .main img{width:100%;height:100%;object-fit:cover}
  .thumbs{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
  .thumbs img{width:72px;height:90px;object-fit:cover;border:1px solid var(--line);cursor:pointer}
  .thumbs img.active,.thumbs img:hover{border-color:var(--pink)}
  .badge{display:inline-block;background:var(--pink);color:#fff;font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:4px 10px;margin-bottom:12px}
  .info h1{font-size:clamp(20px,2.5vw,28px);font-weight:500;line-height:1.35;letter-spacing:.3px}
  .price{margin-top:16px;font-size:20px;font-weight:700;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .price .mrp{font-size:14px;color:var(--muted);text-decoration:line-through;font-weight:400}
  .price .off{font-size:13px;color:var(--pink);font-weight:600}
  .stock{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;margin-top:18px}
  .stock.in{background:#ecfdf5;color:#059669}.stock.low{background:#fef3c7;color:#b45309}.stock.out{background:#fee2e2;color:#dc2626}
  .meta{margin-top:18px;font-size:13px;color:#444;display:grid;gap:6px}
  .qty{display:flex;align-items:center;margin-top:22px;width:fit-content;border:1px solid var(--line)}
  .qty button{width:40px;height:42px;background:#fff;border:none;font-size:16px;cursor:pointer}
  .qty input{width:50px;height:42px;text-align:center;border:none;border-left:1px solid var(--line);border-right:1px solid var(--line);font-size:14px}
  .actions{display:flex;gap:12px;margin-top:24px;flex-wrap:wrap}
  .btn{padding:15px 32px;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;cursor:pointer;border:none;transition:.2s;display:inline-block;text-align:center}
  .btn.primary{background:var(--pink);color:#fff}.btn.primary:hover{background:#b0154e}
  .btn.wa{background:#25D366;color:#fff}.btn.wa:hover{background:#1ebe5a}
  .desc{margin-top:28px;padding-top:24px;border-top:1px solid var(--line)}
  .desc h3{font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px}
  .desc p{font-size:14px;color:#444;white-space:pre-line}
  .back-link{display:inline-block;margin:18px 0 0;font-size:12px;color:var(--muted);letter-spacing:1px;text-transform:uppercase}
  .back-link:hover{color:var(--pink)}
  @media(max-width:768px){.product{grid-template-columns:1fr;gap:24px}}
</style>
</head>
<body>
<header class="topbar"><div class="container"><a class="logo" href="/">TrendOye<span>.</span></a></div></header>
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
        <a class="btn wa" href="https://wa.me/918169352474?text=${encodeURIComponent('Hi! I want: ' + (p.name || '') + ' — ' + (p.slug || ''))}" target="_blank" rel="noopener">Order on WhatsApp</a>
      </div>
      ${p.description ? `<div class="desc"><h3>Description</h3><p>${esc(p.description)}</p></div>` : ''}
      <a class="back-link" href="/">← Back to home</a>
    </div>
  </div>
</main>
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

// ====== 404 पेज (अगर प्रोडक्ट न मिले) ======
function notFound(slug) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not found · TrendOye</title>
    <style>body{font-family:sans-serif;padding:60px 20px;text-align:center;background:#fff;color:#1a1a1a} h1{font-size:26px;margin-bottom:12px} a{color:#d81b60;text-decoration:none;font-weight:600}</style>
    </head><body><h1>Product not found</h1><p>Ye product exist nahi karta ya remove ho gaya hai.</p><p style="margin-top:20px"><a href="/">← Back to home</a></p></body></html>`,
    { status: 404, headers: { 'Content-Type': 'text/html' } }
  );
}
