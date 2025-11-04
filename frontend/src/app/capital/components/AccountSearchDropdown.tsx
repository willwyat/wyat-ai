"use client";

import React, { useState } from "react";
import type { Account } from "@/app/capital/types";

interface AccountSearchDropdownProps {
  value: string;
  onChange: (value: string) => void;
  accounts: Account[];
  placeholder?: string;
}

export default function AccountSearchDropdown({
  value,
  onChange,
  accounts,
  placeholder = "e.g., acct.chase_credit",
}: AccountSearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredAccounts = accounts.filter(
    (account) =>
      account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (account: Account) => {
    onChange(account.id);
    setSearchTerm("");
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSearchTerm(newValue);
    setIsOpen(true);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleInputBlur = () => {
    // Delay closing to allow for click events on dropdown items
    setTimeout(() => setIsOpen(false), 150);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
        placeholder={placeholder}
        required
      />

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredAccounts.length > 0 ? (
            filteredAccounts.map((account) => (
              <div
                key={account.id}
                className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer border-b border-gray-200 dark:border-gray-600 last:border-b-0"
                onClick={() => handleSelect(account)}
              >
                <div className="font-medium text-gray-900 dark:text-white">
                  {account.name}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {account.id}
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
              No accounts found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
