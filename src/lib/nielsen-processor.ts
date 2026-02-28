// Nielsen Data Processor - v4 (final fix)
import * as XLSX from 'xlsx';

export interface NielsenDataRow {
  MARKET: string;
  PRODUCT: string;
  MANUFACTURER: string;
  BRAND: string;
  VARIANT: string;
  PACKAGE_TYPE: string;
  ITEM_WEIGHT_ACTUAL: number;
  ITEM_WEIGHT_STR: string; // Original weight string from Excel
  WEIGHT_2: number;
  ITEM: string;
  PERIOD: string;
  YEAR: number;
  RTO: number;
  QTY: number;
  CATEGORY: string;
  SEGMENT?: string;
  SOURCE_FILE: string;
}

export interface CategoryConfig {
  name: string;
  sourceFile: string;
  variantColumn: string;
  segmentColumn?: string;
  segmentValues?: string[];
}

export interface FileProcessResult {
  fileName: string;
  categories: CategoryConfig[];
  dataCount: number;
  error?: string;
  headers?: string[];
}

// Session storage for processed data - using globalThis for persistence
type GlobalSession = {
  sessionData: Map<string, NielsenDataRow[]> | null;
  sessionCategories: CategoryConfig[];
  sessionRawColumns: string[];
  sessionRawData: any[];
  sessionSourceFiles: string[]; // List of uploaded file names
};

const globalForSession = globalThis as unknown as GlobalSession & { nielsenSession?: GlobalSession };

// Initialize or get existing session
export function getSession(): GlobalSession {
  if (!globalForSession.nielsenSession) {
    globalForSession.nielsenSession = {
      sessionData: null,
      sessionCategories: [],
      sessionRawColumns: [],
      sessionRawData: [],
      sessionSourceFiles: [],
    };
  }
  return globalForSession.nielsenSession;
}

export function clearSessionData(): void {
  const session = getSession();
  session.sessionData = null;
  session.sessionCategories = [];
  session.sessionRawColumns = [];
  session.sessionRawData = [];
  session.sessionSourceFiles = [];
}

export function getSessionData(): Map<string, NielsenDataRow[]> | null {
  return getSession().sessionData;
}

export function getSessionCategories(): CategoryConfig[] {
  return getSession().sessionCategories;
}

export function getSessionRawColumns(): string[] {
  return getSession().sessionRawColumns;
}

export function getSessionSourceFiles(): string[] {
  return getSession().sessionSourceFiles;
}

export function getSessionRawData(): any[] {
  return getSession().sessionRawData;
}

// Columns to exclude from dynamic filter
const EXCLUDED_FILTER_COLUMNS = [
  'MARKET', 'PRODUCT', 'BRAND', 'MANUFACTURER',
  'Продажи в деньгах (1000 руб)', 'Продажи в нат. выражении (1000 кг/л/шт)',
  'RTO', 'QTY', 'YEAR'  // YEAR excluded as it's in main filters
];

// Known segment patterns for category detection
const SEGMENT_PATTERNS: Record<string, { column: string; values: string[] }> = {
  'BUTTER': { column: 'DETAILED SEGMENT', values: ['BUTTER'] },
  'SPREAD': { column: 'SEGMENT', values: ['SPREAD (INC. MELTED)'] },
  'MARGARINE': { column: 'SEGMENT', values: ['MARGARINE (INC. MELTED)'] },
};

// Find the variant column in the data
function findVariantColumn(headers: string[]): string {
  const variantPatterns = ['VARIANT (SUB-BRAND)', 'VARIANT', 'SUB-BRAND', 'TASTE', 'FLAVOR'];
  for (const pattern of variantPatterns) {
    const found = headers.find(h => h.toUpperCase() === pattern.toUpperCase());
    if (found) return found;
  }
  // Fallback: look for any column containing VARIANT
  const found = headers.find(h => h.toUpperCase().includes('VARIANT'));
  return found || 'VARIANT';
}

// Find segment columns
function findSegmentColumns(headers: string[]): string[] {
  const segmentCols: string[] = [];
  const patterns = ['SEGMENT', 'DETAILED SEGMENT', 'CATEGORY', 'SUBCATEGORY'];
  for (const pattern of patterns) {
    const found = headers.find(h => h.toUpperCase() === pattern.toUpperCase());
    if (found) segmentCols.push(found);
  }
  return segmentCols;
}

// Process Excel file and extract data
export function processExcelFile(fileBuffer: Buffer, fileName: string): FileProcessResult {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const result: FileProcessResult = {
      fileName,
      categories: [],
      dataCount: 0,
      headers: [] // Store headers
    };
    
    // Process all sheets
    const allData: any[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      // Use loop instead of spread to avoid stack overflow with large arrays
      for (let i = 0; i < data.length; i++) {
        allData.push(data[i]);
      }
    }
    
    if (allData.length === 0) {
      result.error = 'Файл не содержит данных';
      return result;
    }
    
    // Get headers
    const headers = Object.keys(allData[0]);
    result.headers = headers;
    result.dataCount = allData.length;
    
    // Find columns
    const variantColumn = findVariantColumn(headers);
    const segmentColumns = findSegmentColumns(headers);
    
    // Check if this file has segment data for splitting
    const hasDetailedSegment = headers.some(h => h.toUpperCase() === 'DETAILED SEGMENT');
    const hasSegment = headers.some(h => h.toUpperCase() === 'SEGMENT');
    
    // Detect categories based on segment values
    const categories: CategoryConfig[] = [];
    
    // Extract base file name without extension
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    
    if (hasDetailedSegment || hasSegment) {
      // Get unique segment values
      const segmentValues = new Set<string>();
      const detailedSegmentValues = new Set<string>();
      
      allData.forEach(row => {
        if (hasSegment) {
          const seg = String(row['SEGMENT'] || '');
          if (seg) segmentValues.add(seg);
        }
        if (hasDetailedSegment) {
          const seg = String(row['DETAILED SEGMENT'] || '');
          if (seg) detailedSegmentValues.add(seg);
        }
      });
      
      // Check for BUTTER (from DETAILED SEGMENT)
      if (detailedSegmentValues.has('BUTTER') || detailedSegmentValues.has('MELTED BUTTER')) {
        categories.push({
          name: 'Масло',
          sourceFile: fileName,
          variantColumn,
          segmentColumn: 'DETAILED SEGMENT',
          segmentValues: ['BUTTER']
        });
      }
      
      // Check for SPREAD (from SEGMENT)
      if (segmentValues.has('SPREAD (INC. MELTED)')) {
        categories.push({
          name: 'Спред',
          sourceFile: fileName,
          variantColumn,
          segmentColumn: 'SEGMENT',
          segmentValues: ['SPREAD (INC. MELTED)']
        });
      }
      
      // Check for MARGARINE (from SEGMENT)
      if (segmentValues.has('MARGARINE (INC. MELTED)')) {
        categories.push({
          name: 'Маргарин',
          sourceFile: fileName,
          variantColumn,
          segmentColumn: 'SEGMENT',
          segmentValues: ['MARGARINE (INC. MELTED)']
        });
      }
      
      // Add other segments as categories if no specific patterns found
      if (categories.length === 0) {
        // Use all unique segment values as categories
        segmentValues.forEach(seg => {
          if (seg && seg !== 'TOTAL') {
            categories.push({
              name: seg,
              sourceFile: fileName,
              variantColumn,
              segmentColumn: 'SEGMENT',
              segmentValues: [seg]
            });
          }
        });
        
        detailedSegmentValues.forEach(seg => {
          if (seg && seg !== 'TOTAL' && !categories.find(c => c.name === seg)) {
            categories.push({
              name: seg,
              sourceFile: fileName,
              variantColumn,
              segmentColumn: 'DETAILED SEGMENT',
              segmentValues: [seg]
            });
          }
        });
      }
    }
    
    // If no segment-based categories, create one from file name
    if (categories.length === 0) {
      // Try to map file name to category name
      const categoryMap: Record<string, string> = {
        'Масло_маргарин': 'Масло/Маргарин',
        'Пастер_молоко': 'Пастер. молоко',
        'Растительное': 'Растительное масло',
        'Сливки': 'Сливки',
        'Стерил_молоко': 'Стерил. молоко',
      };
      
      const categoryName = categoryMap[baseName] || baseName;
      categories.push({
        name: categoryName,
        sourceFile: fileName,
        variantColumn
      });
    }
    
    result.categories = categories;
    result.dataCount = allData.length;
    
    return result;
  } catch (error) {
    return {
      fileName,
      categories: [],
      dataCount: 0,
      error: `Ошибка обработки: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
    };
  }
}

// Parse data row
function parseDataRow(row: any, category: CategoryConfig): NielsenDataRow {
  const segment = category.segmentColumn ? String(row[category.segmentColumn] || '') : '';
  
  return {
    MARKET: String(row['MARKET'] || ''),
    PRODUCT: String(row['PRODUCT'] || ''),
    MANUFACTURER: String(row['MANUFACTURER'] || ''),
    BRAND: String(row['BRAND'] || ''),
    VARIANT: String(row[category.variantColumn] || ''),
    PACKAGE_TYPE: String(row['PACKAGE TYPE'] || ''),
    ITEM_WEIGHT_ACTUAL: parseFloat(String(row['WEIGHT'] || row['ITEM WEIGHT ACTUAL'])) || 0,
    ITEM_WEIGHT_STR: String(row['WEIGHT'] || row['ITEM WEIGHT ACTUAL'] || ''),
    WEIGHT_2: parseFloat(String(row['WEIGHT 2'])) || 0,
    ITEM: String(row['ITEM'] || ''),
    PERIOD: String(row['PERIOD'] || ''),
    YEAR: parseInt(String(row['YEAR'])) || 0,
    RTO: parseFloat(String(row['Продажи в деньгах (1000 руб)'])) || 0,
    QTY: parseFloat(String(row['Продажи в нат. выражении (1000 кг/л/шт)'])) || 0,
    CATEGORY: category.name,
    SEGMENT: segment,
    SOURCE_FILE: category.sourceFile,
  };
}

// Load all uploaded files into session
export function loadFilesToSession(files: { buffer: Buffer; fileName: string }[]): {
  categories: CategoryConfig[];
  errors: string[];
  totalRows: number;
} {
  const dataMap = new Map<string, NielsenDataRow[]>();
  const allCategories: CategoryConfig[] = [];
  const errors: string[] = [];
  let totalRows = 0;
  
  // File cache to avoid re-reading
  const fileCache = new Map<string, any[]>();
  
  // First pass: detect categories
  for (const file of files) {
    const result = processExcelFile(file.buffer, file.fileName);
    if (result.error) {
      errors.push(`${file.fileName}: ${result.error}`);
      continue;
    }
    allCategories.push(...result.categories);
  }
  
  // Second pass: load data
  // Collect all unique columns from ALL files
  const allColumnsSet = new Set<string>();
  
  for (const file of files) {
    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      let rawData: any[] = [];
      
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        // Use loop instead of spread to avoid stack overflow
        for (let i = 0; i < data.length; i++) {
          rawData.push(data[i]);
        }
      }
      
      // Collect column headers from each file
      if (rawData.length > 0) {
        const fileColumns = Object.keys(rawData[0]);
        fileColumns.forEach(col => allColumnsSet.add(col));
      }

      // Store raw data for column filtering - use loop to avoid stack overflow
      const rawSession = getSession();
      for (let i = 0; i < rawData.length; i++) {
        rawSession.sessionRawData.push(rawData[i]);
      }

      fileCache.set(file.fileName, rawData);
    } catch (error) {
      errors.push(`${file.fileName}: Ошибка чтения`);
    }
  }

  // Store all unique columns from all files
  const session = getSession();
  session.sessionRawColumns = Array.from(allColumnsSet);
  
  // Process data for each category
  for (const category of allCategories) {
    const rawData = fileCache.get(category.sourceFile) || [];
    const processedData: NielsenDataRow[] = [];
    
    for (const row of rawData) {
      const segment = category.segmentColumn ? String(row[category.segmentColumn] || '') : '';
      
      // Filter by segment values if specified
      if (category.segmentValues && category.segmentColumn) {
        if (!category.segmentValues.includes(segment)) {
          continue;
        }
      }
      
      processedData.push(parseDataRow(row, category));
    }
    
    totalRows += processedData.length;
    
    // Merge with existing data if category already exists
    if (dataMap.has(category.name)) {
      const existing = dataMap.get(category.name)!;
      dataMap.set(category.name, [...existing, ...processedData]);
    } else {
      dataMap.set(category.name, processedData);
    }
  }
  
  // Set final session data
  session.sessionData = dataMap;
  session.sessionCategories = allCategories;
  // Store source file names
  session.sessionSourceFiles = files.map(f => f.fileName);
  
  return {
    categories: allCategories,
    errors,
    totalRows
  };
}

// Append files to existing session data (for incremental uploads)
export function appendFilesToSession(files: { buffer: Buffer; fileName: string }[]): {
  categories: CategoryConfig[];
  errors: string[];
  totalRows: number;
  addedRows: number;
} {
  const session = getSession();
  const errors: string[] = [];
  let addedRows = 0;
  
  // Get existing data or initialize
  let dataMap = session.sessionData || new Map<string, NielsenDataRow[]>();
  let allCategories = [...session.sessionCategories];
  const allColumnsSet = new Set(session.sessionRawColumns);
  
  // File cache for this batch
  const fileCache = new Map<string, any[]>();
  const newSourceFiles = [...session.sessionSourceFiles];
  
  // First pass: detect categories from new files
  for (const file of files) {
    const result = processExcelFile(file.buffer, file.fileName);
    if (result.error) {
      errors.push(`${file.fileName}: ${result.error}`);
      continue;
    }
    
    // Add categories that don't exist yet
    for (const cat of result.categories) {
      if (!allCategories.find(c => c.name === cat.name && c.sourceFile === cat.sourceFile)) {
        allCategories.push(cat);
      }
    }
  }
  
  // Second pass: load and process data
  for (const file of files) {
    try {
      console.log(`[Append] Processing file: ${file.fileName}`);
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      let rawData: any[] = [];
      
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        for (let i = 0; i < data.length; i++) {
          rawData.push(data[i]);
        }
      }
      
      // Collect column headers
      if (rawData.length > 0) {
        const fileColumns = Object.keys(rawData[0]);
        fileColumns.forEach(col => allColumnsSet.add(col));
      }
      
      // Store raw data
      for (let i = 0; i < rawData.length; i++) {
        session.sessionRawData.push(rawData[i]);
      }
      
      fileCache.set(file.fileName, rawData);
      newSourceFiles.push(file.fileName);
      
    } catch (error) {
      errors.push(`${file.fileName}: Ошибка чтения`);
    }
  }
  
  // Process data for each new category
  for (const category of allCategories) {
    const rawData = fileCache.get(category.sourceFile);
    if (!rawData) continue; // Skip if this category's file wasn't in this batch
    
    const processedData: NielsenDataRow[] = [];
    
    for (const row of rawData) {
      const segment = category.segmentColumn ? String(row[category.segmentColumn] || '') : '';
      
      if (category.segmentValues && category.segmentColumn) {
        if (!category.segmentValues.includes(segment)) {
          continue;
        }
      }
      
      processedData.push(parseDataRow(row, category));
    }
    
    addedRows += processedData.length;
    
    // Merge with existing data
    if (dataMap.has(category.name)) {
      const existing = dataMap.get(category.name)!;
      // Use loop instead of spread for large arrays
      for (const row of processedData) {
        existing.push(row);
      }
    } else {
      dataMap.set(category.name, processedData);
    }
  }
  
  // Update session
  session.sessionData = dataMap;
  session.sessionCategories = allCategories;
  session.sessionRawColumns = Array.from(allColumnsSet);
  session.sessionSourceFiles = newSourceFiles;
  
  // Calculate total rows
  let totalRows = 0;
  dataMap.forEach((rows) => { totalRows += rows.length; });
  
  return {
    categories: allCategories,
    errors,
    totalRows,
    addedRows
  };
}

// Get filter options
export function getFilterOptionsFromSession(
  years?: number[],
  packageTypes?: string[],
  markets?: string[],
  categories?: string[],
  sourceFiles?: string[]
): {
  years: number[];
  packageTypes: string[];
  markets: string[];
  categories: string[];
  sourceFiles: string[];
} {
  const session = getSession();
  if (!session.sessionData) {
    return { years: [], packageTypes: [], markets: [], categories: [], sourceFiles: [] };
  }
  
  let result: NielsenDataRow[] = [];
  session.sessionData.forEach((rows) => { result = result.concat(rows); });
  
  // Apply filters progressively (multi-select)
  if (years && years.length > 0) result = result.filter(r => years.includes(r.YEAR));
  if (packageTypes && packageTypes.length > 0) result = result.filter(r => packageTypes.includes(r.PACKAGE_TYPE));
  if (markets && markets.length > 0) result = result.filter(r => markets.includes(r.MARKET));
  if (categories && categories.length > 0) result = result.filter(r => categories.includes(r.CATEGORY));
  if (sourceFiles && sourceFiles.length > 0) result = result.filter(r => sourceFiles.includes(r.SOURCE_FILE));
  
  const yearsSet = new Set<number>();
  const packageTypesSet = new Set<string>();
  const marketsSet = new Set<string>();
  const categoriesSet = new Set<string>();
  const sourceFilesSet = new Set<string>();
  
  result.forEach(r => {
    if (r.YEAR) yearsSet.add(r.YEAR);
    if (r.PACKAGE_TYPE) packageTypesSet.add(r.PACKAGE_TYPE);
    if (r.MARKET) marketsSet.add(r.MARKET);
    if (r.CATEGORY) categoriesSet.add(r.CATEGORY);
    if (r.SOURCE_FILE) sourceFilesSet.add(r.SOURCE_FILE);
  });
  
  return {
    years: Array.from(yearsSet).sort((a, b) => b - a),
    packageTypes: Array.from(packageTypesSet).sort(),
    markets: Array.from(marketsSet).sort(),
    categories: Array.from(categoriesSet).sort(),
    sourceFiles: Array.from(sourceFilesSet).sort(),
  };
}

// Get filtered data with optional dynamic column filter
export function getFilteredDataFromSession(
  markets: string[],
  categories: string[],
  years: number[],
  packageTypes: string[],
  sourceFiles: string[] = [],
  filterColumn?: string,
  filterValue?: string
): NielsenDataRow[] {
  const session = getSession();
  if (!session.sessionData) return [];
  
  let result: NielsenDataRow[] = [];
  
  if (categories && categories.length > 0) {
    for (const cat of categories) {
      if (session.sessionData.has(cat)) {
        result = result.concat(session.sessionData.get(cat) || []);
      }
    }
  } else {
    session.sessionData.forEach((rows) => { result = result.concat(rows); });
  }
  
  return result.filter((row) => {
    if (markets.length > 0 && !markets.includes(row.MARKET)) return false;
    if (years.length > 0 && !years.includes(row.YEAR)) return false;
    if (packageTypes.length > 0 && !packageTypes.includes(row.PACKAGE_TYPE)) return false;
    if (sourceFiles.length > 0 && !sourceFiles.includes(row.SOURCE_FILE)) return false;
    return true;
  });
}

// Dynamic filter type
export interface DynamicFilter {
  column: string;
  values: string[];
}

// Helper function to apply multiple dynamic filters to data
export function applyDynamicFilters(
  data: NielsenDataRow[],
  filters: DynamicFilter[]
): NielsenDataRow[] {
  if (!filters || filters.length === 0) return data;
  
  const session = getSession();
  if (!session.sessionRawData || session.sessionRawData.length === 0) return data;
  
  let result = data;
  
  // Apply each filter
  for (const filter of filters) {
    if (!filter.column || !filter.values || filter.values.length === 0) continue;
    
    const validKeys = new Set<string>();
    session.sessionRawData.forEach((rawRow: Record<string, unknown>) => {
      const colValue = rawRow[filter.column];
      if (colValue !== undefined && filter.values.includes(String(colValue))) {
        const key = `${rawRow.MARKET}|${rawRow.PRODUCT}|${rawRow.BRAND}|${rawRow.YEAR}`;
        validKeys.add(key);
      }
    });
    
    result = result.filter((row) => {
      const key = `${row.MARKET}|${row.PRODUCT}|${row.BRAND}|${row.YEAR}`;
      return validKeys.has(key);
    });
  }
  
  return result;
}

// Filter raw data by dynamic column and sync with processed data
export function filterByDynamicColumn(
  categories: string[],
  filterColumn: string,
  filterValue: string
): NielsenDataRow[] {
  const session = getSession();
  if (!session.sessionData || !session.sessionRawData) return [];
  
  // Get all processed data for selected categories
  let processedData: NielsenDataRow[] = [];
  if (categories && categories.length > 0) {
    for (const cat of categories) {
      if (session.sessionData.has(cat)) {
        processedData = processedData.concat(session.sessionData.get(cat) || []);
      }
    }
  } else {
    session.sessionData.forEach((rows) => { processedData = processedData.concat(rows); });
  }
  
  // Filter by matching raw data column value
  const filteredIndices = new Set<number>();
  session.sessionRawData.forEach((rawRow, index) => {
    const colValue = rawRow[filterColumn];
    if (colValue !== undefined && String(colValue) === filterValue) {
      filteredIndices.add(index);
    }
  });
  
  // Map processed data to raw data indices based on key fields
  return processedData.filter((row) => {
    // Find matching raw row by checking key fields
    return session.sessionRawData.some((rawRow) => {
      const matchesKey = 
        rawRow.MARKET === row.MARKET &&
        rawRow.PRODUCT === row.PRODUCT &&
        rawRow.BRAND === row.BRAND &&
        rawRow.YEAR === row.YEAR;
      
      if (!matchesKey) return false;
      
      const colValue = rawRow[filterColumn];
      return colValue !== undefined && String(colValue) === filterValue;
    });
  });
}

// Get year comparison data
export function getYearComparisonFromSession(markets: string[]): {
  category: string;
  rto2024: number;
  qty2024: number;
  rto2025: number;
  qty2025: number;
  rtoDynamics: number;
  qtyDynamics: number;
  rtoShare: number;
}[] {
  const session = getSession();
  if (!session.sessionData || !session.sessionCategories) return [];
  
  const results: {
    category: string;
    rto2024: number;
    qty2024: number;
    rto2025: number;
    qty2025: number;
    rtoDynamics: number;
    qtyDynamics: number;
    rtoShare: number;
  }[] = [];
  
  for (const category of session.sessionCategories) {
    const rows = session.sessionData.get(category.name) || [];
    const marketData = markets.length > 0 
      ? rows.filter(r => markets.includes(r.MARKET))
      : rows;
    
    let rto2024 = 0, qty2024 = 0, rto2025 = 0, qty2025 = 0;
    
    marketData.forEach(row => {
      if (row.YEAR === 2024) { rto2024 += row.RTO; qty2024 += row.QTY; }
      else if (row.YEAR === 2025) { rto2025 += row.RTO; qty2025 += row.QTY; }
    });
    
    const rtoDynamics = rto2024 > 0 ? Math.round(((rto2025 - rto2024) / rto2024) * 10000) / 100 : 0;
    const qtyDynamics = qty2024 > 0 ? Math.round(((qty2025 - qty2024) / qty2024) * 10000) / 100 : 0;
    
    results.push({
      category: category.name,
      rto2024: Math.round(rto2024 * 100) / 100,
      qty2024: Math.round(qty2024 * 100) / 100,
      rto2025: Math.round(rto2025 * 100) / 100,
      qty2025: Math.round(qty2025 * 100) / 100,
      rtoDynamics,
      qtyDynamics,
      rtoShare: 0
    });
  }
  
  // Calculate shares
  const totalRto2025 = results.reduce((sum, r) => sum + r.rto2025, 0);
  results.forEach(r => {
    r.rtoShare = totalRto2025 > 0 ? Math.round((r.rto2025 / totalRto2025) * 10000) / 100 : 0;
  });
  
  return results;
}

// Comparison item for custom comparison
export interface ComparisonItem {
  id: string;
  name: string;
  sourceFile?: string;
  filterColumn?: string;
  filterValue?: string;
}

// Get custom comparison data for user-defined categories
export function getCustomComparisonData(
  markets: string[],
  comparisonItems: ComparisonItem[]
): {
  id: string;
  name: string;
  rto2024: number;
  qty2024: number;
  rto2025: number;
  qty2025: number;
  rtoDynamics: number;
  qtyDynamics: number;
  rtoShare: number;
}[] {
  const session = getSession();
  if (!session.sessionData) return [];
  
  const results: {
    id: string;
    name: string;
    rto2024: number;
    qty2024: number;
    rto2025: number;
    qty2025: number;
    rtoDynamics: number;
    qtyDynamics: number;
    rtoShare: number;
  }[] = [];
  
  // Get all data first
  let allData: NielsenDataRow[] = [];
  session.sessionData.forEach((rows) => { allData = allData.concat(rows); });
  
  // Filter by markets
  if (markets.length > 0) {
    allData = allData.filter(r => markets.includes(r.MARKET));
  }
  
  for (const item of comparisonItems) {
    let data = allData;
    
    // Filter by source file
    if (item.sourceFile) {
      data = data.filter(r => r.SOURCE_FILE === item.sourceFile);
    }
    
    // Filter by dynamic column
    if (item.filterColumn && item.filterValue) {
      const validKeys = new Set<string>();
      session.sessionRawData.forEach((rawRow) => {
        const colValue = rawRow[item.filterColumn!];
        if (colValue !== undefined && String(colValue) === item.filterValue) {
          const key = `${rawRow.MARKET}|${rawRow.PRODUCT}|${rawRow.BRAND}|${rawRow.YEAR}`;
          validKeys.add(key);
        }
      });
      data = data.filter((row) => {
        const key = `${row.MARKET}|${row.PRODUCT}|${row.BRAND}|${row.YEAR}`;
        return validKeys.has(key);
      });
    }
    
    let rto2024 = 0, qty2024 = 0, rto2025 = 0, qty2025 = 0;
    
    data.forEach(row => {
      if (row.YEAR === 2024) { rto2024 += row.RTO; qty2024 += row.QTY; }
      else if (row.YEAR === 2025) { rto2025 += row.RTO; qty2025 += row.QTY; }
    });
    
    const rtoDynamics = rto2024 > 0 ? Math.round(((rto2025 - rto2024) / rto2024) * 10000) / 100 : 0;
    const qtyDynamics = qty2024 > 0 ? Math.round(((qty2025 - qty2024) / qty2024) * 10000) / 100 : 0;
    
    results.push({
      id: item.id,
      name: item.name,
      rto2024: Math.round(rto2024 * 100) / 100,
      qty2024: Math.round(qty2024 * 100) / 100,
      rto2025: Math.round(rto2025 * 100) / 100,
      qty2025: Math.round(qty2025 * 100) / 100,
      rtoDynamics,
      qtyDynamics,
      rtoShare: 0
    });
  }
  
  // Calculate shares
  const totalRto2025 = results.reduce((sum, r) => sum + r.rto2025, 0);
  results.forEach(r => {
    r.rtoShare = totalRto2025 > 0 ? Math.round((r.rto2025 / totalRto2025) * 10000) / 100 : 0;
  });
  
  return results;
}

// Helper functions for top data with optional dynamic column filter
export function getTopBrandsFromSession(
  markets: string[],
  categories: string[],
  years: number[],
  packageTypes: string[],
  sourceFiles: string[] = [],
  limit: number = 10,
  filtersOrColumn?: DynamicFilter[] | string,
  filterValue?: string
): { brand: string; rto: number; qty: number }[] {
  let data = getFilteredDataFromSession(markets, categories, years, packageTypes, sourceFiles);
  
  // Handle both old and new filter formats
  let filters: DynamicFilter[] = [];
  if (Array.isArray(filtersOrColumn)) {
    filters = filtersOrColumn;
  } else if (filtersOrColumn && filterValue) {
    filters = [{ column: filtersOrColumn, values: [filterValue] }];
  }
  
  // Apply dynamic filters
  data = applyDynamicFilters(data, filters);
  
  const brandMap = new Map<string, { rto: number; qty: number }>();
  
  data.forEach((row) => {
    const current = brandMap.get(row.BRAND) || { rto: 0, qty: 0 };
    brandMap.set(row.BRAND, { rto: current.rto + row.RTO, qty: current.qty + row.QTY });
  });
  
  return Array.from(brandMap.entries())
    .map(([brand, values]) => ({ brand, rto: Math.round(values.rto * 100) / 100, qty: Math.round(values.qty * 100) / 100 }))
    .sort((a, b) => b.rto - a.rto)
    .slice(0, limit);
}

export function getTopProductsFromSession(
  markets: string[],
  categories: string[],
  years: number[],
  packageTypes: string[],
  sourceFiles: string[] = [],
  limit: number = 10,
  filtersOrColumn?: DynamicFilter[] | string,
  filterValue?: string
): { product: string; rto: number; qty: number }[] {
  let data = getFilteredDataFromSession(markets, categories, years, packageTypes, sourceFiles);
  
  // Handle both old and new filter formats
  let filters: DynamicFilter[] = [];
  if (Array.isArray(filtersOrColumn)) {
    filters = filtersOrColumn;
  } else if (filtersOrColumn && filterValue) {
    filters = [{ column: filtersOrColumn, values: [filterValue] }];
  }
  
  // Apply dynamic filters
  data = applyDynamicFilters(data, filters);
  
  const productMap = new Map<string, { rto: number; qty: number }>();
  
  data.forEach((row) => {
    const current = productMap.get(row.PRODUCT) || { rto: 0, qty: 0 };
    productMap.set(row.PRODUCT, { rto: current.rto + row.RTO, qty: current.qty + row.QTY });
  });
  
  return Array.from(productMap.entries())
    .map(([product, values]) => ({ product, rto: Math.round(values.rto * 100) / 100, qty: Math.round(values.qty * 100) / 100 }))
    .sort((a, b) => b.rto - a.rto)
    .slice(0, limit);
}

export function getTopWeightsFromSession(
  markets: string[],
  categories: string[],
  years: number[],
  packageTypes: string[],
  sourceFiles: string[] = [],
  limit: number = 5,
  filtersOrColumn?: DynamicFilter[] | string,
  filterValue?: string
): { weight: string; rto: number; qty: number }[] {
  let data = getFilteredDataFromSession(markets, categories, years, packageTypes, sourceFiles);
  
  // Handle both old and new filter formats
  let filters: DynamicFilter[] = [];
  if (Array.isArray(filtersOrColumn)) {
    filters = filtersOrColumn;
  } else if (filtersOrColumn && filterValue) {
    filters = [{ column: filtersOrColumn, values: [filterValue] }];
  }
  
  // Apply dynamic filters
  data = applyDynamicFilters(data, filters);
  
  // Use string weight from Excel instead of parsed number
  const weightMap = new Map<string, { rto: number; qty: number }>();
  
  data.forEach((row) => {
    const weightStr = row.ITEM_WEIGHT_STR || String(row.ITEM_WEIGHT_ACTUAL);
    if (!weightStr) return;
    const current = weightMap.get(weightStr) || { rto: 0, qty: 0 };
    weightMap.set(weightStr, { rto: current.rto + row.RTO, qty: current.qty + row.QTY });
  });
  
  return Array.from(weightMap.entries())
    .map(([weight, values]) => ({ weight, rto: Math.round(values.rto * 100) / 100, qty: Math.round(values.qty * 100) / 100 }))
    .sort((a, b) => b.rto - a.rto)
    .slice(0, limit);
}

export function getTopVariantsFromSession(
  markets: string[],
  categories: string[],
  years: number[],
  packageTypes: string[],
  sourceFiles: string[] = [],
  limit: number = 10,
  filtersOrColumn?: DynamicFilter[] | string,
  filterValue?: string
): { variant: string; rto: number; qty: number }[] {
  let data = getFilteredDataFromSession(markets, categories, years, packageTypes, sourceFiles);
  
  // Handle both old and new filter formats
  let filters: DynamicFilter[] = [];
  if (Array.isArray(filtersOrColumn)) {
    filters = filtersOrColumn;
  } else if (filtersOrColumn && filterValue) {
    filters = [{ column: filtersOrColumn, values: [filterValue] }];
  }
  
  // Apply dynamic filters
  data = applyDynamicFilters(data, filters);
  
  const variantMap = new Map<string, { rto: number; qty: number }>();
  
  data.forEach((row) => {
    if (row.VARIANT && row.VARIANT !== 'WITHOUT VARIANT (SUB-BRAND)' && row.VARIANT !== '') {
      const current = variantMap.get(row.VARIANT) || { rto: 0, qty: 0 };
      variantMap.set(row.VARIANT, { rto: current.rto + row.RTO, qty: current.qty + row.QTY });
    }
  });
  
  return Array.from(variantMap.entries())
    .map(([variant, values]) => ({ variant, rto: Math.round(values.rto * 100) / 100, qty: Math.round(values.qty * 100) / 100 }))
    .sort((a, b) => b.rto - a.rto)
    .slice(0, limit);
}

// Get all available column names dynamically from loaded Excel files
// Excludes: MARKET, PRODUCT, BRAND, MANUFACTURER, RTO, QTY
export function getAvailableColumns(): string[] {
  const session = getSession();
  if (!session.sessionRawColumns || session.sessionRawColumns.length === 0) {
    return [];
  }
  
  // Filter out excluded columns
  const filteredColumns = session.sessionRawColumns.filter(col => {
    const colUpper = col.toUpperCase();
    // Exclude specific columns
    if (EXCLUDED_FILTER_COLUMNS.some(excluded => 
      colUpper === excluded.toUpperCase() || col === excluded
    )) {
      return false;
    }
    return true;
  });
  
  return filteredColumns;
}

// Get unique values for a specific column from raw Excel data
export function getUniqueColumnValues(
  columnName: string,
  categories: string[]
): string[] {
  // Use raw data to get actual column values
  const session = getSession();
  if (!session.sessionRawData || session.sessionRawData.length === 0) {
    return [];
  }
  
  const values = new Set<string>();
  
  // Directly access the column from raw data
  session.sessionRawData.forEach((row) => {
    const value = row[columnName];
    if (value !== undefined && value !== null && String(value) !== '') {
      values.add(String(value));
    }
  });
  
  return Array.from(values).sort();
}
