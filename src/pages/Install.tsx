import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Download, CheckCircle2, Monitor, Smartphone, Apple, Chrome } from "lucide-react";
import { useNavigate } from "react-router-dom";
import tldvLogo from "@/assets/tldv-logo-primary.png";

const Install = () => {
  const { isInstallable, isInstalled, installApp } = usePWAInstall();
  const navigate = useNavigate();

  const handleInstall = async () => {
    const success = await installApp();
    if (success) {
      // Optionally redirect after installation
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={tldvLogo} alt="TLDV Logo" className="h-16 w-auto" />
          </div>
          <CardTitle className="text-2xl">Install TLDV Portal</CardTitle>
          <CardDescription>
            Add the TLDV Portal to your desktop or home screen for quick access
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isInstalled ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">App Installed!</h3>
              <p className="text-muted-foreground mb-4">
                The TLDV Portal is now installed. You can find it on your desktop or in your applications.
              </p>
              <Button onClick={() => navigate("/admin/login")}>
                Go to Admin Portal
              </Button>
            </div>
          ) : isInstallable ? (
            <div className="text-center py-8">
              <Download className="h-16 w-16 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Ready to Install</h3>
              <p className="text-muted-foreground mb-6">
                Click the button below to install the app. It will appear as an icon on your desktop/taskbar.
              </p>
              <Button size="lg" onClick={handleInstall} className="gap-2">
                <Download className="h-5 w-5" />
                Install TLDV Portal
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center pb-4">
                <p className="text-muted-foreground">
                  Follow the instructions below for your device to install the app.
                </p>
              </div>

              {/* Desktop Chrome/Edge */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Monitor className="h-6 w-6 text-blue-500" />
                  <h4 className="font-semibold">Windows / Mac (Chrome or Edge)</h4>
                </div>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Look for the install icon <Chrome className="inline h-4 w-4" /> in the address bar (right side)</li>
                  <li>Click "Install" or "Install app"</li>
                  <li>The app will be added to your desktop and Start menu/Dock</li>
                </ol>
              </div>

              {/* Android */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Smartphone className="h-6 w-6 text-green-500" />
                  <h4 className="font-semibold">Android (Chrome)</h4>
                </div>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Tap the menu button (three dots) in Chrome</li>
                  <li>Select "Add to Home screen" or "Install app"</li>
                  <li>Confirm by tapping "Add"</li>
                </ol>
              </div>

              {/* iOS */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Apple className="h-6 w-6 text-gray-700" />
                  <h4 className="font-semibold">iPhone / iPad (Safari)</h4>
                </div>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Tap the Share button (square with arrow) at the bottom of Safari</li>
                  <li>Scroll down and tap "Add to Home Screen"</li>
                  <li>Tap "Add" in the top right corner</li>
                </ol>
              </div>

              <div className="text-center pt-4">
                <Button variant="outline" onClick={() => navigate("/admin/login")}>
                  Continue to Admin Portal
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Install;
