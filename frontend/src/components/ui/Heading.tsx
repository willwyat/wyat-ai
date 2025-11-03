"use client";
import React from "react";
import { typography } from "./TypographyTokens";

interface HeadingProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  children: React.ReactNode;
  className?: string;
}

function cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Heading({ level = 2, children, className }: HeadingProps) {
  const typographyKey = `h${level}` as keyof typeof typography;
  const typographyClass = typography[typographyKey] || typography.h2;
  const combinedClassName = cn(typographyClass, className);

  switch (level) {
    case 1:
      return <h1 className={combinedClassName}>{children}</h1>;
    case 2:
      return <h2 className={combinedClassName}>{children}</h2>;
    case 3:
      return <h3 className={combinedClassName}>{children}</h3>;
    case 4:
      return <h4 className={combinedClassName}>{children}</h4>;
    case 5:
      return <h5 className={combinedClassName}>{children}</h5>;
    case 6:
      return <h6 className={combinedClassName}>{children}</h6>;
    default:
      return <h2 className={combinedClassName}>{children}</h2>;
  }
}
