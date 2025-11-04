"use client";

import Link from "next/link";
import Image from "next/image";
import { useNav, NavigationMode } from "@/contexts/NavContext";
import { useEffect, useState } from "react";
import {
  HomeIcon,
  BookOpenIcon,
  FireIcon,
  HeartIcon,
  CreditCardIcon,
  ChartBarIcon,
  UsersIcon,
  MapPinIcon,
  TagIcon,
  KeyIcon,
  ArchiveBoxIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";

// Helper function to get icon component
function getIconComponent(iconName: string) {
  switch (iconName) {
    case "home":
      return HomeIcon;
    case "book-open":
      return BookOpenIcon;
    case "fire":
      return FireIcon;
    case "heart":
      return HeartIcon;
    case "credit-card":
      return CreditCardIcon;
    case "chart-bar":
      return ChartBarIcon;
    case "users":
      return UsersIcon;
    case "map-pin":
      return MapPinIcon;
    case "tag":
      return TagIcon;
    case "key":
      return KeyIcon;
    case "archive-box":
      return ArchiveBoxIcon;
    case "shield-check":
      return ShieldCheckIcon;
    case "document-text":
      return DocumentTextIcon;
    case "currency-dollar":
      return CurrencyDollarIcon;
    default:
      return HomeIcon;
  }
}

// Mobile floating button group
function MobileFloatingButtons() {
  const { coreFeatures, navigateTo, currentPage } = useNav();

  return (
    <div className="fixed bottom-3 left-1/2 transform -translate-x-1/2 z-50 md:hidden">
      <div className="flex bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm rounded-full shadow-lg border border-gray-200 dark:border-gray-700 p-2 gap-1">
        {coreFeatures.map((feature, index) => {
          const IconComponent = getIconComponent(feature.icon);
          return (
            <Link
              key={index}
              href={feature.href}
              onClick={() => navigateTo(feature.href)}
              className={`flex flex-col items-center w-24 py-2 rounded-full transition-colors ${
                currentPage === feature.href
                  ? "bg-gray-400/10 dark:bg-gray-700/50 backdrop-blur-sm text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-400/20 dark:hover:bg-gray-700/30"
              }`}
            >
              <IconComponent className="w-5 h-5 mb-0.5" />
              <div className="text-xs font-medium">{feature.label}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Tablet expandable side menu
function TabletSideMenu() {
  const { coreFeatures, sidebarOpen, toggleSidebar, navigateTo, currentPage } =
    useNav();

  return (
    <>
      {/* Toggle button */}
      {/* <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-40 bg-white dark:bg-gray-900 rounded-xs shadow-md p-3 border border-gray-200 dark:border-gray-700 lg:hidden md:block hidden"
      >
        <div className="w-6 h-6 flex flex-col justify-center space-y-1">
          <div
            className={`w-full h-0.5 bg-gray-600 dark:bg-gray-400 transition-transform ${
              sidebarOpen ? "rotate-45 translate-y-1.5" : ""
            }`}
          ></div>
          <div
            className={`w-full h-0.5 bg-gray-600 dark:bg-gray-400 transition-opacity ${
              sidebarOpen ? "opacity-0" : ""
            }`}
          ></div>
          <div
            className={`w-full h-0.5 bg-gray-600 dark:bg-gray-400 transition-transform ${
              sidebarOpen ? "-rotate-45 -translate-y-1.5" : ""
            }`}
          ></div>
        </div>
      </button> */}

      {/* Side menu */}
      <div
        className={`fixed top-0 left-0 h-full bg-white dark:bg-gray-900 shadow-lg border-r border-gray-200 dark:border-gray-700 z-30 transition-transform duration-300 lg:hidden md:block hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="w-64 h-full pt-16">
          {/* Logo */}
          <div className="px-4 pt-4 pb-6 flex justify-center">
            <Link href="/">
              <Image
                src="/images/wyat-vertical.svg"
                alt="Wyat Logo"
                width={80}
                height={120}
                className="dark:invert"
              />
            </Link>
          </div>
          <nav className="p-4">
            <ul className="space-y-2">
              {coreFeatures.map((feature, index) => {
                const IconComponent = getIconComponent(feature.icon);
                return (
                  <li key={index}>
                    <Link
                      href={feature.href}
                      onClick={() => navigateTo(feature.href)}
                      className={`flex items-center px-4 py-3 rounded-xs transition-colors ${
                        currentPage === feature.href
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                          : "text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      <IconComponent className="w-5 h-5 mr-3" />
                      <div>
                        <div className="text-sm font-medium">
                          {feature.label}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-25 dark:bg-opacity-50 z-20 lg:hidden md:block hidden"
          onClick={toggleSidebar}
        />
      )}
    </>
  );
}

// Desktop collapsible side menu
function DesktopSideMenu() {
  const { coreFeatures, sidebarOpen, toggleSidebar, navigateTo, currentPage } =
    useNav();

  return (
    <>
      {/* Toggle button */}
      {/* <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-40 bg-white dark:bg-gray-900 rounded-xs shadow-md p-3 border border-gray-200 dark:border-gray-800 hidden lg:block"
      >
        <div className="w-6 h-6 flex flex-col justify-center space-y-1">
          <div
            className={`w-full h-0.5 bg-gray-600 dark:bg-gray-400 transition-transform ${
              sidebarOpen ? "rotate-45 translate-y-1.5" : ""
            }`}
          ></div>
          <div
            className={`w-full h-0.5 bg-gray-600 dark:bg-gray-400 transition-opacity ${
              sidebarOpen ? "opacity-0" : ""
            }`}
          ></div>
          <div
            className={`w-full h-0.5 bg-gray-600 dark:bg-gray-400 transition-transform ${
              sidebarOpen ? "-rotate-45 -translate-y-1.5" : ""
            }`}
          ></div>
        </div>
      </button> */}

      {/* Side menu */}
      <div
        className={`fixed top-0 left-0 h-full bg-white dark:bg-gray-950 shadow-lg border-r border-gray-200 dark:border-gray-800 z-30 transition-all duration-300 hidden lg:block ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
      >
        <div className="h-full">
          {/* Logo */}
          <div
            className={`flex justify-center ${
              sidebarOpen ? "px-4 pt-4 pb-6" : "px-2 pt-4 pb-6"
            }`}
          >
            <Link href="/">
              <Image
                src="/images/wyat-vertical.svg"
                alt="Wyat Logo"
                width={sidebarOpen ? 80 : 48}
                height={sidebarOpen ? 120 : 72}
                className="dark:invert transition-all duration-300"
              />
            </Link>
          </div>
          {/* Navigation Links */}
          <nav className="p-4">
            {sidebarOpen ? (
              <>
                <ul className="space-y-2">
                  {coreFeatures.map((feature, index) => {
                    const IconComponent = getIconComponent(feature.icon);
                    return (
                      <li key={index}>
                        <Link
                          href={feature.href}
                          onClick={() => navigateTo(feature.href)}
                          className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                            currentPage === feature.href
                              ? "bg-blue-100 dark:bg-gray-300 text-blue-600"
                              : "text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 dark:hover:bg-gray-900 hover:bg-gray-50"
                          }`}
                        >
                          <IconComponent className="w-6 h-6 mr-3" />
                          <div className="font-medium text-sm">
                            {feature.label}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <ul className="space-y-4 w-12">
                {coreFeatures.map((feature, index) => {
                  const IconComponent = getIconComponent(feature.icon);
                  return (
                    <li key={index}>
                      <Link
                        href={feature.href}
                        onClick={() => navigateTo(feature.href)}
                        className={`block h-12 w-12 flex items-center justify-center rounded-xs transition-colors ${
                          currentPage === feature.href
                            ? "bg-blue-100 dark:bg-gray-300 text-blue-600 dark:text-gray-800"
                            : "text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 dark:hover:bg-gray-900 hover:bg-gray-50"
                        }`}
                        title={feature.label}
                      >
                        <div className="text-center flex flex-col gap-0.5">
                          <IconComponent className="w-6 h-6 mx-auto" />
                          <div className="text-[11px] font-medium">
                            {feature.label}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
        </div>
      </div>
    </>
  );
}

// Main navigation component that handles responsive behavior
export default function Navigation() {
  const { setNavigationMode } = useNav();
  const [windowWidth, setWindowWidth] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const handleResize = () => {
      const width = window.innerWidth;
      setWindowWidth(width);

      if (width < 768) {
        setNavigationMode("mobile");
      } else if (width < 1024) {
        setNavigationMode("tablet");
      } else {
        setNavigationMode("desktop");
      }
    };

    // Set initial width
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [setNavigationMode]);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return null;
  }

  return (
    <>
      <MobileFloatingButtons />
      <TabletSideMenu />
      <DesktopSideMenu />
    </>
  );
}
