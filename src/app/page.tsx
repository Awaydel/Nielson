'use client'
// Nielsen Analytics Dashboard - v5

import { useState, useEffect, useCallback, useTransition, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { BarChart3, Package, Scale, Flame, Calendar, Store, Tag, TrendingUp, PieChart, Layers, Pencil, Check, X, Download, Upload, FileSpreadsheet, Trash2, AlertCircle, ArrowRightLeft, Camera } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell } from 'recharts';
import { MultiSelectFilter } from '@/components/multi-select-filter';
import { domToPng } from 'modern-screenshot';

interface FilterOptions {
  years: number[];
  packageTypes: string[];
  markets: string[];
  categories: string[];
  sourceFiles: string[];
}

interface TopBrand { brand: string; rto: number; qty: number; }
interface TopProduct { product: string; rto: number; qty: number; }
interface TopWeight { weight: string; rto: number; qty: number; }
interface TopVariant { variant: string; rto: number; qty: number; }
interface YearComparison { category: string; rto2024: number; qty2024: number; rto2025: number; qty2025: number; rtoDynamics: number; qtyDynamics: number; rtoShare: number; }

// Dynamic filter for saved comparison
interface DynamicFilterSaved {
  column: string;
  values: string[];
}

// Saved comparison slice
interface SavedComparison {
  id: string;
  name: string;
  markets: string[];
  categories: string[];
  years: number[];
  packageTypes: string[];
  sourceFiles: string[];
  filters: DynamicFilterSaved[]; // Multiple filters
  rto2024: number;
  qty2024: number;
  rto2025: number;
  qty2025: number;
  rtoDynamics: number;
  qtyDynamics: number;
  color: string;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
const MARKET_COLORS = ['#3b82f6', '#f97316']; // Синий для Рынок, оранжевый для Победа

function EditableVariantName({ 
  originalName, 
  customName, 
  onRename 
}: { 
  originalName: string; 
  customName: string;
  onRename: (originalName: string, newName: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(customName);

  useEffect(() => {
    setEditValue(customName);
  }, [customName]);

  const handleSave = () => {
    onRename(originalName, editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(customName);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="h-7 text-sm w-40"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={handleSave}>
          <Check className="h-3 w-3 text-emerald-600" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={handleCancel}>
          <X className="h-3 w-3 text-red-600" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 group cursor-pointer" onClick={() => setIsEditing(true)}>
      <Badge variant="secondary" className="cursor-pointer">{customName}</Badge>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
    </div>
  );
}

function FileUploadScreen({ onUploadSuccess }: { onUploadSuccess: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Process files one by one to avoid timeout issues
  const processFiles = async (files: FileList | File[]) => {
    setIsUploading(true);
    setUploadProgress(0);
    setErrors([]);
    setUploadedFiles([]);
    setTotalRows(0);
    
    const fileArray = Array.from(files);
    
    // Filter only Excel files
    const excelFiles = fileArray.filter(file => 
      file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    );

    if (excelFiles.length === 0) {
      setErrors(['Не найдено Excel файлов. Загрузите файлы с расширением .xlsx или .xls']);
      setIsUploading(false);
      return;
    }

    // Process files ONE BY ONE to avoid memory/timeout issues with large files
    let isFirstFile = true;
    let allRows = 0;
    const uploadedFileNames: string[] = [];
    const totalFiles = excelFiles.length;

    for (let fileIndex = 0; fileIndex < excelFiles.length; fileIndex++) {
      const file = excelFiles[fileIndex];
      const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
      
      setUploadStatus(`Загрузка файла ${fileIndex + 1}/${totalFiles}: ${file.name} (${fileSizeMB} MB)`);
      setUploadProgress(Math.round((fileIndex / totalFiles) * 90));

      const formData = new FormData();
      formData.append('files', file);

      try {
        // Use AbortController with 15 minute timeout for large files
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15 * 60 * 1000);
        
        const method = isFirstFile ? 'POST' : 'PUT'; // POST clears data, PUT appends
        
        const response = await fetch('/api/upload', {
          method,
          body: formData,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        // Check if response is OK before parsing JSON
        if (!response.ok) {
          const text = await response.text();
          let errorMsg = `HTTP ошибка ${response.status}`;
          try {
            const jsonErr = JSON.parse(text);
            errorMsg = jsonErr.error || jsonErr.details || errorMsg;
          } catch {
            // Not JSON, use status text
            errorMsg = response.statusText || errorMsg;
          }
          setErrors(prev => [...prev, `${file.name}: ${errorMsg}`]);
          isFirstFile = false;
          continue;
        }

        // Parse JSON response
        const text = await response.text();
        let result;
        try {
          result = JSON.parse(text);
        } catch (parseError) {
          setErrors(prev => [...prev, `${file.name}: Ошибка разбора ответа сервера`]);
          isFirstFile = false;
          continue;
        }

        if (result.success) {
          allRows = result.totalRows || 0;
          setTotalRows(allRows);
          uploadedFileNames.push(file.name);
          setUploadedFiles([...uploadedFileNames]);
          
          if (result.errors && result.errors.length > 0) {
            setErrors(prev => [...prev, ...result.errors]);
          }
        } else {
          const errorMsg = result.isMemoryError 
            ? 'Недостаточно памяти. Попробуйте загрузить файлы меньшего размера.'
            : (result.error || 'Ошибка загрузки');
          setErrors(prev => [...prev, `${file.name}: ${errorMsg}`]);
        }
        
        isFirstFile = false;
        
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          setErrors(prev => [...prev, `${file.name}: Превышено время ожидания (15 мин)`]);
        } else {
          setErrors(prev => [...prev, `${file.name}: ${error instanceof Error ? error.message : 'Ошибка соединения'}`]);
        }
        isFirstFile = false;
      }
      
      // Small delay between files to let the system breathe
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setUploadProgress(100);
    setUploadStatus(`Готово! Загружено ${allRows.toLocaleString('ru-RU')} строк из ${uploadedFileNames.length} файл(ов)`);
    
    if (uploadedFileNames.length > 0) {
      setTimeout(() => {
        onUploadSuccess();
      }, 1500);
    } else {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl bg-white shadow-lg">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-2">
            <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
            Nielsen Analytics
          </CardTitle>
          <p className="text-gray-500 mt-2">Загрузите Excel файлы Nielsen для анализа</p>
        </CardHeader>
        <CardContent className="pt-4">
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-all cursor-pointer
              ${isDragging 
                ? 'border-emerald-500 bg-emerald-50' 
                : 'border-gray-300 hover:border-emerald-400 hover:bg-gray-50'
              }
              ${isUploading ? 'pointer-events-none opacity-70' : ''}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileSelect}
            />

            {isUploading ? (
              <div className="space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
                <p className="text-gray-600">{uploadStatus}</p>
                <Progress value={uploadProgress} className="h-2 w-64 mx-auto" />
                
                {uploadedFiles.length > 0 && (
                  <div className="text-left mt-4 bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                    <p className="text-sm font-medium text-gray-700 mb-2">Загружено файлов: {uploadedFiles.length}</p>
                    <div className="space-y-1">
                      {uploadedFiles.map((file, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-emerald-600">
                          <Check className="h-4 w-4" />
                          <span className="truncate">{file}</span>
                        </div>
                      ))}
                    </div>
                    {totalRows > 0 && (
                      <p className="text-sm text-gray-600 mt-2 pt-2 border-t">
                        Всего строк: {totalRows.toLocaleString('ru-RU')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <Upload className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-700 mb-2">
                  Перетащите Excel файлы сюда
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  или кликните для выбора файлов
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <Badge variant="secondary" className="text-xs">
                    .xlsx, .xls
                  </Badge>
                  <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">
                    Можно загружать много файлов
                  </Badge>
                </div>
              </>
            )}
          </div>

          {errors.length > 0 && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-red-800 mb-1">Предупреждения:</p>
                  <ul className="text-sm text-red-700 list-disc list-inside max-h-32 overflow-y-auto">
                    {errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-700 mb-2">Автоматическое определение:</p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Категории по колонкам SEGMENT и DETAILED SEGMENT</li>
              <li>• Разделение Масло/Спред/Маргарин по сегментам</li>
              <li>• Колонки VARIANT, VARIANT (SUB-BRAND)</li>
              <li>• Данные по годам, маркам, продуктам</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Home() {
  const [hasData, setHasData] = useState(false);
  const [isCheckingData, setIsCheckingData] = useState(true);
  
  const [allFilters, setAllFilters] = useState<FilterOptions>({ years: [], packageTypes: [], markets: [], categories: [], sourceFiles: [] });
  
  // Multi-select filter state
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [selectedPackageTypes, setSelectedPackageTypes] = useState<string[]>([]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSourceFiles, setSelectedSourceFiles] = useState<string[]>([]);
  
  // Dynamic filter options based on previous selections
  const [packageTypeOptions, setPackageTypeOptions] = useState<string[]>([]);
  const [marketOptions, setMarketOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [sourceFileOptions, setSourceFileOptions] = useState<string[]>([]);
  
  const [initialLoading, setInitialLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  
  const [brands, setBrands] = useState<TopBrand[]>([]);
  const [products, setProducts] = useState<TopProduct[]>([]);
  const [weights, setWeights] = useState<TopWeight[]>([]);
  const [variants, setVariants] = useState<TopVariant[]>([]);
  const [variantRenames, setVariantRenames] = useState<Record<string, string>>({});
  const [comparison, setComparison] = useState<YearComparison[]>([]);
  const [categoryRenames, setCategoryRenames] = useState<Record<string, string>>({});
  
  // Saved comparisons for year comparison tab
  const [savedComparisons, setSavedComparisons] = useState<SavedComparison[]>([]);
  const [newComparisonName, setNewComparisonName] = useState('');
  
  // Colors for comparison rows
  const COMPARISON_COLORS = [
    '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1'
  ];
  
  // Market comparison state for charts tab
  const [compareMarket1, setCompareMarket1] = useState<string>('');
  const [compareMarket2, setCompareMarket2] = useState<string>('');
  const [marketCompareData, setMarketCompareData] = useState<{
    brands: { name: string; market1: number; market2: number }[];
    products: { name: string; fullName: string; market1: number; market2: number }[];
  }>({ brands: [], products: [] });
  
  // Dynamic column filter state (3 filters)
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  
  // Filter 1
  const [selectedColumn1, setSelectedColumn1] = useState<string>('');
  const [columnValues1, setColumnValues1] = useState<string[]>([]);
  const [selectedColumnValues1, setSelectedColumnValues1] = useState<string[]>([]);
  
  // Filter 2
  const [selectedColumn2, setSelectedColumn2] = useState<string>('');
  const [columnValues2, setColumnValues2] = useState<string[]>([]);
  const [selectedColumnValues2, setSelectedColumnValues2] = useState<string[]>([]);
  
  // Filter 3
  const [selectedColumn3, setSelectedColumn3] = useState<string>('');
  const [columnValues3, setColumnValues3] = useState<string[]>([]);
  const [selectedColumnValues3, setSelectedColumnValues3] = useState<string[]>([]);
  
  // Refs for screenshot functionality
  const brandTableRef = useRef<HTMLDivElement>(null);
  const productTableRef = useRef<HTMLDivElement>(null);
  const weightTableRef = useRef<HTMLDivElement>(null);
  const variantTableRef = useRef<HTMLDivElement>(null);
  
  // Refs for charts screenshot
  const brandChartRef = useRef<HTMLDivElement>(null);
  const skuChartRef = useRef<HTMLDivElement>(null);
  
  // Screenshot function for single table
  const captureTable = useCallback(async (ref: React.RefObject<HTMLDivElement | null>, tableName: string) => {
    if (!ref.current) return;
    
    try {
      const dataUrl = await domToPng(ref.current, {
        scale: 2,
        backgroundColor: '#ffffff',
      });
      
      const link = document.createElement('a');
      link.download = `${tableName}_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Screenshot error:', error);
    }
  }, []);
  
  // Screenshot function for all 4 tables combined
  const captureAllTables = useCallback(async () => {
    const refs = [
      { ref: brandTableRef, name: 'Бренды' },
      { ref: productTableRef, name: 'Продукты' },
      { ref: weightTableRef, name: 'Вес' },
      { ref: variantTableRef, name: 'Тип' },
    ];
    
    try {
      // Create screenshots for each table
      const dataUrls: string[] = [];
      
      for (const { ref } of refs) {
        if (ref.current) {
          const dataUrl = await domToPng(ref.current, {
            scale: 2,
            backgroundColor: '#ffffff',
          });
          dataUrls.push(dataUrl);
        }
      }
      
      if (dataUrls.length === 0) return;
      
      // Load all images and combine them
      const images = await Promise.all(
        dataUrls.map(url => {
          return new Promise<HTMLImageElement>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = url;
          });
        })
      );
      
      // Calculate combined canvas size (2x2 grid)
      const maxWidth = Math.max(images[0].width, images[1].width, images[2].width, images[3].width);
      const rowHeight1 = Math.max(images[0].height, images[1].height);
      const rowHeight2 = Math.max(images[2].height, images[3].height);
      
      const combinedCanvas = document.createElement('canvas');
      combinedCanvas.width = maxWidth * 2;
      combinedCanvas.height = rowHeight1 + rowHeight2;
      
      const ctx = combinedCanvas.getContext('2d');
      if (!ctx) return;
      
      // Fill white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);
      
      // Draw images in 2x2 grid
      ctx.drawImage(images[0], 0, 0);
      ctx.drawImage(images[1], maxWidth, 0);
      ctx.drawImage(images[2], 0, rowHeight1);
      ctx.drawImage(images[3], maxWidth, rowHeight1);
      
      // Download
      const link = document.createElement('a');
      link.download = `Топ_показатели_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = combinedCanvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Screenshot error:', error);
    }
  }, []);
  
  // Screenshot function for charts (2 charts vertically)
  const captureAllCharts = useCallback(async () => {
    const refs = [
      { ref: brandChartRef, name: 'Brand' },
      { ref: skuChartRef, name: 'SKU' },
    ];
    
    try {
      // Create screenshots for each chart
      const dataUrls: string[] = [];
      
      for (const { ref } of refs) {
        if (ref.current) {
          const dataUrl = await domToPng(ref.current, {
            scale: 2,
            backgroundColor: '#ffffff',
          });
          dataUrls.push(dataUrl);
        }
      }
      
      if (dataUrls.length === 0) return;
      
      // Load all images and combine them vertically
      const images = await Promise.all(
        dataUrls.map(url => {
          return new Promise<HTMLImageElement>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = url;
          });
        })
      );
      
      // Calculate combined canvas size (vertical stack)
      const maxWidth = Math.max(images[0].width, images[1].width);
      const totalHeight = images[0].height + images[1].height;
      
      const combinedCanvas = document.createElement('canvas');
      combinedCanvas.width = maxWidth;
      combinedCanvas.height = totalHeight;
      
      const ctx = combinedCanvas.getContext('2d');
      if (!ctx) return;
      
      // Fill white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);
      
      // Draw images vertically
      ctx.drawImage(images[0], 0, 0);
      ctx.drawImage(images[1], 0, images[0].height);
      
      // Download
      const link = document.createElement('a');
      link.download = `Диаграммы_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = combinedCanvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Screenshot error:', error);
    }
  }, []);

  // Check if data is loaded on mount
  useEffect(() => {
    let mounted = true;
    
    const checkData = async () => {
      try {
        const response = await fetch('/api/upload');
        const data = await response.json();
        if (mounted) {
          setHasData(data.hasData);
        }
      } catch {
        if (mounted) {
          setHasData(false);
        }
      }
      if (mounted) {
        setIsCheckingData(false);
      }
    };
    
    checkData();
    
    return () => { mounted = false; };
  }, []);

  // Build filter URL
  const buildFilterUrl = useCallback((years: number[], packageTypes: string[], markets: string[], categories: string[], sourceFiles: string[] = []) => {
    const params = new URLSearchParams();
    if (years.length > 0) params.set('years', years.join(','));
    if (packageTypes.length > 0) params.set('packageTypes', packageTypes.join(','));
    if (markets.length > 0) params.set('markets', encodeURIComponent(markets.join('|||')));
    if (categories.length > 0) params.set('categories', encodeURIComponent(categories.join('|||')));
    if (sourceFiles.length > 0) params.set('sourceFiles', encodeURIComponent(sourceFiles.join('|||')));
    const queryString = params.toString();
    return `/api/nielsen/filters${queryString ? `?${queryString}` : ''}`;
  }, []);

  // Load initial filter options
  useEffect(() => {
    if (!hasData) return;
    
    let mounted = true;
    
    fetch('/api/nielsen/filters')
      .then(res => res.json())
      .then(data => {
        if (mounted) {
          setAllFilters(data);
          setPackageTypeOptions(data.packageTypes || []);
          setMarketOptions(data.markets || []);
          setCategoryOptions(data.categories || []);
          setSourceFileOptions(data.sourceFiles || []);
          setInitialLoading(false);
        }
      })
      .catch(err => {
        if (mounted) {
          console.error('Error loading filters:', err);
          setInitialLoading(false);
        }
      });
    
    // Load available columns for dynamic filter
    fetch('/api/nielsen/column-values')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch columns');
        return res.json();
      })
      .then(data => {
        if (mounted) {
          setAvailableColumns(data.columns || []);
        }
      })
      .catch(() => {
        if (mounted) {
          setAvailableColumns([]);
        }
      });
    
    return () => { mounted = false; };
  }, [hasData]);

  // Load column values when columns are selected (for each filter)
  useEffect(() => {
    if (!hasData || !selectedColumn1) {
      return;
    }
    
    let mounted = true;
    
    const params = new URLSearchParams();
    params.set('column', selectedColumn1);
    if (selectedCategories.length > 0) {
      params.set('categories', encodeURIComponent(selectedCategories.join('|||')));
    }
    
    fetch(`/api/nielsen/column-values?${params.toString()}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch column values');
        return res.json();
      })
      .then(data => {
        if (mounted) {
          setColumnValues1(data.values || []);
          setSelectedColumnValues1([]);
        }
      })
      .catch(() => {
        if (mounted) {
          setColumnValues1([]);
        }
      });
    
    return () => { mounted = false; };
  }, [selectedColumn1, selectedCategories, hasData]);

  useEffect(() => {
    if (!hasData || !selectedColumn2) {
      return;
    }
    
    let mounted = true;
    
    const params = new URLSearchParams();
    params.set('column', selectedColumn2);
    if (selectedCategories.length > 0) {
      params.set('categories', encodeURIComponent(selectedCategories.join('|||')));
    }
    
    fetch(`/api/nielsen/column-values?${params.toString()}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch column values');
        return res.json();
      })
      .then(data => {
        if (mounted) {
          setColumnValues2(data.values || []);
          setSelectedColumnValues2([]);
        }
      })
      .catch(() => {
        if (mounted) {
          setColumnValues2([]);
        }
      });
    
    return () => { mounted = false; };
  }, [selectedColumn2, selectedCategories, hasData]);

  useEffect(() => {
    if (!hasData || !selectedColumn3) {
      return;
    }
    
    let mounted = true;
    
    const params = new URLSearchParams();
    params.set('column', selectedColumn3);
    if (selectedCategories.length > 0) {
      params.set('categories', encodeURIComponent(selectedCategories.join('|||')));
    }
    
    fetch(`/api/nielsen/column-values?${params.toString()}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch column values');
        return res.json();
      })
      .then(data => {
        if (mounted) {
          setColumnValues3(data.values || []);
          setSelectedColumnValues3([]);
        }
      })
      .catch(() => {
        if (mounted) {
          setColumnValues3([]);
        }
      });
    
    return () => { mounted = false; };
  }, [selectedColumn3, selectedCategories, hasData]);

  // Update package types when years change
  useEffect(() => {
    if (!hasData) return;
    fetch(buildFilterUrl(selectedYears, [], [], [], selectedSourceFiles))
      .then(res => res.json())
      .then(data => {
        setPackageTypeOptions(data.packageTypes || []);
        setSelectedPackageTypes(prev => prev.filter(pt => (data.packageTypes || []).includes(pt)));
      });
  }, [selectedYears, selectedSourceFiles, buildFilterUrl, hasData]);

  // Update markets when years/packageTypes change
  useEffect(() => {
    if (!hasData) return;
    fetch(buildFilterUrl(selectedYears, selectedPackageTypes, [], [], selectedSourceFiles))
      .then(res => res.json())
      .then(data => {
        setMarketOptions(data.markets || []);
        setSelectedMarkets(prev => prev.filter(m => (data.markets || []).includes(m)));
      });
  }, [selectedYears, selectedPackageTypes, selectedSourceFiles, buildFilterUrl, hasData]);

  // Update categories when years/packageTypes/markets change
  useEffect(() => {
    if (!hasData) return;
    fetch(buildFilterUrl(selectedYears, selectedPackageTypes, selectedMarkets, [], selectedSourceFiles))
      .then(res => res.json())
      .then(data => {
        setCategoryOptions(data.categories || []);
        setSelectedCategories(prev => prev.filter(c => (data.categories || []).includes(c)));
      });
  }, [selectedYears, selectedPackageTypes, selectedMarkets, selectedSourceFiles, buildFilterUrl, hasData]);

  // Load data when filters change
  const loadData = useCallback(async () => {
    if (selectedMarkets.length === 0 || selectedCategories.length === 0) return;
    
    const params = new URLSearchParams();
    params.set('markets', encodeURIComponent(selectedMarkets.join('|||')));
    params.set('categories', encodeURIComponent(selectedCategories.join('|||')));
    if (selectedYears.length > 0) params.set('years', selectedYears.join(','));
    if (selectedPackageTypes.length > 0) params.set('packageTypes', selectedPackageTypes.join(','));
    if (selectedSourceFiles.length > 0) params.set('sourceFiles', encodeURIComponent(selectedSourceFiles.join('|||')));
    
    // Add dynamic column filters (up to 3)
    if (selectedColumn1 && selectedColumnValues1.length > 0) {
      params.set('filter1Column', encodeURIComponent(selectedColumn1));
      params.set('filter1Values', encodeURIComponent(selectedColumnValues1.join('|||')));
    }
    if (selectedColumn2 && selectedColumnValues2.length > 0) {
      params.set('filter2Column', encodeURIComponent(selectedColumn2));
      params.set('filter2Values', encodeURIComponent(selectedColumnValues2.join('|||')));
    }
    if (selectedColumn3 && selectedColumnValues3.length > 0) {
      params.set('filter3Column', encodeURIComponent(selectedColumn3));
      params.set('filter3Values', encodeURIComponent(selectedColumnValues3.join('|||')));
    }
    
    const [brandsData, productsData, weightsData, variantsData] = await Promise.all([
      fetch(`/api/nielsen/brands?${params.toString()}`).then(r => r.json()),
      fetch(`/api/nielsen/products?${params.toString()}`).then(r => r.json()),
      fetch(`/api/nielsen/weights?${params.toString()}`).then(r => r.json()),
      fetch(`/api/nielsen/variants?${params.toString()}`).then(r => r.json()),
    ]);
    
    setBrands(brandsData.brands || []);
    setProducts(productsData.products || []);
    setWeights(weightsData.weights || []);
    setVariants(variantsData.variants || []);
  }, [selectedMarkets, selectedCategories, selectedYears, selectedPackageTypes, selectedSourceFiles, selectedColumn1, selectedColumnValues1, selectedColumn2, selectedColumnValues2, selectedColumn3, selectedColumnValues3]);

  const loadComparison = useCallback(async () => {
    if (selectedMarkets.length === 0) return;
    const params = new URLSearchParams();
    params.set('markets', encodeURIComponent(selectedMarkets.join('|||')));
    const data = await fetch(`/api/nielsen/comparison?${params.toString()}`).then(r => r.json());
    setComparison(data.comparison || []);
  }, [selectedMarkets]);

  useEffect(() => {
    if (!hasData) return;
    startTransition(() => {
      loadData();
      loadComparison();
    });
  }, [loadData, loadComparison, hasData]);

  // Load market comparison data for charts
  useEffect(() => {
    if (!hasData) return;
    
    let mounted = true;
    
    const fetchMarketComparison = async () => {
      if (!compareMarket1 || !compareMarket2 || selectedCategories.length === 0) {
        if (mounted) {
          setMarketCompareData({ brands: [], products: [] });
        }
        return;
      }
      
      const params = new URLSearchParams();
      params.set('market1', encodeURIComponent(compareMarket1));
      params.set('market2', encodeURIComponent(compareMarket2));
      params.set('categories', encodeURIComponent(selectedCategories.join('|||')));
      if (selectedYears.length > 0) params.set('years', selectedYears.join(','));
      if (selectedPackageTypes.length > 0) params.set('packageTypes', selectedPackageTypes.join(','));
      if (selectedSourceFiles.length > 0) params.set('sourceFiles', encodeURIComponent(selectedSourceFiles.join('|||')));
      
      // Add dynamic column filters (up to 3)
      if (selectedColumn1 && selectedColumnValues1.length > 0) {
        params.set('filter1Column', encodeURIComponent(selectedColumn1));
        params.set('filter1Values', encodeURIComponent(selectedColumnValues1.join('|||')));
      }
      if (selectedColumn2 && selectedColumnValues2.length > 0) {
        params.set('filter2Column', encodeURIComponent(selectedColumn2));
        params.set('filter2Values', encodeURIComponent(selectedColumnValues2.join('|||')));
      }
      if (selectedColumn3 && selectedColumnValues3.length > 0) {
        params.set('filter3Column', encodeURIComponent(selectedColumn3));
        params.set('filter3Values', encodeURIComponent(selectedColumnValues3.join('|||')));
      }
      
      try {
        const data = await fetch(`/api/nielsen/market-share?${params.toString()}`).then(r => r.json());
        if (mounted) {
          setMarketCompareData({
            brands: data.brands || [],
            products: data.products || []
          });
        }
      } catch {
        if (mounted) {
          setMarketCompareData({ brands: [], products: [] });
        }
      }
    };
    
    fetchMarketComparison();
    
    return () => { mounted = false; };
  }, [compareMarket1, compareMarket2, selectedCategories, selectedYears, selectedPackageTypes, selectedSourceFiles, selectedColumn1, selectedColumnValues1, selectedColumn2, selectedColumnValues2, selectedColumn3, selectedColumnValues3, hasData]);

  const handleVariantRename = (originalName: string, newName: string) => {
    setVariantRenames(prev => ({
      ...prev,
      [originalName]: newName
    }));
  };

  const handleCategoryRename = (originalName: string, newName: string) => {
    setCategoryRenames(prev => ({
      ...prev,
      [originalName]: newName
    }));
  };

  // Add current slice to comparison
  const handleAddComparison = useCallback(async () => {
    if (selectedMarkets.length === 0 || selectedCategories.length === 0) {
      return;
    }
    
    const name = newComparisonName.trim() || `Срез ${savedComparisons.length + 1}`;
    
    const params = new URLSearchParams();
    params.set('markets', encodeURIComponent(selectedMarkets.join('|||')));
    params.set('categories', encodeURIComponent(selectedCategories.join('|||')));
    if (selectedYears.length > 0) params.set('years', selectedYears.join(','));
    if (selectedPackageTypes.length > 0) params.set('packageTypes', selectedPackageTypes.join(','));
    if (selectedSourceFiles.length > 0) params.set('sourceFiles', encodeURIComponent(selectedSourceFiles.join('|||')));
    
    // Add dynamic column filters (up to 3)
    if (selectedColumn1 && selectedColumnValues1.length > 0) {
      params.set('filter1Column', encodeURIComponent(selectedColumn1));
      params.set('filter1Values', encodeURIComponent(selectedColumnValues1.join('|||')));
    }
    if (selectedColumn2 && selectedColumnValues2.length > 0) {
      params.set('filter2Column', encodeURIComponent(selectedColumn2));
      params.set('filter2Values', encodeURIComponent(selectedColumnValues2.join('|||')));
    }
    if (selectedColumn3 && selectedColumnValues3.length > 0) {
      params.set('filter3Column', encodeURIComponent(selectedColumn3));
      params.set('filter3Values', encodeURIComponent(selectedColumnValues3.join('|||')));
    }
    
    // Build filters array for saving
    const filters: DynamicFilterSaved[] = [];
    if (selectedColumn1 && selectedColumnValues1.length > 0) {
      filters.push({ column: selectedColumn1, values: [...selectedColumnValues1] });
    }
    if (selectedColumn2 && selectedColumnValues2.length > 0) {
      filters.push({ column: selectedColumn2, values: [...selectedColumnValues2] });
    }
    if (selectedColumn3 && selectedColumnValues3.length > 0) {
      filters.push({ column: selectedColumn3, values: [...selectedColumnValues3] });
    }
    
    try {
      const data = await fetch(`/api/nielsen/comparison-slice?${params.toString()}`).then(r => r.json());
      
      const newComparison: SavedComparison = {
        id: Date.now().toString(),
        name,
        markets: [...selectedMarkets],
        categories: [...selectedCategories],
        years: [...selectedYears],
        packageTypes: [...selectedPackageTypes],
        sourceFiles: [...selectedSourceFiles],
        filters,
        rto2024: data.rto2024,
        qty2024: data.qty2024,
        rto2025: data.rto2025,
        qty2025: data.qty2025,
        rtoDynamics: data.rtoDynamics,
        qtyDynamics: data.qtyDynamics,
        color: COMPARISON_COLORS[savedComparisons.length % COMPARISON_COLORS.length]
      };
      
      setSavedComparisons(prev => [...prev, newComparison]);
      setNewComparisonName('');
    } catch (error) {
      console.error('Error adding comparison:', error);
    }
  }, [selectedMarkets, selectedCategories, selectedYears, selectedPackageTypes, selectedSourceFiles, selectedColumn1, selectedColumnValues1, selectedColumn2, selectedColumnValues2, selectedColumn3, selectedColumnValues3, newComparisonName, savedComparisons.length]);

  // Remove comparison from list
  const handleRemoveComparison = useCallback((id: string) => {
    setSavedComparisons(prev => prev.filter(c => c.id !== id));
  }, []);

  // Clear all comparisons
  const handleClearComparisons = useCallback(() => {
    setSavedComparisons([]);
  }, []);

  const formatRTO = (num: number) => (num * 1000).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const formatQTY = (num: number) => (num * 1000).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const formatPercent = (num: number) => `${num >= 0 ? '+' : ''}${num.toFixed(1)}%`;

  const loading = initialLoading || isPending;

  // Export to Excel
  const handleExport = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('markets', encodeURIComponent(selectedMarkets.join('|||')));
    params.set('categories', encodeURIComponent(selectedCategories.join('|||')));
    if (selectedYears.length > 0) params.set('years', selectedYears.join(','));
    if (selectedPackageTypes.length > 0) params.set('packageTypes', selectedPackageTypes.join(','));
    
    window.open(`/api/nielsen/export?${params.toString()}`, '_blank');
  }, [selectedMarkets, selectedCategories, selectedYears, selectedPackageTypes]);

  // Reset data and go back to upload
  const handleReset = useCallback(async () => {
    await fetch('/api/upload', { method: 'DELETE' });
    setHasData(false);
    setSelectedYears([]);
    setSelectedPackageTypes([]);
    setSelectedMarkets([]);
    setSelectedCategories([]);
    setSelectedSourceFiles([]);
    setBrands([]);
    setProducts([]);
    setWeights([]);
    setVariants([]);
    setComparison([]);
    setCategoryRenames({});
    setVariantRenames({});
    setCompareMarket1('');
    setCompareMarket2('');
    setMarketCompareData({ brands: [], products: [] });
  }, []);

  // Show upload screen if no data
  if (isCheckingData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!hasData) {
    return <FileUploadScreen onUploadSuccess={() => setHasData(true)} />;
  }

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка данных Nielsen...</p>
        </div>
      </div>
    );
  }

  const chartData = comparison.map(c => ({ name: c.category.replace('/', '\n/ '), '2024': c.rto2024 * 1000, '2025': c.rto2025 * 1000 }));
  const pieData = comparison.filter(c => c.rtoShare > 0).map(c => ({ name: c.category, value: c.rtoShare }));

  // Prepare data for market comparison charts - sorted descending by market1 share
  const brandCompareData = [...(marketCompareData.brands || [])]
    .sort((a, b) => b.market1 - a.market1);
  const productCompareData = [...(marketCompareData.products || [])]
    .sort((a, b) => b.market1 - a.market1);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Nielsen Analytics</h1>
                <p className="text-sm text-gray-500">Аналитика продаж по данным Nielsen</p>
              </div>
              <Button 
                onClick={handleReset} 
                variant="outline" 
                className="flex items-center gap-2 text-gray-600 hover:text-red-600 hover:border-red-300"
              >
                <Trash2 className="h-4 w-4" />
                Сбросить
              </Button>
            </div>
            
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <MultiSelectFilter
                  options={allFilters.years}
                  selected={selectedYears}
                  onChange={(vals) => setSelectedYears(vals as number[])}
                  placeholder="Все годы"
                  disabled={allFilters.years.length === 0}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-gray-500" />
                <MultiSelectFilter
                  options={sourceFileOptions}
                  selected={selectedSourceFiles}
                  onChange={(vals) => setSelectedSourceFiles(vals as string[])}
                  placeholder="Excel файлы"
                  disabled={sourceFileOptions.length === 0}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-gray-500" />
                <MultiSelectFilter
                  options={packageTypeOptions}
                  selected={selectedPackageTypes}
                  onChange={(vals) => setSelectedPackageTypes(vals as string[])}
                  placeholder="Все типы"
                  disabled={packageTypeOptions.length === 0}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-gray-500" />
                <MultiSelectFilter
                  options={marketOptions}
                  selected={selectedMarkets}
                  onChange={(vals) => setSelectedMarkets(vals as string[])}
                  placeholder="Выберите маркет"
                  disabled={marketOptions.length === 0}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-gray-500" />
                <MultiSelectFilter
                  options={categoryOptions}
                  selected={selectedCategories}
                  onChange={(vals) => setSelectedCategories(vals as string[])}
                  placeholder="Категория"
                  disabled={categoryOptions.length === 0}
                />
              </div>
            </div>
            
            {/* Dynamic column filters (3 filters) */}
            <div className="flex flex-wrap gap-3 items-center pt-2 border-t border-gray-100">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              <Label className="text-sm text-gray-600 font-medium">Доп. фильтры:</Label>
              
              {/* Filter 1 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">1:</span>
                <select 
                  value={selectedColumn1}
                  onChange={(e) => {
                    setSelectedColumn1(e.target.value);
                    setSelectedColumnValues1([]); // Clear immediately when column changes
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm min-w-[150px] bg-white"
                >
                  <option value="">-- Колонка --</option>
                  {availableColumns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
                {selectedColumn1 && (
                  <MultiSelectFilter
                    key={`filter1-${selectedColumn1}`}
                    options={columnValues1.slice(0, 100)}
                    selected={selectedColumnValues1}
                    onChange={(vals) => setSelectedColumnValues1(vals as string[])}
                    placeholder="Значения"
                    disabled={columnValues1.length === 0}
                  />
                )}
              </div>
              
              {/* Filter 2 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">2:</span>
                <select 
                  value={selectedColumn2}
                  onChange={(e) => {
                    setSelectedColumn2(e.target.value);
                    setSelectedColumnValues2([]); // Clear immediately when column changes
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm min-w-[150px] bg-white"
                >
                  <option value="">-- Колонка --</option>
                  {availableColumns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
                {selectedColumn2 && (
                  <MultiSelectFilter
                    key={`filter2-${selectedColumn2}`}
                    options={columnValues2.slice(0, 100)}
                    selected={selectedColumnValues2}
                    onChange={(vals) => setSelectedColumnValues2(vals as string[])}
                    placeholder="Значения"
                    disabled={columnValues2.length === 0}
                  />
                )}
              </div>
              
              {/* Filter 3 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">3:</span>
                <select 
                  value={selectedColumn3}
                  onChange={(e) => {
                    setSelectedColumn3(e.target.value);
                    setSelectedColumnValues3([]); // Clear immediately when column changes
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm min-w-[150px] bg-white"
                >
                  <option value="">-- Колонка --</option>
                  {availableColumns.map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
                {selectedColumn3 && (
                  <MultiSelectFilter
                    key={`filter3-${selectedColumn3}`}
                    options={columnValues3.slice(0, 100)}
                    selected={selectedColumnValues3}
                    onChange={(vals) => setSelectedColumnValues3(vals as string[])}
                    placeholder="Значения"
                    disabled={columnValues3.length === 0}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <Tabs defaultValue="tops" className="w-full">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="tops" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Топ показатели
              </TabsTrigger>
              <TabsTrigger value="comparison" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Сравнение по годам
              </TabsTrigger>
              <TabsTrigger value="charts" className="flex items-center gap-2">
                <PieChart className="h-4 w-4" />
                Диаграммы долей
              </TabsTrigger>
            </TabsList>
            {selectedMarkets.length > 0 && selectedCategories.length > 0 && (
              <div className="flex items-center gap-2">
                <Button 
                  onClick={captureAllTables}
                  variant="outline" 
                  className="flex items-center gap-2 bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-700"
                >
                  <Camera className="h-4 w-4" />
                  Скриншот всех
                </Button>
                <Button 
                  onClick={handleExport} 
                  variant="outline" 
                  className="flex items-center gap-2 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-700"
                >
                  <Download className="h-4 w-4" />
                  Экспорт в Excel
                </Button>
              </div>
            )}
          </div>

          <TabsContent value="tops">
            {selectedMarkets.length === 0 || selectedCategories.length === 0 ? (
              <Card className="bg-white">
                <CardContent className="py-12 text-center text-gray-500">
                  <Store className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>Выберите маркет и категорию для отображения данных</p>
                </CardContent>
              </Card>
            ) : loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map(i => (
                  <Card key={i} className="bg-white">
                    <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
                    <CardContent><div className="space-y-3">{[1, 2, 3, 4, 5].map(j => <Skeleton key={j} className="h-10 w-full" />)}</div></CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div ref={brandTableRef}>
                  <Card className="bg-white shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between text-lg">
                        <span className="flex items-center gap-2">
                          <BarChart3 className="h-5 w-5 text-emerald-600" />
                          Топ 10 по Брендам
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600"
                          onClick={() => captureTable(brandTableRef, 'Бренды')}
                          title="Скриншот таблицы"
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="font-semibold w-12">#</TableHead>
                            <TableHead className="font-semibold">Бренд</TableHead>
                            <TableHead className="font-semibold text-right w-32">РТО, руб</TableHead>
                            <TableHead className="font-semibold text-right w-28">Шт</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {brands.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="text-center text-gray-500 py-8">Нет данных</TableCell></TableRow>
                          ) : brands.map((brand, index) => (
                            <TableRow key={index} className="hover:bg-gray-50">
                              <TableCell className="font-medium">{index + 1}</TableCell>
                              <TableCell className="truncate max-w-[250px]" title={brand.brand}>{brand.brand}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatRTO(brand.rto)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatQTY(brand.qty)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>

                <div ref={productTableRef}>
                  <Card className="bg-white shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between text-lg">
                        <span className="flex items-center gap-2">
                          <Package className="h-5 w-5 text-emerald-600" />
                          Топ 10 по Продуктам
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600"
                          onClick={() => captureTable(productTableRef, 'Продукты')}
                          title="Скриншот таблицы"
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold w-12">#</TableHead>
                          <TableHead className="font-semibold">Продукт</TableHead>
                          <TableHead className="font-semibold text-right w-32">РТО, руб</TableHead>
                          <TableHead className="font-semibold text-right w-28">Шт</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.length === 0 ? (
                          <TableRow><TableCell colSpan={4} className="text-center text-gray-500 py-8">Нет данных</TableCell></TableRow>
                        ) : products.map((product, index) => (
                          <TableRow key={index} className="hover:bg-gray-50">
                            <TableCell className="font-medium">{index + 1}</TableCell>
                            <TableCell className="truncate max-w-[250px]" title={product.product}>{product.product}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatRTO(product.rto)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{formatQTY(product.qty)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                </div>

                <div ref={weightTableRef}>
                  <Card className="bg-white shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between text-lg">
                        <span className="flex items-center gap-2">
                          <Scale className="h-5 w-5 text-emerald-600" />
                          Топ 5 по Весу
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600"
                          onClick={() => captureTable(weightTableRef, 'Вес')}
                          title="Скриншот таблицы"
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="font-semibold w-12">#</TableHead>
                            <TableHead className="font-semibold">Вес</TableHead>
                            <TableHead className="font-semibold text-right w-32">РТО, руб</TableHead>
                            <TableHead className="font-semibold text-right w-28">Шт</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {weights.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center text-gray-500 py-8">Нет данных</TableCell></TableRow>
                          ) : weights.map((weight, index) => (
                            <TableRow key={index} className="hover:bg-gray-50 group">
                              <TableCell className="font-medium">{index + 1}</TableCell>
                              <TableCell><Badge variant="outline" className="font-mono">{weight.weight}</Badge></TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatRTO(weight.rto)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatQTY(weight.qty)}</TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                                  onClick={() => setWeights(prev => prev.filter((_, i) => i !== index))}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>

                <div ref={variantTableRef}>
                  <Card className="bg-white shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between text-lg">
                        <span className="flex items-center gap-2">
                          <Flame className="h-5 w-5 text-emerald-600" />
                          Топ 10 по Типу
                          <span className="text-xs text-gray-400 font-normal">(кликните для редактирования)</span>
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600"
                          onClick={() => captureTable(variantTableRef, 'Тип')}
                          title="Скриншот таблицы"
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="font-semibold w-12">#</TableHead>
                            <TableHead className="font-semibold">Тип</TableHead>
                            <TableHead className="font-semibold text-right w-32">РТО, руб</TableHead>
                            <TableHead className="font-semibold text-right w-28">Шт</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {variants.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center text-gray-500 py-8">Нет данных</TableCell></TableRow>
                          ) : variants.map((variant, index) => {
                            const displayName = variantRenames[variant.variant] || variant.variant;
                            return (
                              <TableRow key={index} className="hover:bg-gray-50 group">
                                <TableCell className="font-medium">{index + 1}</TableCell>
                                <TableCell>
                                  <EditableVariantName
                                    originalName={variant.variant}
                                    customName={displayName}
                                    onRename={handleVariantRename}
                                />
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatRTO(variant.rto)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatQTY(variant.qty)}</TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                                  onClick={() => setVariants(prev => prev.filter((_, i) => i !== index))}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="comparison">
            <div className="space-y-6">
              {/* Add to comparison section */}
              <Card className="bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                    Добавить срез данных для сравнения
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[200px]">
                      <Label className="text-sm text-gray-600 mb-1 block">Название среза</Label>
                      <Input
                        value={newComparisonName}
                        onChange={(e) => setNewComparisonName(e.target.value)}
                        placeholder="Например: Розовое вино, Бренди..."
                        className="w-full"
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
                      <span>Маркет: {selectedMarkets.join(', ') || 'не выбран'}</span>
                      <span>|</span>
                      <span>Категория: {selectedCategories.join(', ') || 'не выбрана'}</span>
                      {selectedColumn1 && selectedColumnValues1.length > 0 && (
                        <>
                          <span>|</span>
                          <span>{selectedColumn1}: {selectedColumnValues1.join(', ')}</span>
                        </>
                      )}
                      {selectedColumn2 && selectedColumnValues2.length > 0 && (
                        <>
                          <span>|</span>
                          <span>{selectedColumn2}: {selectedColumnValues2.join(', ')}</span>
                        </>
                      )}
                      {selectedColumn3 && selectedColumnValues3.length > 0 && (
                        <>
                          <span>|</span>
                          <span>{selectedColumn3}: {selectedColumnValues3.join(', ')}</span>
                        </>
                      )}
                    </div>
                    <Button
                      onClick={handleAddComparison}
                      disabled={selectedMarkets.length === 0 || selectedCategories.length === 0}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      + Добавить в сравнение
                    </Button>
                    {savedComparisons.length > 0 && (
                      <Button
                        onClick={handleClearComparisons}
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:border-red-300"
                      >
                        Очистить все
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Comparison table */}
              <Card className="bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                    Сравнение срезов (2024 vs 2025)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {savedComparisons.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <TrendingUp className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>Настройте фильтры выше и добавьте срезы данных для сравнения</p>
                      <p className="text-sm mt-2">Вы можете добавить несколько срезов: полные файлы, сегменты по доп. фильтру и т.д.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="font-semibold min-w-[200px]">Название</TableHead>
                            <TableHead className="font-semibold text-center" colSpan={2}>2024</TableHead>
                            <TableHead className="font-semibold text-center" colSpan={2}>2025</TableHead>
                            <TableHead className="font-semibold text-center" colSpan={2}>Динамика</TableHead>
                            <TableHead className="font-semibold w-12"></TableHead>
                          </TableRow>
                          <TableRow className="bg-gray-50">
                            <TableHead></TableHead>
                            <TableHead className="font-semibold text-right w-32">РТО, руб</TableHead>
                            <TableHead className="font-semibold text-right w-28">Продажи, шт</TableHead>
                            <TableHead className="font-semibold text-right w-32">РТО, руб</TableHead>
                            <TableHead className="font-semibold text-right w-28">Продажи, шт</TableHead>
                            <TableHead className="font-semibold text-right w-24">РТО, %</TableHead>
                            <TableHead className="font-semibold text-right w-24">Продажи, %</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {savedComparisons.map((row) => (
                            <TableRow key={row.id} className="hover:bg-gray-50">
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-3 h-3 rounded-full shrink-0" 
                                    style={{ backgroundColor: row.color }}
                                  />
                                  <div>
                                    <div className="font-medium">{row.name}</div>
                                    <div className="text-xs text-gray-500">
                                      {row.filters && row.filters.length > 0
                                        ? row.filters.map(f => `${f.column}: ${f.values.join(', ')}`).join(' | ')
                                        : row.sourceFiles.length > 0 
                                          ? row.sourceFiles[0] 
                                          : row.categories.join(', ')}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatRTO(row.rto2024)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatQTY(row.qty2024)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatRTO(row.rto2025)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatQTY(row.qty2025)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                <span className={row.rtoDynamics >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatPercent(row.rtoDynamics)}</span>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                <span className={row.qtyDynamics >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatPercent(row.qtyDynamics)}</span>
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-gray-400 hover:text-red-600"
                                  onClick={() => handleRemoveComparison(row.id)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {savedComparisons.length > 1 && (
                            <TableRow className="bg-gray-100 font-semibold">
                              <TableCell>Итого</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatRTO(savedComparisons.reduce((sum, r) => sum + r.rto2024, 0))}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatQTY(savedComparisons.reduce((sum, r) => sum + r.qty2024, 0))}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatRTO(savedComparisons.reduce((sum, r) => sum + r.rto2025, 0))}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatQTY(savedComparisons.reduce((sum, r) => sum + r.qty2025, 0))}</TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {(() => {
                                  const total2024 = savedComparisons.reduce((sum, r) => sum + r.rto2024, 0);
                                  const total2025 = savedComparisons.reduce((sum, r) => sum + r.rto2025, 0);
                                  const dynamics = total2024 > 0 ? ((total2025 - total2024) / total2024) * 100 : 0;
                                  return <span className={dynamics >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatPercent(dynamics)}</span>;
                                })()}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {(() => {
                                  const total2024 = savedComparisons.reduce((sum, r) => sum + r.qty2024, 0);
                                  const total2025 = savedComparisons.reduce((sum, r) => sum + r.qty2025, 0);
                                  const dynamics = total2024 > 0 ? ((total2025 - total2024) / total2024) * 100 : 0;
                                  return <span className={dynamics >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatPercent(dynamics)}</span>;
                                })()}
                              </TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Charts for saved comparisons */}
              {savedComparisons.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="bg-white shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <BarChart3 className="h-5 w-5 text-emerald-600" />
                        РТО по срезам (2024 vs 2025)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={savedComparisons.map(c => ({
                          name: c.name.length > 15 ? c.name.substring(0, 15) + '...' : c.name,
                          '2024': c.rto2024 * 1000,
                          '2025': c.rto2025 * 1000
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tickFormatter={(v) => `${(v/1000000).toFixed(0)}M`} />
                          <Tooltip formatter={(v: number) => v.toLocaleString('ru-RU') + ' руб'} />
                          <Legend />
                          <Bar dataKey="2024" fill="#93c5fd" name="2024" />
                          <Bar dataKey="2025" fill="#10b981" name="2025" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="bg-white shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <PieChart className="h-5 w-5 text-emerald-600" />
                        Доля РТО по срезам (2025)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <RechartsPie>
                          <Pie 
                            data={savedComparisons.map(c => ({ name: c.name, value: c.rto2025, color: c.color }))} 
                            cx="50%" 
                            cy="50%" 
                            labelLine={false} 
                            label={({ name, value }) => `${name.substring(0, 10)}: ${(value * 1000).toLocaleString('ru-RU')}`} 
                            outerRadius={100} 
                            dataKey="value"
                          >
                            {savedComparisons.map((c, index) => (
                              <Cell key={`cell-${index}`} fill={c.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => (v * 1000).toLocaleString('ru-RU') + ' руб'} />
                        </RechartsPie>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="charts">
            {loading ? (
              <Card className="bg-white"><CardContent className="py-8"><Skeleton className="h-64 w-full" /></CardContent></Card>
            ) : marketOptions.length === 0 ? (
              <Card className="bg-white">
                <CardContent className="py-12 text-center text-gray-500">
                  <Store className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>Нет доступных маркетов для сравнения</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Market selection for comparison */}
                <Card className="bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <ArrowRightLeft className="h-5 w-5 text-emerald-600" />
                      Выберите 2 маркета для сравнения
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: MARKET_COLORS[0] }}></div>
                        <Label className="font-semibold">Рынок:</Label>
                        <select 
                          value={compareMarket1}
                          onChange={(e) => setCompareMarket1(e.target.value)}
                          className="border rounded px-3 py-1.5 text-sm min-w-[200px]"
                        >
                          <option value="">-- Выберите --</option>
                          {marketOptions.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                      
                      <span className="text-gray-400 text-lg">⇄</span>
                      
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: MARKET_COLORS[1] }}></div>
                        <Label className="font-semibold">Победа:</Label>
                        <select 
                          value={compareMarket2}
                          onChange={(e) => setCompareMarket2(e.target.value)}
                          className="border rounded px-3 py-1.5 text-sm min-w-[200px]"
                        >
                          <option value="">-- Выберите --</option>
                          {marketOptions.filter(m => m !== compareMarket1).map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    {selectedCategories.length === 0 && (
                      <p className="mt-3 text-sm text-amber-600">
                        ⚠️ Также выберите категорию в фильтрах выше
                      </p>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      * Данные за 2025 год. Доли рассчитываются независимо для каждого маркета.
                    </p>
                  </CardContent>
                </Card>

                {/* Charts - full width for better readability */}
                <div className="space-y-6">
                  {/* Screenshot button for all charts */}
                  {compareMarket1 && compareMarket2 && brandCompareData.length > 0 && (
                    <div className="flex justify-end">
                      <Button 
                        onClick={captureAllCharts}
                        variant="outline" 
                        className="flex items-center gap-2 bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-700"
                      >
                        <Camera className="h-4 w-4" />
                        Скриншот диаграмм
                      </Button>
                    </div>
                  )}
                  
                  <div ref={brandChartRef}>
                    <Card className="bg-white shadow-sm">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between text-lg">
                          <span className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-emerald-600" />
                            Топ 10 Brand (доля РТО 2025, %)
                          </span>
                          {compareMarket1 && compareMarket2 && brandCompareData.length > 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600"
                              onClick={() => captureTable(brandChartRef, 'Brand_диаграмма')}
                              title="Скриншот диаграммы"
                            >
                              <Camera className="h-4 w-4" />
                            </Button>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {!compareMarket1 || !compareMarket2 ? (
                          <div className="h-96 flex items-center justify-center text-gray-500">
                            Выберите 2 маркета для сравнения
                          </div>
                        ) : brandCompareData.length === 0 ? (
                          <div className="h-96 flex items-center justify-center text-gray-500">
                            Нет данных
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height={650}>
                            <BarChart data={brandCompareData} layout="vertical" margin={{ left: 150, right: 100 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" tickFormatter={(v) => `${v.toFixed(1)}%`} domain={[0, 'dataMax + 5']} tick={{ fontSize: 12 }} />
                              <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 13 }} />
                              <Tooltip 
                                formatter={(v: number) => v.toFixed(2) + '%'}
                                labelFormatter={(label) => `Бренд: ${label}`}
                              />
                              <Legend wrapperStyle={{ fontSize: 13 }} />
                              <Bar 
                                dataKey="market1" 
                                name="Рынок" 
                                fill={MARKET_COLORS[0]} 
                                radius={[0, 4, 4, 0]}
                                label={{ position: 'right', formatter: (v: number) => `${v.toFixed(1)}%`, fill: MARKET_COLORS[0], fontSize: 12, fontWeight: 500 }}
                              />
                              <Bar 
                                dataKey="market2" 
                                name="Победа" 
                                fill={MARKET_COLORS[1]} 
                                radius={[0, 4, 4, 0]}
                                label={{ position: 'right', formatter: (v: number) => `${v.toFixed(1)}%`, fill: MARKET_COLORS[1], fontSize: 12, fontWeight: 500 }}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div ref={skuChartRef}>
                    <Card className="bg-white shadow-sm">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between text-lg">
                          <span className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-emerald-600" />
                            Топ 10 SKU (доля РТО 2025, %)
                          </span>
                          {compareMarket1 && compareMarket2 && productCompareData.length > 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600"
                              onClick={() => captureTable(skuChartRef, 'SKU_диаграмма')}
                              title="Скриншот диаграммы"
                            >
                              <Camera className="h-4 w-4" />
                            </Button>
                          )}
                        </CardTitle>
                      </CardHeader>
                    <CardContent>
                      {!compareMarket1 || !compareMarket2 ? (
                        <div className="h-96 flex items-center justify-center text-gray-500">
                          Выберите 2 маркета для сравнения
                        </div>
                      ) : productCompareData.length === 0 ? (
                        <div className="h-96 flex items-center justify-center text-gray-500">
                          Нет данных
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height={700}>
                          <BarChart data={productCompareData} layout="vertical" margin={{ left: 20, right: 100 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" tickFormatter={(v) => `${v.toFixed(1)}%`} domain={[0, 'dataMax + 5']} tick={{ fontSize: 12 }} />
                            <YAxis dataKey="name" type="category" width={300} tick={{ fontSize: 11 }} />
                            <Tooltip 
                              formatter={(v: number) => v.toFixed(2) + '%'}
                              labelFormatter={(_, payload) => {
                                if (payload && payload[0] && payload[0].payload) {
                                  return payload[0].payload.fullName || '';
                                }
                                return '';
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: 13 }} />
                            <Bar 
                              dataKey="market1" 
                              name="Рынок" 
                              fill={MARKET_COLORS[0]} 
                              radius={[0, 4, 4, 0]}
                              label={{ position: 'right', formatter: (v: number) => `${v.toFixed(1)}%`, fill: MARKET_COLORS[0], fontSize: 12, fontWeight: 500 }}
                            />
                            <Bar 
                              dataKey="market2" 
                              name="Победа" 
                              fill={MARKET_COLORS[1]} 
                              radius={[0, 4, 4, 0]}
                              label={{ position: 'right', formatter: (v: number) => `${v.toFixed(1)}%`, fill: MARKET_COLORS[1], fontSize: 12, fontWeight: 500 }}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <footer className="bg-white border-t border-gray-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
          Nielsen Analytics Dashboard • Данные из загруженных файлов
        </div>
      </footer>
    </div>
  );
}

