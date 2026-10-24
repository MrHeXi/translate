import { analyzePdfTableLayout, PdfTableTextLine } from '../PdfTableLayout';

const line = (
  text: string,
  x: number,
  y: number,
  width: number,
  height = 12
): PdfTableTextLine => ({ text, x, y, width, height });

describe('analyzePdfTableLayout', () => {
  it('recognizes a regular three-column table and returns stable row-major annotations', () => {
    const lines = [
      line('Bob', 60.5, 44.5, 38),
      line('Score', 320, 20, 46),
      line('91', 320.5, 44, 18),
      line('Name', 60, 20.5, 44),
      line('Grade', 180, 20, 50),
      line('A', 180.5, 44.5, 10)
    ];

    const result = analyzePdfTableLayout(lines, 500);

    expect(result.map(cell => cell.line.text)).toEqual(['Name', 'Grade', 'Score', 'Bob', 'A', '91']);
    expect(result.map(cell => cell.lineIndex)).toEqual([3, 4, 1, 0, 5, 2]);
    expect(result.map(cell => [cell.rowIndex, cell.columnIndex])).toEqual([
      [1, 1], [1, 2], [1, 3], [2, 1], [2, 2], [2, 3]
    ]);
    expect(result.every(cell => (
      cell.tableId === 1 && cell.rowCount === 2 && cell.columnCount === 3
    ))).toBe(true);
    expect(result.find(cell => cell.line.text === 'Bob')?.line).toBe(lines[0]);
  });

  it('derives finite positive cell boxes contained by the page width', () => {
    const result = analyzePdfTableLayout([
      line('Item', 40, 30, 45, 10),
      line('Price', 220, 30, 45, 10),
      line('Book', 41, 54, 70, 12),
      line('$12', 219, 54, 28, 12),
      line('Pen', 40, 80, 32, 11),
      line('$3', 220, 80, 20, 11)
    ], 400);

    expect(result).toHaveLength(6);
    for (const cell of result) {
      expect(Number.isFinite(cell.cellX)).toBe(true);
      expect(Number.isFinite(cell.cellY)).toBe(true);
      expect(Number.isFinite(cell.cellWidth)).toBe(true);
      expect(Number.isFinite(cell.cellHeight)).toBe(true);
      expect(cell.cellX).toBeGreaterThanOrEqual(0);
      expect(cell.cellY).toBeGreaterThanOrEqual(0);
      expect(cell.cellWidth).toBeGreaterThan(0);
      expect(cell.cellHeight).toBeGreaterThan(0);
      expect(cell.cellX + cell.cellWidth).toBeLessThanOrEqual(400);
    }
    expect(result[0]).toEqual(expect.objectContaining({
      cellX: 40,
      cellY: 30,
      cellWidth: 125,
      cellHeight: 17
    }));
  });

  it('recognizes separate tables and accepts the supported eight-column maximum', () => {
    const first = [
      line('A', 20, 10, 12), line('B', 120, 10, 12),
      line('1', 20, 32, 8), line('2', 120, 32, 8),
      line('3', 20, 54, 8), line('4', 120, 54, 8)
    ];
    const second = [0, 1].flatMap(rowIndex => Array.from({ length: 8 }, (_, columnIndex) => (
      line(`R${rowIndex}C${columnIndex}`, 20 + columnIndex * 55, 120 + rowIndex * 22, 24)
    )));

    const result = analyzePdfTableLayout([...second, ...first], 480);

    expect(result).toHaveLength(22);
    expect(result.filter(cell => cell.tableId === 1)).toHaveLength(6);
    expect(result.filter(cell => cell.tableId === 2)).toHaveLength(16);
    expect(result.at(-1)).toEqual(expect.objectContaining({
      tableId: 2,
      rowIndex: 2,
      columnIndex: 8,
      columnCount: 8
    }));
  });

  it('separates tables with the same columns when a clear vertical break exists', () => {
    const first = [0, 1, 2].flatMap(rowIndex => [
      line(`A${rowIndex}`, 30, 20 + rowIndex * 22, 22),
      line(`B${rowIndex}`, 150, 20 + rowIndex * 22, 22)
    ]);
    const second = [0, 1, 2].flatMap(rowIndex => [
      line(`C${rowIndex}`, 30, 140 + rowIndex * 22, 22),
      line(`D${rowIndex}`, 150, 140 + rowIndex * 22, 22)
    ]);

    const result = analyzePdfTableLayout([...first, ...second], 300);

    expect(result.filter(cell => cell.tableId === 1)).toHaveLength(6);
    expect(result.filter(cell => cell.tableId === 2)).toHaveLength(6);
  });

  it('does not mutate the input array or line objects', () => {
    const lines = Object.freeze([
      Object.freeze(line('Key', 20, 20, 30)),
      Object.freeze(line('Value', 120, 20, 38)),
      Object.freeze(line('Mode', 20, 42, 35)),
      Object.freeze(line('Safe', 120, 42, 32)),
      Object.freeze(line('Level', 20, 64, 35)),
      Object.freeze(line('High', 120, 64, 32))
    ]);
    const snapshot = JSON.stringify(lines);

    expect(analyzePdfTableLayout(lines, 300)).toHaveLength(6);
    expect(JSON.stringify(lines)).toBe(snapshot);
  });

  it('rejects ordinary paragraphs and a single-line key-value pair', () => {
    const paragraphs = [
      line('A normal paragraph begins here.', 50, 20, 260),
      line('Its next line remains ordinary prose.', 50, 40, 275),
      line('A final line completes the thought.', 50, 60, 250),
      line('Another paragraph follows below.', 50, 92, 240)
    ];
    const keyValue = [
      line('Author', 50, 20, 48),
      line('Ada Lovelace', 180, 20, 88),
      line('unrelated prose', 50, 80, 120),
      line('more unrelated prose', 50, 100, 150)
    ];
    const splitParagraphLines = [
      line('A paragraph fragment continues', 50, 20, 145),
      line('across the same visual line.', 250, 20, 180),
      line('The following sentence also', 50, 42, 145),
      line('continues in its second fragment.', 250, 42, 180)
    ];

    expect(analyzePdfTableLayout(paragraphs, 500)).toEqual([]);
    expect(analyzePdfTableLayout(keyValue, 500)).toEqual([]);
    expect(analyzePdfTableLayout(splitParagraphLines, 500)).toEqual([]);
  });

  it('rejects an unruled two-by-two matrix and accepts right-aligned numeric columns', () => {
    const twoByTwo = [
      line('Name', 30, 20, 40), line('Value', 160, 20, 40),
      line('Alpha', 30, 42, 42), line('10', 180, 42, 20)
    ];
    const rightAligned = [
      line('Item', 30, 20, 40), line('9', 211, 20, 9),
      line('Alpha', 30, 42, 42), line('120', 193, 42, 27),
      line('Beta', 30, 64, 36), line('45', 202, 64, 18)
    ];

    expect(analyzePdfTableLayout(twoByTwo, 300)).toEqual([]);
    expect(analyzePdfTableLayout(rightAligned, 300)).toHaveLength(6);
  });

  it('ignores isolated invalid items without losing a bounded valid table', () => {
    const result = analyzePdfTableLayout([
      line('Broken', Number.NaN, 0, 20),
      line('A', 20, 20, 20), line('B', 120, 20, 20),
      line('1', 20, 42, 20), line('2', 120, 42, 20),
      line('3', 20, 64, 20), line('4', 120, 64, 20)
    ], 300);

    expect(result.map(cell => cell.line.text)).toEqual(['A', 'B', '1', '2', '3', '4']);
  });

  it('rejects synchronized long-form two-column paper text', () => {
    const lines = [0, 1, 2].flatMap(rowIndex => [
      line('This article discusses a detailed experimental method and its measured results.', 35, 30 + rowIndex * 20, 235),
      line('The second paper column continues with substantial academic prose and analysis.', 330, 30 + rowIndex * 20, 235)
    ]);

    expect(analyzePdfTableLayout(lines, 600)).toEqual([]);
  });

  it('rejects ordinary prose split into three aligned PDF text fragments per line', () => {
    const lines = [
      line('The report', 30, 20, 62), line('shows steady', 98, 20, 72), line('growth today.', 176, 20, 78),
      line('The outlook', 30, 42, 66), line('remains quite', 102, 42, 78), line('positive now.', 186, 42, 76)
    ];

    expect(analyzePdfTableLayout(lines, 500)).toEqual([]);
  });

  it('extracts stable table columns without swallowing an aligned prose column', () => {
    const lines = [0, 1, 2].flatMap(rowIndex => [
      line(`Key${rowIndex}`, 30, 20 + rowIndex * 22, 34),
      line(`V${rowIndex}`, 130, 20 + rowIndex * 22, 20),
      line(`Right prose for row ${rowIndex}`, 330, 20 + rowIndex * 22, 145)
    ]);

    const result = analyzePdfTableLayout(lines, 600);
    expect(result.map(cell => cell.line.text)).toEqual([
      'Key0', 'V0', 'Key1', 'V1', 'Key2', 'V2'
    ]);
    expect(result.every(cell => cell.columnCount === 2)).toBe(true);
  });

  it('rejects pure numeric grids that are more likely mathematical matrices', () => {
    const matrix = [0, 1, 2].flatMap(rowIndex => [
      line(String(rowIndex * 2 + 1), 30, 20 + rowIndex * 22, 12),
      line(String(rowIndex * 2 + 2), 130, 20 + rowIndex * 22, 12)
    ]);

    expect(analyzePdfTableLayout(matrix, 300)).toEqual([]);
  });

  it('rejects missing, drifting, overlapping, and irregular rows', () => {
    const missingCell = [
      line('A', 30, 20, 20), line('B', 130, 20, 20), line('C', 230, 20, 20),
      line('1', 30, 42, 15), line('2', 130, 42, 15)
    ];
    const driftingColumns = [
      line('A', 30, 20, 20), line('B', 130, 20, 20),
      line('1', 45, 42, 15), line('2', 145, 42, 15)
    ];
    const overlappingColumns = [
      line('A wide cell', 30, 20, 120), line('B', 130, 20, 20),
      line('1', 30, 42, 120), line('2', 130, 42, 20)
    ];
    const overlappingRows = [
      line('A', 30, 20, 20, 20), line('B', 130, 20, 20, 20),
      line('1', 30, 35, 15, 20), line('2', 130, 35, 15, 20)
    ];
    const irregularRows = [
      line('A', 30, 20, 20), line('B', 130, 20, 20),
      line('1', 30, 42, 15), line('2', 130, 42, 15),
      line('3', 30, 92, 15), line('4', 130, 92, 15)
    ];
    const progressivelyDriftingColumns = [0, 1, 2, 3, 4].flatMap(rowIndex => [
      line(`L${rowIndex}`, 30 + rowIndex * 4, 20 + rowIndex * 22, 20),
      line(`R${rowIndex}`, 130 + rowIndex * 4, 20 + rowIndex * 22, 20)
    ]);

    expect(analyzePdfTableLayout(missingCell, 400)).toEqual([]);
    expect(analyzePdfTableLayout(driftingColumns, 400)).toEqual([]);
    expect(analyzePdfTableLayout(overlappingColumns, 400)).toEqual([]);
    expect(analyzePdfTableLayout(overlappingRows, 400)).toEqual([]);
    expect(analyzePdfTableLayout(irregularRows, 400)).toEqual([]);
    expect(analyzePdfTableLayout(progressivelyDriftingColumns, 400)).toEqual([]);
  });

  it('rejects unsupported column counts and invalid page or line geometry', () => {
    const nineColumns = [0, 1].flatMap(rowIndex => Array.from({ length: 9 }, (_, columnIndex) => (
      line(`${rowIndex}:${columnIndex}`, 10 + columnIndex * 50, 20 + rowIndex * 22, 20)
    )));
    const validMinimum = [
      line('A', 20, 20, 20), line('B', 120, 20, 20),
      line('1', 20, 42, 20), line('2', 120, 42, 20)
    ];
    const invalidVariants = [
      [...validMinimum.slice(0, 3), line('2', 120, 42, 0)],
      [...validMinimum.slice(0, 3), line('2', -1, 42, 20)],
      [...validMinimum.slice(0, 3), line('2', 295, 42, 20)],
      [...validMinimum.slice(0, 3), line('2', 120, Number.NaN, 20)],
      [...validMinimum.slice(0, 3), line(' ', 120, 42, 20)]
    ];

    expect(analyzePdfTableLayout(nineColumns, 500)).toEqual([]);
    expect(analyzePdfTableLayout(validMinimum, 0)).toEqual([]);
    expect(analyzePdfTableLayout(validMinimum, Number.POSITIVE_INFINITY)).toEqual([]);
    for (const invalid of invalidVariants) {
      expect(analyzePdfTableLayout(invalid, 300)).toEqual([]);
    }
  });

  it('rejects tables that exceed the history-compatible row limit', () => {
    const oversized = Array.from({ length: 201 }, (_, rowIndex) => [
      line(`L${rowIndex}`, 20, 20 + rowIndex * 14, 30, 8),
      line(`R${rowIndex}`, 120, 20 + rowIndex * 14, 30, 8)
    ]).flat();

    expect(analyzePdfTableLayout(oversized, 300)).toEqual([]);
  });
});
