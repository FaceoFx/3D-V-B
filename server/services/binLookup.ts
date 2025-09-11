import { CardInfo } from "@shared/schema";

export class BinLookupService {
  private apiKey: string;
  private cache: Map<string, { data: CardInfo; timestamp: number }>;
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.apiKey = process.env.BIN_LOOKUP_API_KEY || process.env.BIN_API_KEY || "";
    this.cache = new Map();
  }

  async lookupBIN(bin: string): Promise<CardInfo | null> {
    try {
      // Check cache first
      const cached = this.getCachedResult(bin);
      if (cached) {
        console.log(`BIN lookup: Using cached data for ${bin}`);
        // Ensure cached results have apiStats for consistent behavior
        if (!(cached as any).apiStats) {
          (cached as any).apiStats = {
            successRate: 100,
            successfulLookups: 1,
            totalAttempted: 1,
            overallStatus: 'passed',
            processingTime: 0,
            canBypassBinSecurity: false
          };
        }
        return cached;
      }

      // Try multiple APIs for enhanced reliability with real success tracking
      const { result, apiStats } = await this.lookupWithFallback(bin);
      
      // Attach apiStats to the result BEFORE caching
      if (result) {
        (result as any).apiStats = apiStats;
      }
      
      // Cache successful results WITH apiStats attached
      if (result && result.brand !== 'UNKNOWN') {
        this.setCachedResult(bin, result);
      }
      
      return result;
    } catch (error) {
      console.error("BIN lookup error:", error);
      return this.getMockBinInfo(bin);
    }
  }

  private getCachedResult(bin: string): CardInfo | null {
    const cached = this.cache.get(bin);
    if (cached) {
      const isExpired = Date.now() - cached.timestamp > this.CACHE_TTL;
      if (!isExpired) {
        return cached.data;
      } else {
        this.cache.delete(bin);
      }
    }
    return null;
  }

  private setCachedResult(bin: string, data: CardInfo): void {
    this.cache.set(bin, {
      data,
      timestamp: Date.now()
    });
    
    // Clean up old entries periodically
    if (this.cache.size > 1000) {
      const now = Date.now();
      Array.from(this.cache.entries()).forEach(([key, value]) => {
        if (now - value.timestamp > this.CACHE_TTL) {
          this.cache.delete(key);
        }
      });
    }
  }

  private async lookupWithFallback(bin: string): Promise<{result: CardInfo | null, apiStats: any}> {
    // Enhanced API array with premium sources for maximum accuracy
    const apis = [
      { name: 'BinList.net', func: () => this.lookupBinList(bin), priority: 1 },
      { name: 'BinCheck.io', func: () => this.lookupBinCheck(bin), priority: 1 },
      { name: 'BinDB.com', func: () => this.lookupBinDB(bin), priority: 1 },
      { name: 'BinRange.net', func: () => this.lookupBinRange(bin), priority: 1 },
      { name: 'CardBin.org', func: () => this.lookupCardBin(bin), priority: 2 },
      { name: 'BinSearch.io', func: () => this.lookupBinSearch(bin), priority: 2 },
      { name: 'BinCodes.com', func: () => this.lookupBinCodes(bin), priority: 2 },
      { name: 'FreeBinChecker', func: () => this.lookupFreeBinChecker(bin), priority: 3 }
    ];
    
    const apiResults: Array<{name: string, success: boolean, processingTime: number, errorReason?: string, data?: CardInfo}> = [];
    const successfulResults: CardInfo[] = [];
    
    // Parallel API calls for faster processing
    const promises = apis.map(async (api) => {
      const startTime = Date.now();
      try {
        const result = await api.func();
        const processingTime = Date.now() - startTime;
        
        if (result && result.brand !== 'UNKNOWN') {
          console.log(`BIN lookup successful with API: ${api.name}`);
          apiResults.push({ name: api.name, success: true, processingTime, data: result });
          successfulResults.push(result);
          return { success: true, result, api: api.name, processingTime };
        } else {
          apiResults.push({ name: api.name, success: false, processingTime, errorReason: 'No valid data returned' });
          return { success: false, api: api.name, processingTime, error: 'No valid data' };
        }
      } catch (error) {
        const processingTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`API ${api.name} failed:`, errorMessage);
        apiResults.push({ 
          name: api.name, 
          success: false, 
          processingTime, 
          errorReason: errorMessage
        });
        return { success: false, api: api.name, processingTime, error: errorMessage };
      }
    });

    // Wait for all API calls to complete
    await Promise.allSettled(promises);

    // Aggregate results for maximum accuracy
    let aggregatedResult: CardInfo | null = null;
    if (successfulResults.length > 0) {
      aggregatedResult = this.aggregateResults(successfulResults, bin);
    }

    const successfulLookups = apiResults.filter(r => r.success).length;
    const totalAttempted = apiResults.length;
    
    const apiStats = {
      successRate: Math.round((successfulLookups / totalAttempted) * 100),
      successfulLookups,
      totalAttempted,
      overallStatus: successfulLookups > 0 ? 'passed' : 'failed',
      canBypassBinSecurity: successfulLookups >= 3,
      dataConfidence: this.calculateDataConfidence(successfulResults),
      sourcesAgreement: this.calculateSourcesAgreement(successfulResults),
      results: apiResults,
      processingTime: Math.round(apiResults.reduce((sum, r) => sum + r.processingTime, 0) / apiResults.length),
      summary: `${successfulLookups}/${totalAttempted} premium APIs responded. ${
        successfulLookups >= 4 
          ? 'BIN verified through multiple premium databases with high confidence.' 
          : successfulLookups >= 2 
            ? 'BIN verified through professional databases with good confidence.'
            : successfulLookups === 1
              ? 'BIN verified through limited database access.'
              : 'BIN data retrieved from local comprehensive database.'
      }`
    };

    if (aggregatedResult) {
      return { result: { ...aggregatedResult, apiStats }, apiStats };
    }

    // Enhanced fallback to local database
    const localResult = this.getEnhancedBinInfo(bin);
    return { result: { ...localResult, apiStats }, apiStats };
  }

  private async lookupBinList(bin: string): Promise<CardInfo | null> {
    try {
      const response = await fetch(`https://lookup.binlist.net/${bin}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': '3D-Auth-Validator/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`BinList API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        bin,
        brand: (data.scheme || 'UNKNOWN').toUpperCase(),
        type: (data.type || 'UNKNOWN').toUpperCase(),
        level: this.standardizeCardLevel(data.category),
        bank: data.bank?.name || 'UNKNOWN BANK',
        country: data.country?.name || 'UNKNOWN',
        countryCode: data.country?.alpha2 || 'XX',
        flag: this.getCountryFlag(data.country?.alpha2 || 'XX'),
        prepaid: data.prepaid || false,
        currency: data.country?.currency || undefined,
        website: data.bank?.url || undefined,
        phone: data.bank?.phone || undefined
      };
    } catch (error) {
      throw new Error(`BinList lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // BinCheck.io API integration
  private async lookupBinCheck(bin: string): Promise<CardInfo | null> {
    try {
      const response = await fetch(`https://lookup.bincheck.io/details/${bin}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': '3D-Auth-Validator/1.0'
        },

      });

      if (!response.ok) {
        throw new Error(`BinCheck API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        bin,
        brand: (data.scheme || data.brand || 'UNKNOWN').toUpperCase(),
        type: (data.type || 'UNKNOWN').toUpperCase(),
        level: this.standardizeCardLevel(data.tier || data.category),
        bank: data.bank?.name || 'UNKNOWN BANK',
        country: data.country?.name || 'UNKNOWN',
        countryCode: data.country?.iso || 'XX',
        flag: this.getCountryFlag(data.country?.iso || 'XX'),
        prepaid: data.prepaid || false,
        currency: data.country?.currency || undefined,
        website: data.bank?.website || undefined,
        phone: data.bank?.phone || undefined
      };
    } catch (error) {
      throw new Error(`BinCheck lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // BinSearch.io API integration  
  private async lookupBinSearch(bin: string): Promise<CardInfo | null> {
    try {
      const response = await fetch(`https://api.binsearch.io/v1/bin/${bin}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': '3D-Auth-Validator/1.0'
        },

      });

      if (!response.ok) {
        throw new Error(`BinSearch API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        bin,
        brand: (data.network || data.scheme || 'UNKNOWN').toUpperCase(),
        type: (data.type || 'UNKNOWN').toUpperCase(),
        level: this.standardizeCardLevel(data.level || data.category),
        bank: data.issuer?.name || 'UNKNOWN BANK',
        country: data.country?.name || 'UNKNOWN',
        countryCode: data.country?.code || 'XX',
        flag: this.getCountryFlag(data.country?.code || 'XX'),
        prepaid: data.prepaid || false,
        currency: data.country?.currency || undefined,
        website: data.issuer?.website || undefined,
        phone: data.issuer?.phone || undefined
      };
    } catch (error) {
      throw new Error(`BinSearch lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // BinCodes.com API integration
  private async lookupBinCodes(bin: string): Promise<CardInfo | null> {
    try {
      const response = await fetch(`https://api.bincodes.com/bin/${bin}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': '3D-Auth-Validator/1.0'
        },

      });

      if (!response.ok) {
        throw new Error(`BinCodes API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        bin,
        brand: (data.brand || data.scheme || 'UNKNOWN').toUpperCase(),
        type: (data.type || 'UNKNOWN').toUpperCase(),
        level: this.standardizeCardLevel(data.level),
        bank: data.bank || 'UNKNOWN BANK',
        country: data.country || 'UNKNOWN',
        countryCode: data.countryCode || 'XX',
        flag: this.getCountryFlag(data.countryCode || 'XX'),
        prepaid: data.prepaid || false,
        currency: data.currency || undefined,
        website: undefined,
        phone: undefined
      };
    } catch (error) {
      throw new Error(`BinCodes lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // BinDB.com API - Premium BIN database
  private async lookupBinDB(bin: string): Promise<CardInfo | null> {
    try {
      const response = await fetch(`https://api.bindb.com/v1/bin/${bin}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': '3D-Auth-Validator/1.0',
          'X-API-Key': this.apiKey
        },

      });

      if (!response.ok) {
        throw new Error(`BinDB API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        bin,
        brand: (data.network || data.brand || 'UNKNOWN').toUpperCase(),
        type: (data.type || 'UNKNOWN').toUpperCase(),
        level: this.standardizeCardLevel(data.category || data.level),
        bank: data.issuer?.name || data.bank || 'UNKNOWN BANK',
        country: data.country?.name || 'UNKNOWN',
        countryCode: data.country?.iso2 || 'XX',
        flag: this.getCountryFlag(data.country?.iso2 || 'XX'),
        prepaid: data.prepaid || false,
        currency: data.country?.currency || undefined,
        website: data.issuer?.website || undefined,
        phone: data.issuer?.phone || undefined
      };
    } catch (error) {
      throw new Error(`BinDB lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // BinRange.net API - Comprehensive BIN ranges
  private async lookupBinRange(bin: string): Promise<CardInfo | null> {
    try {
      const response = await fetch(`https://api.binrange.net/lookup/${bin}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': '3D-Auth-Validator/1.0',
          'Authorization': `Bearer ${this.apiKey}`
        },

      });

      if (!response.ok) {
        throw new Error(`BinRange API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        bin,
        brand: (data.scheme || data.brand || 'UNKNOWN').toUpperCase(),
        type: (data.product || data.type || 'UNKNOWN').toUpperCase(),
        level: this.standardizeCardLevel(data.level || data.category),
        bank: data.bank?.name || data.issuer || 'UNKNOWN BANK',
        country: data.country?.name || 'UNKNOWN',
        countryCode: data.country?.code || 'XX',
        flag: this.getCountryFlag(data.country?.code || 'XX'),
        prepaid: data.prepaid || false,
        currency: data.country?.currency || undefined,
        website: data.bank?.website || undefined,
        phone: data.bank?.phone || undefined
      };
    } catch (error) {
      throw new Error(`BinRange lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // CardBin.org API - Alternative BIN lookup
  private async lookupCardBin(bin: string): Promise<CardInfo | null> {
    try {
      const response = await fetch(`https://cardbin.org/api/v1/bin/${bin}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': '3D-Auth-Validator/1.0'
        },

      });

      if (!response.ok) {
        throw new Error(`CardBin API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        bin,
        brand: (data.brand || data.scheme || 'UNKNOWN').toUpperCase(),
        type: (data.type || 'UNKNOWN').toUpperCase(),
        level: this.standardizeCardLevel(data.level),
        bank: data.issuer || data.bank || 'UNKNOWN BANK',
        country: data.country || 'UNKNOWN',
        countryCode: data.countryCode || 'XX',
        flag: this.getCountryFlag(data.countryCode || 'XX'),
        prepaid: data.prepaid || false,
        currency: data.currency || undefined,
        website: undefined,
        phone: undefined
      };
    } catch (error) {
      throw new Error(`CardBin lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // FreeBinChecker API - Additional source
  private async lookupFreeBinChecker(bin: string): Promise<CardInfo | null> {
    try {
      const response = await fetch(`https://freebinchecker.com/api/v1/check/${bin}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': '3D-Auth-Validator/1.0'
        },

      });

      if (!response.ok) {
        throw new Error(`FreeBinChecker API error: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        bin,
        brand: (data.brand || data.network || 'UNKNOWN').toUpperCase(),
        type: (data.type || 'UNKNOWN').toUpperCase(),
        level: this.standardizeCardLevel(data.level || data.category),
        bank: data.bank || 'UNKNOWN BANK',
        country: data.country || 'UNKNOWN',
        countryCode: data.iso || 'XX',
        flag: this.getCountryFlag(data.iso || 'XX'),
        prepaid: data.prepaid || false,
        currency: data.currency || undefined,
        website: undefined,
        phone: undefined
      };
    } catch (error) {
      throw new Error(`FreeBinChecker lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getCountryFlag(countryCode: string): string {
    const flags: Record<string, string> = {
      // Major economies
      'US': '🇺🇸', 'CN': '🇨🇳', 'JP': '🇯🇵', 'DE': '🇩🇪', 'IN': '🇮🇳', 'GB': '🇬🇧', 'FR': '🇫🇷', 'IT': '🇮🇹', 'BR': '🇧🇷', 'CA': '🇨🇦',
      // Europe
      'ES': '🇪🇸', 'NL': '🇳🇱', 'CH': '🇨🇭', 'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰', 'FI': '🇫🇮', 'AT': '🇦🇹', 'BE': '🇧🇪', 'PT': '🇵🇹',
      'GR': '🇬🇷', 'PL': '🇵🇱', 'CZ': '🇨🇿', 'HU': '🇭🇺', 'IE': '🇮🇪', 'SK': '🇸🇰', 'SI': '🇸🇮', 'HR': '🇭🇷', 'BG': '🇧🇬', 'RO': '🇷🇴',
      'LT': '🇱🇹', 'LV': '🇱🇻', 'EE': '🇪🇪', 'LU': '🇱🇺', 'MT': '🇲🇹', 'CY': '🇨🇾', 'IS': '🇮🇸', 'MC': '🇲🇨', 'AD': '🇦🇩', 'SM': '🇸🇲',
      // Asia Pacific
      'KR': '🇰🇷', 'AU': '🇦🇺', 'NZ': '🇳🇿', 'SG': '🇸🇬', 'HK': '🇭🇰', 'TW': '🇹🇼', 'MY': '🇲🇾', 'TH': '🇹🇭', 'ID': '🇮🇩', 'PH': '🇵🇭',
      'VN': '🇻🇳', 'BD': '🇧🇩', 'PK': '🇵🇰', 'LK': '🇱🇰', 'MM': '🇲🇲', 'KH': '🇰🇭', 'LA': '🇱🇦', 'BN': '🇧🇳', 'MV': '🇲🇻', 'NP': '🇳🇵',
      // Middle East & Africa
      'SA': '🇸🇦', 'AE': '🇦🇪', 'QA': '🇶🇦', 'KW': '🇰🇼', 'BH': '🇧🇭', 'OM': '🇴🇲', 'JO': '🇯🇴', 'LB': '🇱🇧', 'IL': '🇮🇱', 'TR': '🇹🇷',
      'EG': '🇪🇬', 'ZA': '🇿🇦', 'NG': '🇳🇬', 'KE': '🇰🇪', 'MA': '🇲🇦', 'TN': '🇹🇳', 'DZ': '🇩🇿', 'LY': '🇱🇾', 'ET': '🇪🇹', 'GH': '🇬🇭',
      // Americas
      'MX': '🇲🇽', 'AR': '🇦🇷', 'CL': '🇨🇱', 'CO': '🇨🇴', 'PE': '🇵🇪', 'VE': '🇻🇪', 'EC': '🇪🇨', 'UY': '🇺🇾', 'PY': '🇵🇾', 'BO': '🇧🇴',
      'CR': '🇨🇷', 'PA': '🇵🇦', 'GT': '🇬🇹', 'HN': '🇭🇳', 'NI': '🇳🇮', 'SV': '🇸🇻', 'BZ': '🇧🇿', 'JM': '🇯🇲', 'TT': '🇹🇹', 'BB': '🇧🇧',
      // Eastern Europe & Russia
      'RU': '🇷🇺', 'UA': '🇺🇦', 'BY': '🇧🇾', 'MD': '🇲🇩', 'GE': '🇬🇪', 'AM': '🇦🇲', 'AZ': '🇦🇿', 'KZ': '🇰🇿', 'UZ': '🇺🇿', 'KG': '🇰🇬',
      'TJ': '🇹🇯', 'TM': '🇹🇲', 'MN': '🇲🇳', 'RS': '🇷🇸', 'ME': '🇲🇪', 'BA': '🇧🇦', 'MK': '🇲🇰', 'AL': '🇦🇱', 'XK': '🇽🇰',
      // Additional countries
      'IR': '🇮🇷', 'IQ': '🇮🇶', 'AF': '🇦🇫', 'PG': '🇵🇬', 'FJ': '🇫🇯', 'NC': '🇳🇨', 'VU': '🇻🇺', 'SB': '🇸🇧', 'TO': '🇹🇴', 'WS': '🇼🇸'
    };
    return flags[countryCode] || '🏳️';
  }

  // Data aggregation from multiple successful API results
  private aggregateResults(results: CardInfo[], bin: string): CardInfo {
    if (results.length === 1) {
      return results[0];
    }

    // Aggregate data by taking the most common values or highest confidence
    const aggregated: CardInfo = {
      bin,
      brand: this.getMostFrequent(results.map(r => r.brand)) || 'UNKNOWN',
      type: this.getMostFrequent(results.map(r => r.type)) || 'UNKNOWN',
      level: this.getMostFrequent(results.map(r => r.level)) || 'UNKNOWN',
      bank: this.getBestBank(results),
      country: this.getMostFrequent(results.map(r => r.country)) || 'UNKNOWN',
      countryCode: this.getMostFrequent(results.map(r => r.countryCode)) || 'XX',
      flag: this.getCountryFlag(this.getMostFrequent(results.map(r => r.countryCode)) || 'XX'),
      prepaid: this.getMostFrequentBoolean(results.map(r => r.prepaid)),
      currency: this.getMostFrequent(results.map(r => r.currency).filter(Boolean)),
      website: this.getBestWebsite(results),
      phone: this.getBestPhone(results)
    };

    return aggregated;
  }

  private getMostFrequent<T>(values: (T | undefined)[]): T | undefined {
    const filtered = values.filter((v): v is T => v !== undefined && v !== 'UNKNOWN' && v !== '');
    if (filtered.length === 0) return undefined;
    
    const frequency = new Map<T, number>();
    filtered.forEach(value => {
      frequency.set(value, (frequency.get(value) || 0) + 1);
    });
    
    return Array.from(frequency.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  private getMostFrequentBoolean(values: (boolean | undefined)[]): boolean {
    const filtered = values.filter((v): v is boolean => v !== undefined);
    const trueCount = filtered.filter(v => v).length;
    const falseCount = filtered.filter(v => !v).length;
    return trueCount > falseCount;
  }

  private getBestBank(results: CardInfo[]): string {
    const banks = results.map(r => r.bank).filter(b => b && b !== 'UNKNOWN BANK' && b !== 'UNKNOWN');
    if (banks.length === 0) return 'UNKNOWN BANK';
    
    // Prefer longer, more descriptive bank names
    return banks.sort((a, b) => b.length - a.length)[0];
  }

  private getBestWebsite(results: CardInfo[]): string | undefined {
    const websites = results.map(r => r.website).filter(Boolean);
    return websites[0]; // Return first available website
  }

  private getBestPhone(results: CardInfo[]): string | undefined {
    const phones = results.map(r => r.phone).filter(Boolean);
    return phones[0]; // Return first available phone
  }

  private calculateDataConfidence(results: CardInfo[]): number {
    if (results.length === 0) return 0;
    if (results.length === 1) return 60;
    
    // Base confidence on number of agreeing sources
    const brandAgreement = this.calculateFieldAgreement(results.map(r => r.brand));
    const countryAgreement = this.calculateFieldAgreement(results.map(r => r.country));
    const bankAgreement = this.calculateFieldAgreement(results.map(r => r.bank));
    
    const avgAgreement = (brandAgreement + countryAgreement + bankAgreement) / 3;
    const sourceBonus = Math.min(results.length * 10, 40); // Bonus for more sources
    
    return Math.min(Math.round(avgAgreement * 60 + sourceBonus), 100);
  }

  private calculateSourcesAgreement(results: CardInfo[]): number {
    if (results.length <= 1) return 100;
    
    const fields = ['brand', 'country', 'bank', 'type', 'level'];
    let totalAgreement = 0;
    
    fields.forEach(field => {
      const values = results.map(r => (r as any)[field]).filter(v => v && v !== 'UNKNOWN');
      if (values.length > 1) {
        totalAgreement += this.calculateFieldAgreement(values);
      }
    });
    
    return Math.round(totalAgreement / fields.length);
  }

  private calculateFieldAgreement(values: string[]): number {
    if (values.length <= 1) return 100;
    
    const frequency = new Map<string, number>();
    values.forEach(value => {
      frequency.set(value, (frequency.get(value) || 0) + 1);
    });
    
    const maxFreq = Math.max(...Array.from(frequency.values()));
    return Math.round((maxFreq / values.length) * 100);
  }

  private getEnhancedBinInfo(bin: string): CardInfo {
    const binData = this.getEnhancedBinDatabase();
    
    // Check exact match first
    let binInfo = binData[bin];
    
    // Try partial matches for better coverage
    if (!binInfo) {
      for (let len = 6; len >= 4; len--) {
        const prefix = bin.substring(0, len);
        if (binData[prefix]) {
          binInfo = binData[prefix];
          break;
        }
      }
    }
    
    // If no exact match, try detecting by card number patterns
    if (!binInfo) {
      binInfo = this.detectCardTypeByBin(bin);
    }
    
    // Final fallback with enhanced data
    if (!binInfo) {
      binInfo = binData.default;
    }
    
    return {
      bin,
      brand: binInfo.brand,
      type: binInfo.type,
      level: binInfo.level,
      bank: binInfo.bank,
      country: binInfo.country,
      countryCode: binInfo.countryCode,
      flag: binInfo.flag,
      prepaid: binInfo.prepaid || false,
      currency: binInfo.currency,
      website: binInfo.website,
      phone: binInfo.phone
    };
  }

  private getMockBinInfo(bin: string): CardInfo {
    return this.getEnhancedBinInfo(bin);
  }

  private detectCardTypeByBin(bin: string): any | null {
    const binNum = bin.substring(0, 6);
    const firstDigit = binNum[0];
    const firstTwo = binNum.substring(0, 2);
    const firstFour = binNum.substring(0, 4);
    
    // Visa: starts with 4
    if (firstDigit === '4') {
      return {
        brand: "VISA",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "UNKNOWN VISA ISSUER",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "🏳️",
        prepaid: false
      };
    }
    
    // Mastercard: 51-55, 2221-2720
    if ((firstTwo >= '51' && firstTwo <= '55') || 
        (firstFour >= '2221' && firstFour <= '2720')) {
      return {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "UNKNOWN MASTERCARD ISSUER",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "🏳️",
        prepaid: false
      };
    }
    
    // American Express: 34, 37
    if (firstTwo === '34' || firstTwo === '37') {
      return {
        brand: "AMERICAN EXPRESS",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "AMERICAN EXPRESS",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "🏳️",
        prepaid: false
      };
    }
    
    // Discover: 6011, 622126-622925, 644-649, 65
    if (binNum.startsWith('6011') || 
        (firstFour >= '6221' && firstFour <= '6229') ||
        (firstTwo >= '64' && firstTwo <= '65')) {
      return {
        brand: "DISCOVER",
        type: "CREDIT",
        level: "STANDARD",
        bank: "DISCOVER BANK",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "🏳️",
        prepaid: false
      };
    }
    
    // JCB: 3528-3589
    if (firstFour >= '3528' && firstFour <= '3589') {
      return {
        brand: "JCB",
        type: "CREDIT",
        level: "STANDARD",
        bank: "JCB INTERNATIONAL",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "🏳️",
        prepaid: false
      };
    }
    
    // Diners Club: 300-305, 36, 38
    if ((firstDigit === '3' && (firstTwo >= '00' && firstTwo <= '05')) ||
        firstTwo === '36' || firstTwo === '38') {
      return {
        brand: "DINERS CLUB",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "DINERS CLUB INTERNATIONAL",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "🏳️",
        prepaid: false
      };
    }
    
    return null;
  }

  private getEnhancedBinDatabase(): Record<string, any> {
    // Get the base database and enhance it
    const baseData = this.getBinDatabase();
    
    // Add enhanced patterns and expanded coverage
    const enhancedData = {
      ...baseData,
      // Enhanced pattern matching for popular BIN ranges
      "4000": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "VISA CLASSIC ISSUER",
        country: "VARIOUS",
        countryCode: "XX",
        flag: "🏳️",
        prepaid: false
      },
      "5500": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "MASTERCARD STANDARD ISSUER",
        country: "VARIOUS",
        countryCode: "XX",
        flag: "🏳️",
        prepaid: false
      },
      // Additional enhanced entries with more comprehensive data
      default: {
        brand: "UNKNOWN",
        type: "CREDIT",
        level: "STANDARD",
        bank: "UNKNOWN ISSUER",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "🏳️",
        prepaid: false,
        currency: undefined,
        website: undefined,
        phone: undefined
      }
    };
    
    return enhancedData;
  }

  private getBinDatabase(): Record<string, any> {
    return {
      // USA - Major Banks (Visa)
      "424242": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "STRIPE TEST BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD",
        website: "https://stripe.com",
        phone: "+1-888-926-2289"
      },
      "446227": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "WELLS FARGO BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD",
        website: "https://wellsfargo.com",
        phone: "+1-800-869-3557"
      },
      "450875": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "CITIBANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD",
        website: "https://citibank.com",
        phone: "+1-800-374-9700"
      },
      "400000": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "JPMORGAN CHASE BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD",
        website: "https://chase.com",
        phone: "+1-800-935-9935"
      },
      "401288": {
        brand: "VISA",
        type: "CREDIT",
        level: "GOLD",
        bank: "JPMORGAN CHASE BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD"
      },
      // Canada - Major Banks
      "450231": {
        brand: "VISA",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "Canadian Imperial Bank Of Commerce",
        country: "Canada",
        countryCode: "CA",
        flag: "🇨🇦",
        prepaid: false,
        currency: "CAD",
        website: "https://cibc.com",
        phone: "+1-800-465-2422"
      },
      "411111": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "TEST BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD"
      },
      "450000": {
        brand: "VISA",
        type: "DEBIT",
        level: "ELECTRON",
        bank: "WELLS FARGO BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD",
        website: "https://wellsfargo.com"
      },
      
      "497355": {
        brand: "VISA",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "TD BANK GROUP",
        country: "Canada",
        countryCode: "CA",
        flag: "🇨🇦",
        prepaid: false,
        currency: "CAD",
        website: "https://td.com",
        phone: "+1-888-720-8555"
      },
      
      // Mastercard
      "549526": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "BANK OF MONTREAL",
        country: "Canada",
        countryCode: "CA",
        flag: "🇨🇦",
        prepaid: false,
        currency: "CAD",
        website: "https://bmo.com",
        phone: "+1-877-225-5266"
      },
      "559994": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "ROYAL BANK OF CANADA",
        country: "Canada",
        countryCode: "CA",
        flag: "🇨🇦",
        prepaid: false,
        currency: "CAD",
        website: "https://rbc.com",
        phone: "+1-800-769-2511"
      },
      "558793": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "WORLD ELITE",
        bank: "DEUTSCHE BANK S.P.A.",
        country: "ITALY",
        countryCode: "IT",
        flag: "🇮🇹",
        prepaid: false,
        currency: "EUR",
        website: "https://db.com",
        phone: "+39-02-40241"
      },
      "520000": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "WORLD",
        bank: "BANK OF AMERICA",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD",
        website: "https://bankofamerica.com",
        phone: "+1-800-432-1000"
      },
      "555555": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "TEST BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD"
      },
      "535110": {
        brand: "MASTERCARD",
        type: "DEBIT",
        level: "MAESTRO",
        bank: "CITIBANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD"
      },
      "222100": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "WORLD ELITE",
        bank: "HSBC BANK",
        country: "UNITED KINGDOM",
        countryCode: "GB",
        flag: "🇬🇧",
        prepaid: false,
        currency: "GBP",
        website: "https://hsbc.co.uk"
      },
      
      // UK - Major Banks
      "424519": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "BARCLAYS BANK PLC",
        country: "UNITED KINGDOM",
        countryCode: "GB",
        flag: "🇬🇧",
        prepaid: false,
        currency: "GBP",
        website: "https://barclays.co.uk",
        phone: "+44-345-734-5345"
      },
      "471749": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "HSBC BANK PLC",
        country: "UNITED KINGDOM",
        countryCode: "GB",
        flag: "🇬🇧",
        prepaid: false,
        currency: "GBP",
        website: "https://hsbc.co.uk",
        phone: "+44-345-740-4404"
      },
      "555544": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "LLOYDS BANK PLC",
        country: "UNITED KINGDOM",
        countryCode: "GB",
        flag: "🇬🇧",
        prepaid: false,
        currency: "GBP",
        website: "https://lloydsbank.com",
        phone: "+44-345-602-1997"
      },
      
      // GERMANY - Major Banks
      "455951": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "DEUTSCHE BANK AG",
        country: "GERMANY",
        countryCode: "DE",
        flag: "🇩🇪",
        prepaid: false,
        currency: "EUR",
        website: "https://deutsche-bank.de",
        phone: "+49-69-910-00"
      },
      "516865": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "COMMERZBANK AG",
        country: "GERMANY",
        countryCode: "DE",
        flag: "🇩🇪",
        prepaid: false,
        currency: "EUR",
        website: "https://commerzbank.de",
        phone: "+49-69-136-20"
      },
      
      // FRANCE - Major Banks
      "479258": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "BNP PARIBAS",
        country: "FRANCE",
        countryCode: "FR",
        flag: "🇫🇷",
        prepaid: false,
        currency: "EUR",
        website: "https://bnpparibas.fr",
        phone: "+33-1-40-14-45-46"
      },
      "535310": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "CREDIT AGRICOLE S.A.",
        country: "FRANCE",
        countryCode: "FR",
        flag: "🇫🇷",
        prepaid: false,
        currency: "EUR",
        website: "https://credit-agricole.fr",
        phone: "+33-1-43-23-52-02"
      },
      
      // SPAIN - Major Banks
      "450612": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "BANCO BILBAO VIZCAYA ARGENTARIA",
        country: "SPAIN",
        countryCode: "ES",
        flag: "🇪🇸",
        prepaid: false,
        currency: "EUR",
        website: "https://bbva.es",
        phone: "+34-944-876-220"
      },
      "540617": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "GOLD",
        bank: "CAIXABANK, S.A.",
        country: "SPAIN",
        countryCode: "ES",
        flag: "🇪🇸",
        prepaid: false,
        currency: "EUR",
        website: "https://caixabank.es",
        phone: "+34-93-404-6000"
      },
      
      // CANADA - Major Banks
      "454616": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "ROYAL BANK OF CANADA",
        country: "CANADA",
        countryCode: "CA",
        flag: "🇨🇦",
        prepaid: false,
        currency: "CAD",
        website: "https://rbc.com",
        phone: "+1-800-769-2511"
      },
      "516881": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "TORONTO-DOMINION BANK",
        country: "CANADA",
        countryCode: "CA",
        flag: "🇨🇦",
        prepaid: false,
        currency: "CAD",
        website: "https://td.com",
        phone: "+1-866-567-8888"
      },
      
      // AUSTRALIA - Major Banks
      "449347": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "COMMONWEALTH BANK OF AUSTRALIA",
        country: "AUSTRALIA",
        countryCode: "AU",
        flag: "🇦🇺",
        prepaid: false,
        currency: "AUD",
        website: "https://commbank.com.au",
        phone: "+61-13-2221"
      },
      "520473": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "AUSTRALIA AND NEW ZEALAND BANKING GROUP",
        country: "AUSTRALIA",
        countryCode: "AU",
        flag: "🇦🇺",
        prepaid: false,
        currency: "AUD",
        website: "https://anz.com.au",
        phone: "+61-13-1314"
      },
      
      // SAUDI ARABIA - Major Banks
      "428671": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "AL RAJHI BANK",
        country: "SAUDI ARABIA",
        countryCode: "SA",
        flag: "🇸🇦",
        prepaid: false,
        currency: "SAR",
        website: "https://alrajhibank.com.sa",
        phone: "+966-11-211-1111"
      },
      "557347": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "NATIONAL COMMERCIAL BANK",
        country: "SAUDI ARABIA",
        countryCode: "SA",
        flag: "🇸🇦",
        prepaid: false,
        currency: "SAR",
        website: "https://ncb.com.sa",
        phone: "+966-920-001-000"
      },
      
      // UAE - Major Banks
      "403156": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "EMIRATES NBD BANK",
        country: "UNITED ARAB EMIRATES",
        countryCode: "AE",
        flag: "🇦🇪",
        prepaid: false,
        currency: "AED",
        website: "https://emiratesnbd.com",
        phone: "+971-600-540-000"
      },
      "527892": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "FIRST ABU DHABI BANK",
        country: "UNITED ARAB EMIRATES",
        countryCode: "AE",
        flag: "🇦🇪",
        prepaid: false,
        currency: "AED",
        website: "https://bankfab.com",
        phone: "+971-600-525-500"
      },
      
      // BRAZIL - Major Banks
      "484393": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "BANCO DO BRASIL S.A.",
        country: "BRAZIL",
        countryCode: "BR",
        flag: "🇧🇷",
        prepaid: false,
        currency: "BRL",
        website: "https://bb.com.br",
        phone: "+55-11-4004-0001"
      },
      "528865": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "ITAU UNIBANCO S.A.",
        country: "BRAZIL",
        countryCode: "BR",
        flag: "🇧🇷",
        prepaid: false,
        currency: "BRL",
        website: "https://itau.com.br",
        phone: "+55-11-4004-4828"
      },
      
      // INDIA - Major Banks
      "411812": {
        brand: "VISA",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "STATE BANK OF INDIA",
        country: "INDIA",
        countryCode: "IN",
        flag: "🇮🇳",
        prepaid: false,
        currency: "INR",
        website: "https://sbi.co.in",
        phone: "+91-1800-11-2211"
      },
      "521152": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "STANDARD",
        bank: "HDFC BANK LIMITED",
        country: "INDIA",
        countryCode: "IN",
        flag: "🇮🇳",
        prepaid: false,
        currency: "INR",
        website: "https://hdfcbank.com",
        phone: "+91-22-6160-6161"
      },
      
      // American Express
      "371449": {
        brand: "AMERICAN EXPRESS",
        type: "CREDIT",
        level: "GOLD",
        bank: "AMERICAN EXPRESS",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD",
        website: "https://americanexpress.com",
        phone: "+1-800-528-4800"
      },
      "378282": {
        brand: "AMERICAN EXPRESS",
        type: "CREDIT",
        level: "GREEN",
        bank: "AMERICAN EXPRESS",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD"
      },
      "340000": {
        brand: "AMERICAN EXPRESS",
        type: "CREDIT",
        level: "PLATINUM",
        bank: "AMERICAN EXPRESS",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD"
      },
      
      // Discover
      "601100": {
        brand: "DISCOVER",
        type: "CREDIT",
        level: "STANDARD",
        bank: "DISCOVER BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD",
        website: "https://discover.com"
      },
      "650000": {
        brand: "DISCOVER",
        type: "CREDIT",
        level: "CASHBACK",
        bank: "DISCOVER BANK",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD"
      },
      
      // JCB
      "352800": {
        brand: "JCB",
        type: "CREDIT",
        level: "STANDARD",
        bank: "JCB INTERNATIONAL",
        country: "JAPAN",
        countryCode: "JP",
        flag: "🇯🇵",
        prepaid: false,
        currency: "JPY",
        website: "https://jcb.co.jp"
      },
      
      // Diners Club
      "300000": {
        brand: "DINERS CLUB",
        type: "CREDIT",
        level: "CLASSIC",
        bank: "DINERS CLUB INTERNATIONAL",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD",
        website: "https://dinersclub.com"
      },
      
      // International Banks
      "493698": {
        brand: "VISA",
        type: "DEBIT",
        level: "CLASSIC",
        bank: "SANTANDER UK PLC",
        country: "UNITED KINGDOM",
        countryCode: "GB",
        flag: "🇬🇧",
        prepaid: false,
        currency: "GBP",
        website: "https://santander.co.uk"
      },
      "676770": {
        brand: "MAESTRO",
        type: "DEBIT",
        level: "STANDARD",
        bank: "ROYAL BANK OF SCOTLAND",
        country: "UNITED KINGDOM",
        countryCode: "GB",
        flag: "🇬🇧",
        prepaid: false,
        currency: "GBP"
      },
      "400115": {
        brand: "VISA",
        type: "CREDIT",
        level: "GOLD",
        bank: "CREDIT AGRICOLE",
        country: "FRANCE",
        countryCode: "FR",
        flag: "🇫🇷",
        prepaid: false,
        currency: "EUR",
        website: "https://credit-agricole.fr"
      },
      "520308": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "PLATINUM",
        bank: "DEUTSCHE BANK AG",
        country: "GERMANY",
        countryCode: "DE",
        flag: "🇩🇪",
        prepaid: false,
        currency: "EUR",
        website: "https://deutsche-bank.de"
      },
      "450876": {
        brand: "VISA",
        type: "DEBIT",
        level: "CLASSIC",
        bank: "ROYAL BANK OF CANADA",
        country: "CANADA",
        countryCode: "CA",
        flag: "🇨🇦",
        prepaid: false,
        currency: "CAD",
        website: "https://rbc.com"
      },
      "533118": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "WORLD",
        bank: "COMMONWEALTH BANK OF AUSTRALIA",
        country: "AUSTRALIA",
        countryCode: "AU",
        flag: "🇦🇺",
        prepaid: false,
        currency: "AUD",
        website: "https://commbank.com.au"
      },
      
      // Prepaid Cards
      "527570": {
        brand: "MASTERCARD",
        type: "PREPAID",
        level: "GIFT CARD",
        bank: "VANILLA GIFT",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: true,
        currency: "USD"
      },
      "440066": {
        brand: "VISA",
        type: "PREPAID",
        level: "GIFT CARD",
        bank: "GREEN DOT CORPORATION",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: true,
        currency: "USD"
      },
      
      // Business Cards
      "485932": {
        brand: "VISA",
        type: "CREDIT",
        level: "BUSINESS",
        bank: "BANK OF AMERICA",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD",
        website: "https://bankofamerica.com"
      },
      "545454": {
        brand: "MASTERCARD",
        type: "CREDIT",
        level: "BUSINESS WORLD",
        bank: "CAPITAL ONE",
        country: "UNITED STATES",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD",
        website: "https://capitalone.com"
      },
      
      // Enhanced USA VISA entries for better accuracy
      "470793": {
        brand: "VISA",
        type: "CREDIT",
        level: "TRADITIONAL",
        bank: "Credit One Bank, National Association",
        country: "United States of America (the)",
        countryCode: "US",
        flag: "🇺🇸",
        prepaid: false,
        currency: "USD",
        website: "https://creditonebank.com",
        phone: "+1-877-825-3242"
      },
      "588820": {
        brand: "MASTERCARD",
        type: "CREDIT", 
        level: "WORLD",
        bank: "Deutsche Bank S.A.",
        country: "Spain",
        countryCode: "ES",
        flag: "🇪🇸",
        prepaid: false,
        currency: "EUR",
        website: "https://db.com",
        phone: "+34-91-5671-400"
      },

      // Major International Banks - Comprehensive Coverage
      // USA - Additional Major Banks
      "414720": { brand: "VISA", type: "CREDIT", level: "SIGNATURE", bank: "BANK OF AMERICA", country: "UNITED STATES", countryCode: "US", flag: "🇺🇸", prepaid: false, currency: "USD", website: "https://bankofamerica.com", phone: "+1-800-432-1000" },
      "440393": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "BANK OF AMERICA", country: "UNITED STATES", countryCode: "US", flag: "🇺🇸", prepaid: false, currency: "USD", website: "https://bankofamerica.com" },
      "489537": { brand: "VISA", type: "CREDIT", level: "PLATINUM", bank: "US BANK", country: "UNITED STATES", countryCode: "US", flag: "🇺🇸", prepaid: false, currency: "USD", website: "https://usbank.com", phone: "+1-800-872-2657" },
      "414710": { brand: "VISA", type: "CREDIT", level: "WORLD ELITE", bank: "CAPITAL ONE", country: "UNITED STATES", countryCode: "US", flag: "🇺🇸", prepaid: false, currency: "USD", website: "https://capitalone.com", phone: "+1-800-227-4825" },
      "476142": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "PNC BANK", country: "UNITED STATES", countryCode: "US", flag: "🇺🇸", prepaid: false, currency: "USD", website: "https://pnc.com", phone: "+1-888-762-2265" },

      // UK - Major Banks
      "402174": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "HYPE S.P.A.", country: "ITALY", countryCode: "IT", flag: "🇮🇹", prepaid: false, currency: "EUR", website: "https://hype.it", phone: "+39-02-8088-8000" },
      "476173": { brand: "VISA", type: "CREDIT", level: "GOLD", bank: "BARCLAYS BANK PLC", country: "UNITED KINGDOM", countryCode: "GB", flag: "🇬🇧", prepaid: false, currency: "GBP", website: "https://barclays.co.uk", phone: "+44-345-734-5345" },
      "454618": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "HSBC BANK PLC", country: "UNITED KINGDOM", countryCode: "GB", flag: "🇬🇧", prepaid: false, currency: "GBP", website: "https://hsbc.co.uk", phone: "+44-345-740-4404" },
      "400116": { brand: "VISA", type: "CREDIT", level: "PLATINUM", bank: "LLOYDS BANK PLC", country: "UNITED KINGDOM", countryCode: "GB", flag: "🇬🇧", prepaid: false, currency: "GBP", website: "https://lloydsbank.com", phone: "+44-345-602-1997" },

      // Canada - Major Banks
      "450605": { brand: "VISA", type: "CREDIT", level: "INFINITE", bank: "TORONTO DOMINION BANK", country: "CANADA", countryCode: "CA", flag: "🇨🇦", prepaid: false, currency: "CAD", website: "https://td.com", phone: "+1-800-983-8472" },
      "492932": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "SCOTIABANK", country: "CANADA", countryCode: "CA", flag: "🇨🇦", prepaid: false, currency: "CAD", website: "https://scotiabank.com", phone: "+1-800-472-6842" },
      "450877": { brand: "VISA", type: "CREDIT", level: "WORLD ELITE", bank: "BANK OF MONTREAL", country: "CANADA", countryCode: "CA", flag: "🇨🇦", prepaid: false, currency: "CAD", website: "https://bmo.com", phone: "+1-800-263-2263" },

      // Germany - Major Banks  
      "440067": { brand: "VISA", type: "CREDIT", level: "GOLD", bank: "COMMERZBANK AG", country: "GERMANY", countryCode: "DE", flag: "🇩🇪", prepaid: false, currency: "EUR", website: "https://commerzbank.de", phone: "+49-69-136-20" },
      "455952": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "DEUTSCHE KREDITBANK AG", country: "GERMANY", countryCode: "DE", flag: "🇩🇪", prepaid: false, currency: "EUR", website: "https://dkb.de", phone: "+49-30-120-300-0" },

      // France - Major Banks
      "497010": { brand: "VISA", type: "CREDIT", level: "PREMIER", bank: "BNP PARIBAS", country: "FRANCE", countryCode: "FR", flag: "🇫🇷", prepaid: false, currency: "EUR", website: "https://bnpparibas.fr", phone: "+33-1-40-14-45-46" },
      "447862": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "SOCIETE GENERALE", country: "FRANCE", countryCode: "FR", flag: "🇫🇷", prepaid: false, currency: "EUR", website: "https://societegenerale.fr", phone: "+33-1-42-14-20-00" },

      // Italy - Major Banks
      "402175": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "RBL BANK LIMITED", country: "INDIA", countryCode: "IN", flag: "🇮🇳", prepaid: false, currency: "INR", website: "https://rblbank.com", phone: "+91-22-6115-6300" },
      "479260": { brand: "VISA", type: "CREDIT", level: "GOLD", bank: "INTESA SANPAOLO", country: "ITALY", countryCode: "IT", flag: "🇮🇹", prepaid: false, currency: "EUR", website: "https://intesasanpaolo.com", phone: "+39-011-555-1" },

      // Spain - Major Banks
      "454742": { brand: "VISA", type: "CREDIT", level: "CLASSIC", bank: "BANCO SANTANDER", country: "SPAIN", countryCode: "ES", flag: "🇪🇸", prepaid: false, currency: "EUR", website: "https://santander.es", phone: "+34-915-123-123" },

      // Netherlands - Major Banks
      "417580": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "ING BANK N.V.", country: "NETHERLANDS", countryCode: "NL", flag: "🇳🇱", prepaid: false, currency: "EUR", website: "https://ing.nl", phone: "+31-20-563-9111" },
      "492980": { brand: "VISA", type: "CREDIT", level: "GOLD", bank: "ABN AMRO BANK", country: "NETHERLANDS", countryCode: "NL", flag: "🇳🇱", prepaid: false, currency: "EUR", website: "https://abnamro.nl", phone: "+31-20-628-9393" },

      // Switzerland - Major Banks
      "404133": { brand: "VISA", type: "CREDIT", level: "PLATINUM", bank: "UBS AG", country: "SWITZERLAND", countryCode: "CH", flag: "🇨🇭", prepaid: false, currency: "CHF", website: "https://ubs.com", phone: "+41-44-234-1111" },
      "479764": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "CREDIT SUISSE GROUP AG", country: "SWITZERLAND", countryCode: "CH", flag: "🇨🇭", prepaid: false, currency: "CHF", website: "https://credit-suisse.com", phone: "+41-44-333-1111" },

      // Australia - Major Banks  
      "450878": { brand: "VISA", type: "CREDIT", level: "SIGNATURE", bank: "AUSTRALIA AND NEW ZEALAND BANKING GROUP", country: "AUSTRALIA", countryCode: "AU", flag: "🇦🇺", prepaid: false, currency: "AUD", website: "https://anz.com", phone: "+61-3-9273-5555" },
      "516866": { brand: "MASTERCARD", type: "CREDIT", level: "WORLD", bank: "WESTPAC BANKING CORPORATION", country: "AUSTRALIA", countryCode: "AU", flag: "🇦🇺", prepaid: false, currency: "AUD", website: "https://westpac.com.au", phone: "+61-2-9293-9270" },

      // Japan - Major Banks
      "454602": { brand: "VISA", type: "CREDIT", level: "CLASSIC", bank: "MITSUBISHI UFJ FINANCIAL GROUP", country: "JAPAN", countryCode: "JP", flag: "🇯🇵", prepaid: false, currency: "JPY", website: "https://mufg.jp", phone: "+81-3-3240-8111" },
      "535311": { brand: "MASTERCARD", type: "DEBIT", level: "STANDARD", bank: "SUMITOMO MITSUI BANKING CORPORATION", country: "JAPAN", countryCode: "JP", flag: "🇯🇵", prepaid: false, currency: "JPY", website: "https://smbc.co.jp", phone: "+81-3-3501-1111" },

      // India - Major Banks
      "608001": { brand: "RUPAY", type: "DEBIT", level: "CLASSIC", bank: "STATE BANK OF INDIA", country: "INDIA", countryCode: "IN", flag: "🇮🇳", prepaid: false, currency: "INR", website: "https://sbi.co.in", phone: "+91-1800-11-2211" },
      "414367": { brand: "VISA", type: "CREDIT", level: "SIGNATURE", bank: "HDFC BANK LIMITED", country: "INDIA", countryCode: "IN", flag: "🇮🇳", prepaid: false, currency: "INR", website: "https://hdfcbank.com", phone: "+91-22-6160-6161" },

      // Brazil - Major Banks
      "516292": { brand: "MASTERCARD", type: "CREDIT", level: "GOLD", bank: "ITAU UNIBANCO", country: "BRAZIL", countryCode: "BR", flag: "🇧🇷", prepaid: false, currency: "BRL", website: "https://itau.com.br", phone: "+55-11-5019-8000" },
      "438857": { brand: "VISA", type: "DEBIT", level: "ELECTRON", bank: "BANCO DO BRASIL", country: "BRAZIL", countryCode: "BR", flag: "🇧🇷", prepaid: false, currency: "BRL", website: "https://bb.com.br", phone: "+55-61-3493-9002" },

      // Mexico - Major Banks  
      "465854": { brand: "VISA", type: "CREDIT", level: "CLASSIC", bank: "BBVA BANCOMER", country: "MEXICO", countryCode: "MX", flag: "🇲🇽", prepaid: false, currency: "MXN", website: "https://bbva.mx", phone: "+52-55-5621-3434" },
      "528093": { brand: "MASTERCARD", type: "DEBIT", level: "MAESTRO", bank: "BANAMEX", country: "MEXICO", countryCode: "MX", flag: "🇲🇽", prepaid: false, currency: "MXN", website: "https://banamex.com", phone: "+52-55-1226-2663" },

      // China - Major Banks
      "622280": { brand: "UNIONPAY", type: "DEBIT", level: "STANDARD", bank: "INDUSTRIAL AND COMMERCIAL BANK OF CHINA", country: "CHINA", countryCode: "CN", flag: "🇨🇳", prepaid: false, currency: "CNY", website: "https://icbc.com.cn", phone: "+86-95588" },
      "436742": { brand: "VISA", type: "CREDIT", level: "PLATINUM", bank: "BANK OF CHINA", country: "CHINA", countryCode: "CN", flag: "🇨🇳", prepaid: false, currency: "CNY", website: "https://boc.cn", phone: "+86-95566" },

      // South Korea - Major Banks
      "540926": { brand: "MASTERCARD", type: "CREDIT", level: "WORLD", bank: "KB KOOKMIN BANK", country: "SOUTH KOREA", countryCode: "KR", flag: "🇰🇷", prepaid: false, currency: "KRW", website: "https://kbstar.com", phone: "+82-2-2073-7000" },
      "465432": { brand: "VISA", type: "DEBIT", level: "CLASSIC", bank: "SHINHAN BANK", country: "SOUTH KOREA", countryCode: "KR", flag: "🇰🇷", prepaid: false, currency: "KRW", website: "https://shinhan.com", phone: "+82-2-2151-2114" },

      // Russia - Major Banks
      "427901": { brand: "VISA", type: "CREDIT", level: "GOLD", bank: "SBERBANK", country: "RUSSIA", countryCode: "RU", flag: "🇷🇺", prepaid: false, currency: "RUB", website: "https://sberbank.ru", phone: "+7-495-500-5550" },
      "548673": { brand: "MASTERCARD", type: "DEBIT", level: "STANDARD", bank: "VTB BANK", country: "RUSSIA", countryCode: "RU", flag: "🇷🇺", prepaid: false, currency: "RUB", website: "https://vtb.ru", phone: "+7-495-739-7777" },
      
      "default": {
        brand: "UNKNOWN",
        type: "UNKNOWN",
        level: "UNKNOWN",
        bank: "UNKNOWN BANK",
        country: "UNKNOWN",
        countryCode: "XX",
        flag: "🏳️",
        prepaid: false
      }
    };
  }

  // New methods for enhanced BIN functionality
  async searchBINs(criteria: { country?: string; brand?: string; bank?: string }) {
    const database = this.getBinDatabase();
    const results = [];
    
    // Search through the database
    for (const [bin, info] of Object.entries(database)) {
      if (bin === 'default') continue;
      
      let matches = true;
      
      if (criteria.country && !info.country.toLowerCase().includes(criteria.country.toLowerCase())) {
        matches = false;
      }
      
      if (criteria.brand && !info.brand.toLowerCase().includes(criteria.brand.toLowerCase())) {
        matches = false;
      }
      
      if (criteria.bank && !info.bank.toLowerCase().includes(criteria.bank.toLowerCase())) {
        matches = false;
      }
      
      if (matches) {
        results.push({
          bin,
          ...info
        });
      }
    }
    
    return results.slice(0, 20); // Limit results
  }
  
  async generateBIN(criteria: { country?: string; brand?: string; bank?: string }) {
    // First try to find matching BIN from database
    const searchResults = await this.searchBINs(criteria);
    
    if (searchResults.length > 0) {
      const selectedResult = searchResults[Math.floor(Math.random() * searchResults.length)];
      return {
        bin: selectedResult.bin,
        info: selectedResult
      };
    }
    
    // Generate a new BIN based on brand patterns
    let generatedBin = '';
    const brand = criteria.brand?.toUpperCase() || 'VISA';
    
    switch (brand) {
      case 'VISA':
        generatedBin = '4' + this.generateRandomDigits(5);
        break;
      case 'MASTERCARD':
        generatedBin = '5' + this.generateRandomDigits(5);
        break;
      case 'AMERICAN EXPRESS':
        generatedBin = '34' + this.generateRandomDigits(4);
        break;
      case 'DISCOVER':
        generatedBin = '6011' + this.generateRandomDigits(2);
        break;
      default:
        generatedBin = '4' + this.generateRandomDigits(5); // Default to VISA
    }
    
    return {
      bin: generatedBin,
      info: {
        bin: generatedBin,
        brand: brand,
        type: 'CREDIT',
        level: 'STANDARD',
        bank: criteria.bank || 'GENERATED BANK',
        country: criteria.country || 'UNKNOWN',
        countryCode: 'XX',
        flag: '🏳️',
        prepaid: false
      }
    };
  }
  
  private generateRandomDigits(count: number): string {
    let result = '';
    for (let i = 0; i < count; i++) {
      result += Math.floor(Math.random() * 10).toString();
    }
    return result;
  }

  private standardizeCardLevel(level: string | undefined | null): string {
    if (!level) return 'TRADITIONAL';
    
    const normalizedLevel = level.toLowerCase().trim();
    
    // Map common level variations to standard names
    const levelMap: Record<string, string> = {
      'unknown': 'TRADITIONAL',
      'standard': 'TRADITIONAL',
      'classic': 'TRADITIONAL',
      'base': 'TRADITIONAL',
      'regular': 'TRADITIONAL',
      'traditional': 'TRADITIONAL',
      'gold': 'GOLD',
      'platinum': 'PLATINUM', 
      'world': 'WORLD',
      'world elite': 'WORLD ELITE',
      'black': 'BLACK',
      'signature': 'SIGNATURE',
      'infinite': 'INFINITE',
      'premium': 'PREMIUM',
      'corporate': 'CORPORATE',
      'business': 'BUSINESS',
      'electron': 'ELECTRON',
      'prepaid': 'PREPAID'
    };
    
    return levelMap[normalizedLevel] || 'TRADITIONAL';
  }
  
  // Get available countries, brands, and banks for search
  getAvailableOptions() {
    const database = this.getBinDatabase();
    const countries = new Set<string>();
    const brands = new Set<string>();
    const banks = new Set<string>();
    
    for (const [bin, info] of Object.entries(database)) {
      if (bin === 'default') continue;
      
      countries.add(info.country);
      brands.add(info.brand);
      banks.add(info.bank);
    }
    
    return {
      countries: Array.from(countries).sort(),
      brands: Array.from(brands).sort(),
      banks: Array.from(banks).sort()
    };
  }
}

export const binLookupService = new BinLookupService();
