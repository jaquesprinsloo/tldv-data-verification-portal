import { useLocation, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import preapplicheckLogo from "@/assets/preapplicheck-logo.png";

const NotFound = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const token = params.get("token");

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  // If the URL carries an invitation token, this is a candidate who hit a stale
  // or mistyped link. Redirect them to the application page instead of showing
  // a generic 404 that exposes admin navigation.
  if (token) {
    return <Navigate to={`/preapplicheck-apply?token=${encodeURIComponent(token)}`} replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <Card className="max-w-md w-full text-center bg-zinc-950 border-zinc-800">
        <CardContent className="pt-8 pb-8">
          <img src={preapplicheckLogo} alt="PreAppliCheck" className="h-20 w-auto mx-auto mb-6" />
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2 text-white">Page Not Found</h2>
          <p className="text-zinc-400">
            The page you are looking for does not exist. If you were sent an invitation link,
            please use the original link from your email.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotFound;
