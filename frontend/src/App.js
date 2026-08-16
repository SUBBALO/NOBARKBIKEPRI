import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import BookingPage from "@/pages/BookingPage";
import OrderStatusPage from "@/pages/OrderStatusPage";
import UploadProofPage from "@/pages/UploadProofPage";
import AdminPage from "@/pages/AdminPage";
import CheckinPage from "@/pages/CheckinPage";
import WalkinPage from "@/pages/WalkinPage";
import DisplayPage from "@/pages/DisplayPage";

function Shell() {
  const loc = useLocation();
  const isAdmin = loc.pathname.startsWith("/admin");
  const standalone = loc.pathname.startsWith("/checkin") || loc.pathname.startsWith("/walkin") || loc.pathname.startsWith("/display");
  if (standalone) {
    return (
      <Routes>
        <Route path="/checkin" element={<CheckinPage />} />
        <Route path="/walkin" element={<WalkinPage />} />
        <Route path="/display" element={<DisplayPage />} />
      </Routes>
    );
  }
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<BookingPage />} />
        <Route path="/order/:id" element={<OrderStatusPage />} />
        <Route path="/upload" element={<UploadProofPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
      {!isAdmin && <Footer />}
    </>
  );
}

function App() {
  return (
    <div className="App min-h-screen bg-[#FDFBF7]">
      <BrowserRouter>
        <Shell />
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </div>
  );
}

export default App;
