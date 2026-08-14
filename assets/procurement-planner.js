(() => {
  'use strict';

  const STORAGE_NORMS = 'rossilber.procurement.categoryNorms.lkm.v2';
  const STORAGE_OVERRIDES = 'rossilber.procurement.itemNorms.lkm.v2';
  const PAGE_SIZE = 50;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const DEFAULT_NORMS = [
    { category: 'Критичное сырьё', minStock: 2500, leadDays: 45, targetDays: 60, minOrder: 1000, pack: 25 },
    { category: 'Связующие и смолы', minStock: 2200, leadDays: 30, targetDays: 45, minOrder: 1000, pack: 25 },
    { category: 'Пигменты и наполнители', minStock: 1800, leadDays: 35, targetDays: 45, minOrder: 500, pack: 25 },
    { category: 'Растворители', minStock: 3000, leadDays: 14, targetDays: 30, minOrder: 1000, pack: 200 },
    { category: 'Функциональные добавки', minStock: 250, leadDays: 45, targetDays: 60, minOrder: 100, pack: 25 },
    { category: 'Упаковка ЛКМ', minStock: 5000, leadDays: 14, targetDays: 30, minOrder: 1000, pack: 100 },
    { category: 'Лабораторные материалы', minStock: 100, leadDays: 21, targetDays: 45, minOrder: 20, pack: 5 },
    { category: 'СИЗ и охрана труда', minStock: 500, leadDays: 14, targetDays: 30, minOrder: 100, pack: 10 },
    { category: 'Хозяйственные товары', minStock: 300, leadDays: 7, targetDays: 21, minOrder: 100, pack: 10 },
    { category: 'Ремонт и обслуживание', minStock: 100, leadDays: 21, targetDays: 30, minOrder: 10, pack: 1 },
    { category: 'Прочие', minStock: 100, leadDays: 14, targetDays: 28, minOrder: 10, pack: 1 }
  ];

  const STATUS = {
    urgent: { label: 'Заказать срочно', severity: 1 },
    week: { label: 'Заказать на неделе', severity: 2 },
    plan: { label: 'Запланировать', severity: 3 },
    sufficient: { label: 'Запас достаточный', severity: 4 },
    excess: { label: 'Не закупать / излишек', severity: 5 },
    missing: { label: 'Нет данных для расчёта', severity: 0 }
  };

  const FIELD_ALIASES = {
    organization: ['организация', 'предприятие', 'юр лицо', 'юридическое лицо'],
    supplyCenter: ['центр снабжения', 'отдел снабжения', 'служба снабжения'],
    accountingCenter: ['бухгалтерия', 'центр бухгалтерии'],
    code: ['код номенклатуры', 'код товара', 'код материала', 'номенклатура код', 'код'],
    article: ['артикул', 'sku', 'номер артикула'],
    name: ['наименование', 'номенклатура', 'материал', 'товар', 'наименование номенклатуры'],
    category: ['категория', 'группа номенклатуры', 'вид номенклатуры', 'товарная группа', 'группа'],
    criticality: ['критичность', 'приоритет сырья', 'уровень критичности', 'приоритет'],
    warehouse: ['склад', 'место хранения', 'склад получатель'],
    supplier: ['поставщик', 'контрагент', 'основной поставщик'],
    unit: ['ед изм', 'единица измерения', 'единица', 'базовая единица'],
    periodDays: ['период дней', 'дней в периоде', 'количество дней', 'дни периода'],
    opening: ['начальный остаток', 'остаток начало', 'входящий остаток'],
    receipts: ['приход', 'поступление', 'поступило', 'оборот приход'],
    consumption: ['расход', 'потребление', 'списание', 'оборот расход', 'реализация'],
    current: ['текущий остаток', 'конечный остаток', 'остаток конец', 'остаток на складе', 'фактический остаток'],
    reserve: ['резерв', 'в резерве', 'зарезервировано'],
    incoming: ['в пути', 'ожидается к поступлению', 'открытые заказы', 'заказано поставщику', 'к поступлению'],
    arrivalDate: ['дата поступления', 'плановая дата поступления', 'ожидаемая дата поставки', 'ближайшая дата поступления'],
    price: ['цена закупки', 'закупочная цена', 'цена', 'себестоимость']
  };

  const cloneData = (value) => typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

  const state = {
    items: [],
    results: [],
    filtered: [],
    categoryNorms: loadJson(STORAGE_NORMS, DEFAULT_NORMS),
    overrides: loadJson(STORAGE_OVERRIDES, {}),
    page: 1,
    fileName: '',
    loadedAt: null,
    selectedId: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const refs = {
    fileInput: $('#fileInput'), dropzone: $('#dropzone'), loadDemo: $('#loadBuiltInDemoBtn'), loadDemoFile: $('#loadDemoFileBtn'),
    uploadProgress: $('#uploadProgress'), uploadProgressText: $('#uploadProgressText'),
    fileSummary: $('#fileSummary'), fileName: $('#fileName'), fileMeta: $('#fileMeta'), dataState: $('#dataState'), updatedLabel: $('#updatedLabel'),
    search: $('#searchInput'), status: $('#statusFilter'), warehouse: $('#warehouseFilter'), category: $('#categoryFilter'), resultBody: $('#resultBody'),
    empty: $('#emptyState'), pagination: $('#pagination'), pageInfo: $('#pageInfo'), tableContext: $('#tableContext'), calcDate: $('#calculationDate'),
    categoryNormBody: $('#categoryNormBody'), itemNormBody: $('#itemNormBody'), normSearch: $('#normSearchInput'),
    drawer: $('#detailDrawer'), drawerTitle: $('#drawerTitle'), drawerCode: $('#drawerCode'), drawerContent: $('#drawerContent'),
    helpModal: $('#helpModal'), toastStack: $('#toastStack')
  };

  function loadJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && (Array.isArray(fallback) ? Array.isArray(value) : typeof value === 'object') ? value : cloneData(fallback);
    } catch (_) { return cloneData(fallback); }
  }

  function persistNorms() {
    localStorage.setItem(STORAGE_NORMS, JSON.stringify(state.categoryNorms));
    localStorage.setItem(STORAGE_OVERRIDES, JSON.stringify(state.overrides));
  }

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const normalizeHeader = (value) => String(value ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim().replace(/\s+/g, ' ');
  const formatQty = (value) => Number.isFinite(value) ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value) : '—';
  const formatMoney = (value) => Number.isFinite(value) ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value) + ' ₽' : '—';
  const formatDate = (value) => value instanceof Date && !Number.isNaN(value.valueOf()) ? new Intl.DateTimeFormat('ru-RU').format(value) : '—';
  const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));

  function toNumber(value, fallback = 0) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    let text = String(value ?? '').trim().replace(/[\s\u00A0₽]/g, '');
    if (!text) return fallback;
    if (text.includes(',') && text.includes('.')) text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
    else text = text.replace(',', '.');
    const number = Number(text.replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(number) ? number : fallback;
  }

  function parseDateValue(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number' && value > 20000 && value < 90000) {
      const d = new Date(Date.UTC(1899, 11, 30)); d.setUTCDate(d.getUTCDate() + value); return d;
    }
    const text = String(value).trim();
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(text + 'T00:00:00') : null;
    if (iso && !Number.isNaN(iso.valueOf())) return iso;
    const parts = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
    if (parts) {
      const year = Number(parts[3]) < 100 ? 2000 + Number(parts[3]) : Number(parts[3]);
      const d = new Date(year, Number(parts[2]) - 1, Number(parts[1]));
      return Number.isNaN(d.valueOf()) ? null : d;
    }
    return null;
  }

  function showToast(title, message, type = 'success', duration = 5200) {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'is-error' : ''}`;
    toast.innerHTML = `<span class="material-symbols-outlined">${type === 'error' ? 'error' : 'check_circle'}</span><div><strong>${esc(title)}</strong><span>${esc(message)}</span></div><button type="button" aria-label="Закрыть"><span class="material-symbols-outlined">close</span></button>`;
    refs.toastStack.append(toast);
    const remove = () => toast.remove();
    $('button', toast).addEventListener('click', remove);
    if (duration) setTimeout(remove, duration);
  }

  function setBusy(isBusy, label = '') {
    refs.dataState.classList.toggle('is-ready', !isBusy && state.items.length > 0);
    refs.dataState.innerHTML = `<span class="state-dot"></span>${esc(isBusy ? label || 'Обработка файла…' : state.items.length ? 'Данные готовы' : 'Данные не загружены')}`;
    refs.uploadProgress.classList.toggle('is-hidden', !isBusy);
    refs.uploadProgress.classList.remove('is-error');
    refs.uploadProgressText.textContent = label || 'Обработка файла…';
  }

  function showUploadError(message) {
    refs.uploadProgress.classList.remove('is-hidden');
    refs.uploadProgress.classList.add('is-error');
    refs.uploadProgressText.textContent = message;
  }

  function buildFallbackTopbar() {
    if ($('#corp-topbar')) return;
    document.body.insertAdjacentHTML('afterbegin', `<nav id="corp-topbar"><a href="./" class="tb-brand"><div class="tb-logo">R</div><div><div class="tb-name">Rossilber</div><div class="tb-sub">AI Company</div></div></a><div class="tb-nav"><a href="#upload"><span class="material-symbols-outlined">account_tree</span>Данные</a><a href="#traffic"><span class="material-symbols-outlined">dashboard</span>Светофор</a><a href="#tab-recommendations" class="is-active"><span class="material-symbols-outlined">analytics</span>Аналитика</a><a href="#tab-norms"><span class="material-symbols-outlined">rocket_launch</span>Нормативы</a></div><a class="tb-back" href="./"><span class="material-symbols-outlined">refresh</span><span>Сначала</span></a></nav>`);
  }

  async function parseXlsx(file) {
    if (!window.ProcurementXlsx?.parseXlsx) throw new Error('Загрузчик XLSX не инициализирован. Используйте новую версию HTML-страницы.');
    return window.ProcurementXlsx.parseXlsx(file);
  }

  function parseDelimited(text) {
    text = String(text).replace(/^\uFEFF/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const candidates = [';', '\t', ','];
    const delimiter = candidates.map((char) => ({ char, count: firstLine.split(char).length - 1 })).sort((a, b) => b.count - a.count)[0].char;
    const rows = []; let row = []; let cell = ''; let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) { row.push(cell); cell = ''; }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell); if (row.some((value) => value.trim() !== '')) rows.push(row); row = []; cell = '';
      } else cell += char;
    }
    row.push(cell); if (row.some((value) => value.trim() !== '')) rows.push(row);
    return rows;
  }

  function findHeaderRow(matrix) {
    let best = { index: 0, score: -1 };
    matrix.slice(0, 15).forEach((row, index) => {
      const headers = row.map(normalizeHeader);
      let score = 0;
      Object.values(FIELD_ALIASES).forEach((aliases) => { if (aliases.some((alias) => headers.includes(normalizeHeader(alias)))) score += 1; });
      if (score > best.score) best = { index, score };
    });
    if (best.score < 4) throw new Error('Не удалось распознать заголовки. Проверьте наличие полей «Наименование», «Расход» и «Текущий остаток».');
    return best.index;
  }

  function normalizeMatrix(matrix) {
    const headerIndex = findHeaderRow(matrix);
    const headers = matrix[headerIndex].map(normalizeHeader);
    const columnMap = {};
    Object.entries(FIELD_ALIASES).forEach(([field, aliases]) => {
      columnMap[field] = headers.findIndex((header) => aliases.some((alias) => header === normalizeHeader(alias)));
    });
    const getValue = (row, field) => columnMap[field] >= 0 ? row[columnMap[field]] : '';
    const normalized = matrix.slice(headerIndex + 1).map((row, index) => {
      const code = String(getValue(row, 'code') || getValue(row, 'article') || '').trim();
      const name = String(getValue(row, 'name') || '').trim();
      if (!code && !name) return null;
      const issues = [];
      if (!code) issues.push('нет кода');
      if (!name) issues.push('нет наименования');
      if (columnMap.consumption < 0) issues.push('нет поля расхода');
      if (columnMap.current < 0) issues.push('нет текущего остатка');
      if (columnMap.periodDays < 0) issues.push('период принят равным 56 дням');
      const category = String(getValue(row, 'category') || 'Прочие').trim() || 'Прочие';
      const warehouse = String(getValue(row, 'warehouse') || 'Без склада').trim() || 'Без склада';
      const organization = String(getValue(row, 'organization') || '').trim();
      const finalCode = code || `AUTO-${String(index + 1).padStart(5, '0')}`;
      return {
        id: `${organization}|${warehouse}|${finalCode}`,
        organization, supplyCenter: String(getValue(row, 'supplyCenter') || '').trim(), accountingCenter: String(getValue(row, 'accountingCenter') || '').trim(),
        code: finalCode, article: String(getValue(row, 'article') || '').trim(), name: name || finalCode,
        category, warehouse, supplier: String(getValue(row, 'supplier') || 'Не указан').trim() || 'Не указан',
        criticality: String(getValue(row, 'criticality') || 'Стандарт').trim() || 'Стандарт',
        unit: String(getValue(row, 'unit') || 'ед.').trim() || 'ед.', periodDays: Math.max(1, toNumber(getValue(row, 'periodDays'), 56)),
        opening: Math.max(0, toNumber(getValue(row, 'opening'))), receipts: Math.max(0, toNumber(getValue(row, 'receipts'))),
        consumption: Math.max(0, toNumber(getValue(row, 'consumption'))), current: Math.max(0, toNumber(getValue(row, 'current'))),
        reserve: Math.max(0, toNumber(getValue(row, 'reserve'))), incoming: Math.max(0, toNumber(getValue(row, 'incoming'))),
        arrivalDate: parseDateValue(getValue(row, 'arrivalDate')), price: Math.max(0, toNumber(getValue(row, 'price'))), issues
      };
    }).filter(Boolean);
    return consolidateItems(normalized);
  }

  function consolidateItems(items) {
    const map = new Map();
    items.forEach((item) => {
      if (!map.has(item.id)) map.set(item.id, { ...item });
      else {
        const target = map.get(item.id);
        target.consumption += item.consumption;
        target.receipts += item.receipts;
        target.periodDays = Math.max(target.periodDays, item.periodDays);
        target.current = item.current || target.current;
        target.reserve = item.reserve || target.reserve;
        target.incoming = Math.max(target.incoming, item.incoming);
        target.arrivalDate = item.arrivalDate || target.arrivalDate;
        target.price = item.price || target.price;
        target.issues = uniqueSorted([...target.issues, ...item.issues]);
      }
    });
    return [...map.values()];
  }

  function getNorm(item) {
    if (state.overrides[item.id]) return { ...state.overrides[item.id], category: item.category, source: 'Индивидуальный' };
    const exact = state.categoryNorms.find((norm) => normalizeHeader(norm.category) === normalizeHeader(item.category));
    const fallback = state.categoryNorms.find((norm) => normalizeHeader(norm.category) === 'прочие');
    return exact ? { ...exact, source: 'Категория' } : fallback ? { ...fallback, source: 'Категория «Прочие»' } : null;
  }

  function calculate(item) {
    const norm = getNorm(item);
    if (!norm || item.periodDays <= 0 || !Number.isFinite(item.current) || !Number.isFinite(item.consumption)) {
      return { ...item, norm, status: 'missing', daily: 0, available: Math.max(0, item.current - item.reserve), daysCover: null, orderQty: 0, orderValue: 0, deadline: null, valid: false, reason: 'Не хватает данных или норматива для расчёта.' };
    }
    const daily = item.consumption / item.periodDays;
    const available = Math.max(0, item.current - item.reserve);
    const position = available + item.incoming;
    const projectedAtLead = position - daily * norm.leadDays;
    const reorderPoint = norm.minStock + daily * norm.leadDays;
    const daysCover = daily > 0 ? position / daily : null;
    const daysUntilOrder = daily > 0 ? (position - norm.minStock) / daily - norm.leadDays : Number.POSITIVE_INFINITY;
    const targetStock = norm.minStock + daily * (norm.leadDays + norm.targetDays);
    const rawNeed = Math.max(0, targetStock - position);
    let status;
    if (daily === 0) status = available > norm.minStock * 1.5 ? 'excess' : 'sufficient';
    else if (projectedAtLead < norm.minStock) status = 'urgent';
    else if (daysUntilOrder <= 7) status = 'week';
    else if (daysUntilOrder <= 21) status = 'plan';
    else if (position > norm.minStock + daily * (norm.leadDays + norm.targetDays * 2.2)) status = 'excess';
    else status = 'sufficient';
    let orderQty = 0;
    if (['urgent', 'week', 'plan'].includes(status) && rawNeed > 0) {
      const pack = Math.max(1, norm.pack || 1);
      orderQty = Math.max(norm.minOrder || 0, Math.ceil(rawNeed / pack) * pack);
    }
    const deadline = Number.isFinite(daysUntilOrder) ? new Date(today.getTime() + Math.max(0, Math.floor(daysUntilOrder)) * 86400000) : null;
    let reason;
    if (status === 'urgent') reason = `К моменту поставки прогнозный остаток составит ${formatQty(projectedAtLead)} ${item.unit}, что ниже неснижаемого остатка ${formatQty(norm.minStock)} ${item.unit}.`;
    else if (status === 'week') reason = `Без нового заказа точка заказа будет достигнута через ${Math.max(0, Math.ceil(daysUntilOrder))} дн.`;
    else if (status === 'plan') reason = `Закупку потребуется разместить ориентировочно через ${Math.max(0, Math.ceil(daysUntilOrder))} дн.`;
    else if (status === 'excess') reason = daily === 0 ? 'За период не было расхода, при этом на складе сохраняется запас.' : 'Запас существенно превышает целевой горизонт и требует проверки.';
    else reason = `Запаса хватит примерно на ${formatQty(daysCover)} дн.; ближайшая закупка пока не требуется.`;
    return { ...item, norm, status, daily, available, projectedAtLead, reorderPoint, daysCover, daysUntilOrder, targetStock, orderQty, orderValue: orderQty * item.price, deadline, valid: item.issues.length === 0, reason };
  }

  function recalculate() {
    state.results = state.items.map(calculate).sort((a, b) => STATUS[a.status].severity - STATUS[b.status].severity || Number(normalizeHeader(b.criticality).includes('критич')) - Number(normalizeHeader(a.criticality).includes('критич')) || b.orderValue - a.orderValue || a.name.localeCompare(b.name, 'ru'));
    state.page = 1;
    updateFilterOptions();
    applyFilters();
    renderKpis();
    renderTraffic();
    renderItemNorms();
    $('#exportPlanBtn').disabled = state.results.length === 0;
    $('#recommendationCount').textContent = String(state.results.length);
  }

  function updateFilterOptions() {
    const setOptions = (select, values, allLabel) => {
      const previous = select.value;
      select.innerHTML = `<option value="all">${esc(allLabel)}</option>` + values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
      if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    };
    setOptions(refs.warehouse, uniqueSorted(state.results.map((row) => row.warehouse)), 'Все склады');
    setOptions(refs.category, uniqueSorted(state.results.map((row) => row.category)), 'Все категории');
  }

  function applyFilters() {
    const query = normalizeHeader(refs.search.value);
    state.filtered = state.results.filter((row) => {
      const haystack = normalizeHeader([row.code, row.article, row.name, row.supplier, row.category, row.criticality, row.warehouse, row.organization].join(' '));
      return (!query || haystack.includes(query)) && (refs.status.value === 'all' || row.status === refs.status.value) && (refs.warehouse.value === 'all' || row.warehouse === refs.warehouse.value) && (refs.category.value === 'all' || row.category === refs.category.value);
    });
    const pageCount = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    if (state.page > pageCount) state.page = pageCount;
    renderResults();
  }

  function renderResults() {
    const start = (state.page - 1) * PAGE_SIZE;
    const pageRows = state.filtered.slice(start, start + PAGE_SIZE);
    refs.resultBody.innerHTML = pageRows.map((row) => `<tr class="${normalizeHeader(row.criticality).includes('критич') ? 'is-critical-row' : ''}" data-row-id="${esc(row.id)}" tabindex="0">
      <td><span class="status-badge status-${row.status}">${esc(STATUS[row.status].label)}</span></td>
      <td class="item-cell"><span class="item-title" title="${esc(row.name)}">${esc(row.name)}</span><span class="item-meta"><span>${esc(row.code)}</span>${row.article ? `<span>· ${esc(row.article)}</span>` : ''}${row.organization ? `<span>· ${esc(row.organization)}</span>` : ''}<span>· ${esc(row.warehouse)}</span></span>${normalizeHeader(row.criticality).includes('критич') ? '<span class="critical-chip">Критичное сырьё</span>' : ''}</td>
      <td class="category-cell" title="${esc(row.category)}">${esc(row.category)}</td>
      <td class="num"><strong>${formatQty(row.available)}</strong> ${esc(row.unit)}</td>
      <td class="num">${formatQty(row.daily)}</td>
      <td class="num">${row.daysCover === null ? '∞' : formatQty(row.daysCover)}</td>
      <td class="num">${row.norm ? `${formatQty(row.norm.leadDays)} дн.` : '—'}</td>
      <td class="num order-qty">${row.orderQty > 0 ? `${formatQty(row.orderQty)} ${esc(row.unit)}` : '—'}</td>
      <td class="num">${row.orderValue > 0 ? formatMoney(row.orderValue) : '—'}</td>
      <td class="num ${row.status === 'urgent' ? 'deadline-overdue' : ''}">${row.deadline ? formatDate(row.deadline) : '—'}</td>
      <td><button class="icon-btn row-action" type="button" aria-label="Открыть расчёт" data-open-row="${esc(row.id)}" data-tip="Показать подробный расчёт"><span class="material-symbols-outlined">chevron_right</span></button></td>
    </tr>`).join('');
    refs.empty.classList.toggle('is-hidden', state.results.length > 0);
    if (state.results.length > 0 && state.filtered.length === 0) {
      refs.empty.classList.remove('is-hidden');
      refs.empty.innerHTML = '<span class="material-symbols-outlined">search_off</span><strong>По фильтрам ничего не найдено</strong><p>Измените условия поиска или сбросьте фильтры.</p>';
    } else if (state.results.length === 0) {
      refs.empty.innerHTML = '<span class="material-symbols-outlined">inventory</span><strong>Рекомендации появятся после загрузки</strong><p>Используйте выгрузку из 1С или запустите встроенное демо.</p>';
    }
    refs.tableContext.textContent = state.results.length ? `Показано ${state.filtered.length} из ${state.results.length} позиций` : 'Загрузите данные, чтобы получить рекомендации';
    refs.calcDate.textContent = state.loadedAt ? `Расчёт: ${new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(state.loadedAt)}` : '';
    const pageCount = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    refs.pagination.classList.toggle('is-hidden', state.filtered.length <= PAGE_SIZE);
    refs.pageInfo.textContent = `Страница ${state.page} из ${pageCount}`;
    $('#prevPageBtn').disabled = state.page <= 1;
    $('#nextPageBtn').disabled = state.page >= pageCount;
  }

  function renderKpis() {
    const count = (status) => state.results.filter((row) => row.status === status).length;
    const urgent = count('urgent'), week = count('week');
    const criticalUrgent = state.results.filter((row) => row.status === 'urgent' && normalizeHeader(row.criticality).includes('критич')).length;
    const orderRows = state.results.filter((row) => row.orderQty > 0);
    const excessRows = state.results.filter((row) => row.status === 'excess');
    const orderValue = orderRows.reduce((sum, row) => sum + row.orderValue, 0);
    const orderQty = orderRows.reduce((sum, row) => sum + row.orderQty, 0);
    const excessValue = excessRows.reduce((sum, row) => sum + row.available * row.price, 0);
    const qualityCount = state.results.filter((row) => row.valid && row.norm).length;
    const quality = state.results.length ? Math.round(qualityCount / state.results.length * 100) : null;
    $('#kpiUrgent').textContent = String(urgent); $('#kpiWeek').textContent = String(week);
    $('#kpiUrgentSub').textContent = urgent ? `${criticalUrgent} критичных · ${formatMoney(state.results.filter((row) => row.status === 'urgent').reduce((s, r) => s + r.orderValue, 0))}` : state.results.length ? 'критических рисков нет' : 'нет загруженных данных';
    $('#kpiWeekSub').textContent = week ? 'требуют внимания закупщика' : state.results.length ? 'позиций нет' : 'нет загруженных данных';
    $('#kpiOrderValue').textContent = formatMoney(orderValue); $('#kpiOrderQty').textContent = `${formatQty(orderQty)} единиц · ${orderRows.length} позиций`;
    $('#kpiExcessValue').textContent = formatMoney(excessValue); $('#kpiExcessQty').textContent = `${excessRows.length} позиций`;
    $('#kpiQuality').textContent = quality === null ? '—' : `${quality}%`; $('#kpiQualitySub').textContent = quality === null ? 'ожидает проверки' : quality >= 95 ? 'данные готовы к работе' : `${state.results.length - qualityCount} строк требуют проверки`;
  }

  function renderTraffic() {
    Object.keys(STATUS).forEach((status) => {
      const target = $(`#traffic${status.charAt(0).toUpperCase() + status.slice(1)}`);
      if (target) target.textContent = String(state.results.filter((row) => row.status === status).length);
    });
    refs.updatedLabel.textContent = state.loadedAt ? `Обновлено ${new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(state.loadedAt)}` : 'Ожидает загрузки';
  }

  function renderCategoryNorms() {
    refs.categoryNormBody.innerHTML = state.categoryNorms.map((norm, index) => `<tr data-norm-index="${index}">
      <td><input class="norm-category" type="text" value="${esc(norm.category)}" data-norm-field="category" aria-label="Категория"></td>
      <td><input type="number" min="0" step="1" value="${esc(norm.minStock)}" data-norm-field="minStock" aria-label="Минимальный остаток"></td>
      <td><input type="number" min="0" step="1" value="${esc(norm.leadDays)}" data-norm-field="leadDays" aria-label="Срок поставки"></td>
      <td><input type="number" min="1" step="1" value="${esc(norm.targetDays)}" data-norm-field="targetDays" aria-label="Целевой запас"></td>
      <td><input type="number" min="0" step="1" value="${esc(norm.minOrder)}" data-norm-field="minOrder" aria-label="Минимальная партия"></td>
      <td><input type="number" min="1" step="1" value="${esc(norm.pack)}" data-norm-field="pack" aria-label="Кратность упаковки"></td>
      <td><button class="icon-btn" type="button" data-delete-norm="${index}" data-tip="Удалить норматив категории" aria-label="Удалить"><span class="material-symbols-outlined">delete</span></button></td>
    </tr>`).join('');
  }

  function renderItemNorms() {
    const query = normalizeHeader(refs.normSearch.value);
    const rows = state.results.filter((row) => !query || normalizeHeader([row.code, row.article, row.name, row.category].join(' ')).includes(query));
    const visible = rows.slice(0, 150);
    refs.itemNormBody.innerHTML = visible.map((row) => {
      const norm = getNorm(row); if (!norm) return '';
      const custom = Boolean(state.overrides[row.id]);
      return `<tr data-item-norm-id="${esc(row.id)}"><td class="item-cell"><span class="item-title">${esc(row.name)}</span><span class="item-meta">${esc(row.code)} · ${esc(row.warehouse)}</span></td><td>${esc(row.category)}</td>
        <td><input type="number" min="0" step="1" value="${esc(norm.minStock)}" data-item-norm-field="minStock"></td><td><input type="number" min="0" step="1" value="${esc(norm.leadDays)}" data-item-norm-field="leadDays"></td><td><input type="number" min="1" step="1" value="${esc(norm.targetDays)}" data-item-norm-field="targetDays"></td>
        <td><span class="norm-source ${custom ? 'custom' : ''}">${custom ? 'Индивидуальный' : esc(norm.source)}</span></td><td><button class="icon-btn" type="button" data-reset-item-norm="${esc(row.id)}" ${custom ? '' : 'disabled'} data-tip="Вернуть норматив категории" aria-label="Сбросить"><span class="material-symbols-outlined">restart_alt</span></button></td></tr>`;
    }).join('');
    $('#materialNormSummary').textContent = state.results.length ? `Найдено ${rows.length}; показано ${visible.length}` : 'Сначала загрузите таблицу';
    const overrideCount = Object.keys(state.overrides).length;
    $('#overrideCount').textContent = String(overrideCount);
  }

  function renderFileState(fileName, sourceLabel) {
    refs.fileSummary.classList.remove('is-hidden'); refs.fileName.textContent = fileName;
    refs.fileMeta.textContent = `${state.items.length} позиций · ${sourceLabel}`;
    refs.dataState.classList.add('is-ready'); refs.dataState.innerHTML = '<span class="state-dot"></span>Данные готовы';
  }

  async function loadFile(file) {
    if (!file) return;
    setBusy(true, `Читаю «${file.name}»…`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const extension = file.name.split('.').pop().toLowerCase();
      let matrix;
      if (extension === 'xlsx') {
        refs.uploadProgressText.textContent = 'Разбираю лист Excel…';
        matrix = await parseXlsx(file);
      } else if (['csv', 'tsv', 'txt'].includes(extension)) {
        refs.uploadProgressText.textContent = 'Разбираю строки таблицы…';
        matrix = parseDelimited(await file.text());
      }
      else throw new Error('Поддерживаются файлы XLSX, CSV и TSV. Старый формат XLS сохраните в 1С как XLSX.');
      refs.uploadProgressText.textContent = 'Проверяю поля и рассчитываю светофор…';
      const items = normalizeMatrix(matrix);
      if (!items.length) throw new Error('В файле нет строк с номенклатурой.');
      state.items = items; state.fileName = file.name; state.loadedAt = new Date();
      renderFileState(file.name, extension.toUpperCase()); recalculate();
      showToast('Файл обработан', `Загружено ${items.length} позиций. Рекомендации и светофор пересчитаны.`);
    } catch (error) {
      const message = error.message || String(error);
      showToast('Не удалось загрузить файл', message, 'error', 12000);
      setBusy(false);
      showUploadError(`Ошибка: ${message}`);
    } finally {
      refs.fileInput.value = '';
      if (state.items.length && !refs.uploadProgress.classList.contains('is-error')) setBusy(false);
    }
  }

  async function loadDemoXlsx() {
    const demoName = 'Демо_движение_товаров_1С_мини_40_строк.xlsx';
    setBusy(true, 'Загружаю тестовый XLSX…');
    try {
      const response = await fetch(`./${encodeURIComponent(demoName)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Тестовый файл недоступен: HTTP ${response.status}`);
      const blob = await response.blob();
      const file = typeof File === 'function'
        ? new File([blob], demoName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        : Object.assign(blob, { name: demoName });
      await loadFile(file);
    } catch (error) {
      const message = error?.message || String(error);
      setBusy(false);
      showUploadError(`Ошибка теста XLSX: ${message}`);
      showToast('Тест XLSX не выполнен', message, 'error', 12000);
    }
  }

  function builtInDemo() {
    const categories = DEFAULT_NORMS.slice(0, 10);
    const warehouses = ['Центральный склад', 'Склад производства №1', 'Склад производства №2', 'Склад комплектующих'];
    const suppliers = ['ООО «ПромСнаб»', 'АО «МеталлРесурс»', 'ООО «ТехКомплект»', 'ООО «СеверТрейд»', 'АО «Индустрия»'];
    state.items = Array.from({ length: 180 }, (_, index) => {
      const norm = categories[index % categories.length];
      const periodDays = 56 + (index % 3) * 7;
      const daily = index % 23 === 0 ? 0 : Math.max(1, Math.round(norm.minStock / Math.max(norm.leadDays, 5) * (.09 + (index % 7) * .018)));
      const phase = index % 20;
      const orderDelay = phase < 4 ? -4 : phase < 8 ? 4 : phase < 12 ? 14 : phase < 18 ? 30 : norm.targetDays * 3.4;
      const reserve = Math.round(daily * (index % 3));
      const incoming = index % 9 === 0 ? daily * 6 : 0;
      const desiredPosition = daily > 0 ? norm.minStock + daily * (norm.leadDays + orderDelay) : 0;
      const current = daily === 0 ? norm.minStock * (2 + index % 4) : Math.max(0, Math.round(desiredPosition - incoming + reserve));
      const code = `НМ-${String(index + 1).padStart(5, '0')}`;
      return { id: `Демо|${warehouses[index % 4]}|${code}`, organization: index % 2 ? 'Завод 2' : 'Завод 1', supplyCenter: 'Единый отдел снабжения', accountingCenter: 'Единая бухгалтерия', code, article: `АРТ-${10000 + index}`, name: `${['Материал', 'Комплектующая', 'Заготовка', 'Расходник'][index % 4]} ${String(index + 1).padStart(3, '0')}`, category: norm.category, criticality: norm.category === 'Критичное сырьё' ? 'Критичное сырьё' : 'Стандарт', warehouse: warehouses[index % 4], supplier: suppliers[index % 5], unit: ['шт.', 'кг', 'м'][index % 3], periodDays, opening: current + daily * 9, receipts: daily * 7, consumption: daily * periodDays, current, reserve, incoming, arrivalDate: incoming > 0 ? new Date(today.getTime() + norm.leadDays * .6 * 86400000) : null, price: 25 + (index % 17) * 143.5, issues: [] };
    });
    state.fileName = 'Встроенное демо'; state.loadedAt = new Date();
    renderFileState('Встроенное демо · 180 позиций', 'готовый сценарий'); recalculate();
    showToast('Демонстрация запущена', 'Светофор заполнен. Нажмите на любую строку, чтобы увидеть объяснение расчёта.');
  }

  function clearData() {
    state.items = []; state.results = []; state.filtered = []; state.fileName = ''; state.loadedAt = null; state.page = 1;
    refs.fileSummary.classList.add('is-hidden'); refs.search.value = ''; refs.status.value = 'all';
    updateFilterOptions(); renderResults(); renderKpis(); renderTraffic(); renderItemNorms(); setBusy(false);
    $('#exportPlanBtn').disabled = true; $('#recommendationCount').textContent = '0';
    showToast('Данные очищены', 'Нормативы сохранены. Можно загрузить следующую выгрузку.');
  }

  function openDrawer(id) {
    const row = state.results.find((item) => item.id === id); if (!row) return;
    state.selectedId = id; refs.drawerTitle.textContent = row.name; refs.drawerCode.textContent = `${row.code}${row.article ? ` · ${row.article}` : ''} · ${row.warehouse}`;
    const norm = row.norm;
    refs.drawerContent.innerHTML = `${normalizeHeader(row.criticality).includes('критич') ? '<div class="critical-alert"><span class="material-symbols-outlined">priority_high</span><div><strong>Критичное сырьё</strong><span>Особо важная позиция для непрерывности производства ЛКМ</span></div></div>' : ''}<div class="drawer-status"><span class="status-badge status-${row.status}">${esc(STATUS[row.status].label)}</span><p>${esc(row.reason)}</p></div>
      <div class="drawer-kpis"><div class="drawer-kpi"><span>Доступно</span><strong>${formatQty(row.available)} ${esc(row.unit)}</strong></div><div class="drawer-kpi"><span>Запас в днях</span><strong>${row.daysCover === null ? '∞' : formatQty(row.daysCover)}</strong></div><div class="drawer-kpi"><span>Рекомендуемый заказ</span><strong>${formatQty(row.orderQty)} ${esc(row.unit)}</strong></div><div class="drawer-kpi"><span>Сумма заказа</span><strong>${formatMoney(row.orderValue)}</strong></div></div>
      <div class="calculation-box"><h3>Расчёт прогнозного остатка к поставке</h3><div class="calc-line"><span>Текущий остаток</span><strong>${formatQty(row.current)} ${esc(row.unit)}</strong></div><div class="calc-line"><span>Минус резерв</span><strong>− ${formatQty(row.reserve)} ${esc(row.unit)}</strong></div><div class="calc-line"><span>Плюс товар в пути</span><strong>+ ${formatQty(row.incoming)} ${esc(row.unit)}</strong></div><div class="calc-line"><span>Расход за ${norm ? formatQty(norm.leadDays) : '—'} дн. поставки</span><strong>− ${norm ? formatQty(row.daily * norm.leadDays) : '—'} ${esc(row.unit)}</strong></div><div class="calc-line total"><span>Прогноз к поставке</span><strong>${Number.isFinite(row.projectedAtLead) ? `${formatQty(row.projectedAtLead)} ${esc(row.unit)}` : '—'}</strong></div></div>
      <div class="drawer-kpis"><div class="drawer-kpi"><span>Мин. остаток</span><strong>${norm ? formatQty(norm.minStock) : '—'} ${esc(row.unit)}</strong></div><div class="drawer-kpi"><span>Срок поставки</span><strong>${norm ? `${formatQty(norm.leadDays)} дн.` : '—'}</strong></div><div class="drawer-kpi"><span>Расход / день</span><strong>${formatQty(row.daily)} ${esc(row.unit)}</strong></div><div class="drawer-kpi"><span>Источник норматива</span><strong>${norm ? esc(norm.source) : '—'}</strong></div></div>
      <div class="drawer-actions"><button class="btn btn-ghost" type="button" id="drawerNormBtn"><span class="material-symbols-outlined">tune</span>Настроить норматив</button><button class="btn btn-primary" type="button" data-close-drawer>Закрыть</button></div>`;
    refs.drawer.classList.add('is-open'); refs.drawer.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
    $('#drawerNormBtn').addEventListener('click', () => { closeDrawer(); switchTab('norms'); switchNormView('items'); refs.normSearch.value = row.code; renderItemNorms(); refs.normSearch.focus(); });
  }

  function closeDrawer() { refs.drawer.classList.remove('is-open'); refs.drawer.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }
  function openHelp() { refs.helpModal.classList.add('is-open'); refs.helpModal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; }
  function closeHelp() { refs.helpModal.classList.remove('is-open'); refs.helpModal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }

  function switchTab(name) {
    $$('.tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === name));
    $$('.tab-panel').forEach((panel) => panel.classList.toggle('is-active', panel.id === `tab-${name}`));
  }
  function switchNormView(name) {
    $$('.subtab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.normView === name));
    $$('.norm-view').forEach((view) => view.classList.toggle('is-active', view.id === `norm-${name}`));
  }

  function downloadCsv(filename, rows) {
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function exportPlan() {
    const rows = state.results.filter((row) => row.orderQty > 0);
    if (!rows.length) return showToast('План пуст', 'По текущему расчёту нет позиций с рекомендуемым заказом.', 'error');
    const header = ['Статус', 'Критичность', 'Предприятие', 'Центр снабжения', 'Код номенклатуры', 'Артикул', 'Наименование', 'Категория', 'Склад', 'Поставщик', 'Доступный остаток', 'Ед. изм.', 'Расход в день', 'Запас, дней', 'Срок поставки, дней', 'Мин. остаток', 'Рекомендуемый заказ', 'Цена закупки', 'Сумма заказа', 'Разместить до', 'Причина'];
    downloadCsv(`План_закупок_${today.toISOString().slice(0, 10)}.csv`, [header, ...rows.map((row) => [STATUS[row.status].label, row.criticality, row.organization, row.supplyCenter, row.code, row.article, row.name, row.category, row.warehouse, row.supplier, row.available, row.unit, row.daily, row.daysCover ?? '', row.norm?.leadDays ?? '', row.norm?.minStock ?? '', row.orderQty, row.price, row.orderValue, row.deadline ? row.deadline.toISOString().slice(0, 10) : '', row.reason])]);
    showToast('План выгружен', `${rows.length} позиций сохранено в CSV.`);
  }

  function exportNorms() {
    const header = ['Уровень', 'Код номенклатуры', 'Наименование / категория', 'Склад', 'Минимальный остаток', 'Срок поставки, дней', 'Целевой запас, дней', 'Минимальная партия', 'Кратность упаковки'];
    const categories = state.categoryNorms.map((norm) => ['Категория', '', norm.category, '', norm.minStock, norm.leadDays, norm.targetDays, norm.minOrder, norm.pack]);
    const overrides = Object.entries(state.overrides).map(([id, norm]) => { const row = state.results.find((item) => item.id === id); return ['Материал', row?.code || id, row?.name || '', row?.warehouse || '', norm.minStock, norm.leadDays, norm.targetDays, norm.minOrder, norm.pack]; });
    downloadCsv(`Нормативы_запасов_${today.toISOString().slice(0, 10)}.csv`, [header, ...categories, ...overrides]);
    showToast('Нормативы выгружены', `${categories.length} категорий и ${overrides.length} индивидуальных правил.`);
  }

  function bindEvents() {
    refs.dropzone.addEventListener('click', (event) => { if (!event.target.closest('button,input[type="file"]')) refs.fileInput.click(); });
    refs.dropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); refs.fileInput.click(); } });
    ['dragenter', 'dragover'].forEach((name) => refs.dropzone.addEventListener(name, (event) => { event.preventDefault(); refs.dropzone.classList.add('is-dragging'); }));
    ['dragleave', 'drop'].forEach((name) => refs.dropzone.addEventListener(name, (event) => { event.preventDefault(); refs.dropzone.classList.remove('is-dragging'); }));
    refs.dropzone.addEventListener('drop', (event) => { const file = event.dataTransfer.files[0]; if (file) loadFile(file); });
    refs.fileInput.addEventListener('change', () => {
      const file = refs.fileInput.files[0];
      if (!file) return;
      refs.dataState.innerHTML = '<span class="state-dot"></span>Файл выбран';
      refs.uploadProgress.classList.remove('is-hidden', 'is-error');
      refs.uploadProgressText.textContent = `Начинаю обработку «${file.name}»…`;
      setTimeout(() => loadFile(file), 0);
    });
    refs.loadDemoFile.addEventListener('click', loadDemoXlsx); refs.loadDemo.addEventListener('click', builtInDemo); $('#clearDataBtn').addEventListener('click', clearData);
    $('#closeNoticeBtn').addEventListener('click', () => $('#introNotice').remove()); $('#helpBtn').addEventListener('click', openHelp); $('#exportPlanBtn').addEventListener('click', exportPlan);
    $$('[data-close-modal]').forEach((element) => element.addEventListener('click', closeHelp)); $$('[data-close-drawer]').forEach((element) => element.addEventListener('click', closeDrawer));
    $$('.tab').forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab))); $$('.subtab').forEach((tab) => tab.addEventListener('click', () => switchNormView(tab.dataset.normView)));
    [refs.search, refs.status, refs.warehouse, refs.category].forEach((control) => control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', () => { state.page = 1; applyFilters(); }));
    $('#resetFiltersBtn').addEventListener('click', () => { refs.search.value = ''; refs.status.value = 'all'; refs.warehouse.value = 'all'; refs.category.value = 'all'; state.page = 1; applyFilters(); });
    $('#prevPageBtn').addEventListener('click', () => { if (state.page > 1) { state.page -= 1; renderResults(); } }); $('#nextPageBtn').addEventListener('click', () => { if (state.page * PAGE_SIZE < state.filtered.length) { state.page += 1; renderResults(); } });
    refs.resultBody.addEventListener('click', (event) => { const button = event.target.closest('[data-open-row]'); const row = event.target.closest('tr[data-row-id]'); openDrawer(button?.dataset.openRow || row?.dataset.rowId); });
    refs.resultBody.addEventListener('keydown', (event) => { if (event.key === 'Enter') openDrawer(event.target.closest('tr[data-row-id]')?.dataset.rowId); });
    $$('.traffic-row').forEach((row) => row.addEventListener('click', () => { refs.status.value = row.dataset.statusFilter; switchTab('recommendations'); state.page = 1; applyFilters(); $('#tab-recommendations').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    refs.categoryNormBody.addEventListener('change', (event) => {
      const input = event.target.closest('[data-norm-field]'); if (!input) return; const row = input.closest('[data-norm-index]'); const index = Number(row.dataset.normIndex); const field = input.dataset.normField;
      state.categoryNorms[index][field] = field === 'category' ? input.value.trim() || `Категория ${index + 1}` : Math.max(field === 'targetDays' || field === 'pack' ? 1 : 0, toNumber(input.value));
      persistNorms(); recalculate(); renderCategoryNorms(); showToast('Норматив обновлён', 'Все рекомендации пересчитаны автоматически.', 'success', 2600);
    });
    refs.categoryNormBody.addEventListener('click', (event) => { const button = event.target.closest('[data-delete-norm]'); if (!button) return; state.categoryNorms.splice(Number(button.dataset.deleteNorm), 1); persistNorms(); renderCategoryNorms(); recalculate(); });
    $('#addCategoryBtn').addEventListener('click', () => { let number = 1; while (state.categoryNorms.some((norm) => norm.category === `Новая категория ${number}`)) number += 1; state.categoryNorms.push({ category: `Новая категория ${number}`, minStock: 100, leadDays: 14, targetDays: 28, minOrder: 10, pack: 1 }); persistNorms(); renderCategoryNorms(); refs.categoryNormBody.lastElementChild?.querySelector('input')?.focus(); });
    $('#resetNormsBtn').addEventListener('click', () => { if (!confirm('Вернуть предустановленные нормативы и удалить индивидуальные настройки?')) return; state.categoryNorms = cloneData(DEFAULT_NORMS); state.overrides = {}; persistNorms(); renderCategoryNorms(); recalculate(); showToast('Нормативы восстановлены', 'Применены исходные предустановленные значения.'); });
    $('#exportNormsBtn').addEventListener('click', exportNorms); refs.normSearch.addEventListener('input', renderItemNorms);
    refs.itemNormBody.addEventListener('change', (event) => {
      const input = event.target.closest('[data-item-norm-field]'); if (!input) return; const id = input.closest('[data-item-norm-id]').dataset.itemNormId; const item = state.results.find((row) => row.id === id); if (!item) return;
      const base = state.overrides[id] || getNorm(item); state.overrides[id] = { minStock: base.minStock, leadDays: base.leadDays, targetDays: base.targetDays, minOrder: base.minOrder, pack: base.pack };
      const field = input.dataset.itemNormField; state.overrides[id][field] = Math.max(field === 'targetDays' ? 1 : 0, toNumber(input.value)); persistNorms(); recalculate(); showToast('Индивидуальный норматив сохранён', item.name, 'success', 2500);
    });
    refs.itemNormBody.addEventListener('click', (event) => { const button = event.target.closest('[data-reset-item-norm]'); if (!button || button.disabled) return; delete state.overrides[button.dataset.resetItemNorm]; persistNorms(); recalculate(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeDrawer(); closeHelp(); } });
  }

  function init() {
    renderCategoryNorms(); renderItemNorms(); renderResults(); renderKpis(); renderTraffic(); bindEvents();
    setBusy(false);
    document.documentElement.dataset.procurementReady = 'true';
    setTimeout(() => showToast('Планировщик закупок готов', 'Загрузите XLSX/CSV из 1С или запустите встроенное демо.', 'success', 6500), 650);
  }

  function reportStartupError(error) {
    const message = error?.message || String(error);
    if (refs.dataState) refs.dataState.innerHTML = `<span class="state-dot"></span>Ошибка запуска`;
    if (refs.uploadProgress && refs.uploadProgressText) showUploadError(`Ошибка запуска: ${message}`);
    console.error('Procurement planner startup error:', error);
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(buildFallbackTopbar, 0));
  window.addEventListener('unhandledrejection', (event) => reportStartupError(event.reason));
  try { init(); } catch (error) { reportStartupError(error); }
})();
