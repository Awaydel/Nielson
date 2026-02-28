import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

let dataCache: Map<string, NielsenDataRow[]> | null = null;

export function clearCache(): void {
  dataCache = null;
}

export interface NielsenDataRow {
  MARKET: string;
  PRODUCT: string;
  MANUFACTURER: string;
  BRAND: string;
  VARIANT: string;
  PACKAGE_TYPE: string;
  ITEM_WEIGHT_ACTUAL: number;
  WEIGHT_2: number;
  ITEM: string;
  PERIOD: string;
  YEAR: number;
  RTO: number;
  QTY: number;
  CATEGORY: string;
  SEGMENT?: string;
}

export interface CategoryConfig {
  name: string;
  file: string;
  variantColumn: string;
  segmentColumn?: string;
  segmentValues?: string[]; // Segment values to include
}

export const CATEGORIES: CategoryConfig[] = [
  // Масло/Маргарин split by DETAILED SEGMENT
  { 
    name: 'Масло', 
    file: 'Масло_маргарин.xlsx', 
    variantColumn: 'VARIANT',
    segmentColumn: 'DETAILED SEGMENT',
    segmentValues: ['BUTTER']  // Only BUTTER, not MELTED BUTTER
  },
  { 
    name: 'Спред', 
    file: 'Масло_маргарин.xlsx', 
    variantColumn: 'VARIANT',
    segmentColumn: 'SEGMENT',
    segmentValues: ['SPREAD (INC. MELTED)']
  },
  { 
    name: 'Маргарин', 
    file: 'Масло_маргарин.xlsx', 
    variantColumn: 'VARIANT',
    segmentColumn: 'SEGMENT',
    segmentValues: ['MARGARINE (INC. MELTED)']
  },
  // Other categories
  { name: 'Пастер. молоко', file: 'Пастер_молоко.xlsx', variantColumn: 'VARIANT (SUB-BRAND)' },
  { name: 'Растительное', file: 'Растительное.xlsx', variantColumn: 'VARIANT (SUB-BRAND)' },
  { name: 'Сливки', file: 'Сливки.xlsx', variantColumn: 'VARIANT (SUB-BRAND)' },
  { name: 'Стерил. молоко', file: 'Стерил_молоко.xlsx', variantColumn: 'VARIANT (SUB-BRAND)' },
];

function parseExcelFile(filePath: string): any[] {
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return data;
}

export async function loadAllData(): Promise<Map<string, NielsenDataRow[]>> {
  if (dataCache) return dataCache;
  
  dataCache = new Map();
  const uploadDir = path.join(process.cwd(), 'upload');
  
  // Track which files have been loaded to avoid re-reading
  const fileCache = new Map<string, any[]>();
  
  for (const category of CATEGORIES) {
    const filePath = path.join(uploadDir, category.file);
    if (!fs.existsSync(filePath)) continue;
    
    try {
      // Load file data if not already loaded
      let rawData: any[];
      if (fileCache.has(category.file)) {
        rawData = fileCache.get(category.file)!;
      } else {
        rawData = parseExcelFile(filePath);
        fileCache.set(category.file, rawData);
      }
      
      // Filter and process data for this category
      const processedData: NielsenDataRow[] = [];
      
      for (const row of rawData) {
        const segment = category.segmentColumn ? String(row[category.segmentColumn] || '') : '';
        
        // If category has segmentValues filter, apply it
        if (category.segmentValues && category.segmentColumn) {
          if (!category.segmentValues.includes(segment)) {
            continue; // Skip rows that don't match segment values
          }
        }
        
        processedData.push({
          MARKET: String(row['MARKET'] || ''),
          PRODUCT: String(row['PRODUCT'] || ''),
          MANUFACTURER: String(row['MANUFACTURER'] || ''),
          BRAND: String(row['BRAND'] || ''),
          VARIANT: String(row[category.variantColumn] || ''),
          PACKAGE_TYPE: String(row['PACKAGE TYPE'] || ''),
          ITEM_WEIGHT_ACTUAL: parseFloat(String(row['ITEM WEIGHT ACTUAL'])) || 0,
          WEIGHT_2: parseFloat(String(row['WEIGHT 2'])) || 0,
          ITEM: String(row['ITEM'] || ''),
          PERIOD: String(row['PERIOD'] || ''),
          YEAR: parseInt(String(row['YEAR'])) || 0,
          RTO: parseFloat(String(row['Продажи в деньгах (1000 руб)'])) || 0,
          QTY: parseFloat(String(row['Продажи в нат. выражении (1000 кг/л/шт)'])) || 0,
          CATEGORY: category.name,
          SEGMENT: segment,
        });
      }
      
      // Merge with existing data if category already exists
      if (dataCache.has(category.name)) {
        const existing = dataCache.get(category.name)!;
        dataCache.set(category.name, [...existing, ...processedData]);
      } else {
        dataCache.set(category.name, processedData);
      }
    } catch (error) {
      console.error(`Error loading ${category.file}:`, error);
      if (!dataCache.has(category.name)) {
        dataCache.set(category.name, []);
      }
    }
  }
  
  return dataCache;
}

// Get all unique values for filters (dynamic with multi-select support)
export async function getFilterOptions(
  years?: number[],
  packageTypes?: string[],
  markets?: string[],
  categories?: string[]
): Promise<{
  years: number[];
  packageTypes: string[];
  markets: string[];
  categories: string[];
}> {
  const allData = await loadAllData();
  let result: NielsenDataRow[] = [];
  
  allData.forEach((rows) => { result = result.concat(rows); });
  
  // Apply filters progressively (multi-select)
  if (years && years.length > 0) result = result.filter(r => years.includes(r.YEAR));
  if (packageTypes && packageTypes.length > 0) result = result.filter(r => packageTypes.includes(r.PACKAGE_TYPE));
  if (markets && markets.length > 0) result = result.filter(r => markets.includes(r.MARKET));
  if (categories && categories.length > 0) result = result.filter(r => categories.includes(r.CATEGORY));
  
  const yearsSet = new Set<number>();
  const packageTypesSet = new Set<string>();
  const marketsSet = new Set<string>();
  const categoriesSet = new Set<string>();
  
  result.forEach(r => {
    if (r.YEAR) yearsSet.add(r.YEAR);
    if (r.PACKAGE_TYPE) packageTypesSet.add(r.PACKAGE_TYPE);
    if (r.MARKET) marketsSet.add(r.MARKET);
    if (r.CATEGORY) categoriesSet.add(r.CATEGORY);
  });
  
  return {
    years: Array.from(yearsSet).sort((a, b) => b - a),
    packageTypes: Array.from(packageTypesSet).sort(),
    markets: Array.from(marketsSet).sort(),
    categories: Array.from(categoriesSet).sort(),
  };
}

// Filter data with multi-select support
export async function getFilteredData(
  markets: string[],
  categories: string[],
  years: number[],
  packageTypes: string[]
): Promise<NielsenDataRow[]> {
  const allData = await loadAllData();
  let result: NielsenDataRow[] = [];
  
  if (categories && categories.length > 0) {
    for (const cat of categories) {
      if (allData.has(cat)) {
        result = result.concat(allData.get(cat) || []);
      }
    }
  } else {
    allData.forEach((rows) => { result = result.concat(rows); });
  }
  
  return result.filter((row) => {
    if (markets.length > 0 && !markets.includes(row.MARKET)) return false;
    if (years.length > 0 && !years.includes(row.YEAR)) return false;
    if (packageTypes.length > 0 && !packageTypes.includes(row.PACKAGE_TYPE)) return false;
    return true;
  });
}

export async function getTopBrands(
  markets: string[], 
  categories: string[], 
  years: number[], 
  packageTypes: string[], 
  limit: number = 10
): Promise<{brand: string; rto: number; qty: number}[]> {
  const data = await getFilteredData(markets, categories, years, packageTypes);
  const brandMap = new Map<string, { rto: number; qty: number }>();
  data.forEach((row) => {
    const current = brandMap.get(row.BRAND) || { rto: 0, qty: 0 };
    brandMap.set(row.BRAND, { rto: current.rto + row.RTO, qty: current.qty + row.QTY });
  });
  return Array.from(brandMap.entries())
    .map(([brand, values]) => ({ brand, rto: Math.round(values.rto * 100) / 100, qty: Math.round(values.qty * 100) / 100 }))
    .sort((a, b) => b.rto - a.rto).slice(0, limit);
}

export async function getTopProducts(
  markets: string[], 
  categories: string[], 
  years: number[], 
  packageTypes: string[], 
  limit: number = 10
): Promise<{product: string; rto: number; qty: number}[]> {
  const data = await getFilteredData(markets, categories, years, packageTypes);
  const productMap = new Map<string, { rto: number; qty: number }>();
  data.forEach((row) => {
    const current = productMap.get(row.PRODUCT) || { rto: 0, qty: 0 };
    productMap.set(row.PRODUCT, { rto: current.rto + row.RTO, qty: current.qty + row.QTY });
  });
  return Array.from(productMap.entries())
    .map(([product, values]) => ({ product, rto: Math.round(values.rto * 100) / 100, qty: Math.round(values.qty * 100) / 100 }))
    .sort((a, b) => b.rto - a.rto).slice(0, limit);
}

export async function getTopWeights(
  markets: string[], 
  categories: string[], 
  years: number[], 
  packageTypes: string[], 
  limit: number = 5
): Promise<{weight: number; rto: number; qty: number}[]> {
  const data = await getFilteredData(markets, categories, years, packageTypes);
  const weightMap = new Map<number, { rto: number; qty: number }>();
  data.forEach((row) => {
    const current = weightMap.get(row.ITEM_WEIGHT_ACTUAL) || { rto: 0, qty: 0 };
    weightMap.set(row.ITEM_WEIGHT_ACTUAL, { rto: current.rto + row.RTO, qty: current.qty + row.QTY });
  });
  return Array.from(weightMap.entries())
    .map(([weight, values]) => ({ weight, rto: Math.round(values.rto * 100) / 100, qty: Math.round(values.qty * 100) / 100 }))
    .sort((a, b) => b.rto - a.rto).slice(0, limit);
}

export async function getTopVariants(
  markets: string[], 
  categories: string[], 
  years: number[], 
  packageTypes: string[], 
  limit: number = 10
): Promise<{variant: string; rto: number; qty: number}[]> {
  const data = await getFilteredData(markets, categories, years, packageTypes);
  const variantMap = new Map<string, { rto: number; qty: number }>();
  data.forEach((row) => {
    if (row.VARIANT && row.VARIANT !== 'WITHOUT VARIANT (SUB-BRAND)' && row.VARIANT !== '') {
      const current = variantMap.get(row.VARIANT) || { rto: 0, qty: 0 };
      variantMap.set(row.VARIANT, { rto: current.rto + row.RTO, qty: current.qty + row.QTY });
    }
  });
  return Array.from(variantMap.entries())
    .map(([variant, values]) => ({ variant, rto: Math.round(values.rto * 100) / 100, qty: Math.round(values.qty * 100) / 100 }))
    .sort((a, b) => b.rto - a.rto).slice(0, limit);
}

export async function getYearComparison(markets: string[]): Promise<{category: string; rto2024: number; qty2024: number; rto2025: number; qty2025: number; rtoDynamics: number; qtyDynamics: number; rtoShare: number}[]> {
  const allData = await loadAllData();
  const results: {category: string; rto2024: number; qty2024: number; rto2025: number; qty2025: number; rtoDynamics: number; qtyDynamics: number; rtoShare: number}[] = [];
  
  for (const category of CATEGORIES) {
    const rows = allData.get(category.name) || [];
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
    results.push({ category: category.name, rto2024: Math.round(rto2024 * 100) / 100, qty2024: Math.round(qty2024 * 100) / 100, rto2025: Math.round(rto2025 * 100) / 100, qty2025: Math.round(qty2025 * 100) / 100, rtoDynamics, qtyDynamics, rtoShare: 0 });
  }
  const totalRto2025 = results.reduce((sum, r) => sum + r.rto2025, 0);
  results.forEach(r => { r.rtoShare = totalRto2025 > 0 ? Math.round((r.rto2025 / totalRto2025) * 10000) / 100 : 0; });
  return results;
}

// Export data for Excel download
export async function getExportData(
  markets: string[],
  categories: string[],
  years: number[],
  packageTypes: string[]
): Promise<{
  brands: {rank: number; brand: string; rto: number; qty: number}[];
  products: {rank: number; product: string; rto: number; qty: number}[];
  weights: {rank: number; weight: number; rto: number; qty: number}[];
  variants: {rank: number; variant: string; rto: number; qty: number}[];
  comparison: {category: string; rto2024: number; qty2024: number; rto2025: number; qty2025: number; rtoDynamics: number; qtyDynamics: number; rtoShare: number}[];
}> {
  const [brands, products, weights, variants, comparison] = await Promise.all([
    getTopBrands(markets, categories, years, packageTypes, 10),
    getTopProducts(markets, categories, years, packageTypes, 10),
    getTopWeights(markets, categories, years, packageTypes, 5),
    getTopVariants(markets, categories, years, packageTypes, 10),
    getYearComparison(markets),
  ]);
  
  return {
    brands: brands.map((b, i) => ({ rank: i + 1, ...b })),
    products: products.map((p, i) => ({ rank: i + 1, ...p })),
    weights: weights.map((w, i) => ({ rank: i + 1, ...w })),
    variants: variants.map((v, i) => ({ rank: i + 1, ...v })),
    comparison,
  };
}

export function getCategoryNames(): string[] {
  return CATEGORIES.map(c => c.name);
}
