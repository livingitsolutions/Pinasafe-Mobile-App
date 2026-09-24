// Philippine Standard Geographic Code (PSGC) API Service
// This uses the official Philippine Statistics Authority data

export interface PhilippineLocation {
  code: string;
  name: string;
  oldName?: string;
  islandGroupCode?: string;
  psgc10DigitCode?: string;
}

export interface Region extends PhilippineLocation {
  provinces: Province[];
}

export interface Province extends PhilippineLocation {
  regionCode: string;
  cities: City[];
}

export interface City extends PhilippineLocation {
  provinceCode: string;
  zipCode?: string;
  barangays: Barangay[];
}

export interface Barangay extends PhilippineLocation {
  cityCode: string;
}

class PhilippineLocationsAPI {
  private readonly BASE_URL = process.env.PSGC_API_URL || 'https://psgc.gitlab.io/api';
  private cache: Map<string, any> = new Map();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  // Fallback data in case API is unavailable
  private fallbackData = {
    regions: [
      { code: '080000000', name: 'Region VIII (Eastern Visayas)' }
    ],
    provinces: [
      { code: '084300000', name: 'Leyte', regionCode: '080000000' },
      { code: '084800000', name: 'Southern Leyte', regionCode: '080000000' },
      { code: '086000000', name: 'Samar (Western Samar)', regionCode: '080000000' },
      { code: '087800000', name: 'Eastern Samar', regionCode: '080000000' },
      { code: '086000000', name: 'Northern Samar', regionCode: '080000000' },
      { code: '087200000', name: 'Biliran', regionCode: '080000000' }
    ],
    cities: [
      { code: 'HIL001', name: 'Hilongos', provinceCode: '084300000', zipCode: '6524' },
      { code: 'BAT001', name: 'Bato', provinceCode: '084300000', zipCode: '6525' },
      { code: 'MAT001', name: 'Matalom', provinceCode: '084300000', zipCode: '6526' },
      { code: 'INO001', name: 'Inopacan', provinceCode: '084300000', zipCode: '6527' },
      { code: 'HIN001', name: 'Hindang', provinceCode: '084300000', zipCode: '6528' },
      { code: 'ISA001', name: 'Isabel', provinceCode: '084300000', zipCode: '6529' },
      { code: 'MER001', name: 'Merida', provinceCode: '084300000', zipCode: '6530' },
      { code: 'PAL001', name: 'Palompon', provinceCode: '084300000', zipCode: '6538' },
      { code: 'TAB001', name: 'Tabango', provinceCode: '084300000', zipCode: '6539' },
      { code: 'VIL001', name: 'Villaba', provinceCode: '084300000', zipCode: '6537' },
    ]
  };

  private async fetchWithCache(endpoint: string): Promise<any> {
    const cacheKey = endpoint;
    const cached = this.cache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      const response = await fetch(`${this.BASE_URL}${endpoint}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.warn(`API request failed for ${endpoint}, using fallback data:`, error);
      return this.getFallbackData(endpoint);
    }
  }

  private getFallbackData(endpoint: string): any {
    if (endpoint.includes('/regions')) return this.fallbackData.regions;
    if (endpoint.includes('/provinces')) return this.fallbackData.provinces;
    if (endpoint.includes('/cities')) return this.fallbackData.cities;
    return [];
  }

  async getAllRegions(): Promise<Region[]> {
    const regions = await this.fetchWithCache('/regions');
    return regions.map((region: any) => ({
      code: region.code,
      name: region.name,
      provinces: []
    }));
  }

  async getAllProvinces(): Promise<Province[]> {
    const provinces = await this.fetchWithCache('/provinces');
    return provinces.map((province: any) => ({
      code: province.code,
      name: province.name,
      regionCode: province.regionCode,
      cities: []
    }));
  }

  async getProvincesByRegion(regionCode: string): Promise<Province[]> {
    const provinces = await this.fetchWithCache(`/regions/${regionCode}/provinces`);
    return provinces.map((province: any) => ({
      code: province.code,
      name: province.name,
      regionCode: regionCode,
      cities: []
    }));
  }

  async getAllCities(): Promise<City[]> {
    const cities = await this.fetchWithCache('/cities-municipalities');
    return cities.map((city: any) => ({
      code: city.code,
      name: city.name,
      provinceCode: city.provinceCode,
      zipCode: city.zipCode || this.getZipCodeForCity(city.name),
      barangays: []
    }));
  }

  async getCitiesByProvince(provinceCode: string): Promise<City[]> {
    const cities = await this.fetchWithCache(`/provinces/${provinceCode}/cities-municipalities`);
    return cities.map((city: any) => ({
      code: city.code,
      name: city.name,
      provinceCode: provinceCode,
      zipCode: city.zipCode || this.getZipCodeForCity(city.name),
      barangays: []
    }));
  }

  async getBarangaysByCity(cityCode: string): Promise<Barangay[]> {
    const barangays = await this.fetchWithCache(`/cities-municipalities/${cityCode}/barangays`);
    return barangays.map((barangay: any) => ({
      code: barangay.code,
      name: barangay.name,
      cityCode: cityCode
    }));
  }

  // Search functions
  async searchCities(query: string): Promise<City[]> {
    const allCities = await this.getAllCities();
    return allCities.filter(city => 
      city.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  async searchProvinces(query: string): Promise<Province[]> {
    const allProvinces = await this.getAllProvinces();
    return allProvinces.filter(province => 
      province.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  // Get province by city
  async getProvinceByCity(cityCode: string): Promise<Province | null> {
    try {
      const allCities = await this.getAllCities();
      const city = allCities.find(c => c.code === cityCode);
      
      if (!city) return null;
      
      const allProvinces = await this.getAllProvinces();
      return allProvinces.find(p => p.code === city.provinceCode) || null;
    } catch (error) {
      console.error('Error getting province by city:', error);
      return null;
    }
  }

  // Get zip code for a city (fallback data)
  private getZipCodeForCity(cityName: string): string {
    const zipCodeMap: Record<string, string> = {
      // Leyte Province
      'Hilongos': '6524',
      'Bato': '6525',
      'Matalom': '6526',
      'Inopacan': '6527',
      'Hindang': '6528',
      'Isabel': '6529',
      'Merida': '6530',
      'Palompon': '6538',
      'Tabango': '6539',
      'Villaba': '6537',
      'Ormoc': '6541',
      'Tacloban': '6500',
      'Baybay': '6521',
      'Abuyog': '6510',
      'Alangalang': '6516',
      'Babatngon': '6517',
      'Burauen': '6518',
      'Calubian': '6519',
      'Capoocan': '6520',
      'Carigara': '6515',
      'Dagami': '6522',
      'Dulag': '6505',
      'Jaro': '6523',
      'Javier': '6512',
      'Julita': '6531',
      'Kananga': '6532',
      'La Paz': '6533',
      'Leyte': '6534',
      'MacArthur': '6535',
      'Mahaplag': '6536',
      'Mayorga': '6540',
      'Palo': '6501',
      'Pastrana': '6542',
      'San Isidro': '6543',
      'San Miguel': '6544',
      'Santa Fe': '6545',
      'Tabontabon': '6546',
      'Tanauan': '6502',
      'Tolosa': '6503',
      'Tunga': '6547',
      'Albuera': '6548',
      
      // Southern Leyte
      'Maasin': '6600',
      'Sogod': '6606',
      'Bontoc': '6601',
      'Hinunangan': '6602',
      'Hinundayan': '6603',
      'Libagon': '6604',
      'Liloan': '6605',
      'Macrohon': '6607',
      'Malitbog': '6608',
      'Padre Burgos': '6609',
      'Pintuyan': '6610',
      'Saint Bernard': '6611',
      'San Francisco': '6612',
      'San Juan': '6613',
      'San Ricardo': '6614',
      'Silago': '6615',
      'Tomas Oppus': '6616',
      
      // Add more cities as needed
    };
    
    return zipCodeMap[cityName] || '0000';
  }

  // Utility functions for form integration
  async getCityOptions(): Promise<Array<{label: string, value: string, subtitle: string, zipCode: string}>> {
    try {
      const cities = await this.getAllCities();
      const provinces = await this.getAllProvinces();
      
      return cities.map(city => {
        const province = provinces.find(p => p.code === city.provinceCode);
        return {
          label: city.name,
          value: city.code,
          subtitle: province ? `${province.name} Province` : 'Unknown Province',
          zipCode: city.zipCode || '0000'
        };
      });
    } catch (error) {
      console.error('Error getting city options:', error);
      // Return fallback data for Leyte cities
      return [
        { label: 'Hilongos', value: 'HIL001', subtitle: 'Leyte Province', zipCode: '6524' },
        { label: 'Bato', value: 'BAT001', subtitle: 'Leyte Province', zipCode: '6525' },
        { label: 'Matalom', value: 'MAT001', subtitle: 'Leyte Province', zipCode: '6526' },
        { label: 'Inopacan', value: 'INO001', subtitle: 'Leyte Province', zipCode: '6527' }
      ];
    }
  }

  async getBarangayOptions(cityCode: string): Promise<Array<{label: string, value: string}>> {
    try {
      const barangays = await this.getBarangaysByCity(cityCode);
      return barangays.map(barangay => ({
        label: barangay.name,
        value: barangay.code
      }));
    } catch (error) {
      console.error('Error getting barangay options:', error);
      return [];
    }
  }

  async getProvinceOptions(): Promise<Array<{label: string, value: string, subtitle: string}>> {
    try {
      const provinces = await this.getAllProvinces();
      const regions = await this.getAllRegions();
      
      return provinces.map(province => {
        const region = regions.find(r => r.code === province.regionCode);
        return {
          label: province.name,
          value: province.code,
          subtitle: region ? region.name : 'Unknown Region'
        };
      });
    } catch (error) {
      console.error('Error getting province options:', error);
      return [
        { label: 'Leyte', value: 'LEY001', subtitle: 'Region VIII (Eastern Visayas)' }
      ];
    }
  }

  // Clear cache (useful for testing or forcing refresh)
  clearCache(): void {
    this.cache.clear();
  }
}

export const philippineLocationsAPI = new PhilippineLocationsAPI();