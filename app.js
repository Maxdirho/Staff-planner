(function () {
  'use strict';

  var MAX_EMPLOYEES = 15;
  var MAX_STORES = 5;
  var storage = window.StaffPlannerStorage;
  var data = storage.loadData();
  var editingShiftId = '';
  var editingAbsenceId = '';
  var intervals = [{ start: '', end: '' }];
  var aiImportRows = [];
  var entryMode = 'single';
  var exportBusy = false;
  var saveFlashTimer = null;

  function byId(id) { return document.getElementById(id); }
  function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function inputDate(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
  function today() { return inputDate(new Date()); }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function euro(cents) { return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100); }
  function commit() {
    if (storage.saveData(data)) {
      var status = byId('saveStatus');
      status.textContent = 'Salvato automaticamente · ' + new Date().toLocaleTimeString('it-IT');
      status.style.color = '#126b63';
      status.classList.remove('save-flash');
      window.clearTimeout(saveFlashTimer);
      window.requestAnimationFrame(function () { status.classList.add('save-flash'); });
      saveFlashTimer = window.setTimeout(function () { status.classList.remove('save-flash'); }, 1400);
      return true;
    }
    byId('saveStatus').textContent = 'C’è qualcosa da sistemare: il browser non sta salvando';
    byId('saveStatus').style.color = '#a83a34';
    return false;
  }
  function employeeName(employeeId) { var x = data.employees.find(function (e) { return e.id === employeeId; }); return x ? x.name : '—'; }
  function storeName(storeId) { var x = data.stores.find(function (s) { return s.id === storeId; }); return x ? x.name : '—'; }
  function active(items) { return items.filter(function (x) { return x.active !== false; }).slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'it'); }); }
  function onlyActiveStoreId() {
    var stores = active(data.stores);
    return stores.length === 1 ? stores[0].id : '';
  }

  function minutes(start, end) {
    var a = start.split(':').map(Number), b = end.split(':').map(Number);
    var result = b[0] * 60 + b[1] - (a[0] * 60 + a[1]);
    return result <= 0 ? result + 1440 : result;
  }
  function timeToMinutes(value) { var parts = value.split(':').map(Number); return parts[0] * 60 + parts[1]; }
  function intervalRange(interval) {
    var start = timeToMinutes(interval.start), end = timeToMinutes(interval.end);
    if (end <= start) end += 1440;
    return { start: start, end: end };
  }
  function intervalsOverlap(a, b) {
    var x = intervalRange(a), y = intervalRange(b);
    return x.start < y.end && y.start < x.end;
  }
  function shiftMinutes(shift) { return shift.intervals.reduce(function (sum, x) { return sum + minutes(x.start, x.end); }, 0); }
  function decimalHours(mins) { return Math.round(mins / 60 * 100) / 100; }
  function formatDate(value) { return new Intl.DateTimeFormat('it-IT').format(new Date(value + 'T12:00:00')); }
  function timeOptions(selected) {
    var html = '<option value="">Scegli…</option>';
    for (var m = 0; m < 1440; m += 5) {
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

  function validateShiftValues(employeeId, storeId, date, shiftIntervals, options) {
    options = options || {};
    if (!employeeId) return 'Seleziona il dipendente.';
    if (!storeId) return 'Seleziona il negozio.';
    if (!date) return 'Seleziona la data.';
    if (!shiftIntervals.length || shiftIntervals.some(function (x) { return !x.start || !x.end; })) return 'Seleziona entrata e uscita per ogni intervallo.';
    if (shiftIntervals.some(function (x) { return x.start === x.end; })) return 'Entrata e uscita devono essere diverse.';
    for (var i = 0; i < shiftIntervals.length; i++) {
      for (var j = i + 1; j < shiftIntervals.length; j++) {
        if (intervalsOverlap(shiftIntervals[i], shiftIntervals[j])) return 'Gli intervalli non possono sovrapporsi.';
      }
    }
    var replacingMonth = options.replaceEmployeeId === employeeId && options.replaceMonth && date.indexOf(options.replaceMonth) === 0;
    var absenceConflict = data.absences.find(function (x) { return x.employeeId === employeeId && x.date === date && x.id !== options.excludeAbsenceId && !(replacingMonth && x.date.indexOf(options.replaceMonth) === 0); });
    if (absenceConflict) return 'Esiste già un’assenza per questo dipendente in questa data.';
    var shiftConflict = data.shifts.find(function (shift) {
      return shift.employeeId === employeeId && shift.date === date && shift.id !== options.excludeShiftId && !(replacingMonth && shift.date.indexOf(options.replaceMonth) === 0) && shift.intervals.some(function (existing) {
        return shiftIntervals.some(function (current) { return intervalsOverlap(existing, current); });
      });
    });
    if (shiftConflict) return shiftConflict.storeId !== storeId ? 'Esiste già un turno nello stesso orario in un altro negozio.' : 'Esiste già un turno nello stesso orario.';
    return '';
  }

  function resetShift() {
    editingShiftId = '';
    byId('shiftEmployee').value = '';
    byId('shiftStore').value = onlyActiveStoreId();
    byId('shiftDate').value = today();
    byId('shiftNote').value = '';
    intervals = [{ start: '', end: '' }];
    clearError('shiftError'); renderIntervals();
  }
  function saveShift() {
    clearError('shiftError'); syncIntervals();
    var employeeId = byId('shiftEmployee').value, storeId = byId('shiftStore').value, date = byId('shiftDate').value;
    var validationError = validateShiftValues(employeeId, storeId, date, intervals, { excludeShiftId: editingShiftId });
    if (validationError) return showError('shiftError', validationError);
    var record = { id: editingShiftId || id(), employeeId: employeeId, storeId: storeId, date: date, intervals: intervals.map(function (x) { return { start: x.start, end: x.end }; }), note: byId('shiftNote').value.trim() };
    var index = data.shifts.findIndex(function (x) { return x.id === record.id; });
    if (index < 0) data.shifts.push(record); else data.shifts[index] = record;
    if (!commit()) return showError('shiftError', 'Il turno non è stato salvato. Controlla le impostazioni del browser.');
    var total = shiftMinutes(record);
    byId('receipt').innerHTML = '<h3>✓ Turno messo al sicuro</h3><p><strong>' + escapeHtml(employeeName(record.employeeId)) + '</strong> · ' + formatDate(record.date) + ' · ' + escapeHtml(storeName(record.storeId)) + '</p><p>' + record.intervals.map(function (x) { return x.start + '–' + x.end; }).join(' / ') + ' · <strong>' + decimalHours(total).toLocaleString('it-IT', { minimumFractionDigits: 2 }) + ' ore</strong></p>';
    byId('receipt').classList.remove('hidden');
    resetShift(); renderSummary();
  }

  function showAbsence(show) { byId('shiftPanel').classList.toggle('hidden', show); byId('absencePanel').classList.toggle('hidden', !show); byId('showAbsence').classList.toggle('hidden', show); }
  function resetAbsence() { editingAbsenceId = ''; byId('absenceEmployee').value = ''; byId('absenceDate').value = today(); byId('absenceNote').value = ''; clearError('absenceError'); }
  function saveAbsence() {
    clearError('absenceError'); var employeeId = byId('absenceEmployee').value, date = byId('absenceDate').value;
    if (!employeeId) return showError('absenceError', 'Seleziona il dipendente.');
    if (!date) return showError('absenceError', 'Seleziona la data.');
    if (data.shifts.some(function (x) { return x.employeeId === employeeId && x.date === date; })) return showError('absenceError', 'Esiste già un turno per questo dipendente in questa data.');
    var record = { id: editingAbsenceId || id(), employeeId: employeeId, date: date, type: byId('absenceType').value, note: byId('absenceNote').value.trim() };
    var index = data.absences.findIndex(function (x) { return x.id === record.id; }); if (index < 0) data.absences.push(record); else data.absences[index] = record;
    if (!commit()) return showError('absenceError', 'L’assenza non è stata salvata.');
    byId('receipt').innerHTML = '<h3>✓ Assenza segnata</h3><p><strong>' + escapeHtml(employeeName(record.employeeId)) + '</strong> · ' + formatDate(record.date) + ' · ' + escapeHtml(record.type) + '</p>';
    byId('receipt').classList.remove('hidden'); resetAbsence(); showAbsence(false); renderSummary();
  }

  function monthValue() { return today().slice(0, 7); }
  function monthLabel(value) {
    return new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(new Date(value + '-01T12:00:00'));
  }
  function fillQuickMonthSelect(current) {
    var selected = current || byId('quickMonth').value || monthValue(), now = new Date(), years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1], values = [];
    years.forEach(function (year) {
      for (var month = 1; month <= 12; month++) values.push(year + '-' + pad(month));
    });
    if (values.indexOf(selected) < 0) values.push(selected);
    values.sort();
    byId('quickMonth').innerHTML = values.map(function (value) {
      return '<option value="' + value + '"' + (value === selected ? ' selected' : '') + '>' + escapeHtml(monthLabel(value)) + '</option>';
    }).join('');
  }
  function monthDays(month) {
    if (!month) return [];
    var parts = month.split('-').map(Number), year = parts[0], monthIndex = parts[1] - 1, last = new Date(year, monthIndex + 1, 0).getDate(), days = [];
    for (var day = 1; day <= last; day++) days.push(inputDate(new Date(year, monthIndex, day)));
    return days;
  }
  function weekdayName(date) { return new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(new Date(date + 'T12:00:00')); }
  function absenceOptions(selected) {
    return [
      ['', '—'],
      ['Assenza', 'Assenza'],
      ['Ferie', 'Ferie'],
      ['Malattia', 'Malattia'],
      ['Riposo', 'Riposo']
    ].map(function (item) {
      return '<option value="' + item[0] + '"' + (item[0] === selected ? ' selected' : '') + '>' + item[1] + '</option>';
    }).join('');
  }
  function storeOptions(selected) {
    return '<option value="">Scegli…</option>' + active(data.stores).map(function (store) {
      return '<option value="' + store.id + '"' + (store.id === selected ? ' selected' : '') + '>' + escapeHtml(store.name) + '</option>';
    }).join('');
  }
  function setEntryMode(mode) {
    entryMode = mode;
    var isMonth = mode === 'month';
    byId('shiftPanel').classList.toggle('hidden', isMonth || !(active(data.employees).length && active(data.stores).length));
    byId('quickMonthPanel').classList.toggle('hidden', !isMonth || !(active(data.employees).length && active(data.stores).length));
    byId('absencePanel').classList.add('hidden');
    byId('showAbsence').classList.toggle('hidden', isMonth || !(active(data.employees).length && active(data.stores).length));
    document.querySelectorAll('#entryModeTabs button').forEach(function (button) { button.classList.toggle('active', button.dataset.entryMode === mode); });
    if (isMonth) renderQuickMonth();
  }
  function ensureQuickDefaults() {
    if (!byId('quickMonth').value) byId('quickMonth').value = monthValue();
    if (!byId('quickEmployee').value) {
      var first = active(data.employees)[0];
      if (first) byId('quickEmployee').value = first.id;
    }
  }
  function renderQuickMonth() {
    ensureQuickDefaults();
    clearError('quickMonthError'); byId('quickMonthMessage').classList.add('hidden');
    var employeeId = byId('quickEmployee').value, month = byId('quickMonth').value;
    if (!employeeId || !month) {
      byId('quickMonthRows').innerHTML = '<tr><td colspan="11">Seleziona dipendente e mese.</td></tr>';
      return;
    }
    byId('quickMonthRows').innerHTML = monthDays(month).map(function (date) {
      var shifts = data.shifts.filter(function (x) { return x.employeeId === employeeId && x.date === date; });
      var absence = data.absences.find(function (x) { return x.employeeId === employeeId && x.date === date; });
      var savedTurns = [];
      shifts.forEach(function (shift) {
        shift.intervals.forEach(function (interval) {
          savedTurns.push({ storeId: shift.storeId, start: interval.start, end: interval.end, note: shift.note || '' });
        });
      });
      var overflow = savedTurns.length > 2;
      var firstTurn = savedTurns[0] || {}, secondTurn = savedTurns[1] || {};
      var warning = overflow ? 'Più di due turni già salvati: usa Turno singolo.' : '';
      var dateLabel = weekdayName(date) + ' ' + date.slice(8, 10);
      return '<tr data-date="' + date + '"' + (overflow ? ' data-overflow="true"' : '') + '>' +
        '<td><strong>' + escapeHtml(dateLabel) + '</strong><span>' + formatDate(date) + '</span></td>' +
        '<td><select class="quick-store-1">' + storeOptions(firstTurn.storeId || '') + '</select></td>' +
        '<td><input class="quick-start-1" type="time" step="900" value="' + escapeHtml(firstTurn.start || '') + '"></td>' +
        '<td><input class="quick-end-1" type="time" step="900" value="' + escapeHtml(firstTurn.end || '') + '"></td>' +
        '<td><input class="quick-note-1" maxlength="120" value="' + escapeHtml(absence ? absence.note || '' : firstTurn.note || '') + '"></td>' +
        '<td><select class="quick-store-2">' + storeOptions(secondTurn.storeId || '') + '</select></td>' +
        '<td><input class="quick-start-2" type="time" step="900" value="' + escapeHtml(secondTurn.start || '') + '"></td>' +
        '<td><input class="quick-end-2" type="time" step="900" value="' + escapeHtml(secondTurn.end || '') + '"></td>' +
        '<td><input class="quick-note-2" maxlength="120" value="' + escapeHtml(secondTurn.note || '') + '"></td>' +
        '<td><select class="quick-absence">' + absenceOptions(absence ? absence.type : '') + '</select></td>' +
        '<td class="quick-state">' + (warning ? '<span class="quick-warning">' + warning + '</span>' : '—') + '</td>' +
      '</tr>';
    }).join('');
    updateQuickMonthTotals();
  }
  function updateQuickMonthTotals() {
    var totalMinutes = 0, totalShifts = 0, totalAbsences = 0;
    Array.from(document.querySelectorAll('#quickMonthRows tr[data-date]')).forEach(function (row) {
      if (row.querySelector('.quick-absence').value) totalAbsences++;
      [
        { start: row.querySelector('.quick-start-1').value, end: row.querySelector('.quick-end-1').value },
        { start: row.querySelector('.quick-start-2').value, end: row.querySelector('.quick-end-2').value }
      ].forEach(function (interval) {
        if (interval.start && interval.end && interval.start !== interval.end) {
          totalMinutes += minutes(interval.start, interval.end);
          totalShifts++;
        }
      });
    });
    byId('quickTotalHours').textContent = decimalHours(totalMinutes).toLocaleString('it-IT', { minimumFractionDigits: 2 });
    byId('quickTotalShifts').textContent = totalShifts;
    byId('quickTotalAbsences').textContent = totalAbsences;
  }
  function autoSelectQuickStore(event) {
    if (!event.target.matches('.quick-start-1, .quick-end-1, .quick-start-2, .quick-end-2')) return;
    var storeId = onlyActiveStoreId();
    if (!storeId) return;
    var row = event.target.closest('tr[data-date]');
    if (!row) return;
    var slot = event.target.classList.contains('quick-start-2') || event.target.classList.contains('quick-end-2') ? '2' : '1';
    var store = row.querySelector('.quick-store-' + slot);
    if (store && !store.value && event.target.value) store.value = storeId;
  }
  function collectQuickMonth() {
    var employeeId = byId('quickEmployee').value, month = byId('quickMonth').value;
    var shifts = [], absences = [], errors = [];
    Array.from(document.querySelectorAll('#quickMonthRows tr[data-date]')).forEach(function (row) {
      var date = row.dataset.date, absenceType = row.querySelector('.quick-absence').value;
      var turns = [
        { storeId: row.querySelector('.quick-store-1').value, start: row.querySelector('.quick-start-1').value, end: row.querySelector('.quick-end-1').value, note: row.querySelector('.quick-note-1').value.trim() },
        { storeId: row.querySelector('.quick-store-2').value, start: row.querySelector('.quick-start-2').value, end: row.querySelector('.quick-end-2').value, note: row.querySelector('.quick-note-2').value.trim() }
      ];
      var usedTurns = turns.filter(function (turn) { return turn.storeId || turn.start || turn.end; });
      row.classList.remove('quick-row-error');
      if (row.dataset.overflow === 'true') errors.push({ row: row, message: 'Più di due turni già salvati: il mese non può essere sovrascritto.' });
      else {
        row.querySelector('.quick-state').textContent = '—';
        if (absenceType && usedTurns.length) errors.push({ row: row, message: 'Turno e assenza nello stesso giorno.' });
        else if (absenceType) absences.push({ id: id(), employeeId: employeeId, date: date, type: absenceType, note: turns[0].note });
        else {
          var incomplete = usedTurns.some(function (turn) { return !turn.storeId || !turn.start || !turn.end; });
          if (incomplete) errors.push({ row: row, message: 'Completa negozio, entrata e uscita.' });
          else if (usedTurns.length === 2 && intervalsOverlap(usedTurns[0], usedTurns[1])) errors.push({ row: row, message: 'I due turni non possono sovrapporsi.' });
          else usedTurns.forEach(function (turn) {
            var interval = { start: turn.start, end: turn.end };
            var validationError = validateShiftValues(employeeId, turn.storeId, date, [interval], { replaceEmployeeId: employeeId, replaceMonth: month });
            if (validationError) errors.push({ row: row, message: validationError });
            else shifts.push({ id: id(), employeeId: employeeId, storeId: turn.storeId, date: date, intervals: [interval], note: turn.note });
          });
        }
      }
    });
    return { employeeId: employeeId, month: month, shifts: shifts, absences: absences, errors: errors };
  }
  function saveQuickMonth() {
    clearError('quickMonthError'); byId('quickMonthMessage').classList.add('hidden');
    var collected = collectQuickMonth();
    if (!collected.employeeId) return showError('quickMonthError', 'Seleziona il dipendente.');
    if (!collected.month) return showError('quickMonthError', 'Seleziona il mese.');
    if (collected.errors.length) {
      collected.errors.forEach(function (error) {
        error.row.classList.add('quick-row-error');
        error.row.querySelector('.quick-state').innerHTML = '<span class="quick-warning">' + escapeHtml(error.message) + '</span>';
      });
      return showError('quickMonthError', 'Correggi le righe evidenziate prima di salvare.');
    }
    data.shifts = data.shifts.filter(function (x) { return !(x.employeeId === collected.employeeId && x.date.indexOf(collected.month) === 0); }).concat(collected.shifts);
    data.absences = data.absences.filter(function (x) { return !(x.employeeId === collected.employeeId && x.date.indexOf(collected.month) === 0); }).concat(collected.absences);
    if (!commit()) return showError('quickMonthError', 'Il mese non è stato salvato. Controlla le impostazioni del browser.');
    renderSummary(); renderQuickMonth();
    byId('quickMonthMessage').innerHTML = '<h3>✓ Mese salvato, lavoro sotto controllo</h3><p><strong>' + escapeHtml(employeeName(collected.employeeId)) + '</strong> · ' + collected.month + ' · ' + collected.shifts.length + ' turni · ' + collected.absences.length + ' assenze/riposi</p>';
    byId('quickMonthMessage').classList.remove('hidden');
  }
  function changeQuickEmployee(step) {
    var employees = active(data.employees), current = byId('quickEmployee').value, index = employees.findIndex(function (x) { return x.id === current; });
    if (!employees.length) return;
    if (index < 0) index = 0;
    byId('quickEmployee').value = employees[(index + step + employees.length) % employees.length].id;
    renderQuickMonth();
  }

  function moveQuickFieldToNextDay(event) {
    if (event.key !== 'Enter' || !event.target.matches('input[type="time"]')) return;
    var row = event.target.closest('tr[data-date]');
    if (!row || !row.nextElementSibling) return;
    var fieldClass = Array.from(event.target.classList).find(function (name) { return name.indexOf('quick-') === 0; });
    if (!fieldClass) return;
    var nextField = row.nextElementSibling.querySelector('.' + fieldClass);
    if (!nextField) return;
    event.preventDefault();
    nextField.focus();
  }

  function importTime(value) {
    var clean = String(value || '').trim();
    if (clean === '24:00') return '00:00';
    return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clean) ? clean : '';
  }

  function findNamed(items, name) {
    var target = String(name || '').trim().toLocaleLowerCase('it');
    return items.find(function (item) { return item.name.toLocaleLowerCase('it') === target; });
  }

  function statusOptions(current) {
    return ['ok', 'dubbio', 'errore'].map(function (value) {
      return '<option value="' + value + '"' + (value === current ? ' selected' : '') + '>' + value + '</option>';
    }).join('');
  }

  function renderAiImportRows() {
    byId('aiImportRows').innerHTML = aiImportRows.map(function (row, index) {
      return '<tr data-index="' + index + '" class="import-row status-' + row.status + '">' +
        '<td><input class="import-date" type="date" value="' + escapeHtml(row.date) + '"></td>' +
        '<td><input class="import-employee" value="' + escapeHtml(row.employee) + '" placeholder="Dipendente"></td>' +
        '<td><input class="import-store" value="' + escapeHtml(row.store) + '" placeholder="Negozio"></td>' +
        '<td><input class="import-start time-field" value="' + escapeHtml(row.start) + '" placeholder="HH:MM"></td>' +
        '<td><input class="import-end time-field" value="' + escapeHtml(row.end) + '" placeholder="HH:MM"></td>' +
        '<td><input class="import-note" value="' + escapeHtml(row.note) + '" placeholder="Facoltative"></td>' +
        '<td><select class="import-status">' + statusOptions(row.status) + '</select>' + (row.validationError ? '<small class="row-error">' + escapeHtml(row.validationError) + '</small>' : '') + '</td>' +
      '</tr>';
    }).join('');
    byId('aiImportCount').textContent = aiImportRows.length + (aiImportRows.length === 1 ? ' riga' : ' righe');
  }

  function syncAiImportRows() {
    aiImportRows = Array.from(document.querySelectorAll('#aiImportRows tr')).map(function (row) {
      return {
        date: row.querySelector('.import-date').value,
        employee: row.querySelector('.import-employee').value.trim(),
        store: row.querySelector('.import-store').value.trim(),
        start: row.querySelector('.import-start').value.trim(),
        end: row.querySelector('.import-end').value.trim(),
        note: row.querySelector('.import-note').value.trim(),
        status: row.querySelector('.import-status').value,
        validationError: ''
      };
    });
  }

  function loadAiImportPreview(file) {
    var store = active(data.stores)[0];
    var storeNameValue = store ? store.name : 'Negozio principale';
    aiImportRows = [
      { date: '2026-07-02', employee: 'Beppe', store: storeNameValue, start: '17:00', end: '24:00', note: '', status: 'ok', validationError: '' },
      { date: '2026-07-02', employee: 'Valqui', store: storeNameValue, start: '18:00', end: '24:00', note: 'Orario da verificare', status: 'dubbio', validationError: '' },
      { date: '2026-07-02', employee: 'Palma', store: storeNameValue, start: '18:30', end: '24:00', note: 'Riga incompleta', status: 'errore', validationError: '' }
    ];
    byId('aiImportFileName').textContent = file.name;
    byId('aiImportFileInfo').classList.remove('hidden');
    byId('aiImportPreview').classList.remove('hidden');
    byId('aiImportMessage').classList.add('hidden');
    byId('confirmAiImport').disabled = false;
    renderAiImportRows();
  }

  function resetAiImport() {
    aiImportRows = [];
    byId('aiImportFile').value = '';
    byId('aiImportRows').innerHTML = '';
    byId('aiImportFileInfo').classList.add('hidden');
    byId('aiImportPreview').classList.add('hidden');
    byId('aiImportMessage').classList.add('hidden');
    byId('confirmAiImport').disabled = false;
  }

  function confirmAiImport() {
    syncAiImportRows();
    var imported = 0, excluded = 0;
    aiImportRows.forEach(function (row) {
      if (row.status === 'errore') { excluded++; return; }
      var employee = findNamed(data.employees, row.employee), store = findNamed(data.stores, row.store);
      var start = importTime(row.start), end = importTime(row.end);
      var validationError = validateShiftValues(employee && employee.id, store && store.id, row.date, [{ start: start, end: end }]);
      if (!employee) validationError = 'Dipendente non presente in Gestione.';
      else if (!store) validationError = 'Negozio non presente in Gestione.';
      else if (!start || !end) validationError = 'Orario non valido. Usa HH:MM.';
      if (validationError) {
        row.status = 'errore'; row.validationError = validationError; excluded++; return;
      }
      data.shifts.push({ id: id(), employeeId: employee.id, storeId: store.id, date: row.date, intervals: [{ start: start, end: end }], note: row.note });
      imported++;
    });
    if (imported && !commit()) {
      byId('aiImportMessage').textContent = 'C’è qualcosa da sistemare: il browser non sta salvando.';
      byId('aiImportMessage').className = 'import-message error';
      return;
    }
    renderAiImportRows(); renderAll(); renderSummary();
    byId('aiImportMessage').textContent = imported ? imported + (imported === 1 ? ' turno importato' : ' turni importati') + (excluded ? ' · ' + excluded + (excluded === 1 ? ' riga esclusa' : ' righe escluse') : '') + '.' : 'Nessun turno importato. Correggi le righe in errore e riprova.';
    byId('aiImportMessage').className = 'import-message ' + (imported ? 'success' : 'error');
    byId('confirmAiImport').disabled = imported > 0;
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
  function empty(cols) { return '<tr><td colspan="' + cols + '">Iniziamo? Non ci sono ancora dati in questo periodo.</td></tr>'; }

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
    var current = { shiftEmployee: byId('shiftEmployee').value, shiftStore: byId('shiftStore').value, absenceEmployee: byId('absenceEmployee').value, quickEmployee: byId('quickEmployee').value, quickMonth: byId('quickMonth').value, summaryEmployee: byId('summaryEmployee').value, tipsStore: byId('tipsStore').value };
    fillSelect(byId('shiftEmployee'), data.employees, 'Scegli…', current.shiftEmployee, false); fillSelect(byId('absenceEmployee'), data.employees, 'Scegli…', current.absenceEmployee, false); fillSelect(byId('quickEmployee'), data.employees, 'Scegli…', current.quickEmployee, false); fillSelect(byId('summaryEmployee'), data.employees, 'Tutti', current.summaryEmployee, true);
    fillQuickMonthSelect(current.quickMonth);
    fillSelect(byId('shiftStore'), data.stores, 'Scegli…', current.shiftStore || onlyActiveStoreId(), false); fillSelect(byId('tipsStore'), data.stores, 'Scegli…', current.tipsStore, true);
    renderEntities(); renderExportEmployees(); renderSummary(); var ready = active(data.employees).length && active(data.stores).length; byId('entrySetup').classList.toggle('hidden', !!ready); byId('entryModeTabs').classList.toggle('hidden', !ready); setEntryMode(entryMode);
  }
  function renderExportEmployees() { byId('exportEmployees').innerHTML = data.employees.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'it'); }).map(function (x) { return '<label class="check"><input type="checkbox" class="export-employee" value="' + x.id + '"> ' + escapeHtml(x.name) + '</label>'; }).join(''); }

  function backup() { storage.downloadBackup(data, 'backup-ore-' + today() + '.json'); }
  function restore(file) { storage.restoreBackup(file, function (parsed) { if (!confirm('Sostituire tutti i dati attuali?')) return; data = parsed; commit(); renderAll(); resetShift(); }, function () { alert('Backup non valido.'); }); }
  function slug(value) {
    return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'dipendente';
  }
  function exportEmployeeSlug(ids) {
    if (!ids) return 'tutti-dipendenti';
    if (ids.length > 4) return 'selezionati-' + ids.length + '-dipendenti';
    return ids.map(function (employeeId) { return slug(employeeName(employeeId)); }).join('-');
  }
  function exportExcel() {
    if (exportBusy) return;
    var ids = byId('exportAll').checked ? null : Array.from(document.querySelectorAll('.export-employee:checked')).map(function (x) { return x.value; });
    if (ids && !ids.length) return alert('Seleziona almeno un dipendente.');
    var button = byId('downloadExcel'), status = byId('exportStatus'), original = button.textContent, from = byId('fromDate').value, to = byId('toDate').value;
    exportBusy = true;
    button.disabled = true;
    button.classList.add('is-loading');
    button.textContent = 'Esporto…';
    status.textContent = '';
    status.classList.add('hidden');
    var fileName = 'riepilogo-ore-' + exportEmployeeSlug(ids) + '-' + from + '_' + to + '.xlsx';
    var ok = window.XlsxExporter.download(data, from, to, ids, employeeName, storeName, fileName);
    if (ok !== false) {
      status.textContent = 'Excel esportato';
      status.classList.remove('hidden');
    }
    window.setTimeout(function () {
      exportBusy = false;
      button.disabled = false;
      button.classList.remove('is-loading');
      button.textContent = original;
    }, 1400);
  }

  function openPage(name) { document.querySelectorAll('.page').forEach(function (x) { x.classList.toggle('active', x.id === 'page-' + name); }); document.querySelectorAll('nav button').forEach(function (x) { x.classList.toggle('active', x.dataset.page === name); }); if (name === 'summary') renderSummary(); }
  function bind() {
    document.querySelectorAll('nav button').forEach(function (x) { x.addEventListener('click', function () { openPage(x.dataset.page); }); });
    byId('entryModeTabs').addEventListener('click', function (e) { var button = e.target.closest('button[data-entry-mode]'); if (button) setEntryMode(button.dataset.entryMode); });
    byId('addInterval').addEventListener('click', function () { syncIntervals(); intervals.push({ start: '', end: '' }); renderIntervals(); });
    byId('intervalList').addEventListener('change', updateDuration); byId('intervalList').addEventListener('click', function (e) { if (!e.target.classList.contains('remove')) return; syncIntervals(); intervals.splice(Number(e.target.closest('.interval-row').dataset.index), 1); renderIntervals(); });
    byId('saveShift').addEventListener('click', saveShift); byId('clearShift').addEventListener('click', resetShift); byId('showAbsence').addEventListener('click', function () { showAbsence(true); }); byId('cancelAbsence').addEventListener('click', function () { showAbsence(false); }); byId('saveAbsence').addEventListener('click', saveAbsence);
    byId('quickEmployee').addEventListener('change', renderQuickMonth); byId('quickMonth').addEventListener('change', renderQuickMonth); byId('clearQuickMonth').addEventListener('click', renderQuickMonth); byId('saveQuickMonth').addEventListener('click', saveQuickMonth); byId('quickPrevEmployee').addEventListener('click', function () { changeQuickEmployee(-1); }); byId('quickNextEmployee').addEventListener('click', function () { changeQuickEmployee(1); });
    byId('quickMonthRows').addEventListener('input', function (event) { autoSelectQuickStore(event); updateQuickMonthTotals(); }); byId('quickMonthRows').addEventListener('change', function (event) { autoSelectQuickStore(event); updateQuickMonthTotals(); }); byId('quickMonthRows').addEventListener('keydown', moveQuickFieldToNextDay);
    byId('aiImportFile').addEventListener('change', function () { if (this.files[0]) loadAiImportPreview(this.files[0]); }); byId('cancelAiImport').addEventListener('click', resetAiImport); byId('confirmAiImport').addEventListener('click', confirmAiImport);
    byId('addEmployee').addEventListener('click', function () { addEntity('employee'); }); byId('addStore').addEventListener('click', function () { addEntity('store'); });
    byId('page-manage').addEventListener('click', function (e) { var button = e.target.closest('button[data-kind]'); if (!button) return; var list = button.dataset.kind === 'employee' ? data.employees : data.stores, item = list.find(function (x) { return x.id === button.dataset.id; }); if (button.classList.contains('rename-entity')) { var name = prompt('Nuovo nome:', item.name); if (name && name.trim()) item.name = name.trim(); } else item.active = item.active === false; commit(); renderAll(); });
    byId('period').addEventListener('change', function () { periodDates(); renderSummary(); }); byId('summaryEmployee').addEventListener('change', renderSummary); byId('fromDate').addEventListener('change', renderSummary); byId('toDate').addEventListener('change', renderSummary);
    byId('shiftRows').addEventListener('click', function (e) { var idValue = e.target.dataset.id; if (!idValue) return; if (e.target.classList.contains('delete-shift')) { if (confirm('Eliminare il turno?')) { data.shifts = data.shifts.filter(function (x) { return x.id !== idValue; }); commit(); renderSummary(); } } else { var x = data.shifts.find(function (s) { return s.id === idValue; }); editingShiftId = x.id; fillSelect(byId('shiftEmployee'), data.employees, 'Scegli…', x.employeeId, true); fillSelect(byId('shiftStore'), data.stores, 'Scegli…', x.storeId, true); byId('shiftDate').value = x.date; byId('shiftNote').value = x.note || ''; intervals = x.intervals.map(function (i) { return { start: i.start, end: i.end }; }); renderIntervals(); setEntryMode('single'); openPage('entry'); } });
    byId('absenceRows').addEventListener('click', function (e) { if (!e.target.classList.contains('delete-absence')) return; if (confirm('Eliminare l’assenza?')) { data.absences = data.absences.filter(function (x) { return x.id !== e.target.dataset.id; }); commit(); renderSummary(); } });
    byId('calculateTips').addEventListener('click', calculateTips); byId('downloadExcel').addEventListener('click', exportExcel); byId('saveBackup').addEventListener('click', backup); byId('restoreBackup').addEventListener('change', function () { if (this.files[0]) restore(this.files[0]); this.value = ''; });
    byId('exportAll').addEventListener('change', function () { document.querySelectorAll('.export-employee').forEach(function (x) { x.disabled = byId('exportAll').checked; }); });
  }

  function init() {
    byId('shiftDate').value = byId('absenceDate').value = today(); byId('tipsMonth').value = today().slice(0, 7); periodDates(); bind(); renderIntervals(); renderAll();
    byId('systemStatus').textContent = 'Tutto pronto · ' + data.shifts.length + ' turni salvati';
  }

  window.__oreTest = { getData: function () { return JSON.parse(JSON.stringify(data)); }, saveShift: saveShift, saveAbsence: saveAbsence, saveQuickMonth: saveQuickMonth, renderQuickMonth: renderQuickMonth, setEntryMode: setEntryMode, confirmAiImport: confirmAiImport, allocateTips: allocateTips };
  init();
})();
