import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BatchSummaryProps {
  summary: {
    total: number;
    passed: number;
    failed: number;
    avgTime: number;
    bin: string;
    binInfo?: {
      brand: string;
      type: string;
      level: string;
      bank: string;
      country: string;
      flag: string;
    };
  };
}

export default function BatchSummary({ summary }: BatchSummaryProps) {
  const passedPercentage = Math.round((summary.passed / summary.total) * 100);
  const failedPercentage = Math.round((summary.failed / summary.total) * 100);

  return (
    <Card data-testid="batch-summary">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center">
          <i className="fas fa-chart-bar mr-2 text-primary"></i>
          Batch Processing Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-secondary rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-foreground" data-testid="batch-total">
              {summary.total}
            </div>
            <div className="text-sm text-muted-foreground">Total Cards</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600" data-testid="batch-passed">
              {summary.passed}
            </div>
            <div className="text-sm text-green-700">Passed ({passedPercentage}%)</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-600" data-testid="batch-failed">
              {summary.failed}
            </div>
            <div className="text-sm text-red-700">Failed ({failedPercentage}%)</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-600" data-testid="batch-avg-time">
              {summary.avgTime.toFixed(1)}s
            </div>
            <div className="text-sm text-blue-700">Avg Time</div>
          </div>
        </div>

        <div className="bg-muted rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">BIN Analysis:</span>
            <span className="text-sm text-muted-foreground font-mono" data-testid="batch-bin">
              {summary.bin}
            </span>
          </div>
          {summary.binInfo && (
            <div className="text-sm text-muted-foreground space-y-1">
              <div data-testid="batch-bin-info">
                {summary.binInfo.brand} - {summary.binInfo.type} - {summary.binInfo.level}
              </div>
              <div data-testid="batch-bank">
                Bank: {summary.binInfo.bank}
              </div>
              <div data-testid="batch-country">
                Country: {summary.binInfo.country} {summary.binInfo.flag}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
