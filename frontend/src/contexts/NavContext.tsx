"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

export interface NavigationItem {
  href: string;
  label: string;
  description?: string;
  icon: string;
}

export interface NavigationSection {
  title: string;
  links: NavigationItem[];
}

export type NavigationMode = "mobile" | "tablet" | "desktop";

interface NavContextType {
  // Navigation state
  currentPage: string;
  setCurrentPage: (page: string) => void;

  // Navigation data
  navigationSections: NavigationSection[];
  coreFeatures: NavigationItem[];

  // UI state
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  navigationMode: NavigationMode;
  setNavigationMode: (mode: NavigationMode) => void;

  // Navigation helpers
  navigateTo: (href: string) => void;
  getCurrentSection: () => NavigationSection | null;
  getBreadcrumbs: () => string[];
  toggleSidebar: () => void;
}

// Core features for mobile floating buttons and sidebar
const coreFeatures: NavigationItem[] = [
  {
    href: "/",
    label: "ホーム",
    icon: "home",
  },
  {
    href: "/journal",
    label: "日記",
    icon: "book-open",
  },
  {
    href: "/workout",
    label: "鍛え",
    icon: "fire",
  },
  {
    href: "/vitals",
    label: "体",
    icon: "heart",
  },
  {
    href: "/capital",
    label: "資本",
    icon: "currency-dollar",
  },
];

const defaultNavigationSections: NavigationSection[] = [
  {
    title: "Core Features",
    links: coreFeatures,
  },
  {
    title: "Services",
    links: [
      {
        href: "/services/oura",
        label: "Oura Integration",
        description: "Connect and sync with Oura ring",
        icon: "heart",
      },
      {
        href: "/services/plaid",
        label: "Plaid Integration",
        description: "Connect financial accounts",
        icon: "credit-card",
      },
      {
        href: "/capital/transactions",
        label: "Transactions",
        description: "View and filter transaction history",
        icon: "credit-card",
      },
    ],
  },
  {
    title: "Meta Management",
    links: [
      {
        href: "/meta",
        label: "Meta Dashboard",
        description: "Overview of metadata management",
        icon: "chart-bar",
      },
      {
        href: "/meta/persons",
        label: "Person Registry",
        description: "Manage people in your journal",
        icon: "users",
      },
      {
        href: "/meta/places",
        label: "Place Registry",
        description: "Manage places in your journal",
        icon: "map-pin",
      },
      {
        href: "/meta/tagging",
        label: "Tagging System",
        description: "Organize content with tags",
        icon: "tag",
      },
      {
        href: "/meta/keywording",
        label: "Keywording",
        description: "Manage keywords and best practices",
        icon: "key",
      },
    ],
  },
  {
    title: "Legacy & Legal",
    links: [
      {
        href: "/capital/deprecated-plaid",
        label: "Deprecated Plaid",
        description: "Legacy Plaid integration",
        icon: "archive-box",
      },
      {
        href: "/privacy",
        label: "Privacy Policy",
        description: "Privacy and data protection",
        icon: "shield-check",
      },
      {
        href: "/terms",
        label: "Terms of Service",
        description: "Terms and conditions",
        icon: "document-text",
      },
    ],
  },
];

const NavContext = createContext<NavContextType | undefined>(undefined);

interface NavProviderProps {
  children: ReactNode;
}

export function NavProvider({ children }: NavProviderProps) {
  const [currentPage, setCurrentPage] = useState<string>("/");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [navigationMode, setNavigationMode] =
    useState<NavigationMode>("desktop");

  const navigateTo = (href: string) => {
    setCurrentPage(href);
    // Close sidebar on navigation for tablet mode, keep open for desktop
    if (navigationMode === "tablet") {
      setSidebarOpen(false);
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const getCurrentSection = (): NavigationSection | null => {
    // Find which section contains the current page
    for (const section of defaultNavigationSections) {
      if (section.links.some((link) => link.href === currentPage)) {
        return section;
      }
    }
    return null;
  };

  const getBreadcrumbs = (): string[] => {
    const breadcrumbs: string[] = [];

    // Add home if not on home page
    if (currentPage !== "/") {
      breadcrumbs.push("Home");
    }

    // Find current page in navigation sections
    for (const section of defaultNavigationSections) {
      const link = section.links.find((link) => link.href === currentPage);
      if (link) {
        breadcrumbs.push(section.title);
        breadcrumbs.push(link.label);
        break;
      }
    }

    return breadcrumbs;
  };

  const value: NavContextType = {
    currentPage,
    setCurrentPage,
    navigationSections: defaultNavigationSections,
    coreFeatures,
    sidebarOpen,
    setSidebarOpen,
    navigationMode,
    setNavigationMode,
    navigateTo,
    getCurrentSection,
    getBreadcrumbs,
    toggleSidebar,
  };

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  const context = useContext(NavContext);
  if (context === undefined) {
    throw new Error("useNav must be used within a NavProvider");
  }
  return context;
}
