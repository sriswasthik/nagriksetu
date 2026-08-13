export type AppRole =
  | "citizen"
  | "officer"
  | "supervisor"
  | "government_admin";

export function isStaffRole(role: AppRole) {
  return (
    role === "officer" ||
    role === "supervisor" ||
    role === "government_admin"
  );
}

export function canAccessGovernment(role: AppRole) {
  return role === "government_admin";
}

export function canAccessOfficerDashboard(role: AppRole) {
  return (
    role === "officer" ||
    role === "supervisor"
  );
}

export function canVerifyWorkOrders(role: AppRole) {
  return role === "supervisor";
}