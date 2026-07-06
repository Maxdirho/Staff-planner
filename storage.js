(function (global) {
  'use strict';

  var STORAGE_KEY = 'ore-dipendenti-clean-v1';
  var DATA_KEYS = ['employees', 'stores', 'shifts', 'absences'];

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

  function loadData() {
    try {
      var saved = global.localStorage.getItem(STORAGE_KEY);
      return saved === null ? defaultData() : normalizeData(JSON.parse(saved));
    } catch (error) {
      return defaultData();
    }
  }

  function saveData(data) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeData(data)));
      return true;
    } catch (error) {
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
    loadData: loadData,
    saveData: saveData,
    downloadBackup: downloadBackup,
    restoreBackup: restoreBackup
  };
})(window);
