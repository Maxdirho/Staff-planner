(function () {
  'use strict';

  var STORAGE_KEY = 'ore-dipendenti-clean-v1';
  var MAX_EMPLOYEES = 15;
  var MAX_STORES = 5;
  var data = loadData();
  var editingShiftId = '';
  var editingAbsenceId = '';
  var intervals = [{ start: '', end: '' }];

  function byId(id) { return document.getElementById(id); }
  function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function inputDate(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
  function today() { return inputDate(new Date()); }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function euro(cents) { return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100); }
  function defaultData() { return { employees: [], stores: [], shifts: [], absences: [] }; }
  function normalize(value) {
    var clean = value && typeof value === 'object' ? value : defaultData();
    ['employees', 'stores', 'shifts', 'absences'].forEach(function (key) { if (!Array.isArray(clean[key])) clean[key] = []; });
    return clean;
  }
  function loadData() { try { return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch (e) { return defaultData(); } }
  function commit() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      byId('saveStatus').textContent = 'Dati salvati alle ' + new Date().toLocaleTimeString('it-IT');
      byId('saveStatus').style.color = '#126b63';
      return true;
    } catch (e) {
      byId('saveStatus').textContent = 'Errore: il browser non consente il salvataggio';
      byId('saveStatus').style.color = '#a83a34';
      return false;
    }
  }
  function employeeName(employeeId) { var x = data.employees.find(function (e) { return e.id === employeeId; }); return x ? x.name : '—'; }
  function storeName(storeId) { var x = data.stores.find(function (s) { return s.id === storeId; }); return x ? x.name : '—'; }
  function active(items) { return items.filter(function (x) { return x.active !== false; }).slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'it'); }); }

  function minutes(start, end) {
    var a = start.split(':').map(Number), b = end.split(':').map(Number);
    var result = b[0] * 60 + b[1] - (a[0] * 60 + a[1]);
    return result <= 0 ? result + 1440 : result;
  }
  function shiftMinutes(shift) { return shift.intervals.reduce(function (sum, x) { return sum + minutes(x.start, x.end); }, 0); }
  function decimalHours(mins) { return Math.round(mins / 60 * 100) / 100; }
  function formatDate(value) { return new Intl.DateTimeFormat('it-IT').format(new Date(value + 'T12:00:00')); }
  function timeOptions(selected) {
    var html = '<option value="">Scegli…</option>';
    for (var m = 0; m < 1440; m += 15) {
      var value = pad(Math.floor(m / 60)) + ':' + pad(m % 60);
      html += '<option value="' + value + '"' + (value === selected ? ' selected' : '') + '>' + value + '</option>';
    }
    return html;
  }

  function fillSelect(element, items, placeholder, current, includeInactive) {
    var source = includeInactive ? items.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'it'); }) : active(items);
    element.innerHTML = '<option value="">' + placeholder + '</option>' + source.map(function (x) {
      return '<option value="' + x.id + '"' + (x.id === current ? ' selected' : '') + '>' + escapeHtml(x.name) + (x.active === false ? ' (non attivo)' : '') + '</option>';
    }).join('');
  }

  function renderIntervals() {
    byId('intervalList').innerHTML = intervals.map(function (x, index) {
      return '<div class="interval-row" data-index="' + index + '"><label>Entrata<select class="start">' + timeOptions(x.start) + '</select></label><label>Uscita<select class="end">' + timeOptions(x.end) + '</select></label>' + (intervals.length > 1 ? '<button type="button" class="secondary remove">Rimuovi</button>' : '') + '</div>';
    }).join('');
    updateDuration();
  }
  function syncIntervals() {
    intervals = Array.from(document.querySelectorAll('#intervalList .interval-row')).map(function (row) { return { start: row.querySelector('.start').value, end: row.querySelector('.end').value }; });
  }
  function updateDuration() {
    syncIntervals();
    var complete = intervals.filter(function (x) { return x.start && x.end; });
    if (!complete.length) { byId('duration').textContent = 'Durata: —'; return; }
    var total = complete.reduce(function (sum, x) { return sum + minutes(x.start, x.end); }, 0);
    byId('duration').textContent = 'Durata: ' + Math.floor(total / 60) + ' h ' + pad(total % 60) + ' min · ' + complete.length + (complete.length === 1 ? ' turno' : ' turni');
  }
  function showError(id, text) { var box = byId(id); box.textContent = text; box.classList.remove('hidden'); }
  function clearError(id) { byId(id).classList.add('hidden'); }

  function resetShift() {
    editingShiftId = '';
    byId('shiftEmployee').value = '';
    byId('shiftStore').value = '';
    byId('shiftDate').value = today();
    byId('shiftNote').value = '';
    intervals = [{ start: '', end: '' }];
    clearError('shiftError'); renderIntervals();
  }
  function saveShift() {
    clearError('shiftError'); syncIntervals();
    var employeeId = byId('shiftEmployee').value, storeId = byId('shiftStore').value, date = byId('shiftDate').value;
    if (!employeeId) return showError('shiftError', 'Seleziona il dipendente.');
    if (!storeId) return showError('shiftError', 'Seleziona il negozio.');
    if (!date) return showError('shiftError', 'Seleziona la data.');
    if (intervals.some(function (x) { return !x.start || !x.end; })) return showError('shiftError', 'Seleziona entrata e uscita per ogni intervallo.');
    var record = { id: editingShiftId || id(), employeeId: employeeId, storeId: storeId, date: date, intervals: intervals.map(function (x) { return { start: x.start, end: x.end }; }), note: byId('shiftNote').value.trim() };
    var index = data.shifts.findIndex(function (x) { return x.id === record.id; });
    if (index < 0) data.shifts.push(record); else data.shifts[index] = record;
    if (!commit()) return showError('shiftError', 'Il turno non è stato salvato. Controlla le impostazioni del browser.');
    var total = shiftMinutes(record);
    byId('receipt').innerHTML = '<h3>✓ Turno salvato</h3><p><strong>' + escapeHtml(employeeName(record.employeeId)) + '</strong> · ' + formatDate(record.date) + ' · ' + escapeHtml(storeName(record.storeId)) + '</p><p>' + record.intervals.map(function (x) { return x.start + '–' + x.end; }).join(' / ') + ' · <strong>' + decimalHours(total).toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' ore</strong></p>';
    byId('receipt').classList.remove('hidden');
    resetShift(); renderSummary();
  }

  function showAbsence(show) { byId('shiftPanel').classList.toggle('hidden', show); byId('absencePanel').classList.toggle('hidden', !show); byId('showAbsence').classList.toggle('hidden', show); }
  function resetAbsence() { editingAbsenceId = ''; byId('absenceEmployee').value = ''; byId('absenceDate').value = today(); byId('absenceNote').value = ''; clearError('absenceError'); }
  function saveAbsence() {
    clearError('absenceError'); var employeeId = byId('absenceEmployee').value, date = byId('absenceDate').value;
    if (!employeeId) return showError('absenceError', 'Seleziona il dipendente.');
    if (!date) return showError('absenceError', 'Seleziona la data.');
    var record = { id: editingAbsenceId || id(), employeeId: employeeId, date: date, type: byId('absenceType').value, note: byId('absenceNote').value.trim() };
    var index = data.absences.findIndex(function (x) { return x.id === record.id; }); if (index < 0) data.absences.push(record); else data.absences[index] = record;
    if (!commit()) return showError('absenceError', 'L’assenza non è stata salvata.');
    byId('receipt').innerHTML = '<h3>✓ Assenza salvata</h3><p><strong>' + escapeHtml(employeeName(record.employeeId)) + '</strong> · ' + formatDate(record.date) + ' · ' + escapeHtml(record.type) + '</p>';
    byId('receipt').classList.remove('hidden'); resetAbsence(); showAbsence(false); renderSummary();
  }

  function addEntity(kind) {
    var isEmployee = kind === 'employee', input = byId(isEmployee ? 'employeeName' : 'storeName'), list = isEmployee ? data.employees : data.stores, limit = isEmployee ? MAX_EMPLOYEES : MAX_STORES;
    var name = input.value.trim(); if (!name) return;
    if (active(list).length >= limit) return alert('Limite massimo di elementi attivi: ' + limit);
    if (list.some(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })) return alert('Nome già presente.');
    list.push({ id: id(), name: name, active: true }); input.value = ''; commit(); renderAll();
  }
  function renderEntities() {
    byId('employeeCount').textContent = active(data.employees).length + '/' + MAX_EMPLOYEES;
    byId('storeCount').textContent = active(data.stores).length + '/' + MAX_STORES;
    byId('employeeList').innerHTML = entityRows(data.employees, 'employee'); byId('storeList').innerHTML = entityRows(data.stores, 'store');
  }
  function entityRows(items, kind) {
    return items.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'it'); }).map(function (x) {
      return '<div class="item' + (x.active === false ? ' inactive' : '') + '"><span>' + escapeHtml(x.name) + '</span><div><button type="button" class="secondary rename-entity" data-kind="' + kind + '" data-id="' + x.id + '">Rinomina</button> <button type="button" class="secondary toggle-entity" data-kind="' + kind + '" data-id="' + x.id + '">' + (x.active === false ? 'Riattiva' : 'Disattiva') + '</button></div></div>';
    }).join('') || '<p>Nessun elemento.</p>';
  }

  function periodDates() {
    var now = new Date(), value = byId('period').value, from, to;
    if (value === 'week') { var offset = (now.getDay() + 6) % 7; from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset); to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6); }
    if (value === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
    if (value === 'year') { from = new Date(now.getFullYear(), 0, 1); to = new Date(now.getFullYear(), 11, 31); }
    if (value !== 'custom') { byId('fromDate').value = inputDate(from); byId('toDate').value = inputDate(to); }
    byId('fromDate').disabled = byId('toDate').disabled = value !== 'custom';
  }
  function filtered() {
    var employeeId = byId('summaryEmployee').value, from = byId('fromDate').value, to = byId('toDate').value;
    var match = function (x) { return x.date >= from && x.date <= to && (!employeeId || x.employeeId === employeeId); };
    return { shifts: data.shifts.filter(match).sort(function (a, b) { return b.date.localeCompare(a.date); }), absences: data.absences.filter(match).sort(function (a, b) { return b.date.localeCompare(a.date); }) };
  }
  function renderSummary() {
    var result = filtered(), total = result.shifts.reduce(function (sum, x) { return sum + shiftMinutes(x); }, 0), turns = result.shifts.reduce(function (sum, x) { return sum + x.intervals.length; }, 0);
    byId('stats').innerHTML = stat('Ore lavorate', decimalHours(total).toLocaleString('it-IT', { minimumFractionDigits: 2 })) + stat('Turni', turns) + stat('Dipendenti', new Set(result.shifts.map(function (x) { return x.employeeId; })).size) + stat('Assenze', result.absences.length);
    var groups = {};
    result.shifts.forEach(function (x) { var key = x.employeeId + '|' + x.storeId; if (!groups[key]) groups[key] = { employee: employeeName(x.employeeId), store: storeName(x.storeId), turns: 0, mins: 0 }; groups[key].turns += x.intervals.length; groups[key].mins += shiftMinutes(x); });
    byId('aggregateRows').innerHTML = Object.values(groups).map(function (x) { return '<tr><td><strong>' + escapeHtml(x.employee) + '</strong></td><td>' + escapeHtml(x.store) + '</td><td>' + x.turns + '</td><td>' + decimalHours(x.mins).toLocaleString('it-IT', { minimumFractionDigits: 2 }) + '</td></tr>'; }).join('') || empty(4);
    byId('shiftRows').innerHTML = result.shifts.map(function (x) { return '<tr><td>' + formatDate(x.date) + '</td><td><strong>' + escapeHtml(employeeName(x.employeeId)) + '</strong></td><td>' + escapeHtml(storeName(x.storeId)) + '</td><td>' + x.intervals.map(function (i) { return i.start + '–' + i.end; }).join('<br>') + '</td><td>' + decimalHours(shiftMinutes(x)).toLocaleString('it-IT', { minimumFractionDigits: 2 }) + '</td><td><button type="button" class="secondary edit-shift" data-id="' + x.id + '">Modifica</button> <button type="button" class="secondary delete-shift" data-id="' + x.id + '">Elimina</button></td></tr>'; }).join('') || empty(6);
    byId('absenceRows').innerHTML = result.absences.map(function (x) { return '<tr><td>' + formatDate(x.date) + '</td><td><strong>' + escapeHtml(employeeName(x.employeeId)) + '</strong></td><td>' + escapeHtml(x.type) + '</td><td>' + escapeHtml(x.note) + '</td><td><button type="button" class="secondary delete-absence" data-id="' + x.id + '">Elimina</button></td></tr>'; }).join('') || empty(5);
  }
  function stat(label, value) { return '<div class="stat"><span>' + label + '</span><strong>' + value + '</strong></div>'; }
  function empty(cols) { return '<tr><td colspan="' + cols + '">Nessun dato nel periodo.</td></tr>'; }

  function allocateTips(totalCents, rows) {
    var totalTurns = rows.reduce(function (sum, x) { return sum + x.turns; }, 0);
    var shares = rows.map(function (x) { var raw = totalCents * x.turns / totalTurns, base = Math.floor(raw); return { name: x.name, turns: x.turns, cents: base, remainder: raw - base }; });
    var left = totalCents - shares.reduce(function (sum, x) { return sum + x.cents; }, 0);
    shares.slice().sort(function (a, b) { return b.remainder - a.remainder; }).slice(0, left).forEach(function (x) { x.cents++; }); return shares;
  }
  function calculateTips() {
    byId('tipsError').classList.add('hidden'); var month = byId('tipsMonth').value, storeId = byId('tipsStore').value, total = Number(byId('tipsTotal').value);
    if (!month || !storeId || !total || total <= 0) return showError('tipsError', 'Inserisci mese, negozio e totale mance.');
    var counts = {}; data.shifts.filter(function (x) { return x.storeId === storeId && x.date.indexOf(month) === 0; }).forEach(function (x) { counts[x.employeeId] = (counts[x.employeeId] || 0) + x.intervals.length; });
    var rows = Object.keys(counts).map(function (employeeId) { return { name: employeeName(employeeId), turns: counts[employeeId] }; }), totalTurns = rows.reduce(function (sum, x) { return sum + x.turns; }, 0);
    if (!totalTurns) return showError('tipsError', 'Non risultano turni per questo negozio nel mese selezionato.');
    var shares = allocateTips(Math.round(total * 100), rows).sort(function (a, b) { return b.turns - a.turns; });
    byId('tipsResult').innerHTML = '<div class="stats">' + stat('Mance', euro(Math.round(total * 100))) + stat('Turni', totalTurns) + stat('Dipendenti', shares.length) + stat('Media per turno', euro(Math.round(total * 100 / totalTurns))) + '</div><div class="card table-card"><h3>Ripartizione</h3><div class="table-wrap"><table><thead><tr><th>Dipendente</th><th>Turni</th><th>Quota</th></tr></thead><tbody>' + shares.map(function (x) { return '<tr><td><strong>' + escapeHtml(x.name) + '</strong></td><td>' + x.turns + '</td><td class="tip-amount">' + euro(x.cents) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
  }

  function renderAll() {
    var current = { shiftEmployee: byId('shiftEmployee').value, shiftStore: byId('shiftStore').value, absenceEmployee: byId('absenceEmployee').value, summaryEmployee: byId('summaryEmployee').value, tipsStore: byId('tipsStore').value };
    fillSelect(byId('shiftEmployee'), data.employees, 'Scegli…', current.shiftEmployee, false); fillSelect(byId('absenceEmployee'), data.employees, 'Scegli…', current.absenceEmployee, false); fillSelect(byId('summaryEmployee'), data.employees, 'Tutti', current.summaryEmployee, true);
    fillSelect(byId('shiftStore'), data.stores, 'Scegli…', current.shiftStore, false); fillSelect(byId('tipsStore'), data.stores, 'Scegli…', current.tipsStore, true);
    renderEntities(); renderExportEmployees(); renderSummary(); var ready = active(data.employees).length && active(data.stores).length; byId('shiftPanel').classList.toggle('hidden', !ready); byId('entrySetup').classList.toggle('hidden', !!ready);
  }
  function renderExportEmployees() { byId('exportEmployees').innerHTML = data.employees.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'it'); }).map(function (x) { return '<label class="check"><input type="checkbox" class="export-employee" value="' + x.id + '"> ' + escapeHtml(x.name) + '</label>'; }).join(''); }

  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }
  function backup() { download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'backup-ore-' + today() + '.json'); }
  function restore(file) { var reader = new FileReader(); reader.onload = function () { try { var parsed = normalize(JSON.parse(reader.result)); if (!confirm('Sostituire tutti i dati attuali?')) return; data = parsed; commit(); renderAll(); resetShift(); } catch (e) { alert('Backup non valido.'); } }; reader.readAsText(file); }
  function exportExcel() { var ids = byId('exportAll').checked ? null : Array.from(document.querySelectorAll('.export-employee:checked')).map(function (x) { return x.value; }); if (ids && !ids.length) return alert('Seleziona almeno un dipendente.'); window.XlsxExporter.download(data, byId('fromDate').value, byId('toDate').value, ids, employeeName, storeName); }

  function openPage(name) { document.querySelectorAll('.page').forEach(function (x) { x.classList.toggle('active', x.id === 'page-' + name); }); document.querySelectorAll('nav button').forEach(function (x) { x.classList.toggle('active', x.dataset.page === name); }); if (name === 'summary') renderSummary(); }
  function bind() {
    document.querySelectorAll('nav button').forEach(function (x) { x.addEventListener('click', function () { openPage(x.dataset.page); }); });
    byId('addInterval').addEventListener('click', function () { syncIntervals(); intervals.push({ start: '', end: '' }); renderIntervals(); });
    byId('intervalList').addEventListener('change', updateDuration); byId('intervalList').addEventListener('click', function (e) { if (!e.target.classList.contains('remove')) return; syncIntervals(); intervals.splice(Number(e.target.closest('.interval-row').dataset.index), 1); renderIntervals(); });
    byId('saveShift').addEventListener('click', saveShift); byId('clearShift').addEventListener('click', resetShift); byId('showAbsence').addEventListener('click', function () { showAbsence(true); }); byId('cancelAbsence').addEventListener('click', function () { showAbsence(false); }); byId('saveAbsence').addEventListener('click', saveAbsence);
    byId('addEmployee').addEventListener('click', function () { addEntity('employee'); }); byId('addStore').addEventListener('click', function () { addEntity('store'); });
    byId('page-manage').addEventListener('click', function (e) { var button = e.target.closest('button[data-kind]'); if (!button) return; var list = button.dataset.kind === 'employee' ? data.employees : data.stores, item = list.find(function (x) { return x.id === button.dataset.id; }); if (button.classList.contains('rename-entity')) { var name = prompt('Nuovo nome:', item.name); if (name && name.trim()) item.name = name.trim(); } else item.active = item.active === false; commit(); renderAll(); });
    byId('period').addEventListener('change', function () { periodDates(); renderSummary(); }); byId('summaryEmployee').addEventListener('change', renderSummary); byId('fromDate').addEventListener('change', renderSummary); byId('toDate').addEventListener('change', renderSummary);
    byId('shiftRows').addEventListener('click', function (e) { var idValue = e.target.dataset.id; if (!idValue) return; if (e.target.classList.contains('delete-shift')) { if (confirm('Eliminare il turno?')) { data.shifts = data.shifts.filter(function (x) { return x.id !== idValue; }); commit(); renderSummary(); } } else { var x = data.shifts.find(function (s) { return s.id === idValue; }); editingShiftId = x.id; fillSelect(byId('shiftEmployee'), data.employees, 'Scegli…', x.employeeId, true); fillSelect(byId('shiftStore'), data.stores, 'Scegli…', x.storeId, true); byId('shiftDate').value = x.date; byId('shiftNote').value = x.note || ''; intervals = x.intervals.map(function (i) { return { start: i.start, end: i.end }; }); renderIntervals(); openPage('entry'); } });
    byId('absenceRows').addEventListener('click', function (e) { if (!e.target.classList.contains('delete-absence')) return; if (confirm('Eliminare l’assenza?')) { data.absences = data.absences.filter(function (x) { return x.id !== e.target.dataset.id; }); commit(); renderSummary(); } });
    byId('calculateTips').addEventListener('click', calculateTips); byId('downloadExcel').addEventListener('click', exportExcel); byId('saveBackup').addEventListener('click', backup); byId('restoreBackup').addEventListener('change', function () { if (this.files[0]) restore(this.files[0]); this.value = ''; });
    byId('exportAll').addEventListener('change', function () { document.querySelectorAll('.export-employee').forEach(function (x) { x.disabled = byId('exportAll').checked; }); });
  }

  function init() {
    byId('shiftDate').value = byId('absenceDate').value = today(); byId('tipsMonth').value = today().slice(0, 7); periodDates(); bind(); renderIntervals(); renderAll();
    byId('systemStatus').textContent = 'Sistema attivo · ' + data.shifts.length + ' turni salvati';
  }

  window.__oreTest = { getData: function () { return JSON.parse(JSON.stringify(data)); }, saveShift: saveShift, saveAbsence: saveAbsence, allocateTips: allocateTips };
  init();
})();
