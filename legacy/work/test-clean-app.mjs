import fs from 'node:fs';
import vm from 'node:vm';

class Classes {
  constructor() { this.values = new Set(); }
  add(x) { this.values.add(x); }
  remove(x) { this.values.delete(x); }
  toggle(x, force) { if (force === undefined ? !this.values.has(x) : force) this.values.add(x); else this.values.delete(x); }
  contains(x) { return this.values.has(x); }
}
class Element {
  constructor(id = '') { this.id = id; this.value = ''; this.innerHTML = ''; this.textContent = ''; this.disabled = false; this.checked = false; this.style = {}; this.dataset = {}; this.classList = new Classes(); this.files = []; }
  addEventListener() {}
  click() {}
  closest() { return null; }
}

const html = fs.readFileSync('rebuild/index.html', 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(x => x[1]);
let stored = JSON.stringify({
  employees: [{ id: 'e1', name: 'Anna', active: true }, { id: 'e2', name: 'Bruno', active: true }],
  stores: [{ id: 's1', name: 'Centro', active: true }], shifts: [], absences: []
});

function boot() {
  const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  elements.period.value = 'month'; elements.absenceType.value = 'Malattia';
  const row = new Element('row');
  row.querySelector = selector => ({ value: selector === '.start' ? '09:00' : '17:00' });
  const document = {
    getElementById: id => elements[id],
    querySelectorAll: selector => selector === '#intervalList .interval-row' ? [row] : [],
    createElement: () => new Element()
  };
  const context = {
    window: {}, document, localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } },
    console, Intl, Date, Math, JSON, Set, Array, Number, String, Object, Blob, TextEncoder, Uint8Array, Uint32Array, DataView,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, setTimeout, clearTimeout,
    alert() {}, confirm: () => true, prompt: () => null, FileReader: class {}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('rebuild/xlsx.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('rebuild/app.js', 'utf8'), context);
  return { context, elements };
}

let app = boot();
if (!app.elements.systemStatus.textContent.startsWith('Sistema attivo')) throw new Error('Avvio interfaccia fallito');
app.elements.shiftEmployee.value = 'e1'; app.elements.shiftStore.value = 's1'; app.elements.shiftDate.value = '2026-07-06';
app.context.window.__oreTest.saveShift();
app.elements.shiftEmployee.value = 'e2'; app.elements.shiftStore.value = 's1'; app.elements.shiftDate.value = '2026-07-06';
app.context.window.__oreTest.saveShift();
let saved = JSON.parse(stored);
if (saved.shifts.length !== 2) throw new Error('Non sono stati salvati due turni');
if (saved.shifts.map(x => x.employeeId).sort().join(',') !== 'e1,e2') throw new Error('Dipendenti errati');

app = boot();
const reloaded = app.context.window.__oreTest.getData();
if (reloaded.shifts.length !== 2) throw new Error('I turni non sono sopravvissuti al riavvio');
if (!app.elements.systemStatus.textContent.includes('2 turni salvati')) throw new Error('Conteggio dopo riavvio errato');
app.elements.absenceEmployee.value = 'e1'; app.elements.absenceDate.value = '2026-07-07'; app.elements.absenceType.value = 'Malattia';
app.context.window.__oreTest.saveAbsence();
if (JSON.parse(stored).absences.length !== 1) throw new Error('Assenza non salvata');
const shares = app.context.window.__oreTest.allocateTips(1000, [{ name: 'Anna', turns: 1 }, { name: 'Bruno', turns: 1 }, { name: 'Carla', turns: 1 }]);
if (shares.reduce((sum, x) => sum + x.cents, 0) !== 1000) throw new Error('Mance non quadrate');

const workbook = app.context.window.XlsxExporter._test.workbookFiles([{ name: 'Test', rows: [['Dipendente', 'Ore'], ['Anna', 8]], dateCols: [], widths: [20, 10] }]);
const bytes = app.context.window.XlsxExporter._test.zip(workbook);
fs.writeFileSync('/tmp/ore-clean-test.xlsx', Buffer.from(bytes));
console.log('OK: turni, riavvio, assenza, mance ed Excel verificati');
