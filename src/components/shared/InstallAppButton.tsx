import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";

export const InstallAppButton = () => {
  const { isInstallable, isInstalled, installApp } = usePWAInstall();

  // Only show when installation is available and not already installed
  if (!isInstallable || isInstalled) {
    return null;
  }

  return (
    <Button
      onClick={installApp}
      className="fixed bottom-6 right-6 z-50 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg animate-pulse hover:animate-none"
      size="lg"
    >
      <Download className="h-5 w-5" />
      Install App
    </Button>
  );
};
