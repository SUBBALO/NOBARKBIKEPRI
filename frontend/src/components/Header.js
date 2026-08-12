import { Link, useLocation } from "react-router-dom";
import { LOGOS } from "@/lib/apiClient";
import { ShieldCheck, Upload } from "lucide-react";

export const Header = () => {
  const loc = useLocation();
  const onAdmin = loc.pathname.startsWith("/admin");
  return (
    <header
      data-testid="site-header"
      className="sticky top-0 z-50 backdrop-blur-xl bg-[#FDFBF7]/85 border-b border-black/5"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
        <Link to="/" data-testid="header-logo-link" className="flex items-center gap-3 sm:gap-4">
          <img src={LOGOS.kbi} alt="KBI" className="h-9 sm:h-11 w-auto object-contain" />
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4">
          <Link
            to="/"
            data-testid="nav-pesan"
            className="hidden sm:inline text-sm font-medium text-[#7A241F] hover:text-[#B26A1E] transition-colors"
          >
            Pesan Tiket
          </Link>
          <Link
            to="/upload"
            data-testid="nav-upload"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#7A241F] hover:text-[#B26A1E] transition-colors"
          >
            <Upload className="h-4 w-4" />
            <span>Upload Bukti</span>
          </Link>
          {onAdmin && (
            <Link
              to="/"
              data-testid="nav-admin"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#7A241F] hover:text-[#B26A1E] transition-colors"
            >
              <ShieldCheck className="h-4 w-4" />
              Ke Pemesanan
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};
