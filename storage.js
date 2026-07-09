(function (global) {
  'use strict';

  var STORAGE_KEY = 'ore-dipendenti-clean-v1';
  var DATA_KEYS = ['employees', 'stores', 'shifts', 'absences'];
  var SQLITE_STATE_KEY = 'main';

  function defaultData() {
    return { employees: [], stores: [], shifts: [], absences: [] };
  }

  function normalizeData(value) {
    var clean = value && typeof value === 'object' && !Array.isArray(value) ? value : defaultData();
    DATA_KEYS.forEach(function (key) {
      if (!Array.isArray(clean[key])) clean[key] = [];
    });
    return clean;
  }

  function isValidData(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && DATA_KEYS.every(function (key) {
      return Array.isArray(value[key]);
    });
  }

  function tauriInvoke() {
    return global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function'
      ? global.__TAURI__.core.invoke
      : null;
  }

  function readLocalData() {
    try {
      var saved = global.localStorage.getItem(STORAGE_KEY);
      if (saved === null) return { exists: false, data: defaultData() };
      var parsed = JSON.parse(saved);
      return { exists: true, data: isValidData(parsed) ? normalizeData(parsed) : defaultData() };
    } catch (error) {
      return { exists: false, data: defaultData() };
    }
  }

  function saveLocalData(data) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeData(data)));
      return true;
    } catch (error) {
      return false;
    }
  }

  function hasContent(data) {
    data = normalizeData(data);
    return DATA_KEYS.some(function (key) { return data[key].length > 0; });
  }

  async function loadData() {
    var local = readLocalData();
    var invoke = tauriInvoke();
    if (!invoke) return local.data;

    try {
      var sqliteValue = await invoke('load_data', { key: SQLITE_STATE_KEY });
      if (sqliteValue) {
        var sqliteData = JSON.parse(sqliteValue);
        if (!isValidData(sqliteData)) throw new Error('Struttura SQLite non valida');
        sqliteData = normalizeData(sqliteData);
        saveLocalData(sqliteData);
        return sqliteData;
      }
      if (local.exists && hasContent(local.data)) {
        await invoke('save_data', { key: SQLITE_STATE_KEY, value: JSON.stringify(normalizeData(local.data)) });
        return local.data;
      }
      return defaultData();
    } catch (error) {
      console.error('Impossibile leggere i dati SQLite, uso localStorage come fallback.', error);
      return local.data;
    }
  }

  async function saveData(data) {
    data = normalizeData(data);
    saveLocalData(data);
    var invoke = tauriInvoke();
    if (!invoke) return true;

    try {
      await invoke('save_data', { key: SQLITE_STATE_KEY, value: JSON.stringify(data) });
      return true;
    } catch (error) {
      console.error('Impossibile salvare i dati in SQLite.', error);
      return false;
    }
  }

  function downloadBackup(data, fileName) {
    var blob = new Blob([JSON.stringify(normalizeData(data), null, 2)], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  function restoreBackup(file, onSuccess, onError) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!isValidData(parsed)) throw new Error('Struttura dati non valida');
        onSuccess(normalizeData(parsed));
      } catch (error) {
        onError(error);
      }
    };
    reader.onerror = function () { onError(reader.error || new Error('Impossibile leggere il backup')); };
    reader.readAsText(file);
  }

  global.StaffPlannerStorage = {
    STORAGE_KEY: STORAGE_KEY,
    defaultData: defaultData,
    normalizeData: normalizeData,
    isValidData: isValidData,
    isTauri: function () { return !!tauriInvoke(); },
    loadData: loadData,
    saveData: saveData,
    downloadBackup: downloadBackup,
    restoreBackup: restoreBackup
  };
})(window);
