(function attachProcurementXlsx(root) {
  'use strict';

  const decodeXml = (value) => String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

  const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function elements(xml, localName) {
    const tag = escapeRegExp(localName);
    const prefix = '(?:[A-Za-z_][\\w.-]*:)?';
    const regex = new RegExp(`<${prefix}${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${prefix}${tag}>`, 'g');
    return [...String(xml).matchAll(regex)].map((match) => ({ attributes: match[1], body: match[2] }));
  }

  function attribute(attributes, name) {
    const escaped = escapeRegExp(name);
    const match = new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attributes);
    return decodeXml(match?.[1] ?? match?.[2] ?? '');
  }

  function cellColumn(reference) {
    const letters = String(reference || 'A1').match(/[A-Z]+/i)?.[0] || 'A';
    let column = 0;
    for (const letter of letters.toUpperCase()) column = column * 26 + letter.charCodeAt(0) - 64;
    return Math.max(0, column - 1);
  }

  function resolveWorkbookTarget(target) {
    if (!target) return 'xl/worksheets/sheet1.xml';
    if (target.startsWith('/')) return target.slice(1);
    const parts = ['xl', ...target.split('/')];
    const normalized = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') normalized.pop();
      else normalized.push(part);
    }
    return normalized.join('/');
  }

  async function readBinaryInput(file) {
    if (file && typeof file.arrayBuffer === 'function') return file.arrayBuffer();
    if (typeof Blob !== 'undefined' && file instanceof Blob && typeof FileReader !== 'undefined') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Браузер не смог прочитать выбранный файл.'));
        reader.readAsArrayBuffer(file);
      });
    }
    return file;
  }

  async function parseXlsx(file) {
    if (!root.JSZip) throw new Error('Модуль чтения XLSX не запустился. Откройте обновлённую HTML-страницу повторно.');
    const binary = await readBinaryInput(file);
    if (!binary) throw new Error('Выбранный файл пуст или недоступен для чтения.');
    const zip = await root.JSZip.loadAsync(binary);
    const sharedStrings = [];
    const sharedFile = zip.file('xl/sharedStrings.xml');
    if (sharedFile) {
      const sharedXml = await sharedFile.async('string');
      for (const item of elements(sharedXml, 'si')) {
        sharedStrings.push(elements(item.body, 't').map((text) => decodeXml(text.body)).join(''));
      }
    }

    let sheetPath = 'xl/worksheets/sheet1.xml';
    const workbookFile = zip.file('xl/workbook.xml');
    const relationshipsFile = zip.file('xl/_rels/workbook.xml.rels');
    if (workbookFile && relationshipsFile) {
      const workbookXml = await workbookFile.async('string');
      const firstSheet = elements(workbookXml, 'sheet')[0];
      const relationshipId = firstSheet ? attribute(firstSheet.attributes, 'r:id') || attribute(firstSheet.attributes, 'id') : '';
      const relationshipsXml = await relationshipsFile.async('string');
      const relationship = elements(relationshipsXml, 'Relationship').find((item) => attribute(item.attributes, 'Id') === relationshipId);
      sheetPath = resolveWorkbookTarget(relationship ? attribute(relationship.attributes, 'Target') : '');
    }

    const sheetFile = zip.file(sheetPath) || zip.file('xl/worksheets/sheet1.xml');
    if (!sheetFile) throw new Error('В XLSX не найден первый лист с данными.');
    const sheetXml = await sheetFile.async('string');
    const matrix = [];
    for (const rowElement of elements(sheetXml, 'row')) {
      const rowNumber = Number(attribute(rowElement.attributes, 'r'));
      const rowIndex = Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber - 1 : matrix.length;
      const row = matrix[rowIndex] || [];
      for (const cell of elements(rowElement.body, 'c')) {
        const column = cellColumn(attribute(cell.attributes, 'r'));
        const type = attribute(cell.attributes, 't');
        const valueElement = elements(cell.body, 'v')[0];
        let value = valueElement ? decodeXml(valueElement.body) : '';
        if (type === 's') value = sharedStrings[Number(value)] ?? '';
        else if (type === 'inlineStr') value = elements(cell.body, 't').map((text) => decodeXml(text.body)).join('');
        else if (type === 'b') value = value === '1';
        else if (value !== '' && Number.isFinite(Number(value))) value = Number(value);
        row[column] = value;
      }
      matrix[rowIndex] = row;
    }

    const populated = matrix.filter((row) => row && row.some((cell) => String(cell ?? '').trim() !== ''));
    if (!populated.length) throw new Error('Первый лист XLSX пуст или имеет неподдерживаемую структуру.');
    return populated;
  }

  root.ProcurementXlsx = Object.freeze({ parseXlsx });
})(typeof window !== 'undefined' ? window : globalThis);
