import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { ValidationResponse } from "@/lib/types";

interface DashboardStats {
  totalProcessed: number;
  successRate: number;
  avgProcessingTime: number;
  riskDistribution: { low: number; medium: number; high: number };
  gatewayPerformance: { name: string; success: number; total: number }[];
  realtimeMetrics: { timestamp: string; count: number; success: number }[];
  fraudDetection: { blocked: number; flagged: number; score: number };
}

export default function AdvancedDashboard() {
  const [liveStats, setLiveStats] = useState<DashboardStats | null>(null);
  const [realtimeData, setRealtimeData] = useState<ValidationResponse[]>([]);

  // Fetch results with real-time updates
  const { data: results = [], refetch } = useQuery({
    queryKey: ['validation-results'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/validate/results');
      return response.json();
    },
    refetchInterval: 2000,
  });

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/session');
      return response.json();
    },
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (results && results.length > 0) {
      setRealtimeData(results);
      setLiveStats(calculateDashboardStats(results));
    }
  }, [results]);

  const calculateDashboardStats = (results: ValidationResponse[]): DashboardStats => {
    const completed = results.filter(r => r.status !== 'processing');
    const passed = results.filter(r => r.status === 'passed');
    
    const riskDistribution = results.reduce((acc, r) => {
      const score = r.fraudScore || 50;
      if (score <= 30) acc.low++;
      else if (score <= 70) acc.medium++;
      else acc.high++;
      return acc;
    }, { low: 0, medium: 0, high: 0 });

    const gatewayStats = results.reduce((acc, r) => {
      const gateway = extractGatewayName(r.gateway || 'Unknown');
      if (!acc[gateway]) acc[gateway] = { success: 0, total: 0 };
      acc[gateway].total++;
      if (r.status === 'passed') acc[gateway].success++;
      return acc;
    }, {} as Record<string, { success: number; total: number }>);

    const gatewayPerformance = Object.entries(gatewayStats).map(([name, stats]) => ({
      name,
      success: stats.success,
      total: stats.total
    }));

    const fraudBlocked = results.filter(r => (r.fraudScore || 0) > 90).length;
    const fraudFlagged = results.filter(r => (r.fraudScore || 0) > 70 && (r.fraudScore || 0) <= 90).length;
    const avgFraudScore = results.reduce((sum, r) => sum + (r.fraudScore || 0), 0) / results.length;

    return {
      totalProcessed: results.length,
      successRate: completed.length > 0 ? (passed.length / completed.length) * 100 : 0,
      avgProcessingTime: completed.reduce((sum, r) => sum + (r.processingTime || 0), 0) / (completed.length || 1),
      riskDistribution,
      gatewayPerformance,
      realtimeMetrics: [], // Would be calculated from historical data
      fraudDetection: {
        blocked: fraudBlocked,
        flagged: fraudFlagged,
        score: avgFraudScore
      }
    };
  };

  const extractGatewayName = (gateway: string): string => {
    return gateway.split(' ')[0] || 'Unknown';
  };

  if (!liveStats) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <i className="fas fa-chart-line text-4xl text-muted-foreground mb-4"></i>
            <p className="text-muted-foreground">Loading advanced analytics...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Real-time Metrics Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Total Processed</p>
                <p className="text-2xl font-bold text-blue-900">{liveStats.totalProcessed}</p>
              </div>
              <i className="fas fa-credit-card text-2xl text-blue-500"></i>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Success Rate</p>
                <p className="text-2xl font-bold text-green-900">{liveStats.successRate.toFixed(1)}%</p>
              </div>
              <i className="fas fa-check-circle text-2xl text-green-500"></i>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600">Avg Processing</p>
                <p className="text-2xl font-bold text-orange-900">{liveStats.avgProcessingTime.toFixed(1)}s</p>
              </div>
              <i className="fas fa-clock text-2xl text-orange-500"></i>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600">Fraud Score</p>
                <p className="text-2xl font-bold text-red-900">{liveStats.fraudDetection.score.toFixed(0)}/100</p>
              </div>
              <i className="fas fa-shield-alt text-2xl text-red-500"></i>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="gateways">Gateways</TabsTrigger>
          <TabsTrigger value="risk">Risk Analysis</TabsTrigger>
          <TabsTrigger value="realtime">Real-time</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-chart-pie mr-2 text-primary"></i>
                  Risk Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                      Low Risk (0-30)
                    </span>
                    <Badge variant="secondary">{liveStats.riskDistribution.low}</Badge>
                  </div>
                  <Progress value={(liveStats.riskDistribution.low / liveStats.totalProcessed) * 100} className="bg-green-100" />
                  
                  <div className="flex items-center justify-between">
                    <span className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
                      Medium Risk (31-70)
                    </span>
                    <Badge variant="secondary">{liveStats.riskDistribution.medium}</Badge>
                  </div>
                  <Progress value={(liveStats.riskDistribution.medium / liveStats.totalProcessed) * 100} className="bg-yellow-100" />
                  
                  <div className="flex items-center justify-between">
                    <span className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                      High Risk (71-100)
                    </span>
                    <Badge variant="destructive">{liveStats.riskDistribution.high}</Badge>
                  </div>
                  <Progress value={(liveStats.riskDistribution.high / liveStats.totalProcessed) * 100} className="bg-red-100" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-shield-alt mr-2 text-primary"></i>
                  Fraud Detection Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200">
                    <div>
                      <p className="font-medium text-red-800">Blocked Transactions</p>
                      <p className="text-sm text-red-600">High fraud score (&gt;90)</p>
                    </div>
                    <Badge variant="destructive" className="text-lg px-3 py-1">
                      {liveStats.fraudDetection.blocked}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                    <div>
                      <p className="font-medium text-yellow-800">Flagged for Review</p>
                      <p className="text-sm text-yellow-600">Medium-high risk (70-90)</p>
                    </div>
                    <Badge className="bg-yellow-500 text-lg px-3 py-1">
                      {liveStats.fraudDetection.flagged}
                    </Badge>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="font-medium text-blue-800 mb-2">AI Fraud Detection</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-blue-600">Machine Learning Score</span>
                      <span className="font-mono text-blue-900">{liveStats.fraudDetection.score.toFixed(1)}/100</span>
                    </div>
                    <Progress 
                      value={liveStats.fraudDetection.score} 
                      className="mt-2"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="gateways" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <i className="fas fa-network-wired mr-2 text-primary"></i>
                Payment Gateway Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {liveStats.gatewayPerformance.map((gateway, index) => {
                  const successRate = gateway.total > 0 ? (gateway.success / gateway.total) * 100 : 0;
                  return (
                    <div key={index} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{gateway.name}</h4>
                        <div className="flex items-center space-x-2">
                          <Badge variant={successRate > 80 ? "default" : successRate > 50 ? "secondary" : "destructive"}>
                            {successRate.toFixed(1)}%
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {gateway.success}/{gateway.total}
                          </span>
                        </div>
                      </div>
                      <Progress value={successRate} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>Success Rate</span>
                        <span>{gateway.success} successful authentications</span>
                      </div>
                    </div>
                  );
                })}
                
                {liveStats.gatewayPerformance.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <i className="fas fa-chart-bar text-3xl mb-2"></i>
                    <p>No gateway data available yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risk" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-brain mr-2 text-primary"></i>
                  AI Risk Assessment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Pattern Recognition</span>
                      <Badge variant="default">ACTIVE</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Analyzing card number patterns and sequences</p>
                  </div>
                  
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Behavioral Analysis</span>
                      <Badge variant="default">ACTIVE</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Monitoring transaction velocity and timing</p>
                  </div>
                  
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Device Fingerprinting</span>
                      <Badge variant="default">ACTIVE</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Tracking device and browser characteristics</p>
                  </div>
                  
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Geolocation Validation</span>
                      <Badge variant="default">ACTIVE</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Verifying transaction geography patterns</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <i className="fas fa-exclamation-triangle mr-2 text-primary"></i>
                  Security Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {liveStats.fraudDetection.blocked > 0 && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center">
                        <i className="fas fa-ban text-red-500 mr-2"></i>
                        <span className="text-red-800 font-medium">High Risk Detected</span>
                      </div>
                      <p className="text-sm text-red-600 mt-1">
                        {liveStats.fraudDetection.blocked} transactions blocked due to fraud indicators
                      </p>
                    </div>
                  )}
                  
                  {liveStats.fraudDetection.flagged > 0 && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center">
                        <i className="fas fa-flag text-yellow-500 mr-2"></i>
                        <span className="text-yellow-800 font-medium">Manual Review Required</span>
                      </div>
                      <p className="text-sm text-yellow-600 mt-1">
                        {liveStats.fraudDetection.flagged} transactions require manual verification
                      </p>
                    </div>
                  )}
                  
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center">
                      <i className="fas fa-check-circle text-green-500 mr-2"></i>
                      <span className="text-green-800 font-medium">System Healthy</span>
                    </div>
                    <p className="text-sm text-green-600 mt-1">
                      All security systems operational and monitoring active
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="realtime" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <div className="flex items-center mr-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-1"></div>
                  <i className="fas fa-tachometer-alt text-primary"></i>
                </div>
                Live Transaction Monitor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {realtimeData.slice(-10).reverse().map((result, index) => (
                  <div 
                    key={result.id} 
                    className={`p-3 rounded-lg border transition-all duration-300 ${
                      result.status === 'passed' ? 'bg-green-50 border-green-200' :
                      result.status === 'failed' ? 'bg-red-50 border-red-200' :
                      'bg-yellow-50 border-yellow-200'
                    } ${index === 0 ? 'ring-2 ring-blue-200' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                          result.status === 'passed' ? 'bg-green-500' :
                          result.status === 'failed' ? 'bg-red-500' :
                          'bg-yellow-500 animate-pulse'
                        }`}></div>
                        <span className="font-mono text-sm">
                          {result.cardNumber.substring(0, 4)}****{result.cardNumber.substring(result.cardNumber.length - 4)}
                        </span>
                        <Badge variant={result.status === 'passed' ? 'default' : result.status === 'failed' ? 'destructive' : 'secondary'}>
                          {result.status.toUpperCase()}
                        </Badge>
                        {result.cardInfo?.brand && (
                          <Badge variant="outline">{result.cardInfo.brand}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(result.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                    {result.gateway && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Gateway: {result.gateway} | Processing: {result.processingTime || 0}s
                      </div>
                    )}
                  </div>
                ))}
                
                {realtimeData.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <i className="fas fa-broadcast-tower text-3xl mb-2"></i>
                    <p>Waiting for transaction data...</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}