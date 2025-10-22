"use client";

import * as React from "react";
import Link from "next/link";
import { twMerge } from "tailwind-merge";

type Variant =
  | "primary"
  | "secondary"
  | "danger"
  | "outline"
  | "ghost"
  | "link";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-600 border border-transparent",
  secondary:
    "bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-400 border border-gray-300",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus:ring-red-600 border border-transparent",
  outline:
    "bg-transparent text-gray-900 hover:bg-gray-50 focus:ring-gray-400 border border-gray-300",
  ghost:
    "bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-300 border border-transparent",
  link: "bg-transparent text-blue-700 hover:underline focus:ring-blue-600 border border-transparent",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-3.5 text-sm",
  lg: "h-10 px-4 text-base",
  icon: "h-9 w-9 p-0",
};

export type ButtonProps = {
  variant?: Variant;
  size?: Size;
  href?: string;
  block?: boolean;
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement> &
  React.AnchorHTMLAttributes<HTMLAnchorElement>;

export const Button = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps
>(
  (
    {
      variant = "primary",
      size = "md",
      href,
      block,
      loading,
      leadingIcon,
      trailingIcon,
      className,
      children,
      disabled,
      ...rest
    },
    ref
  ) => {
    const cls = twMerge(
      base,
      variants[variant],
      sizes[size],
      block ? "w-full" : "",
      size === "icon" ? "rounded-full" : "",
      className
    );

    const content = (
      <>
        {loading && (
          <svg
            className={twMerge(
              "h-4 w-4 animate-spin",
              size === "icon" ? "m-0" : "mr-2"
            )}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4A4 4 0 004 12z"
            />
          </svg>
        )}
        {!loading && leadingIcon ? (
          <span className={twMerge(size === "icon" ? "" : "mr-2")}>
            {leadingIcon}
          </span>
        ) : null}
        {children && <span>{children}</span>}
        {!loading && trailingIcon ? (
          <span className={twMerge(size === "icon" ? "" : "ml-2")}>
            {trailingIcon}
          </span>
        ) : null}
      </>
    );

    const commonProps = {
      ref: ref as any,
      className: cls,
      "aria-busy": loading ? true : undefined,
      "aria-live": (loading ? "polite" : undefined) as
        | "polite"
        | "off"
        | "assertive"
        | undefined,
    };

    if (href) {
      return (
        <Link
          href={href}
          {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
          {...commonProps}
          onClick={
            disabled || loading ? (e) => e.preventDefault() : rest.onClick
          }
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        type="button"
        disabled={disabled || loading}
        {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        {...commonProps}
      >
        {content}
      </button>
    );
  }
);

Button.displayName = "Button";
