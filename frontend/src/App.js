import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import BookingPage from "@/pages/BookingPage";
import OrderStatusPage from "@/pages/OrderStatusPage";
import UploadProofPage from "@/pages/UploadProofPage";
import AdminPage from "@/pages/AdminPage";

function Shell() {
  const loc = useLocation();
  const isAdmin = loc.pathname.startsWith("/admin");
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
