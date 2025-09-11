import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SettingsDialog = React.memo(({ open, onOpenChange }: SettingsDialogProps) => {
  // Load settings from localStorage on mount
  const loadSettings = () => {
    const saved = localStorage.getItem("3d-auth-settings");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {};
      }
    }
    return {};
  };

  const savedSettings = loadSettings();
  const [defaultBatchSize, setDefaultBatchSize] = useState(savedSettings.defaultBatchSize || 5);
  const [defaultDelay, setDefaultDelay] = useState(savedSettings.defaultDelay || 1000);
  const [autoRefreshResults, setAutoRefreshResults] = useState(savedSettings.autoRefreshResults ?? true);
  const [showAdvancedMetrics, setShowAdvancedMetrics] = useState(savedSettings.showAdvancedMetrics || false);
  const [enableSoundAlerts, setEnableSoundAlerts] = useState(savedSettings.enableSoundAlerts || false);
  const [maxConcurrentRequests, setMaxConcurrentRequests] = useState(savedSettings.maxConcurrentRequests || 10);
  const [apiTimeout, setApiTimeout] = useState(savedSettings.apiTimeout || 30);
  const [exportFormat, setExportFormat] = useState(savedSettings.exportFormat || "detailed");

  const handleSaveSettings = () => {
    // Save settings to localStorage
    const settings = {
      defaultBatchSize,
      defaultDelay,
      autoRefreshResults,
      showAdvancedMetrics,
      enableSoundAlerts,
      maxConcurrentRequests,
      apiTimeout,
      exportFormat,
      lastUpdated: Date.now()
    };
    localStorage.setItem("3d-auth-settings", JSON.stringify(settings));
    onOpenChange(false);
  };

  const handleResetSettings = () => {
    setDefaultBatchSize(5);
    setDefaultDelay(1000);
    setAutoRefreshResults(true);
    setShowAdvancedMetrics(false);
    setEnableSoundAlerts(false);
    setMaxConcurrentRequests(10);
    setApiTimeout(30);
    setExportFormat("detailed");
    localStorage.removeItem("3d-auth-settings");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <i className="fas fa-cog text-primary"></i>
            Application Settings
          </DialogTitle>
          <DialogDescription>
            Configure your 3D-Authentication Validator preferences and system settings.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="validation" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="validation">Validation</TabsTrigger>
            <TabsTrigger value="interface">Interface</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="validation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <i className="fas fa-shield-alt text-blue-500"></i>
                  Validation Settings
                </CardTitle>
                <CardDescription>
                  Configure default validation and processing parameters
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="batch-size">Default Batch Size</Label>
                    <Input
                      id="batch-size"
                      type="number"
                      min="1"
                      max="50"
                      value={defaultBatchSize}
                      onChange={(e) => setDefaultBatchSize(Number(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">Cards processed per batch (1-50)</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="delay">Default Delay (ms)</Label>
                    <Input
                      id="delay"
                      type="number"
                      min="250"
                      max="30000"
                      step="250"
                      value={defaultDelay}
                      onChange={(e) => setDefaultDelay(Number(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">Delay between batches (250-30000ms)</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeout">API Timeout (seconds)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    min="5"
                    max="120"
                    value={apiTimeout}
                    onChange={(e) => setApiTimeout(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">Maximum time to wait for API responses</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="interface" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <i className="fas fa-desktop text-green-500"></i>
                  Interface Settings
                </CardTitle>
                <CardDescription>
                  Customize the user interface and display options
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-refresh">Auto-refresh Results</Label>
                    <p className="text-xs text-muted-foreground">Automatically update results every 2 seconds</p>
                  </div>
                  <Switch
                    id="auto-refresh"
                    checked={autoRefreshResults}
                    onCheckedChange={setAutoRefreshResults}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="advanced-metrics">Show Advanced Metrics</Label>
                    <p className="text-xs text-muted-foreground">Display detailed processing times and fraud scores</p>
                  </div>
                  <Switch
                    id="advanced-metrics"
                    checked={showAdvancedMetrics}
                    onCheckedChange={setShowAdvancedMetrics}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="sound-alerts">Sound Alerts</Label>
                    <p className="text-xs text-muted-foreground">Play sound notifications for completed validations</p>
                  </div>
                  <Switch
                    id="sound-alerts"
                    checked={enableSoundAlerts}
                    onCheckedChange={setEnableSoundAlerts}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <i className="fas fa-tachometer-alt text-orange-500"></i>
                  Performance Settings
                </CardTitle>
                <CardDescription>
                  Optimize system performance and resource usage
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="concurrent">Max Concurrent Requests</Label>
                  <Input
                    id="concurrent"
                    type="number"
                    min="1"
                    max="25"
                    value={maxConcurrentRequests}
                    onChange={(e) => setMaxConcurrentRequests(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">Maximum simultaneous API requests (1-25)</p>
                </div>
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">System Status</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Memory Usage:</span>
                      <span className="ml-2 font-mono">~45MB</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cache Size:</span>
                      <span className="ml-2 font-mono">12KB</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Session:</span>
                      <span className="ml-2 text-green-600 font-medium">Active</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">API Status:</span>
                      <span className="ml-2 text-green-600 font-medium">Online</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="export" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <i className="fas fa-download text-purple-500"></i>
                  Export Settings
                </CardTitle>
                <CardDescription>
                  Configure default export formats and options
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="export-format">Default Export Format</Label>
                  <select
                    id="export-format"
                    className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value)}
                  >
                    <option value="detailed">Detailed Report</option>
                    <option value="simple">Simple Format</option>
                    <option value="visa">VISA Format</option>
                    <option value="json">JSON Export</option>
                  </select>
                </div>
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">🔒 PCI DSS Compliance Notice</h4>
                  <p className="text-sm text-blue-800">
                    All exports automatically mask sensitive card data (PAN) and remove CVV information 
                    to maintain PCI DSS compliance standards.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={handleResetSettings}>
            <i className="fas fa-undo mr-2"></i>
            Reset to Defaults
          </Button>
          <div className="space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings}>
              <i className="fas fa-save mr-2"></i>
              Save Settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

SettingsDialog.displayName = "SettingsDialog";