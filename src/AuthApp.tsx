import { Outlet } from "react-router-dom";
import { AuthProvider } from "./lib/auth";

export default function AuthLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
