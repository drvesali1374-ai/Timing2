/* ═══════════════════════════════════════════════════════════
   excel-template.js — قالب Excel برگهٔ زمان‌سنجی — v1.5.2 §۹
   پورت وفادار از src/infrastructure/excel-sheet-template.ts
   نسخهٔ وب (ساختار، استایل، پیام‌ها و اعتبارسنجی یکسان):

   • دانلود قالب xlsx متناسب با پروژه/فعالیت/جلسهٔ جاری
     (شیت راست‌به‌چپ + راهنما + شیت مخفی Metadata با شناسه‌های پایدار)
   • بارگذاری فایل تکمیل‌شده → خروجی فقط «ورودی همان مسیر
     پیش‌نمایش/Commit موجود Paste» است؛ هیچ ذخیرهٔ مستقیمی انجام
     نمی‌شود (§۹-۶).
   • کتابخانهٔ exceljs به‌صورت محلی همراه برنامه بسته‌بندی شده
     (offline/vendor/exceljs.min.js) و فقط هنگام نیاز بارگذاری
     می‌شود — هیچ فایلی در زمان اجرا از اینترنت دریافت نمی‌شود (§۹-۸).
   ═══════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var DB = g.T2DB;
  g.T2EXCEL = g.T2EXCEL || {};

  function extend(base, extra) {
    var out = {};
    for (var k in base) out[k] = base[k];
    for (var k2 in extra) out[k2] = extra[k2];
    return out;
  }

  function extend(base, extra) {
    var out = {};
    for (var k in base) out[k] = base[k];
    for (var k2 in extra) out[k2] = extra[k2];
    return out;
  }

  var TEMPLATE_VERSION = 1;
  var EXTRA_CYCLE_COLS = 10;
  var SHEET_DATA = 'برگه زمان‌سنجی';
  var SHEET_README = 'راهنما';
  var SHEET_META = 'Metadata';
  var DATA_START_ROW = 8;
  var HEADER_ROW = 7;

  var HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9E5FF' } };
  var LABEL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F0EF' } };
  var EDIT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5EE' } };
  var THIN_BORDER = {
    top: { style: 'thin', color: { argb: 'FFD6D3D1' } },
    left: { style: 'thin', color: { argb: 'FFD6D3D1' } },
    bottom: { style: 'thin', color: { argb: 'FFD6D3D1' } },
    right: { style: 'thin', color: { argb: 'FFD6D3D1' } },
  };

  function round6(v) { return Math.round(v * 1e6) / 1e6; }

  /* بارگذاری تنبل exceljs محلی — بدون هیچ تماس اینترنتی */
  var exceljsPromise = null;
  function loadExcelJS() {
    if (g.ExcelJS) return Promise.resolve(g.ExcelJS);
    if (exceljsPromise) return exceljsPromise;
    exceljsPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = './offline/vendor/exceljs.min.js';
      s.onload = function () {
        if (g.ExcelJS) resolve(g.ExcelJS);
        else reject(new Error('کتابخانهٔ Excel بارگذاری نشد.'));
      };
      s.onerror = function () {
        exceljsPromise = null;
        reject(new Error('بارگذاری کتابخانهٔ Excel ناموفق بود — فایل offline/vendor/exceljs.min.js باید در کنار برنامه باشد.'));
      };
      document.head.appendChild(s);
    });
    return exceljsPromise;
  }

  /* مقدار متنی فعلی یک سلول قالب — فرمت پذیرفته‌شدهٔ Paste */
  function cellTextFor(grow, cycle, method) {
    if (!cycle) return '';
    if (grow.kind === 'RELATION') {
      var ov = (cycle.overlaps || {})[grow.relationId];
      if (!ov) return '';
      if (ov.status === 'NO_OVERLAP') return '0';
      if (ov.status === 'OVERLAP' && ov.overlapDuration != null) return String(round6(ov.overlapDuration));
      return '';
    }
    var obs = null;
    for (var i = 0; i < cycle.observations.length; i++) {
      if (cycle.observations[i].workElementId === grow.elementId) { obs = cycle.observations[i]; break; }
    }
    if (!obs) return '';
    if (obs.startOffset != null && obs.endOffset != null) return round6(obs.startOffset) + '-' + round6(obs.endOffset);
    if (obs.startOffset != null || obs.endOffset != null) return '';
    if (method === 'CONTINUOUS') return obs.cumulativeReading != null ? String(round6(obs.cumulativeReading)) : '';
    return obs.rawDuration != null ? String(round6(obs.rawDuration)) : '';
  }

  /* ═══════════════ ساخت قالب — §۹-۲/۹-۳/۹-۵ ═══════════════ */

  function buildWorkbook(sessionId) {
    var sheet = DB.getSheet(sessionId);
    if (sheet.session.status !== 'OPEN') {
      throw new Error('این جلسه بسته است؛ برای دریافت قالب، جلسه را بازگشایی کنید یا جلسهٔ جدید بسازید.');
    }
    var project = DB.getProject(sheet.activity.projectId) || {};
    var gridRows = DB.sheetGridRows(sheet);
    if (!gridRows.length || gridRows[0].kind !== 'ELEMENT') {
      throw new Error('این فعالیت عنصر کاری ندارد؛ قالب Excel فقط برای فعالیتِ دارای عنصر ساخته می‌شود.');
    }

    var method = sheet.session.timingMethod;
    var methodLabel = (DB.CONST.TIMING_METHOD_LABELS || {})[method] || method;
    var maxCycleNo = sheet.cycles.length ? Math.max.apply(null, sheet.cycles.map(function (c) { return c.cycleNo; })) : 0;
    var totalCols = maxCycleNo + EXTRA_CYCLE_COLS;
    var cycleByNo = {};
    sheet.cycles.forEach(function (c) { cycleByNo[c.cycleNo] = c; });

    var wb = new g.ExcelJS.Workbook();
    wb.creator = 'Timing2';
    wb.created = new Date();

    var ws = wb.addWorksheet(SHEET_DATA, {
      views: [{ rightToLeft: true, state: 'frozen', xSplit: 1, ySplit: HEADER_ROW }],
    });

    var infoLines = [
      ['قالب زمان‌سنجی — پروژهٔ «' + (project.name || '؟') + '»', { bold: true, size: 14, color: { argb: 'FF5B21B6' } }],
      ['خط تولید: ' + (project.lineName || '؟') + '    |    محصول: ' + (project.productName || '؟'), {}],
      ['ایستگاه: ' + sheet.activity.stationName + '    |    فعالیت: ' + sheet.activity.name, { bold: true }],
      ['اپراتور: ' + sheet.operator.displayName + '    |    روش: ' + methodLabel + '    |    شروع جلسه: ' + String(sheet.session.startedAt).slice(0, 10) + '    |    وضعیت: ' + (sheet.session.status === 'CLOSED' ? 'بسته' : 'باز'), {}],
    ];
    infoLines.forEach(function (it, i) {
      var row = ws.getRow(i + 1);
      var cell = row.getCell(1);
      cell.value = it[0];
      cell.font = extend({ size: 11 }, it[1]);
      cell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' };
      row.height = i === 0 ? 22 : 18;
    });

    var headerRow = ws.getRow(HEADER_ROW);
    headerRow.getCell(1).value = 'عنصر کاری / رابطهٔ موازی';
    for (var c = 1; c <= totalCols; c++) headerRow.getCell(c + 1).value = 'چرخهٔ ' + c;
    headerRow.eachCell(function (cell) {
      cell.font = { bold: true, size: 11, color: { argb: 'FF1E1B4B' } };
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl', wrapText: true };
      cell.border = THIN_BORDER;
    });
    headerRow.height = 24;

    gridRows.forEach(function (grow, ri) {
      var row = ws.getRow(DATA_START_ROW + ri);
      var labelCell = row.getCell(1);
      if (grow.kind === 'ELEMENT') {
        labelCell.value = grow.elementName;
        labelCell.font = { bold: true, size: 11 };
        labelCell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' };
      } else {
        labelCell.value = '↲ هم‌پوشانی با ' + grow.otherElementName;
        labelCell.font = { size: 10, color: { argb: 'FF71717A' } };
        labelCell.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl', indent: 2 };
      }
      labelCell.fill = LABEL_FILL;
      labelCell.border = THIN_BORDER;

      for (var cc = 1; cc <= totalCols; cc++) {
        var cell = row.getCell(cc + 1);
        cell.numFmt = '@';
        cell.fill = EDIT_FILL;
        cell.border = THIN_BORDER;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { size: 11 };
        var text = cellTextFor(grow, cycleByNo[cc], method);
        if (text !== '') cell.value = text;
      }
    });

    ws.getColumn(1).width = 36;
    for (var cw = 2; cw <= totalCols + 1; cw++) ws.getColumn(cw).width = 11;

    /* شیت راهنما — §۹-۵ */
    var readme = wb.addWorksheet(SHEET_README, { views: [{ rightToLeft: true }] });
    readme.getColumn(1).width = 100;
    var readmeLines = [
      ['راهنمای قالب زمان‌سنجی', { bold: true, size: 14 }],
      ['', {}],
      ['۱. این قالب مخصوص «همین جلسهٔ زمان‌سنجی» است (شناسهٔ جلسه در شیت مخفی Metadata). برای جلسهٔ دیگری، قالب جدید دانلود کنید.', {}],
      ['۲. فقط سلول‌های سبز روشن را تکمیل کنید (ستون‌های چرخه). نام عناصر، ستون اول و سربرگ‌ها را تغییر ندهید و سطری را جابه‌جا یا حذف نکنید.', {}],
      ['۳. مقدار هر عنصر: یک عدد (مثل 12.5 یا ۱۲٫۵) یا برای عناصر هم‌زمان بازهٔ «شروع-پایان» (مثل 3-9).', {}],
      ['۴. زیرردیف «هم‌پوشانی با …»: خالی = بررسی‌نشده، ۰ = بدون هم‌پوشانی، عدد مثبت = مدت هم‌پوشانی (ثانیه).', {}],
      ['۵. ستون‌های خالی انتهایی برای چرخه‌های جدیدند؛ در صورت نیاز می‌توانید در سمت چپ ستون‌های بیشتری اضافه کنید (عنوان ستون جدید را هم «چرخهٔ N» بگذارید).', {}],
      ['۶. سلول خالی به معنی «بدون تغییر» است — دادهٔ موجود حذف نمی‌شود.', {}],
      ['', {}],
      ['برگرداندن داده‌ها به برنامه — دو راه مستقل:', { bold: true }],
      ['الف) ذخیرهٔ فایل و بارگذاری: در برنامه، در دیالوگ Paste از Excel روی «بارگذاری فایل Excel» بزنید و همین فایل تکمیل‌شده را انتخاب کنید؛ پس از مشاهدهٔ پیش‌نمایش و رفع خطاها، ثبت نهایی انجام می‌شود.', {}],
      ['ب) کپی و Paste: محدودهٔ داده‌های تکمیل‌شده را در Excel انتخاب و کپی (Ctrl+C) کنید و در برنامه در دیالوگ Paste بچسبانید (Ctrl+V).', {}],
      ['', {}],
      ['هیچ داده‌ای بدون پیش‌نمایش و تأیید شما ثبت نمی‌شود؛ خطای هر سلول با محل و علت دقیق نمایش داده می‌شود.', { italic: true }],
    ];
    readmeLines.forEach(function (it, i) {
      var cell = readme.getRow(i + 1).getCell(1);
      cell.value = it[0];
      cell.font = extend({ size: 11 }, it[1]);
      cell.alignment = { horizontal: 'right', vertical: 'top', readingOrder: 'rtl', wrapText: true };
    });

    /* شیت Metadata (مخفی) — نگاشت شناسهٔ پایدار — §۹-۴ */
    var meta = wb.addWorksheet(SHEET_META, { views: [{ rightToLeft: false }] });
    meta.state = 'hidden';
    meta.getCell('A1').value = 'T2_TIMING_TEMPLATE';
    meta.getCell('B1').value = TEMPLATE_VERSION;
    meta.getCell('A2').value = 'SESSION_ID';
    meta.getCell('B2').value = sessionId;
    meta.getCell('A3').value = 'START_CYCLE_NO';
    meta.getCell('B3').value = 1;
    meta.getCell('A4').value = 'DATA_START_ROW';
    meta.getCell('B4').value = DATA_START_ROW;
    meta.getCell('A5').value = 'LABEL_COL';
    meta.getCell('B5').value = 1;
    meta.getCell('A6').value = 'TOTAL_COLS';
    meta.getCell('B6').value = totalCols;
    var metaHead = meta.getRow(8);
    ['ROW_INDEX', 'KIND', 'ELEMENT_ID', 'RELATION_ID', 'PARENT_ELEMENT_ID'].forEach(function (h, i) {
      metaHead.getCell(i + 1).value = h;
    });
    gridRows.forEach(function (grow, ri) {
      var r = meta.getRow(9 + ri);
      r.getCell(1).value = ri;
      r.getCell(2).value = grow.kind;
      /* ستون ۳ = عنصر «صاحب» ردیف: برای عنصر خودش، برای زیرردیف والدش —
         همان قرارداد sheetGridRows برای اعتبارسنجی ساختار (§۹-۴) */
      r.getCell(3).value = grow.elementId;
      r.getCell(4).value = grow.kind === 'RELATION' ? grow.relationId : null;
      r.getCell(5).value = grow.kind === 'RELATION' ? grow.elementId : null;
    });
    meta.getColumn(1).width = 12;
    meta.getColumn(2).width = 10;
    meta.getColumn(3).width = 40;
    meta.getColumn(4).width = 40;
    meta.getColumn(5).width = 40;

    return {
      workbook: wb,
      filename: 'قالب زمان‌سنجی — ' + sheet.activity.name + ' (' + sheet.operator.displayName + ').xlsx',
    };
  }

  /** دانلود قالب جلسه — دکمهٔ «قالب Excel» هدر واحد */
  function downloadTemplate(sessionId) {
    /* ابتدا کتابخانهٔ محلی بارگذاری می‌شود، سپس ساخت قالب */
    loadExcelJS()
      .then(function () {
        var built = buildWorkbook(sessionId);
        return built.workbook.xlsx.writeBuffer().then(function (buf) {
          var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = built.filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
          g.T2UI.toast('قالب Excel دانلود شد', {
            desc: 'پس از تکمیل، فایل را در دیالوگ «Paste از Excel» بارگذاری کنید یا محدودهٔ داده‌ها را کپی و Paste کنید.',
          });
        });
      })
      .catch(function (err) { g.T2UI.toastError(err); });
  }

  /* ═══════════════ تجزیهٔ فایل بارگذاری‌شده — §۹-۶/۹-۷ ═══════════════ */

  /** تبدیل مقدار سلول به متن Paste — خطا با محل دقیق */
  function cellText(value, gridRows, rowIdx, colIdx, startCycleNo, cellErrors) {
    if (value == null) return '';
    var grow = gridRows[rowIdx];
    var where = 'ردیف ' + (rowIdx + 1) + ' (' + (grow.kind === 'ELEMENT' ? grow.elementName : 'هم‌پوشانی ' + grow.elementName + '↔' + grow.otherElementName) + ')، چرخهٔ ' + (startCycleNo + colIdx);
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') {
      if (!isFinite(value)) { cellErrors.push(where + ': عدد نامعتبر است.'); return ''; }
      return String(round6(value));
    }
    if (typeof value === 'boolean') { cellErrors.push(where + ': مقدار منطقی مجاز نیست.'); return ''; }
    if (value instanceof Date) {
      cellErrors.push(where + ': مقدار به تاریخ تبدیل شده است. قالب سلول باید «متن» باشد؛ مقدار را به‌صورت متن (مثل 3-9) وارد کنید.');
      return '';
    }
    if (typeof value === 'object') {
      if (value.richText && value.richText.map) return value.richText.map(function (rt) { return String(rt.text); }).join('').trim();
      if ('result' in value && value.result != null) return cellText(value.result, gridRows, rowIdx, colIdx, startCycleNo, cellErrors);
      if ('error' in value) { cellErrors.push(where + ': خطای فرمول Excel (' + String(value.error) + ').'); return ''; }
      if (typeof value.text === 'string') return value.text.trim();
      if (typeof value.hyperlink === 'string') return '';
    }
    cellErrors.push(where + ': نوع مقدار پشتیبانی نمی‌شود.');
    return '';
  }

  /**
   * بارگذاری فایل قالب تکمیل‌شده.
   * خروجی: { data: string[][], anchor: {cycleNo, elementId, relationId}, warnings, sourceName }
   * — فقط ورودی همان مسیر Paste؛ ذخیرهٔ مستقیم وجود ندارد (§۹-۶).
   */
  function parseTemplate(sessionId, file) {
    var sheet = DB.getSheet(sessionId);
    if (sheet.session.status !== 'OPEN') {
      return Promise.reject(new Error('این جلسه بسته است؛ برای ثبت داده، جلسه را بازگشایی کنید یا جلسهٔ جدید بسازید.'));
    }
    return loadExcelJS().then(function (ExcelJS) {
      return file.arrayBuffer();
    }).then(function (buf) {
      var wb = new g.ExcelJS.Workbook();
      return wb.xlsx.load(buf).then(function () { return wb; });
    }).then(function (wb) {
      /* ── Metadata — شناسه‌های پایدار (§۹-۴) ── */
      var meta = wb.getWorksheet(SHEET_META);
      if (!meta || meta.getCell('A1').value !== 'T2_TIMING_TEMPLATE') {
        throw new Error('این فایل قالب معتبر Timing2 نیست (شیت Metadata یافت نشد). قالب را از همین جلسه دانلود کنید.');
      }
      var version = Number(meta.getCell('B1').value);
      if (version !== TEMPLATE_VERSION) {
        throw new Error('نسخهٔ قالب (' + version + ') پشتیبانی نمی‌شود؛ قالب جدیدی دانلود کنید.');
      }
      var templateSessionId = String(meta.getCell('B2').value == null ? '' : meta.getCell('B2').value);
      if (templateSessionId !== sessionId) {
        throw new Error('این قالب متعلق به جلسهٔ دیگری است. برای این جلسه، قالب جدید دانلود کنید.');
      }
      var startCycleNo = Number(meta.getCell('B3').value) || 1;
      var dataStartRow = Number(meta.getCell('B4').value) || DATA_START_ROW;
      var labelCol = Number(meta.getCell('B5').value) || 1;

      var templateRows = [];
      for (var r = 9; ; r++) {
        var row = meta.getRow(r);
        var kind = row.getCell(2).value;
        if (kind !== 'ELEMENT' && kind !== 'RELATION') break;
        templateRows.push({
          kind: kind,
          elementId: String(row.getCell(3).value == null ? '' : row.getCell(3).value),
          relationId: row.getCell(4).value != null ? String(row.getCell(4).value) : null,
          parentElementId: row.getCell(5).value != null ? String(row.getCell(5).value) : null,
        });
      }
      if (!templateRows.length) {
        throw new Error('شناسه‌های ردیف‌ها در قالب یافت نشد؛ قالب جدیدی دانلود کنید.');
      }

      /* ── اعتبارسنجی ساختار جاری — §۹-۴ ── */
      var gridRows = DB.sheetGridRows(sheet);
      if (gridRows.length !== templateRows.length) {
        throw new Error('ساختار ردیف‌های برگه از زمان ساخت قالب تغییر کرده است (قالب ' + templateRows.length + ' ردیف دارد، برگهٔ فعلی ' + gridRows.length + ' ردیف). قالب جدیدی دانلود کنید.');
      }
      for (var i = 0; i < gridRows.length; i++) {
        var cur = gridRows[i];
        var tpl = templateRows[i];
        var match = cur.kind === tpl.kind && cur.elementId === tpl.elementId &&
          (cur.kind === 'ELEMENT' ? tpl.relationId === null : cur.relationId === tpl.relationId);
        if (!match) {
          throw new Error('ساختار ردیف‌های برگه از زمان ساخت قالب تغییر کرده است (اختلاف در ردیف ' + (i + 1) + (cur.kind === 'ELEMENT' ? ' — «' + cur.elementName + '»' : '') + '). قالب جدیدی دانلود کنید.');
        }
      }

      /* ── شیت داده ── */
      var ws = wb.getWorksheet(SHEET_DATA);
      if (!ws) {
        var visible = wb.worksheets.filter(function (w) { return w.name !== SHEET_META && w.name !== SHEET_README; });
        ws = visible[0];
      }
      if (!ws) throw new Error('شیت دادهٔ «برگه زمان‌سنجی» در فایل یافت نشد.');

      var warnings = [];
      var cellErrors = [];
      var lastCol = 0;
      for (var ri = 0; ri < templateRows.length; ri++) {
        var drow = ws.getRow(dataStartRow + ri);
        for (var c = labelCol + 1; c <= ws.columnCount; c++) {
          var v = drow.getCell(c).value;
          if (v == null) continue;
          var s = typeof v === 'object' && typeof v.text === 'string' ? v.text : String(v);
          if (String(s).trim() !== '' && c > lastCol) lastCol = c;
        }
      }
      var width = Math.max(0, lastCol - labelCol);

      var data = [];
      for (var ri2 = 0; ri2 < templateRows.length; ri2++) {
        var row2 = ws.getRow(dataStartRow + ri2);
        var cells = [];
        for (var c2 = 0; c2 < width; c2++) {
          cells.push(cellText(row2.getCell(labelCol + 1 + c2).value, gridRows, ri2, c2, startCycleNo, cellErrors));
        }
        data.push(cells);
      }

      if (cellErrors.length > 0) {
        throw new Error(cellErrors.length + ' سلول نامعتبر است:\n• ' + cellErrors.slice(0, 8).join('\n• ') + (cellErrors.length > 8 ? '\n• … و ' + (cellErrors.length - 8) + ' مورد دیگر' : ''));
      }
      if (width === 0 || data.every(function (rarr) { return rarr.every(function (v) { return v === ''; }); })) {
        throw new Error('هیچ داده‌ای در قالب تکمیل نشده است؛ پس از وارد کردن مقادیر، فایل را بارگذاری کنید.');
      }

      var firstRow = gridRows[0];
      if (firstRow.kind !== 'ELEMENT') {
        throw new Error('اولین ردیف قالب عنصر کاری نیست؛ ساختار قالب معتبر نیست.');
      }

      return {
        data: data,
        anchor: { cycleNo: startCycleNo, elementId: firstRow.elementId, relationId: null },
        warnings: warnings,
        sourceName: file.name || null,
      };
    });
  }

  g.T2EXCEL.downloadTemplate = downloadTemplate;
  g.T2EXCEL.parseTemplate = parseTemplate;
})(window);
