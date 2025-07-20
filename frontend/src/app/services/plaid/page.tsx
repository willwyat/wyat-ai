"use client";

import { PlaidLink } from "react-plaid-link";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";

export default function PlaidPage() {
  const [linkToken, setLinkToken] = useState<string | null>(null);

  useEffect(() => {
    // Call your backend to create a new link token
    fetch(`${API_URL}/plaid/link-token/create`)
      .then((res) => res.json())
      .then((data) => setLinkToken(data.link_token));
  }, []);

  if (!linkToken) return <div>Loading...</div>;

  return (
    <PlaidLink
      token={linkToken}
      onSuccess={(public_token, metadata) => {
        fetch(`${API_URL}/plaid/exchange-public-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_token }),
        })
          .then((res) => res.json())
          .then((data) => {
            console.log("Access Token Response", data);
          });
      }}
      onExit={(err) => {
        if (err) console.error("Plaid exited with error", err);
      }}
    >
      Connect your bank
    </PlaidLink>
  );
}
