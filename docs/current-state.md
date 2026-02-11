# Jack in the Box – Current State (Feb 2026)

## What is LIVE
- Jack is a VAPI-powered voice agent.
- Jack runs the Generic Marine Intake script.
- Customers can call in.
- Customers can ask about inventory.
- Customers can start service flows.
- Intake data is written to Google Sheets.

## What is NOT wired yet
- Supabase ingestion (exists but not connected).
- Estimator automation (logic drafted only).
- Operations automation (logic drafted only).
- Digital RO.

## Step-Up Modules (Planned)
### Tier 2 – Estimator
- Engine identification
- Parts lookup (Suzuki/Honda/Tohatsu)
- Labor rates
- Quote generation
- Deposit link

### Tier 3 – Operations
- Scheduling
- Status checks
- Bay flow
- Bottleneck escalation

## Notifications (Planned Add-ons)
- Email
- SMS
- Call forwarding

## Explicitly parked for now
- Supabase integration
- Inventory sync
- Vendor APIs

Primary intake datastore remains Google Sheets for now.
