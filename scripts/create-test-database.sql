-- Runs once, on the container's first boot.
--
-- The DB-backed tests truncate every table, so they get their own database.
-- Pointing them at `fin` would destroy development data on every `pnpm check`,
-- and this app has no import path and no backup but its own export.
CREATE DATABASE fin_test;
