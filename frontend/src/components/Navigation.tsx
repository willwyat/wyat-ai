"use client";

import Link from "next/link";
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
    default:
      return HomeIcon;
  }
}

// Mobile floating button group
function MobileFloatingButtons() {
  const { coreFeatures, navigateTo, currentPage } = useNav();

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 md:hidden">
      <div className="flex bg-white rounded-full shadow-lg border border-gray-200 p-2">
        {coreFeatures.map((feature, index) => {
          const IconComponent = getIconComponent(feature.icon);
          return (
            <Link
              key={index}
              href={feature.href}
              onClick={() => navigateTo(feature.href)}
              className={`flex flex-col items-center px-6 py-2 rounded-full transition-colors ${
                currentPage === feature.href
                  ? "bg-blue-100 text-blue-600"
                  : "text-gray-600 hover:text-blue-600 hover:bg-gray-50"
              }`}
            >
              <IconComponent className="w-5 h-5 mb-1" />
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
      <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-40 bg-white rounded-lg shadow-md p-3 border border-gray-200 lg:hidden md:block hidden"
      >
        <div className="w-6 h-6 flex flex-col justify-center space-y-1">
          <div
            className={`w-full h-0.5 bg-gray-600 transition-transform ${
              sidebarOpen ? "rotate-45 translate-y-1.5" : ""
            }`}
          ></div>
          <div
            className={`w-full h-0.5 bg-gray-600 transition-opacity ${
              sidebarOpen ? "opacity-0" : ""
            }`}
          ></div>
          <div
            className={`w-full h-0.5 bg-gray-600 transition-transform ${
              sidebarOpen ? "-rotate-45 -translate-y-1.5" : ""
            }`}
          ></div>
        </div>
      </button>

      {/* Side menu */}
      <div
        className={`fixed top-0 left-0 h-full bg-white shadow-lg border-r border-gray-200 z-30 transition-transform duration-300 lg:hidden md:block hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="w-64 h-full pt-16">
          <nav className="p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 font-serif">
              Core Features
            </h2>
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
                          ? "bg-blue-100 text-blue-600"
                          : "text-gray-700 hover:text-blue-600 hover:bg-gray-50"
                      }`}
                    >
                      <IconComponent className="w-5 h-5 mr-3" />
                      <div>
                        <div className="font-medium">{feature.label}</div>
                        <div className="text-sm text-gray-500">
                          {feature.description}
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
          className="fixed inset-0 bg-black bg-opacity-25 z-20 lg:hidden md:block hidden"
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
      <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-40 bg-white rounded-lg shadow-md p-3 border border-gray-200 hidden lg:block"
      >
        <div className="w-6 h-6 flex flex-col justify-center space-y-1">
          <div
            className={`w-full h-0.5 bg-gray-600 transition-transform ${
              sidebarOpen ? "rotate-45 translate-y-1.5" : ""
            }`}
          ></div>
          <div
            className={`w-full h-0.5 bg-gray-600 transition-opacity ${
              sidebarOpen ? "opacity-0" : ""
            }`}
          ></div>
          <div
            className={`w-full h-0.5 bg-gray-600 transition-transform ${
              sidebarOpen ? "-rotate-45 -translate-y-1.5" : ""
            }`}
          ></div>
        </div>
      </button>

      {/* Side menu */}
      <div
        className={`fixed top-0 left-0 h-full bg-white shadow-lg border-r border-gray-200 z-30 transition-all duration-300 hidden lg:block ${
          sidebarOpen ? "w-64" : "w-16"
        }`}
      >
        <div className="h-full pt-16">
          <nav className="p-4">
            {sidebarOpen ? (
              <>
                <h2 className="text-lg font-semibold text-gray-800 mb-4 font-serif">
                  Core Features
                </h2>
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
                              ? "bg-blue-100 text-blue-600"
                              : "text-gray-700 hover:text-blue-600 hover:bg-gray-50"
                          }`}
                        >
                          <IconComponent className="w-5 h-5 mr-3" />
                          <div>
                            <div className="font-medium">{feature.label}</div>
                            <div className="text-sm text-gray-500">
                              {feature.description}
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <ul className="space-y-4">
                {coreFeatures.map((feature, index) => {
                  const IconComponent = getIconComponent(feature.icon);
                  return (
                    <li key={index}>
                      <Link
                        href={feature.href}
                        onClick={() => navigateTo(feature.href)}
                        className={`block p-3 rounded-lg transition-colors ${
                          currentPage === feature.href
                            ? "bg-blue-100 text-blue-600"
                            : "text-gray-700 hover:text-blue-600 hover:bg-gray-50"
                        }`}
                        title={feature.label}
                      >
                        <div className="text-center">
                          <IconComponent className="w-6 h-6 mx-auto" />
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

  useEffect(() => {
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

  return (
    <>
      <MobileFloatingButtons />
      <TabletSideMenu />
      <DesktopSideMenu />
    </>
  );
}
