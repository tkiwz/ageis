/**
 * English dictionary — the source of truth for keys.
 * ar.ts is typed as Messages, so every key here must exist in Arabic too.
 */
export const en = {
  app: {
    name: "AEGIS",
    tagline: "HSSE Command Platform",
    description: "Real-time HSSE monitoring, predictive safety analytics and incident response.",
  },
  common: {
    loading: "Loading…",
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    create: "Create",
    close: "Close",
    search: "Search",
    filter: "Filter",
    all: "All",
    refresh: "Refresh",
    retry: "Try again",
    back: "Back",
    next: "Next",
    yes: "Yes",
    no: "No",
    none: "None",
    actions: "Actions",
    status: "Status",
    details: "Details",
    viewAll: "View all",
    noData: "No data yet",
    error: "Something went wrong",
    online: "Online",
    offline: "Offline",
    required: "Required",
    confirmDelete: "Delete this item? This cannot be undone.",
  },
  auth: {
    signIn: "Sign in",
    signingIn: "Signing in…",
    signOut: "Sign out",
    email: "Email",
    emailPlaceholder: "name@company.com",
    password: "Password",
    invalidCredentials: "Incorrect email or password",
    invalidInput: "Enter a valid email and password",
    lockedOut: "Too many attempts. Try again later.",
    title: "Sign in to your account",
    footer: "Authorized personnel only",
  },
  layout: {
    systemOnline: "System online",
    language: "Language",
    switchTo: "العربية",
    profile: "Profile",
    accessDenied: "You don't have access to that page.",
  },
  roles: {
    ADMIN: "Administrator",
    HSSE_MANAGER: "HSSE Manager",
    SAFETY_OFFICER: "Safety Officer",
    SUPERVISOR: "Supervisor",
    OPERATOR: "Operator",
    CONTRACTOR: "Contractor",
  },
};

type DeepString<T> = { [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> };
export type Messages = DeepString<typeof en>;
