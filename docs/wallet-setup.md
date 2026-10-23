# Customer loyalty Wallet passes

The My QR button is limited to logged-in customer accounts opening the web app in standalone (home-screen) mode, on Android or iOS/iPadOS. Browser tabs and desktop installations have no wallet button. Installation cannot reliably be detected from an ordinary browser tab; customers must launch the home-screen icon.

## Activation prerequisites

The function is disabled for both providers by default. Set secrets in Supabase's Edge Functions secrets dashboard; never use VITE_ variables, commit credentials, or paste keys in chat.

Apple:
- Apple Developer account with a registered Pass Type ID and its signing certificate/key.
- APPLE_PASS_TYPE_ID, APPLE_TEAM_ID.
- APPLE_SIGNER_CERT_PEM, APPLE_SIGNER_KEY_PEM, APPLE_WWDR_PEM (the matching Apple intermediate certificate).
- APPLE_SIGNER_KEY_PASSPHRASE if the key is encrypted.
- WALLET_APPLE_ENABLED=true only for testing/activation after the above is configured.

Google:
- Google Wallet issuer account, publishing approval for customers, and a service account authorised in the Wallet console.
- Create a generic pass class in that issuer account.
- GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_CLASS_ID (full issuer.suffix ID).
- GOOGLE_WALLET_CLIENT_EMAIL, GOOGLE_WALLET_PRIVATE_KEY (PKCS8 PEM).
- WALLET_GOOGLE_ENABLED=true only for testing/activation after the above is configured.

Google demo-mode passes work only for authorised testers. Final production activation requires Google approval. Apple certificates must be valid and renewed before expiry. Wallet providers control the final Add confirmation; a website cannot silently add cards.

## Deployment and security

Deploy supabase/functions/loyalty-wallet, including its JS dependencies and deno.json. config.toml sets verify_jwt=false because a direct Safari form POST cannot send an Authorization header. The function validates every pass request using auth.getUser(token), and uses the same bearer token for caller-scoped RLS queries. It never uses a service-role key or trusts client-supplied customer IDs/QR values. The public status action exposes only two readiness booleans.

Apple's form POST keeps the bearer token out of URLs and returns a real application/vnd.apple.pkpass response. Google returns a signed, ten-minute save URL. Never log these links or submitted form bodies. Pass IDs are stable per customer. Signing secrets remain server-side.

These are static QR identification cards, with no points balance printed on them. They do not implement pass push updates. Changing/revoking a customer's QR requires removing/reissuing the saved card (Google object updates need a future API update flow); staff must always validate against the current account. Existing staff redemption permissions remain authoritative.

## Verification before activating for customers

- node --test tests/wallet.test.mjs; npm run build.
- In supabase/functions/loyalty-wallet: npm ci, then deno check --node-modules-dir=manual index.ts.
- Missing/invalid credentials cannot produce passes. Browser origins other than the production site are refused.
- Test an ordinary browser tab, installed Android, installed iPhone, logout and a staff login.
- On real devices, add each pass, scan it with the existing staff scanner, then verify it selects the same account as My QR. Confirm Add can be cancelled, repeated without duplicates, and resumed after returning to the app.
- Test expired login and failed signing without revealing credentials. Test the Google issuer in approved production mode.

Until real Apple/Google credentials are connected, successful device Wallet installation cannot be verified and buttons remain hidden.
