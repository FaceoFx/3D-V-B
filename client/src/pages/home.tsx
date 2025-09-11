import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/header";
import InputPanel from "@/components/input-panel";
import ResultsPanel from "@/components/results-panel";
import StatisticsCard from "@/components/statistics-card";
import BatchSummary from "@/components/batch-summary";
import AdvancedDashboard from "@/components/advanced-dashboard";
import BinLookup from "@/components/bin-lookup";
import { ValidationResponse, SessionStats } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Home() {
  const [results, setResults] = useState<ValidationResponse[]>([]);
  const [batchSummary, setBatchSummary] = useState<any>(null);

  // Fetch session stats
  const { data: sessionStats, refetch: refetchSession } = useQuery<SessionStats>({
    queryKey: ['/api/session'],
    refetchInterval: 2000, // Refresh every 2 seconds during processing
  });

  // Fetch all validation results
  const { data: allResults, refetch: refetchResults } = useQuery<ValidationResponse[]>({
    queryKey: ['/api/validate/results'],
    refetchInterval: 2000, // Refresh every 2 seconds
  });

  useEffect(() => {
    if (allResults) {
      setResults(allResults);
    }
  }, [allResults]);

  const handleValidationStarted = (newResults: ValidationResponse[]) => {
    setResults(prev => [...newResults, ...prev]);
    refetchSession();
  };

  const handleBatchComplete = (summary: any) => {
    setBatchSummary(summary);
    refetchResults();
    refetchSession();
  };

  const handleClearResults = async () => {
    try {
      // Clear results on the server first
      const response = await fetch('/api/validate/results', {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to clear server results');
      }
      
      // Clear local state
      setResults([]);
      setBatchSummary(null);
      
      // Force refetch to get empty results from server
      refetchResults();
      refetchSession();
    } catch (error) {
      console.error('Failed to clear results:', error);
      // Fallback: still clear local state even if server clear fails
      setResults([]);
      setBatchSummary(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header sessionStats={sessionStats} />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="validation" className="space-y-6">
          <TabsList className="grid grid-cols-3 w-full max-w-3xl mx-auto">
            <TabsTrigger value="validation" className="flex items-center">
              <i className="fas fa-credit-card mr-2"></i>
              Card Validation
            </TabsTrigger>
            <TabsTrigger value="binlookup" className="flex items-center">
              <i className="fas fa-search mr-2"></i>
              BIN Lookup
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center">
              <i className="fas fa-chart-line mr-2"></i>
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="validation" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-6">
                <InputPanel 
                  onValidationStarted={handleValidationStarted}
                  onBatchComplete={handleBatchComplete}
                />
                <StatisticsCard stats={sessionStats} />
              </div>
              
              <div className="lg:col-span-2 space-y-6">
                <ResultsPanel results={results} onClearResults={handleClearResults} />
                {batchSummary && <BatchSummary summary={batchSummary} />}
              </div>
            </div>
          </TabsContent>


          <TabsContent value="binlookup" className="space-y-6">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-foreground mb-2">Professional BIN Lookup</h2>
                <p className="text-muted-foreground text-lg">
                  Get comprehensive information about any Bank Identification Number
                </p>
                <div className="text-sm text-muted-foreground mt-2">
                  Powered by multiple APIs: BinList.net • BinCheck.io • BinSearch.io • BinCodes.com
                </div>
              </div>
              <BinLookup />
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <AdvancedDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
