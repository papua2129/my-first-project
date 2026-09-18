function dataBook() {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!id) throw new Error('スプレッドシートが未設定です。先に setupApp を実行してください。');
  return SpreadsheetApp.openById(id);
}

function table(name) {
  const sheet = dataBook().getSheetByName(name);
  if (!sheet) throw new Error('スプレッドシートの ' + name + ' シートがありません。');
  return sheet;
}

function rows(name) {
  const sheet = table(name);
  if (sheet.getLastRow() < 2) return [];
  const headers = TABLES[name];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map((values, index) => {
    const row = { _row: index + 2 };
    headers.forEach((header, i) => { row[header] = values[i]; });
    return row;
  });
}

function appendRow(name, value) {
  table(name).appendRow(TABLES[name].map(key => value[key] === undefined ? '' : value[key]));
}

function writeRow(name, rowNumber, value) {
  table(name).getRange(rowNumber, 1, 1, TABLES[name].length)
    .setValues([TABLES[name].map(key => value[key] === undefined ? '' : value[key])]);
}

function settings() {
  const result = Object.assign({}, DEFAULTS);
  rows('Settings').forEach(row => {
    if (Object.prototype.hasOwnProperty.call(result, row.key)) {
      result[row.key] = row.value === '' ? DEFAULTS[row.key] : row.value;
    }
  });
  return result;
}

function saveSettings(input) {
  try {
    const sheet = table('Settings');
    const current = settings();
    const next = Object.assign({}, current);
    Object.keys(DEFAULTS).forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(input, key)) return;
      const value = input[key];
      if (typeof DEFAULTS[key] === 'number') {
        if (value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('設定値が正しくありません: ' + key);
        if (/^(HP_|BONUS_)/.test(key) && !Number.isInteger(Number(value))) throw new Error('設定値が正しくありません: ' + key);
        next[key] = Number(value);
      } else if (typeof DEFAULTS[key] === 'boolean') {
        next[key] = value === true || value === 'true';
      } else {
        next[key] = String(value || '').trim();
      }
    });
    if (next.DRIVE_FOLDER_ID) {
      try { DriveApp.getFolderById(next.DRIVE_FOLDER_ID).getName(); }
      catch (error) { throw new Error('DriveフォルダIDを確認してください。'); }
    }
    const existing = rows('Settings');
    Object.keys(DEFAULTS).forEach(key => {
      const value = { key, value: next[key] };
      const found = existing.find(row => row.key === key);
      if (found) writeRow('Settings', found._row, value);
      else appendRow('Settings', value);
    });
    return next;
  } catch (error) { publicError(error); }
}

function setupApp(folderId) {
  try {
    const props = PropertiesService.getScriptProperties();
    let id = props.getProperty(SPREADSHEET_PROPERTY);
    let book;
    if (id) book = SpreadsheetApp.openById(id);
    else {
      book = SpreadsheetApp.create('スクモン討伐アプリ データ');
      props.setProperty(SPREADSHEET_PROPERTY, book.getId());
    }
    Object.keys(TABLES).forEach(name => {
      let sheet = book.getSheetByName(name);
      if (!sheet) sheet = book.insertSheet(name);
      sheet.getRange(1, 1, 1, TABLES[name].length).setValues([TABLES[name]]);
      sheet.setFrozenRows(1);
    });
    const blank = book.getSheetByName('Sheet1') || book.getSheetByName('シート1');
    if (blank && book.getSheets().length > 1 && blank.getLastRow() === 0) book.deleteSheet(blank);
    if (rows('Settings').length === 0) saveSettings(DEFAULTS);
    if (folderId) saveSettings({ DRIVE_FOLDER_ID: folderId });
    let formUrl = props.getProperty('SUKUMON_FORM_URL');
    if (!formUrl) {
      const form = FormApp.create('スクモン 今日のふり返り');
      const choices = Array.from({ length: 21 }, (_, i) => String(i * 5));
      form.addMultipleChoiceItem().setTitle(SCORE_QUESTION).setChoiceValues(choices).setRequired(true);
      form.setDestination(FormApp.DestinationType.SPREADSHEET, book.getId());
      formUrl = form.getPublishedUrl();
      props.setProperty('SUKUMON_FORM_URL', formUrl);
      props.setProperty('SUKUMON_FORM_ID', form.getId());
    }
    if (settings().DRIVE_FOLDER_ID) syncMonsters();
    return { spreadsheetUrl: book.getUrl(), formUrl, monsterCount: rows('Monsters').length };
  } catch (error) { publicError(error); }
}

function responseSheet(config) {
  const book = dataBook();
  if (config.RESPONSE_SHEET_NAME) {
    const selected = book.getSheetByName(config.RESPONSE_SHEET_NAME);
    if (!selected) throw new Error('回答シート名を確認してください。');
    return selected;
  }
  const matches = book.getSheets().filter(sheet => {
    if (Object.prototype.hasOwnProperty.call(TABLES, sheet.getName()) || sheet.getLastColumn() < 2) return false;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    return headers.some(header => header === SCORE_QUESTION);
  });
  if (matches.length !== 1) throw new Error('回答シートを確認してください。設定画面でシート名を指定できます。');
  return matches[0];
}

function columnIndex(spec, headers, candidates) {
  if (spec) {
    if (/^[A-Za-z]+$/.test(String(spec))) {
      return String(spec).toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    }
    return headers.indexOf(String(spec));
  }
  return headers.findIndex(header => candidates.some(candidate => candidate === header));
}

function scoresForDate(day, config) {
  const sheet = responseSheet(config);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(String);
  const scoreCol = columnIndex(config.SCORE_COLUMN, headers, [SCORE_QUESTION]);
  const timeCol = columnIndex(config.TIMESTAMP_COLUMN, headers, ['タイムスタンプ', 'Timestamp']);
  if (scoreCol < 0 || timeCol < 0 || scoreCol >= headers.length || timeCol >= headers.length) {
    throw new Error('回答の日時列または点数列を確認してください。');
  }
  return data.slice(1).filter(row => dateKey(row[timeCol]) === day).map(row => Number(row[scoreCol]))
    .filter(score => Number.isFinite(score) && score >= 0 && score <= 100 && score % 5 === 0);
}
