import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SearchOptions {
  countries: string[];
  brands: string[];
  banks: string[];
}

interface BinSearchResult {
  bin: string;
  brand: string;
  type: string;
  level: string;
  bank: string;
  country: string;
  countryCode: string;
  flag: string;
  prepaid?: boolean;
}

export default function BinSearch() {
  const [country, setCountry] = useState('');
  const [brand, setBrand] = useState('');
  const [bank, setBank] = useState('');
  const [searchResults, setSearchResults] = useState<BinSearchResult[]>([]);
  const [generatedBin, setGeneratedBin] = useState<string>('');
  const [isValidGenerated, setIsValidGenerated] = useState<boolean | null>(null);
  const { toast } = useToast();

  // Fetch available options
  const { data: options } = useQuery<SearchOptions>({
    queryKey: ['bin-options'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/bin/options');
      const data = await response.json();
      return {
        countries: data.countries || [],
        brands: data.brands || [],
        banks: data.banks || []
      };
    },
  });

  const searchMutation = useMutation({
    mutationFn: async (criteria: { country?: string; brand?: string; bank?: string }) => {
      const response = await apiRequest('POST', '/api/bin/search', criteria);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setSearchResults(data.results);
        toast({
          title: "Search Complete",
          description: `Found ${data.results.length} matching BINs`
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Search Failed",
        description: error instanceof Error ? error.message : "Failed to search BINs",
        variant: "destructive"
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (criteria: { country?: string; brand?: string; bank?: string }) => {
      const response = await apiRequest('POST', '/api/bin/generate', criteria);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setGeneratedBin(data.bin);
        // Check if the generated BIN is valid by looking it up
        checkGeneratedBin(data.bin);
        toast({
          title: "BIN Generated",
          description: `Generated BIN: ${data.bin}`
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate BIN",
        variant: "destructive"
      });
    },
  });

  const checkGeneratedBin = async (bin: string) => {
    try {
      const response = await apiRequest('POST', '/api/bin/lookup', { bin });
      const data = await response.json();
      setIsValidGenerated(data.isValid);
    } catch (error) {
      setIsValidGenerated(false);
    }
  };

  const handleSearch = () => {
    if (!country && !brand && !bank) {
      toast({
        title: "No Criteria",
        description: "Please select at least one search criteria",
        variant: "destructive"
      });
      return;
    }

    const criteria: any = {};
    if (country) criteria.country = country;
    if (brand) criteria.brand = brand;
    if (bank) criteria.bank = bank;

    searchMutation.mutate(criteria);
  };

  const handleGenerate = () => {
    const criteria: any = {};
    if (country) criteria.country = country;
    if (brand) criteria.brand = brand;
    if (bank) criteria.bank = bank;

    generateMutation.mutate(criteria);
  };

  const clearAll = () => {
    setCountry('');
    setBrand('');
    setBank('');
    setSearchResults([]);
    setGeneratedBin('');
    setIsValidGenerated(null);
  };

  const getValidityBadge = (isValid: boolean | null) => {
    if (isValid === null) return null;
    
    return (
      <Badge variant={isValid ? "default" : "secondary"} className="ml-2">
        {isValid ? "Valid" : "Generated"}
      </Badge>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center">
          <i className="fas fa-search mr-2 text-primary"></i>
          Search for a Bank Identification Number (BIN)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Select country, brand, and bank to find or generate BINs
        </p>
      </CardHeader>
      
      <CardContent className="p-6 space-y-6">
        {/* Search Criteria */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger>
                <SelectValue placeholder="SAUDI ARABIA" />
              </SelectTrigger>
              <SelectContent>
                {options?.countries.map((countryOption) => (
                  <SelectItem key={countryOption} value={countryOption}>
                    {countryOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Brand</Label>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger>
                <SelectValue placeholder="MAESTRO" />
              </SelectTrigger>
              <SelectContent>
                {options?.brands.map((brandOption) => (
                  <SelectItem key={brandOption} value={brandOption}>
                    {brandOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Bank</Label>
            <Select value={bank} onValueChange={setBank}>
              <SelectTrigger>
                <SelectValue placeholder="AL AHLI BANK" />
              </SelectTrigger>
              <SelectContent>
                {options?.banks.map((bankOption) => (
                  <SelectItem key={bankOption} value={bankOption}>
                    {bankOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button 
            onClick={handleSearch}
            disabled={searchMutation.isPending}
            variant="default"
          >
            {searchMutation.isPending ? (
              <i className="fas fa-spinner fa-spin mr-2"></i>
            ) : (
              <i className="fas fa-search mr-2"></i>
            )}
            Search BINs
          </Button>
          
          <Button 
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            variant="outline"
          >
            {generateMutation.isPending ? (
              <i className="fas fa-spinner fa-spin mr-2"></i>
            ) : (
              <i className="fas fa-magic mr-2"></i>
            )}
            Generate BIN
          </Button>
          
          <Button 
            onClick={clearAll}
            variant="ghost"
          >
            <i className="fas fa-times mr-2"></i>
            Clear All
          </Button>
        </div>

        {/* Generated BIN */}
        {generatedBin && (
          <div className="mt-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2 flex items-center">
                <i className="fas fa-magic mr-2"></i>
                Generated BIN
                {getValidityBadge(isValidGenerated)}
              </h4>
              <div className="text-2xl font-mono font-bold text-blue-700 mb-2">
                {generatedBin}
              </div>
              <p className="text-sm text-blue-600">
                You can use this BIN to generate test cards or validate card patterns
              </p>
            </div>
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mt-6">
            <h4 className="font-semibold mb-4 flex items-center">
              <i className="fas fa-list mr-2"></i>
              BIN Details
            </h4>
            
            <div className="space-y-4">
              {searchResults.slice(0, 1).map((result, index) => (
                <div key={result.bin} className="border rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">BIN</div>
                      <div className="text-lg font-mono">{result.bin}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Bank</div>
                      <div className="text-lg">{result.bank}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Brand</div>
                      <div className="text-lg">{result.brand}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Type</div>
                      <div className="text-lg">Check with BIN Checker</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Level</div>
                      <div className="text-lg">Check with BIN Checker</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Country</div>
                      <div className="text-lg flex items-center">
                        <span className="mr-2">{result.flag}</span>
                        {result.country} ({result.countryCode})
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Contact</div>
                      <div className="text-lg">Check with BIN Checker</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {searchResults.length > 1 && (
              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Showing 1 of {searchResults.length} results
                </p>
              </div>
            )}

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h5 className="font-medium mb-2">Note</h5>
              <p className="text-sm text-muted-foreground">
                BIN Search tools only provide brief BIN data. To get details BIN information, kindly use{' '}
                <span className="font-medium text-primary">BIN Checker</span>.
              </p>
            </div>
          </div>
        )}

        {searchResults.length === 0 && searchMutation.isSuccess && (
          <div className="text-center py-8 text-muted-foreground">
            <i className="fas fa-info-circle text-2xl mb-2"></i>
            <p>No BINs found matching your criteria</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}