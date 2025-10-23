import tldvIcon from "@/assets/tldv-icon-red.jpg";

const TLDVHeader = () => {
  return (
    <header className="bg-black py-4 sm:py-6">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center sm:justify-start">
          <div className="flex items-center gap-3 sm:gap-4">
            <img 
              src={tldvIcon} 
              alt="TLDV Logo" 
              className="h-10 w-10 sm:h-12 sm:w-12 object-contain"
            />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Data Verification Portal</h1>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TLDVHeader;
