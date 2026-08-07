import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Header } from "./reusable_sections/Header";
import { Footer } from "./reusable_sections/Footer";
import { Home } from "./pages/Home/Home";
import { AppointmentBooking } from "./pages/AppointmentBooking/AppointmentBooking";
import { Pricing } from "./pages/Pricing/Pricing";
import { Contact } from "./pages/Contact/Contact";
import { AboutUs } from "./pages/AboutUs/AboutUs";
import { Privacy } from "./pages/Privacy/Privacy";
import { Terms } from "./pages/Terms/Terms";
import { NotFound } from "./pages/NotFound/NotFound";
import { ScrollToTop } from "./components/ScrollToTop";

const AuthLayout = lazy(() => import("./AuthApp"));
const PortalLogin = lazy(() => import("./portal/PortalLogin").then((m) => ({ default: m.PortalLogin })));
const PortalLayout = lazy(() => import("./portal/PortalLayout").then((m) => ({ default: m.PortalLayout })));
const PortalDashboard = lazy(() =>
  import("./portal/PortalDashboard").then((m) => ({ default: m.PortalDashboard }))
);
const PortalChangeRequests = lazy(() =>
  import("./portal/PortalChangeRequests").then((m) => ({ default: m.PortalChangeRequests }))
);
const AdminLayout = lazy(() => import("./admin/AdminLayout").then((m) => ({ default: m.AdminLayout })));
const AdminOverview = lazy(() => import("./admin/AdminOverview").then((m) => ({ default: m.AdminOverview })));
const AdminLeads = lazy(() => import("./admin/AdminLeads").then((m) => ({ default: m.AdminLeads })));
const AdminCustomers = lazy(() => import("./admin/AdminCustomers").then((m) => ({ default: m.AdminCustomers })));
const AdminCustomerDetail = lazy(() =>
  import("./admin/AdminCustomerDetail").then((m) => ({ default: m.AdminCustomerDetail }))
);
const AdminChangeRequests = lazy(() =>
  import("./admin/AdminChangeRequests").then((m) => ({ default: m.AdminChangeRequests }))
);
const AdminOutreach = lazy(() => import("./admin/AdminOutreach").then((m) => ({ default: m.AdminOutreach })));
const AdminOutreachReview = lazy(() =>
  import("./admin/AdminOutreachReview").then((m) => ({ default: m.AdminOutreachReview }))
);
const AdminOutreachStats = lazy(() =>
  import("./admin/AdminOutreachStats").then((m) => ({ default: m.AdminOutreachStats }))
);
const AdminActivity = lazy(() => import("./admin/AdminActivity").then((m) => ({ default: m.AdminActivity })));

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
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={null}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<PortalLogin />} />
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<PortalDashboard />} />
              <Route path="requests" element={<PortalChangeRequests />} />
            </Route>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminOverview />} />
              <Route path="leads" element={<AdminLeads />} />
              <Route path="customers" element={<AdminCustomers />} />
              <Route path="customers/:id" element={<AdminCustomerDetail />} />
              <Route path="change-requests" element={<AdminChangeRequests />} />
              <Route path="outreach" element={<AdminOutreach />} />
              <Route path="outreach/review" element={<AdminOutreachReview />} />
              <Route path="outreach/stats" element={<AdminOutreachStats />} />
              <Route path="activity" element={<AdminActivity />} />
            </Route>
          </Route>
          <Route path="/*" element={<MarketingSite />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
