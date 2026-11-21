#!/bin/sh
export KSP_REHEARSAL_SEED_CONFIRM="YES_I_WILL_USE_A_DEVELOPMENT_DATABASE"
export KSP_REHEARSAL_RUN_ID="stock-rehearsal"
export KSP_REHEARSAL_SELLERS="alice,bob,charlie"
export KSP_REHEARSAL_TEST_PHONE="+256771234567"
node --conditions=react-server --import tsx scripts/seed-ticket-rehearsal.ts