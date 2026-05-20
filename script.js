/**
 * ╔══════════════════════════════════════════════════════════════╗
 *  INSTAGRAM REELS SORTER  v3.0
 *  Captura: URL · Visualizações · Curtidas
 *  Exporta: CSV ordenado por views  (nome = perfil + data)
 * ╔══════════════════════════════════════════════════════════════╗
 *
 *  COMO USAR
 *  ─────────
 *  1. Abra instagram.com/USUARIO/reels/
 *  2. F12 → Console
 *  3. Se aparecer "allow pasting" → digite isso e Enter primeiro
 *  4. Cole este script inteiro → Enter
 *  5. Acompanhe o painel flutuante
 *  6. Clique "⬇ Baixar CSV" quando terminar
 *
 *  ATALHOS NO CONSOLE
 *  ──────────────────
 *  window.__reelsDownloadCSV()   → baixa o CSV manualmente
 *  window.__reelsGetData()       → retorna array com todos os dados
 *  window.__reelsStop()          → para a coleta imediatamente
 */

(function () {

  /* ── Evita rodar duas vezes na mesma aba ─────────────────── */
  if (window.__reelsSorterRunning) {
    console.warn('[ReelsSorter] Já rodando. Recarregue a página para reiniciar.');
    return;
  }
  window.__reelsSorterRunning = true;

  /* ════════════════════════════════════════════════════════════
     CONFIGURAÇÕES
     ─────────────
     scrollPause     ms de espera APÓS cada rolagem
     scrollStep      px rolados por ciclo
     maxStaleCycles  ciclos sem novos reels → encerra
     maxTotalScrolls teto de segurança absoluto
  ════════════════════════════════════════════════════════════ */
  var CFG = {
    scrollPause:      900,       /* ↓ reduzido de 1400 → mais rápido */
    scrollStep:       1100,      /* ↑ aumentado de 900 */
    maxStaleCycles:   10,
    maxTotalScrolls:  800,
    logPrefix:        '[ReelsSorter]',
    mutationBatch:    120        /* ms para debounce do MutationObserver */
  };

  /* ════════════════════════════════════════════════════════════
     ESTADO
  ════════════════════════════════════════════════════════════ */
  var state = {
    reels:       {},
    scrollCount: 0,
    staleCycles: 0,
    running:     false,
    finished:    false,
    startTime:   Date.now(),
    profileName: '',
    lastHeight:  0,
    totalAdded:  0           /* contador incremental para animação */
  };

  /* ════════════════════════════════════════════════════════════
     UTILITÁRIOS
  ════════════════════════════════════════════════════════════ */

  function parseCount(raw) {
    if (!raw) return 0;
    var s    = raw.trim().replace(/\s/g, '').replace(',', '.');
    var f    = 1;
    var last = s.slice(-1).toUpperCase();
    if (last === 'K') { f = 1e3; s = s.slice(0, -1); }
    if (last === 'M') { f = 1e6; s = s.slice(0, -1); }
    if (last === 'B') { f = 1e9; s = s.slice(0, -1); }
    var n = parseFloat(s.replace(/[^\d.]/g, ''));
    return isNaN(n) ? 0 : Math.round(n * f);
  }

  function log(msg) { console.log(CFG.logPrefix + ' ' + msg); }

  function elapsed() {
    var s = Math.round((Date.now() - state.startTime) / 1000);
    if (s < 60) return s + 's';
    return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  }

  function resolveProfile() {
    var m = location.pathname.match(/^\/([^/]+)/);
    if (m && m[1] && m[1] !== 'reel') {
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
     EXTRAÇÃO DE DADOS DO DOM
  ════════════════════════════════════════════════════════════ */

  function extractViews(a) {
    var best = 0;
    var ariaEls = a.querySelectorAll('[aria-label]');
    for (var i = 0; i < ariaEls.length; i++) {
      var lbl = (ariaEls[i].getAttribute('aria-label') || '').toLowerCase();
      if (/view|visuali|reprod/.test(lbl)) {
        var v = parseCount(lbl.replace(/[^\d,.KMBkmb]/gi, ''));
        if (v > best) best = v;
      }
    }
    if (best) return best;

    var spans = a.querySelectorAll('span');
    for (var j = 0; j < spans.length; j++) {
      var t = spans[j].textContent.trim();
      if (/^[\d][\d,.]*[KMBkmb]?$/.test(t) && t.length <= 9) {
        var v2 = parseCount(t);
        if (v2 > best) best = v2;
      }
    }
    if (best) return best;

    var titled = a.querySelectorAll('[title]');
    for (var k = 0; k < titled.length; k++) {
      var tt = (titled[k].getAttribute('title') || '').trim();
      if (/^[\d]/.test(tt)) {
        var v3 = parseCount(tt);
        if (v3 > best) best = v3;
      }
    }
    return best;
  }

  function extractLikes(a) {
    var best = 0;
    var ariaEls = a.querySelectorAll('[aria-label]');
    for (var i = 0; i < ariaEls.length; i++) {
      var lbl = (ariaEls[i].getAttribute('aria-label') || '').toLowerCase();
      if (/like|curtida|gosta/.test(lbl)) {
        var v = parseCount(lbl.replace(/[^\d,.KMBkmb]/gi, ''));
        if (v > best) best = v;
      }
    }
    return best;
  }

  function collectFromDOM() {
    var added = 0;
    var links = document.querySelectorAll('a[href*="/reel/"]');
    for (var i = 0; i < links.length; i++) {
      var a   = links[i];
      var url = a.href.split('?')[0].replace(/\/$/, '') + '/';
      if (state.reels[url]) continue;
      var mc = url.match(/\/reel\/([^/]+)/);
      state.reels[url] = {
        url:       url,
        shortcode: mc ? mc[1] : '',
        views:     extractViews(a),
        likes:     extractLikes(a)
      };
      added++;
    }
    state.totalAdded += added;
    return added;
  }

  /* ════════════════════════════════════════════════════════════
     MUTATION OBSERVER — coleta instantânea sem esperar o timer
     ────────────────────────────────────────────────────────────
     Observa inserções no DOM e roda collectFromDOM com debounce,
     eliminando o lag de esperar o próximo ciclo de setTimeout.
  ════════════════════════════════════════════════════════════ */

  var _mutationTimer = null;
  var _observer      = null;

  function startObserver() {
    _observer = new MutationObserver(function (mutations) {
      /* Filtra apenas inserções de nós que contenham links de reel */
      var relevant = mutations.some(function (m) {
        return Array.prototype.some.call(m.addedNodes, function (n) {
          return n.nodeType === 1 &&
            (n.querySelector && n.querySelector('a[href*="/reel/"]'));
        });
      });
      if (!relevant) return;

      clearTimeout(_mutationTimer);
      _mutationTimer = setTimeout(function () {
        var added = collectFromDOM();
        if (added > 0) {
          state.staleCycles = 0;
          log('+' + added + ' reels via observer (total: ' +
              Object.keys(state.reels).length + ')');
          updatePanel(true);
        }
      }, CFG.mutationBatch);
    });

    _observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (_observer) { _observer.disconnect(); _observer = null; }
  }

  /* ════════════════════════════════════════════════════════════
     ROLAGEM
  ════════════════════════════════════════════════════════════ */

  function isAtBottom() {
    return (document.documentElement.scrollHeight - window.scrollY - window.innerHeight) < 400;
  }

  function pageGrew() {
    var h = document.documentElement.scrollHeight;
    if (h !== state.lastHeight) { state.lastHeight = h; return true; }
    return false;
  }

  function scrollLoop() {
    if (!state.running) return;
    if (state.scrollCount >= CFG.maxTotalScrolls) {
      finish('limite de rolagens atingido');
      return;
    }

    var step  = state.staleCycles > 0 ? CFG.scrollStep * 0.65 : CFG.scrollStep;
    window.scrollBy({ top: step, behavior: 'instant' });
    state.scrollCount++;

    /* Pausa adaptativa: aumenta levemente quando está parado */
    var pause = state.staleCycles > 3
      ? Math.min(CFG.scrollPause * 1.5, 2200)
      : CFG.scrollPause;

    setTimeout(function () {
      var added = collectFromDOM();
      var grew  = pageGrew();

      if (added > 0) {
        state.staleCycles = 0;
        log('+' + added + ' reels  (total: ' + Object.keys(state.reels).length + ')');
      } else if (!grew) {
        state.staleCycles++;
        log('Sem novidades [' + state.staleCycles + '/' + CFG.maxStaleCycles + ']');
      } else {
        state.staleCycles = Math.max(0, state.staleCycles - 1);
      }

      updatePanel(added > 0);

      if (state.staleCycles >= CFG.maxStaleCycles && isAtBottom() && !grew) {
        finish('fim da página');
        return;
      }

      setTimeout(scrollLoop, pause);
    }, pause);
  }

  /* ════════════════════════════════════════════════════════════
     EXPORTAÇÃO CSV
  ════════════════════════════════════════════════════════════ */

  function buildCSV() {
    var sorted = Object.values(state.reels).sort(function (a, b) {
      return b.views - a.views;
    });
    var rows = ['Posição,URL,Shortcode,Visualizações,Curtidas'];
    for (var i = 0; i < sorted.length; i++) {
      var r = sorted[i];
      rows.push([
        i + 1,
        '"' + r.url + '"',
        r.shortcode,
        r.views,
        r.likes
      ].join(','));
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
    log('CSV salvo: ' + a.download + ' (' + Object.keys(state.reels).length + ' reels)');
  }

  /* ════════════════════════════════════════════════════════════
     PAINEL HUD  v3 — dark glass-morphism com top-reels inline
  ════════════════════════════════════════════════════════════ */

  var $panel, $count, $status, $rate, $scrolls, $bar, $barFill,
      $btnDown, $btnStop, $profile, $time, $topList, $wave;

  /* Número animado (efeito de "contagem") */
  function animateCount(el, target) {
    var start = parseInt(el.textContent.replace(/\D/g, '')) || 0;
    if (start === target) return;
    var duration = 400;
    var startTime = performance.now();
    function tick(now) {
      var t = Math.min(1, (now - startTime) / duration);
      var ease = 1 - Math.pow(1 - t, 3); /* cubic ease-out */
      var val = Math.round(start + (target - start) * ease);
      el.textContent = val.toLocaleString('pt-BR');
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function createPanel() {
    var old = document.getElementById('__rsPanel');
    if (old) old.remove();

    /* Injeta font do Google */
    if (!document.getElementById('__rsFont')) {
      var link = document.createElement('link');
      link.id   = '__rsFont';
      link.rel  = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@500&display=swap';
      document.head.appendChild(link);
    }

    /* Injeta keyframes globais */
    if (!document.getElementById('__rsStyles')) {
      var style = document.createElement('style');
      style.id = '__rsStyles';
      style.textContent = [
        '@keyframes rs-pulse{0%,100%{opacity:1}50%{opacity:.45}}',
        '@keyframes rs-spin{to{transform:rotate(360deg)}}',
        '@keyframes rs-fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
        '@keyframes rs-shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}',
        '@keyframes rs-wave{0%,100%{transform:scaleY(0.4)}50%{transform:scaleY(1)}}',
        '#__rsPanel *{box-sizing:border-box;font-family:"DM Sans",sans-serif}',
        '#__rsPanel button:focus{outline:none}',
        '#__rsPanel .rs-btn-down:hover{background:#22c55e!important;transform:translateY(-1px);box-shadow:0 6px 20px rgba(34,197,94,.35)!important}',
        '#__rsPanel .rs-btn-down:active{transform:translateY(0)!important}',
        '#__rsPanel .rs-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.5px}',
        '#__rsPanel .rs-top-item{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);animation:rs-fadeIn .3s ease both}',
        '#__rsPanel .rs-top-item:last-child{border-bottom:none}'
      ].join('\n');
      document.head.appendChild(style);
    }

    $panel = document.createElement('div');
    $panel.id = '__rsPanel';

    Object.assign($panel.style, {
      position:     'fixed',
      bottom:       '20px',
      right:        '20px',
      zIndex:       '2147483647',
      width:        '290px',
      background:   'rgba(10,10,12,.96)',
      backdropFilter: 'blur(20px)',
      color:        '#e0e0e0',
      fontSize:     '13px',
      borderRadius: '20px',
      border:       '1px solid rgba(255,255,255,.09)',
      overflow:     'hidden',
      lineHeight:   '1.45',
      userSelect:   'none',
      boxShadow:    '0 24px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.04) inset',
      transition:   'box-shadow .3s'
    });

    /* ── HEADER ──────────────────────────────────────────────── */
    var header = el('div', {
      padding:      '13px 15px 11px',
      background:   'rgba(255,255,255,.03)',
      borderBottom: '1px solid rgba(255,255,255,.07)',
      display:      'flex',
      alignItems:   'center',
      gap:          '10px'
    });

    /* Logo gradiente IG */
    var logo = el('div', {
      width:      '34px',
      height:     '34px',
      borderRadius: '10px',
      background: 'linear-gradient(135deg,#feda77 0%,#f58529 25%,#dd2a7b 50%,#8134af 75%,#515bd4 100%)',
      display:    'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize:   '16px',
      flexShrink: '0',
      boxShadow:  '0 4px 12px rgba(221,42,123,.4)'
    });
    logo.innerHTML = '&#9654;';
    logo.style.color = '#fff';

    var titleWrap = el('div', { flex: '1', overflow: 'hidden' });
    var titleLine = el('div', {
      display:    'flex',
      alignItems: 'baseline',
      gap:        '5px',
      marginBottom: '2px'
    });
    var titleMain = el('span', {
      fontWeight:   '700',
      fontSize:     '13px',
      color:        '#fff',
      letterSpacing: '-.2px'
    });
    titleMain.textContent = 'Reels Sorter';

    var vBadge = el('span', {
      fontSize:     '9px',
      fontWeight:   '700',
      color:        '#515bd4',
      background:   'rgba(81,91,212,.15)',
      padding:      '1px 5px',
      borderRadius: '4px',
      letterSpacing: '.5px'
    });
    vBadge.textContent = 'v3';

    titleLine.appendChild(titleMain);
    titleLine.appendChild(vBadge);

    $profile = el('div', {
      fontSize:     '11px',
      color:        'rgba(255,255,255,.35)',
      whiteSpace:   'nowrap',
      overflow:     'hidden',
      textOverflow: 'ellipsis',
      fontFamily:   '"DM Mono", monospace',
      fontWeight:   '500'
    });
    $profile.textContent = location.hostname;
    titleWrap.appendChild(titleLine);
    titleWrap.appendChild($profile);

    /* Status pill */
    $status = el('div', {
      fontSize:     '10px',
      fontWeight:   '700',
      padding:      '4px 10px',
      borderRadius: '99px',
      letterSpacing: '.5px',
      transition:   'all .4s',
      whiteSpace:   'nowrap',
      flexShrink:   '0'
    });
    setStatus('INICIANDO');

    header.appendChild(logo);
    header.appendChild(titleWrap);
    header.appendChild($status);

    /* ── BODY ────────────────────────────────────────────────── */
    var body = el('div', { padding: '14px 14px 8px' });

    /* Contador principal */
    var countCard = el('div', {
      background:   'rgba(255,255,255,.04)',
      borderRadius: '14px',
      padding:      '12px 14px',
      marginBottom: '10px',
      border:       '1px solid rgba(255,255,255,.07)',
      position:     'relative',
      overflow:     'hidden'
    });

    /* Glow de fundo animado no contador */
    var glowBg = el('div', {
      position:   'absolute',
      top:        '-20px',
      right:      '-20px',
      width:      '80px',
      height:     '80px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(74,222,128,.12) 0%, transparent 70%)',
      pointerEvents: 'none',
      transition: 'opacity .5s'
    });
    countCard.appendChild(glowBg);

    var countRow = el('div', { display: 'flex', alignItems: 'flex-end', gap: '8px', position: 'relative' });
    var countLeft = el('div', {});
    var countLabel = el('div', {
      fontSize:     '9px',
      color:        'rgba(255,255,255,.3)',
      fontWeight:   '700',
      letterSpacing: '.8px',
      marginBottom: '4px'
    });
    countLabel.textContent = 'REELS ENCONTRADOS';
    $count = el('div', {
      fontSize:     '38px',
      fontWeight:   '700',
      color:        '#fff',
      letterSpacing: '-2px',
      lineHeight:   '1',
      fontFamily:   '"DM Mono", monospace',
      transition:   'color .3s'
    });
    $count.textContent = '0';
    countLeft.appendChild(countLabel);
    countLeft.appendChild($count);

    /* Mini ondas animadas (waveform visual) */
    $wave = el('div', {
      display:    'flex',
      alignItems: 'center',
      gap:        '3px',
      marginBottom: '4px',
      marginLeft: 'auto',
      padding:    '0 4px'
    });
    for (var w = 0; w < 5; w++) {
      var bar = el('div', {
        width:      '3px',
        height:     '14px',
        borderRadius: '3px',
        background: 'rgba(74,222,128,.4)',
        animation:  'rs-wave ' + (0.8 + w * 0.15) + 's ease-in-out infinite',
        animationDelay: (w * 0.12) + 's'
      });
      $wave.appendChild(bar);
    }

    countRow.appendChild(countLeft);
    countRow.appendChild($wave);
    countCard.appendChild(countRow);

    /* ── Métricas ────────────────────────────────────────────── */
    var metrics = el('div', { display: 'flex', gap: '6px', marginBottom: '10px' });

    var mTime   = metricBox('⏱', 'TEMPO',       '0s');
    var mRate   = metricBox('⚡', 'VELOCIDADE',  '—');
    var mScroll = metricBox('↕', 'ROLAGENS',    '0');
    $time    = mTime.val;
    $rate    = mRate.val;
    $scrolls = mScroll.val;

    metrics.appendChild(mTime.box);
    metrics.appendChild(mRate.box);
    metrics.appendChild(mScroll.box);
    body.appendChild(countCard);
    body.appendChild(metrics);

    /* ── Barra de progresso ──────────────────────────────────── */
    $bar = el('div', {
      background:   'rgba(255,255,255,.06)',
      borderRadius: '99px',
      height:       '4px',
      overflow:     'hidden',
      marginBottom: '10px',
      position:     'relative'
    });
    $barFill = el('div', {
      height:     '100%',
      width:      '0%',
      borderRadius: '99px',
      background: 'linear-gradient(90deg,#4ade80,#22c55e)',
      transition: 'width .6s cubic-bezier(.4,0,.2,1), background .5s',
      boxShadow:  '0 0 8px rgba(74,222,128,.5)'
    });
    $bar.appendChild($barFill);
    body.appendChild($bar);

    /* ── Top Reels (mini lista) ──────────────────────────────── */
    var topSection = el('div', { marginBottom: '10px' });
    var topLabel = el('div', {
      fontSize:     '9px',
      color:        'rgba(255,255,255,.25)',
      fontWeight:   '700',
      letterSpacing: '.8px',
      marginBottom: '6px'
    });
    topLabel.textContent = 'TOP REELS';
    $topList = el('div', {});
    topSection.appendChild(topLabel);
    topSection.appendChild($topList);
    body.appendChild(topSection);

    /* ── FOOTER / Botões ─────────────────────────────────────── */
    var footer = el('div', {
      padding:  '2px 14px 14px',
      display:  'flex',
      flexDirection: 'column',
      gap:      '7px'
    });

    $btnDown = el('button', {
      width:        '100%',
      padding:      '10px',
      background:   '#4ade80',
      color:        '#052e16',
      border:       'none',
      borderRadius: '11px',
      fontSize:     '13px',
      fontWeight:   '700',
      cursor:       'pointer',
      opacity:      '.3',
      pointerEvents: 'none',
      transition:   'all .25s cubic-bezier(.4,0,.2,1)',
      letterSpacing: '.2px',
      boxShadow:    '0 4px 14px rgba(74,222,128,.0)'
    });
    $btnDown.className = 'rs-btn-down';
    $btnDown.textContent = '⬇  Baixar CSV';
    $btnDown.onclick = downloadCSV;

    $btnStop = el('button', {
      width:        '100%',
      padding:      '8px',
      background:   'transparent',
      color:        'rgba(255,255,255,.25)',
      border:       '1px solid rgba(255,255,255,.08)',
      borderRadius: '11px',
      fontSize:     '12px',
      cursor:       'pointer',
      transition:   'all .2s',
      fontWeight:   '500'
    });
    $btnStop.textContent = '⏹  Parar coleta';
    $btnStop.onmouseover = function () {
      $btnStop.style.color       = '#f87171';
      $btnStop.style.borderColor = 'rgba(248,113,113,.4)';
      $btnStop.style.background  = 'rgba(248,113,113,.07)';
    };
    $btnStop.onmouseout = function () {
      $btnStop.style.color       = 'rgba(255,255,255,.25)';
      $btnStop.style.borderColor = 'rgba(255,255,255,.08)';
      $btnStop.style.background  = 'transparent';
    };
    $btnStop.onclick = function () { finish('parado pelo usuário'); };

    footer.appendChild($btnDown);
    footer.appendChild($btnStop);

    $panel.appendChild(header);
    $panel.appendChild(body);
    $panel.appendChild(footer);
    document.body.appendChild($panel);

    enableDrag($panel, header);
  }

  /* ── Helpers DOM ─────────────────────────────────────────── */
  function el(tag, styles) {
    var node = document.createElement(tag);
    if (styles) Object.assign(node.style, styles);
    return node;
  }

  function metricBox(icon, label, initial) {
    var box = el('div', {
      flex:         '1',
      background:   'rgba(255,255,255,.04)',
      borderRadius: '10px',
      padding:      '8px 9px',
      border:       '1px solid rgba(255,255,255,.07)',
      minWidth:     '0'
    });
    var lbl = el('div', {
      fontSize:     '8.5px',
      color:        'rgba(255,255,255,.25)',
      fontWeight:   '700',
      letterSpacing: '.6px',
      marginBottom: '3px',
      display:      'flex',
      alignItems:   'center',
      gap:          '3px'
    });
    lbl.textContent = icon + ' ' + label;
    var val = el('div', {
      fontSize:     '13px',
      fontWeight:   '600',
      color:        'rgba(255,255,255,.75)',
      whiteSpace:   'nowrap',
      overflow:     'hidden',
      textOverflow: 'ellipsis',
      fontFamily:   '"DM Mono", monospace'
    });
    val.textContent = initial;
    box.appendChild(lbl);
    box.appendChild(val);
    return { box: box, val: val };
  }

  function setStatus(text, type) {
    /* type: 'running' | 'done' | 'idle' */
    $status.textContent = text;
    if (type === 'done') {
      $status.style.background = 'rgba(96,165,250,.15)';
      $status.style.color      = '#60a5fa';
      $status.style.animation  = '';
    } else if (type === 'idle') {
      $status.style.background = 'rgba(250,204,21,.1)';
      $status.style.color      = '#facc15';
    } else {
      $status.style.background = 'rgba(74,222,128,.12)';
      $status.style.color      = '#4ade80';
      $status.style.animation  = 'rs-pulse 2s ease-in-out infinite';
    }
  }

  /* ── Top Reels list ──────────────────────────────────────── */
  var _lastTopStr = '';
  function updateTopReels() {
    var sorted = Object.values(state.reels)
      .filter(function (r) { return r.views > 0; })
      .sort(function (a, b) { return b.views - a.views; })
      .slice(0, 3);

    var str = sorted.map(function (r) { return r.url + r.views; }).join('|');
    if (str === _lastTopStr) return;
    _lastTopStr = str;

    $topList.innerHTML = '';
    if (sorted.length === 0) {
      var empty = el('div', { fontSize: '11px', color: 'rgba(255,255,255,.2)', padding: '4px 0' });
      empty.textContent = 'Aguardando dados de visualizações…';
      $topList.appendChild(empty);
      return;
    }

    sorted.forEach(function (r, i) {
      var item = el('div', {});
      item.className = 'rs-top-item';
      item.style.animationDelay = (i * 0.05) + 's';

      var rank = el('div', {
        width:        '20px',
        height:       '20px',
        borderRadius: '6px',
        background:   i === 0 ? 'rgba(251,191,36,.15)' : 'rgba(255,255,255,.06)',
        color:        i === 0 ? '#fbbf24' : 'rgba(255,255,255,.35)',
        fontSize:     '10px',
        fontWeight:   '700',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        flexShrink:   '0',
        fontFamily:   '"DM Mono", monospace'
      });
      rank.textContent = '#' + (i + 1);

      var info = el('div', { flex: '1', overflow: 'hidden' });
      var code = el('div', {
        fontSize:     '11px',
        color:        'rgba(255,255,255,.65)',
        whiteSpace:   'nowrap',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        fontFamily:   '"DM Mono", monospace',
        fontWeight:   '500'
      });
      code.textContent = r.shortcode || '—';

      var views = el('div', {
        fontSize:     '10px',
        color:        'rgba(255,255,255,.3)',
        marginTop:    '1px'
      });
      views.textContent = r.views.toLocaleString('pt-BR') + ' views';
      info.appendChild(code);
      info.appendChild(views);

      var link = el('a', {
        fontSize:   '9px',
        color:      'rgba(81,91,212,.7)',
        textDecoration: 'none',
        padding:    '3px 7px',
        borderRadius: '5px',
        background: 'rgba(81,91,212,.1)',
        fontWeight: '600',
        transition: 'all .2s',
        flexShrink: '0'
      });
      link.textContent = '↗';
      link.href   = r.url;
      link.target = '_blank';
      link.onmouseover = function () { link.style.background = 'rgba(81,91,212,.25)'; link.style.color = '#818cf8'; };
      link.onmouseout  = function () { link.style.background = 'rgba(81,91,212,.1)';  link.style.color = 'rgba(81,91,212,.7)'; };

      item.appendChild(rank);
      item.appendChild(info);
      item.appendChild(link);
      $topList.appendChild(item);
    });
  }

  /* ── Arrastar painel ─────────────────────────────────────── */
  function enableDrag(panel, handle) {
    var ox = 0, oy = 0, dragging = false;
    handle.style.cursor = 'grab';
    handle.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      dragging = true;
      ox = e.clientX - panel.getBoundingClientRect().left;
      oy = e.clientY - panel.getBoundingClientRect().top;
      handle.style.cursor = 'grabbing';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      panel.style.left   = (e.clientX - ox) + 'px';
      panel.style.top    = (e.clientY - oy) + 'px';
      panel.style.right  = 'auto';
      panel.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      handle.style.cursor = 'grab';
    });
  }

  /* ── Atualização do painel ───────────────────────────────── */
  var prevCount = 0;
  var prevTime  = Date.now();

  function updatePanel(flash) {
    if (!$panel) return;
    var total = Object.keys(state.reels).length;

    /* Contador animado */
    animateCount($count, total);

    $time.textContent    = elapsed();
    $scrolls.textContent = state.scrollCount;

    /* Velocidade: reels por minuto */
    var now    = Date.now();
    var delta  = (now - prevTime) / 60000;
    var gained = total - prevCount;
    if (delta > 0.08) {
      var rpm = Math.round(gained / delta);
      $rate.textContent = rpm > 0 ? rpm + '/min' : '—';
      prevCount = total;
      prevTime  = now;
    }

    /* Barra stale */
    var pct = Math.min(100, (state.staleCycles / CFG.maxStaleCycles) * 100);
    $barFill.style.width = pct + '%';
    if (state.staleCycles > CFG.maxStaleCycles * 0.7) {
      $barFill.style.background = 'linear-gradient(90deg,#facc15,#f59e0b)';
      $barFill.style.boxShadow  = '0 0 8px rgba(250,204,21,.5)';
    } else {
      $barFill.style.background = 'linear-gradient(90deg,#4ade80,#22c55e)';
      $barFill.style.boxShadow  = '0 0 8px rgba(74,222,128,.5)';
    }

    /* Ondas — param quando está parado */
    if ($wave) {
      $wave.style.opacity = state.staleCycles > 4 ? '0.2' : '1';
    }

    /* Perfil */
    if (state.profileName) {
      $profile.textContent = '@' + state.profileName;
    }

    /* Top reels */
    updateTopReels();

    /* Flash do painel ao encontrar novos */
    if (flash && $panel) {
      $panel.style.boxShadow = '0 24px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(74,222,128,.25) inset';
      setTimeout(function () {
        if ($panel) $panel.style.boxShadow = '0 24px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.04) inset';
      }, 500);
    }
  }

  /* ════════════════════════════════════════════════════════════
     FINALIZAÇÃO
  ════════════════════════════════════════════════════════════ */

  function finish(reason) {
    if (state.finished) return;
    state.running  = false;
    state.finished = true;
    stopObserver();

    log('Finalizado — ' + reason);
    log('Total: ' + Object.keys(state.reels).length + ' reels | ' + elapsed());

    setStatus('PRONTO', 'done');

    if ($barFill) {
      $barFill.style.width      = '100%';
      $barFill.style.background = 'linear-gradient(90deg,#60a5fa,#818cf8)';
      $barFill.style.boxShadow  = '0 0 10px rgba(96,165,250,.5)';
    }
    if ($btnDown) {
      $btnDown.style.opacity       = '1';
      $btnDown.style.pointerEvents = 'auto';
    }
    if ($btnStop) {
      $btnStop.style.display = 'none';
    }
    if ($wave) {
      Array.prototype.forEach.call($wave.children, function (b) {
        b.style.background = 'rgba(96,165,250,.4)';
        b.style.animation  = 'rs-wave 1.5s ease-in-out infinite';
      });
    }

    /* Pisca contador em azul */
    var blinks = 0;
    var blink = setInterval(function () {
      if (!$count) { clearInterval(blink); return; }
      $count.style.color = blinks % 2 === 0 ? '#60a5fa' : '#fff';
      if (++blinks >= 6) { clearInterval(blink); $count.style.color = '#fff'; }
    }, 300);

    updatePanel(false);
  }

  /* ════════════════════════════════════════════════════════════
     INICIALIZAÇÃO
  ════════════════════════════════════════════════════════════ */

  window.__reelsDownloadCSV = downloadCSV;
  window.__reelsGetData     = function () { return Object.values(state.reels); };
  window.__reelsStop        = function () { finish('parado via console'); };

  function start() {
    if (!location.href.includes('/reels') && !location.href.includes('/reel')) {
      var ok = confirm(
        '[ReelsSorter] Você não está na aba de Reels.\n\n' +
        'URL atual: ' + location.href + '\n' +
        'Ideal: instagram.com/USUARIO/reels/\n\nContinuar mesmo assim?'
      );
      if (!ok) { window.__reelsSorterRunning = false; return; }
    }

    resolveProfile();
    createPanel();
    collectFromDOM();
    updatePanel(false);

    state.running    = true;
    state.lastHeight = document.documentElement.scrollHeight;
    setStatus('COLETANDO', 'running');
    startObserver(); /* ← MutationObserver ativo desde o início */

    log('Iniciando  @' + (state.profileName || '?') + '  |  ' + location.href);

    var ticker = setInterval(function () {
      updatePanel(false);
      if (state.finished) clearInterval(ticker);
    }, 1000);

    setTimeout(scrollLoop, 500);
  }

  start();

})();
