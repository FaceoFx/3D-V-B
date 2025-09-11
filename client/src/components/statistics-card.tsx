import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionStats } from "@/lib/types";

interface StatisticsCardProps {
  stats?: SessionStats;
}

export default function StatisticsCard({ stats }: StatisticsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center">
          <i className="fas fa-chart-line mr-2 text-primary"></i>
          Session Statistics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-secondary rounded-lg">
            <div className="text-2xl font-bold text-foreground" data-testid="stat-total">
              {stats?.totalChecked || 0}
            </div>
            <div className="text-xs text-muted-foreground">Total Checked</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="text-2xl font-bold text-green-600" data-testid="stat-passed">
              {stats?.totalPassed || 0}
            </div>
            <div className="text-xs text-green-700">Passed</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="text-2xl font-bold text-red-600" data-testid="stat-failed">
              {stats?.totalFailed || 0}
            </div>
            <div className="text-xs text-red-700">Failed</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-2xl font-bold text-blue-600" data-testid="stat-avg-time">
              {stats?.avgProcessingTime || 0}s
            </div>
            <div className="text-xs text-blue-700">Avg Time</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
