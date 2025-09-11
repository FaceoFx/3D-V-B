import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { ValidationResponse } from "@/lib/types";
import { toast } from "@/hooks/use-toast";

interface InputPanelProps {
  onValidationStarted: (results: ValidationResponse[]) => void;
  onBatchComplete: (summary: any) => void;
}

export default function InputPanel({ onValidationStarted, onBatchComplete }: InputPanelProps) {
  const [mode, setMode] = useState<'batch' | 'bin'>('batch');
  const [cardData, setCardData] = useState('');
  const [binData, setBinData] = useState('');
  const [cardCount, setCardCount] = useState(10);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Check Bot configuration
  const [batchSize, setBatchSize] = useState(5);
  const [delayBetweenBatches, setDelayBetweenBatches] = useState(3000);
  
  // API Selection - ALL APIs selected by default
  const [selectedAPIs, setSelectedAPIs] = useState<string[]>([
    'Stripe Advanced', 'Adyen Global', 'Square Secure', 'PayPal Enterprise', 'Authorize.Net Advanced', 'Worldpay Global'
  ]);
  
  // Additional options - ALL selected by default
  const [checkPayPal, setCheckPayPal] = useState(true);
  const [checkDonation, setCheckDonation] = useState(true);
  
  const availableAPIs = [
    { id: 'stripe', name: 'Stripe Advanced', icon: 'fab fa-stripe' },
    { id: 'adyen', name: 'Adyen Global', icon: 'fas fa-globe' },
    { id: 'square', name: 'Square Secure', icon: 'fab fa-square' },
    { id: 'paypal', name: 'PayPal Enterprise', icon: 'fab fa-paypal' },
    { id: 'authnet', name: 'Authorize.Net Advanced', icon: 'fas fa-shield-alt' },
    { id: 'worldpay', name: 'Worldpay Global', icon: 'fas fa-credit-card' }
  ];


  // Parse card data with multiple formats
  const parseCardData = (input: string) => {
    // Support multiple separators: | / - 
    const separators = ['|', '/', '-'];
    let parts: string[] = [];
    
    for (const sep of separators) {
      if (input.includes(sep)) {
        parts = input.split(sep);
        break;
      }
    }
    
    if (parts.length !== 4) {
      throw new Error('Invalid card format. Use: cardNumber|month|year|cvv or cardNumber/month/year/cvv or cardNumber-month-year-cvv');
    }
    
    const [cardNumber, month, year, cvv] = parts.map(p => p.trim());
    
    // Validate each part
    if (!cardNumber || cardNumber.length < 13) throw new Error('Invalid card number');
    if (!month || parseInt(month) < 1 || parseInt(month) > 12) throw new Error('Invalid month');
    if (!year || year.length < 2) throw new Error('Invalid year');
    if (!cvv || cvv.length < 3) throw new Error('Invalid CVV');
    
    // Normalize year format (ensure 4 digits)
    const normalizedYear = year.length === 2 ? `20${year}` : year;
    
    return { cardNumber, month, year: normalizedYear, cvv };
  };

  // Batch card validation mutation
  const batchValidationMutation = useMutation({
    mutationFn: async (data: { cards: string[]; selectedAPIs: string[]; checkPayPal: boolean; checkDonation: boolean; batchSize: number; delayBetweenBatches: number }) => {
      const response = await apiRequest('POST', '/api/validate/batch', {
        cards: data.cards,
        selectedAPIs: data.selectedAPIs,
        checkPayPal: data.checkPayPal,
        checkDonation: data.checkDonation,
        batchSize: data.batchSize,
        delayBetweenBatches: data.delayBetweenBatches
      });
      
      return await response.json();
    },
    onSuccess: (data: { results: ValidationResponse[] }) => {
      setProcessing(true);
      setProgress({ current: 0, total: data.results.length });
      onValidationStarted(data.results);
      
      // Monitor batch progress
      monitorBatchProgress(data.results);
      
      console.log(`Batch validation started: Processing ${data.results.length} cards`);
    },
    onError: (error: any) => {
      toast({
        title: "Batch Validation Failed",
        description: error.message || "Failed to start batch validation",
        variant: "destructive",
      });
    }
  });

  // BIN batch validation mutation
  const binValidationMutation = useMutation({
    mutationFn: async (data: { binNumber: string; cardCount: number; selectedAPIs: string[]; checkPayPal: boolean; checkDonation: boolean; batchSize: number; delayBetweenBatches: number }) => {
      const response = await apiRequest('POST', '/api/validate/bin', data);
      return response.json();
    },
    onSuccess: (data: { results: ValidationResponse[] }) => {
      setProcessing(true);
      setProgress({ current: 0, total: data.results.length });
      onValidationStarted(data.results);
      
      // Monitor batch progress
      monitorBatchProgress(data.results);
      
      // Removed toast notification as requested by user
      // toast({
      //   title: "Batch Validation Started",
      //   description: `Processing ${data.results.length} cards from BIN ${binData}`,
      // });
    },
    onError: (error: any) => {
      toast({
        title: "Batch Validation Failed",
        description: error.message || "Failed to start batch validation",
        variant: "destructive",
      });
    }
  });

  const monitorBatchProgress = async (results: ValidationResponse[]) => {
    const checkInterval = setInterval(async () => {
      try {
        const completedResults = await Promise.all(
          results.map(async (result) => {
            const response = await fetch(`/api/validate/result/${result.id}`);
            return response.json();
          })
        );

        const completed = completedResults.filter(r => r.status !== 'processing');
        setProgress({ current: completed.length, total: results.length });

        if (completed.length === results.length) {
          clearInterval(checkInterval);
          setProcessing(false);
          
          const summary = {
            total: results.length,
            passed: completed.filter(r => r.status === 'passed').length,
            failed: completed.filter(r => r.status === 'failed').length,
            avgTime: completed.reduce((sum, r) => sum + (r.processingTime || 0), 0) / completed.length,
            bin: binData,
            binInfo: completed[0]?.cardInfo
          };
          
          onBatchComplete(summary);
          
          console.log(`Batch complete: Processed ${completed.length} cards. ${summary.passed} passed, ${summary.failed} failed.`);
        }
      } catch (error) {
        console.error("Error monitoring batch progress:", error);
      }
    }, 2000);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setCardData(content);
        console.log(`File loaded: ${content.split('\n').filter(line => line.trim()).length} lines`);
      }
    };
    reader.readAsText(file);
  };

  const handleValidate = () => {
    if (mode === 'batch') {
      if (!cardData.trim()) {
        console.log("Invalid input: Please enter card data or upload a file");
        return;
      }
      
      // Validate API selection
      if (selectedAPIs.length === 0) {
        toast({
          title: "No APIs Selected",
          description: "Please select at least one payment gateway API",
          variant: "destructive",
        });
        return;
      }
      
      try {
        // Parse multiple cards from textarea
        const lines = cardData.split('\n').filter(line => line.trim());
        const validCards: string[] = [];
        
        for (const line of lines) {
          try {
            const parsed = parseCardData(line.trim());
            const standardFormat = `${parsed.cardNumber}|${parsed.month}|${parsed.year}|${parsed.cvv}`;
            validCards.push(standardFormat);
          } catch (error) {
            console.warn(`Skipping invalid card: ${line}`, error);
          }
        }
        
        if (validCards.length === 0) {
          toast({
            title: "No Valid Cards",
            description: "No valid card formats found in input",
            variant: "destructive",
          });
          return;
        }
        
        batchValidationMutation.mutate({ 
          cards: validCards,
          selectedAPIs,
          checkPayPal,
          checkDonation,
          batchSize,
          delayBetweenBatches
        });
      } catch (error) {
        console.log("Invalid card format:", error instanceof Error ? error.message : "Invalid card data format");
        return;
      }
    } else {
      if (!binData.trim() || binData.trim().length < 3 || binData.trim().length > 19) {
        toast({
          title: "Invalid BIN",
          description: "Please enter a valid BIN number (3-19 digits)",
          variant: "destructive",
        });
        return;
      }
      
      binValidationMutation.mutate({ 
        binNumber: binData.trim(), 
        cardCount,
        selectedAPIs,
        checkPayPal,
        checkDonation,
        batchSize,
        delayBetweenBatches
      });
    }
  };

  const isLoading = batchValidationMutation.isPending || binValidationMutation.isPending;

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <i className="fas fa-credit-card mr-2 text-primary"></i>
          Input Configuration
        </h2>
        
        {/* Mode Selector */}
        <div className="mb-6">
          <Label className="text-sm font-medium text-foreground mb-3 block">
            Input Type
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={mode === 'batch' ? 'default' : 'secondary'}
              onClick={() => setMode('batch')}
              className="flex items-center justify-center"
              data-testid="button-batch-mode"
            >
              <i className="fas fa-credit-card mr-2"></i>
              Card Batch
            </Button>
            <Button
              variant={mode === 'bin' ? 'default' : 'secondary'}
              onClick={() => setMode('bin')}
              className="flex items-center justify-center"
              data-testid="button-bin-mode"
            >
              <i className="fas fa-layer-group mr-2"></i>
              BIN Batch
            </Button>
          </div>
        </div>

        {/* Check Bot Configuration */}
        <Card className="bg-blue-50 border-blue-200 mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-blue-700 flex items-center">
                <i className="fas fa-robot mr-2"></i>
                Check Bot Configuration
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="batchSize" className="text-sm text-blue-600">Batch Size (cards per batch)</Label>
                <Input
                  id="batchSize"
                  type="number"
                  min="1"
                  max="50"
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value) || 5)}
                  className="mt-1"
                  placeholder="5"
                />
                <p className="text-xs text-blue-500 mt-1">How many cards to check simultaneously</p>
              </div>
              <div>
                <Label htmlFor="delayBetweenBatches" className="text-sm text-blue-600">Delay Between Batches (ms)</Label>
                <Input
                  id="delayBetweenBatches"
                  type="number"
                  min="1000"
                  max="30000"
                  value={delayBetweenBatches}
                  onChange={(e) => setDelayBetweenBatches(parseInt(e.target.value) || 3000)}
                  className="mt-1"
                  placeholder="3000"
                />
                <p className="text-xs text-blue-500 mt-1">Wait time between batches (milliseconds)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Selection Section */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <i className="fas fa-server mr-2 text-primary"></i>
              Payment Gateway APIs
              <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                {selectedAPIs.length} selected
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {availableAPIs.map((api) => (
                <div key={api.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={api.id}
                    checked={selectedAPIs.includes(api.name)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedAPIs([...selectedAPIs, api.name]);
                      } else {
                        setSelectedAPIs(selectedAPIs.filter(name => name !== api.name));
                      }
                    }}
                  />
                  <label htmlFor={api.id} className="flex items-center cursor-pointer text-sm">
                    <i className={`${api.icon} mr-2 text-muted-foreground`}></i>
                    {api.name}
                  </label>
                </div>
              ))}
            </div>
            
            <Separator className="my-4" />
            
            {/* Additional Options */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-foreground">Additional Checks</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="paypal-check"
                    checked={checkPayPal}
                    onCheckedChange={(checked) => setCheckPayPal(checked as boolean)}
                  />
                  <label htmlFor="paypal-check" className="flex items-center cursor-pointer text-sm">
                    <i className="fab fa-paypal mr-2 text-blue-600"></i>
                    PayPal Integration Check
                  </label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="donation-check"
                    checked={checkDonation}
                    onCheckedChange={(checked) => setCheckDonation(checked as boolean)}
                  />
                  <label htmlFor="donation-check" className="flex items-center cursor-pointer text-sm">
                    <i className="fas fa-donate mr-2 text-green-600"></i>
                    Donation Test ($0.50)
                  </label>
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground bg-muted p-3 rounded-lg">
                <div className="font-medium mb-1">Additional Check Info:</div>
                <div>• <strong>PayPal Integration:</strong> Tests if card can bypass PayPal security and be linked</div>
                <div>• <strong>Donation Test:</strong> Validates card with $0.50 donation on charity websites</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card Batch Input Mode */}
        {mode === 'batch' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="cardData" className="block text-sm font-medium text-foreground mb-2">
                Card Batch Data
                <span className="text-muted-foreground text-xs ml-1">
                  (one card per line: number|month|year|cvv)
                </span>
              </Label>
              <Textarea
                id="cardData"
                placeholder="Enter multiple cards, one per line:&#10;4111111111111111|12|2025|123&#10;(Format: cardNumber|month|year|cvv)"
                value={cardData}
                onChange={(e) => setCardData(e.target.value)}
                className="font-mono min-h-[120px]"
                rows={6}
                data-testid="textarea-card-data"
              />
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center"
                >
                  <i className="fas fa-upload mr-2"></i>
                  Load Visa Combo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCardData('')}
                  className="flex items-center"
                >
                  <i className="fas fa-trash mr-2"></i>
                  Clear
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <div className="text-xs text-muted-foreground mt-2">
                <div className="font-medium mb-1">Supported Formats:</div>
                <div className="space-y-1">
                  <div>• 5470186579255586/02/26/639</div>
                  <div>• 5587930167053600|01|2030|100</div>
                  <div>• 5522604001277737-10-2030-405</div>
                  <div>• Upload .txt or .csv file with cards</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BIN Input Mode */}
        {mode === 'bin' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="binData" className="block text-sm font-medium text-foreground mb-2">
                BIN Number
                <span className="text-muted-foreground text-xs ml-1">
                  (3-19 digits)
                </span>
              </Label>
              <Input
                id="binData"
                type="text"
                placeholder="Enter BIN number..."
                value={binData}
                onChange={(e) => setBinData(e.target.value)}
                maxLength={19}
                className="font-mono"
                data-testid="input-bin-data"
              />
            </div>
            <div>
              <Label htmlFor="cardCount" className="block text-sm font-medium text-foreground mb-2">
                Number of Cards to Generate
              </Label>
              <Input
                id="cardCount"
                type="number"
                min={1}
                max={100}
                value={cardCount}
                onChange={(e) => setCardCount(parseInt(e.target.value))}
                data-testid="input-card-count"
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 space-y-3">
          <Button
            onClick={handleValidate}
            disabled={isLoading || processing}
            className="w-full"
            data-testid="button-validate"
          >
            {isLoading ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Starting...
              </>
            ) : (
              <>
                <i className="fas fa-play mr-2"></i>
                Start Validation
              </>
            )}
          </Button>
          
          <div className="grid grid-cols-1 gap-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                try {
                  const response = await fetch('/api/export/text');
                  const blob = await response.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `3D-Auth-Professional-Report-${Date.now()}.txt`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  
                  console.log("Professional report generated and downloaded");
                } catch (error) {
                  console.log("Export failed: Could not generate professional report");
                }
              }}
              data-testid="button-export-text"
            >
              <i className="fas fa-file-text mr-2"></i>
              Export Professional Report
            </Button>
            
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="default"
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={async () => {
                  try {
                    const response = await fetch('/api/export/visa/passed');
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Passed-VISA-${Date.now()}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    toast({
                      title: "Passed VISA Cards Downloaded",
                      description: "Format: 5587930167053600|01|2030|100",
                    });
                  } catch (error) {
                    toast({
                      title: "Export Failed",
                      description: "Failed to export passed VISA cards",
                      variant: "destructive",
                    });
                  }
                }}
                data-testid="button-export-passed-visa"
              >
                <i className="fas fa-check-circle mr-2"></i>
                Passed Visa
              </Button>
              
              <Button
                variant="destructive"
                className="w-full"
                onClick={async () => {
                  try {
                    const response = await fetch('/api/export/visa/failed');
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Failed-VISA-${Date.now()}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    toast({
                      title: "Failed VISA Cards Downloaded",
                      description: "Format: 5587930167053600|01|2030|100",
                    });
                  } catch (error) {
                    toast({
                      title: "Export Failed",
                      description: "Failed to export failed VISA cards",
                      variant: "destructive",
                    });
                  }
                }}
                data-testid="button-export-failed-visa"
              >
                <i className="fas fa-times-circle mr-2"></i>
                Failed Visa
              </Button>
            </div>
            
          </div>
        </div>

        {/* Processing Status */}
        {processing && (
          <Card className="mt-6 bg-accent">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-accent-foreground">
                  Processing...
                </span>
                <span className="text-sm text-muted-foreground" data-testid="text-progress">
                  {progress.current}/{progress.total}
                </span>
              </div>
              <Progress 
                value={(progress.current / progress.total) * 100} 
                className="mb-2"
                data-testid="progress-validation"
              />
              <div className="text-xs text-muted-foreground">
                BIN: {binData} - Generating and validating cards...
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
