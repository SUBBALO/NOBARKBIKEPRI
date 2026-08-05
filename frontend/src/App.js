import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/Header";
import BookingPage from "@/pages/BookingPage";
import OrderStatusPage from "@/pages/OrderStatusPage";
import AdminPage from "@/pages/AdminPage";

function App() {
  return (
    <div className="App min-h-screen bg-[#FDFBF7]">
      <BrowserRouter>
        <Header />
        <Routes>
          <Route path="/" element={<BookingPage />} />
          <Route path="/order/:id" element={<OrderStatusPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
        <Toaster position="top-center" richColors />
      </BrowserRouter>
    </div>
  );
}

export default App;
