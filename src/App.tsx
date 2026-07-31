import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Header } from "./reusable_sections/Header";
import { Footer } from "./reusable_sections/Footer";
import { Home } from "./pages/Home/Home";
import { AppointmentBooking } from "./pages/AppointmentBooking/AppointmentBooking";
import { Pricing } from "./pages/Pricing/Pricing";
import { Contact } from "./pages/Contact/Contact";
import { AboutUs } from "./pages/AboutUs/AboutUs";
import { Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { RequireAdmin, RequireCustomer } from "./lib/authGuard";
import { PortalLogin } from "./portal/PortalLogin";
import { PortalLayout } from "./portal/PortalLayout";
import { PortalDashboard } from "./portal/PortalDashboard";
import { PortalChangeRequests } from "./portal/PortalChangeRequests";
import { AdminLayout } from "./admin/AdminLayout";
import { AdminLeads } from "./admin/AdminLeads";
import { AdminCustomers } from "./admin/AdminCustomers";

function MarketingSite() {
  return (
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
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<PortalLogin />} />
          <Route
            path="/portal"
            element={
              <RequireCustomer>
                <PortalLayout />
              </RequireCustomer>
            }
          >
            <Route index element={<PortalDashboard />} />
            <Route path="requests" element={<PortalChangeRequests />} />
          </Route>
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="customers" replace />} />
            <Route path="leads" element={<AdminLeads />} />
            <Route path="customers" element={<AdminCustomers />} />
          </Route>
          <Route path="/*" element={<MarketingSite />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
