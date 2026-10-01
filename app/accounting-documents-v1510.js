(() => {
  'use strict';

  const TILE_ID = 'cfCompanyAccountingDocsCard';
  const OVERLAY_ID = 'cfAccountingDocsOverlay';
  const STYLE_ID = 'cfAccountingDocsStyle1510';
  let observer = null;
  let selectedFiles = { bank: null, organizer: null };
  let priorBodyOverflow = '';

  function isAdmin() {
    try {
      const bridge = window.cfBackupBridge;
      return Boolean(bridge && typeof bridge.isAdmin === 'function' && bridge.isAdmin());
    }
    catch (_) { return false; }
  }

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#cfAccountingDocsOverlay{position:fixed;inset:0;z-index:500000;background:rgba(20,24,20,.44);display:none;align-items:flex-start;justify-content:center;padding:clamp(10px,3vw,28px);overflow:auto;-webkit-overflow-scrolling:touch}',
      '#cfAccountingDocsOverlay.cf-open{display:flex}',
      '#cfAccountingDocsOverlay *{box-sizing:border-box}',
      '.cf-accounting-docs-sheet{width:min(980px,100%);min-height:min(600px,calc(100dvh - 56px));margin:auto;background:#f8f9f6;border:1px solid #e2e6dc;border-radius:18px;box-shadow:0 20px 70px rgba(0,0,0,.23);color:#222820;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}',
      '.cf-accounting-docs-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:24px 26px 18px;background:#fff;border-bottom:1px solid #e7e9e3}',
      '.cf-accounting-docs-head h1{margin:0 0 6px;font-size:clamp(20px,3vw,26px);line-height:1.2;font-weight:800}',
      '.cf-accounting-docs-head p{margin:0;color:#687064;font-size:13px;line-height:1.45}',
      '.cf-accounting-docs-close{border:0;background:transparent;color:#637019;font-family:inherit;font-size:13px;line-height:1.2;font-weight:800;padding:9px 2px;cursor:pointer;white-space:nowrap}',
      '.cf-accounting-docs-close:hover{text-decoration:underline}',
      '.cf-accounting-docs-body{padding:22px 26px 26px}',
      '.cf-accounting-period{display:flex;align-items:center;gap:12px;margin:0 0 20px;padding:14px 16px;background:#fff;border:1px solid #e3e7dc;border-radius:12px}',
      '.cf-accounting-period label{font-size:13px;font-weight:750}',
      '.cf-accounting-period input{min-height:40px;padding:7px 10px;border:1px solid #cfd5c4;border-radius:8px;background:#fff;color:#222820;font-family:inherit;font-size:14px;font-weight:600}',
      '.cf-accounting-source-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}',
      '.cf-accounting-source{min-width:0;padding:17px;background:#fff;border:1px solid #e2e6dc;border-radius:13px}',
      '.cf-accounting-source h2{margin:0 0 5px;font-size:16px;line-height:1.25}',
      '.cf-accounting-source p{margin:0;color:#687064;font-size:12px;line-height:1.45}',
      '.cf-accounting-source-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px}',
      '.cf-accounting-status{flex:0 0 auto;display:inline-flex;align-items:center;min-height:24px;padding:4px 8px;border-radius:999px;background:#eef1e7;color:#66731c;font-size:10px;line-height:1.1;font-weight:800;letter-spacing:.02em;text-transform:uppercase}',
      '.cf-accounting-status.is-next{background:#f1f2ef;color:#687064}',
      '.cf-accounting-upload{display:flex;align-items:center;justify-content:center;min-height:42px;margin-top:14px;padding:10px 12px;border:1px solid #a6c61b;border-radius:9px;background:#faffeb;color:#4c5c0d;font-size:12px;font-weight:800;text-align:center;cursor:pointer}',
      '.cf-accounting-upload:hover{background:#f4fbdc}',
      '.cf-accounting-upload input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;clip-path:inset(50%)}',
      '.cf-accounting-file{display:none;margin-top:10px;padding:9px 10px;border-radius:8px;background:#f4f6f0;color:#4f5849;font-size:11px;line-height:1.4;overflow-wrap:anywhere}',
      '.cf-accounting-file.is-visible{display:block}',
      '.cf-accounting-note{margin:16px 0 0;padding:12px 14px;border-left:3px solid #a6c61b;border-radius:0 8px 8px 0;background:#f1f4e9;color:#59614b;font-size:11px;line-height:1.5}',
      '.cf-accounting-next{margin:18px 0 0;padding-top:16px;border-top:1px solid #e2e6dc;color:#687064;font-size:12px;line-height:1.55}',
      '@media(max-width:620px){#cfAccountingDocsOverlay{padding:0}.cf-accounting-docs-sheet{min-height:100dvh;border:0;border-radius:0}.cf-accounting-docs-head{padding:18px 16px 14px}.cf-accounting-docs-body{padding:16px}.cf-accounting-source-grid{grid-template-columns:1fr;gap:10px}.cf-accounting-period{align-items:flex-start;flex-direction:column}.cf-accounting-period input{width:100%}.cf-accounting-source{padding:14px}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function renderTile(grid) {
    if (!grid || !isAdmin()) return;
    if (grid.querySelector('#' + TILE_ID)) return;
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.id = TILE_ID;
    tile.className = 'cf-company-card cf-company-utility-card';
    tile.innerHTML = '<div><strong>Dokumenty księgowe</strong><span>Przygotowanie dokumentów dla księgowej</span></div>';
    grid.appendChild(tile);
  }

  function fileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function monthLabel(value) {
    if (!value) return 'wybranego miesiąca';
    const [year, month] = value.split('-').map(Number);
    if (!year || !month) return value;
    return new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
  }

  function updateMonth() {
    const input = document.getElementById('cfAccountingMonth');
    const label = document.getElementById('cfAccountingMonthLabel');
    if (label) label.textContent = monthLabel(input?.value || '');
  }

  function fileCard(type, file) {
    const target = document.getElementById(type === 'bank' ? 'cfAccountingBankFile' : 'cfAccountingOrganizerFile');
    if (!target) return;
    if (!file) {
      target.textContent = '';
      target.classList.remove('is-visible');
      return;
    }
    target.textContent = file.name + ' · ' + fileSize(file.size);
    target.classList.add('is-visible');
  }

  function openModule() {
    if (!isAdmin()) return;
    addStyle();
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'cfAccountingDocsTitle');
      overlay.innerHTML = [
        '<section class="cf-accounting-docs-sheet">',
          '<header class="cf-accounting-docs-head">',
            '<div><h1 id="cfAccountingDocsTitle">Dokumenty dla księgowej</h1><p>Wybierz miesiąc i zobacz źródła dokumentów przygotowywane w CleanFleet.</p></div>',
            '<button class="cf-accounting-docs-close" type="button" data-cf-accounting-close>Wróć do panelu</button>',
          '</header>',
          '<div class="cf-accounting-docs-body">',
            '<div class="cf-accounting-period"><label for="cfAccountingMonth">Miesiąc rozliczeniowy</label><input id="cfAccountingMonth" type="month"></div>',
            '<div class="cf-accounting-source-grid">',
              '<article class="cf-accounting-source"><div class="cf-accounting-source-top"><div><h2>KSeF</h2><p>Faktury sprzedażowe i zakupowe pobierane bezpośrednio z KSeF.</p></div><span class="cf-accounting-status is-next">Kolejny etap</span></div><p>Połączenie zostanie dodane po przygotowaniu widoku modułu.</p></article>',
              '<article class="cf-accounting-source"><div class="cf-accounting-source-top"><div><h2>mBank</h2><p>Eksport CSV z historią rachunku.</p></div><span class="cf-accounting-status">Plik z komputera</span></div><label class="cf-accounting-upload">Wybierz plik CSV<input id="cfAccountingBankInput" type="file" accept=".csv,text/csv"></label><div class="cf-accounting-file" id="cfAccountingBankFile"></div></article>',
              '<article class="cf-accounting-source"><div class="cf-accounting-source-top"><div><h2>mOrganizer</h2><p>Eksportowana paczka faktur w jednym pliku PDF.</p></div><span class="cf-accounting-status">Plik z komputera</span></div><label class="cf-accounting-upload">Wybierz plik PDF<input id="cfAccountingOrganizerInput" type="file" accept=".pdf,application/pdf"></label><div class="cf-accounting-file" id="cfAccountingOrganizerFile"></div></article>',
              '<article class="cf-accounting-source"><div class="cf-accounting-source-top"><div><h2>Poczta o2</h2><p>Załączniki otrzymywane od banku.</p></div><span class="cf-accounting-status is-next">Późniejszy etap</span></div><p>Połączenie skrzynki i pobieranie załączników dodamy po integracji KSeF.</p></article>',
            '</div>',
            '<div class="cf-accounting-note">Na tym etapie aplikacja zapisuje wyłącznie nazwy wybranych plików w bieżącym widoku. Nie wysyła ich do serwera ani nie tworzy jeszcze paczki ZIP.</div>',
            '<div class="cf-accounting-next">Następnie podłączymy KSeF, potem pocztę o2. Strukturę folderów i końcowy ZIP ustalimy po tych integracjach. Wybrany miesiąc: <strong id="cfAccountingMonthLabel">wybranego miesiąca</strong>.</div>',
          '</div>',
        '</section>'
      ].join('');
      overlay.addEventListener('click', event => {
        if (event.target === overlay || event.target.closest('[data-cf-accounting-close]')) closeModule();
      });
      overlay.addEventListener('change', event => {
        const input = event.target;
        if (input?.id === 'cfAccountingMonth') updateMonth();
        if (input?.id === 'cfAccountingBankInput') {
          const file = input.files?.[0] || null;
          selectedFiles.bank = file && /\.csv$/i.test(file.name) ? file : null;
          fileCard('bank', selectedFiles.bank);
        }
        if (input?.id === 'cfAccountingOrganizerInput') {
          const file = input.files?.[0] || null;
          selectedFiles.organizer = file && (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') ? file : null;
          fileCard('organizer', selectedFiles.organizer);
        }
      });
      document.body.appendChild(overlay);
    }
    const now = new Date();
    const monthInput = document.getElementById('cfAccountingMonth');
    if (monthInput && !monthInput.value) monthInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    fileCard('bank', selectedFiles.bank);
    fileCard('organizer', selectedFiles.organizer);
    updateMonth();
    priorBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    overlay.classList.add('cf-open');
    overlay.querySelector('[data-cf-accounting-close]')?.focus({ preventScroll: true });
  }

  function closeModule() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    overlay.classList.remove('cf-open');
    document.body.style.overflow = priorBodyOverflow;
  }

  function syncTile() {
    const grid = document.getElementById('cfCompanyGrid');
    if (!grid) return;
    if (isAdmin()) renderTile(grid);
    else {
      grid.querySelector('#' + TILE_ID)?.remove();
      closeModule();
    }
  }

  function boot() {
    addStyle();
    syncTile();
    observer = new MutationObserver(() => syncTile());
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', event => {
      const tile = event.target.closest?.('#' + TILE_ID);
      if (!tile) return;
      event.preventDefault();
      event.stopPropagation();
      openModule();
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.getElementById(OVERLAY_ID)?.classList.contains('cf-open')) closeModule();
    });
    window.addEventListener('pagehide', () => { observer?.disconnect(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
