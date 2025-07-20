export default function Privacy() {
  return (
    <div>
      <h1>Privacy Policy</h1>
      <p>
        <em>Last Updated: July 20, 2025</em>
      </p>

      <h2>1. Introduction</h2>
      <p>
        Welcome to <strong>Wyat AI</strong>, your encrypted mindspace. Wyat AI
        is a personal journaling application designed for individual use, built
        to give you full sovereignty over your data. This Privacy Policy
        outlines how we collect, use, and protect your personal information
        within this private application.
      </p>

      <h2>2. Data We Collect</h2>
      <ul>
        <li>
          <strong>Journal Entries</strong>: Thoughts, reflections, and personal
          records.
        </li>
        <li>
          <strong>Biometric & Health Data</strong>: Sleep, stress, and related
          metrics (e.g. via Oura).
        </li>
        <li>
          <strong>Financial Data</strong>: If you connect services like Plaid,
          basic account metadata is retrieved.
        </li>
        <li>
          <strong>Device & Usage Metadata</strong>: Only what's necessary for
          account security.
        </li>
      </ul>

      <h2>3. How We Use Your Data</h2>
      <p>Your data is:</p>
      <ul>
        <li>
          <strong>Encrypted and stored</strong> in your private database.
        </li>
        <li>
          <strong>Never sold</strong> to third parties.
        </li>
        <li>
          <strong>Used only</strong> to serve you within Wyat AI.
        </li>
        <li>
          <strong>Optionally used</strong> for memory search if explicitly
          enabled.
        </li>
      </ul>

      <h2>4. Data Ownership and Portability</h2>
      <p>
        You are the <strong>sole owner</strong> of your data. You may:
      </p>
      <ul>
        <li>Export all data in JSON format.</li>
        <li>Request full deletion at any time.</li>
        <li>Revoke integrations with third-party services.</li>
      </ul>

      <h2>5. Third-Party Services</h2>
      <p>Wyat AI integrates only with your consent:</p>
      <ul>
        <li>
          <strong>Plaid</strong> (financial metadata)
        </li>
        <li>
          <strong>Oura</strong> (health metrics)
        </li>
      </ul>
      <p>These use token-based access and never require your credentials.</p>

      <h2>6. Security</h2>
      <ul>
        <li>All communication uses HTTPS.</li>
        <li>Data is encrypted and stored securely.</li>
        <li>Authentication via API key or secure token.</li>
      </ul>

      <h2>7. Changes to this Policy</h2>
      <p>We’ll notify you of significant changes via email or in-app notice.</p>

      <h2>8. Contact</h2>
      <p>
        Email: <a href="mailto:privacy@wyat.ai">privacy@wyat.ai</a>
      </p>
    </div>
  );
}
