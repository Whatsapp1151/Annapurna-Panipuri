# Annapurna Panipuri PWA

Mobile-first menu and loyalty PWA for Annapurna Panipuri.

## Loyalty rules
- £1 spent = 1 whole point
- 1 point = £0.05
- Staff approval is required to add or redeem points
- Customer balances and transaction history are protected by Supabase RLS and server-side database functions

## Deployment
Render static site:
- Build: `npm install && npm run build`
- Publish directory: `dist`

Environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Never place a Supabase service-role key in frontend code.
