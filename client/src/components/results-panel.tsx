import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ResultItem from "@/components/result-item";
import { ValidationResponse } from "@/lib/types";

interface ResultsPanelProps {
  results: ValidationResponse[];
  onClearResults?: () => void;
}

export default function ResultsPanel({ results, onClearResults }: ResultsPanelProps) {
  const [filteredResults, setFilteredResults] = useState<ValidationResponse[]>(results);
  const [filterType, setFilterType] = useState<string>('all');
  const [sortType, setSortType] = useState<string>('newest');

  // Update filtered results when props change
  useEffect(() => {
    let filtered = [...results];
    
    // Apply filter
    switch (filterType) {
      case 'passed':
        filtered = filtered.filter(r => r.status === 'passed');
        break;
      case 'failed':
        filtered = filtered.filter(r => r.status === 'failed');
        break;
      case 'processing':
        filtered = filtered.filter(r => r.status === 'processing');
        break;
      case 'visa':
        filtered = filtered.filter(r => 
          r.cardInfo?.brand?.toUpperCase() === 'VISA' || r.cardNumber.startsWith('4')
        );
        break;
      default:
        // 'all' - no filtering
        break;
    }
    
    // Apply sort
    switch (sortType) {
      case 'newest':
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'oldest':
        filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'card-number':
        filtered.sort((a, b) => a.cardNumber.localeCompare(b.cardNumber));
        break;
      case 'status':
        filtered.sort((a, b) => a.status.localeCompare(b.status));
        break;
      case 'processing-time':
        filtered.sort((a, b) => (b.processingTime || 0) - (a.processingTime || 0));
        break;
      default:
        break;
    }
    
    setFilteredResults(filtered);
  }, [results, filterType, sortType]);

  const handleClear = () => {
    setFilteredResults([]);
    setFilterType('all');
    setSortType('newest');
    // Clear the actual results from parent component
    if (onClearResults) {
      onClearResults();
    }
  };
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <i className="fas fa-list-ul mr-2 text-primary"></i>
            Validation Results
          </CardTitle>
          <div className="flex items-center space-x-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="button-filter">
                  <i className="fas fa-filter mr-1"></i>
                  Filter {filterType !== 'all' && `(${filterType})`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setFilterType('all')}>
                  <i className="fas fa-list mr-2"></i>
                  All Results
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType('passed')}>
                  <i className="fas fa-check-circle mr-2 text-green-600"></i>
                  Passed Only
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType('failed')}>
                  <i className="fas fa-times-circle mr-2 text-red-600"></i>
                  Failed Only
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType('processing')}>
                  <i className="fas fa-spinner mr-2 text-yellow-600"></i>
                  Processing
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType('visa')}>
                  <i className="fas fa-credit-card mr-2 text-blue-600"></i>
                  VISA Cards Only
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="button-sort">
                  <i className="fas fa-sort mr-1"></i>
                  Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSortType('newest')}>
                  <i className="fas fa-clock mr-2"></i>
                  Newest First
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortType('oldest')}>
                  <i className="fas fa-history mr-2"></i>
                  Oldest First
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortType('card-number')}>
                  <i className="fas fa-sort-numeric-down mr-2"></i>
                  Card Number
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortType('status')}>
                  <i className="fas fa-flag mr-2"></i>
                  Status
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortType('processing-time')}>
                  <i className="fas fa-stopwatch mr-2"></i>
                  Processing Time
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button variant="outline" size="sm" onClick={handleClear} data-testid="button-clear">
              <i className="fas fa-trash mr-1"></i>
              Clear
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-6">
        {filteredResults.length === 0 && results.length > 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
              <i className="fas fa-filter text-2xl text-muted-foreground"></i>
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              No Results Match Filter
            </h3>
            <p className="text-muted-foreground mb-4">
              No validation results match the current filter criteria
            </p>
            <Button variant="outline" onClick={() => { setFilterType('all'); setSortType('newest'); }}>
              <i className="fas fa-refresh mr-2"></i>
              Clear Filters
            </Button>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
              <i className="fas fa-credit-card text-2xl text-muted-foreground"></i>
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              No Validations Yet
            </h3>
            <p className="text-muted-foreground mb-4">
              Enter card data or BIN number to start validating 3D-Authentication
            </p>
            <div className="text-sm text-muted-foreground bg-muted p-4 rounded-lg max-w-md mx-auto">
              <div className="font-medium mb-2">Supported Formats:</div>
              <div className="font-mono text-xs space-y-1">
                <div>Single: cardNumber|month|year|cvv</div>
                <div>Also: cardNumber/month/year/cvv</div>
                <div>Also: cardNumber-month-year-cvv</div>
                <div>BIN: 6-digit BIN number (generates multiple cards)</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4" data-testid="results-container">
            <div className="text-sm text-muted-foreground mb-4">
              Showing {filteredResults.length} of {results.length} results
              {filterType !== 'all' && ` (filtered by: ${filterType})`}
            </div>
            {filteredResults.map((result, index) => (
              <ResultItem key={`${result.id}-${index}-${result.createdAt}`} result={result} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
