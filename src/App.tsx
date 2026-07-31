import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Header } from "./reusable_sections/Header";
import { Footer } from "./reusable_sections/Footer";
import { Home } from "./pages/Home/Home";
import { AppointmentBooking } from "./pages/AppointmentBooking/AppointmentBooking";
import { Pricing } from "./pages/Pricing/Pricing";
import { Contact } from "./pages/Contact/Contact";
import { AboutUs } from "./pages/AboutUs/AboutUs";

function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/appointment-booking" element={<AppointmentBooking />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/about-us" element={<AboutUs />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
