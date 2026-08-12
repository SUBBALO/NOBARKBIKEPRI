import { CONTACT, LOGOS } from "@/lib/apiClient";
import { Phone, MessageCircle } from "lucide-react";

export const Footer = () => (
  <footer data-testid="site-footer" className="mt-16 border-t border-black/5 bg-white/60">
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
      <div className="flex items-center gap-3">
        <img src={LOGOS.kbi} alt="KBI" className="h-9 w-auto object-contain" />
      </div>
      <div className="text-sm">
        <p className="text-[#7A6A5E] mb-1">Butuh bantuan? Hubungi kontak person:</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-[#7A241F]">{CONTACT.label}</span>
          <a href={`tel:${CONTACT.phone.replace(/-/g, "")}`} data-testid="footer-contact-phone"
            className="inline-flex items-center gap-1.5 text-[#B26A1E] hover:underline font-medium">
            <Phone className="h-4 w-4" /> {CONTACT.phone}
          </a>
          <a href={CONTACT.waLink} target="_blank" rel="noreferrer" data-testid="footer-contact-wa"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#2F703E]/10 text-[#255E33] px-3 py-1 hover:bg-[#2F703E]/20 transition-colors">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
        </div>
      </div>
    </div>
    <div className="border-t border-black/5">
      <p className="text-center text-[11px] text-[#9CA3AF] py-3">
        Developed by{" "}
        <a href="https://instagram.com/alam_tenang" target="_blank" rel="noreferrer"
          data-testid="footer-credit" className="text-[#9CA3AF] hover:text-[#B26A1E] hover:underline transition-colors">
          Alam Tenang
        </a>
      </p>
    </div>
  </footer>
);
