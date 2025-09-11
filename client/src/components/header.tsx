import { useState } from "react";
import { SessionStats } from "@/lib/types";
import { SettingsDialog } from "./settings-dialog";

interface HeaderProps {
  sessionStats?: SessionStats;
}

export default function Header({ sessionStats }: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  const currentTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return (
    <>
      <header className="border-b bg-card shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <i className="fas fa-shield-alt text-primary-foreground text-lg"></i>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground" data-testid="app-title">
                  3D-Auth Validator
                </h1>
                <p className="text-sm text-muted-foreground">
                  Professional Payment Processing Tool
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-muted-foreground">
                <span data-testid="session-timestamp">Session: {currentTime}</span>
              </div>
              <button 
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-settings"
              >
                <i className="fas fa-cog mr-2"></i>Settings
              </button>
            </div>
          </div>
        </div>
      </header>
      
      <SettingsDialog 
        open={settingsOpen} 
        onOpenChange={setSettingsOpen}
      />
    </>
  );
}
