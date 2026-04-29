-- Add EN_STOCK as a valid cotizar value and change default to SI
ALTER TABLE materiales_mto ALTER COLUMN cotizar SET DEFAULT 'SI';

-- Materials that were explicitly NO stay NO; update anything that is still the old
-- default ('NO') and has no price to SI so they enter the quoting flow.
-- (Safe to run multiple times — only affects rows still at the old default.)
UPDATE materiales_mto SET cotizar = 'SI' WHERE cotizar = 'NO' AND unit_price = 0;
