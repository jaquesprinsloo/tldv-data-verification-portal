const TLDVHeader = () => {
  return (
    <header className="bg-destructive text-white py-4 sm:py-6 border-b-4 border-primary">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center sm:justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full bg-white flex items-center justify-center">
                <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-primary"></div>
              </div>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold font-poppins">TLDV</h1>
              <p className="text-xs sm:text-sm text-white/90">Data Verification Portal</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TLDVHeader;
