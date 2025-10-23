import tldvLogo from "@/assets/tldv-logo-primary.png";

const TLDVHeader = () => {
  return (
    <header className="bg-background border-b shadow-sm py-4 sm:py-6">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center sm:justify-start">
          <div className="flex items-center gap-3 sm:gap-4">
            <img 
              src={tldvLogo} 
              alt="TLDV Logo" 
              className="h-10 w-auto sm:h-12"
            />
            <div className="border-l pl-3 sm:pl-4">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">TLDV</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Data Verification Portal</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TLDVHeader;
