import React from "react";
import { getAccountColorClasses } from "@/app/capital/utils";

interface AccountPillProps {
  id?: string | null;
  accountMap: Map<string, { name: string; color: string }>;
}

/**
 * Renders an account name badge with color-coded styling.
 * Displays "N/A" if no account ID is provided.
 */
export const AccountPill: React.FC<AccountPillProps> = ({ id, accountMap }) => {
  if (!id) return <span className="text-xs text-gray-400">N/A</span>;
  const meta = accountMap.get(id) || { name: id, color: "gray" };
  return (
    <span
      className={`text-sm font-medium rounded px-2 py-1 ${getAccountColorClasses(
        meta.color
      )}`}
    >
      {meta.name}
    </span>
  );
};
