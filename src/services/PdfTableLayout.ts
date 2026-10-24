export interface PdfTableTextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tableEligible?: boolean;
}

export interface PdfTableCellLayout<T extends PdfTableTextLine = PdfTableTextLine> {
  line: T;
  lineIndex: number;
  tableId: number;
  rowIndex: number;
  rowCount: number;
  columnIndex: number;
  columnCount: number;
  cellX: number;
  cellY: number;
  cellWidth: number;
  cellHeight: number;
}

interface IndexedLine<T extends PdfTableTextLine> {
  line: T;
  lineIndex: number;
}

interface VisualRow<T extends PdfTableTextLine> {
  lines: Array<IndexedLine<T>>;
  top: number;
  bottom: number;
  center: number;
  medianHeight: number;
}

const MIN_COLUMN_COUNT = 2;
const MAX_COLUMN_COUNT = 8;
const MAX_VERTICAL_GAP_IN_LINE_HEIGHTS = 3;
const MAX_INPUT_LINES = 2_048;
const MAX_TABLE_COUNT = 32;
const MAX_TABLE_ROWS = 200;
const MAX_ANNOTATED_CELLS = 512;

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] || 0;
  return ((sorted[middle - 1] || 0) + (sorted[middle] || 0)) / 2;
};

const isValidLine = <T extends PdfTableTextLine>(
  item: IndexedLine<T>,
  pageWidth: number
): boolean => {
  const { line } = item;
  return line.tableEligible !== false
    && Boolean(line.text.trim())
    && [line.x, line.y, line.width, line.height].every(Number.isFinite)
    && line.x >= 0
    && line.y >= 0
    && line.width > 0
    && line.height > 0
    && line.x + line.width <= pageWidth;
};

const createVisualRow = <T extends PdfTableTextLine>(item: IndexedLine<T>): VisualRow<T> => ({
  lines: [item],
  top: item.line.y,
  bottom: item.line.y + item.line.height,
  center: item.line.y + item.line.height / 2,
  medianHeight: item.line.height
});

const refreshVisualRow = <T extends PdfTableTextLine>(row: VisualRow<T>): void => {
  row.top = Math.min(...row.lines.map(item => item.line.y));
  row.bottom = Math.max(...row.lines.map(item => item.line.y + item.line.height));
  row.center = median(row.lines.map(item => item.line.y + item.line.height / 2));
  row.medianHeight = median(row.lines.map(item => item.line.height));
};

const belongsToVisualRow = <T extends PdfTableTextLine>(
  row: VisualRow<T>,
  item: IndexedLine<T>,
  pageWidth: number
): boolean => {
  const itemTop = item.line.y;
  const itemBottom = item.line.y + item.line.height;
  const overlap = Math.min(row.bottom, itemBottom) - Math.max(row.top, itemTop);
  const minimumHeight = Math.min(row.medianHeight, item.line.height);
  const centerDifference = Math.abs(row.center - (itemTop + itemBottom) / 2);
  const centerTolerance = Math.max(1.5, Math.min(pageWidth * 0.006, minimumHeight * 0.4));
  return overlap >= minimumHeight * 0.5 && centerDifference <= centerTolerance;
};

const groupIntoVisualRows = <T extends PdfTableTextLine>(
  lines: Array<IndexedLine<T>>,
  pageWidth: number
): Array<VisualRow<T>> => {
  const sorted = [...lines].sort((first, second) => (
    first.line.y - second.line.y
    || first.line.x - second.line.x
    || first.lineIndex - second.lineIndex
  ));
  const rows: Array<VisualRow<T>> = [];

  for (const item of sorted) {
    const current = rows[rows.length - 1];
    if (!current || !belongsToVisualRow(current, item, pageWidth)) {
      rows.push(createVisualRow(item));
      continue;
    }
    current.lines.push(item);
    refreshVisualRow(current);
  }

  return rows.map(row => ({
    ...row,
    lines: [...row.lines].sort((first, second) => (
      first.line.x - second.line.x || first.lineIndex - second.lineIndex
    ))
  }));
};

const isUsableTableRow = <T extends PdfTableTextLine>(row: VisualRow<T>): boolean => {
  if (row.lines.length < MIN_COLUMN_COUNT || row.lines.length > MAX_COLUMN_COUNT) return false;
  return row.lines.every((item, index) => {
    const next = row.lines[index + 1];
    return !next || item.line.x + item.line.width < next.line.x;
  });
};

const columnAlignmentTolerance = <T extends PdfTableTextLine>(
  first: VisualRow<T>,
  second: VisualRow<T>,
  pageWidth: number
): number => Math.max(
  2,
  Math.min(pageWidth * 0.01, Math.min(first.medianHeight, second.medianHeight) * 0.5)
);

const rowsShareColumnAnchors = <T extends PdfTableTextLine>(
  first: VisualRow<T>,
  second: VisualRow<T>,
  pageWidth: number
): boolean => {
  if (!isUsableTableRow(first) || !isUsableTableRow(second)) return false;
  if (first.lines.length !== second.lines.length) return false;
  const tolerance = columnAlignmentTolerance(first, second, pageWidth);
  return first.lines.every((item, index) => {
    const candidate = second.lines[index]!.line;
    return Math.min(
      Math.abs(item.line.x - candidate.x),
      Math.abs((item.line.x + item.line.width / 2) - (candidate.x + candidate.width / 2)),
      Math.abs((item.line.x + item.line.width) - (candidate.x + candidate.width))
    ) <= tolerance;
  });
};

const rowsCanContinueTable = <T extends PdfTableTextLine>(
  first: VisualRow<T>,
  second: VisualRow<T>,
  pageWidth: number
): boolean => {
  if (!rowsShareColumnAnchors(first, second, pageWidth)) return false;

  const verticalGap = second.top - first.bottom;
  const maximumGap = Math.max(
    12,
    Math.max(first.medianHeight, second.medianHeight) * MAX_VERTICAL_GAP_IN_LINE_HEIGHTS
  );
  if (verticalGap < 0 || verticalGap > maximumGap) return false;
  return true;
};

const hasStableColumnGeometry = <T extends PdfTableTextLine>(
  rows: Array<VisualRow<T>>,
  pageWidth: number
): boolean => {
  const columnCount = rows[0]?.lines.length || 0;
  const tolerance = Math.max(
    2,
    Math.min(pageWidth * 0.01, median(rows.map(row => row.medianHeight)) * 0.5)
  );
  const anchorsAreStable = Array.from({ length: columnCount }, (_, columnIndex) => {
    const candidates = [
      rows.map(row => row.lines[columnIndex]!.line.x),
      rows.map(row => {
        const line = row.lines[columnIndex]!.line;
        return line.x + line.width / 2;
      }),
      rows.map(row => {
        const line = row.lines[columnIndex]!.line;
        return line.x + line.width;
      })
    ];
    return candidates.some(values => {
      const anchor = median(values);
      return values.every(value => Math.abs(value - anchor) <= tolerance);
    });
  }).every(Boolean);
  if (!anchorsAreStable) return false;

  for (let columnIndex = 0; columnIndex < columnCount - 1; columnIndex += 1) {
    const maximumRight = Math.max(...rows.map(row => {
      const line = row.lines[columnIndex]!.line;
      return line.x + line.width;
    }));
    const minimumNextLeft = Math.min(...rows.map(row => row.lines[columnIndex + 1]!.line.x));
    const minimumGap = Math.max(4, median(rows.map(row => row.medianHeight)) * 0.4);
    if (minimumNextLeft - maximumRight < minimumGap) return false;
  }
  return true;
};

const hasRegularRowGeometry = <T extends PdfTableTextLine>(rows: Array<VisualRow<T>>): boolean => {
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index]!.top < rows[index - 1]!.bottom) return false;
  }
  if (rows.length < 3) return true;

  const distances = rows.slice(1).map((row, index) => row.center - rows[index]!.center);
  const typicalDistance = median(distances);
  if (typicalDistance <= 0) return false;
  const tolerance = Math.max(3, typicalDistance * 0.3);
  return distances.every(distance => Math.abs(distance - typicalDistance) <= tolerance);
};

const isLongProse = (text: string): boolean => {
  const words = text.trim().match(/[A-Za-z]{2,}|[\u4e00-\u9fff]{2,}/g) || [];
  const compactLength = Array.from(text.replace(/\s+/g, '')).length;
  return words.length >= 4 || compactLength >= 24;
};

const isLikelyParallelProseColumns = <T extends PdfTableTextLine>(
  rows: Array<VisualRow<T>>,
  pageWidth: number
): boolean => {
  if (rows[0]?.lines.length !== 2) return false;
  const allLines = rows.flatMap(row => row.lines.map(item => item.line));
  const longProseRatio = allLines.filter(line => isLongProse(line.text)).length / allLines.length;
  const medianWidths = [0, 1].map(columnIndex => median(
    rows.map(row => row.lines[columnIndex]!.line.width)
  ));
  const left = Math.min(...allLines.map(line => line.x));
  const right = Math.max(...allLines.map(line => line.x + line.width));
  return longProseRatio >= 0.75
    && medianWidths.every(width => width >= pageWidth * 0.22)
    && right - left >= pageWidth * 0.7;
};

const wordCount = (text: string): number => (
  text.trim().match(/[A-Za-z]{2,}|[\u4e00-\u9fff]{2,}/g) || []
).length;

const isLikelyFragmentedProse = <T extends PdfTableTextLine>(
  rows: Array<VisualRow<T>>,
  pageWidth: number
): boolean => {
  const proseRows = rows.filter(row => {
    const text = row.lines.map(item => item.line.text).join(' ');
    if (wordCount(text) < 4) return false;
    const closeGapLimit = Math.min(
      pageWidth * 0.08,
      Math.max(18, row.medianHeight * 4)
    );
    const gaps = row.lines.slice(1).map((item, index) => (
      item.line.x - (row.lines[index]!.line.x + row.lines[index]!.line.width)
    ));
    return gaps.length > 0
      && gaps.filter(gap => gap <= closeGapLimit).length >= Math.ceil(gaps.length / 2);
  });
  return proseRows.length / rows.length >= 0.75;
};

const isLikelyProseColumn = <T extends PdfTableTextLine>(
  rows: Array<VisualRow<T>>,
  pageWidth: number
): boolean => {
  if (rows.length < 3 || (rows[0]?.lines.length || 0) < 3) return false;
  const columnCount = rows[0]!.lines.length;
  const medianWidths = Array.from({ length: columnCount }, (_, columnIndex) => median(
    rows.map(row => row.lines[columnIndex]!.line.width)
  ));
  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const proseCellRatio = rows.filter(row => {
      const text = row.lines[columnIndex]!.line.text;
      return wordCount(text) >= 2 || Array.from(text.replace(/\s+/g, '')).length >= 18;
    }).length / rows.length;
    const otherWidths = medianWidths.filter((_width, index) => index !== columnIndex);
    return proseCellRatio >= 0.75
      && medianWidths[columnIndex]! >= pageWidth * 0.1
      && medianWidths[columnIndex]! >= median(otherWidths) * 1.5;
  }).some(Boolean);
};

const isLikelyNumericMatrix = <T extends PdfTableTextLine>(rows: Array<VisualRow<T>>): boolean => {
  const texts = rows.flatMap(row => row.lines.map(item => item.line.text.trim()));
  return texts.length > 0 && texts.every(text => (
    !/[A-Za-z\u4e00-\u9fff]/u.test(text)
    && /^[\d\s.,+\-*/=()[\]{}%$€£¥:;|]+$/u.test(text)
  ));
};

const isTableCandidate = <T extends PdfTableTextLine>(
  rows: Array<VisualRow<T>>,
  pageWidth: number
): boolean => (rows.length >= 3 || (rows.length === 2 && (rows[0]?.lines.length || 0) >= 3))
  && rows.length <= MAX_TABLE_ROWS
  && rows.length * (rows[0]?.lines.length || 0) >= 4
  && hasStableColumnGeometry(rows, pageWidth)
  && hasRegularRowGeometry(rows)
  && !isLikelyParallelProseColumns(rows, pageWidth)
  && !isLikelyFragmentedProse(rows, pageWidth)
  && !isLikelyProseColumn(rows, pageWidth)
  && !isLikelyNumericMatrix(rows);

const selectTableCandidate = <T extends PdfTableTextLine>(
  rows: Array<VisualRow<T>>,
  pageWidth: number
): Array<VisualRow<T>> | null => {
  if (isTableCandidate(rows, pageWidth)) return rows;
  const columnCount = rows[0]?.lines.length || 0;
  if (columnCount <= MIN_COLUMN_COUNT || columnCount > MAX_COLUMN_COUNT) return null;

  const candidates: Array<Array<VisualRow<T>>> = [];
  for (let width = columnCount - 1; width >= MIN_COLUMN_COUNT; width -= 1) {
    for (let start = 0; start + width <= columnCount; start += 1) {
      const subset = rows.map(row => ({
        ...row,
        lines: row.lines.slice(start, start + width)
      }));
      if (isTableCandidate(subset, pageWidth)) candidates.push(subset);
    }
    if (candidates.length > 0) break;
  }
  return candidates[0] || null;
};

const createColumnBoundaries = <T extends PdfTableTextLine>(
  rows: Array<VisualRow<T>>
): number[] => {
  const columnCount = rows[0]!.lines.length;
  const minimumLefts = Array.from({ length: columnCount }, (_, columnIndex) => Math.min(
    ...rows.map(row => row.lines[columnIndex]!.line.x)
  ));
  const maximumRights = Array.from({ length: columnCount }, (_, columnIndex) => Math.max(
    ...rows.map(row => {
      const line = row.lines[columnIndex]!.line;
      return line.x + line.width;
    })
  ));
  const boundaries = [minimumLefts[0]!];
  for (let columnIndex = 0; columnIndex < columnCount - 1; columnIndex += 1) {
    boundaries.push((maximumRights[columnIndex]! + minimumLefts[columnIndex + 1]!) / 2);
  }
  boundaries.push(maximumRights[columnCount - 1]!);
  return boundaries;
};

const createRowBoundaries = <T extends PdfTableTextLine>(rows: Array<VisualRow<T>>): number[] => {
  const boundaries = [rows[0]!.top];
  for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
    boundaries.push((rows[rowIndex]!.bottom + rows[rowIndex + 1]!.top) / 2);
  }
  boundaries.push(rows[rows.length - 1]!.bottom);
  return boundaries;
};

const annotateTable = <T extends PdfTableTextLine>(
  rows: Array<VisualRow<T>>,
  tableId: number
): Array<PdfTableCellLayout<T>> => {
  const columnBoundaries = createColumnBoundaries(rows);
  const rowBoundaries = createRowBoundaries(rows);
  const rowCount = rows.length;
  const columnCount = rows[0]!.lines.length;

  return rows.flatMap((row, rowOffset) => row.lines.map((item, columnOffset) => ({
    line: item.line,
    lineIndex: item.lineIndex,
    tableId,
    rowIndex: rowOffset + 1,
    rowCount,
    columnIndex: columnOffset + 1,
    columnCount,
    cellX: columnBoundaries[columnOffset]!,
    cellY: rowBoundaries[rowOffset]!,
    cellWidth: columnBoundaries[columnOffset + 1]! - columnBoundaries[columnOffset]!,
    cellHeight: rowBoundaries[rowOffset + 1]! - rowBoundaries[rowOffset]!
  })));
};

export const analyzePdfTableLayout = <T extends PdfTableTextLine>(
  lines: readonly T[],
  pageWidth: number
): Array<PdfTableCellLayout<T>> => {
  if (
    !Number.isFinite(pageWidth)
    || pageWidth <= 0
    || lines.length < 4
    || lines.length > MAX_INPUT_LINES
  ) return [];

  const indexed = lines
    .map((line, lineIndex) => ({ line, lineIndex }))
    .filter(item => isValidLine(item, pageWidth));
  if (indexed.length < 4) return [];
  const visualRows = groupIntoVisualRows(indexed, pageWidth);
  const annotations: Array<PdfTableCellLayout<T>> = [];
  let tableId = 1;

  for (let start = 0; start < visualRows.length;) {
    const first = visualRows[start]!;
    if (!isUsableTableRow(first)) {
      start += 1;
      continue;
    }

    let end = start + 1;
    while (
      end < visualRows.length
      && rowsCanContinueTable(visualRows[end - 1]!, visualRows[end]!, pageWidth)
    ) {
      end += 1;
    }

    const candidate = visualRows.slice(start, end);
    const nextRow = visualRows[end];
    const previousRow = visualRows[end - 1]!;
    const separationGap = nextRow ? nextRow.top - previousRow.bottom : 0;
    const clearTableSeparation = nextRow
      ? separationGap > Math.max(
        36,
        Math.max(previousRow.medianHeight, nextRow.medianHeight) * 3.5
      )
      : false;
    const interruptedByIrregularSpacing = Boolean(nextRow)
      && rowsShareColumnAnchors(previousRow, nextRow!, pageWidth)
      && !clearTableSeparation;
    const selectedCandidate = interruptedByIrregularSpacing
      ? null
      : selectTableCandidate(candidate, pageWidth);
    if (selectedCandidate) {
      const candidateAnnotations = annotateTable(selectedCandidate, tableId);
      if (
        tableId > MAX_TABLE_COUNT
        || annotations.length + candidateAnnotations.length > MAX_ANNOTATED_CELLS
      ) break;
      annotations.push(...candidateAnnotations);
      tableId += 1;
      start = end;
      continue;
    }
    start = candidate.length >= 2 ? end : start + 1;
  }

  return annotations;
};
