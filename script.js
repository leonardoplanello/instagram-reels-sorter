/**
 * ╔══════════════════════════════════════════════════════════════╗
 *  INSTAGRAM REELS SORTER  v7.0
 *  Scrapes: URL · Views · Likes
 *  Exports: CSV ordered by views
 * 
 *  FEATURES:
 *  ✓ Restored the beautiful, drag-and-drop HUD interface & Wave FX.
 *  ✓ Removed blocked Web Worker (Fixes frozen timer/0 scrolls).
 *  ✓ Robust Likes & Views extraction from image alt-text.
 *  ✓ Aggressive scrolling engine (reaches the true bottom).
 *  ✓ Fully translated UI and Logs to English.
 * ╔══════════════════════════════════════════════════════════════╗
 */
(function () {
  if (window.__reelsSorterRunning) {
    console.warn('[ReelsSorter] Already running. Reload the page to restart.');
    return;
  }
  window.__reelsSorterRunning = true;

  /* ════════════════════════════════════════════════════════════
     CONFIGURATIONS
  ════════════════════════════════════════════════════════════ */
  var CFG = {
    scrollPause:       1200,      /* base pause between scrolls */
    maxStaleCycles:    15,        /* cycles without new reels before stopping */
    maxTotalScrolls:   3000,      /* max absolute scrolls */
    logPrefix:         '[ReelsSorter]',
    mutationBatch:     80,
    confirmBottomRuns: 4,         /* bottom confirmations before stopping */
  };

  /* ════════════════════════════════════════════════════════════
     STATE
  ════════════════════════════════════════════════════════════ */
  var state = {
    reels:            {},
    scrollCount:      0,
    staleCycles:      0,
    running:          false,
    finished:         false,
    startTime:        Date.now(),
    profileName:      '',
    lastHeight:       0,
    totalAdded:       0,
    bottomConfirms:   0,
    lastNewReelTime:  Date.now()
  };

  /* ════════════════════════════════════════════════════════════
     UTILITIES
  ════════════════════════════════════════════════════════════ */
  function parseCount(raw) {
    if (!raw) return 0;
    var s = String(raw).toLowerCase().trim();
    var mult = 1;
    
    if (s.includes('mil') || s.includes('k')) mult = 1000;
    else if (s.includes('mi') || s.includes('m')) mult = 1000000;
    else if (s.includes('b')) mult = 1000000000;

    var numStr = s.replace(/[^\d,.]/g, '');
    var isDecimal = s.match(/(k|m|mi|mil|b)/i);
    
    if (!isDecimal) {
      numStr = numStr.replace(/[.,]/g, '');
      return parseInt(numStr, 10) || 0;
    } else {
      numStr = numStr.replace(/,/g, '.');
      return Math.round(parseFloat(numStr) * mult) || 0;
    }
  }

  function log(msg) { console.log(CFG.logPrefix + ' ' + msg); }

  function elapsed() {
    var s = Math.round((Date.now() - state.startTime) / 1000);
    if (s < 60) return s + 's';
    return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  }

  function resolveProfile() {
    var m = location.pathname.match(/^\/([^/]+)/);
    if (m && m[1] && m[1] !== 'reel' && m[1] !== 'p') {
      state.profileName = m[1];
      return;
    }
    var h = document.querySelector('h2') || document.querySelector('h1');
    if (h) state.profileName = h.textContent.trim().replace(/[^a-zA-Z0-9._]/g, '');
  }

  function buildFilename() {
    var d   = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    var profile = state.profileName ? '@' + state.profileName + '_' : '';
    return 'reels_' + profile + date + '.csv';
  }

  /* ════════════════════════════════════════════════════════════
     DOM DATA EXTRACTION (v7 Robust Logic)
  ════════════════════════════════════════════════════════════ */
  function collectFromDOM() {
    var added = 0;
    var links = document.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]');
    
    for (var i = 0; i < links.length; i++) {
      var a   = links[i];
      var url = a.href.split('?')[0].replace(/\/$/, '') + '/';
      
      var views = 0, likes = 0, thumb = '';

      var text = a.innerText.trim();
      if (text) {
        var parsedText = parseCount(text);
        if (parsedText > 0) views = parsedText;
      }

      var img = a.querySelector('img');
      if (img) {
        thumb = img.src;
        var alt = (img.alt || '').toLowerCase();
        
        var likesMatch = alt.match(/([\d,.]+)\s*(mil|mi|k|m|b)?\s*(likes|curtidas|gostos|j'aime|mi piace)/i);
        if (likesMatch) likes = parseCount(likesMatch[1] + (likesMatch[2] || ''));
        
        var viewsMatch = alt.match(/([\d,.]+)\s*(mil|mi|k|m|b)?\s*(plays|views|visualizações|reproduções|reprod)/i);
        if (viewsMatch && views === 0) views = parseCount(viewsMatch[1] + (viewsMatch[2] || ''));
      }

      if (views > 0 || likes > 0) {
        if (state.reels[url]) {
          var r = state.reels[url];
          if (r.views === 0 && views > 0) r.views = views;
          if (r.likes === 0 && likes > 0) r.likes = likes;
          if (!r.thumb && thumb) r.thumb = thumb;
          continue;
        }

        var mc = url.match(/\/(reel|p)\/([^/]+)/);
        state.reels[url] = {
          url:       url,
          shortcode: mc ? mc[2] : '',
          views:     views,
          likes:     likes,
          thumb:     thumb
        };
        added++;
      }
    }
    state.totalAdded += added;
    return added;
  }

  /* ════════════════════════════════════════════════════════════
     MUTATION OBSERVER
  ════════════════════════════════════════════════════════════ */
  var _mutationTimer = null, _observer = null;
  function startObserver() {
    _observer = new MutationObserver(function (mutations) {
      var relevant = mutations.some(function (m) {
        return Array.prototype.some.call(m.addedNodes, function (n) {
          return n.nodeType === 1 && n.querySelector && n.querySelector('a[href*="/reel/"]');
        });
      });
      if (!relevant) return;
      clearTimeout(_mutationTimer);
      _mutationTimer = setTimeout(function () {
        var added = collectFromDOM();
        if (added > 0) {
          state.staleCycles = 0; state.bottomConfirms = 0; state.lastNewReelTime = Date.now();
          updatePanel(true);
          refreshTableIfOpen();
        }
      }, CFG.mutationBatch);
    });
    _observer.observe(document.body, { childList: true, subtree: true });
  }
  function stopObserver() { if (_observer) { _observer.disconnect(); _observer = null; } }

  /* ════════════════════════════════════════════════════════════
     SCROLLING ENGINE
  ════════════════════════════════════════════════════════════ */
  function getScrollTop()    { return document.documentElement.scrollTop || document.body.scrollTop || 0; }
  function getScrollHeight() { return document.documentElement.scrollHeight || document.body.scrollHeight || 0; }
  function getClientHeight() { return document.documentElement.clientHeight || window.innerHeight || 0; }
  
  function isAtBottom() { return (getScrollHeight() - getScrollTop() - getClientHeight()) < 400; }
  function pageGrew() {
    var h = getScrollHeight();
    if (h > state.lastHeight + 50) { state.lastHeight = h; return true; }
    return false;
  }

  function scrollLoop() {
    if (!state.running) return;
    if (state.scrollCount >= CFG.maxTotalScrolls) { finish('reached scroll limit'); return; }

    window.scrollTo(0, getScrollHeight());
    state.scrollCount++;

    var pause = state.staleCycles > 5 ? CFG.scrollPause * 1.5 : CFG.scrollPause;

    setTimeout(function () {
      var added = collectFromDOM();
      var grew  = pageGrew();
      var atBot = isAtBottom();

      if (added > 0) {
        state.staleCycles = 0; state.bottomConfirms = 0; state.lastNewReelTime = Date.now();
        log('+' + added + ' reels (total: ' + Object.keys(state.reels).length + ')');
        refreshTableIfOpen();
      } else if (!grew) {
        state.staleCycles++;
        log('No new items [' + state.staleCycles + '/' + CFG.maxStaleCycles + ']');
        
        if (state.staleCycles % 3 === 0) {
          window.scrollBy(0, -600);
          setTimeout(function() { window.scrollTo(0, getScrollHeight()); }, 300);
        }
        
        if (atBot) state.bottomConfirms++;
        else state.bottomConfirms = 0;
      } else {
        state.staleCycles = Math.max(0, state.staleCycles - 2);
        state.bottomConfirms = 0;
      }

      updatePanel(added > 0);

      if (state.staleCycles >= CFG.maxStaleCycles || (atBot && state.bottomConfirms >= CFG.confirmBottomRuns)) {
        finish('reached end of page'); return;
      }
      setTimeout(scrollLoop, pause);
    }, pause);
  }

  /* ════════════════════════════════════════════════════════════
     CSV EXPORT
  ════════════════════════════════════════════════════════════ */
  function getSorted() { return Object.values(state.reels).sort(function (a, b) { return b.views - a.views; }); }
  function buildCSV() {
    var sorted = getSorted();
    var rows = ['Rank,URL,Shortcode,Views,Likes'];
    for (var i = 0; i < sorted.length; i++) {
      var r = sorted[i];
      rows.push([i + 1, '"' + r.url + '"', r.shortcode, r.views, r.likes].join(','));
    }
    return rows.join('\n');
  }
  function downloadCSV() {
    var csv  = buildCSV();
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = buildFilename();
    a.click();
    URL.revokeObjectURL(a.href);
    log('CSV saved: ' + a.download + ' (' + Object.keys(state.reels).length + ' reels)');
  }

  /* ════════════════════════════════════════════════════════════
     FULL-SCREEN TABLE
  ════════════════════════════════════════════════════════════ */
  var $tableOverlay = null, $tableLiveBar = null, _tableRefreshId = null;

  function refreshTableLiveBar() {
    if (!$tableLiveBar) return;
    var total    = Object.keys(state.reels).length;
    var withV    = Object.values(state.reels).filter(function(r){ return r.views > 0; }).length;
    var sorted   = getSorted();
    var maxV     = sorted.length > 0 ? sorted[0].views : 0;
    var status   = state.finished ? 'DONE' : 'COLLECTING';
    var statusClr= state.finished ? '#60a5fa' : '#4ade80';
    var pct      = Math.min(100, (state.staleCycles / CFG.maxStaleCycles) * 100);
    
    var liveItems = $tableLiveBar.querySelectorAll('[data-live]');
    if (liveItems.length === 0) return;
    for (var i = 0; i < liveItems.length; i++) {
      var el = liveItems[i], key = el.getAttribute('data-live');
      if (key === 'status') { el.textContent = status; el.style.color = statusClr; }
      else if (key === 'total')    el.textContent = total.toLocaleString('en-US');
      else if (key === 'views')    el.textContent = withV.toLocaleString('en-US');
      else if (key === 'maxviews') el.textContent = maxV > 0 ? maxV.toLocaleString('en-US') : '—';
      else if (key === 'elapsed')  el.textContent = elapsed();
      else if (key === 'scrolls')  el.textContent = state.scrollCount;
      else if (key === 'progress') el.style.width  = pct + '%';
      else if (key === 'stale')    el.textContent = state.staleCycles + '/' + CFG.maxStaleCycles;
    }
  }

  function refreshTableIfOpen() {
    if (!$tableOverlay) return;
    var $tbody = document.getElementById('__rsTbody');
    if (!$tbody) return;
    var $search = document.getElementById('__rsSearch');
    var q = $search ? $search.value.trim().toLowerCase() : '';
    var data = getSorted();
    if (q) data = data.filter(function(r){ return r.url.toLowerCase().includes(q) || (r.shortcode||'').toLowerCase().includes(q); });
    buildTableRows($tbody, data);
    refreshTableLiveBar();
  }

  function buildTableRows($tbody, data) {
    $tbody.innerHTML = '';
    var maxV = data.length > 0 ? (data[0].views || 1) : 1;
    data.forEach(function (r, i) {
      var tr = document.createElement('tr');
      tr.style.animationDelay = Math.min(i * 0.015, 0.35) + 's';
      var rowBg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.012)';
      function td(content, align, extra) {
        var cell = document.createElement('td');
        Object.assign(cell.style, { padding:'11px 16px', textAlign:align || 'left', background:rowBg, borderBottom:'1px solid rgba(255,255,255,.04)', verticalAlign:'middle' });
        if (extra) Object.assign(cell.style, extra);
        if (typeof content === 'string') cell.innerHTML = content; else cell.appendChild(content);
        return cell;
      }
      var rankSpan = document.createElement('span');
      rankSpan.textContent = '#' + (i + 1);
      Object.assign(rankSpan.style, { fontFamily:'"Space Mono", monospace', fontWeight:'700', fontSize:'13px', color:i === 0 ? '#fbbf24' : i === 1 ? '#cbd5e1' : i === 2 ? '#d97706' : 'rgba(255,255,255,.2)' });
      if (i < 3) rankSpan.style.textShadow = i === 0 ? '0 0 12px rgba(251,191,36,.5)' : '';
      tr.appendChild(td(rankSpan, 'center'));

      var infoCell = document.createElement('td');
      Object.assign(infoCell.style, { padding:'10px 16px', background:rowBg, borderBottom:'1px solid rgba(255,255,255,.04)', verticalAlign:'middle' });
      var infoWrap = document.createElement('div');
      Object.assign(infoWrap.style, { display:'flex', alignItems:'center', gap:'12px' });
      if (r.thumb) {
        var img = document.createElement('img'); img.src = r.thumb;
        Object.assign(img.style, { width:'44px', height:'44px', borderRadius:'8px', objectFit:'cover', flexShrink:'0', border:'1px solid rgba(255,255,255,.08)', background:'#1a1a2e' });
        img.loading = 'lazy'; img.onerror = function () { img.style.display = 'none'; };
        infoWrap.appendChild(img);
      } else {
        var ph = document.createElement('div');
        Object.assign(ph.style, { width:'44px', height:'44px', borderRadius:'8px', background:'rgba(255,255,255,.05)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', flexShrink:'0', border:'1px solid rgba(255,255,255,.06)', color:'rgba(255,255,255,.15)' });
        ph.textContent = '▶'; infoWrap.appendChild(ph);
      }
      var textBlock = document.createElement('div'), codeEl = document.createElement('div');
      codeEl.textContent = r.shortcode || '—';
      Object.assign(codeEl.style, { fontFamily:'"Space Mono", monospace', fontSize:'12px', fontWeight:'700', color:'rgba(255,255,255,.7)' });
      var urlEl = document.createElement('div'); urlEl.textContent = r.url.replace('https://www.instagram.com','');
      Object.assign(urlEl.style, { fontSize:'11px', color:'rgba(255,255,255,.2)', marginTop:'2px', fontFamily:'"Space Mono", monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'160px' });
      textBlock.appendChild(codeEl); textBlock.appendChild(urlEl); infoWrap.appendChild(textBlock); infoCell.appendChild(infoWrap); tr.appendChild(infoCell);

      var viewsCell = document.createElement('td');
      Object.assign(viewsCell.style, { padding:'12px 16px', textAlign:'right', background:rowBg, borderBottom:'1px solid rgba(255,255,255,.04)', verticalAlign:'middle' });
      var viewsWrap = document.createElement('div');
      Object.assign(viewsWrap.style, { display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'5px' });
      var viewNum = document.createElement('div');
      viewNum.textContent = r.views > 0 ? r.views.toLocaleString('en-US') : '—';
      Object.assign(viewNum.style, { fontFamily:'"Space Mono", monospace', fontWeight:'700', fontSize:'14px', color: r.views > 0 ? '#fff' : 'rgba(255,255,255,.2)' });
      var barWrap = document.createElement('div');
      Object.assign(barWrap.style, { position:'relative', height:'4px', borderRadius:'2px', background:'rgba(255,255,255,.06)', overflow:'hidden', minWidth:'80px' });
      var barFill = document.createElement('div');
      Object.assign(barFill.style, { position:'absolute', left:'0', top:'0', height:'100%', borderRadius:'2px', width:'0%', transition:'width .5s cubic-bezier(.4,0,.2,1)', background: i === 0 ? 'linear-gradient(90deg,#fbbf24,#f59e0b)' : 'linear-gradient(90deg,#818cf8,#6366f1)' });
      barWrap.appendChild(barFill); viewsWrap.appendChild(viewNum); viewsWrap.appendChild(barWrap); viewsCell.appendChild(viewsWrap); tr.appendChild(viewsCell);
      setTimeout(function(bf, pct){ bf.style.width = pct + '%'; }, 50 + i*12, barFill, maxV > 0 ? (r.views / maxV * 100) : 0);

      var likesSpan = document.createElement('span');
      likesSpan.textContent = r.likes > 0 ? r.likes.toLocaleString('en-US') : '—';
      Object.assign(likesSpan.style, { fontFamily:'"Space Mono", monospace', fontWeight:'700', fontSize:'13px', color: r.likes > 0 ? 'rgba(248,113,113,.85)' : 'rgba(255,255,255,.15)' });
      tr.appendChild(td(likesSpan, 'right'));

      var btnOpen = document.createElement('a'); btnOpen.href = r.url; btnOpen.target = '_blank'; btnOpen.textContent = '↗ Open';
      Object.assign(btnOpen.style, { display:'inline-block', padding:'5px 11px', borderRadius:'7px', background:'rgba(99,102,241,.12)', border:'1px solid rgba(99,102,241,.2)', color:'#a5b4fc', fontSize:'11px', fontWeight:'700', textDecoration:'none', fontFamily:'"Syne", sans-serif', transition:'all .2s' });
      tr.appendChild(td(btnOpen, 'center'));
      $tbody.appendChild(tr);
    });
    if (data.length === 0) {
      var emptyRow = document.createElement('tr'), emptyCell = document.createElement('td'); emptyCell.colSpan = 5;
      Object.assign(emptyCell.style, { padding:'60px 20px', textAlign:'center', color:'rgba(255,255,255,.2)', fontSize:'14px' });
      emptyCell.textContent = 'No reels found.'; emptyRow.appendChild(emptyCell); $tbody.appendChild(emptyRow);
    }
  }

  function showTable() {
    if ($tableOverlay) { closeTable(); return; }
    if ($panel) $panel.style.display = 'none';
    var styleId = '__rsTableStyles';
    if (!document.getElementById(styleId)) {
      var s = document.createElement('style'); s.id = styleId;
      s.textContent = [
        '@import url("https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Space+Mono:wght@400;700&display=swap");',
        '@keyframes rs-tbl-row{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}',
        '@keyframes rs-tbl-fade{from{opacity:0}to{opacity:1}}',
        '@keyframes rs-live-pulse{0%,100%{opacity:1}50%{opacity:.4}}',
        '#__rsTableOverlay *{box-sizing:border-box;font-family:"Syne",sans-serif}',
        '#__rsTableOverlay ::-webkit-scrollbar{width:6px;height:6px}',
        '#__rsTableOverlay ::-webkit-scrollbar-track{background:rgba(255,255,255,.03)}',
        '#__rsTableOverlay ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:3px}',
        '#__rsTbody tr{animation:rs-tbl-row .25s ease both}',
        '#__rsTbody tr:hover td{background:rgba(255,255,255,.04)!important}',
        '.rs-live-dot{width:7px;height:7px;border-radius:50%;background:#4ade80;animation:rs-live-pulse 1.5s ease-in-out infinite;flex-shrink:0}',
        '.rs-live-dot.done{background:#60a5fa;animation:none}'
      ].join('\n');
      document.head.appendChild(s);
    }
    $tableOverlay = document.createElement('div'); $tableOverlay.id = '__rsTableOverlay';
    Object.assign($tableOverlay.style, { position:'fixed', inset:'0', zIndex:'2147483646', background:'#080810', display:'flex', flexDirection:'column', overflow:'hidden', animation:'rs-tbl-fade .3s ease' });

    var grain = document.createElement('div');
    Object.assign(grain.style, { position:'absolute', inset:'0', pointerEvents:'none', opacity:'0.025', backgroundImage:'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundSize:'200px 200px', zIndex:'1' });
    $tableOverlay.appendChild(grain);

    $tableLiveBar = document.createElement('div');
    Object.assign($tableLiveBar.style, { display:'flex', alignItems:'center', gap:'0', padding:'0', background:'rgba(255,255,255,.015)', borderBottom:'1px solid rgba(255,255,255,.07)', position:'relative', zIndex:'2', flexShrink:'0', flexDirection:'column' });
    
    var statsRow = document.createElement('div');
    Object.assign(statsRow.style, { display:'flex', alignItems:'center', gap:'8px', padding:'10px 24px 8px', width:'100%', flexWrap:'wrap' });

    var logo = document.createElement('div');
    Object.assign(logo.style, { width:'32px', height:'32px', borderRadius:'10px', background:'linear-gradient(135deg,#feda77 0%,#f58529 25%,#dd2a7b 50%,#8134af 75%,#515bd4 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', flexShrink:'0', color:'#fff', boxShadow:'0 4px 12px rgba(221,42,123,.35)', marginRight:'4px' });
    logo.textContent = '▶';
    
    var titleEl = document.createElement('div'); titleEl.textContent = 'Reels Sorter';
    Object.assign(titleEl.style, { fontWeight:'800', fontSize:'15px', color:'#fff', letterSpacing:'-.4px', marginRight:'4px' });
    
    var profileEl = document.createElement('div'); profileEl.textContent = state.profileName ? '@' + state.profileName : location.hostname;
    Object.assign(profileEl.style, { fontSize:'12px', fontWeight:'600', color:'rgba(165,180,252,.6)', fontFamily:'"Space Mono", monospace', marginRight:'16px' });

    var liveGroup = document.createElement('div');
    Object.assign(liveGroup.style, { display:'flex', alignItems:'center', gap:'6px', padding:'4px 10px', borderRadius:'99px', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', marginRight:'8px' });
    var liveDot = document.createElement('div'); liveDot.className = 'rs-live-dot' + (state.finished ? ' done' : '');
    var liveStatus = document.createElement('div'); liveStatus.setAttribute('data-live', 'status'); liveStatus.textContent = state.finished ? 'DONE' : 'COLLECTING';
    Object.assign(liveStatus.style, { fontSize:'10px', fontWeight:'700', letterSpacing:'.6px', color: state.finished ? '#60a5fa' : '#4ade80', fontFamily:'"Space Mono", monospace' });
    liveGroup.appendChild(liveDot); liveGroup.appendChild(liveStatus);

    function liveChip(label, key, color) {
      var chip = document.createElement('div'); Object.assign(chip.style, { display:'flex', flexDirection:'column', gap:'1px', padding:'5px 11px', borderRadius:'8px', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.07)', minWidth:'64px', marginRight:'4px' });
      var val = document.createElement('div'); val.setAttribute('data-live', key); val.textContent = '—';
      Object.assign(val.style, { fontSize:'15px', fontWeight:'700', color: color, fontFamily:'"Space Mono", monospace', lineHeight:'1.1' });
      var lbl = document.createElement('div'); lbl.textContent = label;
      Object.assign(lbl.style, { fontSize:'8.5px', fontWeight:'700', letterSpacing:'.6px', color:'rgba(255,255,255,.25)' });
      chip.appendChild(val); chip.appendChild(lbl); return chip;
    }

    var metaEl = document.createElement('div'); Object.assign(metaEl.style, { display:'flex', gap:'12px', marginLeft:'4px', fontSize:'11px', color:'rgba(255,255,255,.25)', fontFamily:'"Space Mono", monospace' });
    var elapsedSpan = document.createElement('span'), elapsedVal  = document.createElement('span'); elapsedVal.setAttribute('data-live', 'elapsed'); elapsedSpan.textContent = '⏱ '; elapsedSpan.appendChild(elapsedVal);
    var scrollSpan = document.createElement('span'), scrollVal  = document.createElement('span'); scrollVal.setAttribute('data-live', 'scrolls'); scrollSpan.textContent = '↕ '; scrollSpan.appendChild(scrollVal);
    var staleSpan = document.createElement('span'), staleVal  = document.createElement('span'); staleVal.setAttribute('data-live', 'stale'); staleSpan.textContent = '⚡ '; staleSpan.appendChild(staleVal);
    metaEl.appendChild(elapsedSpan); metaEl.appendChild(scrollSpan); metaEl.appendChild(staleSpan);

    var spacer = document.createElement('div'); spacer.style.flex = '1';

    var searchWrap = document.createElement('div'); Object.assign(searchWrap.style, { position:'relative', display:'flex', alignItems:'center' });
    var searchIcon = document.createElement('div'); searchIcon.textContent = '⌕'; Object.assign(searchIcon.style, { position:'absolute', left:'11px', fontSize:'16px', color:'rgba(255,255,255,.25)', pointerEvents:'none', lineHeight:'1' });
    var $search = document.createElement('input'); $search.id = '__rsSearch'; $search.placeholder = 'Filter reels…';
    Object.assign($search.style, { background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:'10px', color:'#e2e8f0', fontSize:'13px', padding:'8px 12px 8px 32px', outline:'none', width:'200px', fontFamily:'"Syne", sans-serif' });
    $search.oninput = function(){ refreshTableIfOpen(); };
    searchWrap.appendChild(searchIcon); searchWrap.appendChild($search);

    var btns = document.createElement('div'); Object.assign(btns.style, { display:'flex', gap:'8px', flexShrink:'0' });
    var btnDl = document.createElement('button'); btnDl.textContent = '⬇ Download CSV';
    Object.assign(btnDl.style, { padding:'8px 16px', borderRadius:'10px', background:'rgba(74,222,128,.12)', border:'1px solid rgba(74,222,128,.25)', color:'#4ade80', fontSize:'13px', fontWeight:'700', cursor:'pointer', fontFamily:'"Syne",sans-serif' });
    btnDl.onclick = downloadCSV;
    var btnClose = document.createElement('button'); btnClose.textContent = '✕ Close';
    Object.assign(btnClose.style, { padding:'8px 16px', borderRadius:'10px', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.5)', fontSize:'13px', fontWeight:'700', cursor:'pointer', fontFamily:'"Syne",sans-serif' });
    btnClose.onclick = closeTable;
    btns.appendChild(btnDl); btns.appendChild(btnClose);

    statsRow.appendChild(logo); statsRow.appendChild(titleEl); statsRow.appendChild(profileEl); statsRow.appendChild(liveGroup);
    statsRow.appendChild(liveChip('TOTAL', 'total', '#fff')); statsRow.appendChild(liveChip('WITH VIEWS', 'views', '#4ade80')); statsRow.appendChild(liveChip('TOP VIEWS', 'maxviews', '#fbbf24'));
    statsRow.appendChild(metaEl); statsRow.appendChild(spacer); statsRow.appendChild(searchWrap); statsRow.appendChild(btns);

    var progressBar = document.createElement('div'); Object.assign(progressBar.style, { width:'100%', height:'3px', background:'rgba(255,255,255,.04)', position:'relative' });
    var progressFill = document.createElement('div'); progressFill.setAttribute('data-live', 'progress');
    Object.assign(progressFill.style, { height:'100%', width:'0%', background:'linear-gradient(90deg,#4ade80,#22c55e)', transition:'width .6s ease' });
    progressBar.appendChild(progressFill);
    $tableLiveBar.appendChild(statsRow); $tableLiveBar.appendChild(progressBar);

    var tableWrap = document.createElement('div'); Object.assign(tableWrap.style, { flex:'1', overflow:'auto', position:'relative', zIndex:'2' });
    var table = document.createElement('table'); Object.assign(table.style, { width:'100%', borderCollapse:'collapse', fontSize:'13px', color:'#c9d1d9' });
    var thead = document.createElement('thead'), headRow = document.createElement('tr');
    Object.assign(headRow.style, { position:'sticky', top:'0', zIndex:'3', background:'#0d0d18', borderBottom:'1px solid rgba(255,255,255,.08)' });
    var cols = [{ label:'#', width:'50px', align:'center' }, { label:'REEL', width:'260px', align:'left' }, { label:'VIEWS', width:'220px', align:'right' }, { label:'LIKES', width:'160px', align:'right' }, { label:'ACTION', width:'90px', align:'center' }];
    cols.forEach(function(col){
      var th = document.createElement('th'); th.textContent = col.label;
      Object.assign(th.style, { padding:'12px 16px', fontWeight:'700', fontSize:'10px', letterSpacing:'.8px', color:'rgba(255,255,255,.25)', textAlign:col.align, width:col.width, fontFamily:'"Syne", sans-serif' });
      headRow.appendChild(th);
    });
    thead.appendChild(headRow); table.appendChild(thead);
    var $tbody = document.createElement('tbody'); $tbody.id = '__rsTbody';
    buildTableRows($tbody, getSorted()); table.appendChild($tbody); tableWrap.appendChild(table);

    var footer = document.createElement('div');
    Object.assign(footer.style, { padding:'8px 24px', borderTop:'1px solid rgba(255,255,255,.06)', background:'rgba(255,255,255,.01)', display:'flex', gap:'12px', flexShrink:'0', position:'relative', zIndex:'2' });
    var footerNote = document.createElement('span'); footerNote.textContent = '⌨ Esc to close • Table updates in real-time during collection';
    Object.assign(footerNote.style, { fontSize:'11px', color:'rgba(255,255,255,.15)', fontFamily:'"Space Mono", monospace' });
    footer.appendChild(footerNote);

    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') { closeTable(); document.removeEventListener('keydown', escHandler); }
    });

    $tableOverlay.appendChild($tableLiveBar); $tableOverlay.appendChild(tableWrap); $tableOverlay.appendChild(footer);
    document.body.appendChild($tableOverlay);

    if (_tableRefreshId) clearInterval(_tableRefreshId);
    _tableRefreshId = setInterval(function(){
      refreshTableLiveBar();
      var dot = $tableLiveBar && $tableLiveBar.querySelector('.rs-live-dot'); if (dot && state.finished) dot.className = 'rs-live-dot done';
      var pFill = $tableLiveBar && $tableLiveBar.querySelector('[data-live="progress"]');
      if (pFill) pFill.style.background = state.finished ? 'linear-gradient(90deg,#60a5fa,#818cf8)' : (state.staleCycles > CFG.maxStaleCycles * 0.6 ? 'linear-gradient(90deg,#facc15,#f59e0b)' : 'linear-gradient(90deg,#4ade80,#22c55e)');
    }, 800);
    refreshTableLiveBar();
    if ($btnView) $btnView.textContent = '✕ Close Table';
  }

  function closeTable() {
    if (_tableRefreshId) { clearInterval(_tableRefreshId); _tableRefreshId = null; }
    if ($tableOverlay)   { $tableOverlay.remove(); $tableOverlay = null; $tableLiveBar = null; }
    if ($panel) $panel.style.display = '';
    if ($btnView) $btnView.textContent = '👁 View Table';
  }

  /* ════════════════════════════════════════════════════════════
     HUD PANEL (Drag, Glassmorphism, Waves)
  ════════════════════════════════════════════════════════════ */
  var $panel, $count, $status, $rate, $scrolls, $bar, $barFill,
      $btnDown, $btnStop, $btnView, $profile, $time, $topList, $wave;

  function animateCount(el, target) {
    var start = parseInt(el.textContent.replace(/\D/g, '')) || 0;
    if (start === target) return;
    var duration = 400, startTime = performance.now();
    function tick(now) {
      var t = Math.min(1, (now - startTime) / duration);
      el.textContent = Math.round(start + (target - start) * (1 - Math.pow(1 - t, 3))).toLocaleString('en-US');
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function createPanel() {
    var old = document.getElementById('__rsPanel'); if (old) old.remove();
    if (!document.getElementById('__rsFont')) {
      var link = document.createElement('link'); link.id = '__rsFont'; link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap';
      document.head.appendChild(link);
    }
    if (!document.getElementById('__rsStyles')) {
      var style = document.createElement('style'); style.id = '__rsStyles';
      style.textContent = [
        '@keyframes rs-pulse{0%,100%{opacity:1}50%{opacity:.45}}',
        '@keyframes rs-fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
        '@keyframes rs-wave{0%,100%{transform:scaleY(0.4)}50%{transform:scaleY(1)}}',
        '#__rsPanel *{box-sizing:border-box;font-family:"DM Sans",sans-serif}',
        '#__rsPanel button:focus{outline:none}',
        '#__rsPanel .rs-btn-down:hover{background:#22c55e!important;transform:translateY(-1px);box-shadow:0 6px 20px rgba(34,197,94,.35)!important}',
        '#__rsPanel .rs-btn-view:hover{background:rgba(99,102,241,.25)!important;border-color:rgba(99,102,241,.5)!important;transform:translateY(-1px)}',
        '#__rsPanel .rs-top-item{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);animation:rs-fadeIn .3s ease both}',
        '#__rsPanel .rs-top-item:last-child{border-bottom:none}'
      ].join('\n');
      document.head.appendChild(style);
    }

    $panel = document.createElement('div'); $panel.id = '__rsPanel';
    Object.assign($panel.style, { position:'fixed', bottom:'20px', right:'20px', zIndex:'2147483647', width:'290px', background:'rgba(10,10,12,.97)', backdropFilter:'blur(20px)', color:'#e0e0e0', fontSize:'13px', borderRadius:'20px', border:'1px solid rgba(255,255,255,.09)', overflow:'hidden', lineHeight:'1.45', userSelect:'none', boxShadow:'0 24px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.04) inset', transition:'box-shadow .3s' });
    
    function el(tag, styles) { var node = document.createElement(tag); if (styles) Object.assign(node.style, styles); return node; }

    var header = el('div', { padding:'13px 15px 11px', background:'rgba(255,255,255,.03)', borderBottom:'1px solid rgba(255,255,255,.07)', display:'flex', alignItems:'center', gap:'10px' });
    var logo = el('div', { width:'34px', height:'34px', borderRadius:'10px', background:'linear-gradient(135deg,#feda77 0%,#f58529 25%,#dd2a7b 50%,#8134af 75%,#515bd4 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px', flexShrink:'0', boxShadow:'0 4px 12px rgba(221,42,123,.4)', color:'#fff' });
    logo.innerHTML = '&#9654;';
    var titleWrap = el('div', { flex:'1', overflow:'hidden' });
    var titleLine = el('div', { display:'flex', alignItems:'baseline', gap:'5px', marginBottom:'2px' });
    var titleMain = el('span', { fontWeight:'700', fontSize:'13px', color:'#fff', letterSpacing:'-.2px' }); titleMain.textContent = 'Reels Sorter';
    var vBadge = el('span', { fontSize:'9px', fontWeight:'700', color:'#515bd4', background:'rgba(81,91,212,.15)', padding:'1px 5px', borderRadius:'4px' }); vBadge.textContent = 'v7';
    titleLine.appendChild(titleMain); titleLine.appendChild(vBadge);
    $profile = el('div', { fontSize:'11px', color:'rgba(255,255,255,.35)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:'"DM Mono", monospace', fontWeight:'500' });
    $profile.textContent = location.hostname; titleWrap.appendChild(titleLine); titleWrap.appendChild($profile);
    $status = el('div', { fontSize:'10px', fontWeight:'700', padding:'4px 10px', borderRadius:'99px', transition:'all .4s', whiteSpace:'nowrap', flexShrink:'0' });
    setStatus('STARTING'); header.appendChild(logo); header.appendChild(titleWrap); header.appendChild($status);

    var body = el('div', { padding:'14px 14px 8px' });
    var countCard = el('div', { background:'rgba(255,255,255,.04)', borderRadius:'14px', padding:'12px 14px', marginBottom:'10px', border:'1px solid rgba(255,255,255,.07)', position:'relative', overflow:'hidden' });
    var glowBg = el('div', { position:'absolute', top:'-20px', right:'-20px', width:'80px', height:'80px', borderRadius:'50%', background:'radial-gradient(circle, rgba(74,222,128,.12) 0%, transparent 70%)', pointerEvents:'none' }); countCard.appendChild(glowBg);
    var countRow = el('div', { display:'flex', alignItems:'flex-end', gap:'8px', position:'relative' });
    var countLeft = el('div', {});
    var countLabel = el('div', { fontSize:'9px', color:'rgba(255,255,255,.3)', fontWeight:'700', letterSpacing:'.8px', marginBottom:'4px' }); countLabel.textContent = 'REELS FOUND';
    $count = el('div', { fontSize:'38px', fontWeight:'700', color:'#fff', letterSpacing:'-2px', lineHeight:'1', fontFamily:'"DM Mono", monospace', transition:'color .3s' }); $count.textContent = '0';
    countLeft.appendChild(countLabel); countLeft.appendChild($count);
    $wave = el('div', { display:'flex', alignItems:'center', gap:'3px', marginBottom:'4px', marginLeft:'auto', padding:'0 4px' });
    for (var w = 0; w < 5; w++) { var wbar = el('div', { width:'3px', height:'14px', borderRadius:'3px', background:'rgba(74,222,128,.4)', animation:'rs-wave ' + (0.8 + w * 0.15) + 's ease-in-out infinite', animationDelay:(w * 0.12) + 's' }); $wave.appendChild(wbar); }
    countRow.appendChild(countLeft); countRow.appendChild($wave); countCard.appendChild(countRow);

    var metrics = el('div', { display:'flex', gap:'6px', marginBottom:'10px' });
    function metricBox(icon, label, initial) {
      var box = el('div', { flex:'1', background:'rgba(255,255,255,.04)', borderRadius:'10px', padding:'8px 9px', border:'1px solid rgba(255,255,255,.07)', minWidth:'0' });
      var lbl = el('div', { fontSize:'8.5px', color:'rgba(255,255,255,.25)', fontWeight:'700', letterSpacing:'.6px', marginBottom:'3px' }); lbl.textContent = icon + ' ' + label;
      var val = el('div', { fontSize:'13px', fontWeight:'600', color:'rgba(255,255,255,.75)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:'"DM Mono", monospace' }); val.textContent = initial;
      box.appendChild(lbl); box.appendChild(val); return { box: box, val: val };
    }
    var mTime = metricBox('⏱', 'TIME', '0s'), mRate = metricBox('⚡', 'SPEED', '—'), mScroll = metricBox('↕', 'SCROLLS', '0');
    $time = mTime.val; $rate = mRate.val; $scrolls = mScroll.val;
    metrics.appendChild(mTime.box); metrics.appendChild(mRate.box); metrics.appendChild(mScroll.box);
    body.appendChild(countCard); body.appendChild(metrics);

    $bar = el('div', { background:'rgba(255,255,255,.06)', borderRadius:'99px', height:'4px', overflow:'hidden', marginBottom:'10px', position:'relative' });
    $barFill = el('div', { height:'100%', width:'0%', borderRadius:'99px', background:'linear-gradient(90deg,#4ade80,#22c55e)', transition:'width .6s cubic-bezier(.4,0,.2,1), background .5s', boxShadow:'0 0 8px rgba(74,222,128,.5)' });
    $bar.appendChild($barFill); body.appendChild($bar);

    var topSection = el('div', { marginBottom:'10px' });
    var topLabel = el('div', { fontSize:'9px', color:'rgba(255,255,255,.25)', fontWeight:'700', letterSpacing:'.8px', marginBottom:'6px' }); topLabel.textContent = 'TOP REELS';
    $topList = el('div', {}); topSection.appendChild(topLabel); topSection.appendChild($topList); body.appendChild(topSection);

    var footer = el('div', { padding:'2px 14px 14px', display:'flex', flexDirection:'column', gap:'7px' });
    $btnView = el('button', { width:'100%', padding:'10px', background:'rgba(99,102,241,.12)', color:'#a5b4fc', border:'1px solid rgba(99,102,241,.25)', borderRadius:'11px', fontSize:'13px', fontWeight:'700', cursor:'pointer', opacity:'.35', pointerEvents:'none', transition:'all .25s cubic-bezier(.4,0,.2,1)' });
    $btnView.className = 'rs-btn-view'; $btnView.textContent = '👁 View Table'; $btnView.onclick = function () { if ($tableOverlay) closeTable(); else showTable(); };
    $btnDown = el('button', { width:'100%', padding:'10px', background:'#4ade80', color:'#052e16', border:'none', borderRadius:'11px', fontSize:'13px', fontWeight:'700', cursor:'pointer', opacity:'.3', pointerEvents:'none', transition:'all .25s cubic-bezier(.4,0,.2,1)', boxShadow:'0 4px 14px rgba(74,222,128,.0)' });
    $btnDown.className = 'rs-btn-down'; $btnDown.textContent = '⬇ Download CSV'; $btnDown.onclick = downloadCSV;
    $btnStop = el('button', { width:'100%', padding:'8px', background:'transparent', color:'rgba(255,255,255,.25)', border:'1px solid rgba(255,255,255,.08)', borderRadius:'11px', fontSize:'12px', cursor:'pointer', transition:'all .2s', fontWeight:'500' });
    $btnStop.textContent = '⏹ Stop Extraction';
    $btnStop.onmouseover = function(){ $btnStop.style.color='#f87171'; $btnStop.style.borderColor='rgba(248,113,113,.4)'; $btnStop.style.background='rgba(248,113,113,.07)'; };
    $btnStop.onmouseout = function(){ $btnStop.style.color='rgba(255,255,255,.25)'; $btnStop.style.borderColor='rgba(255,255,255,.08)'; $btnStop.style.background='transparent'; };
    $btnStop.onclick = function(){ finish('stopped by user'); };
    footer.appendChild($btnView); footer.appendChild($btnDown); footer.appendChild($btnStop);

    $panel.appendChild(header); $panel.appendChild(body); $panel.appendChild(footer); document.body.appendChild($panel);
    enableDrag($panel, header);
  }

  function setStatus(text, type) {
    if (!$status) return;
    $status.textContent = text;
    if (type === 'done') { $status.style.background = 'rgba(96,165,250,.15)'; $status.style.color = '#60a5fa'; $status.style.animation = ''; }
    else if (type === 'idle') { $status.style.background = 'rgba(250,204,21,.1)'; $status.style.color = '#facc15'; }
    else { $status.style.background = 'rgba(74,222,128,.12)'; $status.style.color = '#4ade80'; $status.style.animation = 'rs-pulse 2s ease-in-out infinite'; }
  }

  var _lastTopStr = '';
  function updateTopReels() {
    if (!$topList) return;
    var sorted = Object.values(state.reels).filter(function(r){ return r.views > 0; }).sort(function(a,b){ return b.views - a.views; }).slice(0, 3);
    var str = sorted.map(function(r){ return r.url + r.views; }).join('|');
    if (str === _lastTopStr) return; _lastTopStr = str; $topList.innerHTML = '';
    if (sorted.length === 0) {
      var empty = document.createElement('div'); Object.assign(empty.style, { fontSize:'11px', color:'rgba(255,255,255,.2)', padding:'4px 0' }); empty.textContent = 'Waiting for data...'; $topList.appendChild(empty); return;
    }
    sorted.forEach(function(r, i){
      var item = document.createElement('div'); item.className = 'rs-top-item'; item.style.animationDelay = (i * 0.05) + 's';
      var rank = document.createElement('div'); Object.assign(rank.style, { width:'20px', height:'20px', borderRadius:'6px', background: i === 0 ? 'rgba(251,191,36,.15)' : 'rgba(255,255,255,.06)', color: i === 0 ? '#fbbf24' : 'rgba(255,255,255,.35)', fontSize:'10px', fontWeight:'700', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:'0', fontFamily:'"DM Mono", monospace' }); rank.textContent = '#' + (i+1);
      var info = document.createElement('div'); info.style.cssText = 'flex:1;overflow:hidden';
      var code = document.createElement('div'); Object.assign(code.style, { fontSize:'11px', color:'rgba(255,255,255,.65)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:'"DM Mono", monospace', fontWeight:'500' }); code.textContent = r.shortcode || '—';
      var views = document.createElement('div'); Object.assign(views.style, { fontSize:'10px', color:'rgba(255,255,255,.3)', marginTop:'1px' }); views.textContent = r.views.toLocaleString('en-US') + ' views';
      info.appendChild(code); info.appendChild(views);
      var link = document.createElement('a'); Object.assign(link.style, { fontSize:'9px', color:'rgba(81,91,212,.7)', textDecoration:'none', padding:'3px 7px', borderRadius:'5px', background:'rgba(81,91,212,.1)', fontWeight:'600', transition:'all .2s', flexShrink:'0' }); link.textContent = '↗'; link.href = r.url; link.target = '_blank';
      link.onmouseover = function(){ link.style.background='rgba(81,91,212,.25)'; link.style.color='#818cf8'; }; link.onmouseout  = function(){ link.style.background='rgba(81,91,212,.1)'; link.style.color='rgba(81,91,212,.7)'; };
      item.appendChild(rank); item.appendChild(info); item.appendChild(link); $topList.appendChild(item);
    });
  }

  function enableDrag(panel, handle) {
    var ox = 0, oy = 0, dragging = false; handle.style.cursor = 'grab';
    handle.addEventListener('mousedown', function(e){ if (e.button !== 0) return; dragging = true; ox = e.clientX - panel.getBoundingClientRect().left; oy = e.clientY - panel.getBoundingClientRect().top; handle.style.cursor = 'grabbing'; e.preventDefault(); });
    document.addEventListener('mousemove', function(e){ if (!dragging) return; panel.style.left = (e.clientX - ox) + 'px'; panel.style.top = (e.clientY - oy) + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto'; });
    document.addEventListener('mouseup', function(){ if (!dragging) return; dragging = false; handle.style.cursor = 'grab'; });
  }

  var prevCount = 0, prevTime = Date.now();
  function updatePanel(flash) {
    if (!$panel || $panel.style.display === 'none') return;
    var total = Object.keys(state.reels).length;
    animateCount($count, total);
    $time.textContent = elapsed();
    $scrolls.textContent = state.scrollCount;
    
    var now = Date.now(), delta = (now - prevTime) / 60000, gained = total - prevCount;
    if (delta > 0.08) {
      var rpm = Math.round(gained / delta); $rate.textContent = rpm > 0 ? rpm + '/min' : '—';
      prevCount = total; prevTime = now;
    }
    
    var pct = Math.min(100, (state.staleCycles / CFG.maxStaleCycles) * 100);
    $barFill.style.width = pct + '%';
    if (state.staleCycles > CFG.maxStaleCycles * 0.6) { $barFill.style.background = 'linear-gradient(90deg,#facc15,#f59e0b)'; $barFill.style.boxShadow = '0 0 8px rgba(250,204,21,.5)'; }
    else { $barFill.style.background = 'linear-gradient(90deg,#4ade80,#22c55e)'; $barFill.style.boxShadow = '0 0 8px rgba(74,222,128,.5)'; }
    
    if ($wave) $wave.style.opacity = state.staleCycles > 4 ? '0.2' : '1';
    if (state.profileName) $profile.textContent = '@' + state.profileName;
    if (total > 0) { if ($btnView) { $btnView.style.opacity='1'; $btnView.style.pointerEvents='auto'; } }
    
    updateTopReels();
    if (flash && $panel) {
      $panel.style.boxShadow = '0 24px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(74,222,128,.25) inset';
      setTimeout(function(){ if ($panel) $panel.style.boxShadow = '0 24px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.04) inset'; }, 500);
    }
  }

  /* ════════════════════════════════════════════════════════════
     FINISH
  ════════════════════════════════════════════════════════════ */
  function finish(reason) {
    if (state.finished) return;
    state.running = false; state.finished = true;
    stopObserver();
    
    log('Finished — ' + reason);
    log('Total: ' + Object.keys(state.reels).length + ' reels | ' + elapsed());
    setStatus('DONE', 'done');
    
    if ($barFill) { $barFill.style.width = '100%'; $barFill.style.background = 'linear-gradient(90deg,#60a5fa,#818cf8)'; $barFill.style.boxShadow = '0 0 10px rgba(96,165,250,.5)'; }
    if ($btnDown) { $btnDown.style.opacity='1'; $btnDown.style.pointerEvents='auto'; }
    if ($btnView) { $btnView.style.opacity='1'; $btnView.style.pointerEvents='auto'; }
    if ($btnStop) $btnStop.style.display = 'none';
    if ($wave) { Array.prototype.forEach.call($wave.children, function(b){ b.style.background = 'rgba(96,165,250,.4)'; b.style.animation = 'rs-wave 1.5s ease-in-out infinite'; }); }
    
    var blinks = 0, blink = setInterval(function(){
      if (!$count) { clearInterval(blink); return; }
      $count.style.color = blinks % 2 === 0 ? '#60a5fa' : '#fff';
      if (++blinks >= 6) { clearInterval(blink); $count.style.color = '#fff'; }
    }, 300);
    
    updatePanel(false);
    if ($tableOverlay) refreshTableIfOpen();
  }

  /* ════════════════════════════════════════════════════════════
     INITIALIZATION
  ════════════════════════════════════════════════════════════ */
  window.__reelsDownloadCSV = downloadCSV;
  window.__reelsGetData     = function(){ return Object.values(state.reels); };
  window.__reelsStop        = function(){ finish('stopped via console'); };
  window.__reelsShowTable   = showTable;

  function start() {
    if (!location.href.includes('/reels') && !location.href.includes('/reel')) {
      var ok = confirm('[ReelsSorter] You are not on a Reels tab.\n\nCurrent URL: ' + location.href + '\nIdeal: instagram.com/USERNAME/reels/\n\nContinue anyway?');
      if (!ok) { window.__reelsSorterRunning = false; return; }
    }
    
    resolveProfile();
    createPanel();
    collectFromDOM();
    updatePanel(false);
    
    state.running = true;
    state.lastHeight = getScrollHeight();
    setStatus('COLLECTING', 'running');
    startObserver();
    
    log('Starting @' + (state.profileName || '?') + ' | ' + location.href);
    
    setInterval(function(){ updatePanel(false); }, 1000);
    setTimeout(scrollLoop, 600);
  }

  start();
})();
