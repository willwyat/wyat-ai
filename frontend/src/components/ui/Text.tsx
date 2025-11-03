"use client";
import React from "react";
import { typography } from "@/components/ui/TypographyTokens";

interface TextProps {
  variant?: keyof typeof typography;
  children: React.ReactNode;
  className?: string;
}

function cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Text({ variant = "body", className, children }: TextProps) {
  return <p className={cn(typography[variant], className)}>{children}</p>;
}
