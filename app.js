(() => {
  'use strict';
  const KEY = 'oplata.v1';
  const $ = (s) => document.querySelector(s);
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = new Date();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const currentPeriod = () => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthName = (period) => new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(`${period}-01T12:00:00`));
  const money = (n) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))} ₸`;
  const fmtDate = (s) => s ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${s}T12:00:00`)) : '';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fresh = () => ({ version: 1, clients: [], items: [], invoices: [], payments: [], dueDay: 10 });
  let data = load();
  let view = 'overview';
  let period = [currentPeriod(), ...data.invoices.map(i => i.period)].sort().at(-1);
  let clientId = null;
  let search = '';
  let filter = 'all';
  let toastTimer;

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY));
      return valid(parsed) ? parsed : fresh();
    } catch { return fresh(); }
  }
  function valid(d) {
    return d && d.version === 1 && ['clients', 'items', 'invoices', 'payments'].every(k => Array.isArray(d[k])) && Number.isInteger(d.dueDay) && d.dueDay >= 1 && d.dueDay <= 28;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch { toast('Не удалось сохранить данные. Выгрузите резервную копию.'); }
    render();
  }
  function toast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3400);
  }
  function invoicePaid(inv) { return data.payments.filter(p => p.invoiceId === inv.id).reduce((s, p) => s + Number(p.amount), 0); }
  function invoiceDue(inv) { return Math.max(0, Number(inv.amount) - invoicePaid(inv)); }
  function status(inv) {
    if (invoiceDue(inv) <= 0) return ['Оплачено', 'paid'];
    if (invoicePaid(inv) > 0) return ['Частично', 'partial'];
    if (inv.dueDate && inv.dueDate < today()) return ['Просрочено', 'overdue'];
    return ['Ожидается', 'unpaid'];
  }
  function sum(arr, key) { return arr.reduce((s, x) => s + Number(key(x) || 0), 0); }
  function clientName(id) { return data.clients.find(c => c.id === id)?.name || 'Удалённый плательщик'; }
  function itemName(id) { return data.items.find(i => i.id === id)?.title || 'Счёт'; }
  function monthOptions() {
    const periods = new Set([currentPeriod(), period, ...data.invoices.map(i => i.period)]);
    for (let offset = -2; offset <= 1; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      periods.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return [...periods].sort().reverse().map(p => `<option value="${p}" ${p === period ? 'selected' : ''}>${esc(monthName(p))}</option>`).join('');
  }
  function pageHead(title, subtitle = '', actions = '') {
    return `<div class="page-head"><div><p class="eyebrow">${esc(monthName(period))}</p><h1>${title}</h1>${subtitle ? `<p class="subline">${subtitle}</p>` : ''}</div>${actions ? `<div class="head-actions">${actions}</div>` : ''}</div>`;
  }
  function empty(icon, title, description, action = '') {
    return `<div class="panel empty"><span class="empty-icon" aria-hidden="true">${icon}</span><h2>${title}</h2><p>${description}</p>${action}</div>`;
  }
  function row(inv) {
    const due = invoiceDue(inv), st = status(inv);
    return `<div class="row"><div class="row-main"><p class="row-title">${esc(clientName(inv.clientId))}</p><p class="row-sub">${esc(itemName(inv.itemId))}${inv.dueDate ? ` · до ${esc(fmtDate(inv.dueDate))}` : ' · срок не указан'}</p></div><div class="row-right"><div class="money">${money(due ? due : inv.amount)}</div><span class="status ${st[1]}">${st[0]}</span></div><button type="button" class="btn btn-light row-action" data-action="invoice" data-id="${inv.id}" aria-label="Открыть счёт ${esc(clientName(inv.clientId))}">Открыть</button></div>`;
  }
  function overview() {
    const invoices = data.invoices.filter(i => i.period === period);
    const billed = sum(invoices, i => i.amount), paid = sum(invoices, invoicePaid), due = Math.max(0, billed - paid);
    const unpaid = invoices.filter(i => invoiceDue(i) > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || clientName(a.clientId).localeCompare(clientName(b.clientId), 'ru'));
    const active = data.items.filter(i => i.active && data.clients.find(c => c.id === i.clientId)?.active);
    const actions = `<select id="period-select" aria-label="Месяц">${monthOptions()}</select><button type="button" class="btn btn-primary" data-action="generate">Создать начисления</button>`;
    let content = pageHead('Обзор оплат', 'Кто оплатил и сколько ещё ожидается', actions);
    content += `<div class="stats"><div class="stat primary"><span class="stat-label">Осталось получить</span><span class="stat-value">${money(due)}</span><span class="stat-foot">${unpaid.length} неоплаченных счетов</span><div class="progress"><span style="width:${billed ? Math.min(100, paid / billed * 100) : 0}%"></span></div></div><div class="stat"><span class="stat-label">Получено</span><span class="stat-value">${money(paid)}</span><span class="stat-foot">За выбранный месяц</span></div><div class="stat"><span class="stat-label">Начислено</span><span class="stat-value">${money(billed)}</span><span class="stat-foot">${invoices.length} счетов</span></div></div>`;
    if (!data.clients.length) content += `<div class="notice">Начните с плательщика и его ежемесячного счёта. Затем создайте начисления за нужный месяц.</div>`;
    else if (!invoices.length && active.length) content += `<div class="notice">На ${esc(monthName(period))} начисления ещё не созданы. Нажмите «Создать начисления».</div>`;
    content += `<section class="section"><div class="section-title"><h2>Ожидают оплату</h2><span class="muted">${unpaid.length} счетов</span></div>${unpaid.length ? `<div class="panel">${unpaid.map(row).join('')}</div>` : empty('✓', invoices.length ? 'Все счета оплачены' : 'Пока нет начислений', invoices.length ? 'За этот месяц задолженности нет.' : 'Добавьте плательщика и создайте начисления.', !data.clients.length ? `<button class="btn btn-primary" data-action="add-client">Добавить плательщика</button>` : '')}</section>`;
    if (invoices.length && invoices.length !== unpaid.length) content += `<section class="section"><div class="section-title"><h2>Оплачено полностью</h2><span class="muted">${invoices.length - unpaid.length} счетов</span></div><div class="panel">${invoices.filter(i => invoiceDue(i) <= 0).map(row).join('')}</div></section>`;
    return content;
  }
  function clientsPage() {
    const visible = data.clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || (filter === 'active' ? c.active : !c.active))).sort((a,b) => a.name.localeCompare(b.name, 'ru'));
    const actions = `<button class="btn btn-primary" data-action="add-client">+ Плательщик</button>`;
    let content = pageHead('Плательщики', `${data.clients.filter(c => c.active).length} активных · ${data.items.filter(i => i.active).length} ежемесячных счетов`, actions);
    content += `<div class="toolbar"><input id="client-search" type="search" placeholder="Найти плательщика" value="${esc(search)}" aria-label="Найти плательщика"><select id="client-filter" aria-label="Фильтр плательщиков"><option value="all" ${filter === 'all' ? 'selected' : ''}>Все</option><option value="active" ${filter === 'active' ? 'selected' : ''}>Активные</option><option value="archived" ${filter === 'archived' ? 'selected' : ''}>В архиве</option></select></div>`;
    content += visible.length ? `<div class="client-grid">${visible.map(c => { const items = data.items.filter(i => i.clientId === c.id && i.active); const total = sum(items, i => i.amount); return `<button class="client-card" data-action="client" data-id="${c.id}"><div class="top"><h2>${esc(c.name)}</h2><span class="pill">${c.active ? `${items.length} сч.` : 'Архив'}</span></div><p>${esc(c.phone || c.note || 'Контакт не указан')}</p><div class="total">${money(total)} <span class="muted" style="font-size:.8rem;font-weight:500">/ мес.</span></div></button>`; }).join('')}</div>` : empty('▤', data.clients.length ? 'Ничего не найдено' : 'Добавьте первого плательщика', data.clients.length ? 'Попробуйте другое имя или фильтр.' : 'Укажите компанию и сумму ежемесячного счёта.', !data.clients.length ? `<button class="btn btn-primary" data-action="add-client">Добавить плательщика</button>` : '');
    return content;
  }
  function clientPage() {
    const c = data.clients.find(x => x.id === clientId);
    if (!c) { view = 'clients'; return clientsPage(); }
    const items = data.items.filter(i => i.clientId === c.id);
    const invoices = data.invoices.filter(i => i.clientId === c.id && i.period === period);
    const billed = sum(invoices, i => i.amount), paid = sum(invoices, invoicePaid);
    let content = `<button class="btn btn-text" data-action="back-clients">← Все плательщики</button>`;
    content += pageHead(esc(c.name), esc(c.phone || c.note || (c.active ? 'Активный плательщик' : 'В архиве')), `<select id="period-select" aria-label="Месяц">${monthOptions()}</select>`);
    content += `<div class="detail-top"><button class="btn btn-outline" data-action="edit-client" data-id="${c.id}">Изменить</button><button class="btn btn-light" data-action="add-item" data-id="${c.id}">+ Ежемесячный счёт</button></div>`;
    content += `<div class="detail-summary"><div class="stat"><span class="stat-label">Начислено</span><span class="stat-value">${money(billed)}</span></div><div class="stat"><span class="stat-label">Оплачено</span><span class="stat-value">${money(paid)}</span></div><div class="stat"><span class="stat-label">Остаток</span><span class="stat-value">${money(billed-paid)}</span></div></div>`;
    content += `<section class="detail-section"><div class="section-title"><h2>Счета за месяц</h2></div>${invoices.length ? `<div class="panel">${invoices.map(row).join('')}</div>` : empty('▤', 'Начислений за месяц нет', 'Создайте их на экране «Обзор».')}</section>`;
    content += `<section class="detail-section"><div class="section-title"><h2>Ежемесячные счета</h2></div>${items.length ? `<div class="panel">${items.map(i => `<div class="line-item"><div><div class="line-title">${esc(i.title)} ${!i.active ? '<span class="status unpaid">Архив</span>' : ''}</div><div class="line-meta">${esc(i.contract ? `Договор ${i.contract} · ` : '')}${money(i.amount)} в месяц</div></div><div class="line-actions"><button class="mini-button" data-action="edit-item" data-id="${i.id}">Изменить</button></div></div>`).join('')}</div>` : empty('＋', 'Нет ежемесячных счетов', 'Добавьте счёт, чтобы создавать начисления.', `<button class="btn btn-primary" data-action="add-item" data-id="${c.id}">Добавить счёт</button>`)}</section>`;
    return content;
  }
  function historyPage() {
    const all = data.invoices;
    const billed = sum(all, i => i.amount), paid = sum(all, invoicePaid);
    const periods = [...new Set(all.map(i => i.period))].sort().reverse();
    let content = pageHead('История', 'Сводка по всем созданным начислениям', `<button class="btn btn-outline" data-action="csv">Скачать CSV</button>`);
    content += `<div class="stats"><div class="stat primary"><span class="stat-label">Всего получено</span><span class="stat-value">${money(paid)}</span><span class="stat-foot">За всё время</span></div><div class="stat"><span class="stat-label">Всего начислено</span><span class="stat-value">${money(billed)}</span></div><div class="stat"><span class="stat-label">Остаток</span><span class="stat-value">${money(billed-paid)}</span></div></div>`;
    content += periods.length ? periods.map(p => { const invoices = all.filter(i => i.period === p); return `<section class="history-month"><div class="section-title"><h2>${esc(monthName(p))}</h2><span class="history-totals">${money(sum(invoices,invoicePaid))} из ${money(sum(invoices,i=>i.amount))}</span></div><div class="panel">${invoices.sort((a,b) => clientName(a.clientId).localeCompare(clientName(b.clientId),'ru')).map(row).join('')}</div></section>`; }).join('') : empty('▤', 'История пока пуста', 'Создайте начисления за первый месяц, чтобы видеть сводку за всё время.');
    return content;
  }
  function settingsPage() {
    return pageHead('Данные и копии', 'Управление сроками и резервными копиями') + `<div class="notice">Данные хранятся только в этом браузере на этом устройстве. Раз в месяц скачивайте копию: GitHub Pages не синхронизирует записи между телефонами.</div><div class="settings-list"><div class="settings-card"><h2>Срок оплаты</h2><p>День месяца, до которого должны оплатить новые счета.</p><form id="due-form"><div class="field"><label for="due-day">День месяца</label><input id="due-day" name="dueDay" type="number" min="1" max="28" value="${data.dueDay}" required></div><button class="btn btn-primary" type="submit">Сохранить</button></form></div><div class="settings-card"><h2>Резервная копия</h2><p>Сохраните все плательщиков, счета и оплаты одним файлом JSON.</p><button class="btn btn-primary" data-action="backup">Скачать копию</button></div><div class="settings-card"><h2>Восстановить данные</h2><p>Загрузка копии заменит текущие записи на этом устройстве.</p><button class="btn btn-outline" data-action="import">Загрузить JSON</button></div><div class="settings-card"><h2>Таблица для Excel</h2><p>Выгрузите начисления, поступления и остатки в CSV.</p><button class="btn btn-outline" data-action="csv">Скачать CSV</button></div></div><p class="hint">Для работы на нескольких устройствах понадобится отдельная база данных и вход в аккаунт.</p>`;
  }
  function render() {
    $('#main').innerHTML = ({overview, clients:clientsPage, client:clientPage, history:historyPage, settings:settingsPage})[view]();
    document.querySelectorAll('.nav-button').forEach(b => { const active = b.dataset.view === (view === 'client' ? 'clients' : view); b.classList.toggle('active', active); b.setAttribute('aria-current', active ? 'page' : 'false'); });
  }
  function modal(title, body) {
    $('#modal-content').innerHTML = `<div class="modal-head"><h2>${title}</h2><button class="close" type="button" data-action="close" aria-label="Закрыть">×</button></div><div class="modal-body">${body}</div>`;
    $('#modal').showModal();
  }
  function close() { $('#modal').close(); }
  function clientForm(id) {
    const c = data.clients.find(x => x.id === id);
    modal(c ? 'Изменить плательщика' : 'Новый плательщик', `<form id="client-form"><input type="hidden" name="id" value="${esc(id || '')}"><div class="field"><label for="client-name">Название *</label><input id="client-name" name="name" required maxlength="100" value="${esc(c?.name || '')}" placeholder="Например, ТОО Меридиан"></div><div class="field"><label for="client-phone">Телефон</label><input id="client-phone" name="phone" type="tel" maxlength="60" value="${esc(c?.phone || '')}" placeholder="+7 ..."></div><div class="field"><label for="client-note">Примечание</label><textarea id="client-note" name="note" maxlength="300" placeholder="Контакт или важная деталь">${esc(c?.note || '')}</textarea></div>${c ? `<div class="field"><label for="client-active">Состояние</label><select id="client-active" name="active"><option value="true" ${c.active ? 'selected':''}>Активный</option><option value="false" ${!c.active ? 'selected':''}>В архиве</option></select></div>` : ''}<div class="form-actions"><button class="btn btn-outline" type="button" data-action="close">Отмена</button><button class="btn btn-primary" type="submit">${c ? 'Сохранить' : 'Добавить'}</button></div></form>`);
  }
  function itemForm(id, ownerId) {
    const item = data.items.find(i => i.id === id);
    modal(item ? 'Изменить ежемесячный счёт' : 'Новый ежемесячный счёт', `<form id="item-form"><input type="hidden" name="id" value="${esc(id || '')}"><input type="hidden" name="clientId" value="${esc(item?.clientId || ownerId)}"><div class="field"><label for="item-title">Счёт или объект *</label><input id="item-title" name="title" required maxlength="100" value="${esc(item?.title || '')}" placeholder="Например, перевозка / склад №4"></div><div class="field-row"><div class="field"><label for="item-contract">№ договора</label><input id="item-contract" name="contract" maxlength="50" value="${esc(item?.contract || '')}" placeholder="01/26"></div><div class="field"><label for="item-amount">Сумма в месяц, ₸ *</label><input id="item-amount" name="amount" type="number" min="1" step="1" required value="${esc(item?.amount || '')}"></div></div>${item ? `<div class="field"><label for="item-active">Состояние</label><select id="item-active" name="active"><option value="true" ${item.active ? 'selected':''}>Активный</option><option value="false" ${!item.active ? 'selected':''}>В архиве</option></select></div>` : ''}<p class="hint">Изменение суммы действует для будущих начислений. История останется прежней.</p><div class="form-actions"><button class="btn btn-outline" type="button" data-action="close">Отмена</button><button class="btn btn-primary" type="submit">Сохранить</button></div></form>`);
  }
  function invoiceModal(id) {
    const inv = data.invoices.find(i => i.id === id); if (!inv) return;
    const paid = invoicePaid(inv), due = invoiceDue(inv);
    const payments = data.payments.filter(p => p.invoiceId === inv.id).sort((a,b) => b.date.localeCompare(a.date));
    modal(`${esc(clientName(inv.clientId))} · ${esc(monthName(inv.period))}`, `<div class="payment-header"><strong>${esc(itemName(inv.itemId))}</strong><span>Начислено ${money(inv.amount)} · оплачено ${money(paid)} · остаток ${money(due)}</span></div>${due > 0 ? `<form id="payment-form"><input type="hidden" name="invoiceId" value="${inv.id}"><div class="field-row"><div class="field"><label for="payment-amount">Сумма, ₸ *</label><input id="payment-amount" name="amount" type="number" min="1" max="${due}" step="1" value="${due}" required></div><div class="field"><label for="payment-date">Дата оплаты *</label><input id="payment-date" name="date" type="date" value="${today()}" required></div></div><div class="field"><label for="payment-note">Примечание</label><input id="payment-note" name="note" maxlength="160" placeholder="Например, перевод на карту"></div><button class="btn btn-primary" type="submit">Записать оплату</button></form>` : `<div class="notice">Счёт оплачен полностью.</div>`}<div class="detail-section"><div class="section-title"><h2>Поступления</h2></div>${payments.length ? payments.map(p => `<div class="payment-record"><div><strong>${money(p.amount)}</strong><small>${esc(fmtDate(p.date))}${p.note ? ` · ${esc(p.note)}` : ''}</small></div><button class="mini-button" data-action="delete-payment" data-id="${p.id}">Удалить</button></div>`).join('') : `<p class="hint">Оплат пока нет.</p>`}</div>`);
  }
  function generate() {
    const active = data.items.filter(i => i.active && data.clients.find(c => c.id === i.clientId)?.active);
    if (!active.length) { toast('Сначала добавьте активного плательщика и счёт.'); return; }
    let count = 0;
    active.forEach(item => { if (data.invoices.some(i => i.itemId === item.id && i.period === period)) return; data.invoices.push({ id:uid(), itemId:item.id, clientId:item.clientId, period, amount:item.amount, dueDate:`${period}-${String(data.dueDay).padStart(2,'0')}`, createdAt:today() }); count++; });
    save(); toast(count ? `Создано начислений: ${count}` : 'Все начисления за этот месяц уже созданы.');
  }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function csv() {
    const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Месяц','Плательщик','Счёт','Договор','Начислено, ₸','Оплачено, ₸','Остаток, ₸','Срок оплаты','Статус']];
    data.invoices.slice().sort((a,b) => a.period.localeCompare(b.period)).forEach(i => rows.push([i.period,clientName(i.clientId),itemName(i.itemId),data.items.find(x=>x.id===i.itemId)?.contract||'',i.amount,invoicePaid(i),invoiceDue(i),i.dueDate,status(i)[0]]));
    download(`oplata-${today()}.csv`, '\ufeff' + rows.map(r => r.map(quote).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  }
  function backup() { download(`oplata-backup-${today()}.json`, JSON.stringify(data,null,2), 'application/json'); }
  async function importData(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!valid(parsed) || !parsed.clients.every(c => typeof c.id === 'string' && typeof c.name === 'string') || !parsed.items.every(i => typeof i.id === 'string' && typeof i.clientId === 'string' && Number.isFinite(Number(i.amount))) || !parsed.invoices.every(i => typeof i.id === 'string' && typeof i.period === 'string' && Number.isFinite(Number(i.amount))) || !parsed.payments.every(p => typeof p.id === 'string' && typeof p.invoiceId === 'string' && Number.isFinite(Number(p.amount)))) throw Error('Неверный формат');
      if (!confirm('Заменить все текущие данные содержимым резервной копии?')) return;
      data = parsed; view = 'overview'; period = [currentPeriod(), ...data.invoices.map(i => i.period)].sort().at(-1); save(); toast('Данные восстановлены.');
    } catch { toast('Не удалось загрузить файл. Проверьте резервную копию.'); }
    $('#import-file').value = '';
  }
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-view]'); if (nav) { view = nav.dataset.view; render(); scrollTo(0,0); return; }
    const b = e.target.closest('[data-action]'); if (!b) return;
    const id = b.dataset.id;
    switch (b.dataset.action) {
      case 'close': close(); break;
      case 'generate': generate(); break;
      case 'add-client': clientForm(); break;
      case 'edit-client': clientForm(id); break;
      case 'client': clientId = id; view = 'client'; render(); scrollTo(0,0); break;
      case 'back-clients': view = 'clients'; render(); break;
      case 'add-item': itemForm(null,id); break;
      case 'edit-item': itemForm(id); break;
      case 'invoice': invoiceModal(id); break;
      case 'delete-payment': if (confirm('Удалить эту запись об оплате?')) { const invoiceId = data.payments.find(p=>p.id===id)?.invoiceId; data.payments = data.payments.filter(p=>p.id!==id); save(); invoiceModal(invoiceId); toast('Оплата удалена.'); } break;
      case 'backup': backup(); break;
      case 'csv': csv(); break;
      case 'import': $('#import-file').click(); break;
    }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'period-select') { period = e.target.value; render(); }
    if (e.target.id === 'client-filter') { filter = e.target.value; render(); }
    if (e.target.id === 'import-file') importData(e.target.files[0]);
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'client-search') { const pos = e.target.selectionStart; search = e.target.value; render(); const input = $('#client-search'); input.focus(); input.setSelectionRange(pos,pos); }
  });
  document.addEventListener('submit', e => {
    e.preventDefault(); const form = e.target, f = new FormData(form);
    if (form.getAttribute('id') === 'client-form') {
      const id = f.get('id'); const payload = {name:String(f.get('name')).trim(),phone:String(f.get('phone')).trim(),note:String(f.get('note')).trim()}; if (!payload.name) return;
      if (id) Object.assign(data.clients.find(c=>c.id===id), payload, {active:f.get('active')==='true'});
      else { const c={id:uid(),...payload,active:true}; data.clients.push(c); clientId=c.id; view='client'; }
      close(); save(); toast(id ? 'Плательщик обновлён.' : 'Плательщик добавлен. Теперь добавьте счёт.');
    }
    if (form.getAttribute('id') === 'item-form') {
      const id=f.get('id'), amount=Number(f.get('amount'));
      if (!Number.isSafeInteger(amount) || amount <= 0) { toast('Введите целую сумму больше нуля.'); return; }
      const payload={title:String(f.get('title')).trim(),contract:String(f.get('contract')).trim(),amount}; if (!payload.title) return;
      if (id) Object.assign(data.items.find(i=>i.id===id),payload,{active:f.get('active')==='true'});
      else data.items.push({id:uid(),clientId:String(f.get('clientId')),...payload,active:true});
      close(); save(); toast('Ежемесячный счёт сохранён.');
    }
    if (form.getAttribute('id') === 'payment-form') {
      const invoiceId=String(f.get('invoiceId')), inv=data.invoices.find(i=>i.id===invoiceId), amount=Number(f.get('amount')), date=String(f.get('date'));
      if (!inv || !Number.isSafeInteger(amount) || amount <= 0 || amount > invoiceDue(inv) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Проверьте сумму и дату оплаты.'); return; }
      data.payments.push({id:uid(),invoiceId,amount,date,note:String(f.get('note')).trim()}); save(); invoiceModal(invoiceId); toast('Оплата записана.');
    }
    if (form.getAttribute('id') === 'due-form') {
      const day=Number(f.get('dueDay')); if (!Number.isInteger(day)||day<1||day>28) return;
      data.dueDay=day; save(); toast('Срок для новых начислений сохранён.');
    }
  });
  render();
})();
