const TLDVHeader = () => {
  return (
    <header className="bg-destructive text-white py-6 border-b-4 border-primary">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center">
              <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center">
                <div className="h-8 w-8 rounded-full bg-primary"></div>
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold font-poppins">TLDV</h1>
              <p className="text-sm text-white/90">True Lie Detectors & Vetting</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TLDVHeader;
